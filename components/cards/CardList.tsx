import React from 'react';
import { CreditCard, CornerDownRight } from 'lucide-react';

interface CardListProps {
    cards: any[];
    selectedCardId: string | null;
    onSelectCard: (card: any) => void;
    getCardColor: (brand: string) => string;
    formatCurrency: (val: number) => string;
}

export const CardList: React.FC<CardListProps> = ({
    cards,
    selectedCardId,
    onSelectCard,
    getCardColor,
    formatCurrency
}) => {
    // Organize cards to show additional under their parents
    const mainCards = cards.filter((c) => !c.is_additional);
    const groupedCards: any[] = [];
    mainCards.forEach((main) => {
        groupedCards.push({ ...main, level: 0 });
        const children = cards.filter((c) => c.parent_card_id === main.id);
        children.forEach((child) => {
            groupedCards.push({ ...child, level: 1 });
        });
    });

    const getCardLogo = (brand: string) => {
        const b = brand.toLowerCase();
        const fallback = <CreditCard size={18} className="text-slate-400" />;

        if (b.includes('visa')) return <img src="https://www.vectorlogo.zone/logos/visa/visa-ar21.svg" className="h-3 object-contain" alt="Visa" onError={(e) => (e.currentTarget.style.display = 'none')} />;
        if (b.includes('master')) return <img src="https://www.vectorlogo.zone/logos/mastercard/mastercard-ar21.svg" className="h-5 object-contain" alt="Mastercard" onError={(e) => (e.currentTarget.style.display = 'none')} />;
        if (b.includes('amex')) return <img src="https://www.vectorlogo.zone/logos/amex/amex-ar21.svg" className="h-3 object-contain" alt="Amex" onError={(e) => (e.currentTarget.style.display = 'none')} />;

        return fallback;
    };

    return (
        <div className="flex flex-col gap-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2 px-2">Sua Carteira</h3>
            <div className="flex flex-row lg:flex-col gap-4 overflow-x-auto lg:overflow-visible pb-6 lg:pb-0 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory">
                {groupedCards.map((card) => (
                    <button
                        key={card.id}
                        onClick={() => onSelectCard(card)}
                        className={`min-w-[280px] sm:min-w-[320px] lg:min-w-0 text-left p-6 sm:p-8 rounded-[32px] border transition-all shrink-0 relative flex flex-col justify-between h-[190px] lg:h-auto snap-center ${selectedCardId === card.id
                            ? 'border-brand-500 bg-white shadow-2xl shadow-brand-500/10 ring-1 ring-brand-500/20'
                            : 'border-slate-100 bg-white hover:border-slate-200'
                            } ${card.level > 0 ? 'ml-0 lg:ml-8 scale-[0.98]' : ''}`}
                    >
                        {card.level > 0 && (
                            <div className="absolute -left-6 top-1/2 -translate-y-1/2 hidden lg:block text-slate-300">
                                <CornerDownRight size={20} />
                            </div>
                        )}
                        <div className="flex justify-between items-start mb-6">
                            <div className="bg-slate-50 p-2 py-2.5 rounded-lg flex items-center justify-center min-w-[45px]">
                                {getCardLogo(card.brand)}
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                                    **** {card.last4}
                                </p>
                                {card.level > 0 && (
                                    <p className="text-[8px] font-black text-brand-500 uppercase mt-1">Adicional</p>
                                )}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <h3 className="font-bold text-slate-900 text-base line-clamp-1 leading-tight">
                                    {card.name}
                                </h3>
                                {card.level > 0 && card.additional_label && (
                                    <p className="text-[10px] text-slate-400 font-medium truncate">
                                        {card.additional_label}
                                    </p>
                                )}
                            </div>
                            <div className="pt-3 border-t border-slate-50 flex justify-between items-end">
                                <div>
                                    <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-0.5">Limite Total</p>
                                    <p className="text-lg font-bold text-slate-900 leading-none tracking-tight">
                                        {formatCurrency(card.limit_total)}
                                    </p>
                                </div>
                                {selectedCardId === card.id && (
                                    <div className="w-2 h-2 rounded-full bg-brand-500 shadow-lg shadow-brand-500/50" />
                                )}
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};
