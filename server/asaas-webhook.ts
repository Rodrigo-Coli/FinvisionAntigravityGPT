import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers['asaas-access-token'];
  if (process.env.ASAAS_WEBHOOK_TOKEN && token !== process.env.ASAAS_WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized token' });
  }

  try {
    const payload = req.body || {};
    const { event, payment, subscription } = payload;
    
    // Asaas sends subscription object for SUBSCRIPTION_* events, and payment object for PAYMENT_* events
    const asaasSubId = subscription?.id || payment?.subscription;
    
    if (!asaasSubId) {
      return res.status(200).json({ received: true, ignored: true, reason: 'No subscription ID in payload' });
    }

    if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
      await supabase.from('subscriptions').update({ 
        status: 'active',
        updated_at: new Date().toISOString()
      }).eq('asaas_subscription_id', asaasSubId);
      
    } else if (['PAYMENT_OVERDUE', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'].includes(event)) {
      await supabase.from('subscriptions').update({ 
        status: 'past_due',
        updated_at: new Date().toISOString()
      }).eq('asaas_subscription_id', asaasSubId);

    } else if (event === 'PAYMENT_DELETED' || event === 'SUBSCRIPTION_DELETED') {
      await supabase.from('subscriptions').update({ 
        status: 'canceled',
        updated_at: new Date().toISOString()
      }).eq('asaas_subscription_id', asaasSubId);
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('Webhook Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
