import { createClient } from '@supabase/supabase-js';
import { getPaymentGateway } from './payment/index.js';
import {
  PERIOD_MONTHS,
  addDaysToIsoDate,
  computePlanChangeCreditDays,
  isValidCpfCnpj,
  todayInSaoPaulo,
} from './payment/billing-rules.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

type Period = 'monthly' | 'semiannual' | 'annual';

function planPriceCents(plan: any, period: Period): number {
  if (period === 'semiannual') return plan.price_cents_semiannual || plan.price_cents * 6;
  if (period === 'annual') return plan.price_cents_annual || plan.price_cents * 12;
  return plan.price_cents;
}

const onlyDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  // Exige um token de login válido do Supabase — o userId é derivado do token,
  // nunca aceito diretamente do corpo da requisição (evita cobrar em nome de terceiros).
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  if (!token) return res.status(401).json({ error: 'Login necessário (token ausente).' });

  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authUser) return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });

  const userId = authUser.id;

  const {
    planSlug,
    period = 'monthly',
    paymentMethod = 'CREDIT_CARD',
    couponCode,
    creditCard,
    creditCardHolderInfo,
    // Pagador (nome + CPF/CNPJ + celular). No cartão esses dados já vêm em
    // creditCardHolderInfo; no Pix é por aqui que o documento chega.
    customer
  } = req.body || {};

  if (!planSlug) return res.status(400).json({ error: 'planSlug required' });
  if (!(period in PERIOD_MONTHS)) return res.status(400).json({ error: 'Período inválido.' });
  if (paymentMethod !== 'CREDIT_CARD' && paymentMethod !== 'PIX') return res.status(400).json({ error: 'Forma de pagamento inválida.' });

  // CPF/CNPJ do pagador: o Asaas exige para emitir a cobrança. Se veio, tem de
  // ser válido — é melhor avisar aqui, em português, do que o cliente ver a
  // cobrança recusada depois. (Se não veio — app antigo ainda aberto no
  // celular —, segue como antes e quem decide é o Asaas.)
  const customerCpfCnpj = onlyDigits(customer?.cpfCnpj || creditCardHolderInfo?.cpfCnpj);
  const customerName = String(customer?.name || creditCardHolderInfo?.name || '').trim();
  const customerPhone = onlyDigits(customer?.phone || creditCardHolderInfo?.phone);
  if (customerCpfCnpj && !isValidCpfCnpj(customerCpfCnpj)) {
    return res.status(400).json({ error: 'CPF ou CNPJ inválido. Confira os números e tente de novo.' });
  }

  try {
    // 1. Get plan
    const { data: plan } = await supabase.from('plans').select('*').eq('slug', planSlug).single();
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    if (plan.price_cents === 0) return res.status(400).json({ error: 'Free plan does not require payment' });

    // 2. Get user
    const { data: { user } } = await supabase.auth.admin.getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.email) return res.status(400).json({ error: 'User email is required' });

    // 3. Resolve price for period
    const p: Period = period;
    const totalPrice = planPriceCents(plan, p);

    // 4. Check existing subscription and trial
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('plan_id, billing_period, trial_ends_at, status, cancel_at_period_end, current_period_start, current_period_end, asaas_subscription_id, metadata')
      .eq('user_id', userId)
      .maybeSingle();

    const now = new Date();
    const today = todayInSaoPaulo(now);
    const gateway = getPaymentGateway('asaas');
    // Guardado ANTES de qualquer gravação: é a assinatura que será encerrada no
    // Asaas depois que a nova estiver criada.
    const previousGatewaySubscriptionId: string | null = existingSub?.asaas_subscription_id || null;

    // Reativação dentro do prazo já pago: o usuário cancelou (cancel_at_period_end=true)
    // mas ainda está dentro do período que já tinha pago (current_period_end no futuro).
    // Nesse caso a próxima cobrança acontece na MESMA data que já estava marcada para
    // renovar — não hoje — e o ciclo atual (period_start/period_end) é preservado.
    const isResumeWithinPeriod = !!(
      existingSub &&
      existingSub.cancel_at_period_end &&
      ['active', 'trialing'].includes(existingSub.status) &&
      existingSub.current_period_end &&
      new Date(existingSub.current_period_end) > now
    );

    const isTrialRunning = !!(
      existingSub && existingSub.status === 'trialing' &&
      existingSub.trial_ends_at && new Date(existingSub.trial_ends_at) > now
    );

    // Troca de plano (ou de período) de quem JÁ é pagante e está com o ciclo em
    // dia. Antes isso abria uma segunda assinatura no Asaas e cobrava cheio hoje,
    // com a antiga continuando a cobrar — cliente pagando duas vezes.
    const isPaidPlanChange = !!(
      !isResumeWithinPeriod && !isTrialRunning &&
      existingSub && existingSub.status === 'active' &&
      !existingSub.cancel_at_period_end &&
      existingSub.asaas_subscription_id &&
      existingSub.current_period_end && new Date(existingSub.current_period_end) > now
    );

    // 5. Validate coupon (SOMENTE leitura — o cupom só é marcado como usado depois que o
    // pagamento for de fato confirmado pelo webhook do Asaas, evitando "queimar" o cupom
    // de um usuário que nunca chegou a pagar).
    let discountPercent = 0;
    let validCouponCode: string | null = null;
    if (couponCode) {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('*, plans(*)')
        .eq('code', String(couponCode).toUpperCase())
        .eq('is_active', true)
        .maybeSingle();

      // Mesmas regras de validade do apply-coupon: cupom vencido ou esgotado
      // não dá desconto (antes só `is_active` era checado aqui).
      const couponExpired = !!(coupon?.expires_at && new Date(coupon.expires_at) < now);
      const couponExhausted = !!(coupon?.max_uses && (coupon.uses_count || 0) >= coupon.max_uses);

      if (coupon && !couponExpired && !couponExhausted) {
        const { data: used } = await supabase.from('coupon_uses')
          .select('id').eq('coupon_id', coupon.id).eq('user_id', userId).maybeSingle();

        if (!used) {
          // Plano gratuito via cupom: não há cobrança a aguardar, então confirma na hora.
          if (coupon.plan_override_id && coupon.plans?.price_cents === 0) {
            await upsertSubscription(userId, coupon.plans.id, 'admin_granted', null, p, null, undefined, undefined, existingSub?.metadata);
            await supabase.from('coupon_uses').insert({ coupon_id: coupon.id, user_id: userId });
            await supabase.from('coupons').update({ uses_count: (coupon.uses_count || 0) + 1 }).eq('id', coupon.id);
            await cancelPreviousGatewaySubscription(gateway, previousGatewaySubscriptionId, null);
            return res.status(200).json({ success: true, message: 'Plan granted via coupon', plan: coupon.plans.name, period });
          }
          if (coupon.discount_type === 'percent') discountPercent = coupon.discount_value;
          validCouponCode = coupon.code;
        }
      }
    }

    // 5.5 Turma Fundadora: desconto configurado pelo painel Admin > Landing > Oferta
    // (public.landing_settings), o mesmo que a landing exibe. Só aplicado se nenhum
    // cupom específico já resolveu o desconto acima — cupom tem prioridade, evita
    // empilhar dois descontos ao mesmo tempo. Isso mantém o preço que a landing anuncia
    // igual ao que é cobrado de verdade aqui.
    if (!validCouponCode) {
      const { data: landingSettings } = await supabase
        .from('landing_settings')
        .select('founding_enabled, founding_ends_at, founding_discount_pct')
        .maybeSingle();
      if (
        landingSettings?.founding_enabled &&
        landingSettings.founding_ends_at &&
        new Date(landingSettings.founding_ends_at) > now &&
        landingSettings.founding_discount_pct > 0
      ) {
        discountPercent = landingSettings.founding_discount_pct;
      }
    }

    // 6. Apply discount to total price (arredondado em centavos — o Asaas recusa
    // valor com mais de duas casas).
    const priceCents = Math.round(totalPrice * (1 - discountPercent / 100));
    const priceInReais = priceCents / 100;

    // 6.5 Data da primeira cobrança da nova assinatura.
    let nextDue: string;
    let trialEndsAt: string | null = null;
    let creditDays = 0;

    if (isResumeWithinPeriod) {
      nextDue = new Date(existingSub!.current_period_end as string).toISOString().split('T')[0];
      if (existingSub!.status === 'trialing' && existingSub!.trial_ends_at) trialEndsAt = existingSub!.trial_ends_at;
    } else if (isTrialRunning) {
      trialEndsAt = existingSub!.trial_ends_at;
      nextDue = new Date(existingSub!.trial_ends_at as string).toISOString().split('T')[0];
    } else if (isPaidPlanChange) {
      // O que já foi pago e ainda não foi usado vira dias do plano novo antes da
      // primeira cobrança. Valor pago = o que o Asaas cobra por ciclo na
      // assinatura atual (já com desconto); se não der para consultar, usa o
      // preço de tabela do plano atual.
      let paidCents = await gateway.getSubscriptionValueCents(existingSub!.asaas_subscription_id as string);
      if (paidCents == null && existingSub!.plan_id) {
        const { data: currentPlan } = await supabase.from('plans').select('*').eq('id', existingSub!.plan_id).maybeSingle();
        if (currentPlan) paidCents = planPriceCents(currentPlan, (existingSub!.billing_period as Period) || 'monthly');
      }
      creditDays = computePlanChangeCreditDays({
        paidCents: paidCents || 0,
        currentPeriodStart: existingSub!.current_period_start,
        currentPeriodEnd: existingSub!.current_period_end,
        newPriceCents: priceCents,
        newBillingPeriod: p,
        now,
      });
      nextDue = addDaysToIsoDate(today, creditDays);
    } else {
      // Sem teste em andamento e sem ciclo pago: cobra hoje.
      nextDue = today;
    }

    // 7. Criar assinatura através da abstração de gateway (troca de banco no
    //    futuro = trocar o gateway aqui, sem mexer no resto desta função).
    const result = await gateway.createSubscription({
      customerEmail: user.email,
      customerExternalReference: userId,
      valueReais: priceInReais,
      billingPeriod: p,
      nextDueDate: nextDue,
      paymentMethod,
      description: `Zyvion ${plan.name} (${PERIOD_MONTHS[p]} mês${PERIOD_MONTHS[p] > 1 ? 'es' : ''})`,
      // Cupom pendente vai junto na referência para o webhook confirmar o uso somente
      // quando o pagamento realmente cair (ver handleAsaasWebhook).
      externalReference: `${userId}:${planSlug}:${p}:${validCouponCode || ''}`,
      creditCard: paymentMethod === 'CREDIT_CARD' && creditCard ? creditCard : undefined,
      creditCardHolderInfo: paymentMethod === 'CREDIT_CARD' && creditCardHolderInfo
        ? { ...creditCardHolderInfo, email: creditCardHolderInfo.email || user.email }
        : undefined,
      remoteIp: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
      customerName: customerName || undefined,
      customerCpfCnpj: customerCpfCnpj || undefined,
      customerPhone: customerPhone || undefined,
    });

    // 8. Upsert in our DB
    // Importante: mesmo pagando no cartão, NÃO marcamos como 'active' aqui — a cobrança
    // acabou de ser criada no Asaas, mas pode ser recusada segundos depois. Só o webhook
    // (evento payment_confirmed) promove para 'active', quando o pagamento é confirmado
    // de verdade. Até lá, fica 'past_due' (mesmo tratamento de "fatura pendente" que já
    // existe na tela — não libera os limites do plano pago).
    // Exceções:
    //  - reativação dentro do prazo já pago: a cobrança só acontece na data futura já
    //    agendada, então mantém o status e o ciclo que a assinatura já tinha;
    //  - troca de plano de quem já é pagante: continua 'active' (ele já pagou por
    //    estes dias) e o ciclo vai de hoje até a primeira cobrança do plano novo.
    let initialStatus: string;
    let periodOverride: { start: string; end: string } | undefined;
    if (isResumeWithinPeriod) {
      initialStatus = existingSub!.status as string;
      periodOverride = { start: existingSub!.current_period_start as string, end: existingSub!.current_period_end as string };
    } else if (isPaidPlanChange) {
      initialStatus = 'active';
      periodOverride = { start: now.toISOString(), end: new Date(`${nextDue}T23:59:59-03:00`).toISOString() };
    } else {
      initialStatus = trialEndsAt ? 'trialing' : 'past_due';
    }

    const saveError = await upsertSubscription(
      userId, plan.id, initialStatus, result.gatewaySubscriptionId, p, trialEndsAt, gateway.name,
      periodOverride, existingSub?.metadata
    );
    if (saveError) {
      // Não conseguimos registrar a assinatura do nosso lado: desfaz a cobrança
      // recém-criada no Asaas para o cliente não pagar por algo que o app não
      // vai reconhecer. A assinatura anterior (se havia) continua intacta.
      console.error('[asaas-create-subscription] Falha ao gravar a assinatura; desfazendo no Asaas:', saveError);
      await cancelPreviousGatewaySubscription(gateway, result.gatewaySubscriptionId, null);
      return res.status(500).json({ error: 'Não foi possível concluir a assinatura agora. Nenhuma cobrança foi feita — tente de novo em instantes.' });
    }

    // 9. Só depois de a nova assinatura existir e estar gravada é que a anterior
    // (se houver) é encerrada no Asaas. Vale para qualquer troca: plano, período,
    // forma de pagamento ou um Pix gerado e não pago — sem isso o cliente ficava
    // com duas assinaturas cobrando, e pagar o Pix antigo não ativava nada.
    await cancelPreviousGatewaySubscription(gateway, previousGatewaySubscriptionId, result.gatewaySubscriptionId);

    return res.status(200).json({
      success: true,
      asaasSubscriptionId: result.gatewaySubscriptionId,
      plan: plan.name,
      period,
      totalPrice: priceInReais,
      nextDueDate: result.nextDueDate,
      status: initialStatus,
      creditDays,
      pix: result.pix
    });

  } catch (err: any) {
    console.error('asaas-create-subscription error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function cancelPreviousGatewaySubscription(gateway: any, previousId: string | null | undefined, newId: string | null) {
  if (!previousId || previousId === newId) return;
  try {
    await gateway.cancelSubscription(previousId);
  } catch (err) {
    // Não derruba a compra que acabou de dar certo; fica no log para conferência manual.
    console.error(`[asaas-create-subscription] Não foi possível encerrar a assinatura anterior ${previousId}:`, err);
  }
}

async function upsertSubscription(
  userId: string, planId: string, status: string, asaasId: string | null, period: Period, trialEndsAt: string | null,
  paymentGateway?: string,
  // Presente na reativação dentro do prazo já pago (preserva o ciclo atual) e na
  // troca de plano de pagante (ciclo = hoje até a primeira cobrança do plano novo).
  periodOverride?: { start: string; end: string },
  existingMetadata?: Record<string, any> | null
): Promise<string | null> {
  const now = new Date();
  let periodStartIso: string;
  let periodEndIso: string;
  if (periodOverride) {
    periodStartIso = periodOverride.start;
    periodEndIso = periodOverride.end;
  } else {
    const months = PERIOD_MONTHS[period];
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + months);
    periodStartIso = now.toISOString();
    periodEndIso = periodEnd.toISOString();
  }

  const payload: any = {
    user_id: userId,
    plan_id: planId,
    status,
    // Antes o período escolhido não era gravado: toda assinatura ficava como
    // "mensal" no banco, mesmo a anual (errava a comissão de indicação e as datas).
    billing_period: period,
    current_period_start: periodStartIso,
    current_period_end: periodEndIso,
    trial_ends_at: trialEndsAt,
    // Qualquer criação/reativação bem-sucedida limpa um cancelamento pendente.
    cancel_at_period_end: false,
    canceled_at: null,
    updated_at: now.toISOString(),
  };
  if (asaasId) payload.asaas_subscription_id = asaasId;
  if (paymentGateway) payload.payment_gateway = paymentGateway;
  // Assinatura nova zera o aviso de atraso da anterior — preservando o resto
  // (ex.: conta escolhida no plano gratuito).
  if (existingMetadata && typeof existingMetadata === 'object' && 'overdue_since' in existingMetadata) {
    const { overdue_since: _ignored, ...rest } = existingMetadata;
    payload.metadata = rest;
  }

  const { error } = await supabase.from('subscriptions').upsert(payload, { onConflict: 'user_id' });
  return error ? (error.message || 'erro ao gravar a assinatura') : null;
}
