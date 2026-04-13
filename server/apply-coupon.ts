import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { userId, couponCode } = req.body;
  if (!userId || !couponCode) return res.status(400).json({ error: 'userId and couponCode required' });

  try {
    // 1. Find coupon
    const { data: coupon, error: couponErr } = await supabase
      .from('coupons')
      .select('*, plans(*)')
      .eq('code', couponCode.toUpperCase().trim())
      .eq('is_active', true)
      .maybeSingle();

    if (couponErr || !coupon) return res.status(404).json({ error: 'Cupom inválido ou inativo.' });
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Este cupom está expirado.' });
    }
    if (coupon.max_uses && coupon.uses_count >= coupon.max_uses) {
      return res.status(400).json({ error: 'Este cupom atingiu o limite de usos.' });
    }

    // 2. Check if already used by this user
    const { data: existingUse } = await supabase
      .from('coupon_uses')
      .select('id')
      .eq('coupon_id', coupon.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingUse) return res.status(400).json({ error: 'Você já usou este cupom.' });

    // 3. Get current subscription
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const now = new Date();
    let message = '';

    // 4. Apply coupon effect
    if (coupon.plan_override_id && coupon.plans) {
      // Grant a specific plan directly
      const overridePlan = coupon.plans;
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1 + (coupon.free_months || 0));

      if (sub) {
        await supabase.from('subscriptions').update({
          plan_id: overridePlan.id,
          status: 'admin_granted',
          current_period_end: periodEnd.toISOString(),
          notes: `Plano ${overridePlan.name} concedido via cupom ${coupon.code}`,
          updated_at: now.toISOString(),
        }).eq('user_id', userId);
      } else {
        await supabase.from('subscriptions').insert({
          user_id: userId,
          plan_id: overridePlan.id,
          status: 'admin_granted',
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          notes: `Cupom ${coupon.code}`,
        });
      }
      message = `Plano ${overridePlan.name} ativado com sucesso!`;

    } else if (coupon.discount_type === 'free_months' && sub) {
      // Extend trial/period
      const extendDays = (coupon.discount_value || coupon.free_months || 1) * 30;
      const currentEnd = sub.current_period_end ? new Date(sub.current_period_end) : now;
      if (currentEnd < now) currentEnd.setTime(now.getTime());
      currentEnd.setDate(currentEnd.getDate() + extendDays);

      await supabase.from('subscriptions').update({
        current_period_end: currentEnd.toISOString(),
        status: sub.status === 'canceled' ? 'active' : sub.status,
        notes: `Extendido via cupom ${coupon.code}`,
        updated_at: now.toISOString(),
      }).eq('user_id', userId);
      message = `Período estendido por ${coupon.discount_value || coupon.free_months} mês(es)!`;

    } else {
      // Percent or fixed discount — stored for next payment (Asaas handles at checkout)
      message = coupon.discount_type === 'percent'
        ? `Cupom válido! ${coupon.discount_value}% de desconto aplicado na próxima cobrança.`
        : `Cupom válido! R$${coupon.discount_value} de desconto na próxima cobrança.`;
    }

    // 5. Record usage
    await supabase.from('coupon_uses').insert({ coupon_id: coupon.id, user_id: userId });
    await supabase.from('coupons').update({ uses_count: (coupon.uses_count || 0) + 1 }).eq('id', coupon.id);

    return res.status(200).json({ success: true, message, coupon: { code: coupon.code, type: coupon.discount_type, value: coupon.discount_value } });

  } catch (err: any) {
    console.error('apply-coupon error:', err);
    return res.status(500).json({ error: err.message });
  }
}
