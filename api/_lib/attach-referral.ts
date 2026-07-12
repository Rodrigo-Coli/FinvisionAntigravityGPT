import { createClient } from '@supabase/supabase-js';
import { attachReferral } from './referral.service.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

// Chamada pelo front logo após o cadastro (Signup.tsx), quando a URL trazia
// ?ref=CODIGO. Resolve e trava os termos da indicação no servidor — o
// cliente nunca informa percentual/duração diretamente.
export async function handleAttachReferral(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  if (!token) return res.status(401).json({ error: 'Login necessário (token ausente).' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });

  const { affiliateCode } = req.body || {};
  if (!affiliateCode) return res.status(400).json({ error: 'affiliateCode é obrigatório.' });

  try {
    const result = await attachReferral(user.id, affiliateCode);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('attach-referral error:', err);
    return res.status(500).json({ error: err.message });
  }
}
