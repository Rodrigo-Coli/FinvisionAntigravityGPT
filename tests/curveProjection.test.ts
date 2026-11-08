import { describe, it, expect } from 'vitest';
import { businessDaysBetween, curveFactor, curveSpecOf, isBusinessDay, planCurve, AUTO_NOTE_PREFIX, type Indexes, type Movement } from '../lib/curveProjection';

const idx = (over: Partial<Indexes> = {}): Indexes => ({ cdiAnnual: 14, ipcaAnnual: 4.5, ...over });

describe('dias úteis', () => {
  it('pula fim de semana e feriados nacionais', () => {
    expect(isBusinessDay('2026-09-07')).toBe(false); // Independência
    expect(isBusinessDay('2026-10-12')).toBe(false); // N. Sra. Aparecida
    expect(isBusinessDay('2026-02-16')).toBe(false); // Carnaval 2026
    expect(isBusinessDay('2026-04-03')).toBe(false); // Sexta-feira Santa 2026
    expect(isBusinessDay('2026-06-04')).toBe(false); // Corpus Christi 2026
    expect(isBusinessDay('2026-09-08')).toBe(true);
  });
  it('setembro/2026 tem 21 dias úteis', () => {
    expect(businessDaysBetween('2026-08-31', '2026-09-30')).toHaveLength(21);
  });
});

describe('curva pela taxa contratada — conferida com o relatório do Safra', () => {
  it('Raízen pré 12,29%: 31/08 60.827,88 → 30/09 61.418,18', () => {
    const v = 60827.88 * curveFactor({ index: 'PRE', rate: 12.29 }, '2026-08-31', '2026-09-30', idx());
    expect(Math.abs(v - 61418.18)).toBeLessThan(1.5);
  });
  it('Eucatex 105,15% do CDI (CDI de set = 1,08%): 7.127,62 → 7.208,77', () => {
    const days = businessDaysBetween('2026-08-31', '2026-09-30');
    const daily = (Math.pow(1.0108, 1 / days.length) - 1) * 100;
    const cdiDaily = new Map(days.map(d => [d, daily]));
    const v = 7127.62 * curveFactor({ index: 'CDI', rate: 105.15 }, '2026-08-31', '2026-09-30', idx({ cdiDaily }));
    expect(Math.abs(v - 7208.77)).toBeLessThan(1);
  });
  it('IPCA+ usa o IPCA do mês e o juro real', () => {
    const f = curveFactor({ index: 'IPCA', rate: 10.33 }, '2026-08-31', '2026-09-30', idx({ ipcaMonthly: new Map([['2026-09', 0.2]]) }));
    expect(f).toBeGreaterThan(1.009);
    expect(f).toBeLessThan(1.012);
  });
  it('lê a curva do cadastro', () => {
    expect(curveSpecOf({ interestType: 'PRE', yieldRate: '12.29' })).toEqual({ index: 'PRE', rate: 12.29 });
    expect(curveSpecOf({ interestType: 'CDI', yieldRate: '105.15' })).toEqual({ index: 'CDI', rate: 105.15 });
    expect(curveSpecOf({ interestType: 'IPCA', yieldRate: '10.33' })).toEqual({ index: 'IPCA', rate: 10.33 });
    expect(curveSpecOf({ interestType: 'CDI' })).toBeNull();
  });
});

describe('plano de atualização do extrato', () => {
  const pre = { index: 'PRE' as const, rate: 12.29 };
  const base: Movement[] = [
    { movement_type: 'APORTE', amount: 55000, movement_date: '2023-10-20' },
    { movement_type: 'RENDIMENTO_ACUMULADO', amount: 6418.18, movement_date: '2026-09-30', notes: 'Set/2026 pela curva' }
  ];

  it('fecha outubro com uma linha e abre a de novembro até hoje', () => {
    const p = planCurve(base, pre, '2026-11-08', idx());
    expect(p.closedRows).toHaveLength(1);
    expect(p.closedRows[0].movement_date).toBe('2026-10-31');
    expect(p.closedRows[0].notes.startsWith(AUTO_NOTE_PREFIX)).toBe(true);
    expect(p.openRow?.movement_date).toBe('2026-11-08');
    const total = 61418.18 + p.closedRows[0].amount + (p.openRow?.amount || 0);
    expect(Math.abs(total - p.value)).toBeLessThan(0.02);
    expect(p.value).toBeGreaterThan(61418.18);
  });

  it('roda de novo no mesmo mês: substitui a linha do mês, não duplica', () => {
    const p1 = planCurve(base, pre, '2026-11-08', idx());
    const withRows: Movement[] = [
      ...base,
      ...p1.closedRows.map(r => ({ movement_type: 'RENDIMENTO_ACUMULADO', ...r })),
      { id: 'open1', movement_type: 'RENDIMENTO_ACUMULADO', ...p1.openRow! }
    ];
    const p2 = planCurve(withRows, pre, '2026-11-20', idx());
    expect(p2.closedRows).toHaveLength(0);
    expect(p2.replaceOpenRowId).toBe('open1');
    expect(p2.value).toBeGreaterThan(p1.value);
  });

  it('juros pagos no mês (ajuste negativo) entram no caminho da projeção', () => {
    const withCoupon: Movement[] = [...base, { movement_type: 'AJUSTE_MANUAL', amount: -500, movement_date: '2026-11-05', notes: 'Juros pagos' }];
    const a = planCurve(base, pre, '2026-11-08', idx());
    const b = planCurve(withCoupon, pre, '2026-11-08', idx());
    expect(b.value).toBeLessThan(a.value - 499);
  });

  it('título sem extrato não projeta nada', () => {
    const p = planCurve([], pre, '2026-11-08', idx());
    expect(p.value).toBe(0);
    expect(p.closedRows).toHaveLength(0);
    expect(p.openRow).toBeNull();
  });
});
