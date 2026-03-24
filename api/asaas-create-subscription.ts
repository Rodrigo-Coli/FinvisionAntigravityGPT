import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const ASAAS_BASE_URL = 'https://sandbox.asaas.com/api/v3';
const ASAAS_KEY = process.env.ASAAS_SANDBOX_KEY || '';

async function asaasRequest(path: string, method = 'GET', body?: any) {
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    method,
    headers: {
      'access_token': ASAAS_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const { userId, planSlug, paymentMethod = 'PIX', couponCode } = req.body;
  if (!userId || !planSlug) return res.status(400).json({ error: 'userId and planSlug required' });

  try {
    // 1. Get plan from DB
    const { data: plan, error: planErr } = await supabase
      .from('plans')
      .select('*')
      .eq('slug', planSlug)
      .single();
    if (planErr || !plan) return res.status(404).json({ error: 'Plan not found' });
    if (plan.price_cents === 0) return res.status(400).json({ error: 'Free plan does not require payment' });

    // 2. Get user email from auth
    const { data: { user }, error: userErr } = await supabase.auth.admin.getUserById(userId);
    if (userErr || !user) return res.status(404).json({ error: 'User not found' });

    // 3. Validate coupon if provided
    let discountPercent = 0;
    let couponPlanOverride: any = null;
    if (couponCode) {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('*, plans(*)')
        .eq('code', couponCode.toUpperCase())
        .eq('is_active', true)
        .maybeSingle();
      
      if (coupon) {
        // Check coupon not used by this user
        const { data: existingUse } = await supabase
          .from('coupon_uses')
          .select('id')
          .eq('coupon_id', coupon.id)
          .eq('user_id', userId)
          .maybeSingle();
        
        if (!existingUse) {
          if (coupon.discount_type === 'percent') discountPercent = coupon.discount_value;
          if (coupon.plan_override_id) couponPlanOverride = coupon.plans;
          
          // Record coupon use
          await supabase.from('coupon_uses').insert({ coupon_id: coupon.id, user_id: userId });
          await supabase.from('coupons').update({ uses_count: (coupon.uses_count || 0) + 1 }).eq('id', coupon.id);
        }
      }
    }

    // 4. If coupon grants a free plan, just update subscription without Asaas
    if (couponPlanOverride && couponPlanOverride.price_cents === 0) {
      await upsertSubscription(userId, couponPlanOverride.id, 'admin_granted', null);
      return res.status(200).json({ success: true, message: 'Plan granted via coupon', plan: couponPlanOverride.name });
    }

    // 5. Create or find Asaas customer
    const existingCustomers = await asaasRequest(`/customers?email=${encodeURIComponent(user.email)}`);
    let asaasCustomerId: string;
    
    if (existingCustomers.data && existingCustomers.data.length > 0) {
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

    // 6. Calculate price with discount
    const priceInReais = (plan.price_cents / 100) * (1 - discountPercent / 100);

    // 7. Create Asaas subscription
    const subscription = await asaasRequest('/subscriptions', 'POST', {
      customer: asaasCustomerId,
      billingType: paymentMethod === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX',
      value: priceInReais,
      nextDueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // trial: 14 days
      cycle: 'MONTHLY',
      description: `FinVision ${plan.name}`,
      externalReference: `${userId}:${planSlug}`,
    });

    if (!subscription.id) throw new Error('Failed to create Asaas subscription: ' + JSON.stringify(subscription));

    // 8. Update our DB
    await upsertSubscription(userId, plan.id, 'trialing', subscription.id);

    return res.status(200).json({
      success: true,
      asaasSubscriptionId: subscription.id,
      plan: plan.name,
      trialDays: plan.trial_days,
      nextDueDate: subscription.nextDueDate,
    });

  } catch (err: any) {
    console.error('asaas-create-subscription error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function upsertSubscription(userId: string, planId: string, status: string, asaasId: string | null) {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + 30);

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
