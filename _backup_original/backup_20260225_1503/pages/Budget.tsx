import React, { useState, useEffect } from 'react';
import { Plus, X, Loader2, AlertTriangle, Check, TrendingDown } from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import { Budget } from '../types';

const BUDGET_COLORS = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b'
];

const DEFAULT_CATEGORIES = [
    'Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Educação', 'Lazer', 'Vestuário', 'Serviços', 'Investimentos', 'Outros'
];

const BudgetPage: React.FC<{ user: any }> = ({ user }) => {
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
    const [totalMonthly, setTotalMonthly] = useState(0);
    const [formData, setFormData] = useState({ category: '', monthlyLimit: '', color: '#6366f1' });
    const [currentMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        const sb = supabase;
        if (!sb) return;
        setIsLoading(true);
        try {
            const { data: { user: u } } = await sb.auth.getUser();
            if (!u) return;

            // Fetch user budgets
            const { data: budgetsData } = await sb.from('budgets').select('*').eq('user_id', u.id).eq('is_active', true);

            // Fetch current month transactions
            const startOfMonth = `${currentMonth}-01`;
            const endOfMonth = new Date(new Date(startOfMonth).getFullYear(), new Date(startOfMonth).getMonth() + 1, 0).toISOString().split('T')[0];
            const { data: txData } = await sb.from('transactions')
                .select('amount, category, type')
                .eq('user_id', u.id)
                .eq('type', 'EXPENSE')
                .eq('is_amortization', false)
                .gte('date', startOfMonth)
                .lte('date', endOfMonth);

            // Group spending by category
            const spendingByCategory: Record<string, number> = {};
            let monthTotal = 0;
            (txData || []).forEach((t: any) => {
                const cat = t.category || 'Outros';
                spendingByCategory[cat] = (spendingByCategory[cat] || 0) + Number(t.amount);
                monthTotal += Number(t.amount);
            });
            setTotalMonthly(monthTotal);

            // Merge budget with spending
            if (budgetsData) {
                setBudgets(budgetsData.map((b: any) => ({
                    id: b.id, category: b.category, monthlyLimit: Number(b.monthly_limit),
                    color: b.color, isActive: b.is_active,
                    currentMonthSpent: spendingByCategory[b.category] || 0
                })));
            }
        } finally { setIsLoading(false); }
    };

    const openAdd = () => { setEditingBudget(null); setFormData({ category: DEFAULT_CATEGORIES[0], monthlyLimit: '', color: '#6366f1' }); setShowModal(true); };
    const openEdit = (b: Budget) => { setEditingBudget(b); setFormData({ category: b.category, monthlyLimit: String(b.monthlyLimit), color: b.color }); setShowModal(true); };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase) return;
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!u) return;
        try {
            const payload = { category: formData.category, monthly_limit: parseFloat(formData.monthlyLimit) || 0, color: formData.color };
            if (editingBudget) {
                await supabase.from('budgets').update(payload).eq('id', editingBudget.id);
            } else {
                await supabase.from('budgets').insert([{ ...payload, user_id: u.id }]);
            }
            setShowModal(false); fetchData();
        } catch (err: any) { alert(err.message); }
    };

    const handleDelete = async (id: string) => {
        if (!supabase || !confirm('Remover este limite de orçamento?')) return;
        await supabase.from('budgets').delete().eq('id', id);
        fetchData();
    };

    const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(v);

    const getStatus = (spent: number, limit: number) => {
        const pct = limit > 0 ? (spent / limit) * 100 : 100;
        if (pct >= 100) return { label: 'Estourado', color: 'text-red-600', bg: 'bg-red-500', bgLight: 'bg-red-50', pct: 100 };
        if (pct >= 80) return { label: 'Atenção', color: 'text-orange-600', bg: 'bg-orange-500', bgLight: 'bg-orange-50', pct };
        return { label: 'No limite', color: 'text-emerald-600', bg: 'bg-emerald-500', bgLight: 'bg-emerald-50', pct };
    };

    if (isLoading) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="animate-spin text-brand-600" size={32} />
        </div>
    );

    const totalBudgeted = budgets.reduce((s, b) => s + b.monthlyLimit, 0);
    const totalSpent = budgets.reduce((s, b) => s + (b.currentMonthSpent || 0), 0);
    const overBudgetCount = budgets.filter(b => (b.currentMonthSpent || 0) > b.monthlyLimit).length;

    return (
        <div className="max-w-[1600px] mx-auto px-4 sm:px-10 py-8 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-slate-900">Orçamento Mensal</h1>
                        {overBudgetCount > 0 && (
                            <span className="px-2.5 py-1 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-red-100">
                                {overBudgetCount} estourados
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-slate-400 font-medium mt-1">
                        {currentMonth.split('-').reverse().join('/')} • Defina limites por categoria e monitore em tempo real.
                    </p>
                </div>
                <button onClick={openAdd} className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-xs font-bold uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all">
                    <Plus size={16} /> Novo Limite
                </button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-6">
                {[
                    { label: 'Total Orçado', value: fmt(totalBudgeted), sub: 'Limite total do mês', color: 'text-slate-900' },
                    { label: 'Total Gasto', value: fmt(totalSpent), sub: 'Nas categorias com limite', color: totalSpent > totalBudgeted ? 'text-red-600' : 'text-emerald-600' },
                    { label: 'Disponível', value: fmt(Math.max(0, totalBudgeted - totalSpent)), sub: 'Restante este mês', color: 'text-brand-600' },
                ].map((c, i) => (
                    <div key={i} className="bg-white border border-slate-100 rounded-[28px] p-6 shadow-sm">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{c.label}</p>
                        <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{c.sub}</p>
                    </div>
                ))}
            </div>

            {/* Budget bars */}
            <div className="bg-white border border-slate-100 rounded-[32px] shadow-sm overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-50 flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm uppercase tracking-widest text-[10px]">Categorias</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gasto / Limite</span>
                </div>
                {budgets.length === 0 ? (
                    <div className="py-20 text-center text-slate-300">
                        <TrendingDown size={40} className="mx-auto mb-4" />
                        <p className="font-bold uppercase tracking-widest text-xs">Nenhum limite configurado</p>
                        <p className="text-[10px] text-slate-400 mt-1">Clique em "Novo Limite" para começar</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {budgets.map(b => {
                            const status = getStatus(b.currentMonthSpent || 0, b.monthlyLimit);
                            return (
                                <div key={b.id} className="px-8 py-5 hover:bg-slate-50/30 transition-all group">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: b.color }} />
                                            <span className="font-bold text-slate-900 text-sm">{b.category}</span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className={`text-xs font-bold ${status.color}`}>
                                                {fmt(b.currentMonthSpent || 0)} / {fmt(b.monthlyLimit)}
                                            </span>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => openEdit(b)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors text-xs">✏️</button>
                                                <button onClick={() => handleDelete(b.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><X size={12} /></button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all duration-700 ${status.bg}`} style={{ width: `${status.pct}%` }} />
                                    </div>
                                    <div className="flex justify-between mt-1.5">
                                        <span className={`text-[9px] font-bold uppercase tracking-widest ${status.color}`}>{status.label}</span>
                                        <span className="text-[9px] font-bold text-slate-400">{Math.round(status.pct)}%</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="font-bold text-slate-900">{editingBudget ? 'Editar Limite' : 'Novo Limite de Orçamento'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Categoria</label>
                                {editingBudget ? (
                                    <p className="font-bold text-slate-900 py-3 px-4 bg-slate-50 rounded-xl">{formData.category}</p>
                                ) : (
                                    <select required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                                        {DEFAULT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                )}
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Limite Mensal (R$)</label>
                                <input required type="number" step="0.01" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500" placeholder="0.00" value={formData.monthlyLimit} onChange={e => setFormData({ ...formData, monthlyLimit: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Cor</label>
                                <div className="flex gap-2 flex-wrap">
                                    {BUDGET_COLORS.map(c => (
                                        <button key={c} type="button" onClick={() => setFormData({ ...formData, color: c })}
                                            className={`w-7 h-7 rounded-full transition-transform ${formData.color === c ? 'scale-125 ring-2 ring-offset-1 ring-slate-400' : 'hover:scale-110'}`}
                                            style={{ backgroundColor: c }} />
                                    ))}
                                </div>
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-widest">Cancelar</button>
                                <button type="submit" className="flex-1 px-4 py-3 bg-brand-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-brand-500/20 hover:scale-[1.02] transition-transform">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BudgetPage;
