import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

// ============================================================
// Motor de comissão de indicação.
//
// Regra central: os termos (percentual, duração, carência) são
// resolvidos UMA VEZ, no momento em que a indicação é criada
// (attachReferral), e ficam TRAVADOS na própria linha de
// affiliate_referrals. Mudar o padrão global (referral_settings)
// ou o override de um afiliado (affiliates.has_custom_terms) só
// afeta indicações CRIADAS DEPOIS da mudança — nunca as que já
// existem. Isso vale também para o escalonamento automático por
// indicações ativas: o degrau é calculado no momento da nova
// indicação, não recalculado retroativamente nas antigas.
//
// duration_months é uma cota de MESES PAGOS, não uma data-limite no calendário:
// se o indicado pausar a assinatura e voltar a pagar depois, os meses da pausa
// não contam (nem a favor, nem contra) — o indicador sempre recebe o total de
// meses combinado, só que pode demorar mais para completar. Ver
// commission_months_credited em recordCommissionEvent/reverseCommissionEvent.
// ============================================================

export interface ResolvedReferralTerms {
  commissionPercent: number;
  durationMonths: number | null; // null = vitalício
  holdPeriodDays: number;
}

async function getGlobalSettings() {
  const { data } = await supabase.from('referral_settings').select('*').eq('id', 1).single();
  return data;
}

const BILLING_PERIOD_MONTHS: Record<string, number> = { monthly: 1, semiannual: 6, annual: 12 };

// Quantos meses de comissão um pagamento específico cobre, de acordo com o ciclo
// de cobrança da assinatura no momento em que o pagamento foi confirmado.
async function getBillingPeriodMonths(subscriptionId: string | null | undefined): Promise<number> {
  if (!subscriptionId) return 1;
  const { data } = await supabase.from('subscriptions').select('billing_period').eq('id', subscriptionId).maybeSingle();
  return BILLING_PERIOD_MONTHS[data?.billing_period || 'monthly'] || 1;
}

export async function resolveReferralTerms(affiliateId: string): Promise<ResolvedReferralTerms> {
  const [{ data: affiliate }, settings] = await Promise.all([
    supabase.from('affiliates').select('*').eq('id', affiliateId).single(),
    getGlobalSettings(),
  ]);
  if (!affiliate) throw new Error('Afiliado não encontrado.');
  if (!settings) throw new Error('Configuração de indicação (referral_settings) não encontrada.');

  if (affiliate.has_custom_terms) {
    return {
      commissionPercent: affiliate.commission_percent_override ?? settings.commission_percent,
      durationMonths: affiliate.duration_lifetime_override
        ? null
        : (affiliate.duration_months_override ?? settings.duration_months),
      holdPeriodDays: settings.hold_period_days,
    };
  }

  const { count: activeCount } = await supabase
    .from('affiliate_referrals')
    .select('id', { count: 'exact', head: true })
    .eq('affiliate_id', affiliateId)
    .eq('status', 'active');

  const steps = Math.floor((activeCount || 0) / settings.tier_step_referrals);
  const commissionPercent = Math.min(
    settings.commission_percent + steps * settings.tier_step_percent,
    settings.tier_cap_percent
  );

  return {
    commissionPercent,
    durationMonths: settings.duration_months,
    holdPeriodDays: settings.hold_period_days,
  };
}

// Progresso de escalonamento — usado nas notificações de engajamento
// ("faltam 2 indicações ativas para você subir para 25%").
export async function getTierProgress(affiliateId: string) {
  const [{ data: affiliate }, settings, { count: rawActiveCount }] = await Promise.all([
    supabase.from('affiliates').select('*').eq('id', affiliateId).single(),
    getGlobalSettings(),
    supabase.from('affiliate_referrals').select('id', { count: 'exact', head: true }).eq('affiliate_id', affiliateId).eq('status', 'active'),
  ]);
  if (!affiliate || !settings) return null;
  const activeCount = rawActiveCount || 0;

  if (affiliate.has_custom_terms) {
    return {
      currentPercent: affiliate.commission_percent_override ?? settings.commission_percent,
      nextPercent: null as number | null,
      referralsToNextTier: null as number | null,
      activeCount,
      capPercent: settings.tier_cap_percent,
    };
  }

  const steps = Math.floor(activeCount / settings.tier_step_referrals);
  const currentPercent = Math.min(settings.commission_percent + steps * settings.tier_step_percent, settings.tier_cap_percent);
  const atCap = currentPercent >= settings.tier_cap_percent;
  const nextPercent = atCap ? null : Math.min(settings.commission_percent + (steps + 1) * settings.tier_step_percent, settings.tier_cap_percent);
  const referralsToNextTier = atCap ? null : (steps + 1) * settings.tier_step_referrals - activeCount;

  return { currentPercent, nextPercent, referralsToNextTier, activeCount, capPercent: settings.tier_cap_percent };
}

