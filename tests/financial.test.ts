import { describe, it, expect } from 'vitest';

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
});
