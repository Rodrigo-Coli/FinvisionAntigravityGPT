import { describe, it, expect } from 'vitest';
import { annualBenefit, breakEvenMonthlySpend, compare, grossRate, milheiroToMatchCashback, pointsEarned, verdictFor } from '../lib/cardBenefits';

describe('benefícios de cartão', () => {
  it('cashback de 1% sobre R$ 5.000/mês = R$ 600/ano', () => {
    const r = annualBenefit(5000, { type: 'CASHBACK', cashbackPct: 1 });
    expect(r.gross).toBe(600);
    expect(r.net).toBe(600);
    expect(r.effectivePct).toBeCloseTo(0.01, 6);
  });

  it('teto mensal de cashback limita o benefício', () => {
    expect(annualBenefit(10000, { type: 'CASHBACK', cashbackPct: 1, cashbackCapMonthly: 50 }).gross).toBe(600);
  });

  it('pontos por dólar usam a cotação', () => {
    expect(pointsEarned(530, { type: 'PONTOS', pointsPerUnit: 2.2, usdRate: 5.3 })).toBeCloseTo(220, 6);
  });

  it('pontos viram reais pelo milheiro, bônus e uso', () => {
    const b = { type: 'PONTOS' as const, pointsPerUnit: 2, pointsUnit: 'BRL' as const, milheiroValue: 20, transferBonusPct: 50, usageRatePct: 80 };
    // 2 pts/R$ × 1,5 × R$ 0,02 × 0,8 = 4,8% de volta
    expect(grossRate(b)).toBeCloseTo(0.048, 6);
  });

  it('anuidade sai do benefício e o gasto mínimo isenta', () => {
    const b = { type: 'CASHBACK' as const, cashbackPct: 1, annualFee: 1200, feeWaiverMinMonthlySpend: 8000 };
    expect(annualBenefit(5000, b).net).toBe(-600);
    expect(annualBenefit(8000, b).feeWaived).toBe(true);
    expect(annualBenefit(8000, b).net).toBe(960);
  });

  it('gasto que paga a anuidade', () => {
    expect(breakEvenMonthlySpend({ type: 'CASHBACK', cashbackPct: 1, annualFee: 1200 })).toBe(10000);
    expect(breakEvenMonthlySpend({ type: 'NONE', annualFee: 500 })).toBeNull();
  });

  it('veredito', () => {
    const b = { type: 'CASHBACK' as const, cashbackPct: 1, annualFee: 1200 };
    expect(verdictFor(annualBenefit(5000, b), b).verdict).toBe('NAO_COMPENSA');
    expect(verdictFor(annualBenefit(5000, { type: 'CASHBACK', cashbackPct: 1 }), { type: 'CASHBACK', cashbackPct: 1 }).verdict).toBe('COMPENSA');
    expect(verdictFor(annualBenefit(5000, { type: 'NONE', annualFee: 300 }), { type: 'NONE', annualFee: 300 }).verdict).toBe('NAO_COMPENSA');
  });

  it('compara dois cartões no mesmo gasto', () => {
    const c = compare(5000, { type: 'CASHBACK', cashbackPct: 1 }, { type: 'CASHBACK', cashbackPct: 0.5 });
    expect(c.winner).toBe('A');
    expect(c.difference).toBe(300);
  });

  it('milheiro que empata com o cashback', () => {
    // 1 pt/R$, sem bônus, uso 100%: para empatar com 1% o milheiro precisa valer R$ 10
    expect(milheiroToMatchCashback({ type: 'PONTOS', pointsPerUnit: 1, pointsUnit: 'BRL' }, 1)).toBe(10);
  });
});
