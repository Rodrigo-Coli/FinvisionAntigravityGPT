import { createClient } from '@supabase/supabase-js';
import { getOrCreateAffiliate, getTierProgress } from './referral.service.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

async function authenticate(req: any) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// GET /api/affiliate-me — código de indicação, saldo, indicações e progresso
// de escalonamento do usuário logado. Cria o cadastro de afiliado na
// primeira chamada, se ainda não existir.
export async function handleAffiliateMe(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).end();
  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Login necessário.' });

  try {
    const affiliate = await getOrCreateAffiliate(user.id);
    const tier = await getTierProgress(affiliate.id);

    const [{ data: referrals }, { count: activeCount }, { data: pendingEvents }, { data: availableEvents }, { data: processingEvents }] = await Promise.all([
      supabase.from('affiliate_referrals')
        .select('id, status, created_at, commission_percent, duration_months, total_commission_cents')
        .eq('affiliate_id', affiliate.id)
        .order('created_at', { ascending: false }),
      supabase.from('affiliate_referrals').select('id', { count: 'exact', head: true }).eq('affiliate_id', affiliate.id).eq('status', 'active'),
      supabase.from('affiliate_commission_events').select('amount_cents').eq('affiliate_id', affiliate.id).eq('status', 'pending_hold'),
      supabase.from('affiliate_commission_events').select('amount_cents').eq('affiliate_id', affiliate.id).eq('status', 'available').is('paid_in_payout_id', null),
      supabase.from('affiliate_commission_events').select('amount_cents').eq('affiliate_id', affiliate.id).eq('status', 'available').not('paid_in_payout_id', 'is', null),
    ]);

    const sum = (rows: { amount_cents: number }[] | null) => (rows || []).reduce((s, e) => s + e.amount_cents, 0);

    return res.status(200).json({
      affiliateCode: affiliate.affiliate_code,
      isActive: affiliate.is_active,
      pixKey: affiliate.pix_key,
      totalEarnedCents: affiliate.total_earned_cents,
      totalPaidCents: affiliate.total_paid_cents,
      pendingHoldCents: sum(pendingEvents),
      availableCents: sum(availableEvents),
      processingPayoutCents: sum(processingEvents),
      activeReferrals: activeCount || 0,
      tier,
      referrals: referrals || [],
    });
  } catch (err: any) {
    console.error('affiliate-me error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /api/affiliate-update-pix — atualiza a chave Pix cadastrada.
export async function handleAffiliateUpdatePix(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Login necessário.' });

  const { pixKey } = req.body || {};
  if (!pixKey || typeof pixKey !== 'string') return res.status(400).json({ error: 'pixKey é obrigatório.' });

  try {
    const affiliate = await getOrCreateAffiliate(user.id);
    await supabase.from('affiliates').update({ pix_key: pixKey, updated_at: new Date().toISOString() }).eq('id', affiliate.id);
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// POST /api/affiliate-request-payout — solicita saque do saldo liberado
// (nunca do saldo em carência). Reserva os eventos para este pedido; o
// pagamento efetivo é feito pelo superadmin (ver admin-referral.ts).
export async function handleAffiliateRequestPayout(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();
  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Login necessário.' });

  const { pixKey } = req.body || {};
  if (!pixKey || typeof pixKey !== 'string') return res.status(400).json({ error: 'Informe a chave Pix para o saque.' });

  try {
    const affiliate = await getOrCreateAffiliate(user.id);

    const [{ data: availableEvents }, { data: settings }] = await Promise.all([
      supabase.from('affiliate_commission_events').select('id, amount_cents').eq('affiliate_id', affiliate.id).eq('status', 'available').is('paid_in_payout_id', null),
      supabase.from('referral_settings').select('min_payout_cents').eq('id', 1).single(),
    ]);

    const eventIds = (availableEvents || []).map(e => e.id);
    const availableCents = (availableEvents || []).reduce((s, e) => s + e.amount_cents, 0);
    const minPayoutCents = settings?.min_payout_cents || 0;

    if (availableCents <= 0) return res.status(400).json({ error: 'Você ainda não tem saldo liberado para saque.' });
    if (availableCents < minPayoutCents) {
      return res.status(400).json({ error: `O saque mínimo é de R$ ${(minPayoutCents / 100).toFixed(2)}. Seu saldo liberado é R$ ${(availableCents / 100).toFixed(2)}.` });
    }

    const { data: payout, error } = await supabase.from('affiliate_payouts').insert({
      affiliate_id: affiliate.id,
      amount_cents: availableCents,
      pix_key: pixKey,
      status: 'requested',
    }).select().single();
    if (error) throw error;

    await supabase.from('affiliate_commission_events')
      .update({ paid_in_payout_id: payout.id })
      .in('id', eventIds);

    return res.status(200).json({ success: true, payout });
  } catch (err: any) {
    console.error('affiliate-request-payout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
