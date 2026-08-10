import React, { useState } from 'react';
import { X, CheckCircle2, Camera, Loader2, Plus, SplitSquareHorizontal } from 'lucide-react';
import { SplitFieldsInline } from '../history/SplitFieldsInline';
import { SplitDraft } from '../../services/splitTransaction.service';

interface ManualTransactionModalProps {
    show: boolean;
    onClose: () => void;
    onSubmit: () => void;
    isSaving?: boolean;
    isAnyModalBusy: boolean;
    cards: any[];
    categories: { id: string; name: string }[];
    txCardId: string;
    setTxCardId: (v: string) => void;
    txDate: string;
    setTxDate: (v: string) => void;
    txAmount: number | string;
    setTxAmount: (v: number | string) => void;
    txDescription: string;
    setTxDescription: (v: string) => void;
    txCategory: string;
    setTxCategory: (v: string) => void;
    txSubcategory: string;
    setTxSubcategory: (v: string) => void;
    subcategories: { id: string, name: string, category_name?: string }[];
    recentTxs?: { description: string; category_id?: string; category?: string; subcategory?: string; owner_name?: string }[];
    onCreateCategory?: (name: string) => Promise<any>;

    // --- NEW: RECURRENCE & INSTALLMENTS ---
    isInstallment?: boolean;
    setIsInstallment?: (v: boolean) => void;
    installmentsCount?: number | string;
    setInstallmentsCount?: (v: number | string) => void;
    isRecurring?: boolean;
    setIsRecurring?: (v: boolean) => void;
    recurrencePeriod?: 'weekly' | 'monthly' | 'yearly' | 'biweekly' | 'custom';
    setRecurrencePeriod?: (v: 'weekly' | 'monthly' | 'yearly' | 'biweekly' | 'custom') => void;
    recurrenceDaysInterval?: number;
    setRecurrenceDaysInterval?: (v: number) => void;
    txFiles?: File[];
    setTxFiles?: (v: File[]) => void;
    txNotes: string;
    setTxNotes: (v: string) => void;
    txTags: string[];
    setTxTags: (v: string[]) => void;
    txIsDividing: boolean;
    setTxIsDividing: (v: boolean) => void;
    txSplits: SplitDraft[] | null;
    setTxSplits: (v: SplitDraft[] | null) => void;
}

