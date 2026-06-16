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
    payAmount: number | string;
    setPayAmount: (v: number | string) => void;
    getAccountLabel: (a: any) => string;
    onRedirectToAccounts?: () => void;
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
    getAccountLabel,
    onRedirectToAccounts
}) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-brand-900/60 backdrop-blur-sm" onClick={() => !isPaying && onClose()}></div>

            <div className="bg-white rounded-t-[32px] sm:rounded-[40px] w-full max-w-lg shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom sm:zoom-in duration-300">
                <div className="p-8 lg:p-10">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Pagar Fatura</h2>
                            <p className="text-sm text-slate-500 font-bold mt-1">
                                {selectedCardName} • Restante: <span className="text-rose-600">{formatCurrency(statementOpen)}</span>
                            </p>
                        </div>
                        <button
                            onClick={() => !isPaying && onClose()}
                            className="p-3 text-slate-400 hover:bg-slate-100 rounded-2xl transition-all disabled:opacity-50"
                            disabled={isPaying}
                        >
                            <X size={24} />
                        </button>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Pagar usando a Conta</label>
                            <select
                                value={payAccountId}
                                onChange={(e) => setPayAccountId(e.target.value)}
                                className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all appearance-none cursor-pointer"
                            >
                                <option value="">Selecione sua conta...</option>
                                {accounts.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {getAccountLabel(a)}
                                    </option>
                                ))}
                            </select>
                            {accounts.length === 0 && (
                                <div className="mt-3 p-4 bg-amber-50 text-amber-700 rounded-xl text-xs font-bold border border-amber-100 space-y-2.5">
                                    <p>⚠️ Nenhuma conta ativa encontrada. Cadastre uma conta bancária primeiro.</p>
                                    {onRedirectToAccounts && (
                                        <button
                                            type="button"
                                            onClick={onRedirectToAccounts}
                                            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors font-bold uppercase tracking-wider text-[10px]"
                                        >
                                            Cadastrar Conta Bancária
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Data do Pagamento</label>
                                <input
                                    type="date"
                                    value={payDate}
                                    onChange={(e) => setPayDate(e.target.value)}
                                    className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Valor do Pagamento</label>
                                <input
                                    type="number"
                                    value={payAmount}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setPayAmount(val === '' ? '' : Number(val));
                                    }}
                                    className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all"
                                />
                                <p className="mt-2 text-[10px] text-slate-400 font-bold ml-1 italic">Total em aberto: {formatCurrency(statementOpen)}</p>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isPaying}
                                className="w-full h-14 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all uppercase text-xs tracking-widest active:scale-95 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={onSubmit}
                                disabled={isPaying || accounts.length === 0}
                                className="w-full h-14 bg-brand-600 text-white font-black rounded-2xl hover:bg-brand-700 shadow-xl shadow-brand-500/30 transition-all active:scale-95 uppercase text-xs tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isPaying ? <Loader2 className="animate-spin" size={20} /> : <Landmark size={20} />}
                                Confirmar Pagamento
                            </button>
                        </div>

                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 italic">
                            <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                                Nota: Este pagamento será registrado como uma despesa na sua conta bancária selecionada e debitado do saldo do cartão.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
