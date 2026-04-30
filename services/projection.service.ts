import { supabase } from '../lib/supabase/client';

export interface MonthProjection {
    monthLabel: string;
    monthKey: string; // YYYY-MM
    projectedIncome: number;
    projectedExpense: number;
    projectedBalance: number;
    isNegative: boolean;
}

export const ProjectionService = {
    getProjectedCashFlow: async (userId: string, currentBalance: number, monthsAhead: number = 6): Promise<MonthProjection[]> => {
        if (!supabase) return [];

        const today = new Date();
        const futureEnd = new Date(today.getFullYear(), today.getMonth() + monthsAhead + 1, 0); 
        
        // 1. Fetch pending transactions already in DB
        const { data: pendingTx, error } = await supabase.from('transactions')
            .select('amount, type, date, recurrence_group_id, is_recurring, recurrence_period')
            .eq('user_id', userId)
            .eq('is_deleted', false)
            .eq('is_paid', false)
            .gte('date', today.toISOString().split('T')[0])
            .lte('date', futureEnd.toISOString().split('T')[0]);

        if (error) {
            console.error('[ProjectionService] Error fetching pending tx:', error);
            throw error;
        }

        // 2. Fetch recurring base transactions to extrapolate
        // We find the latest transaction of each recurrence group to project forward
        const { data: recurringTx, error: recErr } = await supabase.from('transactions')
            .select('amount, type, date, recurrence_group_id, recurrence_period')
            .eq('user_id', userId)
            .eq('is_deleted', false)
            .not('recurrence_period', 'is', null)
            .not('recurrence_group_id', 'is', null);

        if (recErr) {
            console.error('[ProjectionService] Error fetching recurring tx:', recErr);
        }

        const monthlyData: Record<string, { income: number; expense: number }> = {};
        
        // Track which recurrence groups and months are already populated by actual pending DB rows
        const generatedRecurrences = new Set<string>();

        // Process pending explicit transactions
        (pendingTx || []).forEach((t: any) => {
            const key = t.date.substring(0, 7); // YYYY-MM
            if (!monthlyData[key]) monthlyData[key] = { income: 0, expense: 0 };
            
            if (t.type === 'INCOME') monthlyData[key].income += Number(t.amount);
            else monthlyData[key].expense += Number(t.amount);

            if (t.recurrence_group_id) {
                generatedRecurrences.add(`${t.recurrence_group_id}_${key}`);
            }
        });

        // Extrapolate recurring transactions that don't have explicit future rows
        if (recurringTx) {
            // Group by recurrence_group_id and find the latest date
            const latestByGroup: Record<string, any> = {};
            recurringTx.forEach((t: any) => {
                if (!latestByGroup[t.recurrence_group_id] || new Date(t.date) > new Date(latestByGroup[t.recurrence_group_id].date)) {
                    latestByGroup[t.recurrence_group_id] = t;
                }
            });

            // For each group, project forward up to futureEnd
            Object.values(latestByGroup).forEach((baseTx: any) => {
                let currentDate = new Date(baseTx.date);
                
                // If the base transaction is in the past, start projecting from next month
                if (currentDate < today) {
                    currentDate = new Date(today.getFullYear(), today.getMonth(), currentDate.getDate());
                }

                while (currentDate <= futureEnd) {
                    const key = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
                    
                    // Only add if not already explicitly in pendingTx
                    if (!generatedRecurrences.has(`${baseTx.recurrence_group_id}_${key}`)) {
                        if (!monthlyData[key]) monthlyData[key] = { income: 0, expense: 0 };
                        if (baseTx.type === 'INCOME') monthlyData[key].income += Number(baseTx.amount);
                        else monthlyData[key].expense += Number(baseTx.amount);
                        
                        generatedRecurrences.add(`${baseTx.recurrence_group_id}_${key}`);
                    }

                    // Advance date based on recurrence period
                    if (baseTx.recurrence_period === 'monthly') {
                        currentDate.setMonth(currentDate.getMonth() + 1);
                    } else if (baseTx.recurrence_period === 'yearly') {
                        currentDate.setFullYear(currentDate.getFullYear() + 1);
                    } else if (baseTx.recurrence_period === 'weekly') {
                        currentDate.setDate(currentDate.getDate() + 7);
                    } else if (baseTx.recurrence_period === 'biweekly') {
                        currentDate.setDate(currentDate.getDate() + 14);
                    } else {
                        break; // Unsupported period for extrapolation
                    }
                }
            });
        }

        // Build the timeline array
        const result: MonthProjection[] = [];
        let rollingBalance = Number(currentBalance) || 0;

        for (let i = 0; i < monthsAhead; i++) {
            const dt = new Date(today.getFullYear(), today.getMonth() + i, 1);
            const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
            const monthLabel = dt.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. ', '/');

            const inc = monthlyData[key]?.income || 0;
            const exp = monthlyData[key]?.expense || 0;

            rollingBalance = rollingBalance + inc - exp;

            result.push({
                monthLabel,
                monthKey: key,
                projectedIncome: Math.round(inc),
                projectedExpense: Math.round(exp),
                projectedBalance: Math.round(rollingBalance),
                isNegative: rollingBalance < 0
            });
        }
        
        return result;
    }
};
