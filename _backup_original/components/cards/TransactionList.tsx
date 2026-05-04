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
        <div className="mt-20 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-8 pb-8 border-b border-slate-100">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg shadow-black/5">
                            <Clock size={18} strokeWidth={2} />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                            Lançamentos {showStatementScope ? 'da Fatura' : '(Geral)'}
                        </h3>
                    </div>
                    <p className="text-slate-400 font-medium text-lg">Histórico de Movimentações Consolidado</p>
                </div>

                <button
                    onClick={onAddManualTx}
                    className="w-full sm:w-auto px-10 py-5 bg-white border-2 border-slate-100 text-slate-950 rounded-[22px] font-bold text-[10px] uppercase tracking-[0.2em] hover:bg-slate-50 hover:border-slate-200 transition-all active:scale-95 shadow-soft flex items-center justify-center gap-3"
                >
                    <Plus size={18} />
                    New Record
                </button>
            </div>

            <div className="bg-white border border-slate-100 rounded-[48px] overflow-hidden shadow-soft">
                {loadingTxs ? (
                    <div className="py-32 flex flex-col items-center justify-center gap-8">
                        <div className="relative">
                            <div className="w-16 h-16 border-4 border-slate-50 border-t-slate-900 rounded-full animate-spin" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 size={24} className="text-slate-200 animate-pulse" />
                            </div>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] animate-pulse">Syncing transactions...</p>
                    </div>
                ) : transactions.length === 0 ? (
                    <div className="py-32 text-center space-y-8">
                        <div className="w-24 h-24 bg-slate-50 rounded-[32px] mx-auto flex items-center justify-center text-slate-200 border border-slate-100">
                            <Clock size={40} />
                        </div>
                        <div className="space-y-3">
                            <p className="text-slate-900 text-2xl font-bold tracking-tight">Limpo e Organizado</p>
                            <p className="text-slate-400 font-medium max-w-[320px] mx-auto leading-relaxed">Nenhum lançamento detectado neste escopo. Inicie seu controle criando um registro manual.</p>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-x-auto scrollbar-hide">
                        <div className="min-w-[1000px]">
                            <div className="grid grid-cols-12 gap-8 px-12 py-6 bg-slate-50/30 text-[9px] font-bold uppercase tracking-[0.3em] text-slate-300 border-b border-slate-50">
                                <div className="col-span-2">Timestamp</div>
                                <div className="col-span-4">Memo / Merchant</div>
                                <div className="col-span-3">Category Allocation</div>
                                <div className="col-span-2 text-right">Gross Amount</div>
                                <div className="col-span-1 text-right">Status</div>
                            </div>

                            <div className="divide-y divide-slate-50">
                                {transactions.map((tx) => (
                                    <div
                                        key={tx.id}
                                        className="grid grid-cols-12 gap-8 px-12 py-8 items-center hover:bg-slate-50 group transition-all duration-300"
                                    >
                                        {/* Date */}
                                        <div className="col-span-2">
                                            <input
                                                type="date"
                                                value={String(tx.date).slice(0, 10)}
                                                onChange={(e) => onUpdateTxLocal(tx.id, { date: e.target.value })}
                                                onBlur={(e) => onSaveTxPatch(tx.id, { date: e.target.value })}
                                                className="w-full text-[13px] font-bold bg-transparent border-none p-0 outline-none hover:text-slate-900 focus:text-slate-900 transition-colors cursor-pointer text-slate-500"
                                            />
                                        </div>

                                        {/* Description */}
                                        <div className="col-span-4 space-y-4">
                                            <input
                                                type="text"
                                                value={tx.description || ''}
                                                onChange={(e) => onUpdateTxLocal(tx.id, { description: e.target.value })}
                                                onBlur={(e) => onSaveTxPatch(tx.id, { description: e.target.value })}
                                                placeholder="Merchant Name"
                                                className="w-full text-base font-bold bg-transparent border-none p-0 outline-none text-slate-900 placeholder:text-slate-200 focus:ring-0 transition-all"
                                            />
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] px-3 py-1 bg-white text-slate-400 font-bold rounded-full uppercase tracking-widest border border-slate-100 shadow-sm">
                                                    {String(tx.source || '—').toUpperCase()}
                                                </span>
                                                {tx.is_manual && (
                                                    <span className="text-[9px] px-3 py-1 bg-slate-900 text-white font-bold rounded-full uppercase tracking-widest border border-slate-900 shadow-sm">
                                                        MANUAL
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Category */}
                                        <div className="col-span-3">
                                            <div className="relative group/sel">
                                                <select
                                                    value={tx.category_id || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value || null;
                                                        onUpdateTxLocal(tx.id, { category_id: val });
                                                        onSaveTxPatch(tx.id, { category_id: val });
                                                    }}
                                                    className="w-full text-[13px] font-bold bg-transparent border-none p-0 pr-8 outline-none appearance-none cursor-pointer text-slate-400 hover:text-slate-900 focus:text-slate-900 transition-colors"
                                                >
                                                    <option value="">Uncategorized</option>
                                                    {categories.map((c) => (
                                                        <option key={c.id} value={c.id}>
                                                            {c.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <Tags size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-200 pointer-events-none group-hover/sel:text-slate-900 transition-colors" />
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
                                                    className="w-full text-xl font-black text-right bg-transparent border-none p-0 outline-none text-slate-900 focus:ring-0 transition-all"
                                                />
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="col-span-1 flex items-center justify-end">
                                            {savingRowId === tx.id ? (
                                                <div className="w-12 h-12 flex items-center justify-center">
                                                    <Loader2 size={18} className="animate-spin text-slate-900" />
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => onDeleteTx(tx.id)}
                                                    className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white border border-slate-100 text-slate-300 hover:text-rose-600 hover:border-rose-100 hover:bg-rose-50/50 hover:shadow-sm transition-all active:scale-90"
                                                    title="Excluir lançamento"
                                                >
                                                    <Trash2 size={20} strokeWidth={1.5} />
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
