import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Trash2, RotateCcw, Check, ChevronUp, ChevronDown, Search, Plus, X, Paperclip, Eye, Download, Upload, Pencil } from 'lucide-react';
import { DateUtils } from '../../lib/dateUtils';
import { Transaction, BankAccount } from '../../types';

interface TransactionTableProps {
    transactions: Transaction[];
    isLoading: boolean;
    accounts: BankAccount[];
    categoryObjects: { name: string; type?: 'INCOME' | 'EXPENSE' }[];
    subcategories: { id: string; name: string; category_name?: string }[];
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
    onUploadAttachment: (id: string, file: File) => Promise<void>;
    onDeleteAttachment: (id: string, documentId: string) => Promise<void>;
    onViewAttachment: (documentId: string) => Promise<void>;
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

// ─── Subcategory Picker ───────────────────────────────────────────────────────
interface SubcategoryPickerProps {
    value?: string;
    parentCategory: string;
    subcategories: { id: string; name: string; category_name?: string }[];
    onSelect: (subcat: string | null) => void;
}

const SubcategoryPicker: React.FC<SubcategoryPickerProps> = ({ value, parentCategory, subcategories, onSelect }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const { triggerRef, openUp } = useDropdownDirection(open);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
                setOpen(false); setSearch('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = subcategories
        .filter(s => s.category_name === parentCategory)
        .filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (subcategories.filter(s => s.category_name === parentCategory).length === 0 && !value) return null;

    return (
        <div ref={triggerRef} className="relative inline-block ml-1">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="text-[9px] font-bold uppercase text-brand-400 hover:text-brand-600 transition-colors flex items-center gap-1 leading-none border-l border-brand-200 pl-1"
                title={value ? `Subcategoria: ${value}` : "Adicionar Subcategoria"}
            >
                {value || 'Subcat'}
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
                                placeholder="Buscar subcategoria..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                        <button type="button"
                            onClick={() => { onSelect(null); setOpen(false); setSearch(''); }}
                            className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-slate-50 flex items-center gap-2 ${!value ? 'text-brand-600 font-bold bg-brand-50/50' : 'text-slate-400'}`}
                        >
                            {!value && <Check size={10} className="text-brand-600 shrink-0" />}
                            Sem Subcategoria
                        </button>
                        {filtered.map(s => (
                            <button key={s.id} type="button"
                                onClick={() => { onSelect(s.name); setOpen(false); setSearch(''); }}
                                className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-slate-50 flex items-center gap-2 ${s.name === value ? 'text-brand-600 font-bold bg-brand-50/50' : 'text-slate-700'}`}
                            >
                                {s.name === value && <Check size={10} className="text-brand-600 shrink-0" />}
                                {s.name}
                            </button>
                        ))}
                        {search.trim() && !filtered.some(s => s.name.toLowerCase() === search.trim().toLowerCase()) && (
                            <button type="button"
                                onClick={() => { onSelect(search.trim()); setOpen(false); setSearch(''); }}
                                className="w-full text-left px-3 py-2 text-xs font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 transition-colors flex items-center gap-2"
                            >
                                <Plus size={10} className="shrink-0" />
                                Criar "{search.trim()}"
                            </button>
                        )}
                        {filtered.length === 0 && !search.trim() && (
                            <p className="px-3 py-4 text-xs text-slate-300 text-center">Nenhuma subcategoria</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Account Picker ─────────────────────────────────────────────────────────────
interface AccountPickerProps {
    value: string;
    accounts: BankAccount[];
    onSelect: (accountId: string) => void;
    compact?: boolean;
    placeholder?: string;
}

const AccountPicker: React.FC<AccountPickerProps> = ({ value, accounts, onSelect, compact = false, placeholder = 'Conta' }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const { triggerRef, openUp } = useDropdownDirection(open);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

    useEffect(() => {
        if (open && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const dropdownHeight = 250;
            const shouldOpenUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
            setCoords({
                top: shouldOpenUp ? rect.top - 4 : rect.bottom + 4,
                left: rect.left,
                width: Math.max(rect.width, 160) // ensure min width
            });
        }
    }, [open]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (triggerRef.current && triggerRef.current.contains(e.target as Node)) return;
            const dropdown = document.getElementById('account-picker-portal');
            if (dropdown && dropdown.contains(e.target as Node)) return;
            setOpen(false); setSearch('');
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = accounts
        .filter(a => a.institution.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => a.institution.localeCompare(b.institution));

    // Find current label to display
    const currentAcc = accounts.find(a => a.id === value);
    const displayLabel = currentAcc ? currentAcc.institution : placeholder;

    return (
        <div ref={triggerRef} className="relative inline-block">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={compact
                    ? "text-[9px] font-black uppercase text-brand-600 bg-brand-50/50 px-2 flex items-center gap-1 py-0.5 rounded-lg outline-none cursor-pointer border border-brand-200 max-w-[120px] truncate leading-none h-[18px]"
                    : "text-[10px] font-bold uppercase text-slate-400 hover:text-slate-600 bg-transparent border-none p-0 outline-none cursor-pointer truncate flex items-center gap-1"}
                title={displayLabel}
            >
                {displayLabel}
                <ChevronDown size={9} className={`transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && createPortal(
                <div id="account-picker-portal"
                    style={{
                        position: 'fixed',
                        top: openUp ? 'auto' : coords.top,
                        bottom: openUp ? window.innerHeight - coords.top + 8 : 'auto',
                        left: coords.left,
                        minWidth: '12rem',
                    }}
                    className={`z-[9999] bg-white border border-slate-100 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in duration-150`}>
                    <div className="p-2 border-b border-slate-50 space-y-1.5">
                        <div className="relative">
                            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
                            <input
                                autoFocus
                                className="w-full pl-7 pr-2 h-8 bg-slate-50 rounded-lg text-xs font-medium outline-none placeholder:text-slate-300"
                                placeholder={`Buscar ${placeholder.toLowerCase()}...`}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                        {filtered.map(a => (
                            <button key={a.id} type="button"
                                onClick={() => { onSelect(a.id); setOpen(false); setSearch(''); }}
                                className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 transition-colors flex items-center gap-2 ${a.id === value ? 'text-brand-600 font-bold bg-brand-50/50' : 'text-slate-700'}`}
                            >
                                {a.id === value && <Check size={10} className="text-brand-600 shrink-0" />}
                                {a.institution}
                            </button>
                        ))}
                        {filtered.length === 0 && (
                            <p className="px-3 py-4 text-xs text-slate-300 text-center">Nenhuma conta encontrada</p>
                        )}
                    </div>
                </div>,
                document.body
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

    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

    useEffect(() => {
        if (open && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            // Calcula se tem espaço pra baixo ou se precisa abrir pra cima
            const spaceBelow = window.innerHeight - rect.bottom;
            const dropdownHeight = 250; // altura max aproximada
            const shouldOpenUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

            setCoords({
                top: shouldOpenUp ? rect.top - 4 /* margin */ : rect.bottom + 4,
                left: rect.left,
                width: rect.width
            });
        }
    }, [open]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            // Se o clique foi no trigger
            if (triggerRef.current && triggerRef.current.contains(e.target as Node)) return;

            // Se o clique foi dentro do dropdown (que agora renderiza fora da árvore DOM no portal)
            const dropdown = document.getElementById('owner-picker-portal');
            if (dropdown && dropdown.contains(e.target as Node)) return;

            setOpen(false); setCreating(false); setSearch(''); setNewName('');
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

            {open && createPortal(
                <div id="owner-picker-portal"
                    style={{
                        position: 'fixed',
                        top: openUp ? 'auto' : coords.top,
                        bottom: openUp ? window.innerHeight - coords.top + 8 : 'auto',
                        left: coords.left,
                        minWidth: '12rem',
                    }}
                    className={`z-[9999] bg-white border border-slate-100 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in duration-150`}>
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
                </div>,
                document.body
            )}
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const TransactionTable: React.FC<TransactionTableProps> = ({
    transactions, isLoading, accounts,
    categoryObjects, subcategories, onCreateCategory,
    editingRow, setEditingRow, editValue, setEditValue,
    savingId, handleUpdate, handleDelete,
    statusBadge, formatCurrency, getAmount, getPaidAmount, getRemaining, getStatus,
    openPayModal, reopenTransaction,
    sortField, sortDirection, onSort,
    owners,
    selectedIds, onToggleSelect, onSelectAll,
    onUploadAttachment, onDeleteAttachment, onViewAttachment
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadingForId, setUploadingForId] = useState<string | null>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && uploadingForId) {
            await onUploadAttachment(uploadingForId, file);
            setUploadingForId(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };
    const EPS = 0.000001;
    const allOwners = owners;

    // ─── Progressive Rendering (Virtual Scroll sem npm) ───────────────────────
    const ROWS_PER_PAGE = 50;
    const [visibleCount, setVisibleCount] = useState(ROWS_PER_PAGE);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const loadingRef = useRef(false);

    // Reset ao mudar transações (novo filtro, nova página, etc.)
    useEffect(() => {
        setVisibleCount(ROWS_PER_PAGE);
    }, [transactions.length]);

    // IntersectionObserver — carrega mais linhas ao chegar perto do fim
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !loadingRef.current) {
                    loadingRef.current = true;
                    setTimeout(() => {
                        setVisibleCount(prev => Math.min(prev + ROWS_PER_PAGE, transactions.length)); // Changed ITEMS_PER_PAGE to ROWS_PER_PAGE
                        loadingRef.current = false;
                    }, 50); // slight delay to prevent UI freeze
                }
            },
            { root: null, rootMargin: '200px', threshold: 0 }
        );

        if (sentinelRef.current) observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [transactions.length]); // Dependency array updated

    const visibleTransactions = transactions.slice(0, visibleCount);
    const hasMore = visibleCount < transactions.length;

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
                        {visibleTransactions.map(t => {
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
                                        {/* DATE */}
                                        {editingRow?.id === t.id && editingRow.field === 'date' ? (
                                            <input type="date" autoFocus
                                                className="w-[110px] h-8 px-2 text-xs font-bold text-slate-600 bg-white border border-brand-500 rounded outline-none"
                                                value={editValue.split('T')[0]}
                                                onChange={e => setEditValue(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleUpdate(t.id, 'date', editValue)}
                                                onBlur={() => handleUpdate(t.id, 'date', editValue)}
                                            />
                                        ) : (
                                            <button
                                                onClick={() => { setEditingRow({ id: t.id, field: 'date' }); setEditValue(t.date.split('T')[0]); }}
                                                className="text-xs font-bold text-slate-400 active:text-brand-600 transition-colors"
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    {DateUtils.formatDisplayDate(t.date)}
                                                    <Pencil size={10} className="text-slate-200" />
                                                </div>
                                            </button>
                                        )}

                                        {/* AMOUNT */}
                                        {editingRow?.id === t.id && editingRow.field === 'amount' ? (
                                            <div className="flex items-center gap-1">
                                                <span className="text-sm font-bold text-slate-400">{(t.type === 'EXPENSE' || (t.type === 'TRANSFER' && t.metadata?.transfer_side === 'SOURCE')) ? '-' : ''}</span>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    placeholder="0,00"
                                                    autoFocus
                                                    className="w-24 h-8 px-2 text-sm font-bold text-right bg-white border border-brand-500 rounded outline-none"
                                                    value={editValue}
                                                    onChange={e => setEditValue(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleUpdate(t.id, 'amount', editValue)}
                                                    onBlur={() => handleUpdate(t.id, 'amount', editValue)}
                                                />
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => { setEditingRow({ id: t.id, field: 'amount' }); setEditValue(Math.abs(t.amount).toString().replace('.', ',')); }}
                                                className={`text-base font-bold bg-transparent border-none p-0 cursor-pointer active:text-brand-600 truncate max-w-[120px] ${t.type?.toUpperCase() === 'INCOME' ? 'text-emerald-600' : (t.type?.toUpperCase() === 'TRANSFER' && t.metadata?.transfer_side !== 'SOURCE') ? 'text-emerald-600' : 'text-slate-900'}`}
                                            >
                                                {(t.type?.toUpperCase() === 'EXPENSE' || t.type?.toUpperCase() === 'BILL_PAYMENT' || (t.type?.toUpperCase() === 'TRANSFER' && t.metadata?.transfer_side === 'SOURCE')) ? '-' : ''}{formatCurrency(amount)}
                                            </button>
                                        )}
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
                                                className="text-sm font-bold text-slate-900 text-left w-full active:text-brand-600 truncate"
                                            >
                                                <div className="flex items-center gap-1.5 truncate">
                                                    <span className="truncate">{t.description || 'Sem descrição'}</span>
                                                    <Pencil size={11} className="text-slate-200 shrink-0" />
                                                </div>
                                            </button>
                                    )}

                                    {/* Row 3: Account · Category · Owner · Status */}
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex flex-col gap-1 flex-1 min-w-0">
                                                <AccountPicker
                                                    value={t.accountId}
                                                    accounts={accounts}
                                                    onSelect={accId => handleUpdate(t.id, 'account_id', accId)}
                                                />
                                                <div className="flex items-center gap-1 flex-wrap">
                                                    <CategoryPicker
                                                        value={t.category}
                                                        transactionType={t.type}
                                                        categoryObjects={categoryObjects}
                                                        onSelect={cat => handleUpdate(t.id, 'category', cat)}
                                                        onCreateCategory={onCreateCategory}
                                                    />
                                                    <SubcategoryPicker
                                                        value={t.subcategory}
                                                        parentCategory={t.category}
                                                        subcategories={subcategories}
                                                        onSelect={sub => handleUpdate(t.id, 'subcategory', sub)}
                                                    />
                                                    {(t.category?.toLowerCase() || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer') && (
                                                        <AccountPicker
                                                            compact
                                                            placeholder="Para..."
                                                            value={t.metadata?.counter_account_id || ''}
                                                            accounts={accounts.filter(a => a.id !== t.accountId)}
                                                            onSelect={accId => handleUpdate(t.id, 'counter_account_id', accId)}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                <OwnerPicker
                                                    value={t.owner_name || 'Pessoal'}
                                                    allOwners={allOwners}
                                                    onSelect={owner => handleUpdate(t.id, 'owner_name', owner === 'Pessoal' ? null : owner)}
                                                    compact
                                                />
                                                {statusBadge(t)}
                                            </div>
                                        </div>

                                        {/* ATTACHMENTS Dedicated Section */}
                                        {(t.attachments && t.attachments.length > 0) ? (
                                            <div className="flex flex-wrap items-center gap-2 p-2.5 bg-slate-50 border border-slate-100/50 rounded-2xl">
                                                <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] mr-1">Anexos:</span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {t.attachments.map(doc => (
                                                        <div key={doc.id} className="group relative flex items-center gap-1 p-1.5 bg-white border border-slate-100 text-brand-600 rounded-lg hover:bg-brand-50 transition-all shadow-sm">
                                                            <button onClick={() => onViewAttachment(doc.id)} title={doc.original_name}>
                                                                <Eye size={12} />
                                                            </button>
                                                            <button onClick={() => onDeleteAttachment(t.id, doc.id)} className="text-rose-400 hover:text-rose-600">
                                                                <X size={10} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button
                                                        onClick={() => { setUploadingForId(t.id); fileInputRef.current?.click(); }}
                                                        className="p-1.5 bg-white border border-dashed border-slate-200 text-slate-400 rounded-lg hover:text-brand-600 transition-colors"
                                                        title="Adicionar anexo"
                                                    >
                                                        <Plus size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-end">
                                                <button
                                                    onClick={() => { setUploadingForId(t.id); fileInputRef.current?.click(); }}
                                                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 text-slate-400 rounded-lg hover:bg-brand-50 hover:text-brand-600 transition-all text-[10px] font-bold uppercase tracking-wider"
                                                >
                                                    <Paperclip size={12} /> Anexar Comprovante
                                                </button>
                                            </div>
                                        )}
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
                            <th className="px-6 py-5 text-center w-20">Anexo</th>
                            <th className="px-6 py-5 text-right w-36">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {visibleTransactions.map(t => {
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
                                                <div className="flex items-center gap-2 group/edit">
                                                    {t.description || 'Sem descrição'}
                                                    <Pencil size={12} className="text-slate-200 group-hover/edit:text-brand-500 transition-colors" />
                                                </div>
                                            </button>
                                        )}
                                    </td>

                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1">
                                            <AccountPicker
                                                value={t.accountId}
                                                accounts={accounts}
                                                onSelect={accId => handleUpdate(t.id, 'account_id', accId)}
                                            />
                                            <div className="flex items-center gap-1 flex-wrap">
                                                <CategoryPicker
                                                    value={t.category}
                                                    transactionType={t.type}
                                                    categoryObjects={categoryObjects}
                                                    onSelect={cat => handleUpdate(t.id, 'category', cat)}
                                                    onCreateCategory={onCreateCategory}
                                                />
                                                <SubcategoryPicker
                                                    value={t.subcategory}
                                                    parentCategory={t.category}
                                                    subcategories={subcategories}
                                                    onSelect={sub => handleUpdate(t.id, 'subcategory', sub)}
                                                />
                                            </div>
                                            {(t.category?.toLowerCase() || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer') && (
                                                <AccountPicker
                                                    compact
                                                    placeholder={t.metadata?.transfer_side === 'DESTINATION' ? 'Origem...' : 'Destino...'}
                                                    value={t.metadata?.counter_account_id || ''}
                                                    accounts={accounts.filter(a => a.id !== t.accountId)}
                                                    onSelect={accId => handleUpdate(t.id, 'counter_account_id', accId)}
                                                />
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
                                                <span className="text-sm font-bold text-slate-400">{(t.type === 'EXPENSE' || (t.type === 'TRANSFER' && t.metadata?.transfer_side === 'SOURCE')) ? '-' : ''}</span>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    placeholder="0,00"
                                                    autoFocus
                                                    className="w-28 h-8 px-2 text-sm font-bold text-right bg-white border border-brand-500 rounded outline-none"
                                                    value={editValue}
                                                    onChange={e => setEditValue(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleUpdate(t.id, 'amount', editValue)}
                                                    onBlur={() => handleUpdate(t.id, 'amount', editValue)}
                                                />
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => { setEditingRow({ id: t.id, field: 'amount' }); setEditValue(Math.abs(t.amount).toString().replace('.', ',')); }}
                                                className={`text-sm font-bold hover:text-brand-600 transition-colors bg-transparent border-none p-0 cursor-pointer 
                                                    ${(t.type?.toUpperCase() === 'INCOME' || (t.type?.toUpperCase() === 'TRANSFER' && t.metadata?.transfer_side !== 'SOURCE')) ? 'text-emerald-600' : 'text-rose-600'}`}
                                            >
                                                {(t.type?.toUpperCase() === 'EXPENSE' || t.type?.toUpperCase() === 'BILL_PAYMENT' || (t.type?.toUpperCase() === 'TRANSFER' && t.metadata?.transfer_side === 'SOURCE')) ? '-' : ''}{formatCurrency(amount)}
                                            </button>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-center gap-1.5 flex-wrap max-w-[120px] mx-auto">
                                            {t.attachments && t.attachments.length > 0 ? (
                                                <>
                                                    {t.attachments.map(doc => (
                                                        <div key={doc.id} className="group relative flex items-center gap-1 p-1.5 bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 transition-all shadow-sm">
                                                            <button onClick={() => onViewAttachment(doc.id)} title={doc.original_name}>
                                                                <Eye size={12} />
                                                            </button>
                                                            <button onClick={() => onDeleteAttachment(t.id, doc.id)} className="text-rose-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <X size={10} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button onClick={() => { setUploadingForId(t.id); fileInputRef.current?.click(); }} className="p-1.5 text-slate-300 hover:text-brand-600 transition-colors" title="Adicionar anexo">
                                                        <Plus size={12} />
                                                    </button>
                                                </>
                                            ) : (
                                                <button onClick={() => { setUploadingForId(t.id); fileInputRef.current?.click(); }} className="p-2 text-slate-300 hover:text-brand-600 transition-all" title="Anexar comprovante">
                                                    <Paperclip size={14} />
                                                </button>
                                            )}
                                        </div>
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

            {/* Sentinel para carregamento progressivo */}
            {hasMore ? (
                <div ref={sentinelRef} className="py-8 text-center flex flex-col items-center justify-center gap-2">
                    <Loader2 size={20} className="animate-spin text-brand-500" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Carregando mais lançamentos... ({visibleCount} de {transactions.length})
                    </p>
                </div>
            ) : (
                <div className="py-8 text-center">
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                        Fim do Histórico ({transactions.length} Lançamentos)
                    </p>
                </div>
            )}

            {/* Hidden file input for attachment uploads */}
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                multiple
                onChange={handleFileChange}
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
            />
        </div>
    );
};
