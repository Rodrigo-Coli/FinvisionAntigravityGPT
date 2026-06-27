import { supabase } from '../lib/supabase/client';
import { DashboardData } from '../types';
import { projectionService } from './projection.service';

export const DashboardService = {
  getSummary: async (): Promise<DashboardData> => {
    const sb = supabase;
    if (!sb) return { consolidatedBalance: 0, netWorth: 0, creditCards: [], alerts: [], goals: [], cashFlow: [], assets: [] };

    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { consolidatedBalance: 0, netWorth: 0, creditCards: [], alerts: [], goals: [], cashFlow: [], assets: [] };


    // 1. Fetch all core data in parallel using Promise.all
    const [
      accountsRes,
      cardsRes,
      physRes,
      entitiesRes,
      txsRes,
      liabsRes,
      futureTxsRes
    ] = await Promise.all([
      sb.from('accounts').select('current_balance, type, include_in_dashboard').eq('user_id', user.id).eq('is_archived', false),
      sb.from('cards').select('id, brand, name, limit_total, last4, is_additional, parent_card_id, sums_into_invoice').eq('user_id', user.id).eq('is_archived', false),
      sb.from('physical_assets').select('estimated_value, category').eq('user_id', user.id),
      sb.from('entities').select('name').eq('user_id', user.id).eq('include_in_totals', false),
      sb.from('transactions').select('date, amount, type, owner_name, metadata').eq('user_id', user.id).eq('is_deleted', false).gte('date', new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString()),
      sb.from('liabilities').select('*').eq('user_id', user.id),
      sb.from('transactions').select('*').eq('user_id', user.id).eq('is_deleted', false).or(`date.gte.${new Date().toISOString()},is_recurring.eq.true`)
    ]);

    if (accountsRes.error) throw accountsRes.error;

    const accounts = accountsRes.data || [];
    const cards = cardsRes.data || [];
    const physicalAssets = physRes.data || [];
    const excludedEntities = entitiesRes.data || [];
    const txs = txsRes.data || [];
    const liabilitiesData = liabsRes.data || [];
    const futureTxs = futureTxsRes.data || [];

    let consolidatedBalance = 0;
    let netWorth = 0;
    let totalAssets = 0;

    accounts.forEach((acc: any) => {
      if (acc.include_in_dashboard === false) return; // Ignores private/registration accounts

      const balance = Number(acc.current_balance || 0);
      netWorth += balance;
      totalAssets += balance;
      if (['CHECKING', 'SAVINGS', 'CASH'].includes((acc.type || '').toUpperCase())) {
        consolidatedBalance += balance;
      }
    });

    // 2. Credit Cards Summary
    // Mostra apenas cartões titulares + adicionais com fatura separada.
    // Adicionais que somam na fatura do titular já estão contabilizados no principal.
    const displayCards = cards.filter((c: any) => !c.is_additional || c.sums_into_invoice === false);
    const creditCardsSummary = displayCards.length > 0 ? await Promise.all(displayCards.map(async (card: any) => {
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
        last4: card.last4 || '0000',
        color: card.brand.toLowerCase().includes('visa') ? 'bg-brand-600' : 'bg-slate-900'
      };
    })) : [];

    // 3. Physical Assets mapping
    physicalAssets.forEach((asset: any) => {
      const val = Number(asset.estimated_value || 0);
      netWorth += val;
      totalAssets += val;
    });

    const excludedSet = new Set((excludedEntities || []).map((e: any) => e.name));

    // 4. Cash Flow & Metrics
    const cashFlow: any[] = [];
    let totalExpenses = 0;
    let lastMonthExpenses = 0;
    const now = new Date();
    const currentMonth = now.getUTCMonth();
    const lastMonth = (currentMonth - 1 + 12) % 12;
 
    if (txs) {
      const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const grouped = txs.reduce((acc: any, tx: any) => {
        if (tx.owner_name && excludedSet.has(tx.owner_name)) return acc;
        if (tx.metadata?.is_historical === true || tx.metadata?.is_historical === 'true') return acc;
        if (tx.metadata?.isCapitalized === true || tx.metadata?.type === 'asset_purchase') return acc;
 
        // tx.date is usually YYYY-MM-DD
        const datePart = tx.date.split('T')[0];
        const [y, mStr, d] = datePart.split('-');
        const m = parseInt(mStr) - 1; // 0-indexed
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
      { name: 'Investimentos', value: (accounts || []).filter((a: any) => a.type === 'INVESTMENT').reduce((s: any, a: any) => s + Number(a.current_balance || 0), 0), color: '#8b5cf6' },
      { name: 'Bens Físicos', value: (physicalAssets || []).reduce((s: any, a: any) => s + Number(a.estimated_value || 0), 0), color: '#10b981' },
    ];

    // 6. Net Worth Growth (comparing to previous month)
    // This would require storing historical net worth or calculating it from historical data.
    // For now, we'll return 0 or a placeholder.
    const netWorthGrowth = 0;

    // 7. Liabilities (Debts/Passivos)
    let totalLiabilities = 0;
    const liabilitiesForProj: any[] = [];
    const realEstateLiabilitiesForProj: any[] = [];
    if (liabilitiesData) {
      liabilitiesData.forEach((liab: any) => {
        totalLiabilities += Number(liab.remaining_balance || 0);
        liabilitiesForProj.push({
          ...liab,
          installmentAmount: Number(liab.installment_amount || 0),
          installmentsRemaining: Number(liab.installments_remaining || 0)
        });
        
        if (liab.type === 'MORTGAGE' || liab.metadata?.isRealEstate) {
          realEstateLiabilitiesForProj.push({
             ...liab,
             installmentAmount: Number(liab.installment_amount || 0),
             installments_count: Number(liab.installments_remaining || 0),
             indexation_rate: Number(liab.metadata?.indexationRate || 0),
             balloon_payments: liab.metadata?.balloons || []
          });
        }
      });
      netWorth -= totalLiabilities; // Net Worth = Assets - Liabilities
    }

    // 7.5 Projected Cash Flow (Advanced Engine)
    const filteredFutureTxs = (futureTxs || []).filter((tx: any) => {
      if (tx.owner_name && excludedSet.has(tx.owner_name)) return false;
      if (tx.metadata?.is_historical === true || tx.metadata?.is_historical === 'true') return false;
      return true;
    });

    const projectedCashFlow = projectionService.calculateFutureCashFlow(
      consolidatedBalance,
      filteredFutureTxs,
      liabilitiesForProj,
      realEstateLiabilitiesForProj,
      12 // project next 12 months
    );

    // 8. Smart Alerts Generation
    const smartAlerts: any[] = [];
    if (consolidatedBalance < 1000) {
      smartAlerts.push({ id: 'low-bal', type: 'warning', message: 'Atenção: Saldo consolidado abaixo de R$ 1.000', createdAt: new Date().toISOString() });
    }
    creditCardsSummary.forEach((c: any) => {
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
      netWorthGrowth: Number(netWorthGrowth || 0),
      projectedCashFlow
    };
  },

  getCachedSummary: (): DashboardData | null => {
    const cached = localStorage.getItem('finvision_dashboard_summary');
    if (!cached) return null;
    try {
      return JSON.parse(cached);
    } catch (e) {
      return null;
    }
  },

  setCachedSummary: (data: DashboardData): void => {
    localStorage.setItem('finvision_dashboard_summary', JSON.stringify(data));
  },

  refreshBalance: async (): Promise<number> => {
    // This could trigger a sync in the future
    return 0;
  }
};
