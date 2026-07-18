import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, X, Loader2, AlertTriangle, Check, TrendingDown, Target, Trash2, Calendar, TrendingUp, PieChart, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import { Budget, Goal } from '../types';
import { useToast } from '../contexts/ToastContext';

const BUDGET_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b'
];

const DEFAULT_CATEGORIES = [
  'Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Educação', 'Lazer', 'Vestuário', 'Serviços', 'Investimentos', 'Outros'
];

const GOAL_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'
];

const Planning: React.FC<{ user: any }> = ({ user }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Tab State
  const [activeTab, setActiveTab] = useState<'budget' | 'goals'>(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    return tab === 'goals' ? 'goals' : 'budget';
  });

  // Common State
  const [isLoading, setIsLoading] = useState(true);

  // Budget States
  const [budgets, setBudgets] = useState<Budget[]>(() => {
    const cached = localStorage.getItem('finvision_cached_budgets');
    return cached ? JSON.parse(cached) : [];
  });
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [totalMonthly, setTotalMonthly] = useState(() => {
    const cached = localStorage.getItem('finvision_cached_budget_spending');
    if (cached) {
      const parsed = JSON.parse(cached);
      return parsed.totalMonthly || 0;
    }
    return 0;
  });
  const [budgetFormData, setBudgetFormData] = useState({ category: '', monthlyLimit: '', color: '#6366f1' });
  const [currentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Goals States
  const [goals, setGoals] = useState<Goal[]>(() => {
    const cached = localStorage.getItem('finvision_cached_goals');
    return cached ? JSON.parse(cached) : [];
  });
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [avgMonthlySavings, setAvgMonthlySavings] = useState(() => {
    const cached = localStorage.getItem('finvision_cached_avg_monthly_savings');
    return cached ? Number(cached) : 0;
  });
  const [goalFormData, setGoalFormData] = useState({
    name: '', description: '', targetAmount: '', currentAmount: '', color: '#6366f1', deadline: ''
  });

  // Sync tab with URL
  const handleTabChange = (tab: 'budget' | 'goals') => {
    setActiveTab(tab);
    navigate(`/planning?tab=${tab}`, { replace: true });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'goals' && activeTab !== 'goals') {
      setActiveTab('goals');
    } else if (tab !== 'goals' && activeTab !== 'budget') {
      setActiveTab('budget');
    }
  }, [location.search]);

  useEffect(() => {
    const cachedBudgets = localStorage.getItem('finvision_cached_budgets');
    const cachedGoals = localStorage.getItem('finvision_cached_goals');
    const hasCache = !!cachedBudgets && !!cachedGoals;
    
    fetchData(hasCache);
  }, []);

  const fetchData = async (silent = false) => {
    const sb = supabase;
    if (!sb) return;
    if (!silent) setIsLoading(true);
    try {
      if (navigator.onLine) {
        const { data: { session } } = await sb.auth.getSession();
        const u = session?.user;
        if (!u) return;

        // Run fetches in parallel
        const startOfMonth = `${currentMonth}-01`;
        // Calcula o último dia do mês SEM passar por new Date('YYYY-MM-DD')/toISOString():
        // esse par interpreta a string como UTC e, em fusos atrás de UTC (Brasil),
        // devolvia o último dia do MÊS ANTERIOR — o range ficava invertido
        // (ex: 01/07 até 30/06) e o gasto do orçamento saía sempre R$ 0.
        const [pyYear, pyMonth] = currentMonth.split('-').map(Number);
        const lastDayOfMonth = new Date(pyYear, pyMonth, 0).getDate();
        const endOfMonth = `${currentMonth}-${String(lastDayOfMonth).padStart(2, '0')}`;
        
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const threeMonthsAgoStr = threeMonthsAgo.toISOString().split('T')[0];

        const [budgetsRes, txCurrentMonthRes, goalsRes, txSavingsRes] = await Promise.all([
          sb.from('budgets').select('*').eq('user_id', u.id).eq('is_active', true),
          sb.from('transactions')
            .select('amount, category, type')
            .eq('user_id', u.id)
            .eq('type', 'EXPENSE')
            .eq('is_amortization', false)
            .gte('date', startOfMonth)
            .lte('date', endOfMonth),
          sb.from('goals').select('*').eq('user_id', u.id).order('created_at', { ascending: false }),
          sb.from('transactions')
            .select('amount, type, date')
            .eq('user_id', u.id)
            .gte('date', threeMonthsAgoStr)
            .eq('is_amortization', false)
        ]);

        // Process Budgets & Current Month Spent
        const spendingByCategory: Record<string, number> = {};
        let monthTotal = 0;
        (txCurrentMonthRes.data || []).forEach((t: any) => {
          const cat = t.category || 'Outros';
          spendingByCategory[cat] = (spendingByCategory[cat] || 0) + Number(t.amount);
          monthTotal += Number(t.amount);
        });
        setTotalMonthly(monthTotal);
        localStorage.setItem('finvision_cached_budget_spending', JSON.stringify({ totalMonthly: monthTotal, spendingByCategory }));

        if (budgetsRes.data) {
          const mappedBudgets = budgetsRes.data.map((b: any) => ({
            id: b.id, category: b.category, monthlyLimit: Number(b.monthly_limit),
            color: b.color, isActive: b.is_active,
            currentMonthSpent: spendingByCategory[b.category] || 0
          }));
          setBudgets(mappedBudgets);
          localStorage.setItem('finvision_cached_budgets', JSON.stringify(mappedBudgets));
        }

        // Process Goals & Savings Rate
        if (goalsRes.data) {
          const mappedGoals = goalsRes.data.map((g: any) => ({
            id: g.id, name: g.name, description: g.description, targetAmount: Number(g.target_amount),
            currentAmount: Number(g.current_amount), color: g.color, deadline: g.deadline, isCompleted: g.is_completed
          }));
          setGoals(mappedGoals);
          localStorage.setItem('finvision_cached_goals', JSON.stringify(mappedGoals));
        }

        if (txSavingsRes.data) {
          let income = 0, expense = 0;
          txSavingsRes.data.forEach((t: any) => {
            if (t.type === 'INCOME') income += Number(t.amount);
            else if (t.type === 'EXPENSE') expense += Number(t.amount);
          });

          // Dynamic months span calculation to prevent distortion for new accounts
          let monthsSpan = 3;
          if (txSavingsRes.data.length > 0) {
            const dates = txSavingsRes.data.map((t: any) => new Date(t.date).getTime());
            const minDate = new Date(Math.min(...dates));
            const today = new Date();
            const diffTime = Math.abs(today.getTime() - minDate.getTime());
            const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
            monthsSpan = Math.max(1, Math.min(3, diffMonths));
          }

          const monthlyAvg = Math.max(0, Math.round((income - expense) / monthsSpan));
          setAvgMonthlySavings(monthlyAvg);
          localStorage.setItem('finvision_cached_avg_monthly_savings', String(monthlyAvg));
        }
      } else {
        // Offline Load
        const cachedBudgets = localStorage.getItem('finvision_cached_budgets');
        if (cachedBudgets) setBudgets(JSON.parse(cachedBudgets));

        const cachedSpending = localStorage.getItem('finvision_cached_budget_spending');
        if (cachedSpending) {
          const parsed = JSON.parse(cachedSpending);
          setTotalMonthly(parsed.totalMonthly || 0);
        }

        const cachedGoals = localStorage.getItem('finvision_cached_goals');
        if (cachedGoals) setGoals(JSON.parse(cachedGoals));

        const cachedSavings = localStorage.getItem('finvision_cached_avg_monthly_savings');
        if (cachedSavings) setAvgMonthlySavings(Number(cachedSavings));
      }
    } catch (err) {
      console.error('Error fetching planning data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Budget Actions
  const openAddBudget = () => {
    setEditingBudget(null);
    setBudgetFormData({ category: DEFAULT_CATEGORIES[0], monthlyLimit: '', color: '#6366f1' });
    setShowBudgetModal(true);
  };

  const openEditBudget = (b: Budget) => {
    setEditingBudget(b);
    setBudgetFormData({ category: b.category, monthlyLimit: String(b.monthlyLimit), color: b.color });
    setShowBudgetModal(true);
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || isSavingBudget) return;
    const { data: { session } } = await supabase.auth.getSession();
    const u = session?.user;
    if (!u) return;
    setIsSavingBudget(true);
    try {
      const limitVal = parseFloat(budgetFormData.monthlyLimit);
      if (isNaN(limitVal) || limitVal < 0) {
        toast("Por favor, insira um limite mensal válido e positivo.", 'warning');
        return;
      }

      const payload = {
        category: budgetFormData.category,
        monthly_limit: limitVal,
        color: budgetFormData.color
      };

      if (editingBudget) {
        await supabase.from('budgets').update(payload).eq('id', editingBudget.id);
      } else {
        await supabase.from('budgets').insert([{ ...payload, user_id: u.id }]);
      }
      setShowBudgetModal(false);
      fetchData();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setIsSavingBudget(false);
    }
  };

  const handleDeleteBudget = async (id: string) => {
    if (!supabase || !confirm('Remover este limite de orçamento?')) return;
    try {
      await supabase.from('budgets').delete().eq('id', id);
      fetchData();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  // Goal Actions
  const openAddGoal = () => {
    setEditingGoal(null);
    setGoalFormData({ name: '', description: '', targetAmount: '', currentAmount: '', color: '#6366f1', deadline: '' });
    setShowGoalModal(true);
  };

  const openEditGoal = (g: Goal) => {
    setEditingGoal(g);
    setGoalFormData({
      name: g.name,
      description: g.description || '',
      targetAmount: String(g.targetAmount),
      currentAmount: String(g.currentAmount),
      color: g.color,
      deadline: g.deadline || ''
    });
    setShowGoalModal(true);
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || isSavingGoal) return;
    const { data: { session } } = await supabase.auth.getSession();
    const u = session?.user;
    if (!u) return;
    setIsSavingGoal(true);
    try {
      const targetVal = parseFloat(goalFormData.targetAmount);
      const currentVal = parseFloat(goalFormData.currentAmount) || 0;

      if (isNaN(targetVal) || targetVal <= 0) {
        toast("Por favor, insira um valor alvo válido maior que zero.", 'warning');
        return;
      }
      if (currentVal < 0) {
        toast("O valor já guardado não pode ser negativo.", 'warning');
        return;
      }

      const payload = {
        name: goalFormData.name,
        description: goalFormData.description,
        target_amount: targetVal,
        current_amount: currentVal,
        color: goalFormData.color,
        deadline: goalFormData.deadline || null
      };

      if (editingGoal) {
        await supabase.from('goals').update(payload).eq('id', editingGoal.id);
      } else {
        await supabase.from('goals').insert([{ ...payload, user_id: u.id }]);
      }
      setShowGoalModal(false);
      fetchData();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setIsSavingGoal(false);
    }
  };

  const handleDeleteGoal = async (id: string) => {
    if (!supabase || !confirm('Excluir esta meta?')) return;
    try {
      await supabase.from('goals').delete().eq('id', id);
      fetchData();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const toggleCompleteGoal = async (g: Goal) => {
    if (!supabase) return;
    try {
      await supabase.from('goals').update({
        is_completed: !g.isCompleted,
        current_amount: !g.isCompleted ? g.targetAmount : g.currentAmount
      }).eq('id', g.id);
      fetchData();
    } catch (err: any) {
      toast(err.message, 'error');
    }
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

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(v);

  const getBudgetStatus = (spent: number, limit: number) => {
    const pct = limit > 0 ? (spent / limit) * 100 : 100;
    if (pct >= 100) return { label: 'Estourado', color: 'text-rose-600', bg: 'bg-rose-500', bgLight: 'bg-rose-50', pct: 100 };
    if (pct >= 80) return { label: 'Atenção', color: 'text-amber-600', bg: 'bg-amber-500', bgLight: 'bg-amber-50', pct };
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
      
      {/* Header Unificado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">Planejamento Financeiro</h1>
          </div>
          <p className="text-sm text-slate-400 font-medium mt-1">
            Gerencie seus limites de gastos e defina seus objetivos de médio e longo prazo.
          </p>
        </div>
        
        {/* Alternância de Abas Premium - mobile only; no menu lateral tem submenu equivalente no desktop */}
        <div className="hidden bg-slate-100 p-1.5 rounded-2xl border border-slate-200/50 shadow-sm shrink-0">
          <button
            onClick={() => handleTabChange('budget')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'budget'
                ? 'bg-white text-brand-900 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <PieChart size={16} />
            Orçamentos
          </button>
          <button
            onClick={() => handleTabChange('goals')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'goals'
                ? 'bg-white text-brand-900 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Target size={16} />
            Metas
          </button>
        </div>
      </div>

      {/* RENDER ORÇAMENTOS */}
      {activeTab === 'budget' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* Orçamentos Summary Banner */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50 border border-slate-100 rounded-[28px] p-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">Resumo de Limites</span>
                {overBudgetCount > 0 && (
                  <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-rose-100">
                    {overBudgetCount} estourados
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Competência: {currentMonth.split('-').reverse().join('/')}
              </p>
            </div>
            <button
              onClick={openAddBudget}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:scale-105 active:scale-95 transition-all"
            >
              <Plus size={14} /> Novo Limite
            </button>
          </div>

          {/* Cards de Orçamento */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: 'Total Orçado', value: fmt(totalBudgeted), sub: 'Limite total definido', color: 'text-slate-900' },
              { label: 'Total Gasto', value: fmt(totalSpent), sub: 'Nas categorias com limite', color: totalSpent > totalBudgeted ? 'text-rose-600' : 'text-emerald-600' },
              { label: 'Disponível Restante', value: fmt(Math.max(0, totalBudgeted - totalSpent)), sub: 'Saldo disponível no mês', color: 'text-brand-600' },
            ].map((c, i) => (
              <div key={i} className="bg-white border border-slate-100 rounded-[28px] p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{c.label}</p>
                  <p className={`text-2xl font-bold mt-1.5 tracking-tight italic ${c.color}`}>{c.value}</p>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 font-medium">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Listagem de Limites por Categoria */}
          <div className="bg-white border border-slate-100 rounded-[32px] shadow-sm overflow-hidden">
            <div className="px-8 py-5 border-b border-slate-50 flex items-center justify-between bg-slate-50/20">
              <span className="font-black text-slate-400 text-[9px] uppercase tracking-widest">Categoria de Despesa</span>
              <span className="font-black text-slate-400 text-[9px] uppercase tracking-widest">Gasto / Limite Configurado</span>
            </div>
            {budgets.length === 0 ? (
              <div className="py-20 text-center text-slate-350">
                <TrendingDown size={40} className="mx-auto mb-4 text-slate-300" />
                <p className="font-bold uppercase tracking-widest text-xs">Nenhum limite configurado</p>
                <p className="text-[10px] text-slate-400 mt-1">Defina limites para suas principais despesas mensais.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {budgets.map(b => {
                  const status = getBudgetStatus(b.currentMonthSpent || 0, b.monthlyLimit);
                  return (
                    <div key={b.id} className="px-8 py-6 hover:bg-slate-50/30 transition-all group">
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-3">
                          <div className="w-3.5 h-3.5 rounded-full shadow-sm" style={{ backgroundColor: b.color }} />
                          <span className="font-bold text-slate-900 text-sm">{b.category}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={`text-xs font-bold ${status.color}`}>
                            {fmt(b.currentMonthSpent || 0)} / {fmt(b.monthlyLimit)}
                          </span>
                          <div className="flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEditBudget(b)}
                              aria-label={`Editar limite de ${b.category}`}
                              className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => handleDeleteBudget(b.id)}
                              aria-label={`Excluir limite de ${b.category}`}
                              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${status.bg}`} style={{ width: `${status.pct}%` }} />
                      </div>
                      <div className="flex justify-between mt-2">
                        <span className={`text-[9px] font-bold uppercase tracking-widest ${status.color}`}>{status.label}</span>
                        <span className="text-[9px] font-bold text-slate-400">{Math.round(status.pct)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RENDER METAS */}
      {activeTab === 'goals' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* Savings banner context */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-brand-50 border border-brand-100 rounded-[28px] p-6">
            <div className="flex items-center gap-3.5">
              <TrendingUp size={20} className="text-brand-600 shrink-0" />
              <div>
                <p className="text-xs text-brand-700 font-bold uppercase tracking-wider">Histórico de Poupança</p>
                <p className="text-sm text-brand-800 font-medium mt-0.5">
                  Poupança média (últimos 3 meses): <strong>{fmt(avgMonthlySavings)} /mês</strong>
                </p>
              </div>
            </div>
            <button
              onClick={openAddGoal}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:scale-105 active:scale-95 transition-all"
            >
              <Plus size={14} /> Nova Meta
            </button>
          </div>

          {/* Grid de Metas */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {goals.map(goal => {
              const pct = Math.min(100, goal.targetAmount > 0 ? Math.round((goal.currentAmount / goal.targetAmount) * 100) : 0);
              return (
                <div
                  key={goal.id}
                  className={`bg-white rounded-[32px] border shadow-sm overflow-hidden transition-all hover:shadow-md ${
                    goal.isCompleted ? 'border-emerald-200 opacity-85 bg-emerald-50/5' : 'border-slate-100'
                  }`}
                >
                  <div className="p-8 space-y-6">
                    {/* Header Card */}
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg" style={{ backgroundColor: goal.color + '20' }}>
                          <Target size={22} style={{ color: goal.color }} />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-base leading-tight truncate max-w-[170px]">{goal.name}</h3>
                          {goal.deadline && (
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 mt-1">
                              <Calendar size={10} /> {new Date(goal.deadline).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditGoal(goal)}
                          aria-label={`Editar meta ${goal.name}`}
                          className="p-1.5 text-slate-350 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteGoal(goal.id)}
                          aria-label={`Excluir meta ${goal.name}`}
                          className="p-1.5 text-slate-350 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-500">{fmt(goal.currentAmount)}</span>
                        <span className="text-slate-950">{fmt(goal.targetAmount)}</span>
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: goal.color,
                            backgroundImage: `linear-gradient(to right, ${goal.color}, ${goal.color}dd)`
                          }}
                        />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400">{pct}% completo</span>
                        <span className="text-[10px] font-bold" style={{ color: goal.color }}>ETA: {calcETA(goal)}</span>
                      </div>
                    </div>

                    {/* Toggle complete */}
                    <button
                      onClick={() => toggleCompleteGoal(goal)}
                      className={`w-full py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                        goal.isCompleted
                          ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100'
                          : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-100'
                      }`}
                    >
                      {goal.isCompleted ? (
                        <span className="flex items-center justify-center gap-2">
                          <Check size={14} /> Concluída
                        </span>
                      ) : (
                        'Marcar como Concluída'
                      )}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Dotted add button */}
            <button
              onClick={openAddGoal}
              className="rounded-[32px] border-2 border-dashed border-slate-200 p-8 flex flex-col items-center justify-center gap-4 text-slate-300 hover:border-brand-200 hover:text-brand-600 hover:bg-brand-50/20 transition-all min-h-[260px] w-full"
            >
              <Plus size={32} />
              <span className="font-bold text-slate-500 text-xs uppercase tracking-wider">Nova Meta</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL ORÇAMENTO */}
      {showBudgetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-[32px] w-full max-w-sm shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
                {editingBudget ? 'Editar Limite' : 'Novo Limite de Orçamento'}
              </h3>
              <button
                onClick={() => setShowBudgetModal(false)}
                className="text-slate-400 hover:text-slate-650 p-1.5 rounded-lg hover:bg-slate-50"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveBudget} className="p-6 space-y-4">
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Categoria</label>
                {editingBudget ? (
                  <p className="font-bold text-slate-900 py-3 px-4 bg-slate-50 border border-slate-100 rounded-xl">{budgetFormData.category}</p>
                ) : (
                  <select
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500"
                    value={budgetFormData.category}
                    onChange={e => setBudgetFormData({ ...budgetFormData, category: e.target.value })}
                  >
                    {DEFAULT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Limite Mensal (R$)</label>
                <input
                  required
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500"
                  placeholder="0.00"
                  value={budgetFormData.monthlyLimit}
                  onChange={e => setBudgetFormData({ ...budgetFormData, monthlyLimit: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Cor Identificadora</label>
                <div className="flex gap-2 flex-wrap mt-1">
                  {BUDGET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setBudgetFormData({ ...budgetFormData, color: c })}
                      aria-label={`Selecionar cor ${c}`}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        budgetFormData.color === c ? 'scale-125 ring-2 ring-offset-1 ring-slate-450' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowBudgetModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingBudget}
                  className="flex-1 px-4 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-brand-500/20 hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {isSavingBudget ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL METAS */}
      {showGoalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
                {editingGoal ? 'Editar Meta' : 'Nova Meta Financeira'}
              </h3>
              <button
                onClick={() => setShowGoalModal(false)}
                className="text-slate-400 hover:text-slate-650 p-1.5 rounded-lg hover:bg-slate-50"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveGoal} className="p-6 space-y-4">
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Nome da Meta</label>
                <input
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500"
                  placeholder="Ex: Reserva de Emergência"
                  value={goalFormData.name}
                  onChange={e => setGoalFormData({ ...goalFormData, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Valor Alvo (R$)</label>
                  <input
                    required
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500"
                    placeholder="0.00"
                    value={goalFormData.targetAmount}
                    onChange={e => setGoalFormData({ ...goalFormData, targetAmount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Já Guardado (R$)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500"
                    placeholder="0.00"
                    value={goalFormData.currentAmount}
                    onChange={e => setGoalFormData({ ...goalFormData, currentAmount: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Prazo Estimado</label>
                  <input
                    type="date"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500"
                    value={goalFormData.deadline}
                    onChange={e => setGoalFormData({ ...goalFormData, deadline: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Cor da Categoria</label>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {GOAL_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setGoalFormData({ ...goalFormData, color: c })}
                        aria-label={`Selecionar cor ${c}`}
                        className={`w-7 h-7 rounded-full transition-transform ${
                          goalFormData.color === c ? 'scale-125 ring-2 ring-offset-1 ring-slate-450' : 'hover:scale-110'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowGoalModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingGoal}
                  className="flex-1 px-4 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-brand-500/20 hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {isSavingGoal ? 'Salvando...' : 'Salvar Meta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Planning;
