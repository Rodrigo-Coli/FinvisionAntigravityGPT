import React from 'react';
import { Search, Filter, X, ChevronDown } from 'lucide-react';
import { BankAccount } from '../../types';

interface HistoryFiltersProps {
    search: string;
    setSearch: (v: string) => void;
    showFilters: boolean;
    setShowFilters: (v: boolean) => void;
    filterType: string;
    setFilterType: (v: string) => void;
    filterAccount: string;
    setFilterAccount: (v: string) => void;
    filterCategory: string;
    setFilterCategory: (v: string) => void;
    startDate: string;
    setStartDate: (v: string) => void;
    endDate: string;
    setEndDate: (v: string) => void;
    minPrice: string;
    setMinPrice: (v: string) => void;
    maxPrice: string;
    setMaxPrice: (v: string) => void;
    categories: string[];
    accounts: BankAccount[];
    resetFilters: () => void;
}

export const HistoryFilters: React.FC<HistoryFiltersProps> = ({
    search,
    setSearch,
    showFilters,
    setShowFilters,
    filterType,
    setFilterType,
    filterAccount,
    setFilterAccount,
    filterCategory,
    setFilterCategory,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    minPrice,
    setMinPrice,
    maxPrice,
    setMaxPrice,
    categories,
    accounts,
    resetFilters
}) => {
    return (
        <div className="bg-white p-6 rounded-3xl border border-slate-200/50 shadow-sm mb-6">
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="relative flex-grow">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-500 transition-colors" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar por descrição ou detalhe..."
                        className="w-full pl-12 pr-4 h-14 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 text-sm font-medium transition-all"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center justify-center gap-3 px-8 h-14 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${showFilters
                            ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20'
                            : 'bg-slate-50 text-slate-600 border border-slate-100 hover:bg-slate-100'
                        }`}
                >
                    <Filter size={18} />
                    Filtros Avançados
                    {showFilters ? <X size={14} /> : <ChevronDown size={14} />}
                </button>
            </div>

            {showFilters && (
                <div className="mt-6 pt-6 border-t border-slate-50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Período</label>
                        <div className="flex gap-2">
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full h-12 px-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20" />
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full h-12 px-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo & Conta</label>
                        <div className="flex gap-2">
                            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full h-12 px-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none cursor-pointer">
                                <option value="ALL">Todos Tipos</option>
                                <option value="INCOME">Entradas</option>
                                <option value="EXPENSE">Saídas</option>
                            </select>
                            <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className="w-full h-12 px-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none cursor-pointer">
                                <option value="ALL">Todas Contas</option>
                                {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.institution}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Filtro de Valor (R$)</label>
                        <div className="flex gap-2">
                            <input type="number" placeholder="Min" value={minPrice} onChange={e => setMinPrice(e.target.value)} className="w-full h-12 px-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none placeholder:text-slate-300" />
                            <input type="number" placeholder="Max" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="w-full h-12 px-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none placeholder:text-slate-300" />
                        </div>
                    </div>

                    <div className="flex flex-col justify-end gap-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Categoria</label>
                        <div className="flex gap-2">
                            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="flex-grow h-12 px-4 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none cursor-pointer">
                                <option value="ALL">Todas Categorias</option>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <button onClick={resetFilters} className="h-12 px-4 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase hover:bg-rose-100 transition-colors tracking-widest">Limpar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
