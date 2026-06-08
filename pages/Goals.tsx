import React, { useState, useEffect } from 'react';
import { Plus, Target, Check, Loader2, Trash2, X, Calendar, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import { Goal } from '../types';

const GOAL_COLORS = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'
];

const Goals: React.FC<{ user: any }> = ({ user }) => {
    const [goals, setGoals] = useState<Goal[]>(() => {
        const cached = localStorage.getItem('finvision_cached_goals');
        return cached ? JSON.parse(cached) : [];
    });
    const [isLoading, setIsLoading] = useState(() => {
        const cached = localStorage.getItem('finvision_cached_goals');
        return !cached;
    });
    const [showModal, setShowModal] = useState(false);
    const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
    const [avgMonthlySavings, setAvgMonthlySavings] = useState(() => {
        const cached = localStorage.getItem('finvision_cached_avg_monthly_savings');
        return cached ? Number(cached) : 0;
    });
    const [formData, setFormData] = useState({
        name: '', description: '', targetAmount: '', currentAmount: '', color: '#6366f1', deadline: ''
    });

    useEffect(() => {
        const cached = localStorage.getItem('finvision_cached_goals');
        fetchData(!!cached);
    }, []);

    const fetchData = async (silent = false) => {
        const sb = supabase;
        if (!sb) return;
        if (!silent) setIsLoading(true);
        try {
            if (navigator.onLine) {
                const { data: { user: u } } = await sb.auth.getUser();
                if (!u) return;

                // Fetch goals
                const { data: goalsData } = await sb.from('goals').select('*').eq('user_id', u.id).order('created_at', { ascending: false });
                if (goalsData) {
                    const mappedGoals = goalsData.map((g: any) => ({
                        id: g.id, name: g.name, description: g.description, targetAmount: Number(g.target_amount),
                        currentAmount: Number(g.current_amount), color: g.color, deadline: g.deadline, isCompleted: g.is_completed
                    }));
                    setGoals(mappedGoals);
                    localStorage.setItem('finvision_cached_goals', JSON.stringify(mappedGoals));
                }

                // Calc avg monthly savings from last 3 months
                const threeMonthsAgo = new Date();
                threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
                const { data: txData } = await sb.from('transactions').select('amount, type')
                    .eq('user_id', u.id).gte('date', threeMonthsAgo.toISOString().split('T')[0]).eq('is_amortization', false);
                if (txData) {
                    let income = 0, expense = 0;
                    txData.forEach((t: any) => {
                        if (t.type === 'INCOME') income += Number(t.amount);
                        else if (t.type === 'EXPENSE') expense += Number(t.amount);
                    });
                    const monthlyAvg = Math.max(0, Math.round((income - expense) / 3));
                    setAvgMonthlySavings(monthlyAvg);
                    localStorage.setItem('finvision_cached_avg_monthly_savings', String(monthlyAvg));
                }
            } else {
                const cachedGoals = localStorage.getItem('finvision_cached_goals');
                if (cachedGoals) {
                    setGoals(JSON.parse(cachedGoals));
                }
                const cachedSavings = localStorage.getItem('finvision_cached_avg_monthly_savings');
                if (cachedSavings) {
                    setAvgMonthlySavings(Number(cachedSavings));
                }
            }
        } catch (err) {
            console.error('Error fetching goals:', err);
        } finally { setIsLoading(false); }
    };

    const openAdd = () => { setEditingGoal(null); setFormData({ name: '', description: '', targetAmount: '', currentAmount: '', color: '#6366f1', deadline: '' }); setShowModal(true); };
    const openEdit = (g: Goal) => {
        setEditingGoal(g);
        setFormData({ name: g.name, description: g.description || '', targetAmount: String(g.targetAmount), currentAmount: String(g.currentAmount), color: g.color, deadline: g.deadline || '' });
        setShowModal(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase) return;
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!u) return;
        try {
            const payload = {
                name: formData.name, description: formData.description,
                target_amount: parseFloat(formData.targetAmount) || 0,
                current_amount: parseFloat(formData.currentAmount) || 0,
                color: formData.color, deadline: formData.deadline || null
            };
            if (editingGoal) {
                await supabase.from('goals').update(payload).eq('id', editingGoal.id);
            } else {
                await supabase.from('goals').insert([{ ...payload, user_id: u.id }]);
            }
            setShowModal(false); fetchData();
        } catch (err: any) { alert(err.message); }
    };

    const handleDelete = async (id: string) => {
        if (!supabase || !confirm('Excluir esta meta?')) return;
        await supabase.from('goals').delete().eq('id', id);
        fetchData();
    };

    const toggleComplete = async (g: Goal) => {
        if (!supabase) return;
        await supabase.from('goals').update({ is_completed: !g.isCompleted, current_amount: !g.isCompleted ? g.targetAmount : g.currentAmount }).eq('id', g.id);
        fetchData();
    };

    const calcETA = (goal: Goal): string => {
        if (avgMonthlySavings <= 0) return 'Configure sua renda mensal';
        const remaining = goal.targetAmount - goal.currentAmount;
        if (remaining <= 0) return 'Meta atingida! 🎉';
        const months = Math.ceil(remaining / avgMonthlySavings);
        if (months > 120) return 'Mais de 10 anos';
        if (months <= 1) return 'Menos de 1 mês';
        return `~${months} ${months === 1 ? 'mês' : 'meses'}`;
    };

    const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

    if (isLoading) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="animate-spin text-brand-600" size={32} />
        </div>
    );

    return (
        <div className="max-w-[1600px] mx-auto px-4 sm:px-10 py-8 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-slate-900">Metas Financeiras</h1>
                        <span className="px-2.5 py-1 bg-brand-50 text-brand-600 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-brand-100">{goals.length} metas</span>
                    </div>
                    <p className="text-sm text-slate-400 font-medium mt-1">Defina objetivos e acompanhe seu progresso com projeções reais.</p>
                </div>
                <button onClick={openAdd} className="flex items-center gap-2 px-6 py-3 bg-brand-900 text-white rounded-2xl text-xs font-bold uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all">
                    <Plus size={16} /> Nova Meta
                </button>
            </div>

            {/* Savings context banner */}
            {avgMonthlySavings > 0 && (
                <div className="bg-brand-50 border border-brand-100 rounded-2xl px-6 py-4 flex items-center gap-4">
                    <TrendingUp size={20} className="text-brand-600 shrink-0" />
                    <p className="text-sm text-brand-700 font-medium">
                        Com base nos últimos 3 meses, sua <strong>poupança mensal média</strong> é de <strong>{fmt(avgMonthlySavings)}</strong> — usada para calcular o tempo estimado de cada meta.
                    </p>
                </div>
            )}

            {/* Goals grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {goals.map(goal => {
                    const pct = Math.min(100, goal.targetAmount > 0 ? Math.round((goal.currentAmount / goal.targetAmount) * 100) : 0);
                    return (
                        <div key={goal.id} className={`bg-white rounded-[32px] border shadow-sm overflow-hidden transition-all hover:shadow-md ${goal.isCompleted ? 'border-emerald-200 opacity-80' : 'border-slate-100'}`}>
                            <div className="p-8 space-y-6">
                                {/* Color accent + name */}
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg" style={{ backgroundColor: goal.color + '20' }}>
                                            <Target size={22} style={{ color: goal.color }} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900 text-lg leading-tight">{goal.name}</h3>
                                            {goal.deadline && (
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                                                    <Calendar size={10} /> {new Date(goal.deadline).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => openEdit(goal)} className="p-2 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors text-xs">✏️</button>
                                        <button onClick={() => handleDelete(goal.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={14} /></button>
                                    </div>
                                </div>

                                {/* Progress bar */}
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs font-bold">
                                        <span className="text-slate-500">{fmt(goal.currentAmount)}</span>
                                        <span className="text-slate-900">{fmt(goal.targetAmount)}</span>
                                    </div>
                                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: goal.color }} />
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-slate-400">{pct}% completo</span>
                                        <span className="text-[10px] font-bold" style={{ color: goal.color }}>ETA: {calcETA(goal)}</span>
                                    </div>
                                </div>

                                {/* Complete toggle */}
                                <button
                                    onClick={() => toggleComplete(goal)}
                                    className={`w-full py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${goal.isCompleted ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                                >
                                    {goal.isCompleted ? <span className="flex items-center justify-center gap-2"><Check size={14} /> Concluída</span> : 'Marcar como Concluída'}
                                </button>
                            </div>
                        </div>
                    );
                })}

                {/* Add button */}
                <button onClick={openAdd} className="rounded-[32px] border-2 border-dashed border-slate-100 p-8 flex flex-col items-center justify-center gap-4 text-slate-300 hover:border-brand-200 hover:text-brand-600 hover:bg-brand-50/30 transition-all min-h-[280px]">
                    <Plus size={32} />
                    <span className="font-bold text-slate-400">Nova Meta</span>
                </button>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-900/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="font-bold text-slate-900">{editingGoal ? 'Editar Meta' : 'Nova Meta Financeira'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50"><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Nome da Meta</label>
                                <input required className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500" placeholder="Ex: Reserva de Emergência" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Valor Alvo (R$)</label>
                                    <input required type="number" step="0.01" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500" placeholder="0.00" value={formData.targetAmount} onChange={e => setFormData({ ...formData, targetAmount: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Já Guardado (R$)</label>
                                    <input type="number" step="0.01" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500" placeholder="0.00" value={formData.currentAmount} onChange={e => setFormData({ ...formData, currentAmount: e.target.value })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Prazo (opcional)</label>
                                    <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500" value={formData.deadline} onChange={e => setFormData({ ...formData, deadline: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Cor</label>
                                    <div className="flex gap-2 flex-wrap mt-1">
                                        {GOAL_COLORS.map(c => (
                                            <button key={c} type="button" onClick={() => setFormData({ ...formData, color: c })}
                                                className={`w-7 h-7 rounded-full transition-transform ${formData.color === c ? 'scale-125 ring-2 ring-offset-1 ring-slate-400' : 'hover:scale-110'}`}
                                                style={{ backgroundColor: c }} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-widest">Cancelar</button>
                                <button type="submit" className="flex-1 px-4 py-3 bg-brand-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-brand-500/20 hover:scale-[1.02] transition-transform">Salvar Meta</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Goals;
