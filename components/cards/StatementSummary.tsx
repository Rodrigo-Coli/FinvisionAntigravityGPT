import React from 'react';
import { Wallet, Landmark, ChevronRight, Calendar as CalendarIcon, Info } from 'lucide-react';

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
        <div className="bg-slate-50/50 dark:bg-slate-900/50 rounded-[32px] p-6 sm:p-8 border border-slate-100 dark:border-slate-800 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-6 mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-brand-600 text-white flex items-center justify-center shadow-lg shadow-brand-500/20">
                        <Wallet size={28} />
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Fatura atual</h3>
                            {statementBadge}
                        </div>
                        <p className="text-xl font-display font-black text-slate-900 dark:text-white mt-0.5">
                            {currentStatement?.reference_month
                                ? `Referência: ${String(currentStatement.reference_month)}`
                                : currentStatement?.month
                                    ? `Referência: ${String(currentStatement.month).padStart(2, '0')}/${currentStatement.year}`
                                    : 'Nenhuma fatura aberta'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                        onClick={onRefresh}
                        className="flex-1 sm:flex-none px-6 py-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                    >
                        Atualizar
                    </button>

                    <button
                        onClick={onPay}
                        disabled={statementTotal <= 0 || statementOpen <= 0}
                        className={`flex-1 sm:flex-none px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all inline-flex items-center justify-center gap-2 ${statementTotal <= 0 || statementOpen <= 0
                            ? 'bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 border-slate-100 dark:border-slate-700 cursor-not-allowed opacity-50'
                            : 'bg-brand-600 text-white border-brand-600 hover:bg-brand-700 shadow-xl shadow-brand-500/20 active:scale-95'
                            }`}
                    >
                        <Landmark size={14} />
                        Pagar Agora
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-white dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Total Lançado</p>
                    <p className="text-2xl font-display font-black text-slate-900 dark:text-white">{formatCurrency(statementTotal)}</p>
                </div>

                <div className="bg-emerald-50/30 dark:bg-emerald-500/5 border border-emerald-100/50 dark:border-emerald-500/10 rounded-2xl p-5 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600/70 dark:text-emerald-500/70 mb-2">Total Pago</p>
                    <p className="text-2xl font-display font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(statementPaid)}</p>
                </div>

                <div className="bg-rose-50/30 dark:bg-rose-500/5 border border-rose-100/50 dark:border-rose-500/10 rounded-2xl p-5 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-600/70 dark:text-rose-500/70 mb-2">Pendente</p>
                    <p className="text-2xl font-display font-black text-rose-600 dark:text-rose-400">{formatCurrency(statementOpen)}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white/50 dark:bg-slate-800/20 border border-slate-100/50 dark:border-slate-700/50 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl text-slate-400 dark:text-slate-500 shadow-inner">
                            <CalendarIcon size={16} />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Fechamento</p>
                    </div>
                    <p className="text-xs font-black text-slate-700 dark:text-slate-300 pr-2">{formatDateBR(currentStatement?.closing_date)}</p>
                </div>

                <div className="bg-white/50 dark:bg-slate-800/20 border border-slate-100/50 dark:border-slate-700/50 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl text-slate-400 dark:text-slate-500 shadow-inner">
                            <CalendarIcon size={16} />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Vencimento</p>
                    </div>
                    <p className="text-xs font-black text-slate-700 dark:text-slate-300 pr-2">{formatDateBR(currentStatement?.due_date)}</p>
                </div>
            </div>

            {!currentStatement?.id && (
                <div className="mt-8 p-6 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-[24px] flex items-center gap-4 text-amber-700 dark:text-amber-400">
                    <div className="w-10 h-10 rounded-full bg-white dark:bg-amber-500/20 flex items-center justify-center shadow-sm">
                        <Info size={20} />
                    </div>
                    <p className="text-xs font-medium leading-relaxed">
                        Nenhuma fatura ativa detectada para este período. As transações exibidas refletem o histórico geral do cartão nesta conta.
                    </p>
                </div>
            )}
        </div>
    );
};
