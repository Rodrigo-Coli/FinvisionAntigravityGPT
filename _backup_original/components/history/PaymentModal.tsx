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
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity duration-500" onClick={() => !isSubmitting && onClose()}></div>

            <div className="bg-white rounded-t-[48px] sm:rounded-[56px] w-full max-w-xl shadow-[0_32px_120px_-15px_rgba(0,0,0,0.2)] relative overflow-hidden animate-in slide-in-from-bottom sm:zoom-in duration-700 ease-out border border-slate-100">
                <div className="p-10 sm:p-14">
                    <div className="flex items-center justify-between mb-12">
                        <div className="space-y-2">
                            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-none">Liquidação</h2>
                            <p className="text-slate-400 font-medium text-sm truncate max-w-[300px]">
                                {tx.description}
                            </p>
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
                            <div className="p-8 bg-slate-50/50 rounded-[32px] border border-slate-100 text-center space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Exposição Atual</p>
                                <p className="text-2xl font-black text-rose-600 tracking-tighter">{formatCurrency(remaining)}</p>
                            </div>

                            <div className="p-8 bg-emerald-50/50 rounded-[32px] border border-emerald-100/50 text-center space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600">Fluxo de Saída</p>
                                <p className="text-2xl font-black text-emerald-600 tracking-tighter">{formatCurrency(Number(payAmount) || 0)}</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Montante da Operação (R$)</label>
                            <input
                                type="text"
                                value={payAmount}
                                onChange={(e) => setPayAmount(e.target.value)}
                                placeholder="0.000,00"
                                className="w-full h-18 px-10 bg-slate-50 border border-slate-100 rounded-[32px] font-black text-3xl text-slate-900 outline-none focus:ring-8 focus:ring-slate-900/5 focus:border-slate-300 transition-all placeholder:text-slate-200 tracking-tighter"
                                autoFocus
                            />
                        </div>

                        <div className="p-8 bg-slate-50/50 rounded-[40px] border border-slate-100 transition-all hover:bg-white group cursor-pointer">
                            <label className="flex items-center gap-6 cursor-pointer">
                                <div className="relative flex items-center justify-center">
                                    <input
                                        type="checkbox"
                                        checked={splitRemainder}
                                        onChange={(e) => setSplitRemainder(e.target.checked)}
                                        className="peer w-6 h-6 rounded-lg opacity-0 absolute cursor-pointer"
                                    />
                                    <div className="w-6 h-6 rounded-lg border-2 border-slate-200 peer-checked:bg-slate-900 peer-checked:border-slate-900 transition-all flex items-center justify-center text-white">
                                        <CheckCircle2 size={14} className="opacity-0 peer-checked:opacity-100" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-sm font-bold text-slate-900 block tracking-tight">Recalibrar Saldo Residual</span>
                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block opacity-70">Gerar nova pendência para o restante</span>
                                </div>
                            </label>
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
                                Cancelar
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
                                        Processando...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 size={20} />
                                        Confirmar Liquidação
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
