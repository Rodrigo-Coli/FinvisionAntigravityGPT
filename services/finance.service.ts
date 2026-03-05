import { supabase } from '../lib/supabase/client';
import { BankAccount, Transaction, CreditCardDetailed } from '../types';

export const FinanceService = {
  // Contas
  getAccounts: async (): Promise<BankAccount[]> => {
    if (!supabase) return [];

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_archived', false);
    if (error) throw error;
    return (data || []).map((a: any) => ({
      id: a.id,
      institution: a.institution,
      type: a.type,
      currency: a.currency,
      initialBalance: Number(a.initial_balance),
      currentBalance: Number(a.current_balance),
      limit: Number(a.limit),
      color: a.color,
      isArchived: a.is_archived,
      includeInDashboard: a.include_in_dashboard,
      lastSync: a.last_sync
    }));
  },

  createAccount: async (account: Omit<BankAccount, 'id'>): Promise<BankAccount> => {
    if (!supabase) throw new Error('Supabase not configured');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('accounts').insert({
      user_id: user?.id,
      institution: account.institution,
      type: account.type,
      currency: account.currency,
      initial_balance: account.initialBalance,
      current_balance: account.initialBalance,
      limit: account.limit,
      color: account.color,
      include_in_dashboard: account.includeInDashboard
    }).select().single();
    if (error) throw error;
    return { ...account, id: data.id } as BankAccount;
  },

  // Transações
  getTransactions: async (filters?: any): Promise<Transaction[]> => {
    if (!supabase) return [];

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let query = supabase
      .from('transactions')
      .select('*, accounts(institution, name)')
      .eq('user_id', user.id)
      .eq('is_deleted', false)
      .order('date', { ascending: false });

    if (filters?.accountId) query = query.eq('account_id', filters.accountId);

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((t: any) => ({
      id: t.id,
      description: t.description,
      amount: Number(t.amount),
      date: t.date,
      type: t.type,
      accountId: t.account_id,
      accountName: t.accounts?.institution || t.accounts?.name || 'N/A',
      category: t.category,
      isPaid: t.is_paid,
      paidAmount: Number(t.paid_amount),
      paidAt: t.paid_at
    }));
  },

  // Cartões
  getCards: async (): Promise<CreditCardDetailed[]> => {
    if (!supabase) return [];

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_archived', false);
    if (error) throw error;
    return data || [];
  },

  getOrCreateStatement: async (cardId: string, dateStr: string): Promise<string> => {
    if (!supabase) throw new Error('Supabase not configured');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado");

    // 1. Buscar detalhes do cartão
    const { data: card, error: cardErr } = await supabase
      .from('cards')
      .select('*')
      .eq('id', cardId)
      .single();
    if (cardErr) throw cardErr;

    const txDate = new Date(dateStr);
    const day = txDate.getUTCDate();
    const month = txDate.getUTCMonth(); // 0-indexed
    const year = txDate.getUTCFullYear();

    // Determinar mês/ano alvo da fatura
    // Se dia > closing_day, pertence à próxima fatura
    let targetMonth = month;
    let targetYear = year;

    if (day > card.closing_day) {
      targetMonth++;
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear++;
      }
    }

    const stmtMonth = targetMonth + 1; // 1-indexed para o banco
    const stmtYear = targetYear;

    // Verificar se já existe
    const { data: existing } = await supabase
      .from('card_statements')
      .select('id')
      .eq('card_id', cardId)
      .eq('month', stmtMonth)
      .eq('year', stmtYear)
      .maybeSingle();

    if (existing) return existing.id;

    // Criar nova fatura
    const closingDate = new Date(Date.UTC(targetYear, targetMonth, card.closing_day));

    let dueMonth = targetMonth;
    let dueYear = targetYear;
    if (card.due_day < card.closing_day) {
      dueMonth++;
      if (dueMonth > 11) {
        dueMonth = 0;
        dueYear++;
      }
    }
    const dueDate = new Date(Date.UTC(dueYear, dueMonth, card.due_day));

    const { data: newStmt, error: createErr } = await supabase
      .from('card_statements')
      .insert({
        user_id: user.id,
        card_id: cardId,
        month: stmtMonth,
        year: stmtYear,
        status: 'OPEN',
        total_amount: 0,
        paid_amount: 0,
        closing_date: closingDate.toISOString(),
        due_date: dueDate.toISOString()
      })
      .select()
      .single();

    if (createErr) throw createErr;
    return newStmt.id;
  },

  // Entidades (Proprietários)
  getEntities: async (): Promise<string[]> => {
    if (!supabase) return ['Pessoal'];
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return ['Pessoal'];

      const { data, error } = await supabase.from('entities').select('name').eq('user_id', user.id).order('name');
      if (error) {
        // Fallback: se a tabela não existir, busca das transações
        const { data: txData } = await supabase.from('transactions').select('owner_name').not('owner_name', 'is', null);
        return Array.from(new Set(['Pessoal', ...(txData || []).map(t => t.owner_name)])).sort() as string[];
      }
      return Array.from(new Set(['Pessoal', ...(data || []).map((e: any) => e.name)])).sort() as string[];
    } catch (e) {
      return ['Pessoal'];
    }
  },

  ensureEntityExists: async (name: string): Promise<void> => {
    if (!supabase || !name || name === 'Pessoal') return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from('entities').upsert({ user_id: user.id, name }, { onConflict: 'user_id, name' });
      // Se der erro aqui, provavelmente a tabela não existe, ignoramos silenciosamente
      if (error) console.warn("Erro ao garantir entidade:", error);
    } catch (e) { }
  },

  // Categorias
  getCategories: async (): Promise<string[]> => {
    if (!supabase) return [];
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('categories')
        .select('name')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('name');

      if (error) {
        // Fallback
        return ['Alimentação', 'Lazer', 'Moradia', 'Outros', 'Saúde', 'Transporte', 'Salário'].sort();
      }

      const names = (data || []).map((c: any) => c.name);
      // Garantir que temos 'Outros' e 'Conciliação' se necessário
      if (!names.includes('Conciliação')) names.push('Conciliação');
      if (!names.includes('Outros')) names.push('Outros');

      return Array.from(new Set(names)).sort();
    } catch (e) {
      return [];
    }
  },

  ensureCategoryExists: async (name: string): Promise<void> => {
    if (!supabase || !name) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: existing } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', user.id)
        .ilike('name', name)
        .maybeSingle();

      if (!existing) {
        await supabase.from('categories').insert({
          user_id: user.id,
          name,
          is_archived: false,
          color: '#cbd5e1'
        });
      }
    } catch (e) { }
  }
};
