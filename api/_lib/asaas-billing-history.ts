import { createClient } from '@supabase/supabase-js';

const ASAAS_BASE_URL = process.env.ASAAS_BASE_URL || 'https://sandbox.asaas.com/api/v3';
const ASAAS_KEY = process.env.ASAAS_SANDBOX_KEY || '';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

async function asaasRequest(path: string, method = 'GET', body?: any) {
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    method,
    headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export async function handleAsaasBillingHistory(req: any, res: any) {
  // Exige um token de login válido do Supabase — sem isso, qualquer um podia
  // pedir o histórico de faturas de QUALQUER assinatura só sabendo o ID dela.
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  if (!token) return res.status(401).json({ error: 'Login necessário (token ausente).' });

  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authUser) return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });

  const { asaasSubscriptionId } = req.query;
  if (!asaasSubscriptionId) return res.status(400).json({ error: 'asaasSubscriptionId required' });

  try {
    // Confirma que a assinatura pedida é do próprio usuário logado antes de
    // buscar qualquer fatura — sem isso, um ID de outra pessoa também passava.
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('asaas_subscription_id', asaasSubscriptionId)
      .maybeSingle();

    if (!sub || sub.user_id !== authUser.id) {
      return res.status(403).json({ error: 'Essa assinatura não pertence à sua conta.' });
    }

    const payments = await asaasRequest(`/payments?subscription=${asaasSubscriptionId}`);
    return res.status(200).json(payments);
  } catch (err: any) {
    console.error('Asaas Billing History Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
