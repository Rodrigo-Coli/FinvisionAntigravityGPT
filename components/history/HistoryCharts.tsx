import React, { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, PieChart, BarChart3, Activity } from 'lucide-react';
import { Transaction } from '../../types';
import { HistoryUtils } from '../../lib/historyUtils';

interface HistoryChartsProps {
    transactions: Transaction[];
}

const CATEGORY_COLORS: Record<string, string> = {
    'Moradia': '#3b82f6',
    'Alimentação': '#fbbf24',
    'Transporte': '#a855f7',
    'Saúde': '#ef4444',
    'Lazer': '#ec4899',
    'Educação': '#06b6d4',
    'Cartão de Crédito': '#64748b',
    'Assinaturas': '#f43f5e',
    'Mercado': '#f59e0b',
    'Restaurante': '#db2777',
    'Investimento': '#10b981',
    'Outros': '#94a3b8'
};

export const HistoryCharts: React.FC<HistoryChartsProps> = ({ transactions }) => {
    const [activeTab, setActiveTab] = useState<'categories' | 'mom'>('categories');

    const { categoryData, momData, totalCurrentMonth, momPercentChange } = useMemo(() => {
        const now = new Date();
        const currMonth = now.getMonth();
        const currYear = now.getFullYear();
        const prevMonth = currMonth === 0 ? 11 : currMonth - 1;
        const prevYear = currMonth === 0 ? currYear - 1 : currYear;

        const categories: Record<string, number> = {};
        const dailySpendCurr: number[] = new Array(31).fill(0);
        const dailySpendPrev: number[] = new Array(31).fill(0);

        let totalCurr = 0;
        let totalPrev = 0;

        transactions.forEach(t => {
            if (t.type !== 'EXPENSE' || t.is_amortization) return;

            const d = new Date(t.date);
            const m = d.getMonth();
            const y = d.getFullYear();
            const day = d.getDate() - 1; // 0-indexed day
            const amt = Number(t.amount);

            if (y === currYear && m === currMonth) {
                categories[t.category] = (categories[t.category] || 0) + amt;
                totalCurr += amt;
                if (day >= 0 && day < 31) dailySpendCurr[day] += amt;
            } else if (y === prevYear && m === prevMonth) {
                totalPrev += amt;
                if (day >= 0 && day < 31) dailySpendPrev[day] += amt;
            }
        });

        const catArray = Object.entries(categories)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8); // top 8

        let momChange = 0;
        if (totalPrev > 0) {
            momChange = ((totalCurr - totalPrev) / totalPrev) * 100;
        } else if (totalCurr > 0) {
            momChange = 100; // infinite practically, but cap at 100 for display
        }

        return {
            categoryData: catArray,
            momData: { curr: dailySpendCurr, prev: dailySpendPrev, totalPrev },
            totalCurrentMonth: totalCurr,
            momPercentChange: momChange
        };
    }, [transactions]);

    if (transactions.length === 0) return null;

    const maxCatValue = categoryData.length > 0 ? categoryData[0].value : 1;
    const currMonthLabel = new Date().toLocaleDateString('pt-BR', { month: 'long' });
    const isWorse = momPercentChange > 0;

    return (
        <div className="bg-white border border-slate-100 rounded-[32px] p-6 sm:p-8 shadow-sm mb-6 animate-in fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                            <Activity size={18} />
                        </div>
                        Análise de Despesas
                    </h3>
                    <p className="text-sm text-slate-500 mt-1 first-letter:capitalize">{currMonthLabel}</p>
                </div>

                {/* Toggle Tabs */}
                <div className="flex bg-slate-50 p-1 rounded-xl w-full sm:w-auto">
                    <button
                        onClick={() => setActiveTab('categories')}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'categories' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <PieChart size={14} /> Categorias
                    </button>
                    <button
                        onClick={() => setActiveTab('mom')}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'mom' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <BarChart3 size={14} /> Mês a Mês
                    </button>
                </div>
            </div>

            {activeTab === 'categories' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    {/* Summary Column */}
                    <div className="space-y-6">
                        <div className="p-6 bg-slate-50 rounded-[24px]">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Gasto ({currMonthLabel})</p>
                            <h4 className="text-3xl font-bold text-slate-900">{HistoryUtils.formatCurrency(totalCurrentMonth)}</h4>
                            <div className="flex items-center gap-2 mt-3">
                                <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md ${isWorse ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                    {isWorse ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                    {Math.abs(momPercentChange).toFixed(1)}%
                                </span>
                                <span className="text-xs text-slate-500 font-medium">vs. mês passado</span>
                            </div>
                        </div>
                    </div>

                    {/* Bar Chart Column */}
                    <div className="space-y-4">
                        {categoryData.length === 0 ? (
                            <p className="text-slate-400 text-sm text-center py-4">Nenhuma despesa registrada neste mês.</p>
                        ) : (
                            categoryData.map(cat => {
                                const color = CATEGORY_COLORS[cat.name] || '#94a3b8';
                                const pct = (cat.value / totalCurrentMonth) * 100;
                                const widthPct = (cat.value / maxCatValue) * 100;

                                return (
                                    <div key={cat.name} className="group">
                                        <div className="flex justify-between items-end mb-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                                                <span className="text-sm font-bold text-slate-700">{cat.name}</span>
                                                <span className="text-[10px] font-bold text-slate-400 ml-2">{pct.toFixed(1)}%</span>
                                            </div>
                                            <span className="text-xs font-bold text-slate-900">{HistoryUtils.formatCurrency(cat.value)}</span>
                                        </div>
                                        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-1000 group-hover:opacity-80"
                                                style={{ width: `${widthPct}%`, backgroundColor: color }}
                                            />
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'mom' && (
                <div className="space-y-8 animate-in fade-in">
                    {/* MoM Comparison Simple Bars */}
                    <div className="grid grid-cols-2 gap-8 max-w-2xl mx-auto items-end pt-8">
                        <div className="flex flex-col items-center gap-4">
                            <span className="text-xl font-bold text-slate-400">{HistoryUtils.formatCurrency(momData.totalPrev)}</span>
                            <div
                                className="w-full max-w-[120px] bg-slate-200 rounded-t-2xl transition-all duration-1000"
                                style={{ height: `${Math.min(200, (momData.totalPrev / Math.max(momData.totalPrev, totalCurrentMonth, 1)) * 200)}px` }}
                            />
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Mês Passado</span>
                        </div>

                        <div className="flex flex-col items-center gap-4 relative">
                            <div className="absolute -top-12 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xl border border-slate-700 flex items-center gap-2">
                                {isWorse ? <TrendingUp size={14} className="text-rose-400" /> : <TrendingDown size={14} className="text-emerald-400" />}
                                {isWorse ? '+' : '-'}{Math.abs(momPercentChange).toFixed(1)}%
                            </div>
                            <span className={`text-xl font-bold ${isWorse ? 'text-rose-500' : 'text-emerald-500'}`}>
                                {HistoryUtils.formatCurrency(totalCurrentMonth)}
                            </span>
                            <div
                                className={`w-full max-w-[120px] rounded-t-2xl transition-all duration-1000 ${isWorse ? 'bg-rose-400' : 'bg-emerald-400'}`}
                                style={{ height: `${Math.min(200, (totalCurrentMonth / Math.max(momData.totalPrev, totalCurrentMonth, 1)) * 200)}px` }}
                            />
                            <span className="text-xs font-bold text-slate-900 uppercase tracking-widest capitalize">{currMonthLabel}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
