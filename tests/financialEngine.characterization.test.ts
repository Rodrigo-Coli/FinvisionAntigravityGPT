import { describe, it, expect } from 'vitest';
import { FinancialEngine } from '../lib/financialEngine';

/**
 * Testes de CARACTERIZAÇÃO — fixam o comportamento atual (correto em 2026-06-28)
 * dos métodos puros do FinancialEngine que ainda não tinham cobertura.
 * Se algum destes falhar, NÃO ajuste o número: investigue se o engine mudou
 * de propósito ou se há um bug.
 */
describe('FinancialEngine — caracterização', () => {

  describe('calculateIncomeCommitment', () => {
    it('classifica YELLOW entre 20% e 30% e calcula a reserva de 20%', () => {
      const r = FinancialEngine.calculateIncomeCommitment({
        monthlyNetIncome: 10000, monthlyDebtPayments: 2500,
      });
      expect(r.ratio).toBe(25);
      expect(r.zone).toBe('YELLOW');
      expect(r.availableCashForSavings).toBe(2000);
    });

    it('classifica RED acima de 30%', () => {
      const r = FinancialEngine.calculateIncomeCommitment({
        monthlyNetIncome: 10000, monthlyDebtPayments: 3500,
      });
      expect(r.ratio).toBe(35);
      expect(r.zone).toBe('RED');
    });

    it('classifica GREEN abaixo de 20%', () => {
      const r = FinancialEngine.calculateIncomeCommitment({
        monthlyNetIncome: 10000, monthlyDebtPayments: 1500,
      });
      expect(r.ratio).toBe(15);
      expect(r.zone).toBe('GREEN');
    });

    it('renda zero não divide por zero: ratio 0, GREEN, reserva 0', () => {
      const r = FinancialEngine.calculateIncomeCommitment({
        monthlyNetIncome: 0, monthlyDebtPayments: 1000,
      });
      expect(r.ratio).toBe(0);
      expect(r.zone).toBe('GREEN');
      expect(r.availableCashForSavings).toBe(0);
    });
  });

  describe('calculateLeverage', () => {
    it('alavancagem global 30% = YELLOW, sem LTV quando não há imóvel específico', () => {
      const r = FinancialEngine.calculateLeverage({
        totalLiabilities: 300000, liquidInvestments: 200000, physicalAssetsValue: 800000,
      });
      expect(r.globalLeverage).toBe(30);
      expect(r.globalLeverageZone).toBe('YELLOW');
      expect(r.traditionalLTV).toBeUndefined();
      expect(r.traditionalLTVZone).toBeUndefined();
    });

    it('LTV calculado quando vêm os campos específicos: 40% = GREEN', () => {
      const r = FinancialEngine.calculateLeverage({
        totalLiabilities: 300000, liquidInvestments: 200000, physicalAssetsValue: 800000,
        specificMortgageBalance: 400000, specificPropertyValue: 1000000,
      });
      expect(r.traditionalLTV).toBe(40);
      expect(r.traditionalLTVZone).toBe('GREEN');
    });

    it('alavancagem acima de 50% = RED', () => {
      const r = FinancialEngine.calculateLeverage({
        totalLiabilities: 600000, liquidInvestments: 100000, physicalAssetsValue: 300000,
      });
      expect(r.globalLeverage).toBe(150);
      expect(r.globalLeverageZone).toBe('RED');
    });

    it('ativos zero não divide por zero: alavancagem 0, GREEN', () => {
      const r = FinancialEngine.calculateLeverage({
        totalLiabilities: 1000, liquidInvestments: 0, physicalAssetsValue: 0,
      });
      expect(r.globalLeverage).toBe(0);
      expect(r.globalLeverageZone).toBe('GREEN');
    });
  });

  describe('calculateDebtCoverage', () => {
    it('renda passiva cobre 200% da dívida = GREEN', () => {
      const r = FinancialEngine.calculateDebtCoverage({
        liquidInvestments: 100000, assumedNetMonthlyYield: 0.005,
        monthlyRentalIncome: 1500, totalMonthlyDebtPayments: 1000,
      });
      expect(r.passiveMonthlyIncome).toBe(2000);
      expect(r.ratio).toBe(200);
      expect(r.zone).toBe('GREEN');
    });

    it('cobertura de 20% = YELLOW', () => {
      const r = FinancialEngine.calculateDebtCoverage({
        liquidInvestments: 100000, assumedNetMonthlyYield: 0.005,
        monthlyRentalIncome: 1500, totalMonthlyDebtPayments: 10000,
      });
      expect(r.ratio).toBe(20);
      expect(r.zone).toBe('YELLOW');
    });

    it('cobertura de 10% = RED', () => {
      const r = FinancialEngine.calculateDebtCoverage({
        liquidInvestments: 100000, assumedNetMonthlyYield: 0.005,
        monthlyRentalIncome: 1500, totalMonthlyDebtPayments: 20000,
      });
      expect(r.ratio).toBe(10);
      expect(r.zone).toBe('RED');
    });

    it('sem dívidas: cobertura 100% = GREEN', () => {
      const r = FinancialEngine.calculateDebtCoverage({
        liquidInvestments: 100000, assumedNetMonthlyYield: 0.005,
        monthlyRentalIncome: 1500, totalMonthlyDebtPayments: 0,
      });
      expect(r.ratio).toBe(100);
      expect(r.zone).toBe('GREEN');
    });
  });

  describe('generatePaymentSchedule', () => {
    it('SAC: amortização constante, juros decrescentes, parcela final correta', () => {
      const s = FinancialEngine.generatePaymentSchedule(12000, 0.01, 12, 'SAC');
      expect(s.length).toBe(12);
      // Primeira parcela
      expect(s[0].outstandingBefore).toBe(12000);
      expect(s[0].interest).toBe(120);     // 12000 * 1%
      expect(s[0].amortization).toBe(1000); // 12000 / 12
      expect(s[0].payment).toBe(1120);
      // Última parcela
      expect(s[11].outstandingBefore).toBe(1000);
      expect(s[11].interest).toBe(10);      // 1000 * 1%
      expect(s[11].amortization).toBe(1000);
      expect(s[11].payment).toBe(1010);
    });

    it('PRICE: parcela (PMT) constante de ~88,85 e 12 parcelas', () => {
      const s = FinancialEngine.generatePaymentSchedule(1000, 0.01, 12, 'PRICE');
      expect(s.length).toBe(12);
      expect(s[0].interest).toBe(10);             // 1000 * 1%
      expect(s[0].payment).toBeCloseTo(88.85, 1);
      expect(s[11].payment).toBeCloseTo(88.85, 1); // PMT é constante na Price
    });
  });

  describe('simulateAmortizeVsInvest', () => {
    const baseDebt = {
      id: '1', name: 'Financiamento', outstandingBalance: 100000,
      remainingMonths: 120, financingSystem: 'SAC' as const, installmentAmount: 1200,
    };

    it('spread -2% (investimento isento rende menos que a dívida) → GREEN/AMORTIZAR', () => {
      const r = FinancialEngine.simulateAmortizeVsInvest({
        debt: { ...baseDebt, annualCET: 0.10 },
        investment: { grossAnnualYield: 0.08, isTaxExempt: true },
        extraAmortization: 10000,
      });
      expect(r.spreadAnnual).toBeCloseTo(-0.02, 10);
      expect(r.zone).toBe('GREEN');
      expect(r.winner).toBe('AMORTIZAR');
      expect(r.directInterestSaved).toBeGreaterThan(0); // amortizar sempre reduz juros
    });

    it('spread +5% (investimento rende mais) → RED/INVESTIR', () => {
      const r = FinancialEngine.simulateAmortizeVsInvest({
        debt: { ...baseDebt, annualCET: 0.10 },
        investment: { grossAnnualYield: 0.15, isTaxExempt: true },
        extraAmortization: 10000,
      });
      expect(r.spreadAnnual).toBeCloseTo(0.05, 10);
      expect(r.zone).toBe('RED');
      expect(r.winner).toBe('INVESTIR');
    });

    it('investimento tributado (IR 15% no longo prazo) cai na zona neutra → YELLOW/NEUTRAL', () => {
      const r = FinancialEngine.simulateAmortizeVsInvest({
        debt: { ...baseDebt, annualCET: 0.10 },
        investment: { grossAnnualYield: 0.12, isTaxExempt: false },
        extraAmortization: 10000,
      });
      // net = 0.12 * (1 - 0.15) = 0.102 ; spread = 0.102 - 0.10 = 0.002
      expect(r.spreadAnnual).toBeCloseTo(0.002, 10);
      expect(r.zone).toBe('YELLOW');
      expect(r.winner).toBe('NEUTRAL');
    });
  });
});
