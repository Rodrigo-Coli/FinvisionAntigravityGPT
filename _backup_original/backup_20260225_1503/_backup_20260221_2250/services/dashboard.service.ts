import { supabase } from '../lib/supabase/client';
import { DashboardData } from '../types';

export const DashboardService = {
  getSummary: async (): Promise<DashboardData> => {
    if (!supabase) throw new Error('Supabase not configured');

    const { data: { user } } = await supabase.auth.getUser();

    // --- DEV MODE MOCK DATA ---
    if (!user || user.id === 'dev-user' || window.location.href.includes('dev=true')) {
      return {
        consolidatedBalance: 125430.20,
        netWorth: 450200.50,
        creditCards: [
          { brand: 'Mastercard Black', current: 12500.00, forecasted: 15000, color: 'bg-slate-900' },
          { brand: 'Visa Infinite', current: 8400.50, forecasted: 9000, color: 'bg-brand-600' }
        ],
        alerts: [],
        goals: [],
        cashFlow: [],
        assets: []
      };
    }

    // 1. Consolidated Balance & Net Worth from Accounts
    const { data: accounts, error: accErr } = await supabase
      .from('accounts')
      .select('current_balance, type')
      .eq('user_id', user.id)
      .eq('is_archived', false);

    if (accErr) throw accErr;

    let consolidatedBalance = 0;
    let netWorth = 0;

    (accounts || []).forEach((acc: any) => {
      const balance = Number(acc.current_balance || 0);
      netWorth += balance;
      if (['CHECKING', 'SAVINGS', 'CASH'].includes(acc.type)) {
        consolidatedBalance += balance;
      }
    });

    // 2. Credit Cards Summary
    const { data: cards, error: cardErr } = await supabase
      .from('cards')
      .select('id, brand, name')
      .eq('user_id', user.id)
      .eq('is_archived', false);

    if (cardErr) throw cardErr;

    // We'll need the current statements for these cards
    const creditCardsSummary = await Promise.all((cards || []).map(async (card: any) => {
      const { data: stmt } = await supabase
        .from('card_statements')
        .select('total_amount, paid_amount')
        .eq('card_id', card.id)
        .in('status', ['OPEN', 'DUE', 'PENDING'])
        .order('due_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      const total = Number(stmt?.total_amount || 0);
      const paid = Number(stmt?.paid_amount || 0);

      return {
        brand: card.name || card.brand,
        current: total - paid,
        forecasted: total, // Simple forecast for now
        color: card.brand.toLowerCase().includes('visa') ? 'bg-brand-600' : 'bg-slate-900'
      };
    }));

    return {
      consolidatedBalance,
      netWorth,
      creditCards: creditCardsSummary,
      alerts: [], // Real alerts feature to be implemented
      goals: [],  // Real goals feature to be implemented
      cashFlow: [
        { month: 'Set', income: 12000, expense: 8500 },
        { month: 'Out', income: 13500, expense: 9200 },
        { month: 'Nov', income: 12800, expense: 8800 },
        { month: 'Dez', income: 15000, expense: 11000 },
        { month: 'Jan', income: 14200, expense: 9500 },
        { month: 'Fev', income: 16800, expense: 9800 },
      ],
      assets: [
        { name: 'Conta Corrente', value: consolidatedBalance, color: '#3b82f6' },
        { name: 'Investimentos', value: netWorth - consolidatedBalance, color: '#8b5cf6' },
        { name: 'Imóveis', value: 0, color: '#10b981' },
      ],
    };
  },

  refreshBalance: async (): Promise<number> => {
    // This could trigger a sync in the future
    return 0;
  }
};
