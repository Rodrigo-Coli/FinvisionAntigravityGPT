import React from 'react';
import { Search, Filter, X, ChevronDown, Calendar, CreditCard, Tag, DollarSign } from 'lucide-react';
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
        <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="relative flex-grow">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por descrição ou detalhe..."
                        className="w-full pl-11 pr-4 h-12 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 text-sm font-medium transition-all"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center justify-center gap-3 px-8 h-12 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${showFilters
                        ? 'bg-brand-600 text-white shadow-lg'
                        : 'bg-slate-50 text-slate-400 border border-slate-100 hover:bg-slate-100'
                        }`}
                >
                    <Filter size={16} />
                    {showFilters ? 'Recolher' : 'Filtros Avançados'}
                    {showFilters ? <X size={14} /> : <ChevronDown size={14} />}
                </button>
            </div>

            {showFilters && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-6 border-t border-slate-50 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Calendar size={12} /> Período
                        </label>
                        <div className="flex gap-2">
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full h-11 px-3 bg-slate-50 border border-slate-50 rounded-lg text-xs font-bold outline-none focus:border-brand-500" />
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full h-11 px-3 bg-slate-50 border border-slate-50 rounded-lg text-xs font-bold outline-none focus:border-brand-500" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <CreditCard size={12} /> Conta
                        </label>
                        <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className="w-full h-11 px-3 bg-slate-50 border border-slate-50 rounded-lg text-xs font-bold outline-none">
                            <option value="ALL">Todas as Contas</option>
                            {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.institution}</option>)}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Tag size={12} /> Categoria
                        </label>
                        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="w-full h-11 px-3 bg-slate-50 border border-slate-50 rounded-lg text-xs font-bold outline-none">
                            <option value="ALL">Todas Categorias</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    <div className="flex flex-col justify-end gap-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <DollarSign size={12} /> Faixa de Valor
                        </label>
                        <div className="flex items-center gap-2">
                            <div className="flex-grow flex gap-1">
                                <input type="number" placeholder="Min" value={minPrice} onChange={e => setMinPrice(e.target.value)} className="w-full h-11 px-3 bg-slate-50 border border-slate-50 rounded-lg text-xs font-bold outline-none" />
                                <input type="number" placeholder="Max" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="w-full h-11 px-3 bg-slate-50 border border-slate-50 rounded-lg text-xs font-bold outline-none" />
                            </div>
                            <button onClick={resetFilters} className="h-11 px-4 text-rose-500 font-bold text-[10px] uppercase tracking-widest">Limpar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