function generateAffiliateCode(userId: string): string {
  const base = userId.replace(/-/g, '').slice(0, 6).toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `FV${base}${suffix}`;
}

// Leitura simples — não cria nada. Usada para saber se o usuário já é
// afiliado (e portanto já aceitou os termos) antes de qualquer ação.
export async function getAffiliate(userId: string) {
  const { data } = await supabase.from('affiliates').select('*').eq('user_id', userId).maybeSingle();
  return data;
}

// Único ponto que cria um afiliado — sempre exige aceite dos termos
// (ver TERMS_VERSION em referral-terms.ts). Se o afiliado já existir mas
// ainda não tiver aceitado (dado legado), registra o aceite agora.
export async function createAffiliateWithTerms(userId: string, termsVersion: string) {
  const existing = await getAffiliate(userId);
  if (existing) {
    if (!existing.terms_accepted_at) {
      const { data } = await supabase.from('affiliates')
        .update({ terms_accepted_at: new Date().toISOString(), terms_version: termsVersion })
        .eq('id', existing.id).select().single();
      return data;
    }
    return existing;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateAffiliateCode(userId);
    const { data, error } = await supabase.from('affiliates').insert({
      user_id: userId,
      affiliate_code: code,
      terms_accepted_at: new Date().toISOString(),
      terms_version: termsVersion,
    }).select().single();
    if (!error) return data;
    if (error.code !== '23505') throw error; // erro != "código já existe" -> propaga
  }
  throw new Error('Não foi possível gerar um código de indicação único após 5 tentativas.');
}

// Chamada uma vez, logo após o cadastro do indicado (attach-referral.ts).
export async function attachReferral(referredUserId: string, affiliateCode: string): Promise<{ attached: boolean; reason?: string }> {
  if (!affiliateCode) return { attached: false, reason: 'no_code' };

  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('id, user_id, is_active')
    .eq('affiliate_code', affiliateCode.trim().toUpperCase())
    .maybeSingle();

  if (!affiliate || !affiliate.is_active) return { attached: false, reason: 'invalid_code' };
  if (affiliate.user_id === referredUserId) return { attached: false, reason: 'self_referral' };

  const terms = await resolveReferralTerms(affiliate.id);
  // duration_months é a cota de MESES PAGOS (não uma data-limite) — ver
  // recordCommissionEvent/commission_months_credited. commission_active_until
  // não é mais usado como trava; fica de fora para não sugerir o contrário.
  const { error } = await supabase.from('affiliate_referrals').insert({
    affiliate_id: affiliate.id,
    referred_user_id: referredUserId,
    commission_percent: terms.commissionPercent,
    duration_months: terms.durationMonths,
    hold_period_days: terms.holdPeriodDays,
    status: 'active',
  });

  if (error) {
    if (error.code === '23505') return { attached: false, reason: 'already_referred' };
    throw error;
  }
  return { attached: true };
}

