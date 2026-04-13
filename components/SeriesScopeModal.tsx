
import React from 'react';
import { AlertCircle, Calendar, Layers, RefreshCcw } from 'lucide-react';

export type SeriesScope = 'ONLY_THIS' | 'THIS_AND_FUTURE' | 'ALL';

interface SeriesScopeModalProps {
    show: boolean;
    onClose: () => void;
    onConfirm: (scope: SeriesScope) => void;
    title: string;
    actionLabel: string;
    type: 'RECURRING' | 'INSTALLMENT';
}

export const SeriesScopeModal: React.FC<SeriesScopeModalProps> = ({
    show,
    onClose,
    onConfirm,
    title,
    actionLabel,
    type
}) => {
    if (!show) return null;

    const isRecurring = type === 'RECURRING';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden border border-slate-100 flex flex-col animate-in zoom-in-95 duration-300">
                <div className="p-8 space-y-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500">
                            <AlertCircle size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 leading-tight">{title}</h3>
                            <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mt-1">Série de {isRecurring ? 'Recorrência' : 'Parcelamento'}</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <p className="text-slate-500 text-sm font-medium leading-relaxed">
                            Esta transação faz parte de uma série. Como você deseja aplicar esta alteração?
                        </p>

                        <div className="grid gap-3 pt-2">
                            <button
                                onClick={() => onConfirm('ONLY_THIS')}
                                className="group flex items-center gap-4 p-4 rounded-2xl border border-slate-100 hover:border-brand-200 hover:bg-brand-50/50 transition-all text-left"
                            >
                                <div className="w-10 h-10 bg-slate-50 group-hover:bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-brand-500 transition-colors">
                                    <Calendar size={20} />
                                </div>
                                <div>
                                    <p className="text-sm font-black text-slate-700 group-hover:text-brand-600 transition-colors">Apenas esta instância</p>
                                    <p className="text-[10px] text-slate-400 font-medium">Altera somente o lançamento selecionado.</p>
                                </div>
                            </button>

                            <button
                                onClick={() => onConfirm('THIS_AND_FUTURE')}
                                className="group flex items-center gap-4 p-4 rounded-2xl border border-slate-100 hover:border-brand-200 hover:bg-brand-50/50 transition-all text-left"
                            >
                                <div className="w-10 h-10 bg-slate-50 group-hover:bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-brand-500 transition-colors">
                                    <RefreshCcw size={20} />
                                </div>
                                <div>
                                    <p className="text-sm font-black text-slate-700 group-hover:text-brand-600 transition-colors">Esta e as próximas</p>
                                    <p className="text-[10px] text-slate-400 font-medium">Altera esta e todas as parcelas/recorrências futuras.</p>
                                </div>
                            </button>

                            <button
                                onClick={() => onConfirm('ALL')}
                                className="group flex items-center gap-4 p-4 rounded-2xl border border-slate-100 hover:border-brand-200 hover:bg-brand-50/50 transition-all text-left"
                            >
                                <div className="w-10 h-10 bg-slate-50 group-hover:bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-brand-500 transition-colors">
                                    <Layers size={20} />
                                </div>
                                <div>
                                    <p className="text-sm font-black text-slate-700 group-hover:text-brand-600 transition-colors">Toda a série</p>
                                    <p className="text-[10px] text-slate-400 font-medium">Altera todos os lançamentos vinculados a esta série.</p>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-6 bg-slate-50 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-500 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};
