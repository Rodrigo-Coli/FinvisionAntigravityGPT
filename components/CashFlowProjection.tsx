import React, { useState, useEffect } from 'react';
import { Activity, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { supabase } from '../lib/supabase/client';

interface MonthProjection {
    monthLabel: string;
    projectedIncome: number;
    projectedExpense: number;
    projectedBalance: number;
    isNegative: boolean;
}

const CashFlowProjection: React.FC<{ userId: string, currentBalance: number }> = ({ userId, currentBalance }) => {
    const [projections, setProjections] = useState<MonthProjection[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => { if (userId) buildProjection(); }, [userId, currentBalance]);

    const buildProjection = async () => {
        const sb = supabase;
        if (!sb) return;
        setIsLoading(true);
        try {
            // Get all pending future transactions (including installments)
            const today = new Date();
            const futureEnd = new Date(today.getFullYear(), today.getMonth() + 7, 0); // Next 6 months + current
            const { data: pendingTx } = await sb.from('transactions')
                .select('amount, type, date')
                .eq('user_id', userId)
                .eq('is_paid', false)
                .gte('date', today.toISOString().split('T')[0])
                .lte('date', futureEnd.toISOString().split('T')[0]);

            const monthlyData: Record<string, { income: number; expense: number }> = {};
            (pendingTx || []).forEach((t: any) => {
                const key = t.date.substring(0, 7); // YYYY-MM
                if (!monthlyData[key]) monthlyData[key] = { income: 0, expense: 0 };
                if (t.type === 'INCOME') monthlyData[key].income += Number(t.amount);
                else monthlyData[key].expense += Number(t.amount);
            });

            // Iterate through the next 6 months
            const result: MonthProjection[] = [];
            let rollingBalance = currentBalance;

            for (let i = 0; i < 6; i++) {
                const dt = new Date(today.getFullYear(), today.getMonth() + i, 1);
                const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
                const monthLabel = dt.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. ', '/');

                const inc = monthlyData[key]?.income || 0;
                const exp = monthlyData[key]?.expense || 0;

                // For the current month (i===0), the rolling balance represents the end-of-month projected balance, 
                // which is currentBalance + pendingIncome - pendingExpense
                rollingBalance = rollingBalance + inc - exp;

                result.push({
                    monthLabel,
                    projectedIncome: Math.round(inc),
                    projectedExpense: Math.round(exp),
                    projectedBalance: Math.round(rollingBalance),
                    isNegative: rollingBalance < 0
                });
            }
            setProjections(result);
        } finally { setIsLoading(false); }
    };

    const fmt = (v: number) => {
        const abs = Math.abs(v);
        if (abs >= 1000) return `${v < 0 ? '-' : ''}R$${(abs / 1000).toFixed(1)}k`;
        return `${v < 0 ? '-' : ''}R$${Math.round(abs)}`;
    };

    const maxExp = projections.length > 0 ? Math.max(...projections.map(p => Math.abs(p.projectedExpense)), 100) : 100;
    const maxInc = projections.length > 0 ? Math.max(...projections.map(p => Math.abs(p.projectedIncome)), 100) : 100;
    const maxBar = Math.max(maxExp, maxInc);

    const negMonths = projections.filter(p => p.isNegative).length;
    const firstNegIdx = projections.findIndex(p => p.isNegative);

    return (
        <div className="bg-white border border-slate-100 rounded-[24px] sm:rounded-[32px] shadow-sm overflow-hidden">
            <div
                className="px-4 sm:px-8 py-4 sm:py-5 border-b border-slate-50 flex items-start sm:items-center justify-between cursor-pointer hover:bg-slate-50/30 transition-colors gap-3"
                onClick={() => setCollapsed(c => !c)}
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <Activity size={18} />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900 text-sm">Projeção de Caixa Real</h3>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Baseado no Saldo + Pendências (6 meses)</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                    {negMonths > 0 && !isLoading && (
                        <span className="px-2 sm:px-3 py-1 bg-red-50 text-red-600 rounded-lg text-[8px] sm:text-[9px] font-bold uppercase tracking-widest">
                            {negMonths} {negMonths === 1 ? 'mês projetado negativo' : 'meses projetados no vermelho'}
                        </span>
                    )}
                    {collapsed ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronUp size={18} className="text-slate-400" />}
                </div>
            </div>

            {!collapsed && (
                <div className="p-4 sm:p-8">
                    {isLoading ? (
                        <div className="h-40 flex items-center justify-center text-slate-300"><Activity size={32} className="animate-pulse" /></div>
                    ) : projections.length === 0 ? (
                        <p className="text-center text-slate-400 text-sm py-10">Sem lançamentos programados para o futuro.</p>
                    ) : (
                        <>
                            {firstNegIdx >= 0 && (
                                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3">
                                    <Info size={16} className="text-red-500 shrink-0" />
                                    <p className="text-xs text-red-700 font-medium">
                                        Seu saldo consolidado pode ficar negativo em <strong>{projections[firstNegIdx].monthLabel}</strong> considerando os gastos já programados.
                                    </p>
                                </div>
                            )}

                            {/* Chart - responsive: no min-width, bars adapt to screen */}
                            <div className="w-full">
                                <div className="flex gap-2 sm:gap-4 items-end justify-between h-48 sm:h-56 pt-8 sm:pt-10">
                                    {projections.map((p, i) => {
                                        const incH = Math.max((p.projectedIncome / maxBar) * 100, 2);
                                        const expH = Math.max((p.projectedExpense / maxBar) * 100, 2);
                                        return (
                                            <div key={i} className="flex-1 min-w-0 flex flex-col items-center gap-2 sm:gap-3 relative group">
                                                {/* Tooltip Hover */}
                                                <div className="absolute -top-12 opacity-0 group-hover:opacity-100 bg-brand-900 text-white p-2 rounded-lg text-[10px] whitespace-nowrap z-10 transition-opacity pointer-events-none shadow-xl">
                                                    <div className="font-bold border-b border-white/10 pb-1 mb-1">{p.monthLabel}</div>
                                                    <div className="text-emerald-400">Receitas: {fmt(p.projectedIncome)}</div>
                                                    <div className="text-rose-400">Despesas: {fmt(p.projectedExpense)}</div>
                                                    <div className="text-slate-200 font-bold mt-1 pt-1 border-t border-white/10">Saldo: {fmt(p.projectedBalance)}</div>
                                                </div>

                                                {/* Projected Balance Top Label */}
                                                <span className={`text-[9px] sm:text-[10px] font-black leading-tight ${p.isNegative ? 'text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded-full' : 'text-slate-600'}`}>
                                                    {fmt(p.projectedBalance)}
                                                </span>

                                                <div className="w-full flex gap-0.5 sm:gap-1 items-end h-28 sm:h-32 justify-center">
                                                    {/* Income Bar */}
                                                    <div className="w-3 sm:w-6 rounded-t-md transition-all bg-emerald-400 hover:bg-emerald-500" style={{ height: `${incH}%` }} />
                                                    {/* Expense Bar */}
                                                    <div className="w-3 sm:w-6 rounded-t-md transition-all bg-rose-400 hover:bg-rose-500" style={{ height: `${expH}%` }} />
                                                </div>
                                                <span className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center truncate w-full">{p.monthLabel}</span>
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
