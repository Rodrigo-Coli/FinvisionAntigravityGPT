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
        <div className="lg:col-span-1 flex flex-row lg:flex-col gap-4 overflow-x-auto lg:overflow-visible pb-4 lg:pb-0 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            {groupedCards.map((card) => (
                <button
                    key={card.id}
                    onClick={() => onSelectCard(card)}
                    className={`min-w-[280px] lg:min-w-0 text-left p-6 sm:p-8 rounded-[28px] sm:rounded-[36px] border-2 transition-all shrink-0 relative flex flex-col justify-between h-[200px] sm:h-[220px] lg:h-auto ${selectedCardId === card.id
                        ? 'border-brand-500 bg-white dark:bg-slate-800 shadow-xl shadow-brand-500/10'
                        : 'border-transparent bg-slate-50 dark:bg-slate-900 hover:border-slate-200 dark:hover:border-slate-700'
                        } ${card.level > 0 ? 'ml-0 lg:ml-8 scale-[0.98]' : ''}`}
                >
                    {card.level > 0 && (
                        <div className="absolute -left-6 top-1/2 -translate-y-1/2 hidden lg:block text-slate-300 dark:text-slate-600">
                            <CornerDownRight size={24} />
                        </div>
                    )}
                    <div className="flex justify-between items-start mb-6">
                        <div className={`w-12 h-8 sm:w-14 sm:h-9 ${getCardColor(card.brand)} rounded-lg shadow-inner flex items-center justify-center`}>
                            <CreditCard size={18} className="text-white opacity-50" />
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                {card.brand} {card.level > 0 ? '• ADICIONAL' : ''}
                            </p>
                            <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">**** {card.last4}</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-display font-black text-slate-900 dark:text-white text-lg sm:text-xl line-clamp-1 leading-tight">
                            {card.name}
                        </h3>
                        {card.level > 0 && card.additional_label && (
                            <p className="text-[10px] font-bold text-brand-600 dark:text-brand-400 uppercase tracking-tight -mt-3">
                                Portador: {card.additional_label}
                            </p>
                        )}
                        <div className="pt-4 border-t border-slate-100 dark:border-slate-700/50">
                            <p className="text-[10px] uppercase font-black text-slate-300 dark:text-slate-600 tracking-widest mb-1">Limite Total</p>
                            <p className="text-xl font-display font-black text-slate-900 dark:text-white leading-none">
                                {formatCurrency(card.limit_total)}
                            </p>
                        </div>
                    </div>
                </button>
            ))}
        </div>
    );
};
