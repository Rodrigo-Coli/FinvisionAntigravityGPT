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
    return res.status(200).json({ received: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
