import React from 'react';
import { X, Loader2, CheckCircle2 } from 'lucide-react';

interface AddCardModalProps {
    show: boolean;
    onClose: () => void;
    onSubmit: (e: React.FormEvent) => void;
    isSaving: boolean;
    isAnyModalBusy: boolean;
    cards: any[];
    newName: string;
    setNewName: (v: string) => void;
    newBrand: string;
    setNewBrand: (v: string) => void;
    newLast4: string;
    setNewLast4: (v: string) => void;
    newLimit: number;
    setNewLimit: (v: number) => void;
    newClosingDay: number;
    setNewClosingDay: (v: number) => void;
    newDueDay: number;
    setNewDueDay: (v: number) => void;
    isAdditional: boolean;
    setIsAdditional: (v: boolean) => void;
    parentCardId: string;
    setParentCardId: (v: string) => void;
    additionalLabel: string;
    setAdditionalLabel: (v: string) => void;
}

export const AddCardModal: React.FC<AddCardModalProps> = ({
    show,
    onClose,
    onSubmit,
    isSaving,
    isAnyModalBusy,
    cards,
    newName,
    setNewName,
    newBrand,
    setNewBrand,
    newLast4,
    setNewLast4,
    newLimit,
    setNewLimit,
    newClosingDay,
    setNewClosingDay,
    newDueDay,
    setNewDueDay,
    isAdditional,
    setIsAdditional,
    parentCardId,
    setParentCardId,
    additionalLabel,
    setAdditionalLabel
}) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity animate-in fade-in duration-300"
                onClick={() => !isAnyModalBusy && onClose()}
            ></div>
            <div className="bg-white rounded-[40px] w-full max-w-xl shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-500">
                <div className="p-10 sm:p-12">
                    <div className="flex items-center justify-between mb-10">
                        <div className="space-y-1">
                            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Novo Cartão</h2>
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Configure sua conta de crédito</p>
                        </div>
                        <button
                            onClick={() => !isAnyModalBusy && onClose()}
                            disabled={isAnyModalBusy}
                            className="p-4 text-slate-400 hover:bg-slate-50 hover:text-slate-900 rounded-2xl transition-all disabled:opacity-50 border border-transparent hover:border-slate-100 shadow-sm"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    <form onSubmit={onSubmit} className="space-y-10">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                            <div className="sm:col-span-2 space-y-2.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Apelido do Cartão</label>
                                <input
                                    type="text"
                                    required
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Ex: Santander Black"
                                    className="w-full h-14 px-6 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/5 focus:border-brand-500 focus:bg-white transition-all placeholder:text-slate-300 shadow-sm"
                                />
                            </div>
                            <div className="space-y-2.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Bandeira</label>
                                <div className="relative">
                                    <select
                                        value={newBrand}
                                        onChange={(e) => setNewBrand(e.target.value)}
                                        className="w-full h-14 px-6 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/5 focus:border-brand-500 focus:bg-white transition-all appearance-none cursor-pointer shadow-sm"
                                    >
                                        <option value="Visa">Visa</option>
                                        <option value="Mastercard">Mastercard</option>
                                        <option value="Elo">Elo</option>
                                        <option value="Amex">American Express</option>
                                        <option value="Outro">Outro</option>
                                    </select>
                                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                        <Loader2 size={16} className="animate-spin hidden" />
                                        <div className="w-2.5 h-2.5 border-r-2 border-b-2 border-slate-400 rotate-45 mb-1" />
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Final do Cartão</label>
                                <input
                                    type="text"
                                    maxLength={4}
                                    required
                                    value={newLast4}
                                    onChange={(e) => setNewLast4(e.target.value.replace(/\D/g, ''))}
                                    placeholder="0000"
                                    className="w-full h-14 px-6 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/5 focus:border-brand-500 focus:bg-white transition-all placeholder:text-slate-300 shadow-sm text-center tracking-[0.2em]"
                                />
                            </div>
                            <div className="space-y-2.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Limite Total</label>
                                <div className="relative">
                                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">R$</span>
                                    <input
                                        type="number"
                                        required
                                        value={newLimit}
                                        onChange={(e) => setNewLimit(Number(e.target.value))}
                                        className="w-full h-14 px-6 pl-12 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/5 focus:border-brand-500 focus:bg-white transition-all shadow-sm"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2.5">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Melhor Dia</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={31}
                                        required
                                        value={newClosingDay}
                                        onChange={(e) => setNewClosingDay(Number(e.target.value))}
                                        className="w-full h-14 px-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/5 focus:border-brand-500 focus:bg-white transition-all text-center shadow-sm"
                                    />
                                </div>
                                <div className="space-y-2.5">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Vencimento</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={31}
                                        required
                                        value={newDueDay}
                                        onChange={(e) => setNewDueDay(Number(e.target.value))}
                                        className="w-full h-14 px-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/5 focus:border-brand-500 focus:bg-white transition-all text-center shadow-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-8 bg-slate-50 border border-slate-100 rounded-[32px] space-y-6 transition-all hover:border-slate-200">
                            <label className="flex items-center gap-4 cursor-pointer group">
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        checked={isAdditional}
                                        onChange={(e) => setIsAdditional(e.target.checked)}
                                        className="peer sr-only"
                                    />
                                    <div className="w-12 h-6 bg-slate-200 rounded-full transition-all peer-checked:bg-brand-600"></div>
                                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-all peer-checked:left-7"></div>
                                </div>
                                <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Este é um cartão adicional?</span>
                            </label>

                            {isAdditional && (
                                <div className="space-y-6 pt-4 border-t border-slate-200/50 animate-in fade-in slide-in-from-top-4 duration-500">
                                    <div className="space-y-2.5">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Titular Principal</label>
                                        <div className="relative">
                                            <select
                                                required={isAdditional}
                                                value={parentCardId}
                                                onChange={(e) => setParentCardId(e.target.value)}
                                                className="w-full h-14 px-6 bg-white border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/5 focus:border-brand-500 transition-all appearance-none cursor-pointer shadow-sm"
                                            >
                                                <option value="">Selecione o titular...</option>
                                                {cards.filter((c) => !c.is_additional).map((c) => (
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
                                    <div className="space-y-2.5">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Nome no Cartão</label>
                                        <input
                                            type="text"
                                            required={isAdditional}
                                            value={additionalLabel}
                                            onChange={(e) => setAdditionalLabel(e.target.value)}
                                            placeholder="Nome do portador"
                                            className="w-full h-14 px-6 bg-white border border-slate-200 rounded-2xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-brand-500/5 focus:border-brand-500 transition-all placeholder:text-slate-300 shadow-sm"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 pt-6">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isAnyModalBusy}
                                className="w-full h-16 bg-white border border-slate-200 text-slate-500 font-bold rounded-2xl hover:bg-slate-50 hover:text-slate-900 transition-all uppercase text-xs tracking-widest disabled:opacity-50 active:scale-95 shadow-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="w-full h-16 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 shadow-lg shadow-black/5 transition-all active:scale-95 uppercase text-xs tracking-widest flex items-center justify-center gap-3 disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                                Finalizar Cadastro
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
