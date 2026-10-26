import { describe, it, expect } from 'vitest';
import { simulatePlan, aggregatePlans, installmentsToPct } from '../lib/consortiumSimulator';
import { blankQuota } from '../lib/consortiumSimState';
import { quotaTable, totalRow, monthlyTable, yearlyTable, premisesRows, QUOTA_HEADER, ExportInput } from '../lib/consortiumSimExport';

/** Tabelas da exportação: os números saem do motor, como números (planilha faz conta). */
const build = (): ExportInput => {
  const quotas = [
    { ...blankQuota(1), name: 'Ademicon 570 A', credit: '171789,09', term: '132', adm: '24', fr: '0', unit: 'INST' as const, baseTerm: '240', emb: '60', free: '72' },
    { ...blankQuota(2), name: 'Nova', credit: '100000', term: '24', adm: '0', fr: '0' }
  ];
  const results = [
    simulatePlan({ credit: 171789.09, termMonths: 132, adminFeePct: 24, contemplationMonth: 1, embeddedBidPct: installmentsToPct(60, 124, 240), freeBidPct: installmentsToPct(72, 124, 240) }),
    simulatePlan({ credit: 100000, termMonths: 24, adminFeePct: 0, contemplationMonth: 1 })
  ];
  const agg = aggregatePlans(results);
  return { title: 'Teste', premises: { index: '0', insurance: '0', opportunity: '11,6' }, quotas, results, summaries: agg.quotas, total: agg.total, monthly: agg.monthly, generatedAt: new Date('2026-10-26T12:00:00Z') };
};

describe('exportação da simulação', () => {
  it('uma linha por cota, com as colunas do cabeçalho e números de verdade', () => {
    const input = build();
    const rows = quotaTable(input);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(QUOTA_HEADER.length);
    expect(rows[0][0]).toBe('Ademicon 570 A');
    expect(rows[0][1]).toBe('Nova');
    expect(rows[0][10]).toBeCloseTo(118534.4, 0);   // crédito líquido
    expect(rows[0][11]).toBeCloseTo(54628.8, 0);    // saque líquido
    expect(typeof rows[0][12]).toBe('number');
  });

  it('linha de total soma as cotas', () => {
    const input = build();
    const t = totalRow(input);
    expect(t[0]).toBe('Total');
    expect(t[2]).toBeCloseTo(271789.09, 2);
    expect(t[10]).toBeCloseTo(input.summaries[0].netCredit + 100000, 2);
  });

  it('parcelas mês a mês e por ano batem com o total', () => {
    const input = build();
    const m = monthlyTable(input);
    expect(m).toHaveLength(132);
    expect(m[0][0]).toBe(1);
    expect(m[0][3]).toBeCloseTo(Number(m[0][1]) + Number(m[0][2]), 1); // cada coluna arredondada
    expect(m[30][2]).toBe(0); // a cota de 24 meses já acabou
    const y = yearlyTable(input);
    expect(y).toHaveLength(11);
    const sumYears = y.reduce((s, r) => s + Number(r[r.length - 1]), 0);
    expect(sumYears).toBeCloseTo(input.monthly.reduce((s, v) => s + v, 0), 0);
  });

  it('premissas e aviso de simulação', () => {
    const p = premisesRows(build());
    expect(p.find(r => r[0] === 'Aviso')![1]).toMatch(/Simulação/);
    expect(p.find(r => r[0] === 'Rendimento do dinheiro (% a.a.)')![1]).toBe('11,6');
  });
});
