import React, { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, PieChart, BarChart3, Activity, Filter } from 'lucide-react';
import { Transaction } from '../../types';
import { HistoryUtils } from '../../lib/historyUtils';

interface HistoryChartsProps {
    transactions: Transaction[];
    selectedTimelineCategories?: string[];
    setSelectedTimelineCategories?: (cats: string[] | ((prev: string[]) => string[])) => void;
    startDate?: string;
    endDate?: string;
    onCategoryClick?: (category: string) => void;
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

export const HistoryCharts: React.FC<HistoryChartsProps> = ({
    transactions,
    selectedTimelineCategories = [],
    setSelectedTimelineCategories = () => { },
    startDate: propStartDate = '',
    endDate: propEndDate = '',
    onCategoryClick
}) => {
    const [activeTab, setActiveTab] = useState<'categories' | 'mom' | 'timeline'>('categories');
    
    // Internal filters for charts
    const [internalStartDate, setInternalStartDate] = useState(propStartDate);
    const [internalEndDate, setInternalEndDate] = useState(propEndDate);

    const chartFilteredTransactions = useMemo(() => {
        if (!internalStartDate && !internalEndDate) return transactions;
        return transactions.filter(t => {
            const d = t.date.split('T')[0];
            if (internalStartDate && d < internalStartDate) return false;
            if (internalEndDate && d > internalEndDate) return false;
            return true;
        });
    }, [transactions, internalStartDate, internalEndDate]);

    const availableTimelineCategories = useMemo(() => {
        const cats = new Set<string>();
        chartFilteredTransactions.forEach(t => {
            if (!t.is_amortization && (t.type === 'INCOME' || t.type === 'EXPENSE')) {
                cats.add(t.category);
            }
        });
        return Array.from(cats).sort();
    }, [chartFilteredTransactions]);

    const { categoryDataExpense, categoryDataIncome, momData, totalCurrentMonthExpense, totalCurrentMonthIncome, momPercentChangeExpense, momPercentChangeIncome, timelineData } = useMemo(() => {
        const activeTx = chartFilteredTransactions;

        // ── CATEGORIES: aggregate ALL transactions passed (they're already filtered by the date range selector) ──
        const categoriesExpense: Record<string, number> = {};
        const categoriesIncome: Record<string, number> = {};
        let totalAllExpense = 0;
        let totalAllIncome = 0;

        activeTx.forEach(t => {
            if (t.is_amortization || (t.type !== 'EXPENSE' && t.type !== 'INCOME')) return;
            if (t.category === 'Cartão de Crédito') return; // Excluir categoria de provisionamento para evitar duplicidade
            const amt = Math.abs(Number(t.amount));
            if (t.type === 'EXPENSE') {
                categoriesExpense[t.category] = (categoriesExpense[t.category] || 0) + amt;
                totalAllExpense += amt;
            } else {
                categoriesIncome[t.category] = (categoriesIncome[t.category] || 0) + amt;
                totalAllIncome += amt;
            }
        });

        const catArrayExpense = Object.entries(categoriesExpense)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        const catArrayIncome = Object.entries(categoriesIncome)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        // ── MÊS A MÊS: comparison of multiple months ──
        const monthsOffset = momCompareMonths || 2;
        const momMonths: { year: number, month: number, label: string, income: number, expense: number }[] = [];
        
        const now = new Date();
        for (let i = 0; i < monthsOffset; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            momMonths.push({
                year: d.getFullYear(),
                month: d.getMonth(),
                label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
                income: 0,
                expense: 0
            });
        }

        activeTx.forEach(t => {
            if (t.is_amortization || (t.type !== 'EXPENSE' && t.type !== 'INCOME')) return;
            if (t.category === 'Cartão de Crédito') return;
            const d = new Date(t.date);
            const m = d.getMonth(); const y = d.getFullYear();
            const amt = Math.abs(Number(t.amount));

            const target = momMonths.find(mm => mm.month === m && mm.year === y);
            if (target) {
                if (t.type === 'INCOME') target.income += amt;
                else target.expense += amt;
            }
        });
        
        momMonths.reverse(); // Show oldest to newest

        // ── TIMELINE ──
        let minDateStr = '9999-12-31';
        let maxDateStr = '0000-01-01';
        activeTx.forEach(t => {
            if (t.is_amortization || (t.type !== 'EXPENSE' && t.type !== 'INCOME')) return;
            const ymd = t.date.split('T')[0];
            if (ymd < minDateStr) minDateStr = ymd;
            if (ymd > maxDateStr) maxDateStr = ymd;
        });

        let timelineArray: { label: string, income: number, expense: number, balance: number }[] = [];
        if (minDateStr <= maxDateStr && minDateStr !== '9999-12-31') {
            const dMin = new Date(minDateStr + 'T00:00:00');
            const dMax = new Date(maxDateStr + 'T00:00:00');
            const diffDays = Math.round((dMax.getTime() - dMin.getTime()) / (1000 * 3600 * 24));

            if (diffDays > 90) {
                const tMap = new Map();
                activeTx.forEach(t => {
                    if (t.is_amortization || (t.type !== 'EXPENSE' && t.type !== 'INCOME')) return;
                    if (t.category === 'Cartão de Crédito') return;
                    if (selectedTimelineCategories.length > 0 && !selectedTimelineCategories.includes(t.category)) return;
                    const ym = t.date.split('T')[0].substring(0, 7);
                    if (!tMap.has(ym)) tMap.set(ym, { income: 0, expense: 0, balance: 0 });
                    const b = tMap.get(ym);
                    if (t.type === 'INCOME') b.income += Number(t.amount);
                    if (t.type === 'EXPENSE') b.expense += Math.abs(Number(t.amount));
                    b.balance = b.income - b.expense;
                });
                let cy = Number(minDateStr.substring(0, 4));
                let cm = Number(minDateStr.substring(5, 7));
                const maxY = Number(maxDateStr.substring(0, 4));
                const maxM = Number(maxDateStr.substring(5, 7));
                while (cy < maxY || (cy === maxY && cm <= maxM)) {
                    const ym = `${cy}-${String(cm).padStart(2, '0')}`;
                    const b = tMap.get(ym) || { income: 0, expense: 0, balance: 0 };
                    const label = new Date(cy, cm - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. de ', '/').replace(' de ', '/');
                    timelineArray.push({ label, income: b.income, expense: b.expense, balance: b.balance });
                    cm++; if (cm > 12) { cm = 1; cy++; }
                }
            } else {
                const tMap = new Map();
                activeTx.forEach(t => {
                    if (t.is_amortization || (t.type !== 'EXPENSE' && t.type !== 'INCOME')) return;
                    if (t.category === 'Cartão de Crédito') return;
                    if (selectedTimelineCategories.length > 0 && !selectedTimelineCategories.includes(t.category)) return;
                    const ymd = t.date.split('T')[0];
                    if (!tMap.has(ymd)) tMap.set(ymd, { income: 0, expense: 0, balance: 0 });
                    const b = tMap.get(ymd);
                    if (t.type === 'INCOME') b.income += Number(t.amount);
                    if (t.type === 'EXPENSE') b.expense += Math.abs(Number(t.amount));
                    b.balance = b.income - b.expense;
                });
                let curr = new Date(minDateStr + 'T00:00:00');
                while (curr <= dMax) {
                    const ymd = curr.getFullYear() + '-' + String(curr.getMonth() + 1).padStart(2, '0') + '-' + String(curr.getDate()).padStart(2, '0');
                    const b = tMap.get(ymd) || { income: 0, expense: 0, balance: 0 };
                    timelineArray.push({ label: curr.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), income: b.income, expense: b.expense, balance: b.balance });
                    curr.setDate(curr.getDate() + 1);
                }
            }
        }

        return {
            categoryDataExpense: catArrayExpense,
            categoryDataIncome: catArrayIncome,
            momData: momMonths,
            totalCurrentMonthExpense: totalAllExpense,   // <-- uses ALL period total for the Categories tab header
            totalCurrentMonthIncome: totalAllIncome,     // <-- same
            momPercentChangeExpense: 0, // Simplified for multi-month
            momPercentChangeIncome: 0,
            timelineData: timelineArray
        };
    }, [chartFilteredTransactions, selectedTimelineCategories, momCompareMonths]);


    if (transactions.length === 0) return null;

    const maxCatExpValue = categoryDataExpense.length > 0 ? categoryDataExpense[0].value : 1;
    const maxCatIncValue = categoryDataIncome.length > 0 ? categoryDataIncome[0].value : 1;
    // Build the period label from the actual date filters (not from transaction data)
    const currMonthLabel = (() => {
        const fmt = (iso: string) => {
            const d = new Date(iso + 'T00:00:00');
            return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        };
        if (!internalStartDate && !internalEndDate) return 'Todo o Período';
        if (internalStartDate && internalEndDate) {
            // If same month → show just that month
            const s = new Date(internalStartDate + 'T00:00:00');
            const e = new Date(internalEndDate + 'T00:00:00');
            if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
                return fmt(internalStartDate);
            }
            // Different months → show range
            return `${fmt(internalStartDate)} → ${fmt(internalEndDate)}`;
        }
        if (internalStartDate) return `A partir de ${fmt(internalStartDate)}`;
        return `Até ${fmt(internalEndDate)}`;
    })();
    const isWorseExpense = momPercentChangeExpense > 0;
    const isBetterIncome = momPercentChangeIncome > 0;

