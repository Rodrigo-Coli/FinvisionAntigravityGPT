import { createClient } from '@supabase/supabase-js';
import { getPaymentGateway } from './payment/index.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

type Period = 'monthly' | 'semiannual' | 'annual';

const PERIOD_MONTHS: Record<Period, number> = {
  monthly: 1,
  semiannual: 6,
  annual: 12,
};

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
    paymentMethod = 'PIX',
    couponCode,
    creditCard,
    creditCardHolderInfo
  } = req.body;

  if (!planSlug) return res.status(400).json({ error: 'planSlug required' });

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
    let totalPrice: number;
    if (p === 'semiannual') totalPrice = plan.price_cents_semiannual || plan.price_cents * 6;
    else if (p === 'annual') totalPrice = plan.price_cents_annual || plan.price_cents * 12;
    else totalPrice = plan.price_cents;

    // 4. Check existing subscription and trial
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('trial_ends_at, status')
      .eq('user_id', userId)
      .maybeSingle();

    const now = new Date();
    let nextDue: string;
    let trialEndsAt: string | null = null;

    if (existingSub && existingSub.status === 'trialing' && existingSub.trial_ends_at && new Date(existingSub.trial_ends_at) > now) {
      trialEndsAt = existingSub.trial_ends_at;
      nextDue = new Date(existingSub.trial_ends_at).toISOString().split('T')[0];
    } else {
      // If trial has expired, charge immediately (due date is today)
      nextDue = now.toISOString().split('T')[0];
    }

    // 5. Validate coupon (SOMENTE leitura — o cupom só é marcado como usado depois que o
    // pagamento for de fato confirmado pelo webhook do Asaas, evitando "queimar" o cupom
    // de um usuário que nunca chegou a pagar).
    let discountPercent = 0;
    let validCouponCode: string | null = null;
    if (couponCode) {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('*, plans(*)')
        .eq('code', couponCode.toUpperCase())
        .eq('is_active', true)
        .maybeSingle();

      if (coupon) {
        const { data: used } = await supabase.from('coupon_uses')
          .select('id').eq('coupon_id', coupon.id).eq('user_id', userId).maybeSingle();

        if (!used) {
          // Plano gratuito via cupom: não há cobrança a aguardar, então confirma na hora.
          if (coupon.plan_override_id && coupon.plans?.price_cents === 0) {
            await upsertSubscription(userId, coupon.plans.id, 'admin_granted', null, p, null);
            await supabase.from('coupon_uses').insert({ coupon_id: coupon.id, user_id: userId });
            await supabase.from('coupons').update({ uses_count: (coupon.uses_count || 0) + 1 }).eq('id', coupon.id);
            return res.status(200).json({ success: true, message: 'Plan granted via coupon', plan: coupon.plans.name, period });
          }
          if (coupon.discount_type === 'percent') discountPercent = coupon.discount_value;
          validCouponCode = coupon.code;
        }
      }
    }

    // 6. Apply discount to total price
    const priceInReais = (totalPrice / 100) * (1 - discountPercent / 100);

    // 7. Criar assinatura através da abstração de gateway (troca de banco no
    //    futuro = trocar o gateway aqui, sem mexer no resto desta função).
    const gateway = getPaymentGateway('asaas');
    const result = await gateway.createSubscription({
      customerEmail: user.email,
      customerExternalReference: userId,
      valueReais: priceInReais,
      billingPeriod: p,
      nextDueDate: nextDue,
      paymentMethod,
      description: `FinVision ${plan.name} (${PERIOD_MONTHS[p]} mês${PERIOD_MONTHS[p] > 1 ? 'es' : ''})`,
      // Cupom pendente vai junto na referência para o webhook confirmar o uso somente
      // quando o pagamento realmente cair (ver handleAsaasWebhook).
      externalReference: `${userId}:${planSlug}:${p}:${validCouponCode || ''}`,
      creditCard: paymentMethod === 'CREDIT_CARD' && creditCard ? creditCard : undefined,
      creditCardHolderInfo: paymentMethod === 'CREDIT_CARD' && creditCardHolderInfo
        ? { ...creditCardHolderInfo, email: creditCardHolderInfo.email || user.email }
        : undefined,
      remoteIp: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
    });

    // 8. Upsert in our DB
    const initialStatus = paymentMethod === 'CREDIT_CARD' ? 'active' : (trialEndsAt ? 'trialing' : 'past_due');
    await upsertSubscription(userId, plan.id, initialStatus, result.gatewaySubscriptionId, p, trialEndsAt, gateway.name);

    return res.status(200).json({
      success: true,
      asaasSubscriptionId: result.gatewaySubscriptionId,
      plan: plan.name,
      period,
      totalPrice: priceInReais,
      nextDueDate: result.nextDueDate,
      pix: result.pix
    });

  } catch (err: any) {
    console.error('asaas-create-subscription error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function upsertSubscription(userId: string, planId: string, status: string, asaasId: string | null, period: Period, trialEndsAt: string | null, paymentGateway?: string) {
  const now = new Date();
  const months = PERIOD_MONTHS[period];
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + months);

  const payload: any = {
    user_id: userId,
    plan_id: planId,
    status,
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    trial_ends_at: trialEndsAt,
    updated_at: now.toISOString(),
  };
  if (asaasId) payload.asaas_subscription_id = asaasId;
  if (paymentGateway) payload.payment_gateway = paymentGateway;

  await supabase.from('subscriptions').upsert(payload, { onConflict: 'user_id' });
}
