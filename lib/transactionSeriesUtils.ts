
import { Transaction } from '../types';
import { DateUtils } from './dateUtils';

export interface SeriesConfig {
    type: 'RECURRING' | 'INSTALLMENT';
    count?: number; // For installments
    period?: 'weekly' | 'monthly' | 'yearly' | 'biweekly' | 'custom'; // Added biweekly and custom
    daysInterval?: number; // Used when period is 'custom'
    startDate: string;
    totalAmount?: number;
}

export const TransactionSeriesUtils = {
    /**
     * Generates a series of transactions for installments or recurrences.
     */
    generateSeries: (
        baseTx: Partial<Transaction>,
        config: SeriesConfig
    ): Partial<Transaction>[] => {
        const sequence: Partial<Transaction>[] = [];
        const count = config.type === 'INSTALLMENT' ? (config.count || 1) : (config.type === 'RECURRING' ? 24 : 1); // 2 years default for recurring if limited? No, user usually wants open ended. But for creation we can limit.

        // For installments on credit card, we need to adjust for cent rounding
        let installmentAmount = 0;
        let lastInstallmentAmount = 0;

        if (config.type === 'INSTALLMENT' && config.totalAmount) {
            const n = config.count || 1;
            installmentAmount = Math.floor((config.totalAmount / n) * 100) / 100;
            const totalAllocated = installmentAmount * n;
            const diff = Math.round((config.totalAmount - totalAllocated) * 100) / 100;
            lastInstallmentAmount = Math.round((installmentAmount + diff) * 100) / 100;
        }

        const start = new Date(config.startDate + 'T00:00:00Z');

        for (let i = 0; i < count; i++) {
            const current = new Date(start);

            if (config.period === 'weekly') current.setUTCDate(start.getUTCDate() + (i * 7));
            else if (config.period === 'biweekly') current.setUTCDate(start.getUTCDate() + (i * 14));
            else if (config.period === 'custom' && config.daysInterval) {
                current.setUTCDate(start.getUTCDate() + (i * config.daysInterval));
            }
            else if (config.period === 'monthly' || config.type === 'INSTALLMENT') {
                current.setUTCMonth(start.getUTCMonth() + i);
            }
            else if (config.period === 'yearly') current.setUTCFullYear(start.getUTCFullYear() + i);

            const amount = (config.type === 'INSTALLMENT' && i === count - 1)
                ? lastInstallmentAmount
                : (config.type === 'INSTALLMENT' ? installmentAmount : baseTx.amount);

            sequence.push({
                ...baseTx,
                date: current.toISOString().split('T')[0],
                amount: amount,
                is_installment: config.type === 'INSTALLMENT',
                installment_number: config.type === 'INSTALLMENT' ? i + 1 : undefined,
                installment_total: config.type === 'INSTALLMENT' ? config.count : undefined,
                is_recurring: config.type === 'RECURRING',
                recurrence_period: config.period,
                description: config.type === 'INSTALLMENT'
                    ? `${baseTx.description} (${i + 1}/${config.count})`
                    : baseTx.description
            });
        }

        return sequence;
    }
};
