import { Transaction } from '../types';

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
        return new Date(d).toLocaleDateString('pt-BR');
    } catch {
        return d;
    }
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
    formatDateBR
};
