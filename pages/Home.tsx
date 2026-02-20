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
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <Loader2 className="animate-spin text-slate-400" size={24} />
        <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">Sincronizando...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-4 px-6 text-center">
        <AlertCircle size={32} className="text-slate-200" />
        <p className="text-slate-500 text-sm">{error || 'Erro ao carregar dados.'}</p>
        <button onClick={() => window.location.reload()} className="px-6 py-2 bg-slate-900 text-white rounded-lg text-[10px] font-bold uppercase">Repetir</button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-6 sm:px-8 space-y-8 animate-in fade-in duration-500">
      {/* Header Compacto */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Olá, <span className="text-brand-600">{user.email.split('@')[0]}</span>
            </h1>
            <span className="px-2 py-0.5 bg-brand-50 text-brand-600 rounded-md text-[8px] font-bold uppercase tracking-widest border border-brand-100/50">PRO Vault</span>
          </div>
          <p className="text-slate-500 text-sm">
            Seu patrimônio cresceu <span className="text-emerald-500 font-bold">4.2%</span> este ciclo.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-100 shadow-sm">
            <Calendar size={14} className="text-slate-400" />
            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Janeiro 2024</span>
          </div>
          <button className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all relative">
            <Bell size={18} />
            <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-brand-500 rounded-full border-2 border-white" />
          </button>
        </div>
      </header>

      {/* Grid Principal Compacto */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Card de Saldo */}
        <div className="lg:col-span-12 bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-8 hover:border-slate-200 transition-all">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center">
                <Wallet size={18} />
              </div>
              <div>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block leading-none mb-1">Disponível</span>
                <p className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Fluxo Corrente</p>
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <h2 className="text-4xl font-bold tracking-tighter text-slate-900 leading-none">
                {format(data.consolidatedBalance)}
              </h2>
              <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100/50">+4.22%</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2 shadow-sm">
              Detalhes <ArrowUpRight size={14} />
            </button>
            <button className="px-6 py-3 bg-white border border-slate-100 text-slate-950 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm">
              Novo Lançamento
            </button>
          </div>
        </div>

        {/* Patrimônio Líquido */}
        <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6 hover:border-slate-200 transition-all">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300">
              <Target size={24} />
            </div>
            <span className="text-[8px] font-bold text-slate-400 border border-slate-100 px-2.5 py-1 rounded-md uppercase tracking-widest">Meta v1</span>
          </div>

          <div className="space-y-1">
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest ml-0.5">Patrimônio Líquido</p>
            <h3 className="text-3xl font-black text-slate-950 tracking-tighter leading-none">
              {format(data.netWorth)}
            </h3>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-end px-0.5">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Atingimento</span>
              <span className="text-base font-black text-slate-900">75%</span>
            </div>
            <div className="h-2 bg-slate-50 rounded-full border border-slate-100 overflow-hidden">
              <div className="h-full bg-slate-900 rounded-full transition-all duration-1000" style={{ width: '75%' }} />
            </div>
          </div>
        </div>

        {/* Insight Compacto */}
        <div className="lg:col-span-7 bg-slate-900 p-8 rounded-3xl text-white shadow-lg relative overflow-hidden group border border-slate-800 flex flex-col justify-between hover:scale-[1.01] transition-transform">
          <div className="space-y-6 relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full text-[8px] font-bold uppercase tracking-widest border border-white/10">
              <Sparkles size={12} className="text-brand-400" />
              <span>Insight AI</span>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold tracking-tight">Economia de <span className="text-brand-400">12%</span> em Logística.</h3>
              <p className="text-slate-400 text-sm leading-relaxed max-w-sm">Seu ticket médio reduziu drasticamente. Impacto positivo de R$ 420,00 projetado.</p>
            </div>
          </div>
          <button className="relative z-10 w-full py-4 mt-8 bg-white text-slate-950 hover:bg-brand-400 transition-all rounded-xl font-black text-[10px] uppercase tracking-widest">
            Audit Insight
          </button>
          <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-brand-500/10 blur-3xl pointer-events-none" />
        </div>
      </div>

      {/* Cartões Compactos */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Instrumentos de Crédito</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {data.creditCards.map((card, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:border-slate-200 transition-all min-h-[160px]">
              <div className="flex items-center justify-between mb-4">
                <div className={`w-10 h-10 ${card.color || 'bg-slate-900'} rounded-xl text-white shadow-md flex items-center justify-center`}>
                  <CreditCard size={18} />
                </div>
                <MoreHorizontal size={16} className="text-slate-200" />
              </div>

              <div className="space-y-0.5">
                <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">{card.brand}</p>
                <h4 className="text-xl font-bold text-slate-900 tracking-tight">{format(card.current)}</h4>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest px-2 py-0.5 bg-slate-50 rounded border border-slate-100">FAT. ABERTA</span>
                <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">12d</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Home;
