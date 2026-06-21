import { describe, it, expect, vi } from 'vitest';
import { FinancialEngine } from '../lib/financialEngine';

/**
 * Testes de cálculos financeiros — lógica pura sem dependências do React/Supabase
 * Simula as funções de cálculo que existem em History.tsx e CreditCards.tsx
 */

// Reproduz a lógica de formatCurrency usada em todo o sistema
const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val || 0));

// Reproduz safeNumber de CreditCards.tsx
const safeNumber = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

describe('Cálculos Financeiros', () => {
    describe('formatCurrency', () => {
        it('deve formatar valor positivo corretamente', () => {
            expect(formatCurrency(1500.50)).toBe('R$\u00A01.500,50');
        });

        it('deve formatar zero', () => {
            expect(formatCurrency(0)).toBe('R$\u00A00,00');
        });

        it('deve formatar valor negativo', () => {
            expect(formatCurrency(-250.75)).toBe('-R$\u00A0250,75');
        });

        it('deve lidar com NaN (retorna 0)', () => {
            expect(formatCurrency(NaN)).toBe('R$\u00A00,00');
        });

        it('deve lidar com null/undefined via || 0', () => {
            expect(formatCurrency(null as any)).toBe('R$\u00A00,00');
            expect(formatCurrency(undefined as any)).toBe('R$\u00A00,00');
        });
    });

    describe('safeNumber', () => {
        it('deve converter string numérica', () => {
            expect(safeNumber('123.45')).toBe(123.45);
        });

        it('deve retornar 0 para string inválida', () => {
            expect(safeNumber('abc')).toBe(0);
        });

        it('deve retornar 0 para Infinity', () => {
            expect(safeNumber(Infinity)).toBe(0);
        });

        it('deve retornar 0 para null', () => {
            expect(safeNumber(null)).toBe(0);
        });

        it('deve retornar 0 para undefined', () => {
            expect(safeNumber(undefined)).toBe(0);
        });

        it('deve retornar número válido', () => {
            expect(safeNumber(42)).toBe(42);
        });
    });

    describe('Cálculos de Fatura', () => {
        it('deve calcular total da fatura corretamente', () => {
            const transactions = [
                { amount: -150 },
                { amount: -250.50 },
                { amount: -99.99 },
            ];
            const total = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
            expect(Math.round(total * 100) / 100).toBe(500.49);
        });

        it('deve calcular saldo aberto (total - pago)', () => {
            const statementTotal = 1500.00;
            const statementPaid = 500.00;
            const statementOpen = Math.round(Math.max(0, statementTotal - statementPaid) * 100) / 100;
            expect(statementOpen).toBe(1000.00);
        });

        it('saldo aberto nunca deve ser negativo', () => {
            const statementTotal = 500;
            const statementPaid = 600; // pagou mais que o total
            const statementOpen = Math.round(Math.max(0, statementTotal - statementPaid) * 100) / 100;
            expect(statementOpen).toBe(0);
        });

        it('deve identificar fatura como PAGA quando saldo aberto = 0', () => {
            const total = 1500;
            const paid = 1500;
            const open = Math.max(0, total - paid);
            const status = open === 0 ? 'PAID' : 'OPEN';
            expect(status).toBe('PAID');
        });
    });

    describe('Cálculos de Balanço do Histórico', () => {
        it('deve separar receitas e despesas corretamente', () => {
            const transactions = [
                { type: 'INCOME', amount: 5000 },
                { type: 'EXPENSE', amount: 1500 },
                { type: 'INCOME', amount: 3000 },
                { type: 'EXPENSE', amount: 800 },
            ];

            const income = transactions.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
            const expenses = transactions.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);
            const balance = income - expenses;

            expect(income).toBe(8000);
            expect(expenses).toBe(2300);
            expect(balance).toBe(5700);
        });

        it('deve calcular parcela corretamente', () => {
            const totalAmount = 1200;
            const installments = 12;
            const installmentAmount = Math.round((totalAmount / installments) * 100) / 100;
            expect(installmentAmount).toBe(100);
        });

        it('deve lidar com parcela com arredondamento', () => {
            const totalAmount = 100;
            const installments = 3;
            const installmentAmount = Math.round((totalAmount / installments) * 100) / 100;
            expect(installmentAmount).toBe(33.33);
        });
    });

    describe('Busca com Variantes Acentuadas', () => {
        // Reproduz a lógica de normalização usada em filtrosfront-end
        const normalize = (str: string) =>
            str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

        it('deve normalizar acentos corretamente', () => {
            expect(normalize('mãe')).toBe('mae');
            expect(normalize('café')).toBe('cafe');
            expect(normalize('ação')).toBe('acao');
        });

        it('deve fazer match de busca sem acento', () => {
            const searchTerm = 'mae';
            const transactionDesc = 'Transferência Mãe';
            const matches = normalize(transactionDesc).includes(normalize(searchTerm));
            expect(matches).toBe(true);
        });

        it('deve fazer match com acento', () => {
            const searchTerm = 'mãe';
            const transactionDesc = 'Transferência Mãe';
            const matches = normalize(transactionDesc).includes(normalize(searchTerm));
            expect(matches).toBe(true);
        });
    });

    describe('Projection Service Engine', () => {
        // mock das funções importadas pelo service
        const addMonths = (date: Date, amount: number) => {
            const result = new Date(date);
            result.setMonth(result.getMonth() + amount);
            return result;
        };
        const startOfMonth = (date: Date) => {
            return new Date(date.getFullYear(), date.getMonth(), 1);
        };

        it('deve projetar passivos imobiliários com juros e balões', () => {
            let liabilityPayments = 0;
            let balloonPayments = 0;
            const i = 5; // 5 months in future
            const month = 11; // Dezembro
            const year = 2026;

            const realEstateLiabilities = [
                {
                    id: '1',
                    name: 'Apto',
                    type: 'MORTGAGE',
                    totalAmount: 500000,
                    remainingBalance: 400000,
                    installmentAmount: 3000,
                    installments_count: 120,
                    indexation_rate: 6, // 6% aa
                    balloon_payments: [
                        { month: 12, year: 2026, amount: 50000 }
                    ]
                }
            ];

            realEstateLiabilities.forEach(rel => {
                if (rel.installmentAmount && rel.installments_count > i) {
                    const monthlyRate = Math.pow(1 + (rel.indexation_rate / 100), 1 / 12) - 1;
                    const correctedInstallment = rel.installmentAmount * Math.pow(1 + monthlyRate, i);
                    liabilityPayments += correctedInstallment;
                }

                rel.balloon_payments.forEach(bp => {
                    if (bp.month === month + 1 && bp.year === year) {
                        balloonPayments += bp.amount;
                    }
                });
            });

            // Parcela corrigida: 3000 * (1 + monthlyRate)^5
            const monthlyRate = Math.pow(1.06, 1/12) - 1;
            const expectedCorrected = 3000 * Math.pow(1 + monthlyRate, 5);

            expect(liabilityPayments).toBeCloseTo(expectedCorrected, 2);
            expect(balloonPayments).toBe(50000);
        });
    });

    describe('Especialistas - Renda Fixa e Amortização de Empréstimos', () => {
        it('deve converter taxa anualizada para mensal equivalente corretamente', () => {
            const annual = 12.0; // 12% a.a.
            const monthly = FinancialEngine.getEquivalentMonthlyRate(annual);
            // (1 + 0.00948879)^12 = 1.12
            expect(monthly).toBeCloseTo(0.00948879, 7);
        });

        it('deve extrair taxa anualizada de strings em diferentes formatos', () => {
            expect(FinancialEngine.parseYieldRate('12.5% a.a.', 'PRE')).toBe(12.5);
            expect(FinancialEngine.parseYieldRate('102% CDI', 'CDI')).toBeCloseTo(10.608, 3); // 1.02 * 10.4
            expect(FinancialEngine.parseYieldRate('IPCA + 6.5%', 'IPCA')).toBeCloseTo(10.5, 1); // 4.0 + 6.5
        });

        it('deve calcular a alíquota de IR regressivo com base nos dias', () => {
            expect(FinancialEngine.calculateRegressiveTaxRate(100, false)).toBe(0.225); // <= 180 dias
            expect(FinancialEngine.calculateRegressiveTaxRate(200, false)).toBe(0.20);  // 181 a 360 dias
            expect(FinancialEngine.calculateRegressiveTaxRate(400, false)).toBe(0.175); // 361 a 720 dias
            expect(FinancialEngine.calculateRegressiveTaxRate(800, false)).toBe(0.15);  // > 720 dias
            expect(FinancialEngine.calculateRegressiveTaxRate(100, true)).toBe(0);      // Isento
        });

        it('deve calcular rendimento composto e saldo líquido de Renda Fixa', () => {
            vi.useFakeTimers();
            // Define data atual fixa de teste: 12 de Junho de 2026 às 12:00 UTC
            vi.setSystemTime(new Date('2026-06-12T12:00:00.000Z'));

            const initial = 10000;
            const annualRate = 12.0; // 12% a.a.
            const dateStr = '2025-06-12'; // Exatamente 1 ano atrás (12 meses, 365 dias)

            const result = FinancialEngine.calculateFixedIncomeYield(
                initial,
                annualRate,
                dateStr,
                'ACUMULADO',
                false
            );

            expect(result.monthsElapsed).toBe(12);
            expect(result.grossValue).toBeCloseTo(11200, 0); // Juros compostos de 12% a.a. = 11200 bruto
            expect(result.taxRate).toBe(0.175); // 365 dias = 17.5%
            expect(result.netValue).toBeCloseTo(11200 - (1200 * 0.175), 0);

            vi.useRealTimers();
        });

        it('deve gerar amortização PRICE e SAC para empréstimos concedidos', () => {
            const principal = 10000;
            const ratePercent = 1.0; // 1% a.m.
            const count = 10; // 10 parcelas

            const sac = FinancialEngine.calculateProjectedLoanAmortization(principal, ratePercent, count, 'SAC');
            expect(sac.length).toBe(10);
            expect(sac[0].amortization).toBe(1000); // SAC amortização é constante: 10000/10
            expect(sac[0].interest).toBe(100); // 10000 * 1%
            expect(sac[0].payment).toBe(1100);
            expect(sac[0].outstandingBalance).toBe(9000);

            const price = FinancialEngine.calculateProjectedLoanAmortization(principal, ratePercent, count, 'PRICE');
            expect(price.length).toBe(10);
            expect(price[0].payment).toBeCloseTo(1055.82, 1); // PMT da Price
            expect(price[0].interest).toBe(100); // 10000 * 1%
            expect(price[0].amortization).toBeCloseTo(955.82, 1);
            expect(price[0].outstandingBalance).toBeCloseTo(9044.18, 1);
        });

        it('deve calcular o valor corrigido pelo indice INCC cumulativo', () => {
            const val = 100000;
            const rate = 0.5; // 0.5% ao mes
            const months = 12;
            const compounded = FinancialEngine.calculateIndexCompoundedValue(val, rate, months);
            // 100000 * (1.005)^12 = 106167.78
            expect(compounded).toBeCloseTo(106167.78, 1);
        });

        it('deve calcular métricas imobiliárias (Cap Rate, Cash-on-Cash, LTV, Home Equity) corretamente', () => {
            const metrics = FinancialEngine.calculateRealEstateMetrics({
                estimatedValue: 1000000,
                totalInvestedCapital: 300000,
                monthlyGrossRent: 5000,
                monthlyOperationalExpenses: 1000,
                monthlyFinancingInstallment: 3000,
                outstandingDebt: 400000
            });

            // NOI = 5000 - 1000 = 4000 mensal = 48000 anual
            // Cap Rate = 48000 / 1000000 = 4.8%
            expect(metrics.capRateAnnual).toBe(4.8);

            // Fluxo líquido = 5000 - 1000 - 3000 = 1000 mensal = 12000 anual
            // Cash-on-Cash = 12000 / 300000 = 4%
            expect(metrics.cashOnCashReturn).toBe(4);

            // LTV = 400000 / 1000000 = 40%
            expect(metrics.ltv).toBe(40);

            // Home Equity = 100% - 40% = 60%
            expect(metrics.homeEquityPercent).toBe(60);
            expect(metrics.netMonthlyCashFlow).toBe(1000);
        });
    });
});
