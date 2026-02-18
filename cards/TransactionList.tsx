import React from 'react';
import { Clock, Plus, Loader2, Tags, Trash2 } from 'lucide-react';

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
    showStatementScope
}) => {
    return (
        <div className="mt-8">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                    <Clock size={14} className="text-slate-300" />
                    Transações {showStatementScope ? 'da fatura' : '(geral do cartão)'}
                </h3>

                <button
                    onClick={onAddManualTx}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand-500/20 hover:bg-brand-700 transition-all active:scale-95"
                >
                    <Plus size={14} />
                    Lançamento manual
                </button>
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
                        <div className="min-w-[800px]">
                            <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-50/50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                                <div className="col-span-2">Data</div>
                                <div className="col-span-4">Descrição</div>
                                <div className="col-span-3">Categoria</div>
                                <div className="col-span-2 text-right">Valor</div>
                                <div className="col-span-1 text-right">Ação</div>
                            </div>

                            <div className="divide-y divide-slate-50">
                                {transactions.map((tx) => (
                                    <div
                                        key={tx.id}
                                        className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-slate-50/30 transition-colors"
                                    >
                                        {/* Date */}
                                        <div className="col-span-2">
                                            <input
                                                type="date"
                                                value={String(tx.date).slice(0, 10)}
                                                onChange={(e) => onUpdateTxLocal(tx.id, { date: e.target.value })}
                                                onBlur={(e) => onSaveTxPatch(tx.id, { date: e.target.value })}
                                                className="w-full text-xs font-bold bg-transparent border border-slate-200 rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                                            />
                                        </div>

                                        {/* Description */}
                                        <div className="col-span-4">
                                            <input
                                                type="text"
                                                value={tx.description || ''}
                                                onChange={(e) => onUpdateTxLocal(tx.id, { description: e.target.value })}
                                                onBlur={(e) => onSaveTxPatch(tx.id, { description: e.target.value })}
                                                className="w-full text-xs font-bold bg-transparent border border-slate-200 rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                                            />
                                            <div className="mt-1.5 flex items-center gap-2">
                                                <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 font-black rounded-lg uppercase tracking-tighter">
                                                    {String(tx.source || '—').toUpperCase()}
                                                </span>
                                                {tx.is_manual && (
                                                    <span className="text-[10px] px-2 py-0.5 bg-brand-50 text-brand-600 font-black rounded-lg uppercase tracking-tighter border border-brand-100">
                                                        MANUAL
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Category */}
                                        <div className="col-span-3">
                                            <div className="relative">
                                                <select
                                                    value={tx.category_id || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value || null;
                                                        onUpdateTxLocal(tx.id, { category_id: val });
                                                        onSaveTxPatch(tx.id, { category_id: val });
                                                    }}
                                                    className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl px-3 py-1.5 pl-8 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 appearance-none transition-all"
                                                >
                                                    <option value="">Sem categoria</option>
                                                    {categories.map((c) => (
                                                        <option key={c.id} value={c.id}>
                                                            {c.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <Tags size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                                            </div>
                                        </div>

                                        {/* Amount */}
                                        <div className="col-span-2">
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={Number(tx.amount || 0)}
                                                    onChange={(e) => onUpdateTxLocal(tx.id, { amount: Number(e.target.value) })}
                                                    onBlur={(e) => onSaveTxPatch(tx.id, { amount: Number(e.target.value) })}
                                                    className="w-full text-xs font-black text-right bg-transparent border border-slate-200 rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                                                />
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="col-span-1 flex items-center justify-end">
                                            {savingRowId === tx.id ? (
                                                <Loader2 size={16} className="animate-spin text-brand-600" />
                                            ) : (
                                                <button
                                                    onClick={() => onDeleteTx(tx.id)}
                                                    className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                                                    title="Excluir"
                                                >
                                                    <Trash2 size={18} />
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
