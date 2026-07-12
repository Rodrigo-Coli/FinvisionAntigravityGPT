import { createClient } from '@supabase/supabase-js';
import { createAffiliateWithTerms } from './referral.service.js';
import { REFERRAL_TERMS_VERSION } from '../../lib/referralTerms.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

// POST /api/affiliate-accept-terms — único jeito de virar afiliado (gera o
// código). Exige aceite explícito; o servidor sempre carimba a versão atual
// dos termos (o cliente não escolhe qual versão "aceitou").
export async function handleAffiliateAcceptTerms(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login necessário (token ausente).' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });

  try {
    const affiliate = await createAffiliateWithTerms(user.id, REFERRAL_TERMS_VERSION);
    return res.status(200).json({ success: true, affiliateCode: affiliate.affiliate_code, termsVersion: REFERRAL_TERMS_VERSION });
  } catch (err: any) {
    console.error('affiliate-accept-terms error:', err);
    return res.status(500).json({ error: err.message });
  }
}
