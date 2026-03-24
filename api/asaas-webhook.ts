import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Token gerado no painel Asaas — salvo na Vercel como ASAAS_WEBHOOK_TOKEN
const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || '';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  // Validate Asaas webhook token
  // Asaas sends the token in: header 'asaas-access-token' OR body field 'accessToken'
  const headerToken = req.headers['asaas-access-token'] || req.headers['access_token'] || '';
  const bodyToken = req.body?.accessToken || '';
  const receivedToken = headerToken || bodyToken;

  if (WEBHOOK_TOKEN && receivedToken !== WEBHOOK_TOKEN) {
    console.warn('[Webhook] Invalid token received:', receivedToken?.slice(0, 10) + '...');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const event = req.body;
  const { event: eventType, payment, subscription: subData } = event || {};
  console.log('[Asaas Webhook]', eventType, JSON.stringify(event).slice(0, 200));

  try {
    switch (eventType) {

      // —— PAYMENT CONFIRMED / RECEIVED — activate subscription
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED': {
        const ref = payment?.subscription?.externalReference || payment?.externalReference || '';
        const [userId, planSlug] = ref.split(':');
        if (!userId) break;

        const { data: plan } = await supabase.from('plans').select('id').eq('slug', planSlug).single();
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        await supabase.from('subscriptions').update({
          status: 'active',
          plan_id: plan?.id,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          ai_scans_used: 0,             // reset counter on new billing period
          ai_scans_reset_at: now.toISOString(),
          updated_at: now.toISOString(),
        }).eq('user_id', userId);

        console.log(`[✓ Webhook] ACTIVATED userId=${userId} plan=${planSlug}`);
        break;
      }

      // —— PAYMENT OVERDUE — flag as past_due
      case 'PAYMENT_OVERDUE': {
        const ref = payment?.subscription?.externalReference || payment?.externalReference || '';
        const [userId] = ref.split(':');
        if (!userId) break;

        await supabase.from('subscriptions').update({
          status: 'past_due',
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId);

        console.log(`[⚠ Webhook] PAST_DUE userId=${userId}`);
        break;
      }

      // —— PAYMENT REFUNDED — downgrade to free
      case 'PAYMENT_REFUNDED': {
        const ref = payment?.subscription?.externalReference || payment?.externalReference || '';
        const [userId] = ref.split(':');
        if (!userId) break;

        const { data: freePlan } = await supabase.from('plans').select('id').eq('slug', 'free').single();
        if (freePlan) {
          await supabase.from('subscriptions').update({
            status: 'canceled',
            plan_id: freePlan.id,
            updated_at: new Date().toISOString(),
          }).eq('user_id', userId);
          console.log(`[✖ Webhook] REFUNDED → downgraded userId=${userId}`);
        }
        break;
      }

      // —— SUBSCRIPTION INACTIVATED / DELETED — downgrade to free
      case 'SUBSCRIPTION_INACTIVATED':
      case 'SUBSCRIPTION_DELETED': {
        const asaasSubId = subData?.id;
        if (!asaasSubId) break;

        const { data: freePlan } = await supabase.from('plans').select('id').eq('slug', 'free').single();
        if (freePlan) {
          await supabase.from('subscriptions').update({
            status: 'canceled',
            plan_id: freePlan.id,
            updated_at: new Date().toISOString(),
          }).eq('asaas_subscription_id', asaasSubId);
          console.log(`[✖ Webhook] ${eventType} asaas_sub=${asaasSubId} → free`);
        }
        break;
      }

      // —— PAYMENT DELETED — same effect
      case 'PAYMENT_DELETED': {
        const asaasSubId = payment?.subscription?.id || subData?.id;
        if (!asaasSubId) break;

        const { data: freePlan } = await supabase.from('plans').select('id').eq('slug', 'free').single();
        if (freePlan) {
          await supabase.from('subscriptions').update({
            status: 'canceled',
            plan_id: freePlan.id,
            updated_at: new Date().toISOString(),
          }).eq('asaas_subscription_id', asaasSubId);
        }
        break;
      }

      // —— All other events — silently ignore (return 200 anyway so Asaas doesn't retry)
      default:
        console.log(`[~ Webhook] Ignored event: ${eventType}`);
    }

    return res.status(200).json({ ok: true, event: eventType });
  } catch (err: any) {
    console.error('[Webhook Error]', err);
    // Still return 200 to prevent Asaas from retrying on transient errors
    return res.status(200).json({ ok: false, error: err.message });
  }
}
