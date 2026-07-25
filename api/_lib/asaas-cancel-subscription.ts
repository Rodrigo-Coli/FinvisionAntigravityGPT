import { createClient } from '@supabase/supabase-js';
import { getPaymentGateway } from './payment/index.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

// Cancela a cobrança recorrente, mas mantém o acesso do usuário ao plano
// pago até current_period_end (a data que seria a próxima renovação).
// O rebaixamento de verdade acontece depois, via cron diário (maintenance.ts),
// quando essa data chega. Ver asaas-webhook.ts para o motivo de não reagir
// aos eventos subscription_deleted/payment_deleted que este cancelamento dispara.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  if (!token) return res.status(401).json({ error: 'Login necessário (token ausente).' });

  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authUser) return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });

  const userId = authUser.id;
  const { reason } = req.body || {};

  try {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id, status, asaas_subscription_id, current_period_end, cancel_at_period_end')
      .eq('user_id', userId)
      .maybeSingle();

    if (!sub) return res.status(404).json({ error: 'Nenhuma assinatura encontrada.' });
    if (!['active', 'trialing', 'past_due'].includes(sub.status)) {
      return res.status(400).json({ error: 'Esta assinatura não pode ser cancelada no estado atual.' });
    }
    if (sub.cancel_at_period_end) {
      return res.status(200).json({ success: true, alreadyCanceled: true, accessUntil: sub.current_period_end });
    }

    if (sub.asaas_subscription_id) {
      const gateway = getPaymentGateway('asaas');
      await gateway.cancelSubscription(sub.asaas_subscription_id);
    }

    await supabase.from('subscriptions').update({
      cancel_at_period_end: true,
      canceled_at: new Date().toISOString(),
      cancel_reason: reason || null,
      updated_at: new Date().toISOString(),
    }).eq('id', sub.id);

    return res.status(200).json({ success: true, accessUntil: sub.current_period_end });
  } catch (err: any) {
    console.error('asaas-cancel-subscription error:', err);
    return res.status(500).json({ error: err.message });
  }
}
