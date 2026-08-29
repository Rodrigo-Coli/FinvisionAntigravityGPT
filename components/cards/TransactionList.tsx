import React, { useState } from 'react';
import { Clock, Plus, Loader2, Tags, Trash2, Paperclip, SplitSquareHorizontal } from 'lucide-react';
import { DateUtils } from '../../lib/dateUtils';
import { SplitTransactionModal } from '../history/SplitTransactionModal';
import { SearchableInput } from '../common/SearchableInput';

interface TransactionListProps {
    transactions: any[];
    loadingTxs: boolean;
    categories: { id: string; name: string }[];
    subcategories?: { id: string; name: string; category_name?: string }[];
    savingRowId: string | null;
    onAddManualTx: () => void;
    onUpdateTxLocal: (id: string, patch: any) => void;
    onSaveTxPatch: (id: string, patch: any) => void;
    onCommitCategory?: (id: string, value: string) => void;
    onCommitSubcategory?: (id: string, value: string) => void;
    onDeleteTx: (id: string) => void;
    showStatementScope: boolean;
    statements: any[];
    isLocked?: boolean;
    onUploadAttachment?: (id: string, file: File) => Promise<void>;
    onDeleteAttachment?: (documentId: string, transactionId: string) => Promise<void>;
    onViewAttachment?: (documentId: string) => Promise<void>;
    onSplitChanged?: (id: string, hasSplits: boolean) => void;
}

