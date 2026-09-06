import { describe, it, expect } from 'vitest';
import {
  buildPortfolioAnalysis,
  parseYieldRate,
  regressiveTaxRate,
  describeYieldRate,
} from '../api/_lib/portfolio-metrics';
import { getMarketIndexes, type MarketIndexes } from '../api/_lib/market-indexes';

const INDEXES: MarketIndexes = {
  cdi: 10, selic: 10.5, ipca: 4, igpm: 4, source: 'bcb', updatedAt: '2026-09-01T00:00:00.000Z',
};

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().split('T')[0];
const daysAhead = (n: number) => new Date(Date.now() + n * 86400000).toISOString().split('T')[0];

/**
 * Supabase falso: qualquer encadeamento de .select/.eq/.in/.gte/.lte devolve o mesmo
 * objeto, e o await no fim entrega o array registrado para aquela tabela.
 */
function fakeSupabase(tables: Record<string, any[]>) {
  const makeChain = (table: string) => {
    const rows = tables[table] || [];
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      in: () => chain,
      gte: () => chain,
      lte: () => chain,
      order: () => chain,
      maybeSingle: () => Promise.resolve({ data: null }),
      then: (resolve: any) => resolve({ data: rows, error: null }),
    };
    return chain;
  };
  return { from: (table: string) => makeChain(table) };
}

describe('parseYieldRate', () => {
  it('trata percentual do CDI', () => {
    expect(parseYieldRate('110', 'CDI', INDEXES)).toBeCloseTo(11, 5);
    expect(parseYieldRate('95', 'CDI', INDEXES)).toBeCloseTo(9.5, 5);
  });

  it('compõe CDI + spread em vez de somar', () => {
    // (1,10 × 1,02) − 1 = 12,2%
    expect(parseYieldRate('2', 'CDI_PLUS', INDEXES)).toBeCloseTo(12.2, 5);
  });

  it('compõe IPCA + spread', () => {
    // (1,04 × 1,06) − 1 = 10,24%
    expect(parseYieldRate('6', 'IPCA', INDEXES)).toBeCloseTo(10.24, 5);
  });

  it('devolve a taxa crua no pré-fixado', () => {
    expect(parseYieldRate('12,6', 'PRE', INDEXES)).toBeCloseTo(12.6, 5);
  });
});

describe('regressiveTaxRate', () => {
  it('segue a tabela da Lei 11.033/2004', () => {
    expect(regressiveTaxRate(10, false)).toBe(0.225);
    expect(regressiveTaxRate(181, false)).toBe(0.20);
    expect(regressiveTaxRate(400, false)).toBe(0.175);
    expect(regressiveTaxRate(1000, false)).toBe(0.15);
  });

  it('zera para isentos', () => {
    expect(regressiveTaxRate(10, true)).toBe(0);
  });
});

describe('describeYieldRate', () => {
  it('descreve cada indexador', () => {
    expect(describeYieldRate('110', 'CDI')).toBe('110% do CDI');
    expect(describeYieldRate('2', 'CDI_PLUS')).toBe('CDI + 2%');
    expect(describeYieldRate('6', 'IPCA')).toBe('IPCA + 6%');
    expect(describeYieldRate('', 'CDI')).toBe('');
  });
});

