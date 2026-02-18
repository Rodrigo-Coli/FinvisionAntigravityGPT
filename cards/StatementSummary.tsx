import React from 'react';
import { Wallet, Landmark, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

interface StatementSummaryProps {
    currentStatement: any;
    statementTotal: number;
    statementPaid: number;
    statementOpen: number;
    formatCurrency: (val: number) => string;
    formatDateBR: (d?: string) => string;
    onRefresh: () => void;
    onPay: () => void;
    statementBadge: React.ReactNode;
}

export const StatementSummary: React.FC<StatementSummaryProps> = ({
    currentStatement,
    statementTotal,
    statementPaid,
    statementOpen,
    formatCurrency,
    formatDateBR,
    onRefresh,
    onPay,
    statementBadge
}) => {
    return (
        <div className="bg-white border border-slate-200/50 rounded-3xl p-6 lg:p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center shadow-inner">
                        <Wallet size={24} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Fatura atual</h3>
                            {statementBadge}
                        </div>
                        <p className="text-lg font-black text-slate-900">
                            {currentStatement?.reference_month ? `Referência: ${String(currentStatement.reference_month)}` : 'Nenhuma fatura aberta'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                        onClick={onRefresh}
                        className="flex-1 sm:flex-none px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        Atualizar
                    </button>

                    <button
                        onClick={onPay}
                        disabled={!currentStatement?.id || statementOpen <= 0}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-black border transition-all inline-flex items-center justify-center gap-2 ${!currentStatement?.id || statementOpen <= 0
                                ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                                : 'bg-brand-600 text-white border-brand-600 hover:bg-brand-700 shadow-lg shadow-brand-500/20 active:scale-95'
                            }`}
                    >
                        <Landmark size={14} />
                        Pagar
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total</p>
                    <p className="text-xl font-black text-slate-900">{formatCurrency(statementTotal)}</p>
                </div>

                <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600/70 mb-1">Pago</p>
                    <p className="text-xl font-black text-emerald-700">{formatCurrency(statementPaid)}</p>
                </div>

                <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-600/70 mb-1">Em aberto</p>
                    <p className="text-xl font-black text-rose-700">{formatCurrency(statementOpen)}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                            <CalendarIcon size={16} />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fechamento</p>
                    </div>
                    <p className="text-xs font-black text-slate-700">{formatDateBR(currentStatement?.closing_date)}</p>
                </div>

                <div className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-50 rounded-lg text-slate-400">
                            <CalendarIcon size={16} />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vencimento</p>
                    </div>
                    <p className="text-xs font-black text-slate-700">{formatDateBR(currentStatement?.due_date)}</p>
                </div>
            </div>

            {!currentStatement?.id && (
                <div className="mt-6 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center gap-3 text-amber-700">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm">
                        <span className="font-black text-xs">!</span>
                    </div>
                    <p className="text-xs font-bold">
                        Nenhuma fatura ativa. As transações exibidas são do histórico geral do cartão.
                    </p>
                </div>
            )}
        </div>
    );
};