// Chamada pelo webhook do gateway a cada pagamento confirmado do indicado.
// Idempotente: um mesmo pagamento (gateway + gatewayPaymentId) nunca gera
// duas comissões, mesmo que o webhook dispare mais de uma vez.
export async function recordCommissionEvent(params: {
  referralId: string;
  subscriptionId: string;
  gateway: string;
  gatewayPaymentId: string;
  chargeAmountCents: number;
}): Promise<{ created: boolean; reason?: string; amountCents?: number }> {
  const { data: referral } = await supabase.from('affiliate_referrals').select('*').eq('id', params.referralId).single();
  if (!referral) return { created: false, reason: 'referral_not_found' };

  const monthsThisPayment = await getBillingPeriodMonths(params.subscriptionId);

  // Indicações criadas ANTES desta mudança já têm commission_active_until
  // preenchido (regra antiga: data-limite fixa desde o início) — essas
  // continuam exatamente como estavam, sem efeito retroativo. Indicações
  // criadas a partir de agora nunca recebem esse campo (ver attachReferral) e
  // usam a regra nova: cota de MESES PAGOS (commission_months_credited), que
  // não anda durante meses em que o indicado não pagou e retoma quando ele
  // volta a pagar, até completar o total combinado.
  if (referral.commission_active_until != null) {
    if (new Date(referral.commission_active_until).getTime() < Date.now()) {
      if (referral.status !== 'expired') {
        await supabase.from('affiliate_referrals').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', referral.id);
      }
      return { created: false, reason: 'duration_expired' };
    }
  } else if (referral.duration_months != null && (referral.commission_months_credited || 0) >= referral.duration_months) {
    if (referral.status !== 'expired') {
      await supabase.from('affiliate_referrals').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', referral.id);
    }
    return { created: false, reason: 'duration_expired' };
  }

  const { data: affiliateRow } = await supabase.from('affiliates').select('user_id, total_earned_cents').eq('id', referral.affiliate_id).single();

  // Regra do programa: só são devidas comissões de pagamentos novos enquanto
  // o PRÓPRIO plano do indicador estiver ativo. Comissões já geradas antes
  // disso não são revertidas — só pausa o que viria a partir de agora.
  if (affiliateRow?.user_id) {
    const { data: referrerSub } = await supabase.from('subscriptions').select('status').eq('user_id', affiliateRow.user_id).maybeSingle();
    if (referrerSub && referrerSub.status !== 'active') {
      return { created: false, reason: 'referrer_plan_inactive' };
    }
  }

  const amountCents = Math.round(params.chargeAmountCents * (Number(referral.commission_percent) / 100));
  const availableAt = new Date(Date.now() + referral.hold_period_days * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('affiliate_commission_events').insert({
    affiliate_id: referral.affiliate_id,
    referral_id: referral.id,
    subscription_id: params.subscriptionId,
    gateway: params.gateway,
    gateway_payment_id: params.gatewayPaymentId,
    charge_amount_cents: params.chargeAmountCents,
    commission_percent_applied: referral.commission_percent,
    amount_cents: amountCents,
    months_covered: monthsThisPayment,
    status: 'pending_hold',
    available_at: availableAt,
  });

  if (error) {
    if (error.code === '23505') return { created: false, reason: 'duplicate_payment' }; // webhook duplicado
    throw error;
  }

  const newMonthsCredited = referral.duration_months != null
    ? Math.min(referral.duration_months, (referral.commission_months_credited || 0) + monthsThisPayment)
    : (referral.commission_months_credited || 0) + monthsThisPayment;

  await supabase.from('affiliate_referrals').update({
    status: 'active',
    total_commission_cents: (referral.total_commission_cents || 0) + amountCents,
    commission_months_credited: newMonthsCredited,
    updated_at: new Date().toISOString(),
  }).eq('id', referral.id);

  await supabase.from('affiliates').update({
    total_earned_cents: (affiliateRow?.total_earned_cents || 0) + amountCents,
  }).eq('id', referral.affiliate_id);

  return { created: true, amountCents };
}

// Saldo liberado e ainda não reservado para nenhum pedido de saque/resgate.
export async function getAvailableBalanceCents(affiliateId: string): Promise<number> {
  const { data } = await supabase.from('affiliate_commission_events')
    .select('amount_cents')
    .eq('affiliate_id', affiliateId)
    .eq('status', 'available')
    .is('paid_in_payout_id', null);
  return (data || []).reduce((s: number, e: any) => s + e.amount_cents, 0);
}

// Compara a comissão dos últimos 30 dias com os 30 dias anteriores — usado
// para avisar o indicador quando a renda de indicação está caindo (menos
// indicações ativas), sem ser um alarme falso em quem só está começando.
export async function getRecentCommissionTrend(affiliateId: string): Promise<{ last30: number; prev30: number; decreasing: boolean }> {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const { data: events } = await supabase.from('affiliate_commission_events')
    .select('amount_cents, created_at')
    .eq('affiliate_id', affiliateId)
    .neq('status', 'reversed')
    .gte('created_at', new Date(now - 60 * day).toISOString());

  let last30 = 0, prev30 = 0;
  for (const e of events || []) {
    const t = new Date(e.created_at).getTime();
    if (t >= now - 30 * day) last30 += e.amount_cents;
    else prev30 += e.amount_cents;
  }
  return { last30, prev30, decreasing: prev30 > 0 && last30 < prev30 };
}

// Se o saldo disponível do indicador já cobre um plano acima do atual dele.
export async function getUpgradeOpportunity(userId: string, availableCents: number): Promise<{ planName: string; planPriceCents: number } | null> {
  if (availableCents <= 0) return null;

  const { data: sub } = await supabase.from('subscriptions').select('plans(price_cents)').eq('user_id', userId).maybeSingle();
  const currentPriceCents = (sub as any)?.plans?.price_cents || 0;

  const { data: higherPlans } = await supabase.from('plans')
    .select('name, price_cents')
    .eq('is_active', true)
    .gt('price_cents', currentPriceCents)
    .order('price_cents', { ascending: true })
    .limit(1);

  const nextPlan = higherPlans?.[0];
  if (!nextPlan || availableCents < nextPlan.price_cents) return null;
  return { planName: nextPlan.name, planPriceCents: nextPlan.price_cents };
}

// Afiliado autoriza usar o saldo disponível para abater a PRÓPRIA
// mensalidade. Fica como pedido para o superadmin aplicar — a redução real
// na cobrança do Asaas é feita manualmente por segurança (evita qualquer
// risco de descompasso entre o que cobramos e o que o gateway já processou).
export async function requestCreditRedemption(userId: string, amountCents: number): Promise<{ payoutId: string }> {
  const affiliate = await getAffiliate(userId);
  if (!affiliate) throw new Error('Você ainda não é um afiliado — aceite os termos do programa primeiro.');
  const available = await getAvailableBalanceCents(affiliate.id);
  if (amountCents <= 0 || amountCents > available) {
    throw new Error(`Saldo insuficiente. Disponível: R$ ${(available / 100).toFixed(2)}.`);
  }

  const { data: sub } = await supabase.from('subscriptions').select('id').eq('user_id', userId).maybeSingle();

  const { data: eventsToReserve } = await supabase.from('affiliate_commission_events')
    .select('id, amount_cents')
    .eq('affiliate_id', affiliate.id)
    .eq('status', 'available')
    .is('paid_in_payout_id', null)
    .order('available_at', { ascending: true });

  const reservedIds: string[] = [];
  let reserved = 0;
  for (const e of eventsToReserve || []) {
    if (reserved >= amountCents) break;
    reservedIds.push(e.id);
    reserved += e.amount_cents;
  }

  const { data: payout, error } = await supabase.from('affiliate_payouts').insert({
    affiliate_id: affiliate.id,
    amount_cents: reserved,
    redemption_type: 'subscription_credit',
    applied_subscription_id: sub?.id || null,
    status: 'requested',
  }).select().single();
  if (error) throw error;

  await supabase.from('affiliate_commission_events').update({ paid_in_payout_id: payout.id }).in('id', reservedIds);

  return { payoutId: payout.id };
}

// Chamada pelo webhook em estorno/chargeback. "Sem estorno" = a comissão
// referente àquele pagamento específico é cancelada; se já tinha sido
// liberada (ou paga), o saldo do afiliado fica negativo até compensar em
// comissões futuras (mesma lógica de clawback usada no mercado).
export async function reverseCommissionEvent(params: { gateway: string; gatewayPaymentId: string; reason: string }): Promise<{ reversed: boolean }> {
  if (!params.gatewayPaymentId) return { reversed: false };

  const { data: event } = await supabase.from('affiliate_commission_events')
    .select('*')
    .eq('gateway', params.gateway)
    .eq('gateway_payment_id', params.gatewayPaymentId)
    .maybeSingle();

  if (!event || event.status === 'reversed') return { reversed: false };

  // Se o dinheiro já tinha sido efetivamente entregue ao afiliado (payout marcado
  // como pago), não dá pra "tirar de volta" o que já foi pago — em vez disso,
  // lança um débito negativo no saldo dele, que abate automaticamente das
  // próximas comissões liberadas até compensar o valor. Se ainda não tinha sido
  // pago (só na carência ou disponível sem saque feito), basta excluir do saldo
  // disponível — não chega a faltar dinheiro no caixa dele.
  const alreadyPaidOut = event.status === 'paid';

  await supabase.from('affiliate_commission_events').update({
    status: 'reversed',
    reversed_at: new Date().toISOString(),
    reversed_reason: params.reason,
  }).eq('id', event.id);

  if (alreadyPaidOut) {
    const { error: debtError } = await supabase.from('affiliate_commission_events').insert({
      affiliate_id: event.affiliate_id,
      referral_id: event.referral_id,
      subscription_id: event.subscription_id,
      gateway: event.gateway,
      gateway_payment_id: `${event.gateway_payment_id}:chargeback_debt`,
      charge_amount_cents: -event.charge_amount_cents,
      commission_percent_applied: event.commission_percent_applied,
      amount_cents: -event.amount_cents,
      months_covered: 0,
      status: 'available',
      available_at: new Date().toISOString(),
    });
    // 23505 = já existe um débito pra esse pagamento (reversão duplicada) — ignora.
    if (debtError && debtError.code !== '23505') throw debtError;
  }

  const [{ data: referral }, { data: affiliate }] = await Promise.all([
    supabase.from('affiliate_referrals').select('total_commission_cents, commission_months_credited').eq('id', event.referral_id).single(),
    supabase.from('affiliates').select('total_earned_cents').eq('id', event.affiliate_id).single(),
  ]);

  // Devolve os meses que esse pagamento tinha creditado — um estorno/chargeback
  // não pode "gastar" a cota de meses combinada com o indicador sem que o pagamento
  // de fato tenha valido.
  const monthsCovered = event.months_covered || 1;
  const restoredMonthsCredited = Math.max(0, (referral?.commission_months_credited || 0) - monthsCovered);

  await Promise.all([
    supabase.from('affiliate_referrals').update({
      total_commission_cents: (referral?.total_commission_cents || 0) - event.amount_cents,
      commission_months_credited: restoredMonthsCredited,
      updated_at: new Date().toISOString(),
    }).eq('id', event.referral_id),
    supabase.from('affiliates').update({
      total_earned_cents: (affiliate?.total_earned_cents || 0) - event.amount_cents,
    }).eq('id', event.affiliate_id),
  ]);

  return { reversed: true };
}

// Rede de segurança para quando recordCommissionEvent/reverseCommissionEvent
// falham no webhook (ex.: instabilidade passageira do banco). Antes, o erro só
// ia pro console.error e a comissão sumia sem ninguém perceber. Agora fica
// registrada aqui e o cron diário tenta de novo automaticamente — como as duas
// funções são idempotentes (chave única por gateway+gatewayPaymentId), reprocessar
// não duplica nada.
export async function recordCommissionEventFailure(
  eventType: 'record' | 'reverse',
  payload: Record<string, any>,
  error: unknown
): Promise<void> {
  try {
    await supabase.from('commission_event_failures').insert({
      event_type: eventType,
      payload,
      error_message: error instanceof Error ? error.message : String(error),
    });
  } catch (err) {
    // Se nem isso conseguir gravar, ao menos deixa no log do servidor.
    console.error('[referral] Falha ao registrar commission_event_failure:', err);
  }
}

// Chamada pelo cron diário: reprocessa falhas ainda não resolvidas.
export async function retryFailedCommissionEvents(): Promise<{ resolved: number; stillFailing: number }> {
  const { data: pending } = await supabase
    .from('commission_event_failures')
    .select('*')
    .is('resolved_at', null)
    .order('created_at', { ascending: true })
    .limit(50);

  let resolved = 0, stillFailing = 0;
  for (const failure of pending || []) {
    try {
      if (failure.event_type === 'record') {
        await recordCommissionEvent(failure.payload);
      } else {
        await reverseCommissionEvent(failure.payload);
      }
      await supabase.from('commission_event_failures')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', failure.id);
      resolved++;
    } catch (err) {
      await supabase.from('commission_event_failures').update({
        attempts: (failure.attempts || 1) + 1,
        error_message: err instanceof Error ? err.message : String(err),
        last_attempt_at: new Date().toISOString(),
      }).eq('id', failure.id);
      stillFailing++;
    }
  }
  return { resolved, stillFailing };
}

// Mantém affiliate_referrals.status espelhando o status real da assinatura
// do indicado, para o indicador acompanhar se a indicação está ativa.
export async function syncReferralStatusFromSubscription(subscriptionId: string, subscriptionStatus: string): Promise<void> {
  const { data: referral } = await supabase.from('affiliate_referrals').select('id, status').eq('subscription_id', subscriptionId).maybeSingle();
  if (!referral || referral.status === 'expired') return;

  const nextStatus = subscriptionStatus === 'active' ? 'active' : 'inactive';
  if (nextStatus !== referral.status) {
    await supabase.from('affiliate_referrals').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', referral.id);
  }
}

// Aprovação/pagamento/rejeição de saque pelo superadmin.
export async function processPayout(payoutId: string, action: 'approve' | 'pay' | 'reject', adminUserId: string, rejectionReason?: string) {
  const { data: payout } = await supabase.from('affiliate_payouts').select('*').eq('id', payoutId).single();
  if (!payout) throw new Error('Pedido de saque não encontrado.');
  if (payout.status === 'paid' || payout.status === 'rejected') {
    throw new Error(`Este pedido já foi ${payout.status === 'paid' ? 'pago' : 'rejeitado'}.`);
  }

  const now = new Date().toISOString();

  if (action === 'approve') {
    await supabase.from('affiliate_payouts').update({ status: 'approved', reviewed_at: now, reviewed_by: adminUserId }).eq('id', payoutId);
    return { status: 'approved' };
  }

  if (action === 'reject') {
    await supabase.from('affiliate_payouts').update({
      status: 'rejected', reviewed_at: now, reviewed_by: adminUserId, rejection_reason: rejectionReason || null,
    }).eq('id', payoutId);
    // Libera os eventos de volta ao saldo disponível para um novo pedido.
    await supabase.from('affiliate_commission_events').update({ paid_in_payout_id: null }).eq('paid_in_payout_id', payoutId);
    return { status: 'rejected' };
  }

  // action === 'pay'
  await supabase.from('affiliate_payouts').update({
    status: 'paid', paid_at: now, reviewed_at: payout.reviewed_at || now, reviewed_by: payout.reviewed_by || adminUserId,
  }).eq('id', payoutId);
  await supabase.from('affiliate_commission_events').update({ status: 'paid' }).eq('paid_in_payout_id', payoutId);

  const { data: affiliate } = await supabase.from('affiliates').select('total_paid_cents').eq('id', payout.affiliate_id).single();
  await supabase.from('affiliates').update({
    total_paid_cents: (affiliate?.total_paid_cents || 0) + payout.amount_cents,
  }).eq('id', payout.affiliate_id);

  return { status: 'paid' };
}

// Marca disponível para saque as comissões cuja carência já venceu, e
// devolve por afiliado quanto foi liberado agora (para notificar). Chamada
// pelo cron diário (notify-referral-engagement.ts).
export async function releaseMaturedCommissions(): Promise<{ affiliateId: string; amountCents: number }[]> {
  const { data, error } = await supabase
    .from('affiliate_commission_events')
    .update({ status: 'available' })
    .eq('status', 'pending_hold')
    .lte('available_at', new Date().toISOString())
    .select('affiliate_id, amount_cents');
  if (error) throw error;
  return (data || []).map((r: any) => ({ affiliateId: r.affiliate_id, amountCents: r.amount_cents }));
}
