// Camada DETERMINÍSTICA da análise de investimentos.
//
// Princípio: a IA não faz conta — ela interpreta conta pronta. Tudo que é número
// (rentabilidade, anualização, IR, concentração, cobertura FGC, liquidez) é calculado
// aqui, em código testável, e entregue ao modelo já mastigado. O modelo só decide o
// veredito, a prioridade e a linguagem.
//
// Consumido por: ai-financial-tools.ts (tool get_portfolio_analysis),
// handle-investment-analysis.ts (relatório completo) e handle-wealth-analysis.ts.
//
// Como o resto de api/_lib/, este arquivo NÃO importa de lib/ (ver comentário em
// ai-financial-tools.ts:22 — é o caminho comprovado como seguro no empacotamento das
// functions da Vercel). Por isso parseYieldRate/describeYieldRate/regressiveTaxRate
// aparecem reimplementados aqui, espelhando lib/financialEngine.ts.

import type { MarketIndexes } from './market-indexes.js';

const INVEST_TYPE_LABEL: Record<string, string> = {
  CDB: 'CDB', LCI_LCA: 'LCI/LCA', TESOURO: 'Tesouro', DEBENTURES: 'Debêntures',
  CRI_CRA: 'CRI/CRA', COE: 'COE', ACOES: 'Ações', FIIS: 'FIIs', FUNDOS: 'Fundos',
  CRIPTO: 'Cripto', PREVIDENCIA: 'Previdência', POUPANCA: 'Poupança', OUTROS: 'Outros',
};

const VARIABLE_INCOME = ['ACOES', 'FIIS', 'CRIPTO', 'FUNDOS'];
const TAX_EXEMPT_TYPES = ['LCI_LCA', 'CRI_CRA', 'POUPANCA'];
// Cobertura do FGC (Res. CMN 4.222/2013 e alterações): CDB, LCI/LCA, LC e poupança.
// Tesouro é risco soberano (não precisa de FGC); debênture, CRI/CRA, COE, fundo, ação
// e cripto NÃO têm cobertura nenhuma.
const FGC_COVERED_TYPES = ['CDB', 'LCI_LCA', 'POUPANCA'];
const FGC_LIMIT_PER_ISSUER = 250000;
const FGC_GLOBAL_CEILING = 1000000;

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const pct = (part: number, whole: number) => (whole > 0 ? round2((part / whole) * 100) : 0);

/** Tabela regressiva de IR de renda fixa (Lei 11.033/2004). */
export function regressiveTaxRate(days: number, isExempt: boolean): number {
  if (isExempt) return 0;
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.20;
  if (days <= 720) return 0.175;
  return 0.15;
}

function compoundRates(indexPercent: number, spreadPercent: number): number {
  return ((1 + indexPercent / 100) * (1 + spreadPercent / 100) - 1) * 100;
}

