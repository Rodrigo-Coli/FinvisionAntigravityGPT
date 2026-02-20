import React, { useState, useEffect } from 'react';
import { DashboardData } from '../types';
import {
  TrendingUp,
  Wallet,
  CreditCard,
  Calendar,
  Sparkles,
  Target,
  Bell,
  Loader2,
  AlertCircle,
  MoreHorizontal,
  ArrowUpRight
} from 'lucide-react';
import { DashboardService } from '../services/dashboard.service';

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
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
        <div className="w-12 h-12 border-2 border-slate-100 border-t-slate-900 rounded-full animate-spin" />
        <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px]">Syncing Data...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 px-6 text-center">
        <AlertCircle size={40} className="text-slate-200" />
        <div className="space-y-2">
          <h3 className="text-2xl font-bold text-slate-900">Erro de Conexão</h3>
          <p className="text-slate-500 max-w-xs mx-auto">{error || 'Não foi possível carregar os dados.'}</p>
        </div>
        <button onClick={() => window.location.reload()} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold text-[11px] uppercase tracking-wider hover:bg-slate-800 transition-all">Tentar Novamente</button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-10 sm:py-16 px-6 sm:px-8 space-y-12 animate-in fade-in duration-700">
      {/* Header Section */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-8">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
              Olá, <span className="text-brand-600">{user.email.split('@')[0]}</span>
            </h1>
            <span className="px-3 py-1 bg-brand-50 text-brand-600 rounded-full text-[9px] font-bold uppercase tracking-widest border border-brand-100/50">PRO Vault</span>
          </div>
          <p className="text-slate-500 font-medium text-lg leading-relaxed">
            Seu patrimônio expandiu <span className="text-emerald-500 font-bold">4.2%</span> este mês.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl border border-slate-100 shadow-sm">
            <Calendar size={16} className="text-slate-400" />
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Janeiro • 2024</span>
          </div>
          <button className="w-12 h-12 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all shadow-sm relative group">
            <Bell size={20} />
            <span className="absolute top-3 right-3 w-2 h-2 bg-brand-500 rounded-full border-2 border-white" />
          </button>
        </div>
      </header>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Balance Card */}
        <div className="lg:col-span-12 bg-white p-8 sm:p-10 rounded-[40px] border border-slate-100 shadow-sm relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-10 group hover:shadow-md hover:border-slate-200 transition-all duration-500">
          <div className="space-y-6 relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                <Wallet size={20} />
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.3em] block leading-none mb-1">Disponibilidade</span>
                <p className="text-xs font-bold text-slate-900 uppercase tracking-widest">Fluxo Corrente</p>
              </div>
            </div>

            <div className="flex items-baseline gap-3">
              <h2 className="text-5xl sm:text-6xl font-black tracking-tighter text-slate-900">
                {format(data.consolidatedBalance)}
              </h2>
              <span className="hidden sm:inline-block px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg font-black text-[10px] border border-emerald-100/50">
                +4.2%
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 relative z-10">
            <button className="px-10 py-5 bg-slate-900 text-white rounded-2xl font-bold text-[11px] uppercase tracking-[0.2em] hover:bg-slate-800 transition-all flex items-center justify-center gap-3 shadow-lg">
              Detalhes <ArrowUpRight size={16} />
            </button>
            <button className="px-10 py-5 bg-white border border-slate-100 text-slate-900 rounded-2xl font-bold text-[11px] uppercase tracking-[0.2em] hover:bg-slate-50 transition-all shadow-sm">
              Novo Lançamento
            </button>
          </div>

          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-50/30 rounded-full -translate-y-1/2 translate-x-1/2 blur-[80px] pointer-events-none" />
        </div>

        {/* Patrimônio Sidebar Card */}
        <div className="lg:col-span-5 bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-8 flex flex-col justify-between hover:border-slate-200 transition-all group">
          <div className="flex items-center justify-between">
            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 group-hover:text-slate-900 transition-colors">
              <Target size={28} />
            </div>
            <span className="text-[9px] font-bold text-slate-400 border border-slate-100 px-3 py-1 rounded-full uppercase tracking-widest transition-colors group-hover:border-slate-200">Meta Ativa</span>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest ml-1">Patrimônio Líquido</p>
            <h3 className="text-4xl font-black text-slate-900 tracking-tighter">
              {format(data.netWorth)}
            </h3>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between px-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Atingimento</span>
              <span className="text-lg font-black text-slate-900">75%</span>
            </div>
            <div className="h-2.5 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
              <div className="h-full bg-slate-900 rounded-full transition-all duration-1000" style={{ width: '75%' }} />
            </div>
          </div>
        </div>

        {/* Insight Card */}
        <div className="lg:col-span-7 bg-slate-900 p-10 rounded-[40px] text-white shadow-xl relative overflow-hidden group border border-slate-800 flex flex-col justify-between min-h-[320px] hover:scale-[1.01] transition-transform">
          <div className="relative z-10 space-y-8">
            <div className="inline-flex items-center gap-3 px-4 py-2 bg-white/5 rounded-full text-[9px] font-bold uppercase tracking-[0.3em] border border-white/10 backdrop-blur-md">
              <Sparkles size={14} className="text-brand-400" />
              <span>Insight Inteligente</span>
            </div>

            <div className="space-y-4">
              <h3 className="text-3xl font-bold tracking-tight leading-tight">Você economizou <span className="text-brand-400">12%</span> em alimentação esta semana.</h3>
              <p className="text-slate-400 text-lg leading-relaxed font-medium max-w-sm">Excelente controle! Esse valor representa R$ 340,00 extras no seu aporte mensal.</p>
            </div>
          </div>
          <button className="relative z-10 w-full py-5 bg-white text-slate-950 hover:bg-brand-400 transition-all rounded-2xl font-black text-[11px] uppercase tracking-[0.3em]">
            Analisar Gastos
          </button>

          <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-brand-500/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-brand-500/20 transition-all duration-1000" />
        </div>
      </div>

      {/* Credit Cards Row */}
      <div className="space-y-6">
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.4em] ml-2">Gateways de Crédito</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.creditCards.map((card, i) => (
            <div key={i} className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm flex flex-col justify-between hover:border-slate-200 hover:shadow-md transition-all group min-h-[220px]">
              <div className="flex items-center justify-between mb-6">
                <div className={`w-12 h-12 ${card.color || 'bg-slate-900'} rounded-2xl text-white shadow-lg flex items-center justify-center group-hover:rotate-3 transition-transform`}>
                  <CreditCard size={20} />
                </div>
                <MoreHorizontal size={20} className="text-slate-200 hover:text-slate-900 cursor-pointer transition-colors" />
              </div>

              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{card.brand}</p>
                <h4 className="text-3xl font-black text-slate-900 tracking-tighter">{format(card.current)}</h4>
              </div>

              <div className="mt-8 flex items-center justify-between">
                <div className="px-4 py-1.5 bg-slate-50 rounded-full text-[9px] font-bold text-slate-500 uppercase tracking-widest group-hover:bg-slate-900 group-hover:text-white transition-all">FAT. ABERTA</div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Vence em 12 dias</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Home;