describe('buildPortfolioAnalysis', () => {
  it('devolve carteira vazia sem quebrar quando não há investimento', async () => {
    const sb = fakeSupabase({ physical_assets: [], accounts: [], transactions: [] });
    const result = await buildPortfolioAnalysis(sb, 'u1', INDEXES);
    expect(result.positions).toHaveLength(0);
    expect(result.totals.gross).toBe(0);
    expect(result.alerts).toEqual([]);
  });

  it('calcula ganho, IR regressivo e comparação com o CDI de um CDB', async () => {
    const sb = fakeSupabase({
      physical_assets: [{
        id: 'a1', name: 'CDB Banco X', estimated_value: 11000,
        acquisition_date: daysAgo(365),
        metadata: {
          investmentType: 'CDB', interestType: 'CDI', yieldRate: '95',
          purchaseValue: 10000, issuer: 'Banco X', liquidityDays: 0,
          vencimentoDate: daysAhead(400),
        },
      }],
      accounts: [], transactions: [], investment_movements: [], investment_reminders: [],
    });

    const result = await buildPortfolioAnalysis(sb, 'u1', INDEXES);
    const p = result.positions[0];

    expect(p.appliedValue).toBe(10000);
    expect(p.gainValue).toBe(1000);
    expect(p.gainPercent).toBe(10);
    // 365 dias já passou dos 360 → faixa de 17,5% da tabela regressiva
    expect(p.taxRatePercent).toBe(17.5);
    expect(p.estimatedTaxValue).toBe(175);
    expect(p.netValue).toBe(10825);
    // 95% do CDI de 10% = 9,5% a.a.
    expect(p.contractedAnnualPercent).toBe(9.5);
    expect(p.vsCdiPercent).toBe(95);
    expect(p.flags).toContain('ABAIXO_DO_CDI');
    expect(result.alerts.some(a => a.code === 'RENDIMENTO_ABAIXO_CDI')).toBe(true);
  });

  it('não anualiza um ativo com menos de 30 dias e sinaliza a janela de IOF', async () => {
    const sb = fakeSupabase({
      physical_assets: [{
        id: 'a1', name: 'CDB Novo', estimated_value: 10050,
        acquisition_date: daysAgo(5),
        metadata: { investmentType: 'CDB', interestType: 'CDI', yieldRate: '100', purchaseValue: 10000 },
      }],
      accounts: [], transactions: [], investment_movements: [], investment_reminders: [],
    });

    const result = await buildPortfolioAnalysis(sb, 'u1', INDEXES);
    const p = result.positions[0];
    expect(p.annualizedGainPercent).toBeNull();
    expect(p.inIofWindow).toBe(true);
    expect(p.flags).toContain('JANELA_IOF');
  });

  it('acusa exposição acima do teto do FGC somando por emissor', async () => {
    const sb = fakeSupabase({
      physical_assets: [
        { id: 'a1', name: 'CDB 1', estimated_value: 200000, acquisition_date: daysAgo(400), metadata: { investmentType: 'CDB', issuer: 'Banco Y', purchaseValue: 200000 } },
        { id: 'a2', name: 'CDB 2', estimated_value: 120000, acquisition_date: daysAgo(400), metadata: { investmentType: 'CDB', issuer: 'Banco Y', purchaseValue: 120000 } },
      ],
      accounts: [], transactions: [], investment_movements: [], investment_reminders: [],
    });

    const result = await buildPortfolioAnalysis(sb, 'u1', INDEXES);
    const banco = result.allocationByIssuer.find(i => i.issuer === 'Banco Y');
    expect(banco?.value).toBe(320000);
    expect(banco?.fgcExcess).toBe(70000);
    expect(result.fgc.issuersOverLimit).toBe(1);
    const alert = result.alerts.find(a => a.code === 'FGC_EXCEDIDO');
    expect(alert?.severity).toBe('HIGH');
  });

  it('não trata Tesouro e debênture como cobertos pelo FGC', async () => {
    const sb = fakeSupabase({
      physical_assets: [
        { id: 'a1', name: 'Tesouro Selic', estimated_value: 400000, acquisition_date: daysAgo(400), metadata: { investmentType: 'TESOURO', issuer: 'Tesouro Nacional', purchaseValue: 400000 } },
        { id: 'a2', name: 'Deb XPTO', estimated_value: 300000, acquisition_date: daysAgo(400), metadata: { investmentType: 'DEBENTURES', issuer: 'XPTO', purchaseValue: 300000 } },
      ],
      accounts: [], transactions: [], investment_movements: [], investment_reminders: [],
    });

    const result = await buildPortfolioAnalysis(sb, 'u1', INDEXES);
    expect(result.allocationByIssuer).toHaveLength(0);
    expect(result.fgc.excessValue).toBe(0);
    expect(result.positions.every(p => p.fgcCovered === false)).toBe(true);
  });

  it('usa a soma dos aportes do extrato como custo, não o valor declarado', async () => {
    const sb = fakeSupabase({
      physical_assets: [{
        id: 'a1', name: 'CDB Aportado', estimated_value: 22000, acquisition_date: daysAgo(800),
        metadata: { investmentType: 'CDB', purchaseValue: 10000 },
      }],
      investment_movements: [
        { asset_id: 'a1', movement_type: 'APORTE', amount: 10000, movement_date: daysAgo(800) },
        { asset_id: 'a1', movement_type: 'APORTE', amount: 10000, movement_date: daysAgo(100) },
        { asset_id: 'a1', movement_type: 'RESGATE', amount: 5000, movement_date: daysAgo(50) },
      ],
      accounts: [], transactions: [], investment_reminders: [],
    });

    const result = await buildPortfolioAnalysis(sb, 'u1', INDEXES);
    const p = result.positions[0];
    // RESGATE não entra no custo; só os dois aportes.
    expect(p.appliedValue).toBe(20000);
    expect(p.gainValue).toBe(2000);
    // IR ponderado: metade a 15% (800 dias) e metade a 22,5% (100 dias) = 18,75%
    expect(p.taxRatePercent).toBeCloseTo(18.75, 2);
  });

  it('dimensiona a reserva de emergência e alerta quando cobre menos de 3 meses', async () => {
    const sb = fakeSupabase({
      physical_assets: [{
        id: 'a1', name: 'CDB Liquidez Diária', estimated_value: 3000, acquisition_date: daysAgo(400),
        metadata: { investmentType: 'CDB', purchaseValue: 3000, liquidityDays: 0 },
      }],
      accounts: [{ id: 'c1', institution: 'Banco Z', type: 'CHECKING', current_balance: 1000 }],
      transactions: [
        { amount: 9000, type: 'EXPENSE', date: daysAgo(10), is_amortization: false },
        { amount: 9000, type: 'EXPENSE', date: daysAgo(40), is_amortization: false },
        { amount: 9000, type: 'EXPENSE', date: daysAgo(70), is_amortization: false },
      ],
      investment_movements: [], investment_reminders: [],
    });

    const result = await buildPortfolioAnalysis(sb, 'u1', INDEXES);
    expect(result.emergencyFund.avgMonthlyExpense).toBe(9000);
    expect(result.emergencyFund.targetValue).toBe(54000);
    expect(result.emergencyFund.availableValue).toBe(4000);
    expect(result.emergencyFund.monthsCovered).toBeCloseTo(0.44, 2);
    expect(result.alerts.some(a => a.code === 'RESERVA_INSUFICIENTE')).toBe(true);
  });

  it('não compara realizado x contratado em ativo que paga cupom mensal', async () => {
    const sb = fakeSupabase({
      physical_assets: [{
        id: 'a1', name: 'CRI Cupom', estimated_value: 10000, acquisition_date: daysAgo(400),
        metadata: { investmentType: 'CRI_CRA', interestType: 'IPCA', yieldRate: '6', purchaseValue: 10000, payoutType: 'MENSAL' },
      }],
      accounts: [], transactions: [], investment_movements: [], investment_reminders: [],
    });

    const result = await buildPortfolioAnalysis(sb, 'u1', INDEXES);
    const p = result.positions[0];
    expect(p.comparableToContracted).toBe(false);
    expect(p.realizedVsContractedPP).toBeNull();
    expect(p.isTaxExempt).toBe(true);
    expect(p.estimatedTaxValue).toBe(0);
  });

  it('sinaliza concentração e lista as lacunas de cadastro', async () => {
    const sb = fakeSupabase({
      physical_assets: [
        { id: 'a1', name: 'CDB Grande', estimated_value: 90000, acquisition_date: daysAgo(400), metadata: { investmentType: 'CDB', purchaseValue: 90000 } },
        { id: 'a2', name: 'CDB Pequeno', estimated_value: 10000, acquisition_date: daysAgo(400), metadata: { investmentType: 'CDB', purchaseValue: 10000 } },
      ],
      accounts: [], transactions: [], investment_movements: [], investment_reminders: [],
    });

    const result = await buildPortfolioAnalysis(sb, 'u1', INDEXES);
    expect(result.concentration.largestPositionPercent).toBe(90);
    expect(result.alerts.some(a => a.code === 'CONCENTRACAO_ATIVO')).toBe(true);
    // Nenhum dos dois tem taxa nem emissor cadastrado.
    expect(result.dataGaps.join(' ')).toContain('sem taxa/indexador');
    expect(result.dataGaps.join(' ')).toContain('sem emissor');
    expect(result.totals.weightedAvgContractedAnnualPercent).toBeNull();
  });

  it('ignora ativos resgatados', async () => {
    const sb = fakeSupabase({
      physical_assets: [
        { id: 'a1', name: 'CDB Ativo', estimated_value: 1000, acquisition_date: daysAgo(400), metadata: { investmentType: 'CDB', purchaseValue: 1000 } },
        { id: 'a2', name: 'CDB Resgatado', estimated_value: 5000, acquisition_date: daysAgo(400), metadata: { investmentType: 'CDB', purchaseValue: 5000, status: 'RESGATADO' } },
      ],
      accounts: [], transactions: [], investment_movements: [], investment_reminders: [],
    });

    const result = await buildPortfolioAnalysis(sb, 'u1', INDEXES);
    expect(result.positions).toHaveLength(1);
    expect(result.totals.gross).toBe(1000);
  });

  it('só indica pesquisa externa para ativos com identificador cadastrado', async () => {
    const sb = fakeSupabase({
      physical_assets: [
        { id: 'a1', name: 'Fundo Alpha', estimated_value: 5000, acquisition_date: daysAgo(400), metadata: { investmentType: 'FUNDOS', purchaseValue: 5000, identifier: '12.345.678/0001-90' } },
        { id: 'a2', name: 'Fundo Sem CNPJ', estimated_value: 5000, acquisition_date: daysAgo(400), metadata: { investmentType: 'FUNDOS', purchaseValue: 5000 } },
      ],
      accounts: [], transactions: [], investment_movements: [], investment_reminders: [],
    });

    const result = await buildPortfolioAnalysis(sb, 'u1', INDEXES);
    expect(result.researchTargets).toHaveLength(2);
    expect(result.researchTargets.filter(t => t.identifier)).toHaveLength(1);
  });
});

