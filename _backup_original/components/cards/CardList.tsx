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

    return (
        <div className="flex flex-row lg:flex-col gap-6 overflow-x-auto lg:overflow-visible pb-8 lg:pb-0 scrollbar-hide -mx-6 px-6 sm:mx-0 sm:px-0">
            {groupedCards.map((card) => (
                <button
                    key={card.id}
                    onClick={() => onSelectCard(card)}
                    className={`min-w-[300px] lg:min-w-0 text-left p-8 rounded-[40px] border transition-all shrink-0 relative flex flex-col justify-between h-[240px] sm:h-[260px] lg:h-auto group ${selectedCardId === card.id
                        ? 'border-slate-900 bg-white shadow-soft ring-1 ring-slate-900/5'
                        : 'border-slate-100 bg-slate-50/30 hover:bg-white hover:border-slate-200 shadow-sm'
                        } ${card.level > 0 ? 'ml-0 lg:ml-12 scale-[0.96]' : ''}`}
                >
                    {card.level > 0 && (
                        <div className="absolute -left-8 top-1/2 -translate-y-1/2 hidden lg:block text-slate-200">
                            <CornerDownRight size={24} />
                        </div>
                    )}
                    <div className="flex justify-between items-start mb-10">
                        <div className={`w-14 h-9 ${getCardColor(card.brand)} rounded-xl shadow-xl shadow-black/5 flex items-center justify-center relative overflow-hidden transition-transform group-hover:scale-105 duration-500`}>
                            <div className="absolute inset-0 bg-white/10" />
                            <CreditCard size={20} className="text-white relative z-10" />
                        </div>
                        <div className="text-right space-y-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] leading-none">
                                {card.brand}
                            </p>
                            <p className="text-sm font-bold text-slate-900 tracking-tighter opacity-40">**** {card.last4}</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-1.5">
                            <h3 className="font-bold text-slate-900 text-xl sm:text-2xl line-clamp-1 leading-none tracking-tight">
                                {card.name}
                            </h3>
                            {card.level > 0 && card.additional_label && (
                                <p className="text-[10px] font-bold text-brand-600 uppercase tracking-[0.2em]">
                                    Adicional • {card.additional_label}
                                </p>
                            )}
                        </div>
                        <div className="pt-6 border-t border-slate-100">
                            <p className="text-[10px] uppercase font-bold text-slate-300 tracking-[0.2em] mb-2 leading-none">Credit Line</p>
                            <p className="text-2xl font-black text-slate-900 tracking-tighter leading-none">
                                {formatCurrency(card.limit_total)}
                            </p>
                        </div>
                    </div>

                    {selectedCardId === card.id && (
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 w-1.5 h-12 bg-slate-900 rounded-full hidden lg:block" />
                    )}
                </button>
            ))}
        </div>
    );
};
