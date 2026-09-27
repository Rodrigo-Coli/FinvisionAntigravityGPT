import { describe, it, expect } from 'vitest';
import { addSalePeriod, buildSaleInstallmentPlan, previewSaleInstallment, readSalePlanSettings, isSaleRowSettled } from '../lib/saleInstallments';

describe('addSalePeriod', () => {
  it('mensal prende o dia ao fim do mês sem escorregar a sequência', () => {
    expect(addSalePeriod('2026-01-31', 'MENSAL', 0)).toBe('2026-01-31');
    expect(addSalePeriod('2026-01-31', 'MENSAL', 1)).toBe('2026-02-28');
    expect(addSalePeriod('2026-01-31', 'MENSAL', 2)).toBe('2026-03-31');
  });
  it('semanal, quinzenal, trimestral e anual', () => {
    expect(addSalePeriod('2026-09-25', 'SEMANAL', 2)).toBe('2026-10-09');
    expect(addSalePeriod('2026-09-25', 'QUINZENAL', 1)).toBe('2026-10-10');
    expect(addSalePeriod('2026-11-25', 'TRIMESTRAL', 1)).toBe('2027-02-25');
    expect(addSalePeriod('2026-09-25', 'ANUAL', 1)).toBe('2027-09-25');
  });
});

describe('buildSaleInstallmentPlan', () => {
  it('entrada + 12x: divide o saldo e a soma fecha no valor da venda', () => {
    const plan = buildSaleInstallmentPlan({
      total: 115956.39, downPayment: 20000, installmentsCount: 12,
      frequency: 'MENSAL', firstInstallmentDate: '2026-10-25'
    });
    expect(plan).toHaveLength(12);
    const sum = plan.reduce((s, p) => s + p.amount, 0);
    expect(Math.round((sum + 20000) * 100) / 100).toBe(115956.39);
    expect(plan[0]).toMatchObject({ number: 1, total: 12, date: '2026-10-25' });
    expect(plan[11].date).toBe('2027-09-25');
  });

  it('preserva parcelas recebidas e recalcula só as pendentes', () => {
    const plan = buildSaleInstallmentPlan({
      total: 1000, downPayment: 0, installmentsCount: 4,
      frequency: 'MENSAL', firstInstallmentDate: '2026-01-10',
      receivedInstallments: [{ number: 1, amount: 400 }]
    });
    expect(plan.map(p => p.number)).toEqual([2, 3, 4]);
    expect(plan.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(600, 2);
  });

  it('sem parcelas ou saldo zerado não gera nada', () => {
    expect(buildSaleInstallmentPlan({ total: 100, downPayment: 100, installmentsCount: 3, frequency: 'MENSAL', firstInstallmentDate: '2026-01-01' })).toEqual([]);
    expect(buildSaleInstallmentPlan({ total: 100, downPayment: 0, installmentsCount: 0, frequency: 'MENSAL', firstInstallmentDate: '2026-01-01' })).toEqual([]);
  });
});

describe('helpers', () => {
  it('preview e padrões legados (10x mensal)', () => {
    expect(previewSaleInstallment(1200, 200, 10)).toBe(100);
    const s = readSalePlanSettings({ saleDate: '2026-09-25' }, '2026-09-27');
    expect(s).toMatchObject({ installmentsCount: 10, frequency: 'MENSAL', downPayment: 0, firstInstallmentDate: '2026-09-25' });
  });
  it('linha com valor recebido conta como quitada mesmo com is_paid=false', () => {
    expect(isSaleRowSettled({ is_paid: false, paid_amount: '20000.00' })).toBe(true);
    expect(isSaleRowSettled({ is_paid: false, paid_amount: 0 })).toBe(false);
  });
});

describe('dia de cobrança, "a partir de" e valor fixo', () => {
  it('primeiro dia de cobrança em ou depois da data inicial', async () => {
    const { resolveFirstInstallmentDate } = await import('../lib/saleInstallments');
    expect(resolveFirstInstallmentDate('2026-10-01', 10)).toBe('2026-10-10');
    expect(resolveFirstInstallmentDate('2026-10-15', 10)).toBe('2026-11-10');
    expect(resolveFirstInstallmentDate('2026-12-20', 5)).toBe('2027-01-05');
    expect(resolveFirstInstallmentDate('2026-02-01', 31)).toBe('2026-02-28');
    expect(resolveFirstInstallmentDate('2026-10-15', null)).toBe('2026-10-15');
  });

  it('dia 31 não herda o 28 de fevereiro nas parcelas seguintes', () => {
    const plan = buildSaleInstallmentPlan({
      total: 300, downPayment: 0, installmentsCount: 3, frequency: 'MENSAL',
      firstInstallmentDate: '2026-02-28', dueDay: 31
    });
    expect(plan.map(p => p.date)).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('CLA 180: entrada 20.000 + 12x de 7.996,39 com valor fixo do contrato', () => {
    const s = readSalePlanSettings({
      saleDownPayment: '20000', saleInstallmentsCount: '12', saleInstallmentFrequency: 'MENSAL',
      saleFirstInstallmentDate: '2026-10-01', saleInstallmentDueDay: '25', saleInstallmentAmount: '7996.39'
    }, '2026-09-27');
    const plan = buildSaleInstallmentPlan({ total: 115956.39, ...s });
    expect(plan).toHaveLength(12);
    expect(plan.every(p => p.amount === 7996.39)).toBe(true);
    expect(plan[0].date).toBe('2026-10-25');
    expect(plan[11].date).toBe('2027-09-25');
  });
});
