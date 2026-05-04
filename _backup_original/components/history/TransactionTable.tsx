import React from 'react';
import { Loader2, Trash2, Edit2 } from 'lucide-react';
import { Transaction, BankAccount } from '../../types';

interface TransactionTableProps {
    transactions: Transaction[];
    isLoading: boolean;
    accounts: BankAccount[];
    categories: string[];
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
}

export const TransactionTable: React.FC<TransactionTableProps> = ({
    transactions,
    isLoading,
    accounts,
    categories,
    editingRow,
    setEditingRow,
    editValue,
    setEditValue,
    savingId,
    handleUpdate,
    handleDelete,
    statusBadge,
    formatCurrency,
    getAmount,
    getPaidAmount,
    getRemaining,
    getStatus,
    openPayModal,
    reopenTransaction
}) => {
    const EPS = 0.000001;

    return (
        <div className="bg-white">
            {isLoading ? (
                <div className="py-48 flex flex-col items-center justify-center gap-10">
                    <div className="relative">
                        <div className="w-20 h-20 border-4 border-slate-50 border-t-slate-900 rounded-full animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 size={32} className="text-slate-200 animate-pulse" />
                        </div>
                    </div>
                    <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[11px] animate-pulse">Syncing Ledger...</p>
                </div>
            ) : (
                <div className="w-full overflow-x-auto scrollbar-hide">
                    <table className="w-full text-left min-w-[1100px] border-collapse">
                        <thead className="bg-slate-50/50 border-b border-slate-100 text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                            <tr>
                                <th className="px-10 py-8">Data de Registro</th>
                                <th className="px-10 py-8">Descrição do Lançamento</th>
                                <th className="px-10 py-8">Fonte</th>
                                <th className="px-10 py-8">Segmento</th>
                                <th className="px-10 py-8">Status</th>
                                <th className="px-10 py-8 text-right">Montante</th>
                                <th className="px-10 py-8 text-right">Liquidado</th>
                                <th className="px-10 py-8 text-right">Exposição</th>
                                <th className="px-10 py-8 text-center">Gestão</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {transactions.map(t => {
                                const amount = getAmount(t);
                                const paidAmount = getPaidAmount(t);
                                const remaining = getRemaining(t);
                                const status = getStatus(t);

                                const showPay = status !== 'PAID';
                                const showReopen = status === 'PAID';
                                const canPay = showPay && remaining > EPS;

                                return (
                                    <tr key={t.id} className="group hover:bg-slate-50/50 transition-all duration-300">
                                        <td className="px-10 py-8 whitespace-nowrap">
                                            <span className="text-[11px] font-bold text-slate-400 font-mono tracking-tight">
                                                {t.date ? new Date(t.date).toLocaleDateString('pt-BR') : ''}
                                            </span>
                                        </td>

                                        <td className="px-10 py-8 max-w-md">
                                            {editingRow?.id === t.id && editingRow.field === 'description' ? (
                                                <input
                                                    autoFocus
                                                    className="w-full h-10 px-4 text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-2xl outline-none shadow-sm focus:ring-4 focus:ring-slate-900/5 transition-all"
                                                    value={editValue}
                                                    onChange={e => setEditValue(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleUpdate(t.id, 'description', editValue)}
                                                    onBlur={() => handleUpdate(t.id, 'description', editValue)}
                                                />
                                            ) : (
                                                <div className="flex items-center gap-4">
                                                    <button
                                                        onClick={() => { setEditingRow({ id: t.id, field: 'description' }); setEditValue(t.description); }}
                                                        className="text-[13px] font-bold text-slate-900 hover:text-brand-600 transition-colors text-left truncate flex-grow group-hover:translate-x-1 duration-300"
                                                        title={t.description}
                                                    >
                                                        {t.description}
                                                    </button>
                                                </div>
                                            )}
                                        </td>

                                        <td className="px-10 py-8">
                                            <div className="relative group/select">
                                                <select
                                                    className="appearance-none bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-widest rounded-full px-5 py-2.5 border border-transparent hover:border-slate-200 hover:bg-white transition-all cursor-pointer outline-none focus:ring-4 focus:ring-slate-900/5"
                                                    value={t.accountId}
                                                    onChange={(e) => handleUpdate(t.id, 'account_id', e.target.value)}
                                                >
                                                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.institution}</option>)}
                                                </select>
                                            </div>
                                        </td>

                                        <td className="px-10 py-8">
                                            <select
                                                className="appearance-none bg-brand-50/50 text-brand-700 text-[10px] font-bold uppercase tracking-widest rounded-full px-5 py-2.5 border border-transparent hover:border-brand-100 hover:bg-brand-50 transition-all cursor-pointer outline-none focus:ring-4 focus:ring-brand-500/5"
                                                value={t.category}
                                                onChange={(e) => handleUpdate(t.id, 'category', e.target.value)}
                                            >
                                                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                            </select>
                                        </td>

                                        <td className="px-10 py-8">
                                            <div className="flex items-center gap-3">
                                                {statusBadge(t)}
                                                {(t as any).parentId && (
                                                    <span className="px-3 py-1 bg-slate-100 text-slate-400 rounded-full text-[9px] font-bold uppercase tracking-widest border border-slate-200/50">Recalibração</span>
                                                )}
                                            </div>
                                        </td>

                                        <td className="px-10 py-8 text-right">
                                            <span className={`text-[15px] font-bold tracking-tight ${t.type === 'INCOME' ? 'text-emerald-600' : 'text-slate-900'}`}>
                                                {t.type === 'EXPENSE' ? '-' : ''}{formatCurrency(amount)}
                                            </span>
                                        </td>

                                        <td className="px-10 py-8 text-right">
                                            <span className="text-[13px] font-bold text-slate-600 tracking-tight">{formatCurrency(paidAmount)}</span>
                                        </td>

                                        <td className="px-10 py-8 text-right">
                                            <span className="text-[13px] font-bold text-slate-400 tracking-tight">{formatCurrency(remaining)}</span>
                                        </td>

                                        <td className="px-10 py-8">
                                            <div className="flex items-center justify-center gap-4">
                                                {savingId === t.id ? (
                                                    <Loader2 size={20} className="animate-spin text-slate-900" />
                                                ) : (
                                                    <>
                                                        {showPay && (
                                                            <button
                                                                onClick={() => openPayModal(t)}
                                                                disabled={!canPay}
                                                                className={`px-6 py-2.5 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all active:scale-95 ${canPay
                                                                    ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-black/10'
                                                                    : 'bg-slate-50 text-slate-300 border border-slate-100 cursor-not-allowed'
                                                                    }`}
                                                            >
                                                                Liquidar
                                                            </button>
                                                        )}
                                                        {showReopen && (
                                                            <button
                                                                onClick={() => reopenTransaction(t)}
                                                                className="px-6 py-2.5 bg-white text-slate-400 border border-slate-100 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] hover:text-slate-900 hover:border-slate-300 transition-all active:scale-95"
                                                            >
                                                                Estornar
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleDelete(t.id)}
                                                            className="p-3 bg-white text-slate-200 border border-slate-100 rounded-2xl hover:text-rose-600 hover:border-rose-100 hover:bg-rose-50 transition-all active:scale-95"
                                                            title="Excluir"
                                                        >
                                                            <Trash2 size={18} />
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
            )}
        </div>
    );
};
