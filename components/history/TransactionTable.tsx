import React, { useState, useRef, useEffect } from 'react';
import { Loader2, Trash2, RotateCcw, Check, ChevronUp, ChevronDown, Search, Plus, X } from 'lucide-react';
import { DateUtils } from '../../lib/dateUtils';
import { Transaction, BankAccount } from '../../types';

interface TransactionTableProps {
    transactions: Transaction[];
    isLoading: boolean;
    accounts: BankAccount[];
    categoryObjects: { name: string; type?: 'INCOME' | 'EXPENSE' }[];
    onCreateCategory: (name: string, type: 'INCOME' | 'EXPENSE') => Promise<void>;
    editingRow: { id: string; field: string } | null;
    setEditingRow: (v: { id: string; field: string } | null) => void;
    editValue: any;
    setEditValue: (v: any) => void;
    savingId: string | null;
    handleUpdate: (id: string, field: string, value: any) => void;
    handleDelete: (id: string) => void;
    statusBadge: (t: Transaction) => React.ReactNode;
    formatCurrency: (val: number) => string;
    getAmount: (t: Transaction) => number;
    getPaidAmount: (t: Transaction) => number;
    getRemaining: (t: Transaction) => number;
    getStatus: (t: Transaction) => string;
    openPayModal: (t: Transaction) => void;
    reopenTransaction: (t: Transaction) => void;
    sortField: string;
    sortDirection: 'asc' | 'desc';
    onSort: (field: string) => void;
    owners: string[];
    selectedIds: Set<string>;
    onToggleSelect: (id: string) => void;
    onSelectAll: (checked: boolean) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function useDropdownDirection(open: boolean) {
    const triggerRef = useRef<HTMLDivElement>(null);
    const [openUp, setOpenUp] = useState(false);
    useEffect(() => {
        if (!open || !triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        setOpenUp(spaceBelow < 260);
    }, [open]);
    return { triggerRef, openUp };
}

// ─── Category Picker ──────────────────────────────────────────────────────────
interface CategoryPickerProps {
    value: string;
    transactionType: 'INCOME' | 'EXPENSE' | string;
    categoryObjects: { name: string; type?: 'INCOME' | 'EXPENSE' }[];
    onSelect: (cat: string) => void;
    onCreateCategory: (name: string, type: 'INCOME' | 'EXPENSE') => Promise<void>;
}

const CategoryPicker: React.FC<CategoryPickerProps> = ({ value, transactionType, categoryObjects, onSelect, onCreateCategory }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [saving, setSaving] = useState(false);
    const { triggerRef, openUp } = useDropdownDirection(open);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
                setOpen(false); setCreating(false); setSearch(''); setNewName('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const txType = transactionType === 'INCOME' ? 'INCOME' : 'EXPENSE';
    const filtered = categoryObjects
        .filter(c => !c.type || c.type === txType)
        .filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name));

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setSaving(true);
        try {
            await onCreateCategory(newName.trim(), txType);
            onSelect(newName.trim());
            setCreating(false); setNewName(''); setOpen(false);
        } finally { setSaving(false); }
    };

