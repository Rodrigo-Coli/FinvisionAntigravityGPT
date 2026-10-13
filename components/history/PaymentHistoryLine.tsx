import React from 'react';
import { PaymentHistoryEntry, describeHistoryEvent, isPaymentEntry } from '../../lib/partialPayment';

interface PaymentHistoryLineProps {
    entry: PaymentHistoryEntry;
    formatCurrency: (val: number) => string;
    /** Classes da linha de pagamento (cada tela tem seu tamanho de fonte). */
    className?: string;
}

/**
 * Uma linha do "Histórico de Pagamentos": pagamento (data, conta e valor),
 * pagamento estornado ao reabrir (riscado) ou registro de alteração — conta,
 * data, valor ou reabertura — em âmbar, sem valor.
 */
export const PaymentHistoryLine: React.FC<PaymentHistoryLineProps> = ({ entry, formatCurrency, className = '' }) => {
    const day = entry.date ? new Date(String(entry.date).split(/[ T]/)[0] + 'T00:00:00').toLocaleDateString('pt-BR') : '-';

    if (!isPaymentEntry(entry)) {
        return (
            <div className={`text-amber-600 ${className}`}>
                {day} · {describeHistoryEvent(entry, formatCurrency)}
            </div>
        );
    }

    return (
        <div className={`flex justify-between items-center gap-4 ${entry.reversed ? 'opacity-60' : ''} ${className}`}>
            <span className={entry.reversed ? 'line-through' : ''}>{day} ({entry.account_name || 'Conta'})</span>
            <span className={entry.reversed ? 'line-through text-slate-400' : 'text-emerald-600 font-extrabold'}>
                {formatCurrency(entry.amount)}
            </span>
        </div>
    );
};
