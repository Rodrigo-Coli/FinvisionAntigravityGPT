import { describe, it, expect } from 'vitest';
import { resolveTaxRegime, taxRateFor, iofRateFor, calendarDaysBetween, computeInvestmentTax } from '../lib/investmentTax';

describe('regime de IR por tipo', () => {
  it('isentos, renda variável, fundos e previdência', () => {
    expect(resolveTaxRegime({ investmentType: 'LCI_LCA' })).toBe('ISENTO');
    expect(resolveTaxRegime({ investmentType: 'CDB', isTaxExempt: true })).toBe('ISENTO');
    expect(resolveTaxRegime({ investmentType: 'CDB' })).toBe('RENDA_FIXA');
    expect(resolveTaxRegime({ investmentType: 'FIIS' })).toBe('FII');
    expect(resolveTaxRegime({ investmentType: 'FUNDOS' })).toBe('RENDA_FIXA');
    expect(resolveTaxRegime({ investmentType: 'FUNDOS', fundTaxClass: 'ACOES' })).toBe('FUNDO_ACOES');
    expect(resolveTaxRegime({ investmentType: 'FUNDOS', fundTaxClass: 'CURTO_PRAZO' })).toBe('FUNDO_CURTO_PRAZO');
    expect(resolveTaxRegime({ investmentType: 'PREVIDENCIA' })).toBe('PREV_REGRESSIVA');
    expect(resolveTaxRegime({ investmentType: 'PREVIDENCIA', pensionTaxTable: 'PROGRESSIVA' })).toBe('PREV_PROGRESSIVA');
  });
});

describe('tabelas', () => {
  it('regressiva de renda fixa nas bordas', () => {
    expect(taxRateFor('RENDA_FIXA', 180)).toBe(0.225);
    expect(taxRateFor('RENDA_FIXA', 181)).toBe(0.20);
    expect(taxRateFor('RENDA_FIXA', 360)).toBe(0.20);
    expect(taxRateFor('RENDA_FIXA', 361)).toBe(0.175);
    expect(taxRateFor('RENDA_FIXA', 720)).toBe(0.175);
    expect(taxRateFor('RENDA_FIXA', 721)).toBe(0.15);
  });
  it('curto prazo, previdência', () => {
    expect(taxRateFor('FUNDO_CURTO_PRAZO', 181)).toBe(0.20);
    expect(taxRateFor('FUNDO_CURTO_PRAZO', 2000)).toBe(0.20);
    expect(taxRateFor('PREV_REGRESSIVA', 730)).toBe(0.35);
    expect(taxRateFor('PREV_REGRESSIVA', 731)).toBe(0.30);
    expect(taxRateFor('PREV_REGRESSIVA', 4000)).toBe(0.10);
  });
  it('IOF', () => {
    expect(iofRateFor('RENDA_FIXA', 1)).toBe(0.96);
    expect(iofRateFor('RENDA_FIXA', 29)).toBe(0.03);
    expect(iofRateFor('RENDA_FIXA', 30)).toBe(0);
    expect(iofRateFor('FII', 5)).toBe(0);
    expect(iofRateFor('FUNDO_ACOES', 5)).toBe(0);
  });
  it('dias corridos sem erro de hora', () => {
    expect(calendarDaysBetween('2026-02-27', '2026-09-29')).toBe(214);
    expect(calendarDaysBetween('2026-01-01', '2026-06-30')).toBe(180);
  });
});

describe('IR estimado', () => {
  it('caso real do Western Asset: 214 dias → 20%', () => {
    const r = computeInvestmentTax({ meta: { investmentType: 'FUNDOS' }, lots: [{ amount: 2076.53, date: '2026-02-27' }], cost: 2076.53, gross: 2098.26, today: '2026-09-29' });
    expect(r.taxAmount).toBe(4.35);
    expect(r.iofAmount).toBe(0);
  });

  it('aporte novo não herda lucro do aporte antigo', () => {
    // 10 mil há 800 dias + 10 mil ontem; rendimento de 2 mil.
    const r = computeInvestmentTax({
      meta: { investmentType: 'CDB' },
      lots: [{ amount: 10000, date: '2024-07-21' }, { amount: 10000, date: '2026-09-28' }],
      cost: 20000, gross: 22000, today: '2026-09-29'
    });
    // quase tudo a 15% (antes: metade a 15% e metade a 22,5% = 375)
    expect(r.taxAmount).toBeGreaterThan(299);
    expect(r.taxAmount).toBeLessThan(302);
  });

  it('IOF nos primeiros dias reduz a base do IR', () => {
    const r = computeInvestmentTax({ meta: { investmentType: 'CDB' }, lots: [{ amount: 1000, date: '2026-09-19' }], cost: 1000, gross: 1010, today: '2026-09-29' });
    // 10 dias: IOF 66% de 10 = 6,60; IR 22,5% de 3,40 = 0,77
    expect(r.iofAmount).toBe(6.6);
    expect(r.taxAmount).toBeCloseTo(0.765, 1);
  });

  it('renda variável e isentos', () => {
    const fii = computeInvestmentTax({ meta: { investmentType: 'FIIS' }, lots: [{ amount: 1000, date: '2026-01-01' }], cost: 1000, gross: 1100, today: '2026-09-29' });
    expect(fii.taxAmount).toBe(20);
    const lci = computeInvestmentTax({ meta: { investmentType: 'LCI_LCA' }, lots: [{ amount: 1000, date: '2026-01-01' }], cost: 1000, gross: 1100, today: '2026-09-29' });
    expect(lci.taxAmount).toBe(0);
  });

  it('prejuízo não gera IR', () => {
    const r = computeInvestmentTax({ meta: { investmentType: 'CDB' }, lots: [{ amount: 1000, date: '2026-01-01' }], cost: 1000, gross: 950, today: '2026-09-29' });
    expect(r.taxAmount).toBe(0);
  });

  it('previdência PGBL tributa o valor total; VGBL só o rendimento', () => {
    const lots = [{ amount: 1000, date: '2020-01-01' }];
    const vgbl = computeInvestmentTax({ meta: { investmentType: 'PREVIDENCIA' }, lots, cost: 1000, gross: 1500, today: '2026-09-29' });
    expect(vgbl.taxAmount).toBe(100); // 20% (6–8 anos) de 500
    const pgbl = computeInvestmentTax({ meta: { investmentType: 'PREVIDENCIA', pensionPlanType: 'PGBL' }, lots, cost: 1000, gross: 1500, today: '2026-09-29' });
    expect(pgbl.taxAmount).toBe(300); // 20% de 1.500
  });
});

describe('alíquota exibida', () => {
  it('é a da tabela, não IR/rendimento arredondado nem afetada pelo IOF', () => {
    const w = computeInvestmentTax({ meta: { investmentType: 'FUNDOS' }, lots: [{ amount: 2076.53, date: '2026-02-27' }], cost: 2076.53, gross: 2098.26, today: '2026-09-29' });
    expect(w.effectiveRate).toBe(0.2);
    const c = computeInvestmentTax({ meta: { investmentType: 'CDB' }, lots: [{ amount: 1000, date: '2026-09-19' }], cost: 1000, gross: 1010, today: '2026-09-29' });
    expect(c.effectiveRate).toBe(0.225);
  });
});
