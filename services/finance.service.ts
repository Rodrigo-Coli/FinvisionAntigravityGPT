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
  }
};
