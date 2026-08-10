import React from 'react';
import { CreditCard, CornerDownRight, Star } from 'lucide-react';

interface CardListProps {
    cards: any[];
    selectedCardId: string | null;
    // true quando a tela está mostrando a soma consolidada (titular + adicionais)
    // do cartão ativo, em vez dos dados de um cartão específico.
    isCombinedView: boolean;
    // Clique no cartão do topo: entra na visão consolidada dessa família (ou vai
    // direto pro individual se o cartão não tiver adicionais).
    onSelectFamily: (mainCard: any) => void;
    // Clique num item da lista de baixo (titular ou adicional específico): mostra
    // só os dados daquele cartão.
    onSelectIndividual: (card: any) => void;
    getCardColor: (brand: string) => string;
    formatCurrency: (val: number) => string;
}

export const CardList: React.FC<CardListProps> = ({
    cards,
    selectedCardId,
    isCombinedView,
    onSelectFamily,
    onSelectIndividual,
    getCardColor,
    formatCurrency
}) => {
    // 1. Separate main cards from additional ones
    const mainCards = cards.filter((c) => !c.is_additional);

    // 2. Identify the active main card (if an additional is selected, find its parent)
    const selectedDirectCard = cards.find((c) => c.id === selectedCardId);
    const activeMainCardId = selectedDirectCard?.is_additional
        ? selectedDirectCard.parent_card_id
        : selectedCardId;

    // 3. Find additional cards linked to the active main card
    const activeAdditionalCards = cards.filter(
        (c) => c.is_additional && c.parent_card_id === activeMainCardId
    );
    // 4. Titular + adicionais, pra listar como opções individuais abaixo do consolidado
    const activeFamilyMembers = activeMainCardId
        ? [cards.find(c => c.id === activeMainCardId), ...activeAdditionalCards].filter(Boolean)
        : [];

    // 5. Desktop unified vertical stack. Cartão sem adicional: um item, clique =
    // individual direto. Cartão COM adicional: o item do topo é o consolidado
    // ("Tudo"), seguido do titular e de cada adicional como opções individuais.
    const groupedCardsDesktop: any[] = [];
    mainCards.forEach((main) => {
        const children = cards.filter((c) => c.parent_card_id === main.id);
        const hasChildren = children.length > 0;
        groupedCardsDesktop.push({ ...main, level: 0, mode: hasChildren ? 'family' : 'individual' });
        if (hasChildren) {
            groupedCardsDesktop.push({ ...main, level: 1, mode: 'individual', isTitularRow: true });
            children.forEach((child) => {
                groupedCardsDesktop.push({ ...child, level: 1, mode: 'individual' });
            });
        }
    });

    const getCardLogo = (brand: string, isSelected: boolean) => {
        return <CreditCard size={15} className={isSelected ? "text-white/60" : "text-slate-400"} />;
    };

    return (
        <div className="flex flex-col gap-3 w-full">
            <div className="px-1">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
                    Sua Carteira
                </h3>
            </div>

            {/* MOBILE VIEW (Compact Carousel + Contextual Vertical Additional Cards List) */}
            <div className="block lg:hidden space-y-4">
                {/* Horizontal main cards scroll */}
                <div className="flex flex-row gap-3 overflow-x-auto pb-3 scrollbar-hide -mx-4 px-4 snap-x snap-mandatory">
                    {mainCards.map((card) => {
                        const isSelected = activeMainCardId === card.id;
                        const additionalCount = cards.filter(c => c.parent_card_id === card.id).length;

                        return (
                            <button
                                key={card.id}
                                onClick={() => onSelectFamily(card)}
                                className={`min-w-[250px] text-left p-4 rounded-[20px] transition-all duration-300 shrink-0 relative flex flex-col justify-between h-[135px] snap-center border ${
                                    isSelected
                                        ? 'border-slate-900 bg-slate-900 text-white shadow-xl shadow-slate-950/20 scale-[1.01]'
                                        : 'border-slate-100 bg-white text-slate-900 hover:border-slate-200'
                                }`}
                            >
                                <div className="flex justify-between items-center w-full">
                                    <div className="flex items-center gap-2">
                                        <div className={`p-1 px-1.5 rounded-md flex items-center justify-center min-w-[38px] h-[22px] ${isSelected ? 'bg-white' : 'bg-slate-50'}`}>
                                            {getCardLogo(card.brand, isSelected)}
                                        </div>
                                        <span className={`text-[10px] font-mono tracking-widest leading-none ${isSelected ? 'text-white/60' : 'text-slate-400'}`}>
                                            •••• {card.last4}
                                        </span>
                                    </div>
                                    
                                    {additionalCount > 0 && (
                                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${isSelected ? 'bg-white/10 text-white/80' : 'bg-slate-100 text-slate-500'}`}>
                                            {additionalCount} {additionalCount === 1 ? 'Adicional' : 'Adicionais'}
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-1.5">
                                    <h4 className="font-bold text-xs truncate leading-tight flex items-center gap-1">
                                        {card.is_default && <Star size={11} className="text-amber-400 fill-amber-400 shrink-0" />}
                                        {card.name}
                                    </h4>
                                    <div className="pt-2 border-t flex justify-between items-end border-slate-100/10">
                                        <div>
                                            <p className={`text-[7px] font-black uppercase tracking-wider mb-0.5 ${isSelected ? 'text-white/40' : 'text-slate-300'}`}>
                                                Limite Total
                                            </p>
                                            <p className="text-sm font-extrabold tracking-tight">
                                                {formatCurrency(card.limit_total)}
                                            </p>
                                        </div>
                                        {isSelected && (
                                            <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shadow-md shadow-brand-500/50" />
                                        )}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Cartões da família (titular + adicionais) para ver cada um individualmente */}
                {activeAdditionalCards.length > 0 && (
                    <div className="bg-slate-50/50 border border-slate-100/70 rounded-2xl p-4 space-y-2.5 animate-in fade-in duration-300">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-0.5">
                            Ver Individualmente
                        </p>
                        <div className="space-y-2">
                            {activeFamilyMembers.map((member) => {
                                const isMemberSelected = !isCombinedView && selectedCardId === member.id;
                                return (
                                    <button
                                        key={member.id}
                                        onClick={() => onSelectIndividual(member)}
                                        className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left ${
                                            isMemberSelected
                                                ? 'bg-slate-900 border-slate-900 text-white shadow-md shadow-slate-950/20'
                                                : 'bg-white border-slate-100 hover:bg-slate-50 text-slate-900'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={isMemberSelected ? "text-white/50" : "text-slate-300"}>
                                                <CornerDownRight size={13} className="stroke-[2.5]" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h5 className={`font-bold text-xs truncate max-w-[130px] ${isMemberSelected ? 'text-white' : 'text-slate-800'}`}>
                                                        {member.name}
                                                    </h5>
                                                    <span className={`text-[7px] font-black px-1.5 py-0.2 rounded uppercase ${isMemberSelected ? 'bg-white/10 text-white' : member.is_additional ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-500'}`}>
                                                        {member.is_additional ? 'Adic' : 'Titular'}
                                                    </span>
                                                </div>
                                                {member.additional_label && (
                                                    <p className={`text-[9px] font-medium truncate mt-0.5 ${isMemberSelected ? 'text-white/50' : 'text-slate-400'}`}>
                                                        {member.additional_label}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <p className={`text-[9px] font-mono tracking-wider ${isMemberSelected ? 'text-white/50' : 'text-slate-400'}`}>
                                                •••• {member.last4}
                                            </p>
                                            <p className={`text-xs font-bold mt-0.5 ${isMemberSelected ? 'text-white' : 'text-slate-900'}`}>
                                                {formatCurrency(member.limit_total)}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* DESKTOP VIEW (Unified list with indentations) */}
            <div className="hidden lg:flex flex-col gap-3.5 overflow-visible">
                {groupedCardsDesktop.map((card) => {
                    const rowKey = card.isTitularRow ? `${card.id}-titular` : card.id;
                    const isSelected = card.mode === 'family'
                        ? (isCombinedView && activeMainCardId === card.id)
                        : (!isCombinedView && selectedCardId === card.id && !(card.isTitularRow && selectedCardId !== card.id));
                    const isAdditional = card.level > 0;

                    return (
                        <button
                            key={rowKey}
                            onClick={() => card.mode === 'family' ? onSelectFamily(card) : onSelectIndividual(card)}
                            className={`text-left p-5 rounded-[20px] border transition-all duration-300 relative flex flex-col justify-between h-auto min-w-0 ${
                                isSelected
                                    ? 'border-slate-900 bg-slate-900 text-white shadow-xl shadow-slate-950/20'
                                    : 'border-slate-100 bg-white hover:border-slate-200 text-slate-900'
                            } ${isAdditional ? 'ml-6 scale-[0.98]' : ''}`}
                        >
                            {isAdditional && (
                                <div className="absolute -left-5 top-1/2 -translate-y-1/2 text-slate-300">
                                    <CornerDownRight size={16} />
                                </div>
                            )}
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-1 px-1.5 rounded-md flex items-center justify-center min-w-[38px] h-[24px] ${isSelected ? 'bg-white' : 'bg-slate-50'}`}>
                                    {getCardLogo(card.brand, isSelected)}
                                </div>
                                <div className="text-right">
                                    <p className={`text-[10px] font-mono tracking-widest leading-none ${isSelected ? 'text-white/50' : 'text-slate-400'}`}>
                                        •••• {card.last4}
                                    </p>
                                    {card.mode === 'family' && card.level === 0 && cards.some((c: any) => c.parent_card_id === card.id) && (
                                        <p className={`text-[8px] font-black uppercase mt-1.5 ${isSelected ? 'text-violet-300' : 'text-violet-600'}`}>Tudo</p>
                                    )}
                                    {card.isTitularRow && (
                                        <p className={`text-[8px] font-black uppercase mt-1.5 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>Titular</p>
                                    )}
                                    {isAdditional && !card.isTitularRow && (
                                        <p className={`text-[8px] font-black uppercase mt-1.5 ${isSelected ? 'text-brand-300' : 'text-brand-600'}`}>Adicional</p>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div>
                                    <h3 className={`font-semibold text-sm line-clamp-1 leading-tight flex items-center gap-1 ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                                        {card.is_default && <Star size={12} className="text-amber-400 fill-amber-400 shrink-0" />}
                                        {card.name}
                                    </h3>
                                    {isAdditional && card.additional_label && (
                                        <p className={`text-[9px] font-medium truncate mt-0.5 ${isSelected ? 'text-white/50' : 'text-slate-400'}`}>
                                            {card.additional_label}
                                        </p>
                                    )}
                                </div>
                                <div className={`pt-2 border-t flex justify-between items-end ${isSelected ? 'border-white/10' : 'border-slate-100'}`}>
                                    <div>
                                        <p className={`text-[7px] font-black uppercase tracking-widest mb-0.5 ${isSelected ? 'text-white/40' : 'text-slate-400'}`}>Limite Total</p>
                                        <p className={`text-sm font-bold leading-none tracking-tight ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                                            {formatCurrency(card.limit_total)}
                                        </p>
                                    </div>
                                    {isSelected && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shadow-md shadow-brand-500/50" />
                                    )}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
