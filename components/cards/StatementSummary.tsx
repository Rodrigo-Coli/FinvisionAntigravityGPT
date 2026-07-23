import React from 'react';
import { Wallet, Landmark, Calendar as CalendarIcon, Info, RefreshCw } from 'lucide-react';

interface StatementSummaryProps {
    currentStatement: any;
    statementTotal: number;
    statementPaid: number;
    statementOpen: number;
    formatCurrency: (val: number) => string;
    formatDateBR: (d?: string) => string;
    onRefresh: () => void;
    onPay: () => void;
    onReopen: () => void;
    statementBadge: React.ReactNode;
}

export const StatementSummary: React.FC<StatementSummaryProps> = ({
    currentStatement,
    statementTotal,
    statementPaid,
    statementOpen,
    formatCurrency: formatCurrencyRaw,
    formatDateBR,
    onRefresh,
    onPay,
    onReopen,
    statementBadge
}) => {
    // O Intl usa espaço "que não quebra" entre "R$" e o número; trocamos por espaço
    // normal pra permitir quebrar em duas linhas ("R$" / "1.600,00") quando o card
    // for estreito no celular — antes o valor era cortado com "…".
    const formatCurrency = (val: number) => formatCurrencyRaw(val).replace(/ /g, ' ');
    return (
        <div className="bg-white border border-slate-100 rounded-[24px] sm:rounded-[32px] p-5 sm:p-8 shadow-sm space-y-5 sm:space-y-8 animate-in fade-in duration-500">
            {/* TOP INFO & ACTIONS */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6">
                <div className="flex items-center gap-3.5 sm:gap-5">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-[16px] sm:rounded-[22px] bg-brand-900 flex items-center justify-center text-white shadow-xl shadow-slate-900/10 shrink-0">
                        <Wallet className="w-6 h-6 sm:w-8 sm:h-8" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5 sm:gap-3 mb-0.5 sm:mb-1">
                            <h3 className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Status da Fatura</h3>
                            {statementBadge}
                        </div>
                        <p className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-none">
                            {currentStatement?.month
                                ? `${String(currentStatement.month).padStart(2, '0')}/${currentStatement.year}`
                                : 'Período Atual'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-start sm:justify-end gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                    <button
                        onClick={onRefresh}
                        className="p-2.5 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-lg sm:rounded-xl transition-all h-9 w-9 sm:h-11 sm:w-11 flex items-center justify-center shrink-0"
                        title="Atualizar"
                    >
                        <RefreshCw size={16} />
                    </button>
                    <button
                        onClick={onPay}
                        disabled={statementTotal <= 0 || statementOpen <= 0}
                        className={`px-4 sm:px-6 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all inline-flex items-center justify-center gap-1.5 h-9 sm:h-11 ${statementTotal <= 0 || statementOpen <= 0
                            ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                            : 'bg-brand-600 text-white hover:bg-brand-700 shadow-lg shadow-brand-500/20 active:scale-95'
                            }`}
                    >
                        <Landmark size={12} />
                        Pagar Agora
                    </button>

                    {(currentStatement?.status === 'PAID' || (statementTotal > 0 && statementOpen === 0)) && (
                        <button
                            onClick={onReopen}
                            className="px-4 sm:px-6 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 h-9 sm:h-11 flex items-center justify-center"
                        >
                            Reabrir Fatura
                        </button>
                    )}
                </div>
            </div>

            {/* AMOUNTS GRID (ZEN STYLE COMPACT) */}
            <div className="grid grid-cols-3 gap-2 sm:gap-6">
                <div className="bg-slate-50 border border-slate-100 rounded-xl sm:rounded-[24px] p-3 sm:p-6 min-w-0">
                    <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 sm:mb-3 leading-none">
                        <span className="inline sm:hidden">Lançado</span>
                        <span className="hidden sm:inline">Total Lançado</span>
                    </p>
                    <p className="text-[11px] sm:text-3xl font-extrabold text-slate-900 tracking-tighter leading-tight break-words">{formatCurrency(statementTotal)}</p>
                </div>

                <div className="bg-white border border-slate-100 rounded-xl sm:rounded-[24px] p-3 sm:p-6 min-w-0">
                    <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-wider text-emerald-600 mb-1 sm:mb-3 leading-none opacity-70">
                        <span className="inline sm:hidden">Pago</span>
                        <span className="hidden sm:inline">Total Pago</span>
                    </p>
                    <p className="text-[11px] sm:text-3xl font-extrabold text-emerald-600 tracking-tighter leading-tight break-words">{formatCurrency(statementPaid)}</p>
                </div>

                <div className="bg-rose-50 border border-rose-100 rounded-xl sm:rounded-[24px] p-3 sm:p-6 min-w-0">
                    <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-wider text-rose-600 mb-1 sm:mb-3 leading-none opacity-70">
                        Pendente
                    </p>
                    <p className="text-[11px] sm:text-3xl font-extrabold text-rose-600 tracking-tighter leading-tight break-words">{formatCurrency(statementOpen)}</p>
                </div>
            </div>

            {/* DATES ROW */}
            <div className="flex flex-row gap-2 sm:gap-4 pt-3 sm:pt-4 border-t border-slate-50">
                <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-4 bg-slate-50/50 rounded-xl sm:rounded-2xl border border-slate-50/80 gap-1 min-w-0">
                    <div className="flex items-center gap-1.5 sm:gap-3">
                        <CalendarIcon size={12} className="text-slate-400 shrink-0" />
                        <span className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">Fechamento</span>
                    </div>
                    <span className="text-[10px] sm:text-xs font-bold text-slate-900 truncate">{formatDateBR(currentStatement?.closing_date)}</span>
                </div>
                <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-4 bg-slate-50/50 rounded-xl sm:rounded-2xl border border-slate-50/80 gap-1 min-w-0">
                    <div className="flex items-center gap-1.5 sm:gap-3">
                        <CalendarIcon size={12} className="text-slate-400 shrink-0" />
                        <span className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">Vencimento</span>
                    </div>
                    <span className="text-[10px] sm:text-xs font-bold text-slate-900 truncate">{formatDateBR(currentStatement?.due_date)}</span>
                </div>
            </div>

            {!currentStatement?.id && (
                <div className="p-3 sm:p-4 bg-blue-50 border border-blue-100 rounded-xl sm:rounded-2xl flex items-center gap-3 sm:gap-4 text-blue-700">
                    <Info size={16} className="shrink-0" />
                    <p className="text-[9px] sm:text-[11px] font-medium leading-relaxed">
                        Nenhuma fatura oficial foi detectada para este período. Exibindo lançamentos avulsos do mês.
                    </p>
                </div>
            )}
        </div>
    );
};
