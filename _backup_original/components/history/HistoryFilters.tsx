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
    const activeFilterCount = [
        filterType !== 'ALL',
        filterAccount !== 'ALL',
        filterCategory !== 'ALL',
        startDate !== '',
        endDate !== '',
        minPrice !== '',
        maxPrice !== ''
    ].filter(Boolean).length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col xl:flex-row gap-6">
                <div className="relative flex-grow group">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors" size={20} />
                    <input
                        type="text"
                        placeholder="Pesquisar por descrição ou instituição..."
                        className="w-full pl-16 pr-8 h-20 bg-white border border-slate-100 rounded-[28px] outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-300 text-base font-bold text-slate-900 transition-all shadow-soft placeholder:text-slate-200"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex-1 xl:flex-none px-10 h-20 rounded-[28px] font-bold text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-4 border ${showFilters || activeFilterCount > 0 ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-100 text-slate-400 hover:text-slate-900 hover:border-slate-300 shadow-soft'}`}
                >
                    <Filter size={20} />
                    <span className="hidden sm:inline">Advanced Filters</span> {activeFilterCount > 0 && `(${activeFilterCount})`}
                    {showFilters ? <X size={16} /> : <ChevronDown size={16} />}
                </button>
            </div>

            {showFilters && (
                <div className="p-10 bg-white border border-slate-100 rounded-[40px] shadow-soft animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
                        <div className="space-y-4">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Período Fiscal</label>
                            <div className="flex gap-4">
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full h-14 px-4 bg-slate-50 border border-transparent rounded-2xl text-[11px] font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-200 transition-all" />
                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full h-14 px-4 bg-slate-50 border border-transparent rounded-2xl text-[11px] font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-200 transition-all" />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Estratégia & Custódia</label>
                            <div className="flex gap-4">
                                <select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full h-14 px-4 bg-slate-50 border border-transparent rounded-2xl text-[11px] font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-200 transition-all cursor-pointer appearance-none">
                                    <option value="ALL">Todos Tipos</option>
                                    <option value="INCOME">Entradas</option>
                                    <option value="EXPENSE">Saídas</option>
                                </select>
                                <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className="w-full h-14 px-4 bg-slate-50 border border-transparent rounded-2xl text-[11px] font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-200 transition-all cursor-pointer appearance-none">
                                    <option value="ALL">Todas Contas</option>
                                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.institution}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Range de Valor (BRL)</label>
                            <div className="flex gap-4">
                                <input type="number" placeholder="Min" value={minPrice} onChange={e => setMinPrice(e.target.value)} className="w-full h-14 px-4 bg-slate-50 border border-transparent rounded-2xl text-[11px] font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-200 transition-all placeholder:text-slate-300" />
                                <input type="number" placeholder="Max" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="w-full h-14 px-4 bg-slate-50 border border-transparent rounded-2xl text-[11px] font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-200 transition-all placeholder:text-slate-300" />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Classificação</label>
                            <div className="flex gap-4">
                                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="flex-grow h-14 px-4 bg-slate-50 border border-transparent rounded-2xl text-[11px] font-bold text-slate-900 outline-none focus:bg-white focus:border-slate-200 transition-all cursor-pointer appearance-none">
                                    <option value="ALL">Todas Categorias</option>
                                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <button onClick={resetFilters} className="px-6 h-14 bg-rose-50 text-rose-600 rounded-2xl text-[9px] font-bold uppercase tracking-[0.2em] hover:bg-rose-100 transition-all active:scale-95 whitespace-nowrap">Reset</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
