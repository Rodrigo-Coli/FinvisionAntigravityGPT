import React, { useState, useEffect } from 'react';
import { Profile, DashboardData } from '../types';
import {
  TrendingUp,
  Wallet,
  CreditCard,
  Calendar,
  Sparkles,
  ArrowUpRight,
  Target,
  Bell,
  Zap,
  MoreHorizontal,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { DashboardService } from '../services/dashboard.service';
import { DateUtils } from '../lib/dateUtils';

const Home: React.FC<{ user: any }> = ({ user }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const summary = await DashboardService.getSummary();
        setData(summary);
      } catch (err: any) {
        setError('Erro ao carregar o resumo financeiro.');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const format = (v: number) => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2
  }).format(v);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="animate-spin text-brand-600" size={48} />
        <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Sincronizando Excelência...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 px-4 text-center">
        <div className="p-6 bg-rose-50 text-rose-600 rounded-[32px] border border-rose-100 shadow-inner">
          <AlertCircle size={48} />
        </div>
        <div className="space-y-2">
          <h3 className="text-2xl font-black text-slate-900 tracking-tight">Ops! Algo deu errado.</h3>
          <p className="text-slate-500 font-medium max-w-sm">{error || 'Não foi possível carregar seus dados.'}</p>
        </div>
        <button onClick={() => window.location.reload()} className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-black transition-all active:scale-95">
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex justify-center py-6 sm:py-10 px-4 sm:px-6 lg:px-8 animate-in fade-in duration-700">
      <div className="inline-block min-w-min max-w-full space-y-8 sm:space-y-10">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-3xl sm:text-4xl font-display font-black text-slate-900 tracking-tight dark:text-white">
              Excelência <span className="text-brand-600 italic">Financeira</span>
            </h1>
            <p className="text-slate-500 font-medium text-base sm:text-lg">
              Bem-vindo de volta, <span className="text-slate-900 font-bold dark:text-slate-200">{user.email.split('@')[0]}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button className="p-3 sm:p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm text-slate-400 hover:text-brand-600 transition-all hover:scale-105">
              <Bell size={20} />
            </button>
            <div className="flex items-center gap-3 sm:gap-4 bg-white dark:bg-slate-800 p-3 sm:p-4 sm:pr-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm group cursor-pointer hover:border-brand-200 transition-all hover:scale-105 active:scale-95">
              <div className="p-2 bg-brand-50 dark:bg-brand-900/30 rounded-xl text-brand-600">
                <Calendar size={18} />
              </div>
              <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-200 uppercase tracking-tight">
                {DateUtils.formatFullMonthYearNoSlash(DateUtils.getNow().getFullYear(), DateUtils.getNow().getMonth() + 1)}
              </p>
            </div>
          </div>
        </header>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {/* Balance Card - Premium Large */}
          <div className="md:col-span-2 bg-gradient-to-br from-brand-600 to-indigo-700 p-6 sm:p-10 rounded-[32px] sm:rounded-[48px] text-white shadow-2xl shadow-brand-500/30 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-110 transition-transform duration-1000 hidden sm:block">
              <Wallet size={200} />
            </div>

            <div className="relative z-10 space-y-6 sm:space-y-10">
              <div className="flex items-center justify-between">
                <div className="px-4 sm:px-5 py-2 bg-white/20 backdrop-blur-md border border-white/10 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em]">
                  Patrimônio Consolidado
                </div>
                <div className="flex items-center gap-1 sm:gap-2 text-emerald-300 font-black text-xs sm:text-sm uppercase tracking-tighter">
                  <ArrowUpRight size={16} sm:size={18} />
                  <span>+4.2%</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-white/70 text-[10px] sm:text-sm font-black uppercase tracking-widest pl-1">Saldo Total Disponível</p>
                <h2 className="text-4xl sm:text-6xl font-display font-black tracking-tighter truncate">
                  {format(data.consolidatedBalance)}
                </h2>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-2 sm:pt-4">
                <button className="w-full sm:w-auto px-8 py-4 bg-white text-brand-600 rounded-[16px] sm:rounded-[20px] font-black text-xs uppercase tracking-widest hover:bg-brand-50 shadow-xl shadow-black/10 transition-all active:scale-95">
                  Ver Detalhes
                </button>
                <button className="w-full sm:w-auto px-8 py-4 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-[16px] sm:rounded-[20px] font-black text-xs uppercase tracking-widest hover:bg-white/20 transition-all active:scale-95">
                  Novo Lançamento
                </button>
              </div>
            </div>
          </div>

          {/* Net Worth Sidebar Card */}
          <div className="bg-white dark:bg-slate-800 p-6 sm:p-10 rounded-[32px] sm:rounded-[48px] border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between card-premium group hover:border-brand-100 transition-all">
            <div className="space-y-6 sm:space-y-8">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-[16px] sm:rounded-[20px] flex items-center justify-center text-indigo-600 shadow-inner group-hover:bg-brand-50 group-hover:text-brand-600 transition-all group-hover:rotate-3">
                <TrendingUp size={28} sm:size={32} />
              </div>
              <div className="space-y-2">
                <p className="text-[9px] sm:text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Patrimônio Líquido</p>
                <h3 className="text-3xl sm:text-4xl font-display font-black text-slate-900 dark:text-white tracking-tight truncate">
                  {format(data.netWorth)}
                </h3>
              </div>
            </div>

            <div className="pt-6 sm:pt-8 mt-6 sm:mt-0 border-t border-slate-50 dark:border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-500 font-black text-[9px] sm:text-[10px] uppercase tracking-widest">
                <Target size={14} sm:size={16} className="text-brand-600" />
                Meta: 75%
              </div>
              <div className="w-24 sm:w-32 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden shadow-inner">
                <div className="h-full bg-brand-500 rounded-full shadow-lg shadow-brand-500/50 transition-all duration-1000" style={{ width: '75%' }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Secondary Row: Credit Cards & AI Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 pb-10">
          {/* Credit Cards Section */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
            {data.creditCards.map((card, i) => (
              <div key={i} className="bg-white dark:bg-slate-800 p-6 sm:p-10 rounded-[32px] sm:rounded-[40px] border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between card-premium hover:border-brand-100 transition-all group">
                <div className="flex items-center justify-between mb-6 sm:mb-10">
                  <div className={`p-3 sm:p-4 ${card.color} rounded-xl sm:rounded-2xl text-white shadow-xl shadow-black/10 transform group-hover:scale-110 group-hover:rotate-6 transition-all`}>
                    <CreditCard size={20} sm:size={22} />
                  </div>
                  <button className="p-2 sm:p-3 text-slate-300 hover:text-slate-500 transition-colors">
                    <MoreHorizontal size={20} />
                  </button>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] sm:text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">{card.brand}</p>
                  <h4 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">{format(card.current)}</h4>
                </div>
                <div className="mt-4 sm:mt-6 flex flex-wrap items-center gap-2 sm:gap-3">
                  <div className="px-2.5 py-1 bg-brand-50 dark:bg-slate-700 rounded-lg text-[9px] sm:text-[10px] font-black text-brand-600 uppercase tracking-widest border border-brand-100 dark:border-transparent">Fat. Aberta</div>
                  <p className="text-[9px] sm:text-[10px] text-slate-400 font-bold">Vence em 12 dias</p>
                </div>
              </div>
            ))}
            {data.creditCards.length === 0 && (
              <div className="col-span-1 sm:col-span-2 p-8 sm:p-12 bg-slate-50 dark:bg-slate-800/50 rounded-[32px] sm:rounded-[40px] border border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-center space-y-4">
                <CreditCard size={36} sm:size={40} className="text-slate-300 dark:text-slate-600" />
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] sm:text-xs">Nenhum cartão cadastrado</p>
              </div>
            )}
          </div>

          {/* AI Insight Teaser */}
          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 p-8 sm:p-10 rounded-[32px] sm:rounded-[48px] text-white shadow-2xl relative overflow-hidden group border border-white/5">
            <div className="absolute -bottom-16 -right-16 opacity-30 group-hover:rotate-12 transition-transform duration-1000 scale-125 sm:scale-150">
              <Sparkles size={180} />
            </div>

            <div className="relative z-10 flex flex-col h-full justify-between gap-6 sm:gap-8">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-600 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-brand-500/40 ring-4 ring-brand-500/10 animate-pulse">
                  <Zap size={10} sm:size={12} fill="currentColor" /> Labs Live
                </div>
                <h3 className="text-2xl sm:text-3xl font-display font-black leading-[1.1] tracking-tight">Insight <br /><span className="text-brand-400 italic">Inteligente</span></h3>
                <p className="text-slate-300 text-xs sm:text-sm leading-relaxed font-medium">
                  Você gastou <span className="text-brand-400 font-black">12% a menos</span> em restaurantes nesta semana. Excelente controle!
                </p>
              </div>

              <button className="w-full py-4 sm:py-5 bg-white/10 hover:bg-white text-white hover:text-slate-900 rounded-[20px] sm:rounded-[24px] font-black text-[10px] sm:text-xs uppercase tracking-widest transition-all border border-white/10 hover:border-white active:scale-95 shadow-2xl">
                Analisar Gastos
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
