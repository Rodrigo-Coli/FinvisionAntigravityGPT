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
import { DateUtils } from '../lib/dateUtils';
import { useTour } from '../contexts/TourContext';
import { HistoryCharts } from '../components/history/HistoryCharts';
import CashFlowProjection from '../components/CashFlowProjection';
import { supabase } from '../lib/supabase/client';

const Home: React.FC<{ user: any }> = ({ user }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
    const loadData = async () => {
      try {
        const dashboardData = await DashboardService.getSummary(); // Changed from dashboardService.getDashboardData() to DashboardService.getSummary() to match original
        setData(dashboardData);

        // If the user wants a large range, we should ideally fetch dynamically,
        // but for now, we'll fetch a wider net from the DB and let the component filter it.
        // We fetch from the selected startDate to the selected endDate.
        const { data: txs, error: txError } = await supabase
          .from('transactions')
          .select('id, date, type, amount, category, account_id, owner_name, description, is_paid, paid_amount')
          .eq('user_id', user.id)
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: false });

        if (txError) {
          console.error("Error fetching transactions:", txError);
          setError('Erro ao carregar transações.');
        } else if (txs) {
          setTransactions(txs);
        }
      } catch (err: any) {
        setError('Erro ao carregar o resumo financeiro.');
      } finally {
        setIsLoading(false);
      }
    };
    if (user?.id) loadData();
  }, [user, startDate, endDate]);

  const format = (v: number) => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2
  }).format(v);

  // Helper function for credit card icons matching image
  const getCardLogo = (brand: string) => {
    const b = brand.toLowerCase();
    const fallback = <CreditCardIcon size={18} className="text-slate-400" />;

    // Usando URLs mais estáveis e leves (Vector Logo Zone)
    if (b.includes('visa')) return <img src="https://www.vectorlogo.zone/logos/visa/visa-ar21.svg" className="h-3 object-contain" alt="Visa" onError={(e) => (e.currentTarget.style.display = 'none')} />;
    if (b.includes('master')) return <img src="https://www.vectorlogo.zone/logos/mastercard/mastercard-ar21.svg" className="h-5 object-contain" alt="Mastercard" onError={(e) => (e.currentTarget.style.display = 'none')} />;
    if (b.includes('amex')) return <img src="https://www.vectorlogo.zone/logos/amex/amex-ar21.svg" className="h-4 object-contain" alt="Amex" onError={(e) => (e.currentTarget.style.display = 'none')} />;

    return fallback;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <div className="w-10 h-10 border-2 border-slate-200 border-t-brand-600 rounded-full animate-spin" />
        <p className="text-slate-400 font-medium tracking-widest text-[10px] uppercase">Carregando FinVision...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-6">
        <AlertCircle className="text-rose-500" size={40} />
        <p className="text-slate-500 font-medium">{error || 'Falha na conexão.'}</p>
        <button onClick={() => window.location.reload()} className="px-6 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase">Recarregar</button>
      </div>
    );
  }

  const setDatePreset = (days: number | 'MONTH' | 'ALL') => {
    const d = new Date();
    if (days === 'ALL') {
      setStartDate(`${new Date().getFullYear() - 5}-01-01`); // 5 years back
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

  const chartTransactions = viewMode === 'SETTLED' ? transactions.filter(t => !!t.is_paid) : transactions;

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 animate-in fade-in duration-500 min-w-0">
      {/* HEADER ROW */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Visão Geral</h1>
          <p className="text-sm text-slate-400 font-medium">Monitorando sua saúde financeira com excelência.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-3 bg-white border border-slate-100 rounded-xl text-slate-400 hover:text-slate-900 transition-colors shadow-sm relative">
            <Bell size={20} />
            <div className="absolute top-3 right-3 w-2 h-2 bg-rose-500 rounded-full border-2 border-white" />
          </button>
          <button
            onClick={() => navigate('/history')}
            className="flex items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 bg-brand-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform active:scale-95"
          >
            <Plus size={18} />
            <span className="hidden xs:inline">Novo</span><span className="hidden sm:inline"> Lançamento</span>
          </button>
        </div>
      </div>

      {/* BALANCE CARDS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
        <div id="tour-net-worth" className="lg:col-span-3 bg-brand-600 rounded-[24px] sm:rounded-[32px] p-6 sm:p-8 text-white relative overflow-hidden shadow-2xl shadow-brand-500/30 group">

          <div className="relative z-10 flex flex-col h-full justify-between gap-6 sm:gap-8">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="text-white/70 text-sm font-medium uppercase tracking-widest text-[10px]">Patrimônio Líquido</p>
                <h2 className={`text-4xl sm:text-5xl font-bold tracking-tight transition-all duration-300 ${!showBalance && 'blur-xl select-none'}`}>
                  {showBalance ? format(data.netWorth) : 'R$ 00.000,00'}
                </h2>
              </div>
              <button
                onClick={toggleBalance}
                className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
              >
                {showBalance ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>

            <div className="space-y-4">
              {/* Assets vs Liabilities Breakdown Bar */}
              <div className={`h-2 w-full rounded-full overflow-hidden flex shadow-inner ${(data.totalAssets || 0) === 0 && (data.totalLiabilities || 0) === 0 ? 'bg-white/20' : 'bg-rose-500'}`}>
                <div
                  className={`h-full transition-all duration-1000 ${(data.totalAssets || 0) === 0 && (data.totalLiabilities || 0) === 0 ? 'bg-transparent' : 'bg-emerald-400'}`}
                  style={{ width: `${Math.min(100, Math.max(0, (data.totalAssets || 0) / ((data.totalAssets || 0) + (data.totalLiabilities || 0) || 1) * 100))}%` }}
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

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-2 pt-4 border-t border-white/10 text-white font-medium text-xs">
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

        <div className="flex flex-col gap-4">
          {/* Growth Widget */}
          <div
            onClick={() => navigate('/assets')}
            className="flex-1 bg-white border border-slate-100 rounded-[24px] p-6 shadow-sm flex flex-col justify-between group cursor-pointer hover:border-brand-200 transition-all"
          >
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Crescimento</p>
              <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg"><ArrowUpRight size={14} /></div>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{data.netWorthGrowth ? `${data.netWorthGrowth.toFixed(1)}%` : '--'}</h3>
              <p className="text-[10px] text-slate-400 font-medium">Crescimento Patrimonial</p>
            </div>
          </div>

          <div
            onClick={() => navigate('/history')}
            className="flex-1 bg-white border border-slate-100 rounded-[24px] p-6 shadow-sm flex flex-col justify-between group cursor-pointer hover:border-brand-200 transition-all"
          >
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Despesas</p>
              <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg"><ArrowDownRight size={14} className="rotate-0" /></div>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{format(data.totalExpenses || 0)}</h3>
              <p className="text-[10px] text-slate-400 font-medium">Este Mês (Estimado)</p>
            </div>
          </div>
        </div>
      </div>

      {/* SMART ALERTS */}
      {data?.alerts && data.alerts.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.alerts.map((alert: any) => (
            <div key={alert.id} className={`flex items-start gap-4 p-4 rounded-2xl border ${alert.type === 'critical' ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-orange-50 border-orange-100 text-orange-700'}`}>
              <AlertCircle size={20} className="shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold uppercase tracking-widest text-[10px] mb-0.5">Alerta Inteligente</p>
                <p className="text-sm font-medium">{alert.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CASH FLOW PROJECTION (12 MONTHS) */}
      <div id="tour-cash-flow">
        <CashFlowProjection userId={user?.id} />
      </div>

      {/* MID SECTION: CREDIT CARDS & INSIGHTS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        <div className="lg:col-span-8 space-y-6 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Cartões de Crédito</h3>
            <button onClick={() => navigate('/cards')} className="text-xs font-bold text-brand-600 hover:underline">Ver Mais</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data?.creditCards?.map((card, i) => (
              <div key={i} onClick={() => navigate('/cards')} className="bg-white border border-slate-100/80 rounded-[24px] p-5 shadow-sm hover:border-brand-100 transition-all group cursor-pointer">
                <div className="flex justify-between items-start mb-4">
                  <div className="bg-slate-50 p-2 py-3 rounded-lg flex items-center justify-center min-w-[50px]">
                    {getCardLogo(card.brand)}
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-900">{card.brand}</p>
                    <p className="text-[10px] text-slate-400 tracking-widest">****1234</p>
                  </div>
                </div>

                <div className="flex items-end justify-between">
                  <div className="space-y-0.5">
                    <h4 className={`text-xl font-bold text-slate-900 ${!showBalance && 'blur-md'}`}>{showBalance ? format(card.current) : 'R$ ••••'}</h4>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-slate-400 font-medium italic">de {format(card.limit || 0)}</p>
                  </div>
                </div>
                <div className="mt-4 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${card.color.includes('brand') ? 'bg-brand-500' : 'bg-slate-950'} rounded-full opacity-60 transition-all duration-1000`}
                    style={{ width: `${Math.min((card.current / (card.limit || 1)) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {(!data?.creditCards || data.creditCards.length === 0) && (
              <div onClick={() => navigate('/cards')} className="col-span-1 md:col-span-2 py-10 border border-dashed border-slate-200 rounded-[24px] flex flex-col items-center justify-center grayscale opacity-50 cursor-pointer hover:opacity-100 transition-opacity">
                <CreditCardIcon size={40} className="text-slate-300" />
                <p className="text-xs font-bold text-slate-400 uppercase mt-4">Nenhum cartão encontrado</p>
              </div>
            )}
          </div>

          {/* HISTÓRICO DE DESPESAS (CHART) */}
          <div className="mt-6 sm:mt-8 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Gráficos de Lançamentos</h3>

            {/* QUICK DATE FILTERS + CUSTOM RANGE + VIEW MODE TOGGLE (Abridged for Home) */}
            <div className="flex flex-col xl:flex-row items-start xl:items-center gap-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setDatePreset('MONTH')} className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${startDate === DateUtils.formatToISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>Este Mês</button>
                <button onClick={() => setDatePreset(30)} className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all bg-slate-50 text-slate-500 hover:bg-slate-100`}>30 Dias</button>
                <button onClick={() => setDatePreset(90)} className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all bg-slate-50 text-slate-500 hover:bg-slate-100`}>3 Meses</button>
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100">
                <Calendar size={14} className="text-slate-400" />
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-[11px] font-bold outline-none w-28" />
                <span className="text-slate-300">/</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-[11px] font-bold outline-none w-28" />
              </div>

              <div className="hidden xl:block flex-1" />

              <div className="flex bg-slate-100 p-1 rounded-xl gap-1 w-full xl:w-auto">
                <button
                  onClick={() => setViewMode('ALL')}
                  className={`flex-1 xl:flex-none px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${viewMode === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setViewMode('SETTLED')}
                  className={`flex-1 xl:flex-none flex items-center justify-center gap-2 px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${viewMode === 'SETTLED' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Check size={12} /> Pagos & Recebidos
                </button>
              </div>
            </div>

            <HistoryCharts
              transactions={chartTransactions}
              startDate={startDate}
              endDate={endDate}
              onCategoryClick={(cat) => navigate(`/history?category=${encodeURIComponent(cat)}`)}
            />
          </div>

        </div>

        <div className="lg:col-span-4 space-y-6">
          <h3 className="text-lg font-bold text-slate-900">Insights AI</h3>

          <div className="bg-white border border-slate-100 rounded-[32px] p-8 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-100/50 rounded-full blur-3xl -translate-x-10 -translate-y-10 group-hover:scale-150 transition-transform duration-1000" />

            <div className="relative z-10 flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-indigo-50 border border-indigo-100 rounded-[20px] flex items-center justify-center text-indigo-600 shadow-sm">
                  <Sparkles size={28} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">Análise de Gastos</h4>
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Inteligência Ativa</p>
                </div>
              </div>

              <p className="text-sm text-slate-500 leading-relaxed">
                Seus gastos este mês totalizam <span className="text-indigo-600 font-bold">{format(data?.totalExpenses || 0)}</span>. Continue acompanhando para otimizar sua saúde financeira.
              </p>

              <div className="flex items-center gap-2 mt-2">
                <button onClick={() => navigate('/history')} className="flex-1 py-3 text-[10px] font-bold text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-widest">Ignorar</button>
                <button onClick={() => navigate('/ai')} className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95">Ver Mais</button>
              </div>
            </div>
          </div>

          <div
            onClick={() => navigate('/history')}
            className="bg-slate-900 rounded-[32px] p-6 text-white group cursor-pointer overflow-hidden relative shadow-lg shadow-slate-900/30 hover:scale-[1.02] transition-transform"
          >
            <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:rotate-12 transition-transform">
              <Zap size={100} fill="currentColor" />
            </div>
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">Média Mensal</p>
                <h3 className="text-2xl font-bold tracking-tight">{format(data?.lastMonthExpenses || 0)}</h3>
              </div>
              <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-brand-400 w-2/3" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ArrowDownRight: React.FC<{ size?: number; className?: string }> = ({ size = 20, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M7 7l10 10M17 7v10H7" />
  </svg>
);

export default Home;
