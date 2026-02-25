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
    const [activeTab, setActiveTab] = useState<'categories' | 'mom' | 'timeline'>('categories');

    const { categoryDataExpense, categoryDataIncome, momData, totalCurrentMonthExpense, totalCurrentMonthIncome, momPercentChangeExpense, momPercentChangeIncome, timelineData } = useMemo(() => {
        const now = new Date();
        const currMonth = now.getMonth();
        const currYear = now.getFullYear();
        const prevMonth = currMonth === 0 ? 11 : currMonth - 1;
        const prevYear = currMonth === 0 ? currYear - 1 : currYear;

        const categoriesExpense: Record<string, number> = {};
        const categoriesIncome: Record<string, number> = {};
        const dailySpendCurr: number[] = new Array(31).fill(0);
        const dailySpendPrev: number[] = new Array(31).fill(0);

        let totalCurrExpense = 0;
        let totalCurrIncome = 0;
        let totalPrevExpense = 0;
        let totalPrevIncome = 0;

        transactions.forEach(t => {
            if (t.is_amortization || (t.type !== 'EXPENSE' && t.type !== 'INCOME')) return;

            const d = new Date(t.date);
            const m = d.getMonth();
            const y = d.getFullYear();
            const day = d.getDate() - 1; // 0-indexed day
            const amt = Math.abs(Number(t.amount));

            if (y === currYear && m === currMonth) {
                if (t.type === 'EXPENSE') {
                    categoriesExpense[t.category] = (categoriesExpense[t.category] || 0) + amt;
                    totalCurrExpense += amt;
                    if (day >= 0 && day < 31) dailySpendCurr[day] += amt;
                } else if (t.type === 'INCOME') {
                    categoriesIncome[t.category] = (categoriesIncome[t.category] || 0) + amt;
                    totalCurrIncome += amt;
                }
            } else if (y === prevYear && m === prevMonth) {
                if (t.type === 'EXPENSE') {
                    totalPrevExpense += amt;
                    if (day >= 0 && day < 31) dailySpendPrev[day] += amt;
                } else if (t.type === 'INCOME') {
                    totalPrevIncome += amt;
                }
            }
        });

        const catArrayExpense = Object.entries(categoriesExpense)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8); // top 8

        const catArrayIncome = Object.entries(categoriesIncome)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8); // top 8

        let momChangeExpense = 0;
        if (totalPrevExpense > 0) {
            momChangeExpense = ((totalCurrExpense - totalPrevExpense) / totalPrevExpense) * 100;
        } else if (totalCurrExpense > 0) {
            momChangeExpense = 100; // infinite practically, but cap at 100 for display
        }

        let momChangeIncome = 0;
        if (totalPrevIncome > 0) {
            momChangeIncome = ((totalCurrIncome - totalPrevIncome) / totalPrevIncome) * 100;
        } else if (totalCurrIncome > 0) {
            momChangeIncome = 100; // infinite practically, but cap at 100 for display
        }

        // --- Timeline Data ---
        let minDateStr = '9999-12-31';
        let maxDateStr = '0000-01-01';
        transactions.forEach(t => {
            if (t.is_amortization || (t.type !== 'EXPENSE' && t.type !== 'INCOME')) return;
            const ymd = t.date.split('T')[0];
            if (ymd < minDateStr) minDateStr = ymd;
            if (ymd > maxDateStr) maxDateStr = ymd;
        });

        let timelineArray: { label: string, income: number, expense: number }[] = [];
        if (minDateStr <= maxDateStr && minDateStr !== '9999-12-31') {
            const dMin = new Date(minDateStr + 'T00:00:00');
            const dMax = new Date(maxDateStr + 'T00:00:00');
            const diffDays = Math.round((dMax.getTime() - dMin.getTime()) / (1000 * 3600 * 24));

            if (diffDays > 90) {
                // Group by month
                const tMap = new Map();
                transactions.forEach(t => {
                    if (t.is_amortization || (t.type !== 'EXPENSE' && t.type !== 'INCOME')) return;
                    const ym = t.date.split('T')[0].substring(0, 7); // YYYY-MM
                    if (!tMap.has(ym)) tMap.set(ym, { income: 0, expense: 0 });
                    const b = tMap.get(ym);
                    if (t.type === 'INCOME') b.income += Number(t.amount);
                    if (t.type === 'EXPENSE') b.expense += Math.abs(Number(t.amount));
                });

                let currentYear = Number(minDateStr.substring(0, 4));
                let currentMonth = Number(minDateStr.substring(5, 7));
                const maxYear = Number(maxDateStr.substring(0, 4));
                const maxMonth = Number(maxDateStr.substring(5, 7));

                while (currentYear < maxYear || (currentYear === maxYear && currentMonth <= maxMonth)) {
                    const ym = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
                    const b = tMap.get(ym) || { income: 0, expense: 0 };
                    const labelDate = new Date(currentYear, currentMonth - 1, 1);
                    const label = labelDate.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. de ', '/').replace(' de ', '/');
                    timelineArray.push({ label, income: b.income, expense: b.expense });

                    currentMonth++;
                    if (currentMonth > 12) {
                        currentMonth = 1;
                        currentYear++;
                    }
                }
            } else {
                // Group by day
                const tMap = new Map();
                transactions.forEach(t => {
                    if (t.is_amortization || (t.type !== 'EXPENSE' && t.type !== 'INCOME')) return;
                    const ymd = t.date.split('T')[0];
                    if (!tMap.has(ymd)) tMap.set(ymd, { income: 0, expense: 0 });
                    const b = tMap.get(ymd);
                    if (t.type === 'INCOME') b.income += Number(t.amount);
                    if (t.type === 'EXPENSE') b.expense += Math.abs(Number(t.amount));
                });
                let curr = new Date(minDateStr + 'T00:00:00');
                while (curr <= dMax) {
                    const ymd = curr.getFullYear() + '-' + String(curr.getMonth() + 1).padStart(2, '0') + '-' + String(curr.getDate()).padStart(2, '0');
                    const b = tMap.get(ymd) || { income: 0, expense: 0 };
                    const label = curr.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                    timelineArray.push({ label, income: b.income, expense: b.expense });
                    curr.setDate(curr.getDate() + 1);
                }
            }
        }

        return {
            categoryDataExpense: catArrayExpense,
            categoryDataIncome: catArrayIncome,
            momData: { curr: dailySpendCurr, prev: dailySpendPrev, totalPrevExpense: totalPrevExpense, totalPrevIncome: totalPrevIncome },
            totalCurrentMonthExpense: totalCurrExpense,
            totalCurrentMonthIncome: totalCurrIncome,
            momPercentChangeExpense: momChangeExpense,
            momPercentChangeIncome: momChangeIncome,
            timelineData: timelineArray
        };
    }, [transactions]);

    if (transactions.length === 0) return null;

    const maxCatExpValue = categoryDataExpense.length > 0 ? categoryDataExpense[0].value : 1;
    const maxCatIncValue = categoryDataIncome.length > 0 ? categoryDataIncome[0].value : 1;
    const currMonthLabel = new Date().toLocaleDateString('pt-BR', { month: 'long' });
    const isWorseExpense = momPercentChangeExpense > 0;
    const isBetterIncome = momPercentChangeIncome > 0;

    return (
        <div className="bg-white border border-slate-100 rounded-[32px] p-6 sm:p-8 shadow-sm mb-6 animate-in fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                            <Activity size={18} />
                        </div>
                        Análise do Período
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
                        onClick={() => setActiveTab('timeline')}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'timeline' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <Activity size={14} /> Linha do Tempo
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

                    {/* Income Column */}
                    <div className="space-y-6">
                        <div className="p-6 bg-emerald-50/50 border border-emerald-100/50 rounded-[24px]">
                            <p className="text-[10px] font-black text-emerald-600/50 uppercase tracking-widest mb-2">Total Recebido ({currMonthLabel})</p>
                            <h4 className="text-3xl font-bold text-emerald-600">{HistoryUtils.formatCurrency(totalCurrentMonthIncome)}</h4>
                        </div>
                        <div className="space-y-4">
                            {categoryDataIncome.length === 0 ? (
                                <p className="text-slate-400 text-sm py-4 italic">Nenhuma receita registrada neste mês.</p>
                            ) : (
                                categoryDataIncome.map(cat => {
                                    const color = CATEGORY_COLORS[cat.name] || '#10b981';
                                    const pct = (cat.value / totalCurrentMonthIncome) * 100;
                                    const widthPct = (cat.value / maxCatIncValue) * 100;

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

                    {/* Expense Column */}
                    <div className="space-y-6">
                        <div className="p-6 bg-rose-50/50 border border-rose-100/50 rounded-[24px]">
                            <p className="text-[10px] font-black text-rose-600/50 uppercase tracking-widest mb-2">Total Gasto ({currMonthLabel})</p>
                            <h4 className="text-3xl font-bold text-rose-600">{HistoryUtils.formatCurrency(totalCurrentMonthExpense)}</h4>
                        </div>
                        <div className="space-y-4">
                            {categoryDataExpense.length === 0 ? (
                                <p className="text-slate-400 text-sm py-4 italic">Nenhuma despesa registrada neste mês.</p>
                            ) : (
                                categoryDataExpense.map(cat => {
                                    const color = CATEGORY_COLORS[cat.name] || '#ef4444';
                                    const pct = (cat.value / totalCurrentMonthExpense) * 100;
                                    const widthPct = (cat.value / maxCatExpValue) * 100;

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
                </div>
            )}

            {activeTab === 'mom' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start animate-in fade-in">
                    {/* Income MoM */}
                    <div className="space-y-8">
                        <div className="p-6 bg-emerald-50/50 border border-emerald-100/50 rounded-[24px]">
                            <p className="text-[10px] font-black text-emerald-600/50 uppercase tracking-widest mb-2">Comportamento de Receitas</p>
                            <h4 className="text-xl font-bold text-emerald-600">Este Mês vs Mês Passado</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-8 max-w-[300px] mx-auto items-end pt-8">
                            <div className="flex flex-col items-center gap-4">
                                <span className="text-xl font-bold text-slate-400">{HistoryUtils.formatCurrency(momData.totalPrevIncome)}</span>
                                <div
                                    className="w-full max-w-[100px] bg-slate-200 rounded-t-2xl transition-all duration-1000"
                                    style={{ height: `${Math.min(200, (momData.totalPrevIncome / Math.max(momData.totalPrevIncome, totalCurrentMonthIncome, 1)) * 200)}px` }}
                                />
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Mês Passado</span>
                            </div>

                            <div className="flex flex-col items-center gap-4 relative">
                                <div className="absolute -top-12 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xl border border-slate-700 flex items-center gap-2">
                                    {isBetterIncome ? <TrendingUp size={14} className="text-emerald-400" /> : <TrendingDown size={14} className="text-rose-400" />}
                                    {isBetterIncome ? '+' : '-'}{Math.abs(momPercentChangeIncome).toFixed(1)}%
                                </div>
                                <span className={`text-xl font-bold ${isBetterIncome ? 'text-emerald-500' : 'text-slate-500'}`}>
                                    {HistoryUtils.formatCurrency(totalCurrentMonthIncome)}
                                </span>
                                <div
                                    className={`w-full max-w-[100px] rounded-t-2xl transition-all duration-1000 ${isBetterIncome ? 'bg-emerald-400' : 'bg-emerald-300'}`}
                                    style={{ height: `${Math.min(200, (totalCurrentMonthIncome / Math.max(momData.totalPrevIncome, totalCurrentMonthIncome, 1)) * 200)}px` }}
                                />
                                <span className="text-xs font-bold text-slate-900 uppercase tracking-widest capitalize">{currMonthLabel}</span>
                            </div>
                        </div>
                    </div>

                    {/* Expense MoM */}
                    <div className="space-y-8">
                        <div className="p-6 bg-rose-50/50 border border-rose-100/50 rounded-[24px]">
                            <p className="text-[10px] font-black text-rose-600/50 uppercase tracking-widest mb-2">Comportamento de Despesas</p>
                            <h4 className="text-xl font-bold text-rose-600">Este Mês vs Mês Passado</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-8 max-w-[300px] mx-auto items-end pt-8">
                            <div className="flex flex-col items-center gap-4">
                                <span className="text-xl font-bold text-slate-400">{HistoryUtils.formatCurrency(momData.totalPrevExpense)}</span>
                                <div
                                    className="w-full max-w-[100px] bg-slate-200 rounded-t-2xl transition-all duration-1000"
                                    style={{ height: `${Math.min(200, (momData.totalPrevExpense / Math.max(momData.totalPrevExpense, totalCurrentMonthExpense, 1)) * 200)}px` }}
                                />
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Mês Passado</span>
                            </div>

                            <div className="flex flex-col items-center gap-4 relative">
                                <div className="absolute -top-12 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xl border border-slate-700 flex items-center gap-2">
                                    {isWorseExpense ? <TrendingUp size={14} className="text-rose-400" /> : <TrendingDown size={14} className="text-emerald-400" />}
                                    {isWorseExpense ? '+' : '-'}{Math.abs(momPercentChangeExpense).toFixed(1)}%
                                </div>
                                <span className={`text-xl font-bold ${isWorseExpense ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    {HistoryUtils.formatCurrency(totalCurrentMonthExpense)}
                                </span>
                                <div
                                    className={`w-full max-w-[100px] rounded-t-2xl transition-all duration-1000 ${isWorseExpense ? 'bg-rose-400' : 'bg-emerald-400'}`}
                                    style={{ height: `${Math.min(200, (totalCurrentMonthExpense / Math.max(momData.totalPrevExpense, totalCurrentMonthExpense, 1)) * 200)}px` }}
                                />
                                <span className="text-xs font-bold text-slate-900 uppercase tracking-widest capitalize">{currMonthLabel}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'timeline' && (
                <div className="pt-8 animate-in fade-in">
                    {timelineData.length === 0 ? (
                        <p className="text-slate-400 text-sm text-center">Não há dados suficientes para a linha do tempo.</p>
                    ) : (
                        <div className="w-full overflow-x-auto pb-4">
                            <div className="min-w-[600px] relative">
                                {(() => {
                                    const height = 280;
                                    const width = 800;
                                    const padY = 30;
                                    const maxInc = Math.max(...timelineData.map(d => d.income), 1);
                                    const maxExp = Math.max(...timelineData.map(d => d.expense), 1);

                                    // Zero axis no meio do gráfico
                                    const zeroY = height / 2;

                                    const incPoints = timelineData.map((d, i) => {
                                        const x = (i / Math.max(timelineData.length - 1, 1)) * width;
                                        const y = zeroY - (d.income / maxInc) * (zeroY - padY);
                                        return `${x},${y}`;
                                    }).join(' ');

                                    const expPoints = timelineData.map((d, i) => {
                                        const x = (i / Math.max(timelineData.length - 1, 1)) * width;
                                        const y = zeroY + (d.expense / maxExp) * (height - zeroY - padY);
                                        return `${x},${y}`;
                                    }).join(' ');

                                    return (
                                        <svg viewBox={`-10 0 ${width + 20} ${height + 20}`} className="w-full h-full min-h-[280px] overflow-visible">
                                            {/* Fill Background Areas */}
                                            <polygon fill="url(#gradIncome)" points={`0,${zeroY} ${incPoints} ${width},${zeroY}`} opacity={0.3} />
                                            <polygon fill="url(#gradExpense)" points={`0,${zeroY} ${expPoints} ${width},${zeroY}`} opacity={0.3} />

                                            {/* Data Lines */}
                                            <polyline points={incPoints} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                            <polyline points={expPoints} fill="none" stroke="#f43f5e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                                            {/* Zero Axis */}
                                            <line x1="0" y1={zeroY} x2={width} y2={zeroY} stroke="#e2e8f0" strokeWidth="2" strokeDasharray="4 4" />

                                            {/* Data Points & Labels */}
                                            {timelineData.map((d, i) => {
                                                const x = (i / Math.max(timelineData.length - 1, 1)) * width;
                                                const yInc = zeroY - (d.income / maxInc) * (zeroY - padY);
                                                const yExp = zeroY + (d.expense / maxExp) * (height - zeroY - padY);

                                                const showLabel = timelineData.length <= 15 || i % Math.ceil(timelineData.length / 10) === 0 || i === timelineData.length - 1;

                                                return (
                                                    <g key={i}>
                                                        <circle cx={x} cy={yInc} r="4" fill="#10b981" className="cursor-pointer hover:r-6 transition-all" />
                                                        <circle cx={x} cy={yExp} r="4" fill="#f43f5e" className="cursor-pointer hover:r-6 transition-all" />
                                                        {showLabel && (
                                                            <text x={x} y={height + 15} fontSize="10" fill="#94a3b8" textAnchor="middle" fontWeight="bold">{d.label}</text>
                                                        )}
                                                    </g>
                                                );
                                            })}

                                            {/* Gradients */}
                                            <defs>
                                                <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#10b981" stopOpacity="1" />
                                                    <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                                                </linearGradient>
                                                <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0" />
                                                    <stop offset="100%" stopColor="#f43f5e" stopOpacity="1" />
                                                </linearGradient>
                                            </defs>
                                        </svg>
                                    );
                                })()}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
