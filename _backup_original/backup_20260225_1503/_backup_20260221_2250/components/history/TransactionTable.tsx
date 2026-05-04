import React from 'react';
import { Loader2, Trash2, Edit2, RotateCcw, Check } from 'lucide-react';
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
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden w-full">
            {isLoading ? (
                <div className="py-32 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-10 h-10 text-brand-600 animate-spin" />
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Atualizando histórico...</p>
                </div>
            ) : (
                <div className="w-full overflow-x-auto scrollbar-hide">
                    <table className="w-full text-left border-collapse table-auto">
                        <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            <tr>
                                <th className="px-8 py-5">Data</th>
                                <th className="px-8 py-5">Descrição</th>
                                <th className="px-8 py-5">Conta / Categoria</th>
                                <th className="px-8 py-5 text-center">Status</th>
                                <th className="px-8 py-5 text-right">Valor</th>
                                <th className="px-8 py-5 text-right w-40">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {transactions.map(t => {
                                const amount = getAmount(t);
                                const remaining = getRemaining(t);
                                const status = getStatus(t);

                                const showPay = status !== 'PAID';
                                const showReopen = status === 'PAID';
                                const canPay = showPay && remaining > EPS;

                                return (
                                    <tr key={t.id} className="group hover:bg-slate-50/50 transition-colors">
                                        <td className="px-8 py-5 whitespace-nowrap">
                                            <span className="text-xs font-bold text-slate-400">
                                                {DateUtils.formatDisplayDate(t.date)}
                                            </span>
                                        </td>

                                        <td className="px-8 py-5">
                                            {editingRow?.id === t.id && editingRow.field === 'description' ? (
                                                <input
                                                    autoFocus
                                                    className="w-full h-9 px-3 text-sm font-bold bg-white border border-brand-500 rounded-lg outline-none"
                                                    value={editValue}
                                                    onChange={e => setEditValue(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleUpdate(t.id, 'description', editValue)}
                                                    onBlur={() => handleUpdate(t.id, 'description', editValue)}
                                                />
                                            ) : (
                                                <button
                                                    onClick={() => { setEditingRow({ id: t.id, field: 'description' }); setEditValue(t.description); }}
                                                    className="text-sm font-bold text-slate-900 text-left hover:text-brand-600 transition-colors"
                                                >
                                                    {t.description}
                                                </button>
                                            )}
                                        </td>

                                        <td className="px-8 py-5">
                                            <div className="flex flex-col gap-1">
                                                <select
                                                    className="text-[10px] font-bold uppercase text-slate-400 bg-transparent border-none p-0 outline-none cursor-pointer hover:text-slate-900 transition-colors"
                                                    value={t.accountId}
                                                    onChange={(e) => handleUpdate(t.id, 'account_id', e.target.value)}
                                                >
                                                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.institution}</option>)}
                                                </select>
                                                <select
                                                    className="text-[9px] font-bold uppercase text-brand-600/50 bg-transparent border-none p-0 outline-none cursor-pointer hover:text-brand-600 transition-colors"
                                                    value={t.category}
                                                    onChange={(e) => handleUpdate(t.id, 'category', e.target.value)}
                                                >
                                                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                                </select>
                                            </div>
                                        </td>

                                        <td className="px-8 py-5 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                {statusBadge(t)}
                                                {(t as any).parentId && (
                                                    <span className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest">Conciliação</span>
                                                )}
                                            </div>
                                        </td>

                                        <td className="px-8 py-5 text-right">
                                            <span className={`text-sm font-bold ${t.type === 'INCOME' ? 'text-emerald-600' : 'text-slate-900'}`}>
                                                {t.type === 'EXPENSE' ? '-' : ''}{formatCurrency(amount)}
                                            </span>
                                        </td>

                                        <td className="px-8 py-5">
                                            <div className="flex items-center justify-end gap-2">
                                                {savingId === t.id ? (
                                                    <Loader2 size={16} className="animate-spin text-brand-500" />
                                                ) : (
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {showPay && (
                                                            <button
                                                                onClick={() => openPayModal(t)}
                                                                disabled={!canPay}
                                                                className={`p-2 rounded-lg transition-all ${canPay ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-200 cursor-not-allowed'}`}
                                                                title="Pagar"
                                                            >
                                                                <Check size={18} />
                                                            </button>
                                                        )}
                                                        {showReopen && (
                                                            <button
                                                                onClick={() => reopenTransaction(t)}
                                                                className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all"
                                                                title="Reabrir"
                                                            >
                                                                <RotateCcw size={18} />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleDelete(t.id)}
                                                            className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                                            title="Excluir"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
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
