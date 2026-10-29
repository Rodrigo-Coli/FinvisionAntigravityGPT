// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { monthlyDueDate } from '../lib/installmentDates';

vi.mock('../lib/supabase/client', () => ({ supabase: null }));
import { detectLegacySeries, buildSeriesFilter } from '../pages/History';

describe('vencimentos mensais', () => {
  it('mesmo dia nos meses seguintes; mês curto usa o último dia', () => {
    expect(monthlyDueDate('2026-11-15', 1)).toBe('2026-11-15');
    expect(monthlyDueDate('2026-11-15', 2)).toBe('2026-12-15');
    expect(monthlyDueDate('2026-11-15', 128)).toBe('2037-06-15');
    expect(monthlyDueDate('2027-01-31', 2)).toBe('2027-02-28');
    expect(monthlyDueDate('2027-01-31', 3)).toBe('2027-03-31');
  });
});

describe('parcela de consórcio é uma série (só esta / esta e as próximas / todas)', () => {
  const row = {
    id: 't2', liability_id: 'L1', description: 'Parcela 2/128 (Consórcio) - Ademicon 0560/1982',
    metadata: { installment_number: 2, installment_total: 128, is_consortium_installment: true, consortium_id: 'C1' }
  };
  it('detecta a série pela dívida', () => {
    const meta = detectLegacySeries(row);
    expect(meta.installment_group_id).toBe('virtual-liab-L1');
    expect(meta.is_installment).toBe(true);
  });
  it('o filtro da série pega só as parcelas daquela dívida', () => {
    const calls: any[] = [];
    const q: any = { eq: (...a: any[]) => { calls.push(['eq', ...a]); return q; }, not: (...a: any[]) => { calls.push(['not', ...a]); return q; } };
    buildSeriesFilter(q, { ...row, metadata: detectLegacySeries(row) });
    expect(calls).toEqual([['eq', 'liability_id', 'L1'], ['not', 'metadata->>installment_number', 'is', null]]);
  });
  it('lançamento da dívida sem número de parcela (ex.: lance) não vira série', () => {
    const meta = detectLegacySeries({ id: 'b', liability_id: 'L1', description: 'Lance', metadata: {} });
    expect(meta.installment_group_id).toBeUndefined();
  });
});
