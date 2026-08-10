import React, { useEffect, useState } from 'react';
import { X, Loader2, AlertCircle, Plus, Trash2, SplitSquareHorizontal } from 'lucide-react';
import { formatCurrency } from '../../lib/historyUtils';
import { SplitTransactionService, SplitSourceType, SplitDraft } from '../../services/splitTransaction.service';
import { ReconciliationService } from '../../services/reconciliation.service';

interface SplitRow {
    key: string;
    category: string;
    subcategory: string;
    amountText: string; // valor digitado (sempre positivo do ponto de vista do usuário)
    notes: string;
}

interface SplitTransactionModalProps {
    show: boolean;
    onClose: () => void;
    onSaved: (hasSplits: boolean) => void; // avisa a tela pai que hasSplits mudou, para atualizar o estado local
    sourceType: SplitSourceType;
    transaction: {
        id: string;
        description: string;
        amount: number; // valor total original (com sinal)
        category?: string;
        subcategory?: string;
    };
    categoryObjects: { name: string; type?: 'INCOME' | 'EXPENSE' }[];
    subcategories: { id: string; name: string; category_name?: string }[];
}

let rowSeq = 0;
const newRowKey = () => `row-${Date.now()}-${rowSeq++}`;

export const SplitTransactionModal: React.FC<SplitTransactionModalProps> = ({
    show,
    onClose,
    onSaved,
    sourceType,
    transaction,
    categoryObjects,
    subcategories
}) => {
    const [rows, setRows] = useState<SplitRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const totalAbs = Math.abs(transaction?.amount || 0);
    const parentSign = (transaction?.amount || 0) < 0 ? -1 : 1;

    useEffect(() => {
        if (!show || !transaction?.id) return;
        setError(null);
        setLoading(true);
        SplitTransactionService.getSplits(sourceType, transaction.id)
            .then(existing => {
                if (existing.length > 0) {
                    setRows(existing.map(s => ({
                        key: newRowKey(),
                        category: s.category,
                        subcategory: s.subcategory || '',
                        amountText: Math.abs(s.amount).toFixed(2).replace('.', ','),
                        notes: s.notes || ''
                    })));
                } else {
                    // Começa com 2 pedaços: um pré-preenchido com a categoria atual e
                    // valor total, outro em branco - facilita o caso comum de "tirar
                    // um pedaço" de um lançamento já categorizado.
                    setRows([
                        { key: newRowKey(), category: transaction.category || '', subcategory: transaction.subcategory || '', amountText: totalAbs.toFixed(2).replace('.', ','), notes: '' },
                        { key: newRowKey(), category: '', subcategory: '', amountText: '', notes: '' }
                    ]);
                }
            })
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show, transaction?.id]);

    if (!show) return null;

    const parseAmount = (text: string): number => {
        const n = Number((text || '0').replace(/\./g, '').replace(',', '.'));
        return isNaN(n) ? 0 : n;
    };

    const sumRows = rows.reduce((acc, r) => acc + parseAmount(r.amountText), 0);
    const diff = Math.round((totalAbs - sumRows) * 100) / 100;
    const isBalanced = Math.abs(diff) < 0.01;
    const hasEmptyCategory = rows.some(r => parseAmount(r.amountText) > 0 && !r.category.trim());
    const validRows = rows.filter(r => parseAmount(r.amountText) > 0);
    const canSave = !loading && !saving && isBalanced && validRows.length >= 2 && !hasEmptyCategory;

    const updateRow = (key: string, patch: Partial<SplitRow>) => {
        setRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r));
    };

    const addRow = () => setRows(prev => [...prev, { key: newRowKey(), category: '', subcategory: '', amountText: '', notes: '' }]);
    const removeRow = (key: string) => setRows(prev => prev.filter(r => r.key !== key));

    const handleSave = async () => {
        if (!canSave) return;
        setSaving(true);
        setError(null);
        try {
            const drafts: SplitDraft[] = [];
            for (const r of validRows) {
                const categoryId = await ReconciliationService.ensureCategoryExists(r.category.trim());
                let subcategoryId = '';
                if (r.subcategory.trim() && categoryId) {
                    subcategoryId = await ReconciliationService.ensureSubcategoryExists(categoryId, r.subcategory.trim());
                }
                drafts.push({
                    category: r.category.trim(),
                    subcategory: r.subcategory.trim() || undefined,
                    categoryId: categoryId || undefined,
                    amount: parseAmount(r.amountText) * parentSign,
                    notes: r.notes.trim() || undefined
                });
                void subcategoryId;
            }
            await SplitTransactionService.saveSplits(sourceType, transaction.id, drafts);
            onSaved(true);
            onClose();
        } catch (e: any) {
            setError(e.message || 'Não foi possível salvar a divisão');
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveSplit = async () => {
        setSaving(true);
        setError(null);
        try {
            await SplitTransactionService.clearSplits(sourceType, transaction.id);
            onSaved(false);
            onClose();
        } catch (e: any) {
            setError(e.message || 'Não foi possível remover a divisão');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-brand-900/60 backdrop-blur-sm" onClick={() => !saving && onClose()}></div>

            <div className="bg-white rounded-t-[32px] sm:rounded-[40px] w-full max-w-lg shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom sm:zoom-in duration-300">
                <div className="p-8 lg:p-10">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center">
                                <SplitSquareHorizontal size={20} />
                            </div>
                            <h2 className="text-xl font-black text-slate-900 tracking-tight">Dividir Lançamento</h2>
                        </div>
                        <button
                            onClick={() => !saving && onClose()}
                            disabled={saving}
                            className="p-3 text-slate-400 hover:bg-slate-100 rounded-2xl transition-all disabled:opacity-50"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    <p className="text-xs font-bold text-slate-400 mb-6 ml-1 truncate">{transaction?.description}</p>

                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="animate-spin text-brand-500" size={28} />
                        </div>
                    ) : (
                        <>
                            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                                {rows.map((row) => (
                                    <div key={row.key} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 relative">
                                                <input
                                                    list={`split-categories-${row.key}`}
                                                    value={row.category}
                                                    onFocus={(e) => e.target.select()}
                                                    onChange={(e) => updateRow(row.key, { category: e.target.value })}
                                                    placeholder="Categoria"
                                                    className="w-full h-12 px-4 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 text-sm outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all"
                                                />
                                                <datalist id={`split-categories-${row.key}`}>
                                                    {categoryObjects.map(c => <option key={c.name} value={c.name} />)}
                                                </datalist>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeRow(row.key)}
                                                disabled={rows.length <= 1}
                                                className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all disabled:opacity-30"
                                                title="Remover pedaço"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="relative">
                                                <input
                                                    list={`split-subcategories-${row.key}`}
                                                    value={row.subcategory}
                                                    onFocus={(e) => e.target.select()}
                                                    onChange={(e) => updateRow(row.key, { subcategory: e.target.value })}
                                                    placeholder="Subcategoria"
                                                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl font-semibold text-slate-600 text-xs outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all"
                                                />
                                                <datalist id={`split-subcategories-${row.key}`}>
                                                    {subcategories.filter(s => s.category_name === row.category).map(s => <option key={s.id} value={s.name} />)}
                                                </datalist>
                                            </div>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={row.amountText}
                                                onFocus={(e) => e.target.select()}
                                                onChange={(e) => updateRow(row.key, { amountText: e.target.value.replace(/[^0-9,]/g, '') })}
                                                placeholder="0,00"
                                                className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl font-black text-slate-800 text-xs outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all text-right"
                                            />
                                        </div>
                                        <input
                                            type="text"
                                            value={row.notes}
                                            onFocus={(e) => e.target.select()}
                                            onChange={(e) => updateRow(row.key, { notes: e.target.value })}
                                            placeholder="Observação deste pedaço (opcional)"
                                            className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl font-medium text-slate-600 text-xs outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300"
                                        />
                                    </div>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={addRow}
                                className="w-full mt-3 py-3 bg-white border border-dashed border-slate-300 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-brand-500 hover:text-brand-600 transition-all flex items-center justify-center gap-2"
                            >
                                <Plus size={14} /> Adicionar Pedaço
                            </button>

                            <div className={`mt-5 p-4 rounded-2xl flex items-center justify-between ${isBalanced ? 'bg-emerald-50 border border-emerald-100' : 'bg-amber-50 border border-amber-100'}`}>
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    Total do lançamento
                                    <div className="text-sm font-black text-slate-800 normal-case tracking-normal">{formatCurrency(totalAbs)}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Soma dos pedaços</div>
                                    <div className={`text-sm font-black normal-case tracking-normal ${isBalanced ? 'text-emerald-600' : 'text-amber-600'}`}>
                                        {formatCurrency(sumRows)}
                                        {!isBalanced && (
                                            <span className="block text-[10px] font-bold">
                                                {diff > 0 ? `faltam ${formatCurrency(diff)}` : `sobram ${formatCurrency(Math.abs(diff))}`}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {hasEmptyCategory && (
                                <p className="text-[10px] text-amber-600 font-bold mt-2 ml-1">Preencha a categoria de todos os pedaços com valor.</p>
                            )}

                            {error && (
                                <div className="mt-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 animate-in shake duration-300">
                                    <AlertCircle size={18} />
                                    <p className="text-xs font-bold">{error}</p>
                                </div>
                            )}

                            <div className="flex flex-col sm:flex-row gap-3 pt-6">
                                <button
                                    type="button"
                                    onClick={handleRemoveSplit}
                                    disabled={saving}
                                    className="w-full sm:w-auto h-14 px-5 bg-white border border-slate-200 text-slate-500 font-black rounded-2xl hover:bg-slate-50 transition-all uppercase text-[10px] tracking-widest active:scale-95 disabled:opacity-50"
                                >
                                    Remover divisão
                                </button>
                                <button
                                    type="button"
                                    onClick={() => !saving && onClose()}
                                    disabled={saving}
                                    className="w-full sm:flex-1 h-14 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all uppercase text-xs tracking-widest active:scale-95 disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={!canSave}
                                    className="w-full sm:flex-1 h-14 bg-brand-600 text-white font-black rounded-2xl hover:bg-brand-700 transition-all uppercase text-xs tracking-widest active:scale-95 disabled:opacity-50 shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2"
                                >
                                    {saving ? <Loader2 className="animate-spin" size={18} /> : 'Salvar Divisão'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
