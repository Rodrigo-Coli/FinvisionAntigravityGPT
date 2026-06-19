import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Profile, DashboardData } from '../types';
import {
  TrendingUp,
  Wallet,
  CreditCard as CreditCardIcon,
  Calendar,
  Sparkles,
  ArrowUpRight,
  Target,
  Bell,
  Zap,
  MoreHorizontal,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Plus,
  Check
} from 'lucide-react';
import { DashboardService } from '../services/dashboard.service';
import { DashboardSkeleton } from '../components/Skeleton';
import { DateUtils } from '../lib/dateUtils';
import { HistoryCharts } from '../components/history/HistoryCharts';
import CashFlowProjection from '../components/CashFlowProjection';
import AIChat from '../components/AIChat';
import ContextualHelp from '../components/ContextualHelp';
import { supabase } from '../lib/supabase/client';
import { projectionService } from '../services/projection.service';
import { FinanceService } from '../services/finance.service';

const Home: React.FC<{ user: any }> = ({ user }) => {
  const [data, setData] = useState<DashboardData | null>(() => DashboardService.getCachedSummary());
  const [transactions, setTransactions] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('finvision_cached_home_txs');
      return cached ? JSON.parse(cached) : [];
    } catch (e) { return []; }
  });
  const [projectedData, setProjectedData] = useState<any[]>(() => {
    try {
      if (user?.id) {
        const cached = localStorage.getItem(`finvision_cached_projections_${user.id}`);
        return cached ? JSON.parse(cached) : [];
      }
      return [];
    } catch (e) { return []; }
  });
  const [isLoading, setIsLoading] = useState(!data);
  const [isProjecting, setIsProjecting] = useState(() => {
    try {
      if (user?.id) {
        return !localStorage.getItem(`finvision_cached_projections_${user.id}`);
      }
    } catch (e) {}
    return true;
  });
  const [error, setError] = useState<string | null>(null);
  const [showBalance, setShowBalance] = useState(() => {
    return localStorage.getItem('finvision_privacy') !== 'hidden';
  });
  const navigate = useNavigate();

  const toggleBalance = () => {
    setShowBalance(prev => {
      const next = !prev;
      localStorage.setItem('finvision_privacy', next ? 'visible' : 'hidden');
      return next;
    });
  };

  // State for Chart Filters
  const initialStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
  const initialEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [viewMode, setViewMode] = useState<'ALL' | 'SETTLED'>('ALL');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const primeOfflineCaches = async () => {
    if (!supabase || !navigator.onLine || !user?.id) return;
    try {
      const [accRes, catRes, subRes, entitiesRes] = await Promise.all([
        supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_archived', false),
        supabase.from('categories').select('id, name, type').eq('user_id', user.id).eq('is_archived', false).order('name'),
        supabase.from('subcategories').select('*').eq('user_id', user.id).order('name'),
        FinanceService.getEntities()
      ]);

      if (!accRes.error) {
        localStorage.setItem('finvision_cached_accounts', JSON.stringify(accRes.data || []));
        localStorage.setItem('finvision_cached_accounts_cc', JSON.stringify(accRes.data || []));
      }
      if (!catRes.error) {
        localStorage.setItem('finvision_cached_categories', JSON.stringify(catRes.data || []));
        localStorage.setItem('finvision_cached_categories_cc', JSON.stringify(catRes.data || []));
      }
      if (!subRes.error) {
        localStorage.setItem('finvision_cached_subcategories', JSON.stringify(subRes.data || []));
        localStorage.setItem('finvision_cached_subcategories_cc', JSON.stringify(subRes.data || []));
      }
      if (entitiesRes) {
        localStorage.setItem('finvision_cached_owners', JSON.stringify(entitiesRes));
        localStorage.setItem('finvision_cached_owners_cc', JSON.stringify(entitiesRes));
      }
    } catch (e) {
      console.warn('Erro ao primar caches offline:', e);
    }
  };

  const loadData = async () => {
    try {
      if (navigator.onLine) {
        primeOfflineCaches(); // Silently trigger background cache priming
        const dashboardData = await DashboardService.getSummary();
        setData(dashboardData);
        DashboardService.setCachedSummary(dashboardData);

        // Load 12-month projections
        if (user?.id) {
          const cachedProj = localStorage.getItem(`finvision_cached_projections_${user.id}`);
          if (!cachedProj) {
            setIsProjecting(true);
          }
          const proj = await projectionService.getProjectedCashFlow(user.id, dashboardData.consolidatedBalance, 12);
          setProjectedData(proj);
          localStorage.setItem(`finvision_cached_projections_${user.id}`, JSON.stringify(proj));
          setIsProjecting(false);
        }

        // Fetch bank transactions
        const { data: txs, error: txError } = await supabase
          .from('transactions')
          .select('id, date, type, amount, category, account_id, owner_name, description, is_paid, paid_amount')
          .eq('user_id', user.id)
          .eq('is_deleted', false)
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: false });

        // Fetch card transactions
        const { data: cardTxs, error: cardTxError } = await supabase
          .from('card_transactions')
          .select('id, date, amount, description, owner_name, categories(name)')
          .eq('user_id', user.id)
          .gte('date', startDate)
          .lte('date', endDate);

        // Fetch excluded profiles for client side charting
        const { data: excludedEntities } = await supabase
          .from('entities')
          .select('name')
          .eq('user_id', user.id)
          .eq('include_in_totals', false);

        const excludedSet = new Set((excludedEntities || []).map((e: any) => e.name));

        if (txError || cardTxError) {
          console.error("Error fetching transactions:", txError || cardTxError);
          if (!data) setError('Erro ao carregar transações.');
        } else {
          const normalizedCardTxs = (cardTxs || []).map((ct: any) => ({
            id: ct.id,
            date: ct.date,
            type: 'EXPENSE',
            amount: Number(ct.amount),
            category: ct.categories?.name || 'Cartão de Crédito',
            description: ct.description,
            is_paid: true,
            paid_amount: Number(ct.amount),
            owner_name: ct.owner_name || 'Pessoal'
          }));

          const allTxs = [...(txs || []), ...normalizedCardTxs].filter((t: any) => !t.owner_name || !excludedSet.has(t.owner_name));
          setTransactions(allTxs);
          localStorage.setItem('finvision_cached_home_txs', JSON.stringify(allTxs));
        }
      } else {
        // Offline flow
        const cachedSummary = DashboardService.getCachedSummary();
        if (cachedSummary) {
          setData(cachedSummary);
        }

        if (user?.id) {
          const cachedProj = localStorage.getItem(`finvision_cached_projections_${user.id}`);
          if (cachedProj) {
            setProjectedData(JSON.parse(cachedProj));
          }
          setIsProjecting(false);
        }

        const cachedTxs = localStorage.getItem('finvision_cached_home_txs');
        if (cachedTxs) {
          setTransactions(JSON.parse(cachedTxs));
        }
      }
    } catch (err: any) {
      console.error('Error loading home data:', err);
      // Fallback in case of any throw (e.g. network timeout or query error)
      const cachedSummary = DashboardService.getCachedSummary();
      if (cachedSummary) {
        setData(cachedSummary);
      }
      if (user?.id) {
        const cachedProj = localStorage.getItem(`finvision_cached_projections_${user.id}`);
        if (cachedProj) {
          setProjectedData(JSON.parse(cachedProj));
        }
        setIsProjecting(false);
      }
      const cachedTxs = localStorage.getItem('finvision_cached_home_txs');
      if (cachedTxs) {
        setTransactions(JSON.parse(cachedTxs));
      }
      if (!data && !cachedSummary) setError('Erro ao carregar o resumo financeiro.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      try {
        const cachedProj = localStorage.getItem(`finvision_cached_projections_${user.id}`);
        if (cachedProj) {
          setProjectedData(JSON.parse(cachedProj));
          setIsProjecting(false);
        }
      } catch (e) {}
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) loadData();
  }, [user, startDate, endDate]);

  useEffect(() => {
    const handleSyncCompleted = () => {
      if (user?.id) loadData();
    };
    window.addEventListener('offline-sync-completed', handleSyncCompleted);
    return () => {
      window.removeEventListener('offline-sync-completed', handleSyncCompleted);
    };
  }, [user, startDate, endDate]);

  const format = (v: number) => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2
  }).format(v);

  const getCardLogo = (brand: string) => {
    const b = brand.toLowerCase();
    const fallback = <CreditCardIcon size={18} className="text-slate-400" />;
    if (b.includes('visa')) return <img src="https://www.vectorlogo.zone/logos/visa/visa-ar21.svg" className="h-3 object-contain" alt="Visa" />;
    if (b.includes('master')) return <img src="https://www.vectorlogo.zone/logos/mastercard/mastercard-ar21.svg" className="h-5 object-contain" alt="Mastercard" />;
    if (b.includes('amex')) return <img src="https://www.vectorlogo.zone/logos/amex/amex-ar21.svg" className="h-4 object-contain" alt="Amex" />;
    return fallback;
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-6">
        <AlertCircle className="text-rose-500" size={40} />
        <p className="text-slate-500 font-medium">{error || 'Falha na conexão.'}</p>
        <button onClick={() => window.location.reload()} className="px-6 py-2 bg-brand-900 text-white rounded-xl text-xs font-bold uppercase">Recarregar</button>
      </div>
    );
  }

  const setDatePreset = (days: number | 'MONTH' | 'ALL') => {
    const d = new Date();
    if (days === 'ALL') {
      setStartDate(`${new Date().getFullYear() - 5}-01-01`);
      setEndDate(DateUtils.formatToISODate(new Date()));
    } else if (days === 'MONTH') {
      setStartDate(DateUtils.formatToISODate(new Date(d.getFullYear(), d.getMonth(), 1)));
      setEndDate(DateUtils.formatToISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
    } else {
      const start = new Date(d);
      start.setDate(d.getDate() - days);
      setStartDate(DateUtils.formatToISODate(start));
      setEndDate(DateUtils.formatToISODate(d));
    }
  };

  const handleMonthClick = (month: string, year: number) => {
    const start = `${year}-${month}-01`;
    const lastDay = new Date(year, parseInt(month), 0).getDate();
    const end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    navigate(`/history?startDate=${start}&endDate=${end}`);
  };

  const chartTransactions = viewMode === 'SETTLED' ? transactions.filter(t => !!t.is_paid) : transactions;

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 animate-in fade-in duration-500 min-w-0 pb-24">
      {/* HEADER ROW */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight italic">Visão Geral</h1>
            <ContextualHelp 
              title="Dicas do Dashboard" 
              description="Aqui você monitora seu Patrimônio Líquido e o Fluxo de Caixa projetado. Use o Assistente AI para tirar dúvidas."
            />
          </div>
          <p className="text-sm text-slate-500 font-medium">Monitorando sua saúde financeira com excelência.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/history?add=true')}
            className="flex items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 bg-brand-600 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform active:scale-95"
          >
            <Plus size={16} className="sm:w-[18px] sm:h-[18px]" />
            <span>Novo Lançamento</span>
          </button>
        </div>
      </div>

      {/* BALANCE CARDS GRID */}
      <div className="w-full max-w-full overflow-hidden">
        <div id="tour-net-worth" className="w-full bg-brand-600 rounded-[24px] sm:rounded-[32px] p-5 sm:p-8 text-white relative overflow-hidden shadow-2xl shadow-brand-500/30 group">
          <div className="relative z-10 flex flex-col h-full justify-between gap-6 sm:gap-8">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="text-white/70 text-sm font-medium uppercase tracking-widest text-[10px]">Patrimônio Líquido</p>
                <h2 className={`text-2xl sm:text-4xl font-black tracking-tighter transition-all duration-300 ${!showBalance && 'blur-xl select-none'}`}>
                  {showBalance ? format(data.netWorth) : 'R$ 00.000,00'}
                </h2>
              </div>
              <button
                onClick={toggleBalance}
                className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
                aria-label={showBalance ? "Ocultar saldos do painel" : "Exibir saldos do painel"}
              >
                {showBalance ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>

            <div className="space-y-4">
              <div 
                className={`h-2 w-full rounded-full overflow-hidden flex shadow-inner ${(data.totalAssets || 0) === 0 && (data.totalLiabilities || 0) === 0 ? 'bg-white/20' : 'bg-rose-500'}`}
                role="progressbar"
                aria-valuenow={showBalance ? Math.min(100, Math.max(0, (data.totalAssets || 0) / ((data.totalAssets || 0) + (data.totalLiabilities || 0) || 1) * 100)) : 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Proporção de Ativos versus Passivos"
              >
                <div
                  className={`h-full transition-all duration-1000 ${(data.totalAssets || 0) === 0 && (data.totalLiabilities || 0) === 0 ? 'bg-transparent' : 'bg-emerald-400'} ${!showBalance && 'blur-[2px] bg-white/20'}`}
                  style={{ width: showBalance ? `${Math.min(100, Math.max(0, (data.totalAssets || 0) / ((data.totalAssets || 0) + (data.totalLiabilities || 0) || 1) * 100))}%` : '0%' }}
                />
              </div>
              <div className="flex justify-between items-end text-white text-xs">
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="font-medium text-white/70">Ativos (Bens e Contas)</span>
                  </div>
                  <span className={`font-bold text-sm ${!showBalance && 'blur-sm'}`}>{showBalance ? format(data.totalAssets || 0) : '---'}</span>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1.5 mb-0.5">
                    <div className="w-2 h-2 rounded-full bg-rose-500" />
                    <span className="font-medium text-white/70">Passivos (Dívidas)</span>
                  </div>
                  <span className={`font-bold text-sm ${!showBalance && 'blur-sm'}`}>{showBalance ? format(data.totalLiabilities || 0) : '---'}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 pt-4 border-t border-white/10 text-white font-medium text-[10px] sm:text-xs flex-wrap">
              <div className="px-2 py-0.5 bg-white/20 rounded-md shrink-0">Saldo Bancário Consolidado</div>
              <span className={`font-bold ${!showBalance && 'blur-md'}`}>{showBalance ? format(data.consolidatedBalance) : '---'}</span>
              <button
                onClick={() => navigate('/assets')}
                className="p-1 px-2 border border-white/20 rounded-md flex items-center gap-1 sm:ml-auto cursor-pointer hover:bg-white/10 transition-colors"
              >
                Meus Bens <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CASH FLOW PROJECTION (CONSOLIDATED GRAPHS) */}
      <div id="tour-cash-flow">
        <CashFlowProjection data={projectedData} isLoading={isProjecting} onMonthClick={handleMonthClick} />
      </div>

      {/* MID SECTION: CREDIT CARDS & INSIGHTS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        <div className="lg:col-span-8 space-y-6 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Cartões de Crédito</h3>
            <button onClick={() => navigate('/banking?tab=cards')} className="text-xs font-bold text-brand-600 hover:underline">Ver Mais</button>
          </div>

          {data?.creditCards && data.creditCards.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {data.creditCards.map((card, i) => (
                <div key={i} onClick={() => navigate('/banking?tab=cards')} className="bg-white border border-slate-100/80 rounded-[20px] p-4 shadow-sm hover:border-brand-100 hover:shadow-md transition-all cursor-pointer">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="bg-slate-50 p-2 rounded-lg flex items-center justify-center w-10 h-10">
                        {getCardLogo(card.brand)}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 leading-tight">{card.brand}</p>
                        <p className="text-[10px] text-slate-500">****{card.last4 || '0000'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">limite</p>
                      <p className="text-[10px] font-bold text-slate-600">{showBalance ? format(card.limit || 0) : '---'}</p>
                    </div>
                  </div>
                  <h4 className={`text-lg font-bold text-slate-900 mb-2 ${!showBalance && 'blur-md'}`}>
                    {showBalance ? format(card.current) : 'R$ ••••'}
                  </h4>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={showBalance ? Math.min((card.current / (card.limit || 1)) * 100, 100) : 0} aria-valuemin={0} aria-valuemax={100} aria-label={`Limite utilizado do cartão ${card.brand}`}>
                    <div
                      className={`h-full ${card.color.includes('brand') ? 'bg-brand-500' : 'bg-slate-950'} rounded-full opacity-60 transition-all duration-1000 ${!showBalance && 'blur-[2px] bg-slate-300'}`}
                      style={{ width: showBalance ? `${Math.min((card.current / (card.limit || 1)) * 100, 100)}%` : '0%' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-[24px] p-6 text-center space-y-4 shadow-sm">
              <CreditCardIcon size={32} className="text-slate-400 mx-auto" />
              <div>
                <p className="text-sm font-bold text-slate-800">Nenhum Cartão Cadastrado</p>
                <p className="text-xs text-slate-500 mt-1">Cadastre seus cartões de crédito para acompanhar faturas e limites diretamente no dashboard.</p>
              </div>
              <button
                onClick={() => navigate('/banking?tab=cards')}
                className="px-5 py-2.5 bg-brand-50 text-brand-700 hover:bg-brand-100 text-xs font-bold rounded-xl transition-colors inline-block"
              >
                Cadastrar Primeiro Cartão
              </button>
            </div>
          )}

          {/* HISTÓRICO DE DESPESAS */}
          <div className="mt-4 sm:mt-8 space-y-3">
            <h3 className="text-lg font-black text-slate-900 italic">Análise de Fluxo</h3>
            <div className="flex flex-col gap-3 bg-white p-3 sm:p-4 rounded-3xl border border-slate-100 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={() => setDatePreset('MONTH')} className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${startDate === DateUtils.formatToISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>Este Mês</button>
                  <button onClick={() => setDatePreset(30)} className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-slate-50 text-slate-500 hover:bg-slate-100 transition-all">30 Dias</button>
                  <button onClick={() => setDatePreset(90)} className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider bg-slate-50 text-slate-500 hover:bg-slate-100 transition-all">3 Meses</button>
                </div>
                <div className="hidden sm:block flex-1" />
                <div className="flex bg-slate-100 p-1 rounded-xl gap-1 w-full sm:w-auto">
                  <button onClick={() => setViewMode('ALL')} className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${viewMode === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Todos</button>
                  <button onClick={() => setViewMode('SETTLED')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${viewMode === 'SETTLED' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}><Check size={10} /> Pagos</button>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
                <Calendar size={13} className="text-slate-500 shrink-0" />
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-[11px] font-bold outline-none flex-1 min-w-0" />
                <span className="text-slate-300 shrink-0">–</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-[11px] font-bold outline-none flex-1 min-w-0" />
              </div>
            </div>
            <HistoryCharts 
              transactions={chartTransactions} 
              startDate={startDate} 
              endDate={endDate} 
              onCategoryClick={(cat) => navigate(`/history?category=${encodeURIComponent(cat)}`)} 
              onMonthClick={handleMonthClick}
            />
          </div>
        </div>

        {/* AI CHAT */}
        <div className="lg:col-span-4 space-y-4 min-w-0">
          <h3 className="text-lg font-bold text-slate-900">Assistente AI Interativo</h3>
          <div className="h-[420px] sm:h-[500px] lg:h-[700px]">
            <AIChat userId={user?.id || ''} startDate={startDate} endDate={endDate} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
