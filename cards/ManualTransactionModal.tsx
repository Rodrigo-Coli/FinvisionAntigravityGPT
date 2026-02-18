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
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                onClick={() => !isAnyModalBusy && onClose()}
            ></div>

            <div className="bg-white rounded-t-[32px] sm:rounded-[40px] w-full max-w-lg shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom sm:zoom-in duration-300">
                <div className="p-8 lg:p-10">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Novo Gasto</h2>
                        <button
                            onClick={() => !isAnyModalBusy && onClose()}
                            disabled={isAnyModalBusy}
                            className="p-3 text-slate-400 hover:bg-slate-100 rounded-2xl transition-all disabled:opacity-50"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Cartão de Destino</label>
                            <select
                                value={txCardId}
                                onChange={(e) => setTxCardId(e.target.value)}
                                className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all appearance-none cursor-pointer"
                            >
                                <option value="">Selecione um cartão...</option>
                                {cards.filter((c) => !c.is_archived).map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name} (**** {c.last4})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Data da Compra</label>
                                <input
                                    type="date"
                                    value={txDate}
                                    onChange={(e) => setTxDate(e.target.value)}
                                    className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Valor do Gasto</label>
                                <input
                                    type="number"
                                    value={txAmount}
                                    onChange={(e) => setTxAmount(Number(e.target.value))}
                                    placeholder="0,00"
                                    className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Descrição</label>
                            <input
                                type="text"
                                value={txDescription}
                                onChange={(e) => setTxDescription(e.target.value)}
                                placeholder="Ex: Uber / Mercado / Amazon..."
                                className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Categoria (Opcional)</label>
                            <select
                                value={txCategoryId}
                                onChange={(e) => setTxCategoryId(e.target.value)}
                                className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all appearance-none cursor-pointer"
                            >
                                <option value="">Sem categoria</option>
                                {categories.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isAnyModalBusy}
                                className="w-full h-14 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all uppercase text-xs tracking-widest active:scale-95 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={onSubmit}
                                className="w-full h-14 bg-brand-600 text-white font-black rounded-2xl hover:bg-brand-700 shadow-xl shadow-brand-500/30 transition-all active:scale-95 uppercase text-xs tracking-widest flex items-center justify-center gap-2"
                            >
                                <CheckCircle2 size={20} />
                                Lançar Gasto
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
