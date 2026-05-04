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
        isInstallment: boolean;
        installmentsCount: number;
        isRecurring: boolean;
        recurrencePeriod: 'weekly' | 'monthly' | 'yearly' | 'biweekly' | 'custom';
        recurrenceDaysInterval: number;
    };
    setAddField: (field: string, value: any) => void;
    accounts: BankAccount[];
    categoryObjects: { name: string, type?: 'INCOME' | 'EXPENSE' }[];
    onCreateCategory: (name: string, type: 'INCOME' | 'EXPENSE') => Promise<void>;
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
    categoryObjects,
    onCreateCategory
}) => {
    const [isCreatingCategory, setIsCreatingCategory] = React.useState(false);
    const [newCategoryName, setNewCategoryName] = React.useState('');
    const [isSavingCategory, setIsSavingCategory] = React.useState(false);

    if (!show) return null;

    const filteredCategories = categoryObjects.filter(
        c => !c.type || c.type === form.type
    );

    const handleCreateCategorySubmit = async () => {
        if (!newCategoryName.trim()) return;
        setIsSavingCategory(true);
        try {
            await onCreateCategory(newCategoryName.trim(), form.type);
            setAddField('category', newCategoryName.trim());
            setIsCreatingCategory(false);
            setNewCategoryName('');
        } finally {
            setIsSavingCategory(false);
        }
    };

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
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Categoria</label>
                                {!isCreatingCategory && (
                                    <button
                                        type="button"
                                        onClick={() => setIsCreatingCategory(true)}
                                        className="text-[10px] font-bold text-brand-600 hover:text-brand-700 uppercase tracking-widest"
                                    >
                                        + Criar Nova
                                    </button>
                                )}
                            </div>

                            {isCreatingCategory ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        autoFocus
                                        value={newCategoryName}
                                        onChange={(e) => setNewCategoryName(e.target.value)}
                                        placeholder={`Nome da nova ${form.type === 'INCOME' ? 'receita' : 'despesa'}...`}
                                        className="flex-1 h-14 px-4 bg-slate-50 border border-brand-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all"
                                        onKeyDown={(e) => e.key === 'Enter' && handleCreateCategorySubmit()}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleCreateCategorySubmit}
                                        disabled={isSavingCategory}
                                        className="h-14 w-14 bg-brand-600 text-white rounded-2xl flex items-center justify-center hover:bg-brand-700 transition-all disabled:opacity-50"
                                    >
                                        {isSavingCategory ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsCreatingCategory(false)}
                                        disabled={isSavingCategory}
                                        className="h-14 w-14 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center hover:bg-slate-200 transition-all disabled:opacity-50"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            ) : (
                                <select
                                    value={form.category}
                                    onChange={(e) => setAddField('category', e.target.value)}
                                    className="w-full h-14 px-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all appearance-none cursor-pointer"
                                >
                                    {filteredCategories.map(c => (
                                        <option key={c.name} value={c.name}>{c.name}</option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {/* SERIES OPTIONS */}
                        <div className="p-4 bg-slate-50 rounded-2xl space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Opções de Série</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => {
                                        setAddField('isInstallment', !form.isInstallment);
                                        if (!form.isInstallment) setAddField('isRecurring', false);
                                    }}
                                    className={`h-12 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${form.isInstallment ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-400 border-slate-200'}`}
                                >
                                    Parcelado
                                </button>
                                <button
                                    onClick={() => {
                                        setAddField('isRecurring', !form.isRecurring);
                                        if (!form.isRecurring) setAddField('isInstallment', false);
                                    }}
                                    className={`h-12 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${form.isRecurring ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-400 border-slate-200'}`}
                                >
                                    Fixo / Recorrente
                                </button>
                            </div>

                            {form.isInstallment && (
                                <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                                    <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">Número de Parcelas</label>
                                    <input
                                        type="number"
                                        min="2"
                                        value={form.installmentsCount}
                                        onChange={(e) => setAddField('installmentsCount', Number(e.target.value))}
                                        className="w-full h-12 px-4 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 outline-none"
                                    />
                                </div>
                            )}

                            {form.isRecurring && (
                                <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">Frequência</label>
                                        <select
                                            value={form.recurrencePeriod}
                                            onChange={(e) => setAddField('recurrencePeriod', e.target.value)}
                                            className="w-full h-12 px-4 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 outline-none"
                                        >
                                            <option value="weekly">Semanal</option>
                                            <option value="biweekly">Quinzenal</option>
                                            <option value="monthly">Mensal</option>
                                            <option value="yearly">Anual</option>
                                            <option value="custom">Personalizado (Dias)</option>
                                        </select>
                                    </div>

                                    {form.recurrencePeriod === 'custom' && (
                                        <div className="animate-in slide-in-from-top-1 duration-200">
                                            <label className="text-[8px] font-black text-slate-400 uppercase mb-1 block">A cada X dias</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={form.recurrenceDaysInterval}
                                                onChange={(e) => setAddField('recurrenceDaysInterval', Number(e.target.value))}
                                                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 outline-none"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
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
