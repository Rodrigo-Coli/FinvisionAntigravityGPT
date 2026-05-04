import React from 'react';
import { X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { BankAccount } from '../../types';

interface AddTransactionModalProps {
    show: boolean;
    onClose: () => void;
    onSubmit: () => void;
    isSubmitting: boolean;
    error?: string | null;
    form: {
        date: string;
        description: string;
        type: 'INCOME' | 'EXPENSE';
        amount: string;
        accountId: string;
        category: string;
    };
    setAddField: (field: string, value: string) => void;
    accounts: BankAccount[];
    categories: string[];
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
    show,
    onClose,
    onSubmit,
    isSubmitting,
    error,
    form,
    setAddField,
    accounts,
    categories
}) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity duration-500" onClick={() => !isSubmitting && onClose()}></div>

            <div className="bg-white rounded-t-[48px] sm:rounded-[56px] w-full max-w-xl shadow-[0_32px_120px_-15px_rgba(0,0,0,0.2)] relative overflow-hidden animate-in slide-in-from-bottom sm:zoom-in duration-700 ease-out border border-slate-100">
                <div className="p-10 sm:p-14">
                    <div className="flex items-center justify-between mb-12">
                        <div className="space-y-2">
                            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-none">Novo Lançamento</h2>
                            <p className="text-slate-400 font-medium text-sm">Registre uma nova movimentação no ledger.</p>
                        </div>
                        <button
                            onClick={() => !isSubmitting && onClose()}
                            disabled={isSubmitting}
                            className="w-14 h-14 flex items-center justify-center text-slate-300 hover:text-slate-900 hover:bg-slate-50 rounded-2xl transition-all disabled:opacity-50 active:scale-90"
                        >
                            <X size={28} strokeWidth={1.5} />
                        </button>
                    </div>

                    <div className="space-y-10">
                        <div className="grid grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Data do Registro</label>
                                <input
                                    type="date"
                                    value={form.date}
                                    onChange={(e) => setAddField('date', e.target.value)}
                                    className="w-full h-16 px-6 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-300 transition-all font-mono"
                                />
                            </div>
                            <div className="space-y-4">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Tipo de Fluxo</label>
                                <div className="relative group">
                                    <select
                                        value={form.type}
                                        onChange={(e) => setAddField('type', e.target.value)}
                                        className="w-full h-16 px-6 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-300 transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="EXPENSE">Saída (Débito)</option>
                                        <option value="INCOME">Entrada (Crédito)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Descrição do Lançamento</label>
                            <input
                                type="text"
                                value={form.description}
                                onChange={(e) => setAddField('description', e.target.value)}
                                placeholder="Descreva a finalidade..."
                                className="w-full h-16 px-8 bg-slate-50 border border-slate-100 rounded-3xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-300 transition-all placeholder:text-slate-300"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Montante (R$)</label>
                                <input
                                    type="text"
                                    value={form.amount}
                                    onChange={(e) => setAddField('amount', e.target.value)}
                                    placeholder="0.000,00"
                                    className="w-full h-16 px-8 bg-slate-50 border border-slate-100 rounded-3xl font-black text-slate-900 outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-300 transition-all placeholder:text-slate-200 text-xl tracking-tight"
                                />
                            </div>
                            <div className="space-y-4">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Fonte de Origem</label>
                                <select
                                    value={form.accountId}
                                    onChange={(e) => setAddField('accountId', e.target.value)}
                                    className="w-full h-16 px-6 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-300 transition-all appearance-none cursor-pointer"
                                >
                                    <option value="">Selecione a conta...</option>
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.institution}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Segmentação de Categoria</label>
                            <select
                                value={form.category}
                                onChange={(e) => setAddField('category', e.target.value)}
                                className="w-full h-16 px-6 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-300 transition-all appearance-none cursor-pointer"
                            >
                                {categories.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        {error && (
                            <div className="p-6 bg-rose-50 border border-rose-100 rounded-[28px] flex items-center gap-4 text-rose-600 animate-in shake duration-500">
                                <AlertCircle size={24} />
                                <p className="text-xs font-bold uppercase tracking-wider">{error}</p>
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-6 pt-6">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSubmitting}
                                className="w-full h-18 bg-white text-slate-400 border border-slate-100 font-bold rounded-[28px] hover:text-slate-900 hover:border-slate-300 transition-all uppercase text-[10px] tracking-[0.2em] active:scale-95 disabled:opacity-50"
                            >
                                Cancelar Operação
                            </button>
                            <button
                                type="button"
                                onClick={onSubmit}
                                disabled={isSubmitting}
                                className="w-full h-18 bg-slate-900 text-white font-bold rounded-[28px] hover:bg-slate-800 shadow-2xl shadow-black/10 transition-all active:scale-95 uppercase text-[10px] tracking-[0.34em] flex items-center justify-center gap-4 disabled:opacity-50"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="animate-spin" size={20} />
                                        Indexando...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 size={20} />
                                        Indexar Lançamento
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
