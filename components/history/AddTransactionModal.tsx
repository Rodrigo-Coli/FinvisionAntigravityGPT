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
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !isSubmitting && onClose()}></div>

            <div className="bg-white rounded-t-[32px] sm:rounded-[40px] w-full max-w-lg shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom sm:zoom-in duration-300">
                <div className="p-8 lg:p-10">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Nova Transação</h2>
                        <button
                            onClick={() => !isSubmitting && onClose()}
                            disabled={isSubmitting}
                            className="p-3 text-slate-400 hover:bg-slate-100 rounded-2xl transition-all disabled:opacity-50"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data</label>
                                <input
                                    type="date"
                                    value={form.date}
                                    onChange={(e) => setAddField('date', e.target.value)}
                                    className="w-full h-14 px-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo</label>
                                <select
                                    value={form.type}
                                    onChange={(e) => setAddField('type', e.target.value)}
                                    className="w-full h-14 px-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all appearance-none cursor-pointer"
                                >
                                    <option value="EXPENSE">Saída (Despesa)</option>
                                    <option value="INCOME">Entrada (Receita)</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição</label>
                            <input
                                type="text"
                                value={form.description}
                                onChange={(e) => setAddField('description', e.target.value)}
                                placeholder="Ex: Aluguel, Mercado, Cliente X..."
                                className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor (R$)</label>
                                <input
                                    type="text"
                                    value={form.amount}
                                    onChange={(e) => setAddField('amount', e.target.value)}
                                    placeholder="0,00"
                                    className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Conta Bancária</label>
                                <select
                                    value={form.accountId}
                                    onChange={(e) => setAddField('accountId', e.target.value)}
                                    className="w-full h-14 px-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all appearance-none cursor-pointer"
                                >
                                    <option value="">Selecione a conta...</option>
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.institution}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Categoria</label>
                            <select
                                value={form.category}
                                onChange={(e) => setAddField('category', e.target.value)}
                                className="w-full h-14 px-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all appearance-none cursor-pointer"
                            >
                                {categories.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        {error && (
                            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 animate-in shake duration-300">
                                <AlertCircle size={20} />
                                <p className="text-xs font-bold">{error}</p>
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-4 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSubmitting}
                                className="w-full h-14 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all uppercase text-xs tracking-widest active:scale-95 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={onSubmit}
                                disabled={isSubmitting}
                                className="w-full h-14 bg-brand-600 text-white font-black rounded-2xl hover:bg-brand-700 shadow-xl shadow-brand-500/30 transition-all active:scale-95 uppercase text-xs tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                                Criar Transação
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
