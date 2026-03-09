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
    title?: string;
    buttonLabel?: string;
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
    setAdditionalLabel,
    title = "Novo Cartão",
    buttonLabel = "Salvar Cartão"
}) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                onClick={() => !isAnyModalBusy && onClose()}
            ></div>
            <div className="bg-white rounded-t-[32px] sm:rounded-[40px] w-full max-w-lg shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom sm:zoom-in duration-300">
                <div className="p-8 lg:p-10">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h2>
                        <button
                            onClick={() => !isAnyModalBusy && onClose()}
                            disabled={isAnyModalBusy}
                            className="p-3 text-slate-400 hover:bg-slate-100 rounded-2xl transition-all disabled:opacity-50"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    <form onSubmit={onSubmit} className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Apelido do Cartão</label>
                                <input
                                    type="text"
                                    required
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Ex: Santander Black"
                                    className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Bandeira</label>
                                <select
                                    value={newBrand}
                                    onChange={(e) => setNewBrand(e.target.value)}
                                    className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all appearance-none cursor-pointer"
                                >
                                    <option value="Visa">Visa</option>
                                    <option value="Mastercard">Mastercard</option>
                                    <option value="Elo">Elo</option>
                                    <option value="Amex">American Express</option>
                                    <option value="Outro">Outro</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Finais 4 dígitos</label>
                                <input
                                    type="text"
                                    maxLength={4}
                                    required
                                    value={newLast4}
                                    onChange={(e) => setNewLast4(e.target.value.replace(/\D/g, ''))}
                                    placeholder="0000"
                                    className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Limite Total</label>
                                <input
                                    type="number"
                                    required
                                    value={newLimit}
                                    onChange={(e) => setNewLimit(Number(e.target.value))}
                                    className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Fechamento</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={31}
                                        required
                                        value={newClosingDay}
                                        onChange={(e) => setNewClosingDay(Number(e.target.value))}
                                        className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all text-center"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Vencimento</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={31}
                                        required
                                        value={newDueDay}
                                        onChange={(e) => setNewDueDay(Number(e.target.value))}
                                        className="w-full h-14 px-5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all text-center"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={isAdditional}
                                    onChange={(e) => setIsAdditional(e.target.checked)}
                                    className="w-6 h-6 rounded-lg border-slate-300 text-brand-600 focus:ring-brand-500 transition-all"
                                />
                                <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Este é um cartão adicional?</span>
                            </label>

                            {isAdditional && (
                                <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Tititular Principal</label>
                                        <select
                                            required={isAdditional}
                                            value={parentCardId}
                                            onChange={(e) => setParentCardId(e.target.value)}
                                            className="w-full h-14 px-5 bg-white border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all appearance-none cursor-pointer"
                                        >
                                            <option value="">Selecione o titular...</option>
                                            {cards.filter((c) => !c.is_additional).map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name} (**** {c.last4})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Nome no Cartão</label>
                                        <input
                                            type="text"
                                            required={isAdditional}
                                            value={additionalLabel}
                                            onChange={(e) => setAdditionalLabel(e.target.value)}
                                            placeholder="Identificação do portador"
                                            className="w-full h-14 px-5 bg-white border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all placeholder:text-slate-300"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isAnyModalBusy}
                                className="w-full h-14 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all uppercase text-xs tracking-widest disabled:opacity-50 active:scale-95"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="w-full h-14 bg-brand-600 text-white font-black rounded-2xl hover:bg-brand-700 shadow-xl shadow-brand-500/30 transition-all active:scale-95 uppercase text-xs tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                                {buttonLabel}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
