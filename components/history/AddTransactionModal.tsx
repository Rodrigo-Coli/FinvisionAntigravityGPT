import React, { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle, Plus, Camera, Check, SplitSquareHorizontal } from 'lucide-react';
import { BankAccount } from '../../types';
import { supabase } from '../../lib/supabase/client';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { SplitFieldsInline } from './SplitFieldsInline';
import { SplitDraft } from '../../services/splitTransaction.service';
import { getSessionUser } from '../../lib/session';
import { TagsInput } from '../common/TagsInput';

interface AddTransactionModalProps {
    show: boolean;
    onClose: () => void;
    onSubmit: (formData: any) => void;
    isSubmitting: boolean;
    error?: string | null;
    initialForm: {
        date: string;
        description: string;
        type: 'INCOME' | 'EXPENSE';
        amount: string;
        accountId: string;
        category: string;
        subcategory: string;
        ownerName: string;
        isInstallment: boolean;
        installmentsCount: number;
        isRecurring: boolean;
        recurrencePeriod: 'weekly' | 'monthly' | 'yearly' | 'biweekly' | 'custom';
        recurrenceDaysInterval: number;
        destinationAccountId?: string;
        documentId?: string;
        files?: File[];
        isPaidNow?: boolean;
        notes?: string;
        tags?: string[];
    };
    accounts: BankAccount[];
    owners: string[];
    categoryObjects: { name: string, type?: 'INCOME' | 'EXPENSE' }[];
    subcategories: { id: string, name: string, category_name?: string }[];
    /** Tags já usadas na conta, sugeridas na digitação. */
    availableTags?: string[];
    onCreateCategory: (name: string, type: 'INCOME' | 'EXPENSE') => Promise<void>;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
    show,
    onClose,
    onSubmit,
    isSubmitting,
    error,
    initialForm,
    accounts,
    owners,
    categoryObjects,
    subcategories,
    availableTags = [],
    onCreateCategory
}) => {
    const [form, setForm] = useState(() => Object.assign({
        date: '',
        description: '',
        type: 'EXPENSE' as 'EXPENSE' | 'INCOME',
        amount: '',
        accountId: '',
        category: '',
        subcategory: '',
        isInstallment: false,
        installmentsCount: 2,
        isRecurring: false,
        recurrencePeriod: 'monthly' as 'weekly' | 'monthly' | 'yearly' | 'biweekly' | 'custom',
        recurrenceDaysInterval: 30,
        ownerName: '',
        destinationAccountId: '',
        files: [] as File[]
    }, initialForm));
    const [isCreatingCategory, setIsCreatingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [isSavingCategory, setIsSavingCategory] = useState(false);
    const [recentTxs, setRecentTxs] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isDividing, setIsDividing] = useState(false);
    const [splitDrafts, setSplitDrafts] = useState<SplitDraft[] | null>(null);

    const formAmount = form?.amount || '';
    const parsedAmount = Number(formAmount.replace(/\./g, '').replace(',', '.'));
    const isAmountInvalid = !formAmount.trim() || isNaN(parsedAmount) || parsedAmount === 0;
    const canDivide = !form.isInstallment && !form.isRecurring;
    const isSplitInvalid = isDividing && !splitDrafts;

    // Buscar as transações recentes quando o modal for aberto
    useEffect(() => {
        if (show) {
            const loadRecentTransactions = async () => {
                let cachedData: any[] = [];
                try {
                    // Fallback imediato para cache do localStorage (funciona offline e dá velocidade instantânea)
                    if (supabase) {
                        const user = await getSessionUser(supabase);
                        if (user) {
                            const localRaw = localStorage.getItem(`finvision_cached_raw_txs_${user.id}`);
                            if (localRaw) {
                                cachedData = JSON.parse(localRaw);
                            }
                        }
                    }
                } catch (err) {
                    console.warn('Erro ao ler cache local de transações:', err);
                }

                // Processar e agrupar transações do cache local para exibir sugestões imediatamente
                const uniqueTxsMap = new Map<string, any>();
                for (const tx of cachedData) {
                    if (tx.description) {
                        const key = tx.description.toLowerCase().trim();
                        if (!uniqueTxsMap.has(key)) {
                            uniqueTxsMap.set(key, {
                                description: tx.description,
                                category: tx.category,
                                subcategory: tx.subcategory,
                                account_id: tx.account_id || tx.accountId,
                                owner_name: tx.owner_name || tx.ownerName,
                                type: tx.type
                            });
                        }
                    }
                }
                if (uniqueTxsMap.size > 0) {
                    setRecentTxs(Array.from(uniqueTxsMap.values()));
                }

                if (supabase && navigator.onLine) {
                    try {
                        const user = await getSessionUser(supabase);
                        if (!user) return;

                        const { data, error } = await supabase
                            .from('transactions')
                            .select('description, category, subcategory, account_id, owner_name, type')
                            .eq('user_id', user.id)
                            .eq('is_deleted', false)
                            .order('date', { ascending: false })
                            .limit(200);

                        if (error) throw error;

                        if (data && data.length > 0) {
                            for (const tx of data) {
                                if (tx.description) {
                                    const key = tx.description.toLowerCase().trim();
                                    if (!uniqueTxsMap.has(key)) {
                                        uniqueTxsMap.set(key, tx);
                                    }
                                }
                            }
                            setRecentTxs(Array.from(uniqueTxsMap.values()));
                        }
                    } catch (e) {
                        console.error('Erro ao carregar transações recentes do Supabase:', e);
                    }
                }
            };
            loadRecentTransactions();
        }
    }, [show]);

    // Sync local state when initialForm changes (e.g. when modal opens)
    useEffect(() => {
        if (show) {
            setForm(Object.assign({
                date: '',
                description: '',
                type: 'EXPENSE' as 'EXPENSE' | 'INCOME',
                amount: '',
                accountId: '',
                category: '',
                subcategory: '',
                isInstallment: false,
                installmentsCount: 2,
                isRecurring: false,
                recurrencePeriod: 'monthly' as 'weekly' | 'monthly' | 'yearly' | 'biweekly' | 'custom',
                recurrenceDaysInterval: 30,
                ownerName: '',
                destinationAccountId: '',
                files: [] as File[]
            }, initialForm));
        }
    }, [show, initialForm]);

    const { subscription } = useSubscription();
    const isTrialExpired = subscription?.status === 'trialing' && subscription.trial_ends_at && new Date(subscription.trial_ends_at) < new Date();
    const isDowngraded = subscription?.status === 'past_due' || subscription?.status === 'canceled' || isTrialExpired;
    const activeAccountId = subscription?.metadata?.active_account_id;

    useEffect(() => {
        if (show && isDowngraded && activeAccountId) {
            setForm(prev => ({ ...prev, accountId: activeAccountId }));
        }
    }, [show, isDowngraded, activeAccountId]);

    if (!show || !form.date) return null;

    const setAddField = (field: string, value: any) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const filteredCategories = categoryObjects.filter(
        (c: any) => !c.type || c.type === form.type
    );

    const query = (form.description || '').toLowerCase().trim();
    const suggestions = query.length >= 2
        ? recentTxs.filter(tx => (tx.description || '').toLowerCase().includes(query)).slice(0, 5)
        : [];

    const handleCreateCategorySubmit = async () => {
        if (!newCategoryName.trim()) return;
        setIsSavingCategory(true);
        try {
            await onCreateCategory(newCategoryName.trim(), form.type);
            setAddField('category', newCategoryName.trim());
            setIsCreatingCategory(false);
            setNewCategoryName('');
        } finally {
            setIsSavingCategory(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-brand-900/60 backdrop-blur-sm" onClick={() => !isSubmitting && onClose()}></div>

            <div className="bg-white rounded-t-[32px] sm:rounded-[40px] w-full max-w-lg shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom sm:zoom-in duration-300">
                <div className="p-8 lg:p-10">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Novo Lançamento</h2>
                        <button
                            onClick={() => !isSubmitting && onClose()}
                            disabled={isSubmitting}
                            className="p-3 text-slate-400 hover:bg-slate-100 rounded-2xl transition-all disabled:opacity-50"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-2 custom-scrollbar">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data</label>
                                <input
                                    type="date"
                                    value={form.date}
                                    onChange={(e) => setAddField('date', e.target.value)}
                                    className="w-full h-14 px-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo</label>
                                <select
                                    value={form.type}
                                    onChange={(e) => {
                                        const newType = e.target.value as 'INCOME' | 'EXPENSE';
                                        setAddField('type', newType);
                                        if (newType === 'EXPENSE' && !form.amount.startsWith('-') && form.amount.trim() !== '') {
                                            setAddField('amount', '-' + form.amount);
                                        } else if (newType === 'INCOME' && form.amount.startsWith('-')) {
                                            setAddField('amount', form.amount.replace('-', ''));
                                        }
                                    }}
                                    className="w-full h-14 px-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all appearance-none cursor-pointer"
                                >
                                    <option value="EXPENSE">Saída (Despesa)</option>
                                    <option value="INCOME">Entrada (Receita)</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2 relative">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição</label>
                            <input
                                type="text"
                                value={form.description}
                                onFocus={() => setShowSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                onChange={(e) => setAddField('description', e.target.value)}
                                placeholder="Ex: Fornecedor, Cliente, Parceiro..."
                                className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300"
                            />
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="absolute z-[110] left-0 right-0 top-[88px] bg-white border border-slate-200/80 shadow-2xl rounded-2xl p-2 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200 custom-scrollbar">
                                    {suggestions.map((tx, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => {
                                                setForm(prev => ({
                                                    ...prev,
                                                    description: tx.description,
                                                    category: tx.category || prev.category,
                                                    subcategory: tx.subcategory || prev.subcategory,
                                                    accountId: tx.account_id || prev.accountId,
                                                    ownerName: tx.owner_name || prev.ownerName,
                                                    type: tx.type || prev.type
                                                }));
                                                setShowSuggestions(false);
                                            }}
                                            className="w-full flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-all text-left border-none outline-none"
                                        >
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-800 text-xs sm:text-sm">{tx.description}</span>
                                                <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">Histórico Recente</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {tx.category && (
                                                    <span className="text-[9px] bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                                                        {tx.category}
                                                    </span>
                                                )}
                                                {tx.owner_name && (
                                                    <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                                                        {tx.owner_name}
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor (R$)</label>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const newType = form.type === 'EXPENSE' ? 'INCOME' : 'EXPENSE';
                                            setAddField('type', newType);
                                            if (newType === 'EXPENSE' && !form.amount.startsWith('-') && form.amount.trim() !== '') {
                                                setAddField('amount', '-' + form.amount);
                                            } else if (newType === 'INCOME' && form.amount.startsWith('-')) {
                                                setAddField('amount', form.amount.replace('-', ''));
                                            }
                                        }}
                                        className={`w-14 h-14 flex items-center justify-center rounded-2xl text-lg font-black transition-all ${
                                            form.type === 'EXPENSE'
                                                ? 'bg-rose-50 text-rose-600 border border-rose-200 shadow-sm'
                                                : 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm'
                                        }`}
                                        title="Alternar Entrada/Saída"
                                    >
                                        {form.type === 'EXPENSE' ? '-' : '+'}
                                    </button>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={form.amount}
                                        onChange={(e) => {
                                            let val = e.target.value;
                                            // Allow only digits, comma, period, and hyphen/minus
                                            val = val.replace(/[^0-9,\.\-]/g, '');
                                            // If there's a minus sign, make sure it is at the start and only one exists
                                            if (val.includes('-')) {
                                                val = '-' + val.replace(/\-/g, '');
                                            }
                                            setAddField('amount', val);

                                            // Auto-toggle type
                                            if (val.startsWith('-')) {
                                                setAddField('type', 'EXPENSE');
                                            } else if (val.trim() !== '' && !val.startsWith('-')) {
                                                if (form.amount.startsWith('-')) {
                                                    setAddField('type', 'INCOME');
                                                }
                                            }
                                        }}
                                        placeholder="0,00"
                                        className="flex-1 h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300"
                                    />
                                </div>
                                {isAmountInvalid && (
                                    <p className="text-[10px] text-rose-500 font-bold mt-1 ml-1 flex items-center gap-1">
                                        <AlertCircle size={10} /> {form.amount.trim() === '' ? 'Por favor, insira o valor da transação.' : 'O valor não pode ser zero ou inválido.'}
                                    </p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Conta Bancária</label>
                                <select
                                    value={form.accountId}
                                    onChange={(e) => setAddField('accountId', e.target.value)}
                                    className="w-full h-14 px-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all appearance-none cursor-pointer"
                                >
                                    <option value="">Selecione...</option>
                                    {accounts.map((acc: any) => {
                                        const disabled = isDowngraded && activeAccountId && acc.id !== activeAccountId;
                                        return (
                                            <option key={acc.id} value={acc.id} disabled={disabled}>
                                                {acc.institution || acc.name} {disabled ? ' (Bloqueada - Plano Gratuito)' : ''}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            {((form.category?.toLowerCase() || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer') || (form.description?.toLowerCase() || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer')) && (
                                <div className="space-y-2 col-span-2 animate-in slide-in-from-top-2 duration-300">
                                    <label className="text-[10px] font-black text-brand-600 uppercase tracking-widest ml-1">Conta de Destino (Para onde foi o dinheiro?)</label>
                                    <select
                                        value={form.destinationAccountId || ''}
                                        onChange={(e) => setAddField('destinationAccountId', e.target.value)}
                                        className="w-full h-14 px-4 bg-brand-50 border border-brand-200 rounded-2xl font-bold text-brand-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="">Selecione a conta destino...</option>
                                        {accounts.filter((acc: any) => acc.id !== form.accountId).map((acc: any) => (
                                            <option key={acc.id} value={acc.id}>{acc.institution}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pessoa ou Empresa</label>
                            <input
                                list="owners-list"
                                value={form.ownerName}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setAddField('ownerName', e.target.value)}
                                placeholder="Selecione ou digite..."
                                className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300"
                            />
                            <datalist id="owners-list">
                                {owners.sort((a, b) => a.localeCompare(b)).map((o: any) => (
                                    <option key={o} value={o} />
                                ))}
                            </datalist>
                        </div>

                        {canDivide && (
                            <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                    <SplitSquareHorizontal size={14} className="text-violet-500" />
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Dividir em várias categorias</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setIsDividing(v => !v); setIsCreatingCategory(false); }}
                                    className={`w-11 h-6 rounded-full p-1 transition-all flex items-center ${isDividing ? 'bg-violet-600' : 'bg-slate-200'}`}
                                >
                                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-all transform ${isDividing ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>
                        )}

                        {isDividing ? (
                            <SplitFieldsInline
                                totalAbs={isNaN(parsedAmount) ? 0 : Math.abs(parsedAmount)}
                                categoryObjects={categoryObjects}
                                subcategories={subcategories}
                                onChange={setSplitDrafts}
                            />
                        ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className={`${isCreatingCategory ? 'col-span-1 sm:col-span-2' : ''} space-y-2 transition-all duration-300`}>
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Categoria</label>
                                    {!isCreatingCategory && (
                                        <button
                                            type="button"
                                            onClick={() => setIsCreatingCategory(true)}
                                            className="text-[10px] font-bold text-brand-600 hover:text-brand-700 uppercase tracking-widest"
                                        >
                                            + Nova
                                        </button>
                                    )}
                                </div>

                                {isCreatingCategory ? (
                                    <div className="flex items-center gap-2 animate-in slide-in-from-top-1 duration-300">
                                        <input
                                            type="text"
                                            autoFocus
                                            value={newCategoryName}
                                            onChange={(e) => setNewCategoryName(e.target.value)}
                                            placeholder={`Nova ${form.type === 'INCOME' ? 'receita' : 'despesa'}...`}
                                            className="flex-1 h-14 px-4 bg-brand-50 border border-brand-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all text-xs"
                                            onKeyDown={(e) => e.key === 'Enter' && handleCreateCategorySubmit()}
                                        />
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={handleCreateCategorySubmit}
                                                disabled={isSavingCategory}
                                                className="h-14 w-14 bg-brand-600 text-white rounded-2xl flex items-center justify-center hover:bg-brand-700 transition-all disabled:opacity-50 shadow-lg shadow-brand-500/20"
                                            >
                                                {isSavingCategory ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsCreatingCategory(false)}
                                                disabled={isSavingCategory}
                                                className="h-14 w-14 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center hover:bg-slate-200 transition-all disabled:opacity-50"
                                            >
                                                <X size={20} />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <input
                                            list="add-categories-list"
                                            value={form.category}
                                            onFocus={(e) => e.target.select()}
                                            onChange={(e) => setAddField('category', e.target.value)}
                                            placeholder="Selecione..."
                                            className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300"
                                        />
                                        <datalist id="add-categories-list">
                                            {filteredCategories.sort((a, b) => a.name.localeCompare(b.name)).map((c: any) => (
                                                <option key={c.name} value={c.name} />
                                            ))}
                                        </datalist>
                                    </div>
                                )}
                            </div>

                            {!isCreatingCategory && (
                                <div className="space-y-2 animate-in fade-in duration-300">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Subcategoria (Opcional)</label>
                                    <div className="relative">
                                        <input
                                            list="add-subcategories-list"
                                            value={form.subcategory}
                                            onFocus={(e) => e.target.select()}
                                            onChange={(e) => setAddField('subcategory', e.target.value)}
                                            placeholder="Selecione..."
                                            className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300"
                                        />
                                        <datalist id="add-subcategories-list">
                                            {subcategories.filter(s => s.category_name === form.category).sort((a, b) => a.name.localeCompare(b.name)).map(s => (
                                                <option key={s.id} value={s.name} />
                                            ))}
                                        </datalist>
                                    </div>
                                </div>
                            )}
                        </div>
                        )}

                        {/* Observações (some quando dividido - cada pedaço tem a sua) e Tags */}
                        <div className={`grid grid-cols-1 ${isDividing ? '' : 'sm:grid-cols-2'} gap-4`}>
                            {!isDividing && (
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Observações</label>
                                <textarea
                                    value={form.notes || ''}
                                    onChange={(e) => setAddField('notes', e.target.value)}
                                    placeholder="Detalhes sobre a transação..."
                                    rows={2}
                                    className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300 resize-none text-xs"
                                />
                            </div>
                            )}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tags (Separadas por vírgula)</label>
                                <TagsInput
                                    value={form.tags}
                                    onChange={(arr) => setAddField('tags', arr)}
                                    suggestions={availableTags}
                                    className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300 text-xs"
                                />
                            </div>
                        </div>

                        {/* SERIES OPTIONS */}
                        <div className="p-4 bg-slate-50 rounded-2xl space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Opções de Série</span>
                            </div>

                            {/* JÁ ESTÁ PAGO */}
                            <button
                                type="button"
                                onClick={() => setAddField('isPaidNow', !form.isPaidNow)}
                                className={`w-full h-12 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border flex items-center justify-between px-4 ${form.isPaidNow ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-500/20' : 'bg-white text-slate-400 border-slate-200'}`}
                            >
                                <span>Já está pago / Quitado</span>
                                <div className={`w-10 h-6 rounded-full p-1 transition-all flex items-center ${form.isPaidNow ? 'bg-white/30' : 'bg-slate-200'}`}>
                                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-all transform ${form.isPaidNow ? 'translate-x-4' : ''}`} />
                                </div>
                            </button>

                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => {
                                        setAddField('isInstallment', !form.isInstallment);
                                        if (!form.isInstallment) { setAddField('isRecurring', false); setIsDividing(false); }
                                    }}
                                    className={`h-12 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${form.isInstallment ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-400 border-slate-200'}`}
                                >
                                    Parcelado
                                </button>
                                <button
                                    onClick={() => {
                                        setAddField('isRecurring', !form.isRecurring);
                                        if (!form.isRecurring) { setAddField('isInstallment', false); setIsDividing(false); }
                                    }}
                                    className={`h-12 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${form.isRecurring ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-400 border-slate-200'}`}
                                >
                                    Fixo / Recorrente
                                </button>
                            </div>

                            {form.isInstallment && (
                                <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                                    <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">Número de Parcelas</label>
                                    <input
                                        type="number"
                                        min="2"
                                        value={form.installmentsCount}
                                        onChange={(e) => setAddField('installmentsCount', Number(e.target.value))}
                                        className="w-full h-12 px-4 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 outline-none"
                                    />
                                </div>
                            )}

                            {form.isRecurring && (
                                <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">Frequência</label>
                                        <select
                                            value={form.recurrencePeriod}
                                            onChange={(e) => setAddField('recurrencePeriod', e.target.value)}
                                            className="w-full h-12 px-4 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 outline-none"
                                        >
                                            <option value="weekly">Semanal</option>
                                            <option value="biweekly">Quinzenal</option>
                                            <option value="monthly">Mensal</option>
                                            <option value="yearly">Anual</option>
                                            <option value="custom">Personalizado (Dias)</option>
                                        </select>
                                    </div>

                                    {form.recurrencePeriod === 'custom' && (
                                        <div className="animate-in slide-in-from-top-1 duration-200">
                                            <label className="text-[8px] font-black text-slate-400 uppercase mb-1 block">A cada X dias</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={form.recurrenceDaysInterval}
                                                onChange={(e) => setAddField('recurrenceDaysInterval', Number(e.target.value))}
                                                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 outline-none"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Anexos ({form.files?.length || 0})</label>
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                                <div className="space-y-2">
                                    {form.files && form.files.length > 0 ? (
                                        form.files.map((f, idx) => (
                                            <div key={idx} className="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-slate-100 shadow-sm animate-in slide-in-from-left-2 transition-all">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                                                    <span className="text-xs font-bold text-slate-700 truncate">{f.name}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const newFiles = [...(form.files || [])];
                                                        newFiles.splice(idx, 1);
                                                        setAddField('files', newFiles);
                                                    }}
                                                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-2 text-center">
                                            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Nenhum arquivo selecionado</span>
                                        </div>
                                    )}
                                </div>

                                <input
                                    type="file"
                                    id="add-transaction-file"
                                    className="hidden"
                                    multiple
                                    onChange={(e) => {
                                        const newFiles = Array.from(e.target.files || []);
                                        setAddField('files', [...(form.files || []), ...newFiles]);
                                        // Reset input so same file can be selected again if removed
                                        e.target.value = '';
                                    }}
                                    accept="image/*,application/pdf"
                                />
                                <input
                                    type="file"
                                    id="add-transaction-camera"
                                    className="hidden"
                                    capture="environment"
                                    accept="image/*"
                                    onChange={(e) => {
                                        const newFiles = Array.from(e.target.files || []);
                                        setAddField('files', [...(form.files || []), ...newFiles]);
                                        e.target.value = '';
                                    }}
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => document.getElementById('add-transaction-file')?.click()}
                                        className="py-3 bg-white border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-brand-500 hover:text-brand-600 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Plus size={14} /> Arquivos
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => document.getElementById('add-transaction-camera')?.click()}
                                        className="py-3 bg-brand-50 border border-brand-100 text-brand-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-100 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Camera size={14} /> Tirar Foto
                                    </button>
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 animate-in shake duration-300">
                                <AlertCircle size={20} />
                                <p className="text-xs font-bold">{error}</p>
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-4 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSubmitting}
                                className="w-full h-14 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all uppercase text-xs tracking-widest active:scale-95 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => !isAmountInvalid && !isSplitInvalid && onSubmit({ ...form, splits: isDividing ? splitDrafts : null })}
                                disabled={isSubmitting || isAmountInvalid || isSplitInvalid}
                                className="w-full h-14 bg-brand-600 text-white font-black rounded-2xl hover:bg-brand-700 shadow-xl shadow-brand-500/30 transition-all active:scale-95 uppercase text-xs tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:bg-slate-300 disabled:shadow-none"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                                Criar Transação
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
