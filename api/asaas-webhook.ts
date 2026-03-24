import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const event = req.body;
  console.log('[Asaas Webhook]', event?.event, JSON.stringify(event).slice(0, 300));

  try {
    const { event: eventType, payment, subscription: subData } = event;

    switch (eventType) {
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED': {
        // Payment received — activate subscription
        const externalRef = payment?.subscription?.externalReference || payment?.externalReference || '';
        const [userId, planSlug] = externalRef.split(':');
        if (!userId) break;

        const { data: plan } = await supabase.from('plans').select('id').eq('slug', planSlug).single();
        if (!plan) break;

        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        await supabase.from('subscriptions').update({
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          ai_scans_used: 0,                           // reset usage on new period
          ai_scans_reset_at: now.toISOString(),
          updated_at: now.toISOString(),
        }).eq('user_id', userId);

        console.log(`[Webhook] Activated subscription for userId=${userId}`);
        break;
      }

      case 'PAYMENT_OVERDUE': {
        const externalRef = payment?.subscription?.externalReference || payment?.externalReference || '';
        const [userId] = externalRef.split(':');
        if (!userId) break;

        await supabase.from('subscriptions').update({
          status: 'past_due',
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId);
        console.log(`[Webhook] Marked past_due for userId=${userId}`);
        break;
      }

      case 'SUBSCRIPTION_DELETED':
      case 'PAYMENT_DELETED': {
        const asaasSubId = subData?.id || payment?.subscription?.id;
        if (!asaasSubId) break;

        // Downgrade to free plan
        const { data: freePlan } = await supabase.from('plans').select('id').eq('slug', 'free').single();
        if (!freePlan) break;

        await supabase.from('subscriptions').update({
          status: 'canceled',
          plan_id: freePlan.id,
          updated_at: new Date().toISOString(),
        }).eq('asaas_subscription_id', asaasSubId);
        console.log(`[Webhook] Canceled asaas_sub=${asaasSubId}, downgraded to free`);
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event: ${eventType}`);
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('[Webhook Error]', err);
    return res.status(500).json({ error: err.message });
  }
}
