import React, { useState, useRef, useEffect } from 'react';
import { Search, Filter, X, ChevronDown, Calendar, CreditCard, Tag, DollarSign, User, Check } from 'lucide-react';
import { BankAccount } from '../../types';


interface MultiSelectProps {
    label: string;
    placeholder: string;
    searchPlaceholder: string;
    options: { id: string; label: string }[];
    selected: string[];
    onChange: (v: string[]) => void;
    icon: React.ReactNode;
}

const SearchableMultiSelect: React.FC<MultiSelectProps> = ({ label, placeholder, searchPlaceholder, options, selected, onChange, icon }) => {
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

    const normalize = (val: string) => val.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    const filtered = options.filter(o => {
        const nOption = normalize(o.label);
        const nSearch = normalize(search);
        return nOption.includes(nSearch);
    });

    const toggle = (id: string) => {
        if (selected.includes(id)) onChange(selected.filter(x => x !== id));
        else onChange([...selected, id]);
    };

    const displayText = selected.length === 0
        ? placeholder
        : selected.length === 1
            ? options.find(o => o.id === selected[0])?.label || selected[0]
            : `${selected.length} selecionados`;

    return (
        <div ref={ref} className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                {icon} {label}
            </label>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    className={`w-full h-11 px-3 bg-slate-50 border rounded-lg text-xs font-bold outline-none flex items-center justify-between gap-2 transition-all ${selected.length > 0 ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-100 text-slate-500'}`}
                >
                    <span className="truncate">{displayText}</span>
                    <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                        <div className="p-2 border-b border-slate-50">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                                <input
                                    autoFocus
                                    className="w-full pl-8 pr-3 h-9 bg-slate-50 rounded-xl text-xs font-medium outline-none placeholder:text-slate-300 focus:ring-2 focus:ring-brand-500/10"
                                    placeholder={searchPlaceholder}
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="max-h-56 overflow-y-auto">
                            <button
                                type="button"
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold hover:bg-slate-50 transition-colors ${selected.length === 0 ? 'text-brand-600' : 'text-slate-400'}`}
                                onClick={() => { onChange([]); setOpen(false); }}
                            >
                                <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${selected.length === 0 ? 'bg-brand-600 border-brand-600' : 'border-slate-200'}`}>
                                    {selected.length === 0 && <Check size={10} className="text-white" />}
                                </div>
                                SELECIONAR TODOS
                            </button>

                            {filtered.map(o => (
                                <button
                                    key={o.id}
                                    type="button"
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium hover:bg-slate-50 transition-colors text-slate-700"
                                    onClick={() => toggle(o.id)}
                                >
                                    <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0 ${selected.includes(o.id) ? 'bg-brand-600 border-brand-600' : 'border-slate-200'}`}>
                                        {selected.includes(o.id) && <Check size={10} className="text-white" />}
                                    </div>
                                    {o.label}
                                </button>
                            ))}

                            {filtered.length === 0 && (
                                <p className="px-4 py-4 text-xs text-slate-300 text-center">Nenhum resultado</p>
                            )}
                        </div>

                        {selected.length > 0 && (
                            <div className="px-4 py-2 border-t border-slate-50 flex items-center justify-between">
                                <span className="text-[10px] text-slate-400 font-bold">{selected.length} selecionado(s)</span>
                                <button type="button" onClick={() => onChange([])} className="text-[10px] font-bold text-rose-500 hover:text-rose-700">Limpar</button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

interface HistoryFiltersProps {
    search: string;
    setSearch: (v: string) => void;
    showFilters: boolean;
    setShowFilters: (v: boolean) => void;
    filterType: string;
    setFilterType: (v: string) => void;
    filterAccount: string[];
    setFilterAccount: (v: string[]) => void;
    filterCategory: string[];
    setFilterCategory: (v: string[]) => void;
    filterSubcategory: string[];
    setFilterSubcategory: (v: string[]) => void;
    startDate: string;
    setStartDate: (v: string) => void;
    endDate: string;
    setEndDate: (v: string) => void;
    minPrice: string;
    setMinPrice: (v: string) => void;
    maxPrice: string;
    setMaxPrice: (v: string) => void;
    filterOwner: string[];
    setFilterOwner: (v: string[]) => void;
    owners: string[];
    categories: string[];
    subcategories: string[];
    accounts: BankAccount[];
    resetFilters: () => void;
}

export const HistoryFilters: React.FC<HistoryFiltersProps> = ({
    search, setSearch, showFilters, setShowFilters,
    filterType, setFilterType, filterAccount, setFilterAccount,
    filterCategory, setFilterCategory, filterSubcategory, setFilterSubcategory, startDate, setStartDate,
    endDate, setEndDate, minPrice, setMinPrice, maxPrice, setMaxPrice,
    filterOwner, setFilterOwner, owners, categories, subcategories, accounts, resetFilters
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 pt-6 border-t border-slate-50 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Calendar size={12} /> Período
                        </label>
                        <div className="flex gap-2">
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full h-11 px-3 bg-slate-50 border border-slate-50 rounded-lg text-xs font-bold outline-none focus:border-brand-500" />
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full h-11 px-3 bg-slate-50 border border-slate-50 rounded-lg text-xs font-bold outline-none focus:border-brand-500" />
                        </div>
                    </div>

                    <SearchableMultiSelect
                        label="Conta"
                        placeholder="Todas as Contas"
                        searchPlaceholder="Buscar conta..."
                        icon={<CreditCard size={12} />}
                        options={accounts.map(acc => ({ id: acc.id, label: acc.institution }))}
                        selected={filterAccount}
                        onChange={setFilterAccount}
                    />

                    <SearchableMultiSelect
                        label="Categoria"
                        placeholder="Todas Categorias"
                        searchPlaceholder="Buscar categoria..."
                        icon={<Tag size={12} />}
                        options={categories.map(c => ({ id: c, label: c }))}
                        selected={filterCategory}
                        onChange={setFilterCategory}
                    />

                    <SearchableMultiSelect
                        label="Subcategoria"
                        placeholder="Todas Subcategorias"
                        searchPlaceholder="Buscar subcategoria..."
                        icon={<Tag size={12} />}
                        options={subcategories.map(s => ({ id: s, label: s }))}
                        selected={filterSubcategory}
                        onChange={setFilterSubcategory}
                    />

                    <SearchableMultiSelect
                        label="Entidade"
                        placeholder="Todas Entidades"
                        searchPlaceholder="Buscar entidade..."
                        icon={<User size={12} />}
                        options={owners.map(o => ({ id: o, label: o }))}
                        selected={filterOwner}
                        onChange={setFilterOwner}
                    />

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

