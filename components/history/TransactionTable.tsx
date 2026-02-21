import React from 'react';
import { Loader2, Trash2, Edit2 } from 'lucide-react';
import { DateUtils } from '../../lib/dateUtils';
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
        <div className="bg-white rounded-[32px] border border-slate-200/50 shadow-sm overflow-hidden w-full">
            {isLoading ? (
                <div className="py-32 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-12 h-12 text-brand-600 animate-spin" />
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Atualizando histórico...</p>
                </div>
            ) : (
                <div className="w-full overflow-x-auto scrollbar-hide">
                    <table className="w-full text-left border-collapse table-auto">
                        <thead className="bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-700 text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
                            <tr>
                                <th className="px-6 py-5">Data</th>
                                <th className="px-6 py-5">Descrição</th>
                                <th className="px-6 py-5">Conta</th>
                                <th className="px-6 py-5">Categoria</th>
                                <th className="px-6 py-5 text-center">Status</th>
                                <th className="px-6 py-5 text-right">Valor</th>
                                <th className="px-12 py-5 text-center">Ações</th>
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
                                    <tr key={t.id} className="group hover:bg-slate-50/30 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="text-xs font-bold text-slate-500">
                                                {DateUtils.formatDisplayDate(t.date)}
                                            </span>
                                        </td>

                                        <td className="px-6 py-4">
                                            {editingRow?.id === t.id && editingRow.field === 'description' ? (
                                                <input
                                                    autoFocus
                                                    className="w-full h-9 px-3 text-sm font-bold bg-white border border-brand-400 rounded-xl outline-none shadow-sm"
                                                    value={editValue}
                                                    onChange={e => setEditValue(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleUpdate(t.id, 'description', editValue)}
                                                    onBlur={() => handleUpdate(t.id, 'description', editValue)}
                                                />
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => { setEditingRow({ id: t.id, field: 'description' }); setEditValue(t.description); }}
                                                        className="text-sm font-black text-slate-900 hover:text-brand-600 transition-colors text-left truncate flex-grow group-hover:underline decoration-brand-200 underline-offset-4"
                                                        title={t.description}
                                                    >
                                                        {t.description}
                                                    </button>
                                                </div>
                                            )}
                                        </td>

                                        <td className="px-6 py-4">
                                            <select
                                                className="text-[10px] font-black uppercase tracking-tight bg-slate-100 text-slate-500 rounded-lg px-2 py-1.5 border-none focus:ring-4 focus:ring-brand-500/10 cursor-pointer hover:bg-slate-200 transition-all"
                                                value={t.accountId}
                                                onChange={(e) => handleUpdate(t.id, 'account_id', e.target.value)}
                                            >
                                                {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.institution}</option>)}
                                            </select>
                                        </td>

                                        <td className="px-6 py-4">
                                            <select
                                                className="text-[10px] font-black uppercase tracking-tighter bg-indigo-50 text-indigo-600 rounded-lg px-2 py-1.5 border-none focus:ring-4 focus:ring-indigo-500/10 hover:bg-indigo-100 transition-all cursor-pointer"
                                                value={t.category}
                                                onChange={(e) => handleUpdate(t.id, 'category', e.target.value)}
                                            >
                                                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                            </select>
                                        </td>

                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {statusBadge(t)}
                                                {(t as any).parentId && (
                                                    <span className="px-2 py-1 rounded-lg text-[9px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-100">Diferença</span>
                                                )}
                                            </div>
                                        </td>

                                        <td className="px-6 py-4 text-right">
                                            <span className={`text-sm font-black ${t.type === 'INCOME' ? 'text-emerald-600' : 'text-slate-900'}`}>
                                                {t.type === 'EXPENSE' ? '-' : ''}{formatCurrency(amount)}
                                            </span>
                                        </td>

                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                {savingId === t.id ? (
                                                    <Loader2 size={16} className="animate-spin text-brand-500" />
                                                ) : (
                                                    <>
                                                        {showPay && (
                                                            <button
                                                                onClick={() => openPayModal(t)}
                                                                disabled={!canPay}
                                                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${canPay
                                                                    ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-md shadow-brand-500/10'
                                                                    : 'bg-slate-50 text-slate-300 border border-slate-100 cursor-not-allowed'
                                                                    }`}
                                                                title={canPay ? 'Pagar agora' : 'Indisponível'}
                                                            >
                                                                Pagar
                                                            </button>
                                                        )}
                                                        {showReopen && (
                                                            <button
                                                                onClick={() => reopenTransaction(t)}
                                                                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
                                                                title="Desfazer pagamento"
                                                            >
                                                                Reabrir
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleDelete(t.id)}
                                                            className="p-2.5 rounded-xl text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all"
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
