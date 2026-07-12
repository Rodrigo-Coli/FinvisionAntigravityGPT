import { createClient } from '@supabase/supabase-js';
import { processPayout } from './referral.service.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

// POST /api/admin-process-payout — aprova, paga ou rejeita um pedido de
// saque de afiliado. A leitura/edição de referral_settings, affiliates e
// whatsapp_cost_config acontece direto do Master Console via Supabase +
// RLS (mesmo padrão de plans/ai_cost_config); este endpoint só existe
// porque pagar um saque mexe em três tabelas ao mesmo tempo (payout +
// eventos de comissão + total_paid_cents) e precisa ser atômico o
// suficiente para não ficar inconsistente.
export async function handleAdminProcessPayout(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login necessário (token ausente).' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem processar saques.' });

  const { payoutId, action, rejectionReason } = req.body || {};
  if (!payoutId || !['approve', 'pay', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'payoutId e action (approve|pay|reject) são obrigatórios.' });
  }

  try {
    const result = await processPayout(payoutId, action, user.id, rejectionReason);
    await supabase.from('admin_audit_logs').insert({
      admin_id: user.id,
      action: `affiliate_payout_${action}`,
      details: { payoutId, rejectionReason: rejectionReason || null },
    });
    return res.status(200).json({ success: true, ...result });
  } catch (err: any) {
    console.error('admin-process-payout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
