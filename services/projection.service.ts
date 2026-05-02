import { supabase } from '../lib/supabase/client';
import { CashFlowProjectionItem } from '../types';

export const projectionService = {
  // Novo método async para o Dashboard
  getProjectedCashFlow: async (userId: string, currentBalance: number, monthsAhead: number = 12): Promise<CashFlowProjectionItem[]> => {
    if (!supabase) return [];

    const today = new Date();
    const futureEnd = new Date(today.getFullYear(), today.getMonth() + monthsAhead + 1, 0); 
    
    const { data: pendingTx } = await supabase.from('transactions')
        .select('amount, type, date, recurrence_group_id, recurrence_period')
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .eq('is_paid', false)
        .gte('date', today.toISOString().split('T')[0])
        .lte('date', futureEnd.toISOString().split('T')[0]);

    const { data: recurringTx } = await supabase.from('transactions')
        .select('amount, type, date, recurrence_group_id, recurrence_period')
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .not('recurrence_period', 'is', null)
        .not('recurrence_group_id', 'is', null);

    const { data: cardStatements } = await supabase.from('card_statements')
        .select('total_amount, paid_amount, due_date')
        .eq('user_id', userId)
        .neq('status', 'PAID')
        .gte('due_date', today.toISOString().split('T')[0])
        .lte('due_date', futureEnd.toISOString().split('T')[0]);

    const { data: liabilitiesTx } = await supabase.from('liabilities')
        .select('installment_amount, type, remaining_balance')
        .eq('user_id', userId);

    const monthlyData: Record<string, { income: number; expense: number; recurringIncome: number; recurringExpense: number; liabilityPayments: number; balloonPayments: number }> = {};
    const generatedRecurrences = new Set<string>();

    for (let i = 0; i < monthsAhead; i++) {
        const dt = new Date(today.getFullYear(), today.getMonth() + i, 1);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[key] = { income: 0, expense: 0, recurringIncome: 0, recurringExpense: 0, liabilityPayments: 0, balloonPayments: 0 };
    }

    (pendingTx || []).forEach((t: any) => {
        const key = t.date.substring(0, 7);
        if (!monthlyData[key]) return;
        if (t.type === 'INCOME') monthlyData[key].income += Number(t.amount);
        else monthlyData[key].expense += Number(t.amount);
        if (t.recurrence_group_id) generatedRecurrences.add(`${t.recurrence_group_id}_${key}`);
    });

    if (recurringTx) {
        const latestByGroup: Record<string, any> = {};
        recurringTx.forEach((t: any) => {
            if (!latestByGroup[t.recurrence_group_id] || new Date(t.date) > new Date(latestByGroup[t.recurrence_group_id].date)) {
                latestByGroup[t.recurrence_group_id] = t;
            }
        });
        Object.values(latestByGroup).forEach((baseTx: any) => {
            let currentDate = new Date(baseTx.date);
            if (currentDate < today) currentDate = new Date(today.getFullYear(), today.getMonth(), currentDate.getDate());
            while (currentDate <= futureEnd) {
                const key = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
                if (!generatedRecurrences.has(`${baseTx.recurrence_group_id}_${key}`) && monthlyData[key]) {
                    if (baseTx.type === 'INCOME') monthlyData[key].recurringIncome += Number(baseTx.amount);
                    else monthlyData[key].recurringExpense += Number(baseTx.amount);
                    generatedRecurrences.add(`${baseTx.recurrence_group_id}_${key}`);
                }
                if (baseTx.recurrence_period === 'monthly') currentDate.setMonth(currentDate.getMonth() + 1);
                else if (baseTx.recurrence_period === 'yearly') currentDate.setFullYear(currentDate.getFullYear() + 1);
                else if (baseTx.recurrence_period === 'weekly') currentDate.setDate(currentDate.getDate() + 7);
                else break; 
            }
        });
    }

    (cardStatements || []).forEach((stmt: any) => {
        const key = stmt.due_date.substring(0, 7);
        if (monthlyData[key]) {
            const remaining = Number(stmt.total_amount) - Number(stmt.paid_amount || 0);
            if (remaining > 0) monthlyData[key].expense += remaining;
        }
    });

    const result: CashFlowProjectionItem[] = [];
    let rollingBalance = Number(currentBalance) || 0;
    for (let i = 0; i < monthsAhead; i++) {
        const dt = new Date(today.getFullYear(), today.getMonth() + i, 1);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        const label = dt.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. ', '/');
        const md = monthlyData[key] || { income: 0, expense: 0, recurringIncome: 0, recurringExpense: 0, liabilityPayments: 0, balloonPayments: 0 };
        const startingBalance = rollingBalance;
        rollingBalance = rollingBalance + (md.income + md.recurringIncome) - (md.expense + md.recurringExpense + md.liabilityPayments + md.balloonPayments);
        result.push({
            date: key, label, startingBalance,
            projectedIncome: md.income, recurringIncome: md.recurringIncome,
            projectedExpense: md.expense, recurringExpense: md.recurringExpense,
            liabilityPayments: md.liabilityPayments, balloonPayments: md.balloonPayments,
            endingBalance: rollingBalance
        });
    }
    return result;
  },

  // Mantendo compatibilidade com o DashboardService antigo
  calculateFutureCashFlow: (currentBalance: number, futureTxs: any[], liabilities: any[], realEstate: any[], months: number = 12): CashFlowProjectionItem[] => {
    // Implementação básica síncrona para não quebrar o dashboard enquanto ele carrega o resumo
    const result: CashFlowProjectionItem[] = [];
    let rolling = currentBalance;
    const now = new Date();
    for (let i = 0; i < months; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        result.push({
            date: d.toISOString().substring(0, 7), label,
            startingBalance: rolling, projectedIncome: 0, recurringIncome: 0,
            projectedExpense: 0, recurringExpense: 0, liabilityPayments: 0, balloonPayments: 0,
            endingBalance: rolling
        });
    }
    return result;
  }
};

export const ProjectionService = projectionService;
