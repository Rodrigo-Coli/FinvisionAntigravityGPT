import React from 'react';
import { X, Landmark, Loader2 } from 'lucide-react';

interface PayStatementModalProps {
    show: boolean;
    onClose: () => void;
    onSubmit: () => void;
    isPaying: boolean;
    selectedCardName: string;
    statementOpen: number;
    formatCurrency: (val: number) => string;
    accounts: any[];
    payAccountId: string;
    setPayAccountId: (v: string) => void;
    payDate: string;
    setPayDate: (v: string) => void;
    payAmount: number;
    setPayAmount: (v: number) => void;
    getAccountLabel: (a: any) => string;
}

export const PayStatementModal: React.FC<PayStatementModalProps> = ({
    show,
    onClose,
    onSubmit,
    isPaying,
    selectedCardName,
    statementOpen,
    formatCurrency,
    accounts,
    payAccountId,
    setPayAccountId,
    payDate,
    setPayDate,
    payAmount,
    setPayAmount,
    getAccountLabel
}) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity animate-in fade-in duration-300"
                onClick={() => !isPaying && onClose()}
            ></div>

            <div className="bg-white rounded-[40px] w-full max-w-xl shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-500">
                <div className="p-10 sm:p-12">
                    <div className="flex items-center justify-between mb-10">
                        <div className="space-y-1">
                            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Pagar Fatura</h2>
                            <p className="text-sm font-medium text-slate-500">
                                {selectedCardName} • Restante: <span className="text-slate-900 font-bold">{formatCurrency(statementOpen)}</span>
                            </p>
                        </div>
                        <button
                            onClick={() => !isPaying && onClose()}
                            className="p-4 text-slate-400 hover:bg-slate-50 hover:text-slate-900 rounded-2xl transition-all disabled:opacity-50 border border-transparent hover:border-slate-100 shadow-sm"
                            disabled={isPaying}
                        >
                            <X size={24} />
                        </button>
                    </div>

                    <div className="space-y-8">
                        <div className="space-y-2.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Pagar usando a Conta</label>
                            <div className="relative">
                                <select
                                    value={payAccountId}
                                    onChange={(e) => setPayAccountId(e.target.value)}
                                    className={`w-full h-14 px-6 bg-slate-50 border ${accounts.length === 0 ? 'border-amber-200 focus:border-amber-500' : 'border-slate-200 focus:border-brand-500'} rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/5 focus:bg-white transition-all appearance-none cursor-pointer shadow-sm`}
                                >
                                    <option value="">Selecione sua conta...</option>
                                    {accounts.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {getAccountLabel(a)}
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                    <div className="w-2.5 h-2.5 border-r-2 border-b-2 border-slate-400 rotate-45 mb-1" />
                                </div>
                            </div>
                            {accounts.length === 0 && (
                                <div className="mt-3 p-4 bg-amber-50 text-amber-800 rounded-xl text-xs font-bold border border-amber-100 flex items-center gap-3">
                                    <span className="text-lg">⚠️</span>
                                    Nenhuma conta ativa encontrada. Cadastre uma conta bancária primeiro.
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                            <div className="space-y-2.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Data do Pagamento</label>
                                <input
                                    type="date"
                                    value={payDate}
                                    onChange={(e) => setPayDate(e.target.value)}
                                    className="w-full h-14 px-6 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/5 focus:border-brand-500 focus:bg-white transition-all shadow-sm"
                                />
                            </div>
                            <div className="space-y-2.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Valor do Pagamento</label>
                                <div className="relative">
                                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">R$</span>
                                    <input
                                        type="number"
                                        value={payAmount}
                                        onChange={(e) => setPayAmount(Number(e.target.value))}
                                        className="w-full h-14 px-6 pl-12 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/5 focus:border-brand-500 focus:bg-white transition-all shadow-sm"
                                    />
                                </div>
                                <p className="mt-2 text-[10px] text-slate-400 font-bold ml-1">Total em aberto: {formatCurrency(statementOpen)}</p>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 pt-6">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isPaying}
                                className="w-full h-16 bg-white border border-slate-200 text-slate-500 font-bold rounded-2xl hover:bg-slate-50 hover:text-slate-900 transition-all uppercase text-xs tracking-widest active:scale-95 disabled:opacity-50 shadow-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={onSubmit}
                                disabled={isPaying || accounts.length === 0}
                                className="w-full h-16 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 shadow-lg shadow-black/5 transition-all active:scale-95 uppercase text-xs tracking-widest flex items-center justify-center gap-3 disabled:opacity-50"
                            >
                                {isPaying ? <Loader2 className="animate-spin" size={20} /> : <Landmark size={20} />}
                                Confirmar Pagamento
                            </button>
                        </div>

                        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">Importante</p>
                            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                Este pagamento será registrado como uma despesa na sua conta bancária selecionada e debitado do saldo do cartão.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
