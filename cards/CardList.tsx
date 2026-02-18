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
        <div className="lg:col-span-1 flex flex-row lg:flex-col gap-4 overflow-x-auto lg:overflow-visible pb-4 lg:pb-0 scrollbar-hide">
            {groupedCards.map((card) => (
                <button
                    key={card.id}
                    onClick={() => onSelectCard(card)}
                    className={`min-w-[280px] lg:min-w-0 text-left p-5 lg:p-6 rounded-2xl border-2 transition-all shrink-0 relative ${selectedCardId === card.id
                            ? 'border-brand-500 bg-white shadow-lg'
                            : 'border-transparent bg-white hover:border-slate-100 shadow-sm'
                        } ${card.level > 0 ? 'ml-0 lg:ml-6 scale-[0.98]' : ''}`}
                >
                    {card.level > 0 && (
                        <div className="absolute -left-5 top-1/2 -translate-y-1/2 hidden lg:block text-slate-300">
                            <CornerDownRight size={20} />
                        </div>
                    )}
                    <div className="flex justify-between items-start mb-4">
                        <div className={`w-10 h-7 ${getCardColor(card.brand)} rounded shadow-sm flex items-center justify-center`}>
                            <CreditCard size={14} className="text-white opacity-40" />
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                                {card.brand} {card.level > 0 ? '• ADICIONAL' : ''}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono">**** {card.last4}</p>
                        </div>
                    </div>
                    <h3 className="font-bold text-slate-900 mb-1 line-clamp-1">
                        {card.name} {card.level > 0 && card.additional_label ? `(${card.additional_label})` : ''}
                    </h3>
                    <div className="mt-4">
                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Limite Total</p>
                        <p className="text-lg font-black text-slate-900 leading-none">{formatCurrency(card.limit_total)}</p>
                    </div>
                </button>
            ))}
        </div>
    );
};
