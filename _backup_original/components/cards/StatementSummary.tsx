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
        <div className="bg-white rounded-[40px] p-10 sm:p-14 border border-slate-100 shadow-soft animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-10 mb-14">
                <div className="flex items-center gap-8">
                    <div className="w-20 h-20 rounded-[28px] bg-slate-900 text-white flex items-center justify-center shadow-2xl shadow-black/10">
                        <Wallet size={36} strokeWidth={1.5} />
                    </div>
                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-4">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Statement Life Cycle</h3>
                            <div className="transform scale-90 origin-left">{statementBadge}</div>
                        </div>
                        <p className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-none">
                            {currentStatement?.reference_month ? currentStatement.reference_month : 'Histórico Consolidado'}
                        </p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-5">
                    <button
                        onClick={onRefresh}
                        className="w-full sm:w-auto px-8 py-5 bg-white border border-slate-100 rounded-[22px] text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 hover:text-slate-900 hover:border-slate-300 transition-all active:scale-95"
                    >
                        Force Sync
                    </button>

                    <button
                        onClick={onPay}
                        disabled={!currentStatement?.id || statementOpen <= 0}
                        className={`w-full sm:w-auto px-10 py-5 rounded-[22px] text-[10px] font-bold uppercase tracking-[0.3em] border transition-all inline-flex items-center justify-center gap-4 ${!currentStatement?.id || statementOpen <= 0
                            ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed opacity-60'
                            : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800 shadow-xl shadow-black/5 active:scale-95'
                            }`}
                    >
                        <Landmark size={20} />
                        Transfer Balance
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-14">
                {[
                    { label: 'Total Lançado', val: statementTotal, color: 'slate' },
                    { label: 'Total Pago', val: statementPaid, color: 'emerald' },
                    { label: 'A Pagar', val: statementOpen, color: 'rose' }
                ].map((stat, idx) => (
                    <div key={idx} className={`p-10 rounded-[32px] border transition-all hover:shadow-soft flex flex-col justify-between min-h-[180px] group ${stat.color === 'emerald' ? 'bg-emerald-50/20 border-emerald-100 focus-within:border-emerald-300' : stat.color === 'rose' ? 'bg-rose-50/20 border-rose-100' : 'bg-slate-50/30 border-slate-100'}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-[0.2em] mb-6 ${stat.color === 'emerald' ? 'text-emerald-600/60' : stat.color === 'rose' ? 'text-rose-600/60' : 'text-slate-400'}`}>{stat.label}</p>
                        <p className={`text-3xl font-black tracking-tighter ${stat.color === 'emerald' ? 'text-emerald-600' : stat.color === 'rose' ? 'text-rose-600' : 'text-slate-900'}`}>{formatCurrency(stat.val)}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                {[
                    { label: 'Closing Date', val: currentStatement?.closing_date, icon: <CalendarIcon size={18} /> },
                    { label: 'Due Date', val: currentStatement?.due_date, icon: <CalendarIcon size={18} /> }
                ].map((item, idx) => (
                    <div key={idx} className="bg-slate-50/30 border border-slate-100 rounded-[28px] p-8 flex items-center justify-between group hover:bg-white hover:border-slate-200 transition-all">
                        <div className="flex items-center gap-5">
                            <div className="w-12 h-12 bg-white text-slate-300 rounded-2xl flex items-center justify-center shadow-sm group-hover:text-slate-900 transition-colors">
                                {item.icon}
                            </div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{item.label}</p>
                        </div>
                        <p className="text-base font-bold text-slate-900 tracking-tight pr-2">{formatDateBR(item.val)}</p>
                    </div>
                ))}
            </div>

            {!currentStatement?.id && (
                <div className="mt-14 p-10 bg-slate-900 rounded-[40px] border border-slate-800 flex items-start gap-8 text-white relative overflow-hidden group">
                    <div className="w-20 h-20 bg-white/10 text-white rounded-[24px] flex items-center justify-center shadow-sm shrink-0 backdrop-blur-md">
                        <Info size={32} />
                    </div>
                    <div className="space-y-4 relative z-10">
                        <h4 className="text-xl font-bold tracking-tight">Scope Consolidado</h4>
                        <p className="text-slate-400 font-medium leading-relaxed max-w-xl">
                            Nenhuma fatura isolada foi detectada. A visualização abaixo compila todas as transações históricas indexadas a este cartão.
                        </p>
                    </div>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
                </div>
            )}
        </div>
    );
};
