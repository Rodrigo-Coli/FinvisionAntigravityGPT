import React, { useState, useEffect } from 'react';
import {
  Plus,
  Home,
  Car,
  TrendingUp,
  Briefcase,
  ChevronRight,
  PieChart,
  Wallet,
  Building2,
  ArrowUpRight,
  Target,
  MoreHorizontal,
  LayoutGrid,
  Search,
  Zap,
  Box
} from 'lucide-react';
import { PhysicalAsset, InvestmentBroker } from '../types';

const MOCK_PHYSICAL_ASSETS: PhysicalAsset[] = [
  { id: 'p1', name: 'Apartamento Centro', category: 'REAL_ESTATE', estimatedValue: 450000, acquisitionDate: '2020-05-15', description: 'Imóvel próprio quitado' },
  { id: 'p2', name: 'SUV Familiar', category: 'VEHICLE', estimatedValue: 125000, acquisitionDate: '2022-11-20', description: 'Tabela Fipe Out/23' },
];

const MOCK_BROKERS: InvestmentBroker[] = [
  {
    id: 'b1',
    name: 'XP Investimentos',
    balance: 85400.50,
    allocation: [
      { type: 'Renda Fixa', percentage: 60, value: 51240.30, color: 'bg-brand-500' },
      { type: 'Ações', percentage: 25, value: 21350.12, color: 'bg-emerald-500' },
      { type: 'FIIs', percentage: 15, value: 12810.08, color: 'bg-amber-500' }
    ]
  },
  {
    id: 'b2',
    name: 'Binance',
    balance: 12300.20,
    allocation: [
      { type: 'Cripto', percentage: 100, value: 12300.20, color: 'bg-orange-500' }
    ]
  }
];