/** Converte "105" + CDI, "IPCA + 6", "12,6" pré etc. em % a.a., usando índices reais. */
export function parseYieldRate(yieldRateStr: string, indexType: string, indexes: MarketIndexes): number {
  const rawVal = parseFloat((yieldRateStr || '').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
  const indexUpper = (indexType || '').toUpperCase();
  const rateUpper = (yieldRateStr || '').toUpperCase();

  if (indexUpper === 'CDI_PLUS' || /CDI\s*\+/.test(rateUpper)) return compoundRates(indexes.cdi, rawVal);
  if (indexUpper === 'IGPM' || rateUpper.includes('IGP')) return compoundRates(indexes.igpm, rawVal);
  if (rateUpper.includes('CDI') || indexUpper === 'CDI') {
    const percentage = yieldRateStr.includes('%') ? rawVal / 100 : (rawVal > 2 ? rawVal / 100 : rawVal);
    return (percentage || 1) * indexes.cdi;
  }
  if (rateUpper.includes('IPCA') || indexUpper === 'IPCA') return compoundRates(indexes.ipca, rawVal);
  return rawVal;
}

export function describeYieldRate(yieldRateStr: string, indexType: string): string {
  const rate = (yieldRateStr || '').trim();
  if (!rate) return '';
  switch ((indexType || '').toUpperCase()) {
    case 'CDI': return `${rate}% do CDI`;
    case 'CDI_PLUS': return `CDI + ${rate}%`;
    case 'IPCA': return `IPCA + ${rate}%`;
    case 'IGPM': return `IGP-M + ${rate}%`;
    case 'PRE': return `${rate}% a.a.`;
    default: return rate;
  }
}

const daysBetween = (fromISO: string, toMs = Date.now()): number => {
  const t = new Date(String(fromISO).split('T')[0] + 'T00:00:00Z').getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.floor((toMs - t) / 86400000);
};

export interface PortfolioAlert {
  code: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  detail: string;
  valueAtStake?: number;
}

export interface PortfolioPosition {
  id: string;
  name: string;
  typeCode: string;
  type: string;
  issuer: string | null;
  broker: string | null;
  identifier: string | null;
  appliedValue: number;
  grossValue: number;
  gainValue: number;
  gainPercent: number;
  annualizedGainPercent: number | null;
  taxRatePercent: number;
  estimatedTaxValue: number;
  netValue: number;
  contractedRateLabel: string | null;
  contractedAnnualPercent: number | null;
  realizedVsContractedPP: number | null;
  comparableToContracted: boolean;
  vsCdiPercent: number | null;
  daysHeld: number;
  maturityDate: string | null;
  daysToMaturity: number | null;
  liquidityLabel: string;
  liquidityDays: number | null;
  liquidityAtMaturity: boolean;
  payoutType: string;
  isVariableIncome: boolean;
  isTaxExempt: boolean;
  fgcCovered: boolean;
  inIofWindow: boolean;
  userNote: string | null;
  flags: string[];
}

export interface PortfolioAnalysis {
  generatedAt: string;
  marketIndexes: MarketIndexes;
  positions: PortfolioPosition[];
  totals: {
    applied: number; gross: number; net: number;
    gainValue: number; gainPercent: number;
    annualizedGainPercent: number | null;
    estimatedTaxValue: number;
    weightedAvgContractedAnnualPercent: number | null;
    portfolioVsCdiPP: number | null;
  };
  allocationByType: { type: string; value: number; percent: number; positions: number }[];
  allocationByIssuer: { issuer: string; value: number; percent: number; fgcCovered: number; fgcExcess: number }[];
  allocationByBroker: { broker: string; value: number; percent: number }[];
  concentration: {
    largestPositionName: string | null; largestPositionPercent: number;
    top3Percent: number; largestTypePercent: number; largestTypeName: string | null;
  };
  liquidity: {
    immediateValue: number; immediatePercent: number;
    upTo30DaysValue: number; upTo90DaysValue: number;
    onlyAtMaturityValue: number; onlyAtMaturityPercent: number;
    cashInAccountsValue: number;
  };
  emergencyFund: {
    avgMonthlyExpense: number; targetValue: number;
    availableValue: number; monthsCovered: number | null; gapValue: number;
  };
  maturities: {
    next90Days: { name: string; date: string; daysToMaturity: number; grossValue: number }[];
    weightedAvgDaysToMaturity: number | null;
  };
  fgc: { totalCoveredValue: number; excessValue: number; globalCeiling: number; issuersOverLimit: number };
  alerts: PortfolioAlert[];
  dataGaps: string[];
  researchTargets: { name: string; type: string; identifier: string | null; issuer: string | null }[];
}

/**
 * Carrega e calcula tudo. Nunca lança por dado faltando: o que não dá para calcular
 * vira `null` + uma entrada em `dataGaps`, que a IA usa para pedir o cadastro certo.
 */
export async function buildPortfolioAnalysis(
  supabase: any,
  userId: string,
  indexes: MarketIndexes
): Promise<PortfolioAnalysis> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];

  const [assetsRes, accountsRes, txRes] = await Promise.all([
    // is_archived: mesma regra da tela de Investimentos (pages/Assets.tsx:919) — ativo
    // arquivado não entra na análise nem nos totais.
    supabase.from('physical_assets')
      .select('id, name, metadata, estimated_value, acquisition_date')
      .eq('user_id', userId).eq('category', 'INVESTMENT').eq('is_archived', false),
    supabase.from('accounts')
      .select('id, institution, type, current_balance').eq('user_id', userId).eq('is_archived', false),
    supabase.from('transactions')
      .select('amount, type, date, is_amortization')
      .eq('user_id', userId).eq('is_deleted', false)
      .gte('date', ninetyDaysAgo).lte('date', new Date().toISOString().split('T')[0]),
  ]);

  const activeAssets = (assetsRes.data || []).filter((a: any) => a.metadata?.status !== 'RESGATADO');
  const assetIds = activeAssets.map((a: any) => a.id);

  const [movementsRes, remindersRes] = assetIds.length
    ? await Promise.all([
        supabase.from('investment_movements')
          .select('asset_id, movement_type, amount, movement_date').in('asset_id', assetIds),
        supabase.from('investment_reminders').select('asset_id, note').in('asset_id', assetIds),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];

  // Custo = soma dos APORTES do extrato (mesma regra de pages/Assets.tsx:1011); só cai
  // no valor declarado no cadastro quando o ativo ainda não tem extrato.
  const lotsByAsset = new Map<string, { amount: number; date: string }[]>();
  (movementsRes.data || []).forEach((mv: any) => {
    if (mv.movement_type !== 'APORTE') return;
    const amount = Number(mv.amount || 0);
    if (amount <= 0) return;
    const list = lotsByAsset.get(mv.asset_id) || [];
    list.push({ amount, date: String(mv.movement_date).split('T')[0] });
    lotsByAsset.set(mv.asset_id, list);
  });
  lotsByAsset.forEach(list => list.sort((a, b) => (a.date < b.date ? -1 : 1)));

  const noteByAsset = new Map<string, string>(
    (remindersRes.data || []).map((r: any) => [r.asset_id, r.note])
  );
  const accounts = accountsRes.data || [];
  const brokerNameById = new Map<string, string>(
    accounts.filter((a: any) => a.type === 'INVESTMENT').map((a: any) => [a.id, a.institution])
  );
  const cashInAccounts = accounts
    .filter((a: any) => ['CHECKING', 'SAVINGS', 'CASH'].includes(a.type))
    .reduce((s: number, a: any) => s + Number(a.current_balance || 0), 0);

  const dataGaps: string[] = [];
  const positions: PortfolioPosition[] = [];

  for (const asset of activeAssets) {
    const meta = asset.metadata || {};
    const typeCode = String(meta.investmentType || 'OUTROS');
    const isVariableIncome = VARIABLE_INCOME.includes(typeCode);
    const isTaxExempt = !!meta.isTaxExempt || TAX_EXEMPT_TYPES.includes(typeCode);

    const grossValue = round2(Number(asset.estimated_value || 0));
    const lots = lotsByAsset.get(asset.id) || [];
    const ledgerTotal = lots.reduce((s, l) => s + l.amount, 0);
    const declaredPurchase = Number(meta.purchaseValue ?? meta.initialInvestmentAmount ?? grossValue) || 0;
    const appliedValue = round2(ledgerTotal > 0 ? ledgerTotal : declaredPurchase);

    const firstLotDate = lots[0]?.date || (asset.acquisition_date ? String(asset.acquisition_date).split('T')[0] : null);
    const daysHeld = firstLotDate ? Math.max(0, daysBetween(firstLotDate)) : 0;

    const gainValue = round2(grossValue - appliedValue);
    const gainPercent = pct(gainValue, appliedValue);

    // Anualização só faz sentido com histórico mínimo: abaixo de 30 dias, extrapolar
    // um ganho de poucos dias produz "800% a.a." e contamina o relatório inteiro.
    const annualizedGainPercent =
      daysHeld >= 30 && appliedValue > 0 && grossValue > 0
        ? round2((Math.pow(grossValue / appliedValue, 365 / daysHeld) - 1) * 100)
        : null;

    // IR estimado sobre o lucro. Renda variável: alíquota de ganho de capital.
    // Renda fixa: tabela regressiva ponderada aporte a aporte (cada aplicação carrega
    // a alíquota do seu próprio prazo — mesma regra de pages/Assets.tsx).
    let taxRate = 0;
    if (!isTaxExempt) {
      if (isVariableIncome) {
        taxRate = typeCode === 'FIIS' ? 0.20 : 0.15;
      } else if (lots.length > 0 && ledgerTotal > 0) {
        taxRate = lots.reduce((acc, lot) => {
          const lotDays = Math.max(0, daysBetween(lot.date));
          return acc + regressiveTaxRate(lotDays, false) * (lot.amount / ledgerTotal);
        }, 0);
      } else {
        taxRate = regressiveTaxRate(daysHeld, false);
      }
    }
    const estimatedTaxValue = gainValue > 0 ? round2(gainValue * taxRate) : 0;
    const netValue = round2(grossValue - estimatedTaxValue);

    const contractedRateLabel = meta.yieldRate ? describeYieldRate(meta.yieldRate, meta.interestType || 'PRE') : null;
    const contractedAnnualPercent = meta.yieldRate
      ? round2(parseYieldRate(meta.yieldRate, meta.interestType || 'PRE', indexes))
      : null;

    // Cupom mensal sai do saldo do ativo e cai na conta: o saldo bruto passa a
    // subestimar o retorno, então comparar realizado x contratado seria injusto.
    const payoutType = String(meta.payoutType || 'ACUMULADO');
    const comparableToContracted =
      !isVariableIncome && payoutType !== 'MENSAL' && daysHeld >= 30 && contractedAnnualPercent !== null;
    const realizedVsContractedPP =
      comparableToContracted && annualizedGainPercent !== null && contractedAnnualPercent !== null
        ? round2(annualizedGainPercent - contractedAnnualPercent)
        : null;

    const referenceAnnual = contractedAnnualPercent ?? annualizedGainPercent;
    const vsCdiPercent = referenceAnnual !== null && indexes.cdi > 0
      ? round2((referenceAnnual / indexes.cdi) * 100)
      : null;

    const maturityDate: string | null = meta.vencimentoDate || null;
    const daysToMaturity = maturityDate ? -daysBetween(maturityDate) : null;

    const liquidityDays = meta.liquidityDays === undefined || meta.liquidityDays === null
      ? null : Number(meta.liquidityDays);
    const liquidityAtMaturity = !!meta.liquidityAtMaturity;
    let liquidityLabel = 'não informada';
    if (liquidityDays !== null) {
      liquidityLabel = liquidityDays === 0 ? 'diária (D+0)' : `D+${liquidityDays}`;
      if (liquidityAtMaturity) liquidityLabel += ' e no vencimento';
    } else if (liquidityAtMaturity) {
      liquidityLabel = 'somente no vencimento';
    }

    const issuer: string | null = meta.issuer || null;
    const broker = meta.brokerAccountId ? (brokerNameById.get(meta.brokerAccountId) || null) : null;
    const identifier: string | null = meta.identifier || meta.cnpj || meta.ticker || null;

    const flags: string[] = [];
    if (!meta.yieldRate && !isVariableIncome) flags.push('SEM_TAXA_CADASTRADA');
    if (!maturityDate && !isVariableIncome && !liquidityAtMaturity) flags.push('SEM_VENCIMENTO');
    if (liquidityDays === null && !liquidityAtMaturity) flags.push('SEM_LIQUIDEZ');
    if (!issuer && FGC_COVERED_TYPES.includes(typeCode)) flags.push('SEM_EMISSOR');
    if (gainValue < 0) flags.push('PREJUIZO');
    if (daysToMaturity !== null && daysToMaturity >= 0 && daysToMaturity <= 30) flags.push('VENCE_EM_30_DIAS');
    if (daysToMaturity !== null && daysToMaturity < 0) flags.push('VENCIDO');
    // IOF regressivo zera só a partir do 30º dia de aplicação (Decreto 6.306/2007).
    const inIofWindow = !isVariableIncome && !isTaxExempt && daysHeld < 30;
    if (inIofWindow) flags.push('JANELA_IOF');
    if (realizedVsContractedPP !== null && realizedVsContractedPP < -1) flags.push('ABAIXO_DO_CONTRATADO');
    if (vsCdiPercent !== null && vsCdiPercent < 100 && !isTaxExempt && !isVariableIncome) flags.push('ABAIXO_DO_CDI');

    positions.push({
      id: asset.id,
      name: asset.name,
      typeCode,
      type: INVEST_TYPE_LABEL[typeCode] || typeCode,
      issuer,
      broker,
      identifier,
      appliedValue,
      grossValue,
      gainValue,
      gainPercent,
      annualizedGainPercent,
      taxRatePercent: round2(taxRate * 100),
      estimatedTaxValue,
      netValue,
      contractedRateLabel,
      contractedAnnualPercent,
      realizedVsContractedPP,
      comparableToContracted,
      vsCdiPercent,
      daysHeld,
      maturityDate,
      daysToMaturity,
      liquidityLabel,
      liquidityDays,
      liquidityAtMaturity,
      payoutType,
      isVariableIncome,
      isTaxExempt,
      fgcCovered: FGC_COVERED_TYPES.includes(typeCode),
      inIofWindow,
      userNote: noteByAsset.get(asset.id) || null,
      flags,
    });
  }

  // ── Totais de carteira ──────────────────────────────────────────────────────
  const totalApplied = round2(positions.reduce((s, p) => s + p.appliedValue, 0));
  const totalGross = round2(positions.reduce((s, p) => s + p.grossValue, 0));
  const totalNet = round2(positions.reduce((s, p) => s + p.netValue, 0));
  const totalTax = round2(positions.reduce((s, p) => s + p.estimatedTaxValue, 0));
  const totalGain = round2(totalGross - totalApplied);

  // Anualização da carteira pelo prazo médio ponderado das posições (aproximação
  // honesta: não temos série histórica de saldo, só custo x valor atual).
  const weightedDaysHeld = totalApplied > 0
    ? positions.reduce((s, p) => s + p.daysHeld * (p.appliedValue / totalApplied), 0)
    : 0;
  const portfolioAnnualized = weightedDaysHeld >= 30 && totalApplied > 0 && totalGross > 0
    ? round2((Math.pow(totalGross / totalApplied, 365 / weightedDaysHeld) - 1) * 100)
    : null;

  const ratedPositions = positions.filter(p => p.contractedAnnualPercent !== null);
  const ratedValue = ratedPositions.reduce((s, p) => s + p.grossValue, 0);
  const weightedContracted = ratedValue > 0
    ? round2(ratedPositions.reduce((s, p) => s + (p.contractedAnnualPercent as number) * (p.grossValue / ratedValue), 0))
    : null;

  const portfolioVsCdiPP = weightedContracted !== null ? round2(weightedContracted - indexes.cdi) : null;

  // ── Alocação e concentração ─────────────────────────────────────────────────
  const groupSum = <K extends string>(keyOf: (p: PortfolioPosition) => K | null) => {
    const map = new Map<string, { value: number; count: number }>();
    positions.forEach(p => {
      const key = keyOf(p);
      if (key === null) return;
      const cur = map.get(key) || { value: 0, count: 0 };
      cur.value = round2(cur.value + p.grossValue);
      cur.count += 1;
      map.set(key, cur);
    });
    return map;
  };

  const allocationByType = Array.from(groupSum(p => p.type).entries())
    .map(([type, v]) => ({ type, value: v.value, percent: pct(v.value, totalGross), positions: v.count }))
    .sort((a, b) => b.value - a.value);

  const allocationByBroker = Array.from(groupSum(p => p.broker || 'Sem corretora vinculada').entries())
    .map(([broker, v]) => ({ broker, value: v.value, percent: pct(v.value, totalGross) }))
    .sort((a, b) => b.value - a.value);

  // FGC é por EMISSOR (o banco que emitiu o CDB), não por corretora. Quando o emissor
  // não está cadastrado, o nome do ativo é o melhor palpite — e vira dataGap.
  const fgcByIssuer = new Map<string, number>();
  positions.filter(p => p.fgcCovered).forEach(p => {
    const key = p.issuer || p.name;
    fgcByIssuer.set(key, round2((fgcByIssuer.get(key) || 0) + p.grossValue));
  });
  const allocationByIssuer = Array.from(fgcByIssuer.entries())
    .map(([issuer, value]) => ({
      issuer,
      value,
      percent: pct(value, totalGross),
      fgcCovered: round2(Math.min(value, FGC_LIMIT_PER_ISSUER)),
      fgcExcess: round2(Math.max(0, value - FGC_LIMIT_PER_ISSUER)),
    }))
    .sort((a, b) => b.value - a.value);

  const sortedByValue = [...positions].sort((a, b) => b.grossValue - a.grossValue);
  const concentration = {
    largestPositionName: sortedByValue[0]?.name || null,
    largestPositionPercent: pct(sortedByValue[0]?.grossValue || 0, totalGross),
    top3Percent: pct(sortedByValue.slice(0, 3).reduce((s, p) => s + p.grossValue, 0), totalGross),
    largestTypePercent: allocationByType[0]?.percent || 0,
    largestTypeName: allocationByType[0]?.type || null,
  };

  // ── Liquidez ────────────────────────────────────────────────────────────────
  const isImmediate = (p: PortfolioPosition) => p.liquidityDays === 0;
  const withinDays = (p: PortfolioPosition, n: number) =>
    (p.liquidityDays !== null && p.liquidityDays <= n) ||
    (p.liquidityAtMaturity && p.daysToMaturity !== null && p.daysToMaturity <= n);
  const immediateValue = round2(positions.filter(isImmediate).reduce((s, p) => s + p.netValue, 0));
  const onlyAtMaturityValue = round2(
    positions.filter(p => p.liquidityAtMaturity && p.liquidityDays === null).reduce((s, p) => s + p.netValue, 0)
  );
  const liquidity = {
    immediateValue,
    immediatePercent: pct(immediateValue, totalNet),
    upTo30DaysValue: round2(positions.filter(p => withinDays(p, 30)).reduce((s, p) => s + p.netValue, 0)),
    upTo90DaysValue: round2(positions.filter(p => withinDays(p, 90)).reduce((s, p) => s + p.netValue, 0)),
    onlyAtMaturityValue,
    onlyAtMaturityPercent: pct(onlyAtMaturityValue, totalNet),
    cashInAccounts: round2(cashInAccounts),
  };

  // ── Reserva de emergência ───────────────────────────────────────────────────
  let expense90d = 0;
  (txRes.data || []).forEach((t: any) => {
    if (t.type === 'EXPENSE' && !t.is_amortization) expense90d += Number(t.amount || 0);
  });
  const avgMonthlyExpense = round2(expense90d / 3);
  const emergencyTarget = round2(avgMonthlyExpense * 6);
  const emergencyAvailable = round2(immediateValue + cashInAccounts);
  const emergencyFund = {
    avgMonthlyExpense,
    targetValue: emergencyTarget,
    availableValue: emergencyAvailable,
    monthsCovered: avgMonthlyExpense > 0 ? round2(emergencyAvailable / avgMonthlyExpense) : null,
    gapValue: round2(Math.max(0, emergencyTarget - emergencyAvailable)),
  };

  // ── Vencimentos ─────────────────────────────────────────────────────────────
  const next90Days = positions
    .filter(p => p.daysToMaturity !== null && p.daysToMaturity >= 0 && p.daysToMaturity <= 90)
    .map(p => ({
      name: p.name,
      date: p.maturityDate as string,
      daysToMaturity: p.daysToMaturity as number,
      grossValue: p.grossValue,
    }))
    .sort((a, b) => a.daysToMaturity - b.daysToMaturity);

  const datedPositions = positions.filter(p => p.daysToMaturity !== null && p.daysToMaturity >= 0);
  const datedValue = datedPositions.reduce((s, p) => s + p.grossValue, 0);
  const weightedAvgDaysToMaturity = datedValue > 0
    ? Math.round(datedPositions.reduce((s, p) => s + (p.daysToMaturity as number) * (p.grossValue / datedValue), 0))
    : null;

  // ── Alertas determinísticos ─────────────────────────────────────────────────
  const alerts: PortfolioAlert[] = [];
  const totalFgcExcess = round2(allocationByIssuer.reduce((s, i) => s + i.fgcExcess, 0));
  const issuersOverLimit = allocationByIssuer.filter(i => i.fgcExcess > 0).length;

  allocationByIssuer.filter(i => i.fgcExcess > 0).forEach(i => {
    alerts.push({
      code: 'FGC_EXCEDIDO',
      severity: 'HIGH',
      title: `Exposição acima do FGC em ${i.issuer}`,
      detail: `R$ ${i.value.toFixed(2)} no mesmo emissor, R$ ${i.fgcExcess.toFixed(2)} acima do teto de R$ ${FGC_LIMIT_PER_ISSUER.toLocaleString('pt-BR')} por CPF/instituição.`,
      valueAtStake: i.fgcExcess,
    });
  });

  const totalFgcCovered = round2(allocationByIssuer.reduce((s, i) => s + i.fgcCovered, 0));
  if (totalFgcCovered > FGC_GLOBAL_CEILING) {
    alerts.push({
      code: 'FGC_TETO_GLOBAL',
      severity: 'MEDIUM',
      title: 'Acima do teto global do FGC',
      detail: `A soma coberta (R$ ${totalFgcCovered.toFixed(2)}) passa do teto de R$ ${FGC_GLOBAL_CEILING.toLocaleString('pt-BR')} por CPF a cada 4 anos.`,
      valueAtStake: round2(totalFgcCovered - FGC_GLOBAL_CEILING),
    });
  }

  if (concentration.largestPositionPercent > 30 && positions.length > 1) {
    alerts.push({
      code: 'CONCENTRACAO_ATIVO',
      severity: concentration.largestPositionPercent > 50 ? 'HIGH' : 'MEDIUM',
      title: `Concentração em ${concentration.largestPositionName}`,
      detail: `Um único ativo é ${concentration.largestPositionPercent}% da carteira.`,
    });
  }
  if (concentration.largestTypePercent > 60 && allocationByType.length > 1) {
    alerts.push({
      code: 'CONCENTRACAO_CLASSE',
      severity: 'MEDIUM',
      title: `Concentração em ${concentration.largestTypeName}`,
      detail: `${concentration.largestTypePercent}% da carteira está em uma só classe de ativo.`,
    });
  }

  if (emergencyFund.monthsCovered !== null && emergencyFund.monthsCovered < 3) {
    alerts.push({
      code: 'RESERVA_INSUFICIENTE',
      severity: 'HIGH',
      title: 'Reserva de emergência abaixo de 3 meses',
      detail: `Disponível de imediato: R$ ${emergencyAvailable.toFixed(2)} — cobre ${emergencyFund.monthsCovered} meses do gasto médio de R$ ${avgMonthlyExpense.toFixed(2)}. Faltam R$ ${emergencyFund.gapValue.toFixed(2)} para 6 meses.`,
      valueAtStake: emergencyFund.gapValue,
    });
  }

  next90Days.filter(m => m.daysToMaturity <= 30).forEach(m => {
    alerts.push({
      code: 'VENCIMENTO_PROXIMO',
      severity: 'MEDIUM',
      title: `${m.name} vence em ${m.daysToMaturity} dias`,
      detail: `R$ ${m.grossValue.toFixed(2)} precisam de destino definido (reaplicar, resgatar ou usar para um compromisso já previsto).`,
      valueAtStake: m.grossValue,
    });
  });

  positions.filter(p => p.flags.includes('VENCIDO')).forEach(p => {
    alerts.push({
      code: 'VENCIDO',
      severity: 'HIGH',
      title: `${p.name} está vencido e ainda consta como ativo`,
      detail: `Venceu em ${p.maturityDate}. Se já resgatou, marque como resgatado; se renovou, atualize o vencimento.`,
      valueAtStake: p.grossValue,
    });
  });

  positions.filter(p => p.flags.includes('ABAIXO_DO_CDI')).forEach(p => {
    const custoAnual = p.contractedAnnualPercent !== null
      ? round2(p.grossValue * ((indexes.cdi - p.contractedAnnualPercent) / 100))
      : 0;
    alerts.push({
      code: 'RENDIMENTO_ABAIXO_CDI',
      severity: custoAnual > 500 ? 'MEDIUM' : 'LOW',
      title: `${p.name} rende abaixo do CDI`,
      detail: `Taxa contratada equivale a ${p.contractedAnnualPercent}% a.a. (${p.vsCdiPercent}% do CDI de ${indexes.cdi}% a.a.). A diferença vale cerca de R$ ${custoAnual.toFixed(2)} por ano sobre o saldo atual.`,
      valueAtStake: custoAnual,
    });
  });

  positions.filter(p => p.flags.includes('ABAIXO_DO_CONTRATADO')).forEach(p => {
    alerts.push({
      code: 'ABAIXO_DO_CONTRATADO',
      severity: 'LOW',
      title: `${p.name} rendeu menos do que a taxa contratada`,
      detail: `Realizado ${p.annualizedGainPercent}% a.a. contra ${p.contractedAnnualPercent}% a.a. contratados (${p.realizedVsContractedPP} p.p. de diferença). Pode ser saldo desatualizado no cadastro, taxa da corretora ou marcação a mercado.`,
    });
  });

  positions.filter(p => p.inIofWindow).forEach(p => {
    alerts.push({
      code: 'JANELA_IOF',
      severity: 'LOW',
      title: `${p.name} ainda está na janela de IOF`,
      detail: `Aplicado há ${p.daysHeld} dias. Resgate antes do 30º dia paga IOF regressivo além do IR de 22,5%.`,
    });
  });

  positions.filter(p => p.isVariableIncome && p.gainValue < 0).forEach(p => {
    alerts.push({
      code: 'PREJUIZO_RENDA_VARIAVEL',
      severity: 'LOW',
      title: `${p.name} está no prejuízo`,
      detail: `R$ ${Math.abs(p.gainValue).toFixed(2)} abaixo do custo (${p.gainPercent}%). Prejuízo em renda variável pode ser compensado com lucros futuros da mesma classe na apuração de IR.`,
      valueAtStake: Math.abs(p.gainValue),
    });
  });

  const severityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  alerts.sort((a, b) =>
    severityRank[a.severity] - severityRank[b.severity] || (b.valueAtStake || 0) - (a.valueAtStake || 0)
  );

  // ── Lacunas de cadastro (o que impede uma análise melhor) ────────────────────
  const gapCount = (flag: string) => positions.filter(p => p.flags.includes(flag)).length;
  if (gapCount('SEM_TAXA_CADASTRADA') > 0) dataGaps.push(`${gapCount('SEM_TAXA_CADASTRADA')} ativo(s) sem taxa/indexador cadastrado — sem isso não dá para comparar com o CDI.`);
  if (gapCount('SEM_EMISSOR') > 0) dataGaps.push(`${gapCount('SEM_EMISSOR')} ativo(s) cobertos pelo FGC sem emissor cadastrado — a checagem de teto por instituição fica no chute.`);
  if (gapCount('SEM_VENCIMENTO') > 0) dataGaps.push(`${gapCount('SEM_VENCIMENTO')} ativo(s) sem data de vencimento.`);
  if (gapCount('SEM_LIQUIDEZ') > 0) dataGaps.push(`${gapCount('SEM_LIQUIDEZ')} ativo(s) sem liquidez informada — não entram no cálculo da reserva de emergência.`);
  if (avgMonthlyExpense <= 0) dataGaps.push('Sem despesas lançadas nos últimos 90 dias — a reserva de emergência ideal não pôde ser dimensionada.');

  // Ativos que só uma pesquisa externa consegue avaliar (fundo, ação, FII, cripto).
  const researchTargets = positions
    .filter(p => p.isVariableIncome || p.typeCode === 'PREVIDENCIA')
    .map(p => ({ name: p.name, type: p.type, identifier: p.identifier, issuer: p.issuer }));

  return {
    generatedAt: new Date().toISOString(),
    marketIndexes: indexes,
    positions,
    totals: {
      applied: totalApplied,
      gross: totalGross,
      net: totalNet,
      gainValue: totalGain,
      gainPercent: pct(totalGain, totalApplied),
      annualizedGainPercent: portfolioAnnualized,
      estimatedTaxValue: totalTax,
      weightedAvgContractedAnnualPercent: weightedContracted,
      portfolioVsCdiPP,
    },
    allocationByType,
    allocationByIssuer,
    allocationByBroker,
    concentration,
    liquidity: {
      immediateValue: liquidity.immediateValue,
      immediatePercent: liquidity.immediatePercent,
      upTo30DaysValue: liquidity.upTo30DaysValue,
      upTo90DaysValue: liquidity.upTo90DaysValue,
      onlyAtMaturityValue: liquidity.onlyAtMaturityValue,
      onlyAtMaturityPercent: liquidity.onlyAtMaturityPercent,
      cashInAccountsValue: liquidity.cashInAccounts,
    },
    emergencyFund,
    maturities: { next90Days, weightedAvgDaysToMaturity },
    fgc: {
      totalCoveredValue: totalFgcCovered,
      excessValue: totalFgcExcess,
      globalCeiling: FGC_GLOBAL_CEILING,
      issuersOverLimit,
    },
    alerts,
    dataGaps,
    researchTargets,
  };
}
