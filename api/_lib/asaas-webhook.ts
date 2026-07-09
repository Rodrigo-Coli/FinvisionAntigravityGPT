import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

export async function handleAsaasWebhook(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();
  const token = req.headers['asaas-access-token'];
  if (process.env.ASAAS_WEBHOOK_TOKEN && token !== process.env.ASAAS_WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = req.body || {};
    const { event, payment, subscription } = payload;
    const asaasSubId = subscription?.id || payment?.subscription;
    if (!asaasSubId) return res.status(200).json({ received: true, ignored: true });

    const statusMap: Record<string, string> = {
      'PAYMENT_RECEIVED': 'active',
      'PAYMENT_CONFIRMED': 'active',
      'PAYMENT_OVERDUE': 'past_due',
      'PAYMENT_REFUNDED': 'past_due',
      'PAYMENT_CHARGEBACK_REQUESTED': 'past_due',
      'PAYMENT_DELETED': 'canceled',
      'SUBSCRIPTION_DELETED': 'canceled'
    };

    if (statusMap[event]) {
      await supabase.from('subscriptions').update({
        status: statusMap[event],
        updated_at: new Date().toISOString()
      }).eq('asaas_subscription_id', asaasSubId);
    }

    // Só agora que o Asaas confirmou o recebimento do pagamento é que o cupom
    // (se houver) é marcado como usado — evita queimar o cupom de quem nunca pagou.
    if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
      const externalReference: string | undefined = payment?.externalReference;
      const parts = externalReference?.split(':') || [];
      const [refUserId, , , couponCode] = parts;
      if (refUserId && couponCode) {
        const { data: coupon } = await supabase
          .from('coupons')
          .select('id, uses_count')
          .eq('code', couponCode)
          .maybeSingle();
        if (coupon) {
          const { data: used } = await supabase.from('coupon_uses')
            .select('id').eq('coupon_id', coupon.id).eq('user_id', refUserId).maybeSingle();
          if (!used) {
            await supabase.from('coupon_uses').insert({ coupon_id: coupon.id, user_id: refUserId });
            await supabase.from('coupons').update({ uses_count: (coupon.uses_count || 0) + 1 }).eq('id', coupon.id);
          }
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
