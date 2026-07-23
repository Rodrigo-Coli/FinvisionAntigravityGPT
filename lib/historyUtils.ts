import { Transaction } from '../types'; import { DateUtils } from './dateUtils';

export const EPS = 0.000001;

export const getIsPaid = (t: Transaction) => Boolean((t as any).isPaid ?? false);

export const getRawPaidAmount = (t: Transaction) => Number((t as any).paidAmount ?? 0);

export const getAmount = (t: Transaction) => Math.max(Number(t.amount || 0), 0);

export const getPaidAmount = (t: Transaction) => {
    const isPaid = getIsPaid(t);
    const rawPaid = getRawPaidAmount(t);
    const amount = getAmount(t);

    if (isPaid) {
        return rawPaid > EPS ? Math.min(rawPaid, amount) : amount;
    }
    return Math.min(rawPaid, amount);
};

export const getRemaining = (t: Transaction) => {
    const isPaid = getIsPaid(t);
    const amount = getAmount(t);
    if (isPaid) return 0;
    const paid = getPaidAmount(t);
    return Math.max(amount - paid, 0);
};

export const getStatus = (t: Transaction): 'PENDING' | 'PARTIAL' | 'PAID' => {
    const amount = getAmount(t);
    const paid = getPaidAmount(t);
    const isPaid = getIsPaid(t);

    if (isPaid || paid >= amount - EPS) return 'PAID';
    if (paid > EPS) return 'PARTIAL';
    return 'PENDING';
};

export const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export const formatDateBR = (d?: string) => {
    if (!d) return '-';
    try {
        return DateUtils.formatDisplayDate(d);
    } catch {
        return d;
    }
};

// Mesma regra de fechamento/vencimento usada em services/finance.service.ts
// (getOrCreateStatement) para decidir a qual fatura uma compra pertence. Usada
// para saber em qual MÊS uma compra de cartão deve ser contabilizada (mês de
// vencimento da fatura), sem depender de já existir um card_statement salvo.
// Aritmética em UTC (sem `new Date(...).toISOString()`) para não sofrer
// deslocamento de fuso horário do navegador.
export const getCardCompetenceDate = (purchaseDateISO: string, closingDay: number, dueDay: number): string => {
    const datePart = purchaseDateISO.split('T')[0];
    const [yStr, mStr, dStr] = datePart.split('-');
    const day = parseInt(dStr, 10);
    let targetMonth = parseInt(mStr, 10) - 1; // 0-indexed
    let targetYear = parseInt(yStr, 10);

    if (day > closingDay) {
        targetMonth++;
        if (targetMonth > 11) { targetMonth = 0; targetYear++; }
    }

    let dueMonth = targetMonth;
    let dueYear = targetYear;
    if (dueDay < closingDay) {
        dueMonth++;
        if (dueMonth > 11) { dueMonth = 0; dueYear++; }
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    return `${dueYear}-${pad(dueMonth + 1)}-${pad(dueDay)}`;
};

// Mantendo o objeto HistoryUtils para compatibilidade de importação existente
export const HistoryUtils = {
    getIsPaid,
    getRawPaidAmount,
    getAmount,
    getPaidAmount,
    getRemaining,
    getStatus,
    formatCurrency,
    formatDateBR,
    getCardCompetenceDate
};