export const ManualTransactionModal: React.FC<ManualTransactionModalProps> = ({
    show,
    onClose,
    onSubmit,
    isSaving = false,
    isAnyModalBusy,
    cards,
    categories,
    txCardId,
    setTxCardId,
    txDate,
    setTxDate,
    txAmount,
    setTxAmount,
    txDescription,
    setTxDescription,
    txCategory,
    setTxCategory,
    txSubcategory,
    setTxSubcategory,
    subcategories,
    recentTxs = [],
    onCreateCategory,
    isInstallment = false,
    setIsInstallment,
    installmentsCount = 1,
    setInstallmentsCount,
    isRecurring = false,
    setIsRecurring,
    recurrencePeriod = 'monthly',
    setRecurrencePeriod,
    recurrenceDaysInterval = 1,
    setRecurrenceDaysInterval,
    txFiles = [],
    setTxFiles,
    txNotes,
    setTxNotes,
    txTags,
    setTxTags,
    txIsDividing,
    setTxIsDividing,
    txSplits,
    setTxSplits
}) => {
    const [isCreatingCategory, setIsCreatingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [isSavingCategory, setIsSavingCategory] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const canDivide = !isInstallment && !isRecurring;
    const txAmountAbs = Math.abs(typeof txAmount === 'number' ? txAmount : (parseFloat(String(txAmount || '0').replace(',', '.')) || 0));

    const descQuery = (txDescription || '').toLowerCase().trim();
    const suggestions = descQuery.length >= 2
        ? recentTxs.filter(t => (t.description || '').toLowerCase().includes(descQuery)).slice(0, 5)
        : [];

    const applySuggestion = (s: { description: string; category_id?: string; category?: string; subcategory?: string }) => {
        setTxDescription(s.description);
        // O campo de categoria usa o NOME (datalist), não o id
        if (s.category) {
            setTxCategory(s.category);
        } else if (s.category_id) {
            const catMatch = categories.find(c => c.id === s.category_id);
            if (catMatch) setTxCategory(catMatch.name);
        }
        if (s.subcategory) setTxSubcategory(s.subcategory);
        setShowSuggestions(false);
    };

    const handleCreateCategorySubmit = async () => {
        if (!newCategoryName.trim() || !onCreateCategory) return;
        setIsSavingCategory(true);
        try {
            await onCreateCategory(newCategoryName.trim());
            setTxCategory(newCategoryName.trim());
            setIsCreatingCategory(false);
            setNewCategoryName('');
        } catch (e) {
            console.error("Erro ao criar categoria inline:", e);
        } finally {
            setIsSavingCategory(false);
        }
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div
                className="absolute inset-0 bg-brand-900/60 backdrop-blur-sm"
                onClick={() => !isAnyModalBusy && onClose()}
            ></div>

            <div className="bg-white rounded-t-[32px] sm:rounded-[40px] w-full max-w-lg shadow-2xl relative animate-in slide-in-from-bottom sm:zoom-in duration-300 max-h-[92vh] flex flex-col">
                <div className="p-8 lg:p-10">
                    <div className="flex items-center justify-between mb-8 sticky top-0 bg-white z-10">
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Novo Gasto</h2>
                        <button
                            onClick={() => !isAnyModalBusy && onClose()}
                            disabled={isAnyModalBusy}
                            className="p-3 text-slate-400 hover:bg-slate-100 rounded-2xl transition-all disabled:opacity-50"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    <div className="overflow-y-auto pr-2 -mr-2 space-y-6 flex-1 custom-scrollbar" style={{ maxHeight: 'calc(92vh - 120px)' }}>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Cartão de Destino</label>
                            <select
                                value={txCardId}
                                onChange={(e) => setTxCardId(e.target.value)}
                                className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all appearance-none cursor-pointer"
                            >
                                <option value="">Selecione um cartão...</option>
                                {cards.filter((c) => !c.is_archived).map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name} (**** {c.last4}){c.is_additional ? `  • Adicional${c.additional_label ? ': ' + c.additional_label : ''}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Data da Compra</label>
                                <input
                                    type="date"
                                    value={txDate}
                                    onChange={(e) => setTxDate(e.target.value)}
                                    className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Valor do Gasto</label>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    value={txAmount}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setTxAmount(val === '' ? '' : val); // Permite limpar o campo (zero problem)
                                    }}
                                    placeholder="0,00"
                                    className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300"
                                />
                            </div>
                        </div>

                        <div className="relative">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Descrição</label>
                            <input
                                type="text"
                                value={txDescription}
                                onFocus={() => setShowSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                onChange={(e) => { setTxDescription(e.target.value); setShowSuggestions(true); }}
                                placeholder="Ex: Uber / Mercado / Amazon..."
                                className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300"
                            />
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="absolute z-[110] left-0 right-0 top-[80px] bg-white border border-slate-200/80 shadow-2xl rounded-2xl p-2 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-200">
                                    {suggestions.map((s, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => applySuggestion(s)}
                                            className="w-full flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-all text-left border-none outline-none"
                                        >
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-800 text-xs sm:text-sm">{s.description}</span>
                                                <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">Histórico Recente</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {s.category && (
                                                    <span className="text-[9px] bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                                                        {s.category}
                                                    </span>
                                                )}
                                                {s.subcategory && (
                                                    <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                                                        {s.subcategory}
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* TIPO DE LANÇAMENTO */}
                        <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 space-y-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Repetição</label>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setIsInstallment?.(false); setIsRecurring?.(false); }}
                                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${(!isInstallment && !isRecurring) ? 'bg-white text-brand-600 shadow-sm border border-slate-100' : 'text-slate-400'}`}
                                >
                                    Único
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setIsInstallment?.(true); setIsRecurring?.(false); setTxIsDividing(false); }}
                                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${isInstallment ? 'bg-white text-brand-600 shadow-sm border border-slate-100' : 'text-slate-400'}`}
                                >
                                    Parcelado
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setIsInstallment?.(false); setIsRecurring?.(true); setTxIsDividing(false); }}
                                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${isRecurring ? 'bg-white text-brand-600 shadow-sm border border-slate-100' : 'text-slate-400'}`}
                                >
                                    Recorrente
                                </button>
                            </div>

                            {isInstallment && (
                                <div className="pt-2 animate-in slide-in-from-top-2 duration-300">
                                    <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">Número de Parcelas</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min="2"
                                        value={installmentsCount}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setInstallmentsCount?.(val === '' ? '' : Number(val));
                                        }}
                                        className="w-full h-12 px-4 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 outline-none"
                                    />
                                    <p className="text-[8px] text-slate-400 mt-2 italic font-medium">
                                        * O valor acima será o TOTAL para cartões ou por PARCELA para bancos.
                                    </p>
                                </div>
                            )}

                            {isRecurring && (
                                <div className="pt-2 animate-in slide-in-from-top-2 duration-300">
                                    <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">Frequência</label>
                                    <select
                                        value={recurrencePeriod}
                                        onChange={(e) => setRecurrencePeriod?.(e.target.value as any)}
                                        className="w-full h-12 px-4 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 outline-none"
                                    >
                                        <option value="weekly">Semanal</option>
                                        <option value="biweekly">Quinzenal</option>
                                        <option value="monthly">Mensal</option>
                                        <option value="yearly">Anual</option>
                                        <option value="custom">Personalizado (Dias)</option>
                                    </select>
                                    {recurrencePeriod === 'custom' && (
                                        <div className="mt-2 animate-in slide-in-from-top-1 duration-200">
                                            <label className="text-[8px] font-black text-slate-400 uppercase mb-1 block">A cada X dias</label>
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                min="1"
                                                value={recurrenceDaysInterval}
                                                onChange={(e) => setRecurrenceDaysInterval?.(Number(e.target.value))}
                                                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 outline-none"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {canDivide && (
                            <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                    <SplitSquareHorizontal size={14} className="text-violet-500" />
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Dividir em várias categorias</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setTxIsDividing(!txIsDividing); setIsCreatingCategory(false); }}
                                    className={`w-11 h-6 rounded-full p-1 transition-all flex items-center ${txIsDividing ? 'bg-violet-600' : 'bg-slate-200'}`}
                                >
                                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-all transform ${txIsDividing ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>
                        )}

                        {txIsDividing ? (
                            <SplitFieldsInline
                                totalAbs={txAmountAbs}
                                categoryObjects={categories.map(c => ({ name: c.name }))}
                                subcategories={subcategories}
                                onChange={setTxSplits}
                            />
                        ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className={`${isCreatingCategory ? 'col-span-1 sm:col-span-2' : ''} space-y-2 transition-all duration-300`}>
                                <div className="flex items-center justify-between animate-in fade-in duration-300">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Categoria (Opcional)</label>
                                    {!isCreatingCategory && onCreateCategory && (
                                        <button
                                            type="button"
                                            onClick={() => setIsCreatingCategory(true)}
                                            className="text-[10px] font-bold text-brand-600 hover:text-brand-700 uppercase tracking-widest block mr-1"
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
                                            placeholder="Nova categoria..."
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
                                            list="card-categories-list"
                                            value={txCategory}
                                            onFocus={(e) => e.target.select()}
                                            onChange={(e) => setTxCategory(e.target.value)}
                                            placeholder="Selecione ou digite..."
                                            className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300"
                                        />
                                        <datalist id="card-categories-list">
                                            {categories.sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                                                <option key={c.id} value={c.name} />
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
                                            list="card-subcategories-list"
                                            value={txSubcategory}
                                            onFocus={(e) => e.target.select()}
                                            onChange={(e) => setTxSubcategory(e.target.value)}
                                            placeholder="Selecione ou digite..."
                                            className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300"
                                        />
                                        <datalist id="card-subcategories-list">
                                            {subcategories
                                                .filter(s => !txCategory || s.category_name === txCategory)
                                                .sort((a, b) => a.name.localeCompare(b.name))
                                                .map(s => (
                                                    <option key={s.id} value={s.name} />
                                                ))
                                            }
                                        </datalist>
                                    </div>
                                </div>
                            )}
                        </div>
                        )}

                        {/* Observações (some quando dividido - cada pedaço tem a sua) e Tags */}
                        <div className={`grid grid-cols-1 ${txIsDividing ? '' : 'sm:grid-cols-2'} gap-4`}>
                            {!txIsDividing && (
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Observações</label>
                                <textarea
                                    value={txNotes}
                                    onChange={(e) => setTxNotes(e.target.value)}
                                    placeholder="Detalhes sobre a transação..."
                                    rows={2}
                                    className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300 resize-none text-xs"
                                />
                            </div>
                            )}
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Tags (Separadas por vírgula)</label>
                                <input
                                    type="text"
                                    value={txTags?.join(', ') || ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        const arr = val.split(',').map(s => s.trim()).filter(s => s !== '');
                                        setTxTags(arr);
                                    }}
                                    placeholder="Ex: viagem, lazer, 2026"
                                    className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300 text-xs"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Anexos ({txFiles?.length || 0})</label>
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                                <div className="space-y-2">
                                    {txFiles && txFiles.length > 0 ? (
                                        txFiles.map((f, idx) => (
                                            <div key={idx} className="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-slate-100 shadow-sm animate-in slide-in-from-left-2 transition-all">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                                                    <span className="text-xs font-bold text-slate-700 truncate">{f.name}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const newFiles = [...(txFiles || [])];
                                                        newFiles.splice(idx, 1);
                                                        setTxFiles?.(newFiles);
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
                                    id="manual-tx-file"
                                    className="hidden"
                                    multiple
                                    onChange={(e) => {
                                        const newFiles = Array.from(e.target.files || []);
                                        setTxFiles?.([...(txFiles || []), ...newFiles]);
                                        e.target.value = '';
                                    }}
                                    accept="image/*,application/pdf"
                                />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => document.getElementById('manual-tx-file')?.click()}
                                            className="flex-1 py-3 bg-white border-2 border-dashed border-slate-200 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-brand-500 hover:text-brand-600 transition-all flex items-center justify-center gap-2 shadow-sm"
                                        >
                                            Arquivos
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const input = document.getElementById('manual-tx-file') as HTMLInputElement;
                                                if (input) {
                                                    input.setAttribute('capture', 'environment');
                                                    input.click();
                                                    // Reset after a delay so normal clicks don't always trigger camera
                                                    setTimeout(() => input.removeAttribute('capture'), 500);
                                                }
                                            }}
                                            className="flex-1 py-3 bg-brand-50 text-brand-600 border-2 border-dashed border-brand-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-100 transition-all flex items-center justify-center gap-2 shadow-sm"
                                        >
                                            <Camera size={14} /> Tirar Foto
                                        </button>
                                    </div>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isAnyModalBusy || isSaving}
                                className="w-full h-14 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all uppercase text-xs tracking-widest active:scale-95 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={onSubmit}
                                disabled={isSaving || (txIsDividing && !txSplits)}
                                className="w-full h-14 bg-brand-600 text-white font-black rounded-2xl hover:bg-brand-700 shadow-xl shadow-brand-500/30 transition-all active:scale-95 uppercase text-xs tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 size={20} className="animate-spin" />
                                        Processando...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 size={20} />
                                        Lançar Gasto
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
