import { supabase } from '../lib/supabase/client';
import { DashboardData } from '../types';

export const DashboardService = {
  getSummary: async (): Promise<DashboardData> => {
    const sb = supabase;
    if (!sb) return { consolidatedBalance: 0, netWorth: 0, creditCards: [], alerts: [], goals: [], cashFlow: [], assets: [] };

    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { consolidatedBalance: 0, netWorth: 0, creditCards: [], alerts: [], goals: [], cashFlow: [], assets: [] };


    // 1. Accounts
    const { data: accounts, error: accErr } = await sb
      .from('accounts')
      .select('current_balance, type')
      .eq('user_id', user.id)
      .eq('is_archived', false);

    if (accErr) throw accErr;

    let consolidatedBalance = 0;
    let netWorth = 0;
    let totalAssets = 0;

    (accounts || []).forEach((acc: any) => {
      const balance = Number(acc.current_balance || 0);
      netWorth += balance;
      totalAssets += balance;
      if (['CHECKING', 'SAVINGS', 'CASH'].includes(acc.type)) {
        consolidatedBalance += balance;
      }
    });

    // 2. Credit Cards Summary
    const { data: cards, error: cardErr } = await sb
      .from('cards')
      .select('id, brand, name, limit_total')
      .eq('user_id', user.id)
      .eq('is_archived', false);

    const creditCardsSummary = !cardErr && cards ? await Promise.all(cards.map(async (card: any) => {
      const { data: stmt } = await sb
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
        forecasted: total,
        limit: Number(card.limit_total || 0),
        color: card.brand.toLowerCase().includes('visa') ? 'bg-brand-600' : 'bg-slate-900'
      };
    })) : [];

    // 3. Physical Assets
    const { data: physicalAssets, error: physErr } = await sb
      .from('physical_assets')
      .select('estimated_value, category')
      .eq('user_id', user.id);

    if (!physErr && physicalAssets) {
      physicalAssets.forEach((asset: any) => {
        const val = Number(asset.estimated_value || 0);
        netWorth += val;
        totalAssets += val;
      });
    }

    // 4. Cash Flow & Metrics
    const { data: txs, error: txsErr } = await sb
      .from('transactions')
      .select('date, amount, type')
      .eq('user_id', user.id)
      .eq('is_deleted', false)
      .gte('date', new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString());

    const cashFlow: any[] = [];
    let totalExpenses = 0;
    let lastMonthExpenses = 0;
    const now = new Date();
    const currentMonth = now.getUTCMonth();
    const lastMonth = (currentMonth - 1 + 12) % 12;

    if (!txsErr && txs) {
      const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const grouped = txs.reduce((acc: any, tx: any) => {
        const txDate = new Date(tx.date);
        const m = txDate.getUTCMonth();
        const key = months[m];
        if (!acc[key]) acc[key] = { month: key, income: 0, expense: 0 };

        const val = Number(tx.amount || 0);
        if (tx.type === 'INCOME') {
          acc[key].income += val;
        } else if (tx.type === 'EXPENSE' || tx.type === 'BILL_PAYMENT') {
          acc[key].expense += val;
          if (m === currentMonth) totalExpenses += val;
          if (m === lastMonth) lastMonthExpenses += val;
        }
        return acc;
      }, {});

      const today = new Date().getUTCMonth();
      for (let i = 5; i >= 0; i--) {
        const mIdx = (today - i + 12) % 12;
        const key = months[mIdx];
        cashFlow.push(grouped[key] || { month: key, income: 0, expense: 0 });
      }
    }

    // 5. Assets Summary
    const assetsSummary = [
      { name: 'Conta Corrente', value: Number(consolidatedBalance || 0), color: '#3b82f6' },
      { name: 'Investimentos', value: (accounts || []).filter(a => a.type === 'INVESTMENT').reduce((s, a) => s + Number(a.current_balance || 0), 0), color: '#8b5cf6' },
      { name: 'Bens Físicos', value: (physicalAssets || []).reduce((s, a) => s + Number(a.estimated_value || 0), 0), color: '#10b981' },
    ];

    // 6. Net Worth Growth (comparing to previous month)
    // This would require storing historical net worth or calculating it from historical data.
    // For now, we'll return 0 or a placeholder.
    const netWorthGrowth = 0;

    // 7. Liabilities (Debts/Passivos)
    const { data: liabilitiesData, error: liabErr } = await sb
      .from('liabilities')
      .select('remaining_balance, type')
      .eq('user_id', user.id);

    let totalLiabilities = 0;
    if (!liabErr && liabilitiesData) {
      liabilitiesData.forEach((liab: any) => {
        totalLiabilities += Number(liab.remaining_balance || 0);
      });
      netWorth -= totalLiabilities; // Net Worth = Assets - Liabilities
    }

    // 8. Smart Alerts Generation
    const smartAlerts: any[] = [];
    if (consolidatedBalance < 1000) {
      smartAlerts.push({ id: 'low-bal', type: 'warning', message: 'Atenção: Saldo consolidado abaixo de R$ 1.000', createdAt: new Date().toISOString() });
    }
    creditCardsSummary.forEach(c => {
      if (c.limit > 0 && c.current / c.limit > 0.8) {
        smartAlerts.push({ id: `cc-high-${c.brand}`, type: 'critical', message: `Cartão ${c.brand} com mais de 80% do limite utilizado`, createdAt: new Date().toISOString() });
      }
    });

    return {
      consolidatedBalance: Number(consolidatedBalance || 0),
      netWorth: Number(netWorth || 0),
      totalAssets: Number(totalAssets || 0),
      totalLiabilities: Number(totalLiabilities || 0),
      creditCards: creditCardsSummary,
      alerts: smartAlerts,
      goals: [],
      cashFlow,
      assets: assetsSummary,
      totalExpenses: Number(totalExpenses || 0),
      netWorthGrowth: Number(netWorthGrowth || 0)
    };
  },

  refreshBalance: async (): Promise<number> => {
    // This could trigger a sync in the future
    return 0;
  }
};
