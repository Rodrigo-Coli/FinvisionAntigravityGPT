
import React, { useState } from 'react';
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
  MoreHorizontal
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
      { type: 'Renda Fixa', percentage: 60, value: 51240.30, color: 'bg-blue-500' },
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
    <div className="w-full flex justify-center py-6 sm:py-10 px-4 sm:px-6 lg:px-8 animate-in fade-in duration-700 bg-gray-50 min-h-screen">
      <div className="inline-block min-w-min max-w-full space-y-8 sm:space-y-10">
        <header className="mb-6 lg:mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-gray-900 tracking-tight">Patrimônio Líquido</h1>
            <p className="text-gray-500 text-xs lg:text-sm">Bens físicos e ativos financeiros consolidados</p>
          </div>
          <div className="flex gap-2">
            <button className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95">
              <Plus size={20} /> Novo Ativo
            </button>
          </div>
        </header>

        {/* Summary Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 mb-8">
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Total Consolidado</p>
            <h3 className="text-2xl lg:text-3xl font-black text-gray-900 leading-tight">{formatCurrency(totalNetWorth)}</h3>
            <div className="mt-4 flex items-center gap-2 text-[10px] font-black text-emerald-600 uppercase">
              <ArrowUpRight size={14} /> +3.2% este mês
            </div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Bens Físicos</p>
            <h3 className="text-xl lg:text-2xl font-bold text-gray-800 leading-tight">{formatCurrency(totalPhysical)}</h3>
            <p className="text-[10px] font-bold text-gray-400 mt-4 uppercase tracking-widest">Imóveis e Veículos</p>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow sm:col-span-2 lg:col-span-1">
            <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Financeiros</p>
            <h3 className="text-xl lg:text-2xl font-bold text-blue-600 leading-tight">{formatCurrency(totalFinancial)}</h3>
            <p className="text-[10px] font-bold text-gray-400 mt-4 uppercase tracking-widest">Corretoras e Cripto</p>
          </div>
        </div>

        {/* Navigation Tabs - Mobile Friendly */}
        <div className="flex gap-1 bg-white p-1 rounded-2xl border border-gray-200 w-full sm:w-fit mb-8 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setActiveView('overview')}
            className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-xs lg:text-sm font-bold transition-all whitespace-nowrap ${activeView === 'overview' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Visão Geral
          </button>
          <button
            onClick={() => setActiveView('physical')}
            className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-xs lg:text-sm font-bold transition-all whitespace-nowrap ${activeView === 'physical' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Bens Físicos
          </button>
          <button
            onClick={() => setActiveView('investments')}
            className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-xs lg:text-sm font-bold transition-all whitespace-nowrap ${activeView === 'investments' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-gray-500 hover:bg-gray-50'}`}
          >
            Investimentos
          </button>
        </div>

        {activeView === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            <div className="bg-white p-6 lg:p-8 rounded-3xl border border-gray-100 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-8 flex items-center gap-2 text-sm lg:text-base">
                <PieChart size={20} className="text-blue-600" />
                Alocação Geral
              </h3>
              <div className="flex flex-col sm:flex-row items-center gap-8 lg:gap-12">
                <div className="w-32 h-32 rounded-full border-[16px] border-emerald-500 relative flex items-center justify-center shrink-0">
                  <div className="absolute inset-0 border-[16px] border-blue-500 rounded-full clip-path-half rotate-45"></div>
                  <div className="text-center">
                    <p className="text-xs font-black text-gray-900">100%</p>
                  </div>
                </div>
                <div className="flex-1 w-full space-y-4">
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <span className="text-xs lg:text-sm font-bold text-gray-700">Financeiros</span>
                    </div>
                    <span className="text-xs lg:text-sm font-black text-gray-900">{Math.round((totalFinancial / totalNetWorth) * 100)}%</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                      <span className="text-xs lg:text-sm font-bold text-gray-700">Bens Físicos</span>
                    </div>
                    <span className="text-xs lg:text-sm font-black text-gray-900">{Math.round((totalPhysical / totalNetWorth) * 100)}%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 lg:p-8 rounded-3xl border border-gray-100 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-8 flex items-center gap-2 text-sm lg:text-base">
                <Target size={20} className="text-orange-500" />
                Metas Patrimoniais
              </h3>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between text-[10px] font-black mb-2.5 text-gray-400 uppercase tracking-widest">
                    <span>Primeiro Milhão</span>
                    <span className="text-blue-600">12.8%</span>
                  </div>
                  <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden shadow-inner">
                    <div className="bg-blue-600 h-full w-[12.8%] transition-all duration-1000"></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-black mb-2.5 text-gray-400 uppercase tracking-widest">
                    <span>Liberdade (R$ 3M)</span>
                    <span className="text-emerald-600">4.2%</span>
                  </div>
                  <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden shadow-inner">
                    <div className="bg-emerald-500 h-full w-[4.2%] transition-all duration-1000"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeView === 'physical' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
            {MOCK_PHYSICAL_ASSETS.map(asset => (
              <div key={asset.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden group hover:shadow-lg transition-all border-b-4 border-b-gray-200 hover:border-b-blue-500">
                <div className="p-6 lg:p-8">
                  <div className="flex justify-between items-start mb-6">
                    <div className={`p-4 rounded-2xl ${asset.category === 'REAL_ESTATE' ? 'bg-blue-50 text-blue-600' : 'bg-zinc-50 text-zinc-600'} border border-gray-50 shadow-sm`}>
                      {asset.category === 'REAL_ESTATE' ? <Home size={28} /> : <Car size={28} />}
                    </div>
                    <button className="p-2 hover:bg-gray-50 rounded-xl text-gray-400 transition-colors"><MoreHorizontal size={20} /></button>
                  </div>
                  <h4 className="font-black text-gray-900 text-lg lg:text-xl leading-tight">{asset.name}</h4>
                  <p className="text-xs text-gray-400 mt-2 font-medium">{asset.description}</p>

                  <div className="mt-8 pt-6 border-t border-gray-50">
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1.5">Estimativa Atual</p>
                    <p className="text-2xl lg:text-3xl font-black text-gray-900 leading-none">{formatCurrency(asset.estimatedValue)}</p>
                  </div>
                </div>
                <div className="px-6 py-4 bg-gray-50/50 flex justify-between items-center border-t border-gray-50">
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Base: {new Date(asset.acquisitionDate).getFullYear()}</span>
                  <button className="text-blue-600 text-[10px] font-black uppercase tracking-widest hover:underline">Reavaliar</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeView === 'investments' && (
          <div className="space-y-6 lg:space-y-8">
            {MOCK_BROKERS.map(broker => (
              <div key={broker.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                <div className="p-6 lg:p-10 flex flex-col lg:flex-row gap-8 lg:gap-12">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-black text-xl shadow-sm border border-indigo-100 shrink-0">
                        {broker.name.charAt(0)}
                      </div>
                      <h4 className="text-xl lg:text-2xl font-black text-gray-900">{broker.name}</h4>
                    </div>
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1.5">Posição Atual</p>
                    <p className="text-3xl lg:text-4xl font-black text-gray-900 leading-none tracking-tighter">{formatCurrency(broker.balance)}</p>

                    <div className="mt-8 flex flex-col sm:flex-row gap-3">
                      <button className="w-full sm:flex-1 py-3.5 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all active:scale-95">Ver Posição</button>
                      <button className="w-full sm:flex-1 py-3.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white transition-all active:bg-gray-100">Notas de Corretagem</button>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-gray-50 pt-8 lg:pt-0 lg:pl-12">
                    <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-6 text-center lg:text-left">Composição Ativa</p>
                    <div className="w-full bg-gray-100 h-8 rounded-full overflow-hidden flex shadow-inner mb-6">
                      {broker.allocation.map((item, idx) => (
                        <div
                          key={idx}
                          className={`${item.color} h-full transition-all duration-700`}
                          style={{ width: `${item.percentage}%` }}
                          title={`${item.type}: ${item.percentage}%`}
                        ></div>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
                      {broker.allocation.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <div className="flex items-center gap-3">
                            <div className={`w-2.5 h-2.5 ${item.color} rounded-full`}></div>
                            <span className="text-[11px] font-bold text-gray-600 uppercase tracking-tighter">{item.type}</span>
                          </div>
                          <span className="font-black text-gray-900 text-xs">{formatCurrency(item.value)}</span>
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