    return (
        <div ref={triggerRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="text-[9px] font-bold uppercase text-brand-600/60 hover:text-brand-600 transition-colors flex items-center gap-1 leading-none"
            >
                {value || 'Categoria'}
                <ChevronDown size={9} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className={`absolute z-50 ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'} left-0 bg-white border border-slate-100 rounded-2xl shadow-2xl overflow-hidden w-56 animate-in fade-in duration-150`}>
                    <div className="p-2 border-b border-slate-50 space-y-1.5">
                        <div className="relative">
                            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
                            <input
                                autoFocus
                                className="w-full pl-7 pr-2 h-8 bg-slate-50 rounded-lg text-xs font-medium outline-none placeholder:text-slate-300"
                                placeholder={`Buscar ${txType === 'INCOME' ? 'receita' : 'despesa'}...`}
                                value={search}
                                onChange={e => { setSearch(e.target.value); setCreating(false); }}
                            />
                        </div>
                        {creating ? (
                            <div className="flex items-center gap-1.5">
                                <input
                                    autoFocus
                                    className="flex-1 h-8 px-2.5 bg-brand-50 border border-brand-200 rounded-lg text-xs font-bold outline-none"
                                    placeholder={`Nova ${txType === 'INCOME' ? 'receita' : 'despesa'}...`}
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                />
                                <button type="button" onClick={handleCreate} disabled={saving || !newName.trim()} className="w-8 h-8 bg-brand-600 text-white rounded-lg flex items-center justify-center hover:bg-brand-700 disabled:opacity-50">
                                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                                </button>
                                <button type="button" onClick={() => { setCreating(false); setNewName(''); }} className="w-8 h-8 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center hover:bg-slate-200">
                                    <X size={11} />
                                </button>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setCreating(true)} className="w-full flex items-center gap-1.5 px-2.5 h-8 text-[10px] font-bold text-brand-600 hover:bg-brand-50 rounded-lg transition-colors uppercase tracking-wider">
                                <Plus size={11} /> Criar Nova Categoria
                            </button>
                        )}
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                        {filtered.map(c => (
                            <button key={c.name} type="button"
                                onClick={() => { onSelect(c.name); setOpen(false); setSearch(''); }}
                                className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-slate-50 flex items-center gap-2 ${c.name === value ? 'text-brand-600 font-bold bg-brand-50/50' : 'text-slate-700'}`}
                            >
                                {c.name === value && <Check size={10} className="text-brand-600 shrink-0" />}
                                {c.name}
                            </button>
                        ))}
                        {filtered.length === 0 && !creating && (
                            <p className="px-3 py-4 text-xs text-slate-300 text-center">Nenhuma categoria encontrada</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Owner Picker ─────────────────────────────────────────────────────────────
interface OwnerPickerProps {
    value: string;
    allOwners: string[];
    onSelect: (owner: string) => void;
    compact?: boolean;
}

const OwnerPicker: React.FC<OwnerPickerProps> = ({ value, allOwners, onSelect, compact = false }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const { triggerRef, openUp } = useDropdownDirection(open);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
                setOpen(false); setCreating(false); setSearch(''); setNewName('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const options = allOwners
        .filter(o => o.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => a.localeCompare(b));

    const handleCreate = () => {
        if (!newName.trim()) return;
        onSelect(newName.trim());
        setCreating(false); setNewName(''); setOpen(false);
    };

    return (
        <div ref={triggerRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`font-bold text-slate-500 bg-slate-100 rounded-lg uppercase tracking-wider hover:bg-slate-200 transition-colors flex items-center gap-1 ${compact ? 'text-[9px] px-2 py-1' : 'text-[10px] px-3 py-1.5'}`}
            >
                {value}
                <ChevronDown size={9} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className={`absolute z-50 ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'} left-0 bg-white border border-slate-100 rounded-2xl shadow-2xl overflow-hidden w-48 animate-in fade-in duration-150`}>
                    <div className="p-2 border-b border-slate-50 space-y-1.5">
                        <div className="relative">
                            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
                            <input
                                autoFocus
                                className="w-full pl-7 pr-2 h-8 bg-slate-50 rounded-lg text-xs font-medium outline-none placeholder:text-slate-300"
                                placeholder="Buscar entidade..."
                                value={search}
                                onChange={e => { setSearch(e.target.value); setCreating(false); }}
                            />
                        </div>
                        {creating ? (
                            <div className="flex items-center gap-1.5">
                                <input autoFocus
                                    className="flex-1 h-8 px-2.5 bg-brand-50 border border-brand-200 rounded-lg text-xs font-bold outline-none"
                                    placeholder="Nova entidade..." value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                />
                                <button type="button" onClick={handleCreate} disabled={!newName.trim()} className="w-8 h-8 bg-brand-600 text-white rounded-lg flex items-center justify-center hover:bg-brand-700 disabled:opacity-50"><Check size={11} /></button>
                                <button type="button" onClick={() => { setCreating(false); setNewName(''); }} className="w-8 h-8 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center hover:bg-slate-200"><X size={11} /></button>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setCreating(true)} className="w-full flex items-center gap-1.5 px-2.5 h-8 text-[10px] font-bold text-brand-600 hover:bg-brand-50 rounded-lg transition-colors uppercase tracking-wider">
                                <Plus size={11} /> Nova Entidade
                            </button>
                        )}
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                        {options.map(o => (
                            <button key={o} type="button"
                                onClick={() => { onSelect(o); setOpen(false); setSearch(''); }}
                                className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 transition-colors flex items-center gap-2 ${o === value ? 'text-brand-600 font-bold' : 'text-slate-700'}`}
                            >
                                {o === value && <Check size={10} className="text-brand-600 shrink-0" />}
                                {o}
                            </button>
                        ))}
                        {options.length === 0 && !creating && (
                            <p className="px-3 py-4 text-xs text-slate-300 text-center">Nenhuma entidade encontrada</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const TransactionTable: React.FC<TransactionTableProps> = ({
    transactions, isLoading, accounts,
    categoryObjects, onCreateCategory,
    editingRow, setEditingRow, editValue, setEditValue,
    savingId, handleUpdate, handleDelete,
    statusBadge, formatCurrency, getAmount, getPaidAmount, getRemaining, getStatus,
    openPayModal, reopenTransaction,
    sortField, sortDirection, onSort,
    owners,
    selectedIds, onToggleSelect, onSelectAll
}) => {
    const EPS = 0.000001;
    const allOwners = owners;

    const LoadingState = () => (
        <div className="py-32 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Atualizando histórico...</p>
        </div>
    );

    if (isLoading) return (
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden w-full">
            <LoadingState />
        </div>
    );

    return (
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden w-full">

            {/* ════════════════ MOBILE CARD VIEW (< md) ════════════════ */}
            <div className="block md:hidden">
                {transactions.length === 0 ? (
                    <p className="text-center text-slate-400 text-sm py-16">Nenhum lançamento encontrado.</p>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {transactions.map(t => {
                            const amount = getAmount(t);
                            const remaining = getRemaining(t);
                            const status = getStatus(t);
                            const showPay = status !== 'PAID';
                            const showReopen = status === 'PAID';
                            const canPay = showPay && remaining > EPS;

                            return (
                                <div key={t.id} className={`p-4 space-y-3 transition-colors ${selectedIds.has(t.id) ? 'bg-brand-50/30' : ''}`}>
                                    {/* Row 0: Selection */}
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            className="w-5 h-5 rounded-lg border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                                            checked={selectedIds.has(t.id)}
                                            onChange={() => onToggleSelect(t.id)}
                                        />
                                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Selecionar Lançamento</span>
                                    </div>

                                    {/* Row 1: Date + Amount */}
                                    <div className="flex items-center justify-between">
                                        <button
                                            onClick={() => { setEditingRow({ id: t.id, field: 'date' }); setEditValue(t.date.split('T')[0]); }}
                                            className="text-xs font-bold text-slate-400 active:text-brand-600 transition-colors"
                                        >
                                            {DateUtils.formatDisplayDate(t.date)}
                                        </button>
                                        <span className={`text-base font-bold ${t.type === 'INCOME' ? 'text-emerald-600' : 'text-slate-900'}`}>
                                            {t.type === 'EXPENSE' ? '-' : ''}{formatCurrency(amount)}
                                        </span>
                                    </div>

                                    {/* Row 2: Description */}
                                    {editingRow?.id === t.id && editingRow.field === 'description' ? (
                                        <input
                                            autoFocus
                                            className="w-full h-10 px-3 text-sm font-bold bg-white border border-brand-500 rounded-xl outline-none"
                                            value={editValue}
                                            onChange={e => setEditValue(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleUpdate(t.id, 'description', editValue)}
                                            onBlur={() => handleUpdate(t.id, 'description', editValue)}
                                        />
                                    ) : (
                                        <button
                                            onClick={() => { setEditingRow({ id: t.id, field: 'description' }); setEditValue(t.description); }}
                                            className="text-sm font-bold text-slate-900 text-left w-full active:text-brand-600"
                                        >
                                            {t.description || 'Sem descrição'}
                                        </button>
                                    )}

                                    {/* Row 3: Account · Category | Owner badge | Status */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                            <select
                                                className="text-[10px] font-bold uppercase text-slate-400 bg-transparent border-none p-0 outline-none cursor-pointer w-full truncate"
                                                value={t.accountId}
                                                onChange={e => handleUpdate(t.id, 'account_id', e.target.value)}
                                            >
                                                {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.institution}</option>)}
                                            </select>
                                            <div className="flex items-center gap-1">
                                                <CategoryPicker
                                                    value={t.category}
                                                    transactionType={t.type}
                                                    categoryObjects={categoryObjects}
                                                    onSelect={cat => handleUpdate(t.id, 'category', cat)}
                                                    onCreateCategory={onCreateCategory}
                                                />
                                                {t.category.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer') && (
                                                    <select
                                                        className="text-[9px] font-black text-brand-600 bg-brand-50/50 px-2 py-0.5 rounded-lg outline-none cursor-pointer border border-brand-200"
                                                        value={t.metadata?.counter_account_id || ''}
                                                        onChange={e => handleUpdate(t.id, 'counter_account_id', e.target.value)}
                                                    >
                                                        <option value="">Para...</option>
                                                        {accounts.filter(a => a.id !== t.accountId).map(acc => <option key={acc.id} value={acc.id}>{acc.institution}</option>)}
                                                    </select>
                                                )}
                                            </div>
                                        </div>
                                        <OwnerPicker
                                            value={t.owner_name || 'Pessoal'}
                                            allOwners={allOwners}
                                            onSelect={owner => handleUpdate(t.id, 'owner_name', owner === 'Pessoal' ? null : owner)}
                                            compact
                                        />
                                        {statusBadge(t)}
                                    </div>

                                    {/* Row 4: Action buttons — ALWAYS VISIBLE on mobile */}
                                    <div className="flex items-center gap-2 pt-1">
                                        {savingId === t.id ? (
                                            <Loader2 size={16} className="animate-spin text-brand-500" />
                                        ) : (
                                            <>
                                                {showPay && (
                                                    <button
                                                        onClick={() => openPayModal(t)}
                                                        disabled={!canPay}
                                                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${canPay
                                                            ? 'bg-emerald-50 text-emerald-600 active:bg-emerald-100'
                                                            : 'bg-slate-50 text-slate-300 cursor-not-allowed'}`}
                                                    >
                                                        <Check size={14} /> Pagar
                                                    </button>
                                                )}
                                                {showReopen && (
                                                    <button
                                                        onClick={() => reopenTransaction(t)}
                                                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-50 text-slate-500 active:bg-slate-100 text-xs font-bold transition-all"
                                                    >
                                                        <RotateCcw size={14} /> Reabrir
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(t.id)}
                                                    className="px-4 py-2.5 rounded-xl bg-rose-50 text-rose-500 active:bg-rose-100 transition-all"
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ════════════════ DESKTOP TABLE VIEW (≥ md) ════════════════ */}
            <div className="hidden md:block w-full overflow-x-auto scrollbar-hide">
                <table className="w-full text-left border-collapse table-auto">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <tr>
                            <th className="px-6 py-5 w-10">
                                <input
                                    type="checkbox"
                                    className="w-5 h-5 rounded-lg border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                                    checked={transactions.length > 0 && selectedIds.size === transactions.length}
                                    onChange={(e) => onSelectAll(e.target.checked)}
                                />
                            </th>
                            <th className="px-6 py-5 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('date')}>
                                <div className="flex items-center gap-1">Data {sortField === 'date' && (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</div>
                            </th>
                            <th className="px-6 py-5 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('description')}>
                                <div className="flex items-center gap-1">Descrição {sortField === 'description' && (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</div>
                            </th>
                            <th className="px-6 py-5 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('category')}>
                                <div className="flex items-center gap-1">Conta / Categoria {sortField === 'category' && (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</div>
                            </th>
                            <th className="px-6 py-5 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('owner_name')}>
                                <div className="flex items-center gap-1">Entidade {sortField === 'owner_name' && (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</div>
                            </th>
                            <th className="px-6 py-5 text-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('is_paid')}>
                                <div className="flex items-center justify-center gap-1">Status {sortField === 'is_paid' && (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</div>
                            </th>
                            <th className="px-6 py-5 text-right cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onSort('amount')}>
                                <div className="flex items-center justify-end gap-1">Valor {sortField === 'amount' && (sortDirection === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</div>
                            </th>
                            <th className="px-6 py-5 text-right w-36">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {transactions.map(t => {
                            const amount = getAmount(t);
                            const remaining = getRemaining(t);
                            const status = getStatus(t);
                            const showPay = status !== 'PAID';
                            const showReopen = status === 'PAID';
                            const canPay = showPay && remaining > EPS;

                            return (
                                <tr key={t.id} className={`hover:bg-slate-50/50 transition-colors ${selectedIds.has(t.id) ? 'bg-brand-50/30' : ''}`}>
                                    <td className="px-6 py-4">
                                        <input
                                            type="checkbox"
                                            className="w-5 h-5 rounded-lg border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                                            checked={selectedIds.has(t.id)}
                                            onChange={() => onToggleSelect(t.id)}
                                        />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {editingRow?.id === t.id && editingRow.field === 'date' ? (
                                            <input type="date" autoFocus
                                                className="w-[120px] h-8 px-2 text-xs font-bold text-slate-600 bg-white border border-brand-500 rounded outline-none"
                                                value={editValue.split('T')[0]}
                                                onChange={e => setEditValue(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleUpdate(t.id, 'date', editValue)}
                                                onBlur={() => handleUpdate(t.id, 'date', editValue)}
                                            />
                                        ) : (
                                            <button onClick={() => { setEditingRow({ id: t.id, field: 'date' }); setEditValue(t.date.split('T')[0]); }}
                                                className="text-xs font-bold text-slate-400 hover:text-brand-600 transition-colors outline-none bg-transparent p-0 border-none cursor-pointer">
                                                {DateUtils.formatDisplayDate(t.date)}
                                            </button>
                                        )}
                                    </td>

                                    <td className="px-6 py-4">
                                        {editingRow?.id === t.id && editingRow.field === 'description' ? (
                                            <input autoFocus
                                                className="w-full h-9 px-3 text-sm font-bold bg-white border border-brand-500 rounded-lg outline-none"
                                                value={editValue}
                                                onChange={e => setEditValue(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleUpdate(t.id, 'description', editValue)}
                                                onBlur={() => handleUpdate(t.id, 'description', editValue)}
                                            />
                                        ) : (
                                            <button onClick={() => { setEditingRow({ id: t.id, field: 'description' }); setEditValue(t.description); }}
                                                className="text-sm font-bold text-slate-900 text-left hover:text-brand-600 transition-colors">
                                                {t.description || 'Sem descrição'}
                                            </button>
                                        )}
                                    </td>

                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1">
                                            <select
                                                className="text-[10px] font-bold uppercase text-slate-400 bg-transparent border-none p-0 outline-none cursor-pointer hover:text-slate-900 transition-colors"
                                                value={t.accountId}
                                                onChange={e => handleUpdate(t.id, 'account_id', e.target.value)}
                                            >
                                                {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.institution}</option>)}
                                            </select>
                                            <CategoryPicker
                                                value={t.category}
                                                transactionType={t.type}
                                                categoryObjects={categoryObjects}
                                                onSelect={cat => handleUpdate(t.id, 'category', cat)}
                                                onCreateCategory={onCreateCategory}
                                            />
                                            {t.category.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer') && (
                                                <select
                                                    className="text-[9px] font-black text-brand-600 bg-brand-50/50 px-2 py-0.5 rounded-lg outline-none cursor-pointer border border-brand-200 w-fit"
                                                    value={t.metadata?.counter_account_id || ''}
                                                    onChange={e => handleUpdate(t.id, 'counter_account_id', e.target.value)}
                                                >
                                                    <option value="">Destino...</option>
                                                    {accounts.filter(a => a.id !== t.accountId).map(acc => <option key={acc.id} value={acc.id}>{acc.institution}</option>)}
                                                </select>
                                            )}
                                        </div>
                                    </td>

                                    <td className="px-6 py-4">
                                        <OwnerPicker
                                            value={t.owner_name || 'Pessoal'}
                                            allOwners={allOwners}
                                            onSelect={owner => handleUpdate(t.id, 'owner_name', owner === 'Pessoal' ? null : owner)}
                                        />
                                    </td>

                                    <td className="px-6 py-4 text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            {statusBadge(t)}
                                            {(t as any).parentId && (
                                                <span className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest">Conciliação</span>
                                            )}
                                        </div>
                                    </td>

                                    <td className="px-6 py-4 text-right">
                                        {editingRow?.id === t.id && editingRow.field === 'amount' ? (
                                            <div className="flex items-center justify-end gap-1">
                                                <span className="text-sm font-bold text-slate-400">{t.type === 'EXPENSE' ? '-' : ''}</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    autoFocus
                                                    className="w-28 h-8 px-2 text-sm font-bold text-right bg-white border border-brand-500 rounded outline-none"
                                                    value={editValue}
                                                    onChange={e => setEditValue(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleUpdate(t.id, 'amount', parseFloat(editValue))}
                                                    onBlur={() => handleUpdate(t.id, 'amount', parseFloat(editValue))}
                                                />
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => { setEditingRow({ id: t.id, field: 'amount' }); setEditValue(Math.abs(t.amount).toString()); }}
                                                className={`text-sm font-bold hover:text-brand-600 transition-colors bg-transparent border-none p-0 cursor-pointer ${t.type === 'INCOME' ? 'text-emerald-600' : 'text-slate-900'}`}
                                            >
                                                {t.type === 'EXPENSE' ? '-' : ''}{formatCurrency(amount)}
                                            </button>
                                        )}
                                    </td>

                                    {/* Desktop actions — always visible, not hover-only */}
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-end gap-1">
                                            {savingId === t.id ? (
                                                <Loader2 size={16} className="animate-spin text-brand-500" />
                                            ) : (
                                                <>
                                                    {showPay && (
                                                        <button
                                                            onClick={() => openPayModal(t)}
                                                            disabled={!canPay}
                                                            title="Pagar"
                                                            className={`p-2 rounded-lg transition-all ${canPay ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-200 cursor-not-allowed'}`}
                                                        >
                                                            <Check size={16} />
                                                        </button>
                                                    )}
                                                    {showReopen && (
                                                        <button onClick={() => reopenTransaction(t)} title="Reabrir"
                                                            className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all">
                                                            <RotateCcw size={16} />
                                                        </button>
                                                    )}
                                                    <button onClick={() => handleDelete(t.id)} title="Excluir"
                                                        className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
