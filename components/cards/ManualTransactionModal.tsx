import React from 'react';
import { X, CheckCircle2, Camera } from 'lucide-react';

interface ManualTransactionModalProps {
    show: boolean;
    onClose: () => void;
    onSubmit: () => void;
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
    txCategoryId: string;
    setTxCategoryId: (v: string) => void;
    txSubcategory: string;
    setTxSubcategory: (v: string) => void;
    subcategories: { id: string, name: string, category_name?: string }[];

    // --- NEW: RECURRENCE & INSTALLMENTS ---
    isInstallment?: boolean;
    setIsInstallment?: (v: boolean) => void;
    installmentsCount?: number;
    setInstallmentsCount?: (v: number) => void;
    isRecurring?: boolean;
    setIsRecurring?: (v: boolean) => void;
    recurrencePeriod?: 'weekly' | 'monthly' | 'yearly' | 'biweekly' | 'custom';
    setRecurrencePeriod?: (v: 'weekly' | 'monthly' | 'yearly' | 'biweekly' | 'custom') => void;
    recurrenceDaysInterval?: number;
    setRecurrenceDaysInterval?: (v: number) => void;
    txFiles?: File[];
    setTxFiles?: (v: File[]) => void;
}

export const ManualTransactionModal: React.FC<ManualTransactionModalProps> = ({
    show,
    onClose,
    onSubmit,
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
    txCategoryId,
    setTxCategoryId,
    txSubcategory,
    setTxSubcategory,
    subcategories,
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
    setTxFiles
}) => {
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
                                        {c.name} (**** {c.last4})
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

                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Descrição</label>
                            <input
                                type="text"
                                value={txDescription}
                                onChange={(e) => setTxDescription(e.target.value)}
                                placeholder="Ex: Uber / Mercado / Amazon..."
                                className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300"
                            />
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
                                    onClick={() => { setIsInstallment?.(true); setIsRecurring?.(false); }}
                                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${isInstallment ? 'bg-white text-brand-600 shadow-sm border border-slate-100' : 'text-slate-400'}`}
                                >
                                    Parcelado
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setIsInstallment?.(false); setIsRecurring?.(true); }}
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
                                        min="2"
                                        value={installmentsCount}
                                        onChange={(e) => setInstallmentsCount?.(Number(e.target.value))}
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

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Categoria (Opcional)</label>
                                <select
                                    value={txCategoryId}
                                    onChange={(e) => setTxCategoryId(e.target.value)}
                                    className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all appearance-none cursor-pointer"
                                >
                                    <option value="">Sem categoria</option>
                                    {categories.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Subcategoria (Opcional)</label>
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
                                            .filter(s => {
                                                const cat = categories.find(c => c.id === txCategoryId);
                                                return !txCategoryId || s.category_name === cat?.name;
                                            })
                                            .sort((a, b) => a.name.localeCompare(b.name))
                                            .map(s => (
                                                <option key={s.id} value={s.name} />
                                            ))
                                        }
                                    </datalist>
                                </div>
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
                                disabled={isAnyModalBusy}
                                className="w-full h-14 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all uppercase text-xs tracking-widest active:scale-95 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={onSubmit}
                                className="w-full h-14 bg-brand-600 text-white font-black rounded-2xl hover:bg-brand-700 shadow-xl shadow-brand-500/30 transition-all active:scale-95 uppercase text-xs tracking-widest flex items-center justify-center gap-2"
                            >
                                <CheckCircle2 size={20} />
                                Lançar Gasto
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
