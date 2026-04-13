import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

const ASAAS_BASE_URL = 'https://sandbox.asaas.com/api/v3';
const ASAAS_KEY = process.env.ASAAS_SANDBOX_KEY || '';

type Period = 'monthly' | 'semiannual' | 'annual';

const ASAAS_CYCLE: Record<Period, string> = {
  monthly: 'MONTHLY',
  semiannual: 'SEMIANNUALLY',
  annual: 'YEARLY',
};

const PERIOD_MONTHS: Record<Period, number> = {
  monthly: 1,
  semiannual: 6,
  annual: 12,
};

async function asaasRequest(path: string, method = 'GET', body?: any) {
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    method,
    headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const { userId, planSlug, period = 'monthly', paymentMethod = 'PIX', couponCode } = req.body;
  if (!userId || !planSlug) return res.status(400).json({ error: 'userId and planSlug required' });

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

    // 4. Validate coupon
    let discountPercent = 0;
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
          // Free plan override via coupon
          if (coupon.plan_override_id && coupon.plans?.price_cents === 0) {
            await upsertSubscription(userId, coupon.plans.id, 'admin_granted', null, p);
            await supabase.from('coupon_uses').insert({ coupon_id: coupon.id, user_id: userId });
            await supabase.from('coupons').update({ uses_count: (coupon.uses_count || 0) + 1 }).eq('id', coupon.id);
            return res.status(200).json({ success: true, message: 'Plan granted via coupon', plan: coupon.plans.name, period });
          }
          if (coupon.discount_type === 'percent') discountPercent = coupon.discount_value;
          await supabase.from('coupon_uses').insert({ coupon_id: coupon.id, user_id: userId });
          await supabase.from('coupons').update({ uses_count: (coupon.uses_count || 0) + 1 }).eq('id', coupon.id);
        }
      }
    }

    // 5. Create/find Asaas customer
    const existingCustomers = await asaasRequest(`/customers?email=${encodeURIComponent(user.email)}`);
    let asaasCustomerId: string;
    if (existingCustomers.data?.length > 0) {
      asaasCustomerId = existingCustomers.data[0].id;
    } else {
      const customer = await asaasRequest('/customers', 'POST', {
        name: user.email.split('@')[0],
        email: user.email,
        externalReference: userId,
      });
      if (!customer.id) throw new Error('Failed to create Asaas customer: ' + JSON.stringify(customer));
      asaasCustomerId = customer.id;
    }

    // 6. Apply discount to total price
    const priceInReais = (totalPrice / 100) * (1 - discountPercent / 100);

    // 7. Next due: after trial (14 days from now)
    const nextDue = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 8. Create Asaas subscription
    const subscription = await asaasRequest('/subscriptions', 'POST', {
      customer: asaasCustomerId,
      billingType: paymentMethod === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX',
      value: priceInReais,
      nextDueDate: nextDue,
      cycle: ASAAS_CYCLE[p],
      description: `FinVision ${plan.name} (${PERIOD_MONTHS[p]} mês${PERIOD_MONTHS[p] > 1 ? 'es' : ''})`,
      externalReference: `${userId}:${planSlug}:${p}`,
    });

    if (!subscription.id) throw new Error('Failed to create Asaas subscription: ' + JSON.stringify(subscription));

    // 9. Upsert in our DB
    await upsertSubscription(userId, plan.id, 'trialing', subscription.id, p);

    return res.status(200).json({
      success: true,
      asaasSubscriptionId: subscription.id,
      plan: plan.name,
      period,
      totalPrice: priceInReais,
      nextDueDate: subscription.nextDueDate,
    });

  } catch (err: any) {
    console.error('asaas-create-subscription error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function upsertSubscription(userId: string, planId: string, status: string, asaasId: string | null, period: Period) {
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
    trial_ends_at: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: now.toISOString(),
  };
  if (asaasId) payload.asaas_subscription_id = asaasId;

  await supabase.from('subscriptions').upsert(payload, { onConflict: 'user_id' });
}