export const TransactionList: React.FC<TransactionListProps> = ({
    transactions,
    loadingTxs,
    categories,
    subcategories = [],
    savingRowId,
    onAddManualTx,
    onUpdateTxLocal,
    onSaveTxPatch,
    onCommitCategory,
    onCommitSubcategory,
    onDeleteTx,
    showStatementScope,
    statements,
    isLocked = false,
    onUploadAttachment,
    onDeleteAttachment,
    onViewAttachment,
    onSplitChanged
}) => {
    const [splitTx, setSplitTx] = useState<any | null>(null);
    const categoryObjects = categories.map(c => ({ name: c.name }));

    return (
        <div className="mt-8">
            {/* Inline CSS style to hide mobile browser native date picker icons inside the narrow column */}
            <style dangerouslySetInnerHTML={{__html: `
                .compact-date-input::-webkit-calendar-picker-indicator,
                .compact-date-input::-webkit-inner-spin-button {
                    display: none !important;
                    -webkit-appearance: none !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
            `}} />

            <div className="flex items-center justify-between mb-6">
                <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                    <Clock size={14} className="text-slate-300" />
                    Transações {showStatementScope ? 'da fatura' : '(geral do cartão)'}
                </h3>

                {!isLocked ? (
                    <button
                        onClick={onAddManualTx}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand-500/20 hover:bg-brand-700 transition-all active:scale-95"
                    >
                        <Plus size={14} />
                        Lançamento manual
                    </button>
                ) : (
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-widest cursor-not-allowed">
                        <Clock size={14} />
                        Paga (Bloqueada)
                    </div>
                )}
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700 rounded-3xl overflow-hidden shadow-sm">
                {loadingTxs ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-3">
                        <Loader2 size={32} className="animate-spin text-brand-600" />
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Buscando lançamentos...</p>
                    </div>
                ) : transactions.length === 0 ? (
                    <div className="py-20 text-center space-y-2">
                        <p className="text-slate-400 font-bold">Nenhuma transação registrada.</p>
                        <p className="text-xs text-slate-300 dark:text-slate-500">Use o botão acima para adicionar um gasto manualmente.</p>
                    </div>
                ) : (
                    <>
                    {/* ════════════════ MOBILE/TABLET CARD VIEW (< lg) ════════════════
                        Breakpoint é lg (1024px), não md (768px): a tabela abaixo tem
                        min-w-[900px], então entre 768px e 899px ela ainda forçaria
                        rolagem lateral — exatamente o que esta visão existe para evitar. */}
                    <div className="block lg:hidden divide-y divide-slate-50 dark:divide-slate-700">
                        {transactions.map((tx) => (
                            <div key={tx.id} className="p-4 space-y-3">
                                {/* Data + Valor */}
                                <div className="flex items-center justify-between gap-2">
                                    <input
                                        type="date"
                                        value={String(tx.date).slice(0, 10)}
                                        onChange={(e) => onUpdateTxLocal(tx.id, { date: e.target.value })}
                                        onBlur={(e) => onSaveTxPatch(tx.id, { date: e.target.value })}
                                        className="compact-date-input text-xs font-mono font-bold bg-transparent border border-slate-200 dark:border-slate-700 dark:text-slate-200 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm"
                                    />
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            type="button"
                                            disabled={isLocked}
                                            title="Inverter sinal (compra ↔ estorno)"
                                            onClick={() => {
                                                const newAmt = -Number(tx.amount || 0);
                                                onUpdateTxLocal(tx.id, { amount: newAmt });
                                                onSaveTxPatch(tx.id, { amount: newAmt });
                                            }}
                                            className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg border text-xs font-black transition-all ${isLocked ? 'text-slate-200 dark:text-slate-600 border-slate-100 dark:border-slate-700 cursor-not-allowed' : Number(tx.amount || 0) < 0 ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' : 'text-slate-300 dark:text-slate-500 border-slate-200 dark:border-slate-700'}`}
                                        >
                                            ±
                                        </button>
                                        <input
                                            type="number"
                                            value={Number(tx.amount || 0)}
                                            disabled={isLocked}
                                            onChange={(e) => onUpdateTxLocal(tx.id, { amount: Number(e.target.value) })}
                                            onBlur={(e) => onSaveTxPatch(tx.id, { amount: Number(e.target.value) })}
                                            className={`w-24 text-sm font-black text-right bg-transparent border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm ${Number(tx.amount || 0) < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'dark:text-slate-200'} ${isLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                                        />
                                    </div>
                                </div>

                                {/* Descrição */}
                                <input
                                    type="text"
                                    value={tx.description || ''}
                                    onChange={(e) => onUpdateTxLocal(tx.id, { description: e.target.value })}
                                    onBlur={(e) => onSaveTxPatch(tx.id, { description: e.target.value })}
                                    className="w-full text-sm font-bold bg-transparent border border-slate-200 dark:border-slate-700 dark:text-slate-100 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm"
                                />

                                {/* Categoria + Subcategoria */}
                                {tx.has_splits ? (
                                    <button
                                        type="button"
                                        onClick={() => setSplitTx(tx)}
                                        className="w-full flex items-center gap-1.5 bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-500/20 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider"
                                    >
                                        <SplitSquareHorizontal size={12} /> Dividido em várias categorias
                                    </button>
                                ) : (
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1 min-w-0">
                                        <SearchableInput
                                            value={tx.category ?? ''}
                                            placeholder="Categoria..."
                                            options={categories.map(c => c.name)}
                                            onChange={(v) => onUpdateTxLocal(tx.id, { category: v })}
                                            onBlur={() => onCommitCategory?.(tx.id, tx.category ?? '')}
                                            className="w-full text-xs font-bold bg-white dark:bg-brand-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 pl-6 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm truncate"
                                        />
                                        <Tags size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-500 pointer-events-none" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <SearchableInput
                                            value={tx.subcategory || ''}
                                            placeholder="Subcategoria..."
                                            options={subcategories.filter(s => s.category_name === tx.category).map(s => s.name)}
                                            onChange={(v) => onUpdateTxLocal(tx.id, { subcategory: v })}
                                            onBlur={() => onCommitSubcategory?.(tx.id, tx.subcategory || '')}
                                            className="w-full text-xs font-bold bg-transparent dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all truncate shadow-sm"
                                        />
                                    </div>
                                </div>
                                )}

                                {/* Observações + Tags */}
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={tx.notes || ''}
                                        placeholder="Observações..."
                                        onChange={(e) => onUpdateTxLocal(tx.id, { notes: e.target.value })}
                                        onBlur={(e) => onSaveTxPatch(tx.id, { notes: e.target.value })}
                                        className="flex-1 min-w-0 text-xs font-medium bg-transparent dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all truncate shadow-sm"
                                    />
                                    <input
                                        type="text"
                                        value={Array.isArray(tx.tags) ? tx.tags.join(', ') : (tx.tags || '')}
                                        placeholder="Tags..."
                                        onChange={(e) => onUpdateTxLocal(tx.id, { tags: e.target.value })}
                                        onBlur={(e) => onSaveTxPatch(tx.id, { tags: e.target.value })}
                                        className="flex-1 min-w-0 text-xs font-bold bg-transparent dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all truncate shadow-sm"
                                    />
                                </div>

                                {/* Perfil + Fatura/Mês */}
                                <div className="flex items-center gap-2">
                                    <select
                                        value={tx.owner_name || 'Pessoal'}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            onUpdateTxLocal(tx.id, { owner_name: val });
                                            onSaveTxPatch(tx.id, { owner_name: val === 'Pessoal' ? null : val });
                                        }}
                                        className="flex-1 min-w-0 text-xs font-bold bg-white dark:bg-brand-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm"
                                    >
                                        {[...new Set(['Pessoal', ...transactions.map(t => t.owner_name).filter(Boolean)])].map(o => (
                                            <option key={o} value={o}>{o}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={tx.statement_id || ''}
                                        onChange={(e) => {
                                            const val = e.target.value || null;
                                            onUpdateTxLocal(tx.id, { statement_id: val });
                                            onSaveTxPatch(tx.id, { statement_id: val });
                                        }}
                                        className="flex-1 min-w-0 text-xs font-black uppercase text-slate-500 dark:text-slate-300 bg-white dark:bg-brand-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm"
                                    >
                                        <option value="">Nenhuma Fatura</option>
                                        {statements.map(s => (
                                            <option key={s.id} value={s.id}>
                                                {DateUtils.formatMonthYear(s.year, s.month)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Ações — sempre visíveis no mobile */}
                                <div className="flex items-center justify-end gap-2 pt-1">
                                    {tx.document_id ? (
                                        <button
                                            onClick={() => onViewAttachment?.(tx.document_id)}
                                            className="h-9 px-3 flex items-center gap-1.5 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 rounded-xl text-[10px] font-black uppercase tracking-wider"
                                        >
                                            <Paperclip size={12} /> Ver anexo
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => {
                                                const input = document.createElement('input');
                                                input.type = 'file';
                                                input.onchange = (e: any) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) onUploadAttachment?.(tx.id, file);
                                                };
                                                input.click();
                                            }}
                                            className="h-9 px-3 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700 text-slate-400 dark:text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-wider"
                                        >
                                            <Paperclip size={12} /> Anexar
                                        </button>
                                    )}

                                    {savingRowId === tx.id ? (
                                        <Loader2 size={16} className="animate-spin text-brand-600" />
                                    ) : (
                                        <>
                                        <button
                                            onClick={() => !isLocked && setSplitTx(tx)}
                                            disabled={isLocked}
                                            className={`h-9 w-9 flex items-center justify-center rounded-xl transition-all shrink-0 ${isLocked ? 'text-slate-200 dark:text-slate-600' : 'bg-violet-50 dark:bg-violet-500/10 text-violet-500 dark:text-violet-400'}`}
                                            title="Dividir lançamento"
                                        >
                                            <SplitSquareHorizontal size={14} />
                                        </button>
                                        <button
                                            onClick={() => !isLocked && onDeleteTx(tx.id)}
                                            disabled={isLocked}
                                            className={`h-9 w-9 flex items-center justify-center rounded-xl transition-all shrink-0 ${isLocked ? 'text-slate-200 dark:text-slate-600' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400'}`}
                                            title="Excluir"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ════════════════ DESKTOP TABLE VIEW (≥ lg) ════════════════ */}
                    <div className="hidden lg:block overflow-x-auto">
                        <div className="min-w-[900px]">
                            {/* Adjusted column spans: Data col-span-2, Subcategoria col-span-1 */}
                            <div className="grid grid-cols-12 gap-2 px-6 py-4 bg-slate-50/50 dark:bg-brand-900/40 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-700 italic">
                                <div className="col-span-2 text-[8px]">Data</div>
                                <div className="col-span-2 text-[8px]">Descrição</div>
                                <div className="col-span-2 text-[8px]">Categoria</div>
                                <div className="col-span-1 text-[8px]">Subcategoria</div>
                                <div className="col-span-1 text-[8px]">Perfil</div>
                                <div className="col-span-2 text-[8px]">Fatura / Mês</div>
                                <div className="col-span-1 text-right text-[8px]">Valor</div>
                                <div className="col-span-1 text-right text-[8px]">Ações</div>
                            </div>

                            <div className="divide-y divide-slate-50 dark:divide-slate-700">
                                {transactions.map((tx) => (
                                    <div
                                        key={tx.id}
                                        className="hover:bg-slate-50/30 dark:hover:bg-brand-900/30 transition-colors"
                                    >
                                    <div className="grid grid-cols-12 gap-2 px-6 py-4 items-center">
                                        {/* Date (col-span-2 with hidden calendar icon indicator) */}
                                        <div className="col-span-2">
                                            <input
                                                type="date"
                                                value={String(tx.date).slice(0, 10)}
                                                onChange={(e) => onUpdateTxLocal(tx.id, { date: e.target.value })}
                                                onBlur={(e) => onSaveTxPatch(tx.id, { date: e.target.value })}
                                                className="compact-date-input w-full text-[10px] font-mono font-bold bg-transparent dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm"
                                            />
                                        </div>

                                        {/* Description */}
                                        <div className="col-span-2">
                                            <input
                                                type="text"
                                                value={tx.description || ''}
                                                onChange={(e) => onUpdateTxLocal(tx.id, { description: e.target.value })}
                                                onBlur={(e) => onSaveTxPatch(tx.id, { description: e.target.value })}
                                                className="w-full text-[10px] font-bold bg-transparent dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all truncate shadow-sm"
                                            />
                                        </div>

                                        {/* Category */}
                                        <div className="col-span-2">
                                            {tx.has_splits ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setSplitTx(tx)}
                                                    className="w-full flex items-center gap-1 bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-500/20 rounded-xl px-2 py-1.5 text-[10px] font-black uppercase tracking-wider truncate"
                                                >
                                                    <SplitSquareHorizontal size={10} /> Dividido
                                                </button>
                                            ) : (
                                            <div className="relative">
                                                <SearchableInput
                                                    value={tx.category ?? ''}
                                                    placeholder="Categoria..."
                                                    options={categories.map(c => c.name)}
                                                    onChange={(v) => onUpdateTxLocal(tx.id, { category: v })}
                                                    onBlur={() => onCommitCategory?.(tx.id, tx.category ?? '')}
                                                    className="w-full text-[10px] font-bold bg-white dark:bg-brand-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 pl-6 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm truncate"
                                                />
                                                <Tags size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-500 pointer-events-none" />
                                            </div>
                                            )}
                                        </div>

                                        {/* Subcategory (col-span-1) */}
                                        <div className="col-span-1">
                                            {!tx.has_splits && (
                                            <>
                                            <SearchableInput
                                                value={tx.subcategory || ''}
                                                placeholder="..."
                                                options={subcategories.filter(s => s.category_name === tx.category).map(s => s.name)}
                                                onChange={(v) => onUpdateTxLocal(tx.id, { subcategory: v })}
                                                onBlur={() => onCommitSubcategory?.(tx.id, tx.subcategory || '')}
                                                className="w-full text-[10px] font-bold bg-transparent dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all truncate shadow-sm"
                                            />
                                            </>
                                            )}
                                        </div>

                                        {/* Entity */}
                                        <div className="col-span-1">
                                            <select
                                                value={tx.owner_name || 'Pessoal'}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    onUpdateTxLocal(tx.id, { owner_name: val });
                                                    onSaveTxPatch(tx.id, { owner_name: val === 'Pessoal' ? null : val });
                                                }}
                                                className="w-full text-[10px] font-bold bg-white dark:bg-brand-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm"
                                            >
                                                {[...new Set(['Pessoal', ...transactions.map(t => t.owner_name).filter(Boolean)])].map(o => (
                                                    <option key={o} value={o}>{o}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Statement Selector */}
                                        <div className="col-span-2 text-[10px]">
                                            <select
                                                value={tx.statement_id || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value || null;
                                                    onUpdateTxLocal(tx.id, { statement_id: val });
                                                    onSaveTxPatch(tx.id, { statement_id: val });
                                                }}
                                                className="w-full text-[10px] font-black uppercase text-slate-500 dark:text-slate-300 bg-white dark:bg-brand-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm"
                                            >
                                                <option value="">Nenhuma Fatura</option>
                                                {statements.map(s => (
                                                    <option key={s.id} value={s.id}>
                                                        {DateUtils.formatMonthYear(s.year, s.month)}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Amount */}
                                        <div className="col-span-1 flex items-center gap-1">
                                            {/* Teclado numérico do celular não tem o sinal de menos —
                                                este botão inverte compra ↔ estorno/crédito */}
                                            <button
                                                type="button"
                                                disabled={isLocked}
                                                title="Inverter sinal (compra ↔ estorno)"
                                                onClick={() => {
                                                    const newAmt = -Number(tx.amount || 0);
                                                    onUpdateTxLocal(tx.id, { amount: newAmt });
                                                    onSaveTxPatch(tx.id, { amount: newAmt });
                                                }}
                                                className={`shrink-0 w-5 h-5 flex items-center justify-center rounded-md border text-[10px] font-black transition-all ${isLocked ? 'text-slate-200 dark:text-slate-600 border-slate-100 dark:border-slate-700 cursor-not-allowed' : Number(tx.amount || 0) < 0 ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-100' : 'text-slate-300 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:text-brand-600 hover:border-brand-300'}`}
                                            >
                                                ±
                                            </button>
                                            <input
                                                type="number"
                                                value={Number(tx.amount || 0)}
                                                disabled={isLocked}
                                                onChange={(e) => onUpdateTxLocal(tx.id, { amount: Number(e.target.value) })}
                                                onBlur={(e) => onSaveTxPatch(tx.id, { amount: Number(e.target.value) })}
                                                className={`w-full text-[10px] font-black text-right bg-transparent border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm ${Number(tx.amount || 0) < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'dark:text-slate-200'} ${isLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                                            />
                                        </div>

                                        {/* Actions Combined (Attachment + Delete) */}
                                        <div className="col-span-1 flex items-center justify-end gap-1">
                                            {tx.document_id ? (
                                                <button
                                                    onClick={() => onViewAttachment?.(tx.document_id)}
                                                    className="p-1 px-1.5 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 rounded-lg hover:bg-brand-100 transition-all"
                                                    title="Ver"
                                                >
                                                    <Paperclip size={10} />
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        const input = document.createElement('input');
                                                        input.type = 'file';
                                                        input.onchange = (e: any) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) onUploadAttachment?.(tx.id, file);
                                                        };
                                                        input.click();
                                                    }}
                                                    className="p-1 px-1.5 text-slate-300 dark:text-slate-500 hover:text-brand-600 transition-all"
                                                >
                                                    <Paperclip size={10} />
                                                </button>
                                            )}

                                            {savingRowId === tx.id ? (
                                                <Loader2 size={12} className="animate-spin text-brand-600" />
                                            ) : (
                                                <>
                                                <button
                                                    onClick={() => !isLocked && setSplitTx(tx)}
                                                    disabled={isLocked}
                                                    title="Dividir lançamento"
                                                    className={`p-1 px-1.5 rounded-lg transition-all ${isLocked ? 'text-slate-200 dark:text-slate-600' : 'text-slate-300 dark:text-slate-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/10'}`}
                                                >
                                                    <SplitSquareHorizontal size={12} />
                                                </button>
                                                <button
                                                    onClick={() => !isLocked && onDeleteTx(tx.id)}
                                                    disabled={isLocked}
                                                    className={`p-1 px-1.5 rounded-lg transition-all ${isLocked ? 'text-slate-200 dark:text-slate-600' : 'text-slate-300 dark:text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10'}`}
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Observações + Tags */}
                                    <div className="px-6 pb-3 -mt-1 flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={tx.notes || ''}
                                            placeholder="Observações..."
                                            onChange={(e) => onUpdateTxLocal(tx.id, { notes: e.target.value })}
                                            onBlur={(e) => onSaveTxPatch(tx.id, { notes: e.target.value })}
                                            className="flex-1 min-w-0 text-[10px] font-medium bg-transparent dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all truncate shadow-sm"
                                        />
                                        <input
                                            type="text"
                                            value={Array.isArray(tx.tags) ? tx.tags.join(', ') : (tx.tags || '')}
                                            placeholder="Tags separadas por vírgula..."
                                            onChange={(e) => onUpdateTxLocal(tx.id, { tags: e.target.value })}
                                            onBlur={(e) => onSaveTxPatch(tx.id, { tags: e.target.value })}
                                            className="flex-1 min-w-0 text-[10px] font-bold bg-transparent dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all truncate shadow-sm"
                                        />
                                    </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    </>
                )}
            </div>


            {splitTx && (
                <SplitTransactionModal
                    show={!!splitTx}
                    onClose={() => setSplitTx(null)}
                    onSaved={(hasSplits) => {
                        onUpdateTxLocal(splitTx.id, { has_splits: hasSplits });
                        onSplitChanged?.(splitTx.id, hasSplits);
                    }}
                    sourceType="card_transaction"
                    transaction={{
                        id: splitTx.id,
                        description: splitTx.description,
                        amount: Number(splitTx.amount || 0),
                        category: splitTx.category,
                        subcategory: splitTx.subcategory
                    }}
                    categoryObjects={categoryObjects}
                    subcategories={subcategories}
                />
            )}
        </div>
    );
};