const Assets: React.FC = () => {
  const [activeView, setActiveView] = useState<'overview' | 'physical' | 'investments'>('overview');

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const totalPhysical = MOCK_PHYSICAL_ASSETS.reduce((acc, curr) => acc + curr.estimatedValue, 0);
  const totalFinancial = MOCK_BROKERS.reduce((acc, curr) => acc + curr.balance, 0);
  const totalNetWorth = totalPhysical + totalFinancial;

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-10 py-8 space-y-8 animate-in fade-in duration-500">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Patrimônio Líquido</h1>
          <p className="text-sm text-slate-400 font-medium">Bens físicos e ativos financeiros consolidados.</p>
        </div>
        <button className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform active:scale-95">
          <Plus size={18} /> Novo Ativo
        </button>
      </div>

      {/* SUMMARY BANNER */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 md:col-span-1 rounded-[32px] p-8 text-white relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-[100px] -translate-y-10 translate-x-10" />
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Total Consolidado</p>
          <h3 className="text-3xl font-bold tracking-tight">{formatCurrency(totalNetWorth)}</h3>
          <div className="mt-6 flex items-center gap-2">
            <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-lg">+3.2% mês</span>
            <span className="text-slate-500 text-[10px] font-medium uppercase tracking-widest">Crescimento real</span>
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-[32px] p-8 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Bens Físicos</p>
          <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{formatCurrency(totalPhysical)}</h3>
          <p className="text-[10px] font-bold text-slate-300 mt-6 uppercase tracking-widest">Imóveis e Veículos</p>
        </div>

        <div className="bg-white border border-slate-100 rounded-[32px] p-8 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Financeiros</p>
          <h3 className="text-3xl font-bold text-brand-600 tracking-tight">{formatCurrency(totalFinancial)}</h3>
          <p className="text-[10px] font-bold text-slate-300 mt-6 uppercase tracking-widest">Corretoras e Cripto</p>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex gap-2 p-1.5 bg-slate-50 border border-slate-100 rounded-2xl w-fit">
        {[
          { id: 'overview', label: 'Visão Geral', icon: <LayoutGrid size={16} /> },
          { id: 'physical', label: 'Bens Físicos', icon: <Box size={16} /> },
          { id: 'investments', label: 'Investimentos', icon: <TrendingUp size={16} /> }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${activeView === tab.id ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTENT AREA */}
      <div className="animate-in fade-in duration-700">
        {activeView === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-10 rounded-[32px] border border-slate-100 shadow-sm space-y-8">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center"><PieChart size={18} /></div>
                  Alocação Geral
                </h3>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-12">
                <div className="relative w-40 h-40 shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="16" fill="none" className="stroke-slate-50" strokeWidth="3" />
                    <circle cx="18" cy="18" r="16" fill="none" className="stroke-brand-600" strokeWidth="3" strokeDasharray="80 100" />
                    <circle cx="18" cy="18" r="16" fill="none" className="stroke-emerald-500" strokeWidth="3" strokeDasharray="20 100" strokeDashoffset="-80" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold text-slate-900">100%</span>
                  </div>
                </div>
                <div className="w-full space-y-4">
                  <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl group cursor-default">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 bg-brand-600 rounded-full" />
                      <span className="text-xs font-bold text-slate-600 uppercase">Financeiros</span>
                    </div>
                    <span className="text-sm font-bold text-slate-900">{Math.round((totalFinancial / totalNetWorth) * 100)}%</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl group cursor-default">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                      <span className="text-xs font-bold text-slate-600 uppercase">Bens Físicos</span>
                    </div>
                    <span className="text-sm font-bold text-slate-900">{Math.round((totalPhysical / totalNetWorth) * 100)}%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-10 rounded-[32px] border border-slate-100 shadow-sm space-y-8">
              <h3 className="font-bold text-slate-900 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center"><Target size={18} /></div>
                Objetivos Patrimoniais
              </h3>
              <div className="space-y-8">
                <div>
                  <div className="flex justify-between text-[10px] font-bold mb-3 text-slate-400 uppercase tracking-[0.2em]">
                    <span>Primeiro Milhão</span>
                    <span className="text-brand-600">12.8%</span>
                  </div>
                  <div className="w-full bg-slate-50 h-3 rounded-full overflow-hidden border border-slate-100">
                    <div className="bg-brand-600 h-full w-[12.8%] transition-all duration-1000 shadow-[0_0_10px_rgba(37,99,235,0.3)]"></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-bold mb-3 text-slate-400 uppercase tracking-[0.2em]">
                    <span>Independência Fin. (3M)</span>
                    <span className="text-emerald-600">4.2%</span>
                  </div>
                  <div className="w-full bg-slate-50 h-3 rounded-full overflow-hidden border border-slate-100">
                    <div className="bg-emerald-500 h-full w-[4.2%] transition-all duration-1000"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeView === 'physical' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {MOCK_PHYSICAL_ASSETS.map(asset => (
              <div key={asset.id} className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden group hover:border-brand-200 transition-all duration-300">
                <div className="p-8 space-y-6">
                  <div className="flex justify-between items-start">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${asset.category === 'REAL_ESTATE' ? 'bg-blue-50 text-blue-600' : 'bg-slate-900 text-white'} shadow-lg shadow-current/5`}>
                      {asset.category === 'REAL_ESTATE' ? <Home size={28} /> : <Car size={28} />}
                    </div>
                    <button className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl transition-colors"><MoreHorizontal size={20} /></button>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-900 text-xl tracking-tight leading-tight uppercase tracking-tight">{asset.name}</h4>
                    <p className="text-xs text-slate-400 mt-2 font-medium line-clamp-2">{asset.description}</p>
                  </div>

                  <div className="pt-6 border-t border-slate-50">
                    <p className="text-[10px] font-bold uppercase text-slate-300 tracking-widest mb-1.5 leading-none">Avaliação Estimada</p>
                    <p className="text-2xl font-bold text-slate-900 leading-none">{formatCurrency(asset.estimatedValue)}</p>
                  </div>
                </div>
                <div className="px-8 py-4 bg-slate-50/50 flex justify-between items-center border-t border-slate-50">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Aquisição: {new Date(asset.acquisitionDate).getFullYear()}</span>
                  <button className="text-brand-600 text-[10px] font-bold uppercase tracking-widest hover:underline">Reavaliar</button>
                </div>
              </div>
            ))}
            <button className="rounded-[32px] border-2 border-dashed border-slate-100 p-8 flex flex-col items-center justify-center gap-4 text-slate-300 hover:border-brand-200 hover:text-brand-600 hover:bg-brand-50/30 transition-all min-h-[280px]">
              <Plus size={32} />
              <span className="font-bold text-slate-400">Adicionar Bem</span>
            </button>
          </div>
        )}

        {activeView === 'investments' && (
          <div className="space-y-8">
            {MOCK_BROKERS.map(broker => (
              <div key={broker.id} className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden p-8 lg:p-12">
                <div className="flex flex-col lg:flex-row gap-12 lg:items-center">
                  <div className="flex-1 space-y-8">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 bg-slate-900 text-white rounded-[22px] flex items-center justify-center font-bold text-2xl shadow-xl shadow-slate-900/10 shrink-0">
                        {broker.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-2xl font-bold text-slate-900 tracking-tight">{broker.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Conectado via API</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-300 tracking-widest mb-2 leading-none">Patrimônio na Corretora</p>
                      <p className="text-4xl font-bold text-slate-900 tracking-tighter leading-none">{formatCurrency(broker.balance)}</p>
                    </div>

                    <div className="flex gap-4">
                      <button className="flex-1 lg:flex-none px-8 py-3.5 bg-brand-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform active:scale-95">Ver Detalhes</button>
                      <button className="flex-1 lg:flex-none px-8 py-3.5 bg-slate-50 text-slate-400 rounded-xl text-xs font-bold uppercase tracking-widest hover:text-slate-900 hover:bg-slate-100 transition-all">Relatórios</button>
                    </div>
                  </div>

                  <div className="flex-1 bg-slate-50/50 rounded-[32px] p-8 lg:p-10 space-y-6">
                    <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest text-center lg:text-left leading-none">Alocação por Classe</p>

                    <div className="w-full bg-white h-4 rounded-full overflow-hidden flex border border-slate-100 shadow-sm">
                      {broker.allocation.map((item, idx) => (
                        <div
                          key={idx}
                          className={`${item.color} h-full transition-all duration-700`}
                          style={{ width: `${item.percentage}%` }}
                        />
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {broker.allocation.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100/50 shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className={`w-2.5 h-2.5 ${item.color} rounded-full`} />
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{item.type}</span>
                          </div>
                          <span className="font-bold text-slate-900 text-xs">{formatCurrency(item.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Assets;
