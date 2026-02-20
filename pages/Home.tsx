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
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-12">
        <div className="relative">
          <div className="w-24 h-24 border-4 border-slate-50 border-t-slate-900 rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={32} className="text-slate-200 animate-pulse" />
          </div>
        </div>
        <div className="space-y-2 text-center">
          <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[11px] animate-pulse">Syncing Private Ledger</p>
          <p className="text-slate-200 text-[10px] font-medium">Establishing secure handshake...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-10 px-8 text-center animate-in fade-in duration-500">
        <div className="w-24 h-24 bg-slate-50 text-slate-300 rounded-[40px] border border-slate-100 flex items-center justify-center">
          <AlertCircle size={48} strokeWidth={1.5} />
        </div>
        <div className="space-y-4">
          <h3 className="text-3xl font-bold text-slate-900 tracking-tight">Interrupção de Fluxo</h3>
          <p className="text-slate-400 font-medium text-lg max-w-sm mx-auto leading-relaxed">{error || 'Não foi possível sincronizar sua infraestrutura de dados no momento.'}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-12 py-6 bg-slate-900 text-white rounded-[28px] font-bold text-[11px] uppercase tracking-[0.3em] hover:bg-slate-800 transition-all shadow-2xl active:scale-95"
        >
          Reestabelecer Conexão
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-16 sm:py-24 px-8 sm:px-12 space-y-20 animate-in fade-in slide-in-from-bottom-6 duration-1000 ease-out">
      {/* Header Section */}
      <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-12">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-5">
            <h1 className="text-5xl sm:text-7xl font-bold text-slate-900 tracking-tight leading-none">
              Olá, <span className="text-brand-600 font-black">{user.email.split('@')[0]}</span>
            </h1>
            <div className="flex gap-3">
              <span className="px-4 py-1.5 bg-slate-50 text-slate-400 rounded-full text-[10px] font-bold uppercase tracking-widest border border-slate-100 shadow-sm">Nova Sincronia</span>
              <span className="px-4 py-1.5 bg-brand-50 text-brand-600 rounded-full text-[10px] font-bold uppercase tracking-widest border border-brand-100/50 shadow-sm">Pro Vault</span>
            </div>
          </div>
          <p className="text-slate-500 font-medium text-xl sm:text-3xl leading-relaxed max-w-3xl">
            Sua arquitetura patrimonial expandiu <span className="text-emerald-500 font-black">4.2%</span> este ciclo. <br className="hidden lg:block" /> Todos os sistemas operando em alta fidelidade.
          </p>
        </div>

        <div className="flex items-center gap-6 self-start xl:self-end">
          <div className="flex items-center gap-5 bg-white px-8 py-5 rounded-[28px] border border-slate-100 shadow-soft group cursor-pointer hover:bg-slate-50 transition-all active:scale-95">
            <Calendar size={20} className="text-slate-400 transition-colors group-hover:text-slate-900" />
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-[0.25em]">Janeiro • 2024</span>
          </div>
          <button className="w-16 h-16 bg-white border border-slate-100 rounded-[28px] flex items-center justify-center text-slate-300 hover:text-slate-900 hover:border-slate-300 shadow-soft transition-all active:scale-95 relative group">
            <Bell size={24} />
            <span className="absolute top-4 right-4 w-3 h-3 bg-brand-500 rounded-full border-4 border-white group-hover:animate-ping" />
          </button>
        </div>
      </header>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Balance Card - The Ultra Premium Piece */}
        <div className="lg:col-span-8 bg-white p-12 sm:p-16 rounded-[64px] border border-slate-100 shadow-soft relative overflow-hidden flex flex-col justify-between min-h-[520px] group transition-all duration-1000 hover:shadow-[0_48px_140px_-20px_rgba(0,0,0,0.06)] hover:border-slate-200">
          <div className="space-y-12 relative z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-6">
                <div className="w-16 h-16 bg-slate-900 text-white rounded-[24px] flex items-center justify-center shadow-2xl shadow-black/20 transition-all group-hover:scale-110 group-hover:rotate-3 duration-700">
                  <Wallet size={28} />
                </div>
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.34em] leading-none block">
                    Disponibilidade Imediata
                  </span>
                  <p className="text-sm font-bold text-slate-900 uppercase tracking-[0.2em]">Fluxo Consolidado</p>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-4 px-6 py-3 bg-emerald-50 text-emerald-600 rounded-full font-black text-xs border border-emerald-100/50 shadow-sm relative overflow-hidden group/badge">
                <TrendingUp size={20} className="relative z-10" />
                <span className="relative z-10">+4.22%</span>
                <div className="absolute inset-0 bg-emerald-100 translate-x-[-100%] group-hover/badge:translate-x-0 transition-transform duration-500 opacity-30" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-baseline gap-2">
                <h2 className="text-7xl sm:text-[110px] font-black tracking-tighter text-slate-900 leading-[0.85] animate-in slide-in-from-left-4 duration-1000">
                  {format(data.consolidatedBalance).replace('R$', '').trim()}
                </h2>
                <span className="text-3xl font-black text-slate-200">BRL</span>
              </div>
              <p className="text-slate-400 text-[11px] font-bold uppercase tracking-[0.4em] ml-2 opacity-60">Capital Sovereign Reserve</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-5 mt-16 relative z-10">
            <button className="px-14 py-7 bg-slate-900 text-white rounded-[32px] font-bold text-[11px] uppercase tracking-[0.3em] hover:bg-slate-800 shadow-2xl shadow-black/10 transition-all active:scale-95 flex items-center justify-center gap-5 group/btn">
              Acessar Vault <ArrowUpRight size={20} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            </button>
            <button className="px-14 py-7 bg-white border border-slate-100 text-slate-950 rounded-[32px] font-bold text-[11px] uppercase tracking-[0.3em] hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95 shadow-soft">
              Provisionar Lançamento
            </button>
          </div>

          {/* Decorative Gradients */}
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-brand-50/40 rounded-full -translate-y-1/2 translate-x-1/2 blur-[100px] pointer-events-none group-hover:bg-brand-100/30 transition-colors duration-1000" />
          <div className="absolute -bottom-20 -left-20 w-[300px] h-[300px] bg-slate-50/80 rounded-full blur-[80px] pointer-events-none group-hover:bg-emerald-50/20 transition-colors duration-1000" />
        </div>

        {/* Net Worth Sidebar Card */}
        <div className="lg:col-span-4 bg-slate-50/50 p-12 rounded-[64px] border border-slate-100 flex flex-col justify-between hover:bg-white hover:border-slate-200 transition-all duration-700 group shadow-soft">
          <div className="space-y-12">
            <div className="flex items-center justify-between">
              <div className="w-20 h-20 bg-white rounded-[28px] flex items-center justify-center text-slate-300 group-hover:text-slate-950 shadow-sm transition-all border border-slate-100/50 transform group-hover:rotate-6 duration-700">
                <Target size={40} strokeWidth={1.5} />
              </div>
              <span className="text-[10px] font-black text-slate-300 group-hover:text-slate-900 border border-slate-100 px-4 py-1.5 rounded-full transition-colors">Target Active</span>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-[0.3em] leading-none block ml-1">Patrimônio Indexado</p>
              <h3 className="text-[44px] sm:text-[54px] font-black text-slate-950 tracking-tighter leading-none">
                {format(data.netWorth)}
              </h3>
            </div>
          </div>

          <div className="pt-16 space-y-6">
            <div className="flex items-end justify-between px-2">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Eficiência de Alvo</span>
                <p className="text-sm font-black text-slate-900">Q1 Milestone • 2024</p>
              </div>
              <span className="text-2xl font-black text-slate-900 tracking-tighter">75%</span>
            </div>
            <div className="h-4 bg-white/80 rounded-full overflow-hidden border border-slate-100/50 p-1 shadow-inner relative group/progress">
              <div
                className="h-full bg-slate-900 rounded-full transition-all duration-[2500ms] ease-out group-hover:bg-brand-600 relative overflow-hidden"
                style={{ width: '75%' }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[shimmer_2s_infinite]" />
              </div>
            </div>
            <div className="flex justify-center pt-4">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.4em] flex items-center gap-3">
                Delta <span className="text-slate-900 font-black">{format(12420)}</span> para o Alvo
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Row: Credit Cards & AI Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Credit Cards Section */}
        <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-10">
          {data.creditCards.map((card, i) => (
            <div key={i} className="bg-white p-12 rounded-[56px] border border-slate-100 shadow-soft flex flex-col justify-between hover:border-slate-300 hover:shadow-2xl transition-all duration-500 group min-h-[340px] relative overflow-hidden">
              <div className="flex items-center justify-between mb-10 relative z-10">
                <div className={`w-16 h-16 ${card.color || 'bg-slate-900'} rounded-[24px] text-white shadow-2xl shadow-black/10 flex items-center justify-center transform group-hover:scale-110 group-hover:-rotate-3 transition-all duration-700`}>
                  <CreditCard size={28} />
                </div>
                <button className="w-12 h-12 flex items-center justify-center text-slate-200 hover:text-slate-900 hover:bg-slate-50 rounded-2xl transition-all active:scale-95">
                  <MoreHorizontal size={24} />
                </button>
              </div>

              <div className="space-y-2 relative z-10">
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-[0.3em] leading-none ml-1">{card.brand}</p>
                <h4 className="text-4xl font-black text-slate-900 tracking-tighter leading-none">{format(card.current)}</h4>
              </div>

              <div className="mt-12 flex items-center justify-between relative z-10">
                <div className="px-6 py-2.5 bg-slate-50 rounded-full text-[10px] font-bold text-slate-500 uppercase tracking-widest border border-slate-100 group-hover:bg-slate-900 group-hover:text-white group-hover:border-slate-900 transition-all duration-500">Fluxo Aberto</div>
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Settlement em 12d</p>
                </div>
              </div>

              <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-slate-50/30 rounded-full blur-3xl pointer-events-none group-hover:bg-brand-50/20 transition-all duration-1000" />
            </div>
          ))}
          {data.creditCards.length === 0 && (
            <div className="col-span-1 md:col-span-2 p-24 bg-slate-50 rounded-[56px] border border-dashed border-slate-200 flex flex-col items-center justify-center text-center space-y-8 group hover:bg-white hover:border-slate-300 transition-all duration-700">
              <div className="w-24 h-24 bg-white rounded-[32px] flex items-center justify-center text-slate-200 shadow-sm border border-slate-100 group-hover:scale-110 transition-transform duration-500">
                <CreditCard size={48} strokeWidth={1} />
              </div>
              <div className="space-y-3">
                <p className="text-slate-400 font-bold uppercase tracking-[0.4em] text-[11px]">Zero Exposure</p>
                <p className="text-slate-300 font-medium text-sm">Nenhum gateway de crédito indexado.</p>
              </div>
            </div>
          )}
        </div>

        {/* AI Insight Teaser - High End Minimal */}
        <div className="lg:col-span-4 bg-slate-900 p-14 rounded-[64px] text-white shadow-[0_48px_140px_-20px_rgba(0,0,0,0.3)] relative overflow-hidden group border border-slate-800 flex flex-col justify-between min-h-[520px] transition-all duration-1000 hover:scale-[1.02]">
          <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-brand-500/15 via-transparent to-transparent pointer-events-none transition-opacity duration-1000 group-hover:opacity-100" />

          <div className="relative z-10 space-y-12">
            <div className="inline-flex items-center gap-4 px-6 py-3 bg-white/5 rounded-full text-[10px] font-bold uppercase tracking-[0.34em] border border-white/10 backdrop-blur-xl shadow-2xl relative overflow-hidden group/ai">
              <Sparkles size={16} className="text-brand-400 animate-pulse relative z-10" />
              <span className="relative z-10">Algoritmo FinVision</span>
              <div className="absolute inset-0 bg-brand-500/10 -translate-x-full group-hover/ai:translate-x-0 transition-transform duration-700" />
            </div>

            <div className="space-y-8 px-2">
              <h3 className="text-5xl font-bold leading-[1.05] tracking-tighter">Motor de <br /><span className="text-brand-400">Eficiência</span></h3>
              <p className="text-slate-400 text-xl leading-relaxed font-medium">
                Seu ticket médio em <span className="text-white font-bold">Logística</span> reduziu drasticamente hoje. Otimização estimada de <span className="text-emerald-400 font-black">R$ 420,00</span> projetada para o trimestre atual.
              </p>
            </div>
          </div>

          <button className="relative z-10 w-full py-8 bg-white text-slate-950 hover:bg-brand-400 transition-all duration-500 rounded-[32px] font-black text-[12px] uppercase tracking-[0.4em] active:scale-95 shadow-2xl">
            Audit Insight
          </button>

          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-brand-600/15 rounded-full blur-[120px] pointer-events-none group-hover:bg-brand-600/30 transition-all duration-1000" />
        </div>
      </div>
    </div>
  );
};

export default Home;
