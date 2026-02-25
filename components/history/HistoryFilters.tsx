import React, { useState, useRef, useEffect } from 'react';
import { Search, Filter, X, ChevronDown, Calendar, CreditCard, Tag, DollarSign, User, Check } from 'lucide-react';
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
    filterCategory: string[];
    setFilterCategory: (v: string[]) => void;
    startDate: string;
    setStartDate: (v: string) => void;
    endDate: string;
    setEndDate: (v: string) => void;
    minPrice: string;
    setMinPrice: (v: string) => void;
    maxPrice: string;
    setMaxPrice: (v: string) => void;
    filterOwner: string;
    setFilterOwner: (v: string) => void;
    owners: string[];
    categories: string[];
    accounts: BankAccount[];
    resetFilters: () => void;
}

// ─── Searchable Multi-Select ────────────────────────────────────────────────
const MultiSelectCategory: React.FC<{
    categories: string[];
    selected: string[];
    onChange: (v: string[]) => void;
}> = ({ categories, selected, onChange }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = categories.filter(c => c.toLowerCase().includes(search.toLowerCase()));

    const toggle = (c: string) => {
        if (selected.includes(c)) onChange(selected.filter(x => x !== c));
        else onChange([...selected, c]);
    };

    const label = selected.length === 0
        ? 'Todas Categorias'
        : selected.length === 1
            ? selected[0]
            : `${selected.length} categorias`;

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`w-full h-11 px-3 bg-slate-50 border rounded-lg text-xs font-bold outline-none flex items-center justify-between gap-2 transition-all ${selected.length > 0 ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-100 text-slate-500'
                    }`}
            >
                <span className="truncate">{label}</span>
                <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                    {/* Search */}
                    <div className="p-2 border-b border-slate-50">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                            <input
                                autoFocus
                                className="w-full pl-8 pr-3 h-9 bg-slate-50 rounded-xl text-xs font-medium outline-none placeholder:text-slate-300 focus:ring-2 focus:ring-brand-500/10"
                                placeholder="Buscar categoria..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* All option */}
                    <div className="max-h-56 overflow-y-auto">
                        <button
                            type="button"
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold hover:bg-slate-50 transition-colors ${selected.length === 0 ? 'text-brand-600' : 'text-slate-400'}`}
                            onClick={() => { onChange([]); setOpen(false); }}
                        >
                            <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${selected.length === 0 ? 'bg-brand-600 border-brand-600' : 'border-slate-200'}`}>
                                {selected.length === 0 && <Check size={10} className="text-white" />}
                            </div>
                            TODAS AS CATEGORIAS
                        </button>

                        {filtered.map(c => (
                            <button
                                key={c}
                                type="button"
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium hover:bg-slate-50 transition-colors text-slate-700"
                                onClick={() => toggle(c)}
                            >
                                <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0 ${selected.includes(c) ? 'bg-brand-600 border-brand-600' : 'border-slate-200'}`}>
                                    {selected.includes(c) && <Check size={10} className="text-white" />}
                                </div>
                                {c}
                            </button>
                        ))}

                        {filtered.length === 0 && (
                            <p className="px-4 py-4 text-xs text-slate-300 text-center">Nenhuma categoria encontrada</p>
                        )}
                    </div>

                    {/* Footer: selected count + clear */}
                    {selected.length > 0 && (
                        <div className="px-4 py-2 border-t border-slate-50 flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 font-bold">{selected.length} selecionada(s)</span>
                            <button type="button" onClick={() => onChange([])} className="text-[10px] font-bold text-rose-500 hover:text-rose-700">Limpar</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Main Component ──────────────────────────────────────────────────────────
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
    filterOwner,
    setFilterOwner,
    owners,
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
                        <MultiSelectCategory
                            categories={categories}
                            selected={filterCategory}
                            onChange={setFilterCategory}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <User size={12} /> Entidade
                        </label>
                        <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} className="w-full h-11 px-3 bg-slate-50 border border-slate-50 rounded-lg text-xs font-bold outline-none">
                            <option value="ALL">Todas Entidades</option>
                            {owners.map(o => <option key={o} value={o}>{o}</option>)}
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
