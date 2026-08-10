import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '../../lib/historyUtils';
import { SplitDraft } from '../../services/splitTransaction.service';

interface SplitRow {
    key: string;
    category: string;
    subcategory: string;
    amountText: string;
    notes: string;
}

interface SplitFieldsInlineProps {
    totalAbs: number; // valor total já digitado no formulário (sempre positivo aqui)
    categoryObjects: { name: string; type?: 'INCOME' | 'EXPENSE' }[];
    subcategories: { id: string; name: string; category_name?: string }[];
    onChange: (drafts: SplitDraft[] | null) => void; // null = soma não bate, ainda não pode salvar
}

let rowSeq = 0;
const newRowKey = () => `inline-split-${Date.now()}-${rowSeq++}`;

export const SplitFieldsInline: React.FC<SplitFieldsInlineProps> = ({ totalAbs, categoryObjects, subcategories, onChange }) => {
    const [rows, setRows] = useState<SplitRow[]>([
        { key: newRowKey(), category: '', subcategory: '', amountText: '', notes: '' },
        { key: newRowKey(), category: '', subcategory: '', amountText: '', notes: '' }
    ]);

    const parseAmount = (text: string): number => {
        const n = Number((text || '0').replace(/\./g, '').replace(',', '.'));
        return isNaN(n) ? 0 : n;
    };

    const sumRows = rows.reduce((acc, r) => acc + parseAmount(r.amountText), 0);
    const diff = Math.round((totalAbs - sumRows) * 100) / 100;
    const isBalanced = totalAbs > 0 && Math.abs(diff) < 0.01;
    const validRows = rows.filter(r => parseAmount(r.amountText) > 0 && r.category.trim());

    useEffect(() => {
        if (isBalanced && validRows.length >= 2) {
            onChange(validRows.map(r => ({
                category: r.category.trim(),
                subcategory: r.subcategory.trim() || undefined,
                amount: parseAmount(r.amountText),
                notes: r.notes.trim() || undefined
            })));
        } else {
            onChange(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, totalAbs]);

    const updateRow = (key: string, patch: Partial<SplitRow>) => {
        setRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r));
    };
    const addRow = () => setRows(prev => [...prev, { key: newRowKey(), category: '', subcategory: '', amountText: '', notes: '' }]);
    const removeRow = (key: string) => setRows(prev => prev.filter(r => r.key !== key));

    return (
        <div className="space-y-3">
            {rows.map(row => (
                <div key={row.key} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="flex-1 relative">
                            <input
                                list={`inline-split-categories-${row.key}`}
                                value={row.category}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updateRow(row.key, { category: e.target.value })}
                                placeholder="Categoria"
                                className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 text-xs outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all"
                            />
                            <datalist id={`inline-split-categories-${row.key}`}>
                                {categoryObjects.map(c => <option key={c.name} value={c.name} />)}
                            </datalist>
                        </div>
                        <button
                            type="button"
                            onClick={() => removeRow(row.key)}
                            disabled={rows.length <= 1}
                            className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all disabled:opacity-30"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="relative">
                            <input
                                list={`inline-split-subcategories-${row.key}`}
                                value={row.subcategory}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updateRow(row.key, { subcategory: e.target.value })}
                                placeholder="Subcategoria"
                                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl font-semibold text-slate-600 text-xs outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all"
                            />
                            <datalist id={`inline-split-subcategories-${row.key}`}>
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
                            className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl font-black text-slate-800 text-xs outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all text-right"
                        />
                    </div>
                    <input
                        type="text"
                        value={row.notes}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => updateRow(row.key, { notes: e.target.value })}
                        placeholder="Observação deste pedaço (opcional)"
                        className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl font-medium text-slate-600 text-xs outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300"
                    />
                </div>
            ))}

            <button
                type="button"
                onClick={addRow}
                className="w-full py-2.5 bg-white border border-dashed border-slate-300 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-brand-500 hover:text-brand-600 transition-all flex items-center justify-center gap-2"
            >
                <Plus size={14} /> Adicionar Pedaço
            </button>

            <div className={`p-3 rounded-xl flex items-center justify-between ${isBalanced ? 'bg-emerald-50 border border-emerald-100' : 'bg-amber-50 border border-amber-100'}`}>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Soma dos pedaços</span>
                <span className={`text-xs font-black ${isBalanced ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {formatCurrency(sumRows)}
                    {totalAbs > 0 && !isBalanced && (
                        <span className="ml-1 font-bold">
                            ({diff > 0 ? `faltam ${formatCurrency(diff)}` : `sobram ${formatCurrency(Math.abs(diff))}`})
                        </span>
                    )}
                </span>
            </div>
        </div>
    );
};
