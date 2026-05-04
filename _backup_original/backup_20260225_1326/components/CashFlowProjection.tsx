import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Activity, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { supabase } from '../lib/supabase/client';

interface MonthProjection {
    month: string;        // e.g. "Mar/25"
    pessimistic: number;
    realistic: number;
    optimistic: number;
    fixedExpenses: number; // known pending installments
    isNegative: boolean;
}

const CashFlowProjection: React.FC<{ userId: string }> = ({ userId }) => {
    const [projections, setProjections] = useState<MonthProjection[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => { if (userId) buildProjection(); }, [userId]);

    const buildProjection = async () => {
        const sb = supabase;
        if (!sb) return;
        setIsLoading(true);
        try {
            // ============================================
            // LAYER 1: Fetch last 6 months of real transactions
            // ============================================
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            const { data: histTx } = await sb.from('transactions')
                .select('amount, type, date, is_recurring')
                .eq('user_id', userId)
                .eq('is_amortization', false)
                .gte('date', sixMonthsAgo.toISOString().split('T')[0])
                .lte('date', new Date().toISOString().split('T')[0]);

            // ============================================
            // LAYER 2: Group by month → weighted average
            // Weights: most recent = 3x, 2nd = 2.5x, 3rd = 2x, 4th = 1.5x, 5th = 1x, 6th = 0.5x
            // ============================================
            const weights = [3, 2.5, 2, 1.5, 1, 0.5];
            const monthlyData: Record<string, { income: number; expense: number }> = {};

            (histTx || []).forEach((t: any) => {
                const key = t.date.substring(0, 7); // YYYY-MM
                if (!monthlyData[key]) monthlyData[key] = { income: 0, expense: 0 };
                if (t.type === 'INCOME') monthlyData[key].income += Number(t.amount);
                else if (t.type === 'EXPENSE') monthlyData[key].expense += Number(t.amount);
            });

            const sortedMonths = Object.keys(monthlyData).sort().reverse(); // most recent first
            let totalWeightIncome = 0, totalWeightExpense = 0, totalWeight = 0;
            sortedMonths.slice(0, 6).forEach((m, i) => {
                const w = weights[i] || 0.5;
                totalWeightIncome += monthlyData[m].income * w;
                totalWeightExpense += monthlyData[m].expense * w;
                totalWeight += w;
            });

            const avgIncome = totalWeight > 0 ? totalWeightIncome / totalWeight : 0;
            const avgVariableExpense = totalWeight > 0 ? totalWeightExpense / totalWeight : 0;

            // Standard deviation for pessimistic/optimistic
            const incomeValues = sortedMonths.slice(0, 6).map(m => monthlyData[m]?.income || 0);
            const stdDevIncome = calcStdDev(incomeValues);

            // ============================================
            // LAYER 3: Known future PENDING installments per month
            // ============================================
            const today = new Date();
            const futureEnd = new Date(today.getFullYear(), today.getMonth() + 12, 0);
            const { data: pendingTx } = await sb.from('transactions')
                .select('amount, date')
                .eq('user_id', userId)
                .eq('is_amortization', true)
                .eq('is_paid', false)
                .gte('date', today.toISOString().split('T')[0])
                .lte('date', futureEnd.toISOString().split('T')[0]);

            const fixedByMonth: Record<string, number> = {};
            (pendingTx || []).forEach((t: any) => {
                const key = t.date.substring(0, 7);
                fixedByMonth[key] = (fixedByMonth[key] || 0) + Number(t.amount);
            });

            // ============================================
            // BUILD 12-MONTH PROJECTIONS
            // ============================================
            const result: MonthProjection[] = [];
            for (let i = 1; i <= 12; i++) {
                const dt = new Date(today.getFullYear(), today.getMonth() + i, 1);
                const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
                const monthLabel = dt.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. ', '/');

                const fixed = fixedByMonth[key] || 0;
                const realistic = avgIncome - avgVariableExpense - fixed;
                const optimistic = (avgIncome + stdDevIncome * 0.5) - (avgVariableExpense * 0.85) - fixed;
                const pessimistic = (avgIncome - stdDevIncome * 0.5) - (avgVariableExpense * 1.15) - fixed;

                result.push({
                    month: monthLabel,
                    pessimistic: Math.round(pessimistic),
                    realistic: Math.round(realistic),
                    optimistic: Math.round(optimistic),
                    fixedExpenses: Math.round(fixed),
                    isNegative: realistic < 0
                });
            }
            setProjections(result);
        } finally { setIsLoading(false); }
    };

    const calcStdDev = (values: number[]) => {
        if (values.length === 0) return 0;
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / values.length;
        return Math.sqrt(variance);
    };

    const fmt = (v: number) => {
        const abs = Math.abs(v);
        if (abs >= 1000) return `${v < 0 ? '-' : ''}R$${Math.round(abs / 1000)}k`;
        return `${v < 0 ? '-' : ''}R$${Math.round(abs)}`;
    };

    const maxAbs = projections.length > 0 ? Math.max(...projections.map(p => Math.abs(p.optimistic)), 100) : 100;
    const negMonths = projections.filter(p => p.isNegative).length;
    const firstNegIdx = projections.findIndex(p => p.isNegative);

    return (
        <div className="bg-white border border-slate-100 rounded-[32px] shadow-sm overflow-hidden">
            <div
                className="px-8 py-5 border-b border-slate-50 flex items-center justify-between cursor-pointer hover:bg-slate-50/30 transition-colors"
                onClick={() => setCollapsed(c => !c)}
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                        <Activity size={18} />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900 text-sm">Projeção de Fluxo de Caixa</h3>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Próximos 12 meses · 3 cenários</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {negMonths > 0 && !isLoading && (
                        <span className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-[9px] font-bold uppercase tracking-widest">
                            {negMonths} {negMonths === 1 ? 'mês negativo' : 'meses negativos'}
                        </span>
                    )}
                    {collapsed ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronUp size={18} className="text-slate-400" />}
                </div>
            </div>

            {!collapsed && (
                <div className="p-8">
                    {isLoading ? (
                        <div className="h-40 flex items-center justify-center text-slate-300"><Activity size={32} className="animate-pulse" /></div>
                    ) : projections.length === 0 ? (
                        <p className="text-center text-slate-400 text-sm py-10">Sem dados históricos suficientes para projeção.</p>
                    ) : (
                        <>
                            {firstNegIdx >= 0 && (
                                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3">
                                    <Info size={16} className="text-red-500 shrink-0" />
                                    <p className="text-xs text-red-700 font-medium">
                                        No cenário realista, {projections[firstNegIdx].month} pode ser seu primeiro mês no vermelho — considere reduzir gastos ou ajustar parcelas.
                                    </p>
                                </div>
                            )}

                            {/* Legend */}
                            <div className="flex gap-4 mb-6 flex-wrap">
                                {[
                                    { label: 'Otimista', color: 'bg-emerald-400' },
                                    { label: 'Realista', color: 'bg-brand-500' },
                                    { label: 'Pessimista', color: 'bg-orange-400' },
                                    { label: 'Parcelas fixas', color: 'bg-red-200' },
                                ].map(l => (
                                    <div key={l.label} className="flex items-center gap-1.5">
                                        <div className={`w-3 h-3 rounded-full ${l.color}`} />
                                        <span className="text-[10px] font-bold text-slate-500">{l.label}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Chart */}
                            <div className="overflow-x-auto">
                                <div className="flex gap-3 min-w-[700px]">
                                    {projections.map((p, i) => {
                                        const realisticH = Math.abs(p.realistic) / maxAbs * 100;
                                        const optimisticH = Math.abs(p.optimistic) / maxAbs * 100;
                                        const pessimisticH = Math.abs(p.pessimistic) / maxAbs * 100;
                                        return (
                                            <div key={i} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                                                <span className={`text-[8px] font-bold mb-1 ${p.isNegative ? 'text-red-500' : 'text-emerald-600'}`}>
                                                    {fmt(p.realistic)}
                                                </span>
                                                <div className="w-full flex gap-0.5 items-end h-24">
                                                    <div className={`flex-1 rounded-t-lg transition-all ${p.isNegative ? 'bg-orange-400' : 'bg-orange-100'}`} style={{ height: `${pessimisticH}%` }} />
                                                    <div className={`flex-1 rounded-t-lg transition-all ${p.isNegative ? 'bg-red-500' : 'bg-brand-500'}`} style={{ height: `${realisticH}%` }} />
                                                    <div className={`flex-1 rounded-t-lg transition-all ${p.isNegative ? 'bg-red-200' : 'bg-emerald-400'}`} style={{ height: `${optimisticH}%` }} />
                                                </div>
                                                <span className="text-[8px] font-bold text-slate-400 text-center leading-tight">{p.month}</span>
                                                {p.fixedExpenses > 0 && (
                                                    <span className="text-[7px] text-red-400 font-bold">{fmt(p.fixedExpenses)}</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default CashFlowProjection;
