import React from 'react';
import { Clock, Plus, Loader2, Tags, Trash2, Paperclip } from 'lucide-react';
import { DateUtils } from '../../lib/dateUtils';

interface TransactionListProps {
    transactions: any[];
    loadingTxs: boolean;
    categories: { id: string; name: string }[];
    savingRowId: string | null;
    onAddManualTx: () => void;
    onUpdateTxLocal: (id: string, patch: any) => void;
    onSaveTxPatch: (id: string, patch: any) => void;
    onDeleteTx: (id: string) => void;
    showStatementScope: boolean;
    statements: any[];
    isLocked?: boolean;
    onUploadAttachment?: (id: string, file: File) => Promise<void>;
    onDeleteAttachment?: (documentId: string, transactionId: string) => Promise<void>;
    onViewAttachment?: (documentId: string) => Promise<void>;
}

export const TransactionList: React.FC<TransactionListProps> = ({
    transactions,
    loadingTxs,
    categories,
    savingRowId,
    onAddManualTx,
    onUpdateTxLocal,
    onSaveTxPatch,
    onDeleteTx,
    showStatementScope,
    statements,
    isLocked = false,
    onUploadAttachment,
    onDeleteAttachment,
    onViewAttachment
}) => {
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
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-widest cursor-not-allowed">
                        <Clock size={14} />
                        Paga (Bloqueada)
                    </div>
                )}
            </div>

            <div className="bg-white border border-slate-200/50 rounded-3xl overflow-hidden shadow-sm">
                {loadingTxs ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-3">
                        <Loader2 size={32} className="animate-spin text-brand-600" />
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Buscando lançamentos...</p>
                    </div>
                ) : transactions.length === 0 ? (
                    <div className="py-20 text-center space-y-2">
                        <p className="text-slate-400 font-bold">Nenhuma transação registrada.</p>
                        <p className="text-xs text-slate-300">Use o botão acima para adicionar um gasto manualmente.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <div className="min-w-[900px]">
                            {/* Adjusted column spans: Data col-span-2, Subcategoria col-span-1 */}
                            <div className="grid grid-cols-12 gap-2 px-6 py-4 bg-slate-50/50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 italic">
                                <div className="col-span-2 text-[8px]">Data</div>
                                <div className="col-span-2 text-[8px]">Descrição</div>
                                <div className="col-span-2 text-[8px]">Categoria</div>
                                <div className="col-span-1 text-[8px]">Subcategoria</div>
                                <div className="col-span-1 text-[8px]">Perfil</div>
                                <div className="col-span-2 text-[8px]">Fatura / Mês</div>
                                <div className="col-span-1 text-right text-[8px]">Valor</div>
                                <div className="col-span-1 text-right text-[8px]">Ações</div>
                            </div>

                            <div className="divide-y divide-slate-50">
                                {transactions.map((tx) => (
                                    <div
                                        key={tx.id}
                                        className="grid grid-cols-12 gap-2 px-6 py-4 items-center hover:bg-slate-50/30 transition-colors"
                                    >
                                        {/* Date (col-span-2 with hidden calendar icon indicator) */}
                                        <div className="col-span-2">
                                            <input
                                                type="date"
                                                value={String(tx.date).slice(0, 10)}
                                                onChange={(e) => onUpdateTxLocal(tx.id, { date: e.target.value })}
                                                onBlur={(e) => onSaveTxPatch(tx.id, { date: e.target.value })}
                                                className="compact-date-input w-full text-[10px] font-mono font-bold bg-transparent border border-slate-200 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm"
                                            />
                                        </div>

                                        {/* Description */}
                                        <div className="col-span-2">
                                            <input
                                                type="text"
                                                value={tx.description || ''}
                                                onChange={(e) => onUpdateTxLocal(tx.id, { description: e.target.value })}
                                                onBlur={(e) => onSaveTxPatch(tx.id, { description: e.target.value })}
                                                className="w-full text-[10px] font-bold bg-transparent border border-slate-200 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all truncate shadow-sm"
                                            />
                                        </div>

                                        {/* Category */}
                                        <div className="col-span-2">
                                            <div className="relative">
                                                <select
                                                    value={tx.category_id || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value || null;
                                                        onUpdateTxLocal(tx.id, { category_id: val });
                                                        onSaveTxPatch(tx.id, { category_id: val });
                                                    }}
                                                    className="w-full text-[10px] font-bold bg-white border border-slate-200 rounded-xl px-2 py-1.5 pl-6 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 appearance-none transition-all shadow-sm"
                                                >
                                                    <option value="">Sem categoria</option>
                                                    {categories.map((c) => (
                                                        <option key={c.id} value={c.id}>
                                                            {c.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <Tags size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                                            </div>
                                        </div>

                                        {/* Subcategory (col-span-1) */}
                                        <div className="col-span-1">
                                            <input
                                                type="text"
                                                value={tx.subcategory || ''}
                                                placeholder="..."
                                                onChange={(e) => onUpdateTxLocal(tx.id, { subcategory: e.target.value })}
                                                onBlur={(e) => onSaveTxPatch(tx.id, { subcategory: e.target.value })}
                                                className="w-full text-[10px] font-bold bg-transparent border border-slate-200 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all truncate shadow-sm"
                                            />
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
                                                className="w-full text-[10px] font-bold bg-white border border-slate-200 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm"
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
                                                className="w-full text-[10px] font-black uppercase text-slate-500 bg-white border border-slate-200 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm"
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
                                        <div className="col-span-1">
                                            <input
                                                type="number"
                                                value={Number(tx.amount || 0)}
                                                disabled={isLocked}
                                                onChange={(e) => onUpdateTxLocal(tx.id, { amount: Number(e.target.value) })}
                                                onBlur={(e) => onSaveTxPatch(tx.id, { amount: Number(e.target.value) })}
                                                className={`w-full text-[10px] font-black text-right bg-transparent border border-slate-200 rounded-xl px-2 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm ${isLocked ? 'opacity-70 cursor-not-allowed' : ''}`}
                                            />
                                        </div>

                                        {/* Actions Combined (Attachment + Delete) */}
                                        <div className="col-span-1 flex items-center justify-end gap-1">
                                            {tx.document_id ? (
                                                <button
                                                    onClick={() => onViewAttachment?.(tx.document_id)}
                                                    className="p-1 px-1.5 bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 transition-all"
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
                                                    className="p-1 px-1.5 text-slate-300 hover:text-brand-600 transition-all"
                                                >
                                                    <Paperclip size={10} />
                                                </button>
                                            )}

                                            {savingRowId === tx.id ? (
                                                <Loader2 size={12} className="animate-spin text-brand-600" />
                                            ) : (
                                                <button
                                                    onClick={() => !isLocked && onDeleteTx(tx.id)}
                                                    disabled={isLocked}
                                                    className={`p-1 px-1.5 rounded-lg transition-all ${isLocked ? 'text-slate-200' : 'text-slate-300 hover:text-rose-600 hover:bg-rose-50'}`}
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