describe('getMarketIndexes', () => {
  it('usa o cache do BCB quando está fresco', async () => {
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: { cdi: 14.9, selic: 15, ipca: 4.5, igpm: 3.2, source: 'bcb', updated_at: new Date().toISOString() },
            }),
          }),
        }),
      }),
    };
    const idx = await getMarketIndexes(sb, 'u1');
    expect(idx.source).toBe('bcb');
    expect(idx.cdi).toBe(14.9);
  });

  it('cai para os Ajustes do usuário quando o cache está velho', async () => {
    const old = new Date(Date.now() - 60 * 86400000).toISOString();
    const sb = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve(
              table === 'market_indexes_cache'
                ? { data: { cdi: 10, selic: 10, ipca: 4, igpm: 4, updated_at: old } }
                : { data: { market_indexes: { cdi: 12.3, ipca: 5 } } }
            ),
          }),
        }),
      }),
    };
    const idx = await getMarketIndexes(sb, 'u1');
    expect(idx.source).toBe('user_settings');
    expect(idx.cdi).toBe(12.3);
    expect(idx.ipca).toBe(5);
  });

  it('respeita o override manual do usuário mesmo com cache fresco', async () => {
    const sb = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve(
              table === 'market_indexes_cache'
                ? { data: { cdi: 14.9, selic: 15, ipca: 4.5, igpm: 3.2, updated_at: new Date().toISOString() } }
                : { data: { market_indexes: { cdi: 8, ipca: 3, igpm: 3, manual: true } } }
            ),
          }),
        }),
      }),
    };
    const idx = await getMarketIndexes(sb, 'u1');
    expect(idx.source).toBe('user_settings');
    expect(idx.cdi).toBe(8);
  });

  it('nunca lança: cai no fallback quando tudo falha', async () => {
    const sb = { from: () => { throw new Error('banco fora do ar'); } };
    const idx = await getMarketIndexes(sb, 'u1');
    expect(idx.source).toBe('fallback');
    expect(idx.cdi).toBeGreaterThan(0);
  });
});
