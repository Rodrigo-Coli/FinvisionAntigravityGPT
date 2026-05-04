import React from 'react';
import { X, CheckCircle2 } from 'lucide-react';

interface ManualTransactionModalProps {
    show: boolean;
    onClose: () => void;
    onSubmit: () => void;
    isAnyModalBusy: boolean;
    cards: any[];
    categories: { id: string; name: string }[];
    txCardId: string;
    setTxCardId: (v: string) => void;
    txDate: string;
    setTxDate: (v: string) => void;
    txAmount: number;
    setTxAmount: (v: number) => void;
    txDescription: string;
    setTxDescription: (v: string) => void;
    txCategoryId: string;
    setTxCategoryId: (v: string) => void;
}

export const ManualTransactionModal: React.FC<ManualTransactionModalProps> = ({
    show,
    onClose,
    onSubmit,
    isAnyModalBusy,
    cards,
    categories,
    txCardId,
    setTxCardId,
    txDate,
    setTxDate,
    txAmount,
    setTxAmount,
    txDescription,
    setTxDescription,
    txCategoryId,
    setTxCategoryId
}) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity animate-in fade-in duration-300"
                onClick={() => !isAnyModalBusy && onClose()}
            ></div>

            <div className="bg-white rounded-[40px] w-full max-w-xl shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-500">
                <div className="p-10 sm:p-12">
                    <div className="flex items-center justify-between mb-10">
                        <div className="space-y-1">
                            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Novo Lançamento</h2>
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Adicione um gasto manualmente</p>
                        </div>
                        <button
                            onClick={() => !isAnyModalBusy && onClose()}
                            disabled={isAnyModalBusy}
                            className="p-4 text-slate-400 hover:bg-slate-50 hover:text-slate-900 rounded-2xl transition-all disabled:opacity-50 border border-transparent hover:border-slate-100 shadow-sm"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    <div className="space-y-8">
                        <div className="space-y-2.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Cartão de Destino</label>
                            <div className="relative">
                                <select
                                    value={txCardId}
                                    onChange={(e) => setTxCardId(e.target.value)}
                                    className="w-full h-14 px-6 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/5 focus:border-brand-500 focus:bg-white transition-all appearance-none cursor-pointer shadow-sm"
                                >
                                    <option value="">Selecione um cartão...</option>
                                    {cards.filter((c) => !c.is_archived).map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name} (**** {c.last4})
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                    <div className="w-2.5 h-2.5 border-r-2 border-b-2 border-slate-400 rotate-45 mb-1" />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                            <div className="space-y-2.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Data da Compra</label>
                                <input
                                    type="date"
                                    value={txDate}
                                    onChange={(e) => setTxDate(e.target.value)}
                                    className="w-full h-14 px-6 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/5 focus:border-brand-500 focus:bg-white transition-all shadow-sm"
                                />
                            </div>
                            <div className="space-y-2.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Valor do Gasto</label>
                                <div className="relative">
                                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">R$</span>
                                    <input
                                        type="number"
                                        value={txAmount}
                                        onChange={(e) => setTxAmount(Number(e.target.value))}
                                        placeholder="0,00"
                                        className="w-full h-14 px-6 pl-12 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/5 focus:border-brand-500 focus:bg-white transition-all placeholder:text-slate-300 shadow-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Descrição</label>
                            <input
                                type="text"
                                value={txDescription}
                                onChange={(e) => setTxDescription(e.target.value)}
                                placeholder="Ex: Uber / Mercado / Amazon..."
                                className="w-full h-14 px-6 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/5 focus:border-brand-500 focus:bg-white transition-all placeholder:text-slate-300 shadow-sm"
                            />
                        </div>

                        <div className="space-y-2.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Categoria (Opcional)</label>
                            <div className="relative">
                                <select
                                    value={txCategoryId}
                                    onChange={(e) => setTxCategoryId(e.target.value)}
                                    className="w-full h-14 px-6 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/5 focus:border-brand-500 focus:bg-white transition-all appearance-none cursor-pointer shadow-sm"
                                >
                                    <option value="">Sem categoria</option>
                                    {categories.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                    <div className="w-2.5 h-2.5 border-r-2 border-b-2 border-slate-400 rotate-45 mb-1" />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 pt-6">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isAnyModalBusy}
                                className="w-full h-16 bg-white border border-slate-200 text-slate-500 font-bold rounded-2xl hover:bg-slate-50 hover:text-slate-900 transition-all uppercase text-xs tracking-widest active:scale-95 disabled:opacity-50 shadow-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={onSubmit}
                                className="w-full h-16 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 shadow-lg shadow-black/5 transition-all active:scale-95 uppercase text-xs tracking-widest flex items-center justify-center gap-3"
                            >
                                <CheckCircle2 size={20} />
                                Registrar Gasto
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