    return (
        <div className="bg-white border border-slate-100 rounded-[24px] sm:rounded-[32px] p-4 sm:p-8 shadow-sm mb-6 animate-in fade-in min-w-0">
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
                <div className="flex bg-slate-50 p-1 rounded-xl w-full sm:w-auto overflow-x-auto scrollbar-hide">
                    <button
                        onClick={() => setShowInternalFilters(!showInternalFilters)}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${showInternalFilters ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-400 hover:bg-slate-100'}`}
                        title="Filtros Internos"
                    >
                        <Filter size={13} />
                    </button>
                    <div className="w-px h-4 bg-slate-200 self-center mx-1" />
                    <button
                        onClick={() => setActiveTab('categories')}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'categories' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <PieChart size={13} /> Categorias
                    </button>
                    <button
                        onClick={() => setActiveTab('timeline')}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'timeline' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <Activity size={13} /> Linha do Tempo
                    </button>
                    <button
                        onClick={() => setActiveTab('mom')}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap ${activeTab === 'mom' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <BarChart3 size={13} /> Mês a Mês
                    </button>
                </div>
            </div>

            {showInternalFilters && (
                <div className="flex flex-wrap items-center gap-4 p-4 bg-slate-50 rounded-2xl mb-8 animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Período Gráfico:</span>
                        <input type="date" value={internalStartDate} onChange={e => setInternalStartDate(e.target.value)} className="bg-white border border-slate-100 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none" />
                        <span className="text-slate-300">/</span>
                        <input type="date" value={internalEndDate} onChange={e => setInternalEndDate(e.target.value)} className="bg-white border border-slate-100 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none" />
                    </div>
                    {activeTab === 'mom' && (
                        <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Meses Comparação:</span>
                            <select value={momCompareMonths} onChange={e => setMomCompareMonths(Number(e.target.value))} className="bg-white border border-slate-100 rounded-lg px-2 py-1.5 text-[10px] font-bold outline-none">
                                <option value={2}>Últimos 2 meses</option>
                                <option value={3}>Últimos 3 meses</option>
                                <option value={6}>Últimos 6 meses</option>
                            </select>
                        </div>
                    )}
                    <button onClick={() => { setInternalStartDate(propStartDate); setInternalEndDate(propEndDate); }} className="text-[10px] font-bold text-rose-500 hover:text-rose-600 uppercase tracking-widest ml-auto">Resetar</button>
                </div>
            )}

            {activeTab === 'categories' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-12 items-start">

                    {/* Income Column */}
                    <div className="space-y-6">
                        <div className="p-6 bg-emerald-50/50 border border-emerald-100/50 rounded-[24px]">
                            <p className="text-[10px] font-black text-emerald-600/50 uppercase tracking-widest mb-2">Total Recebido ({currMonthLabel})</p>
                            <h4 className="text-3xl font-bold text-emerald-600">{HistoryUtils.formatCurrency(totalCurrentMonthIncome)}</h4>
                        </div>
                        <div className="space-y-4 max-h-[460px] overflow-y-auto pr-2 custom-scrollbar">
                            {categoryDataIncome.length === 0 ? (
                                <p className="text-slate-400 text-sm py-4 italic">Nenhuma receita registrada neste mês.</p>
                            ) : (
                                categoryDataIncome.map(cat => {
                                    const color = CATEGORY_COLORS[cat.name] || '#10b981';
                                    const pct = (cat.value / totalCurrentMonthIncome) * 100;
                                    const widthPct = (cat.value / maxCatIncValue) * 100;

                                    return (
                                        <div
                                            key={cat.name}
                                            className={`group ${onCategoryClick ? 'cursor-pointer hover:bg-slate-50 transition-colors rounded-xl p-2 -m-2' : ''}`}
                                            onClick={() => onCategoryClick?.(cat.name)}
                                        >
                                            <div className="flex justify-between items-end mb-1">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                                                    <span className={`text-sm font-bold text-slate-700 ${onCategoryClick ? 'group-hover:text-emerald-600 transition-colors' : ''}`}>{cat.name}</span>
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
                        <div className="space-y-4 max-h-[460px] overflow-y-auto pr-2 custom-scrollbar">
                            {categoryDataExpense.length === 0 ? (
                                <p className="text-slate-400 text-sm py-4 italic">Nenhuma despesa registrada neste mês.</p>
                            ) : (
                                categoryDataExpense.map(cat => {
                                    const color = CATEGORY_COLORS[cat.name] || '#ef4444';
                                    const pct = (cat.value / totalCurrentMonthExpense) * 100;
                                    const widthPct = (cat.value / maxCatExpValue) * 100;

                                    return (
                                        <div
                                            key={cat.name}
                                            className={`group ${onCategoryClick ? 'cursor-pointer hover:bg-slate-50 transition-colors rounded-xl p-2 -m-2' : ''}`}
                                            onClick={() => onCategoryClick?.(cat.name)}
                                        >
                                            <div className="flex justify-between items-end mb-1">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                                                    <span className={`text-sm font-bold text-slate-700 ${onCategoryClick ? 'group-hover:text-rose-600 transition-colors' : ''}`}>{cat.name}</span>
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
                                )
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'mom' && (
                <div className="space-y-12 animate-in fade-in">
                    <div className="grid grid-cols-1 gap-8">
                        <div className="p-6 bg-slate-50 border border-slate-100 rounded-[24px]">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Histórico por Mês ({momCompareMonths} meses)</p>
                            <div className="flex items-center gap-4 text-[10px] font-bold">
                                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-400" /> Receitas</div>
                                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-rose-400" /> Despesas</div>
                            </div>
                        </div>

                        <div className="h-[300px] flex items-end justify-around gap-2 sm:gap-4 px-4 border-b border-slate-100">
                            {momData.map((m, idx) => {
                                const maxVal = Math.max(...momData.map(x => Math.max(x.income, x.expense)), 1);
                                const incHeight = (m.income / maxVal) * 250;
                                const expHeight = (m.expense / maxVal) * 250;

                                return (
                                    <div key={idx} className="flex-1 flex flex-col items-center gap-2 group relative">
                                        <div className="flex gap-1 items-end h-[250px] w-full justify-center">
                                            <div
                                                className="w-4 sm:w-8 bg-emerald-400 rounded-t-lg transition-all duration-500 group-hover:bg-emerald-500 shadow-sm"
                                                style={{ height: `${incHeight}px` }}
                                            />
                                            <div
                                                className="w-4 sm:w-8 bg-rose-400 rounded-t-lg transition-all duration-500 group-hover:bg-rose-500 shadow-sm"
                                                style={{ height: `${expHeight}px` }}
                                            />
                                        </div>
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter truncate w-full text-center">{m.label}</div>
                                        
                                        {/* Tooltip on hover */}
                                        <div className="absolute opacity-0 group-hover:opacity-100 bottom-full mb-2 bg-brand-900 text-white p-3 rounded-xl text-[10px] shadow-2xl z-10 pointer-events-none transition-opacity min-w-[120px] border border-slate-700">
                                            <p className="font-black text-brand-400 mb-1">{m.label.toUpperCase()}</p>
                                            <div className="flex justify-between gap-4"><span>Rec:</span> <span className="text-emerald-400">{HistoryUtils.formatCurrency(m.income)}</span></div>
                                            <div className="flex justify-between gap-4"><span>Des:</span> <span className="text-rose-400">{HistoryUtils.formatCurrency(m.expense)}</span></div>
                                            <div className="border-t border-slate-700 mt-1 pt-1 flex justify-between gap-4"><span>Bal:</span> <span>{HistoryUtils.formatCurrency(m.income - m.expense)}</span></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'timeline' && (
                <div className="pt-8 animate-in fade-in flex flex-col gap-6">
                    <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Receitas</div>
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Despesas</div>
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Balanço</div>
                    </div>

                    {timelineData.length === 0 ? (
                        <p className="text-slate-400 text-sm text-center py-12">Não há dados suficientes para a linha do tempo com as categorias selecionadas.</p>
                    ) : (
                        <div className="w-full overflow-x-auto pb-4 scrollbar-hide">
                            <div className="min-w-[500px] sm:min-w-[700px] relative">
                                {(() => {
                                    const height = 300;
                                    const width = 800;
                                    const padYTop = 30;
                                    const padYBottom = 40;
                                    const padX = 30;
                                    const chartWidth = width - 2 * padX;

                                    const maxInc = Math.max(...timelineData.map(d => d.income), 0);
                                    const maxExp = Math.max(...timelineData.map(d => d.expense), 0);
                                    const maxBal = Math.max(...timelineData.map(d => d.balance), 0);
                                    const minBal = Math.min(...timelineData.map(d => d.balance), 0);

                                    const maxVal = Math.max(maxInc, maxExp, maxBal, 1);
                                    const minVal = Math.min(minBal, 0);

                                    const range = maxVal - minVal || 1;

                                    const getY = (val: number) => height - padYBottom - ((val - minVal) / range) * (height - padYTop - padYBottom);
                                    const getX = (i: number) => padX + (i / Math.max(timelineData.length - 1, 1)) * chartWidth;

                                    const zeroY = getY(0);

                                    // Bezier Curve Logic
                                    const getBezierPath = (pts: { x: number, y: number }[]) => {
                                        if (pts.length < 2) return '';
                                        let path = `M ${pts[0].x},${pts[0].y}`;
                                        for (let i = 0; i < pts.length - 1; i++) {
                                            const curr = pts[i];
                                            const next = pts[i + 1];
                                            const cp1x = curr.x + (next.x - curr.x) / 3;
                                            const cp2x = curr.x + 2 * (next.x - curr.x) / 3;
                                            path += ` C ${cp1x},${curr.y} ${cp2x},${next.y} ${next.x},${next.y}`;
                                        }
                                        return path;
                                    };

                                    const incPts = timelineData.map((d, i) => ({ x: getX(i), y: getY(d.income) }));
                                    const expPts = timelineData.map((d, i) => ({ x: getX(i), y: getY(d.expense) }));
                                    const balPts = timelineData.map((d, i) => ({ x: getX(i), y: getY(d.balance) }));

                                    const incPath = getBezierPath(incPts);
                                    const expPath = getBezierPath(expPts);
                                    const balPath = getBezierPath(balPts);

                                    const incArea = incPath + ` L ${getX(timelineData.length - 1)},${zeroY} L ${getX(0)},${zeroY} Z`;
                                    const expArea = expPath + ` L ${getX(timelineData.length - 1)},${zeroY} L ${getX(0)},${zeroY} Z`;

                                    return (
                                        <svg viewBox={`0 0 ${width} ${height + 20}`} className="w-full h-full min-h-[300px] overflow-visible">
                                            {/* Fill Background Areas */}
                                            <path d={incArea} fill="url(#gradIncome)" opacity={0.15} />
                                            <path d={expArea} fill="url(#gradExpense)" opacity={0.15} />

                                            {/* Data Lines */}
                                            <path d={incPath} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                            <path d={expPath} fill="none" stroke="#f43f5e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                            <path d={balPath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round" />

                                            {/* Reference Lines (Y Axis) */}
                                            {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                                                const val = minVal + pct * range;
                                                const y = getY(val);
                                                return (
                                                    <React.Fragment key={pct}>
                                                        <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="#f1f5f9" strokeWidth="1" />
                                                        <text x={padX - 5} y={y + 3} fontSize="8" fill="#cbd5e1" textAnchor="end" fontWeight="bold">{Math.round(val / 1000)}k</text>
                                                    </React.Fragment>
                                                );
                                            })}

                                            {/* Zero Axis */}
                                            <line x1={`${padX}`} y1={zeroY} x2={`${padX + chartWidth}`} y2={zeroY} stroke="#e2e8f0" strokeWidth="2" strokeDasharray="4 4" />

                                            {/* Data Points & Labels */}
                                            {timelineData.map((d, i) => {
                                                const x = getX(i);
                                                const yInc = getY(d.income);
                                                const yExp = getY(d.expense);
                                                const yBal = getY(d.balance);

                                                const showLabel = timelineData.length <= 15 || i % Math.ceil(timelineData.length / 10) === 0 || i === timelineData.length - 1 || i === 0;

                                                return (
                                                    <g key={i}>
                                                        <circle cx={x} cy={yInc} r="4" fill="#10b981" className="cursor-pointer hover:r-6 transition-all" />
                                                        <circle cx={x} cy={yExp} r="4" fill="#f43f5e" className="cursor-pointer hover:r-6 transition-all" />
                                                        <circle cx={x} cy={yBal} r="3" fill="#3b82f6" />
                                                        {showLabel && (
                                                            <text x={x} y={height + 10} fontSize="10" fill="#94a3b8" textAnchor="middle" fontWeight="bold">{d.label}</text>
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
                                                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="1" />
                                                    <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
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
