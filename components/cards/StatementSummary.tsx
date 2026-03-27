import React from 'react';
import { Wallet, Landmark, ChevronRight, Calendar as CalendarIcon, Info, RefreshCw } from 'lucide-react';

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
        <div className="bg-white border border-slate-100 rounded-[32px] p-8 shadow-sm space-y-8 animate-in fade-in duration-500">
            {/* TOP INFO & ACTIONS */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex items-center gap-5">
                    <div className="w-16 h-16 rounded-[22px] bg-brand-900 flex items-center justify-center text-white shadow-xl shadow-slate-900/10">
                        <Wallet size={32} />
                    </div>
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Status da Fatura</h3>
                            {statementBadge}
                        </div>
                        <p className="text-2xl font-bold text-slate-900 tracking-tight">
                            {currentStatement?.month
                                ? `${String(currentStatement.month).padStart(2, '0')}/${currentStatement.year}`
                                : 'Período Atual'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <button
                        onClick={onRefresh}
                        className="flex-1 md:flex-none p-3.5 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-xl transition-all"
                        title="Atualizar"
                    >
                        <RefreshCw size={20} />
                    </button>
                    <button
                        onClick={onPay}
                        disabled={statementTotal <= 0 || statementOpen <= 0}
                        className={`flex-1 md:flex-grow-0 px-8 py-3.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all inline-flex items-center justify-center gap-2 ${statementTotal <= 0 || statementOpen <= 0
                            ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                            : 'bg-brand-600 text-white hover:bg-brand-700 shadow-lg shadow-brand-500/20 active:scale-95'
                            }`}
                    >
                        <Landmark size={16} />
                        Pagar Agora
                    </button>
                </div>
            </div>

            {/* AMOUNTS GRID (ZEN STYLE) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-slate-50 border border-slate-100 rounded-[24px] p-6 group">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 leading-none">Total Lançado</p>
                    <p className="text-3xl font-bold text-slate-900 tracking-tighter">{formatCurrency(statementTotal)}</p>
                </div>

                <div className="bg-white border border-slate-100 rounded-[24px] p-6">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-3 leading-none opacity-70">Total Pago</p>
                    <p className="text-3xl font-bold text-emerald-600 tracking-tighter">{formatCurrency(statementPaid)}</p>
                </div>

                <div className="bg-rose-50 border border-rose-100 rounded-[24px] p-6">
                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-600 mb-3 leading-none opacity-70">Pendente</p>
                    <p className="text-3xl font-bold text-rose-600 tracking-tighter">{formatCurrency(statementOpen)}</p>
                </div>
            </div>

            {/* DATES ROW */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-slate-50">
                <div className="flex-1 flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-slate-50">
                    <div className="flex items-center gap-3">
                        <CalendarIcon size={14} className="text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fechamento</span>
                    </div>
                    <span className="text-xs font-bold text-slate-900">{formatDateBR(currentStatement?.closing_date)}</span>
                </div>
                <div className="flex-1 flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-slate-50">
                    <div className="flex items-center gap-3">
                        <CalendarIcon size={14} className="text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vencimento</span>
                    </div>
                    <span className="text-xs font-bold text-slate-900">{formatDateBR(currentStatement?.due_date)}</span>
                </div>
            </div>

            {!currentStatement?.id && (
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center gap-4 text-blue-700">
                    <Info size={18} className="shrink-0" />
                    <p className="text-[11px] font-medium leading-relaxed">
                        Nenhuma fatura oficial foi detectada para este período. Exibindo lançamentos avulsos do mês.
                    </p>
                </div>
            )}
        </div>
    );
};
