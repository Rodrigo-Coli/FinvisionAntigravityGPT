import React from 'react';
import { X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Transaction } from '../../types';

interface PaymentModalProps {
    show: boolean;
    onClose: () => void;
    onSubmit: () => void;
    tx: Transaction | null;
    remaining: number;
    payAmount: string;
    setPayAmount: (v: string) => void;
    splitRemainder: boolean;
    setSplitRemainder: (v: boolean) => void;
    isSubmitting: boolean;
    error?: string | null;
    formatCurrency: (val: number) => string;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
    show,
    onClose,
    onSubmit,
    tx,
    remaining,
    payAmount,
    setPayAmount,
    splitRemainder,
    setSplitRemainder,
    isSubmitting,
    error,
    formatCurrency
}) => {
    if (!show || !tx) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-brand-900/60 backdrop-blur-sm" onClick={() => !isSubmitting && onClose()}></div>

            <div className="bg-white rounded-t-[32px] sm:rounded-[40px] w-full max-w-lg shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom sm:zoom-in duration-300">
                <div className="p-8 lg:p-10">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Confirmar Pagamento</h2>
                            <p className="text-sm text-slate-500 font-bold mt-1 truncate max-w-[300px]">
                                {tx.description}
                            </p>
                        </div>
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
                            <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100 text-center">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Restante</p>
                                <p className="text-xl font-black text-rose-600">{formatCurrency(remaining)}</p>
                            </div>

                            <div className="p-5 bg-emerald-50 rounded-3xl border border-emerald-100 text-center">
                                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">Pagando Agora</p>
                                <p className="text-xl font-black text-emerald-700">{formatCurrency(Number(payAmount) || 0)}</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor do Pagamento</label>
                            <input
                                type="text"
                                value={payAmount}
                                onChange={(e) => setPayAmount(e.target.value)}
                                placeholder="0,00"
                                className="w-full h-14 px-6 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xl text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all"
                                autoFocus
                            />
                        </div>

                        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={splitRemainder}
                                    onChange={(e) => setSplitRemainder(e.target.checked)}
                                    className="w-6 h-6 rounded-lg border-slate-300 text-brand-600 focus:ring-brand-500 transition-all"
                                />
                                <div className="flex-grow">
                                    <span className="text-sm font-bold text-slate-700 block">Gerar diferença como nova pendência</span>
                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight block">Recomendado para pagamentos parciais</span>
                                </div>
                            </label>
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
                                Confirmar Pagamento
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
