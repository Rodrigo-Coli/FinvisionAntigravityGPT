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

  // Só uma conta DEMO pode ser promovida. Sem isto, qualquer usuário logado
  // trocava o próprio e-mail para um endereço de terceiro sem confirmação.
  const currentEmail = String(userData.user.email || '').toLowerCase();
  if (!/^demo\+.*@finvision\.app$/.test(currentEmail)) {
    return res.status(403).json({ error: 'Esta ação só está disponível para contas de demonstração.' });
  }
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'E-mail inválido.' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
  }

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

  // A conta real nasce ZERADA: os dados de exemplo do demo (contas, cartões,
  // lançamentos, metas, orçamentos, bens, dívidas, importações e cupons) são
  // apagados aqui. Antes eles ficavam na conta promovida, e o usuário novo
  // começava com o "Apartamento Pinheiros" e o salário fictício.
  const wipe = await clearDemoData(userId);
  if (wipe.errors.length) console.error('[promote-demo] Falha ao limpar dados demo:', wipe.errors);

  return res.status(200).json({ success: true, cleared: wipe.errors.length === 0 });
}

async function clearDemoData(userId: string): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  const del = async (table: string, column = 'user_id', value: any = userId) => {
    const { error } = await supabaseAdmin.from(table).delete().eq(column, value);
    if (error) errors.push(`${table}: ${error.message}`);
  };

  // Ordem respeita as chaves estrangeiras (filhos antes dos pais).
  await del('transaction_splits');
  await del('transactions');
  await del('card_transactions');
  await del('card_statements');
  await del('cards');
  await del('imported_transactions');
  await del('imports');
  await del('product_prices');
  await del('ai_document_items');
  await del('ai_documents');
  await del('products');
  await del('budgets');
  await del('goals');
  await del('liabilities');

  const { data: assets } = await supabaseAdmin.from('physical_assets').select('id').eq('user_id', userId);
  const assetIds = (assets || []).map((a: any) => a.id);
  if (assetIds.length) {
    const { error } = await supabaseAdmin.from('investment_reminders').delete().in('asset_id', assetIds);
    if (error) errors.push(`investment_reminders: ${error.message}`);
  }
  await del('physical_assets');
  await del('accounts');
  return { errors };
}
