import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy'
);

export async function handlePromoteDemo(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email e password são obrigatórios.' });
  }

  // Verifica o JWT do usuário para saber qual conta atualizar
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Sessão inválida.' });
  }

  const userId = userData.user.id;

  // Usa o admin para atualizar — ignora validação do e-mail temporário
  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email,
    password,
    email_confirm: true
  });

  if (updateErr) {
    console.error('[promote-demo] Erro ao atualizar usuário:', updateErr.message);
    return res.status(400).json({ error: updateErr.message });
  }

  // Atualiza o perfil com o e-mail real
  await supabaseAdmin.from('profiles').update({ email }).eq('id', userId);

  return res.status(200).json({ success: true });
}
