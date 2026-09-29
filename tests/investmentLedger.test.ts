import { describe, it, expect } from 'vitest';
import { ledgerImpliedGross, splitGrossChange, firstAporteDate, periodResult, netOfTax, resolveResultPeriod } from '../lib/investmentLedger';

describe('extrato do investimento fecha com o saldo bruto', () => {
  it('soma aportes, rendimentos acumulados e ajustes', () => {
    expect(ledgerImpliedGross([
      { movement_type: 'APORTE', amount: 2076.53 },
      { movement_type: 'RENDIMENTO_ACUMULADO', amount: 17.44 },
      { movement_type: 'RENDIMENTO_MENSAL', amount: 50 },
      { movement_type: 'AJUSTE_MANUAL', amount: -1 },
    ])).toBe(2092.97);
  });

  it('não concilia com resgate/amortização ou sem aporte', () => {
    expect(ledgerImpliedGross([{ movement_type: 'APORTE', amount: 100 }, { movement_type: 'RESGATE_PARCIAL', amount: 10 }])).toBeNull();
    expect(ledgerImpliedGross([])).toBeNull();
  });

  it('caso real: custo 2.076,53, saldo inicial 2.080,82 editado para 2.098,26', () => {
    const ledger = [{ movement_type: 'APORTE', amount: 2076.53 }];
    // a sobra que já existia (4,29) fica separada do que mudou hoje (17,44)
    expect(splitGrossChange(ledger, 2080.82, 2098.26)).toEqual({ priorGap: 4.29, change: 17.44 });
  });

  it('extrato já conciliado: só a mudança de hoje', () => {
    const ledger = [{ movement_type: 'APORTE', amount: 1000 }, { movement_type: 'RENDIMENTO_ACUMULADO', amount: 10 }];
    expect(splitGrossChange(ledger, 1010, 1005)).toEqual({ priorGap: 0, change: -5 });
  });

  it('sem extrato conciliável, usa saldo novo − saldo anterior', () => {
    expect(splitGrossChange([], 1000, 1010.5)).toEqual({ priorGap: 0, change: 10.5 });
  });

  it('primeiro aporte', () => {
    expect(firstAporteDate([
      { movement_type: 'APORTE', amount: 1, movement_date: '2026-03-01' },
      { movement_type: 'APORTE', amount: 1, movement_date: '2026-02-27' },
      { movement_type: 'RENDIMENTO_ACUMULADO', amount: 1, movement_date: '2026-01-01' },
    ])).toBe('2026-02-27');
    expect(firstAporteDate([])).toBeNull();
  });

  it('líquido estimado do rendimento', () => {
    expect(netOfTax(21.73, 0.2)).toBe(17.38);
    expect(netOfTax(21.73, 0)).toBe(21.73);
  });
});

describe('resultado por período', () => {
  const mvs = [
    { movement_type: 'APORTE', amount: 1000, movement_date: '2026-01-10' },
    { movement_type: 'RENDIMENTO_ACUMULADO', amount: 12.5, movement_date: '2026-02-28' },
    { movement_type: 'AJUSTE_MANUAL', amount: -4, movement_date: '2026-03-15' },
    { movement_type: 'RENDIMENTO_MENSAL', amount: 8, movement_date: '2026-03-20' },
    { movement_type: 'RESGATE_PARCIAL', amount: -200, movement_date: '2026-03-25' },
  ];

  it('ignora aporte e resgate (não são lucro)', () => {
    expect(periodResult(mvs, null, null)).toEqual({ appreciation: 12.5, depreciation: -4, received: 8, total: 16.5 });
  });

  it('filtra pelo período (inclusivo)', () => {
    expect(periodResult(mvs, '2026-03-01', '2026-03-31')).toEqual({ appreciation: 0, depreciation: -4, received: 8, total: 4 });
    expect(periodResult(mvs, '2026-02-28', '2026-02-28').total).toBe(12.5);
  });
});

describe('períodos do resultado', () => {
  const today = '2026-09-29';
  it('pré-definidos', () => {
    expect(resolveResultPeriod('MES', today)).toEqual({ start: '2026-09-01', end: today });
    expect(resolveResultPeriod('MES_ANTERIOR', today)).toEqual({ start: '2026-08-01', end: '2026-08-31' });
    expect(resolveResultPeriod('3M', today)).toEqual({ start: '2026-07-01', end: today });
    expect(resolveResultPeriod('12M', today)).toEqual({ start: '2025-10-01', end: today });
    expect(resolveResultPeriod('ANO', today)).toEqual({ start: '2026-01-01', end: today });
    expect(resolveResultPeriod('TUDO', today)).toEqual({ start: null, end: null });
  });
  it('mês anterior na virada do ano e fevereiro', () => {
    expect(resolveResultPeriod('MES_ANTERIOR', '2026-01-15')).toEqual({ start: '2025-12-01', end: '2025-12-31' });
    expect(resolveResultPeriod('MES_ANTERIOR', '2028-03-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });
  it('personalizado', () => {
    expect(resolveResultPeriod('PERSONALIZADO', today, '2026-02-01', '')).toEqual({ start: '2026-02-01', end: null });
  });
});
