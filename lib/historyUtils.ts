import { Transaction } from '../types';

export const EPS = 0.000001;

export const HistoryUtils = {
    getIsPaid: (t: Transaction) => Boolean((t as any).isPaid ?? false),

    getRawPaidAmount: (t: Transaction) => Number((t as any).paidAmount ?? 0),

    getAmount: (t: Transaction) => Math.max(Number(t.amount || 0), 0),

    getPaidAmount: (t: Transaction) => {
        const isPaid = HistoryUtils.getIsPaid(t);
        const rawPaid = HistoryUtils.getRawPaidAmount(t);
        const amount = HistoryUtils.getAmount(t);

        if (isPaid) {
            return rawPaid > EPS ? Math.min(rawPaid, amount) : amount;
        }
        return Math.min(rawPaid, amount);
    },

    getRemaining: (t: Transaction) => {
        const isPaid = HistoryUtils.getIsPaid(t);
        const amount = HistoryUtils.getAmount(t);
        if (isPaid) return 0;
        const paid = HistoryUtils.getPaidAmount(t);
        return Math.max(amount - paid, 0);
    },

    getStatus: (t: Transaction): 'PENDING' | 'PARTIAL' | 'PAID' => {
        const amount = HistoryUtils.getAmount(t);
        const paid = HistoryUtils.getPaidAmount(t);
        const isPaid = HistoryUtils.getIsPaid(t);

        if (isPaid || paid >= amount - EPS) return 'PAID';
        if (paid > EPS) return 'PARTIAL';
        return 'PENDING';
    },

    formatCurrency: (val: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val),

    formatDateBR: (d?: string) => {
        if (!d) return '-';
        try {
            return new Date(d).toLocaleDateString('pt-BR');
        } catch {
            return d;
        }
    }
};
