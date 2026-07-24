import { Transaction } from '../types';

export interface DreCategoryRow {
    categoryName: string;
    total: number;
    subcategories: Record<string, number>;
}

export interface DreReport {
    period: { start: string; end: string } | null;
    grossIncome: number;
    totalExpenses: number;
    netIncome: number;
    incomeCategories: Record<string, DreCategoryRow>;
    expenseCategories: Record<string, DreCategoryRow>;
}

export const DreUtils = {
    generateDreFromTransactions(transactions: Transaction[], startDate?: string, endDate?: string): DreReport {
        const report: DreReport = {
            period: (startDate || endDate) ? { start: startDate || '', end: endDate || '' } : null,
            grossIncome: 0,
            totalExpenses: 0,
            netIncome: 0,
            incomeCategories: {},
            expenseCategories: {}
        };

        transactions.forEach(t => {
            // Filter noise
            if (t.isDeleted || t.type === 'ADJUSTMENT' || t.is_amortization || t.type === 'TRANSFER') {
                return;
            }

            const amount = Math.abs(Number(t.amount || 0));
            // 'Sem categoria' com c minúsculo é o rótulo único do app (History.tsx,
            // HistoryCharts, Reports). Com 'Sem Categoria' aqui, o DRE abria duas
            // linhas quase idênticas para a mesma coisa.
            const category = t.category || 'Sem categoria';
            const subcategory = t.subcategory || 'Diversos';

            if (t.type === 'INCOME') {
                report.grossIncome += amount;

                if (!report.incomeCategories[category]) {
                    report.incomeCategories[category] = { categoryName: category, total: 0, subcategories: {} };
                }

                report.incomeCategories[category].total += amount;
                report.incomeCategories[category].subcategories[subcategory] =
                    (report.incomeCategories[category].subcategories[subcategory] || 0) + amount;
            } else if (t.type === 'EXPENSE' || t.type === 'BILL_PAYMENT') {
                report.totalExpenses += amount;

                if (!report.expenseCategories[category]) {
                    report.expenseCategories[category] = { categoryName: category, total: 0, subcategories: {} };
                }

                report.expenseCategories[category].total += amount;
                report.expenseCategories[category].subcategories[subcategory] =
                    (report.expenseCategories[category].subcategories[subcategory] || 0) + amount;
            }
        });

        report.netIncome = report.grossIncome - report.totalExpenses;

        return report;
    }
};
