// Estimativa de IR (e IOF) de um investimento "se resgatado hoje", pelas regras da
// Receita para pessoa física. É uma estimativa: não considera come-cotas já pago,
// prejuízos a compensar nem a isenção mensal de ações (vendas até R$ 20 mil) e de
// cripto (até R$ 35 mil) — essas dependem do que você vender no mês.
//
// Regras usadas:
//  · Renda fixa (CDB, Tesouro, debêntures comuns, COE, fundos de longo prazo…):
//    tabela regressiva — até 180 dias 22,5%; 181–360 20%; 361–720 17,5%; acima 15%.
//    IOF regressivo sobre o rendimento nos primeiros 29 dias (dia 30 em diante: 0).
//  · Fundos de curto prazo: 22,5% até 180 dias, 20% depois (+ IOF).
//  · Fundos de ações: 15%, sem IOF.
//  · Ações e cripto: 15% sobre o lucro. FIIs: 20% sobre o lucro na venda.
//  · LCI/LCA, CRI/CRA, poupança (e o que você marcar como isento): 0%.
//  · Previdência regressiva: 35% até 2 anos, 30% até 4, 25% até 6, 20% até 8, 15% até
//    10 e 10% acima. Progressiva: 15% retido na fonte (ajuste na declaração).
//    VGBL: IR só sobre o rendimento. PGBL: IR sobre o valor total resgatado.

export type TaxRegime =
  | 'ISENTO'
  | 'RENDA_FIXA'
  | 'FUNDO_CURTO_PRAZO'
  | 'FUNDO_ACOES'
  | 'ACOES'
  | 'FII'
  | 'CRIPTO'
  | 'PREV_REGRESSIVA'
  | 'PREV_PROGRESSIVA';

export const EXEMPT_INVESTMENT_TYPES = ['LCI_LCA', 'CRI_CRA', 'POUPANCA'];

export function resolveTaxRegime(meta: any): TaxRegime {
  const m = meta || {};
  if (m.isTaxExempt || EXEMPT_INVESTMENT_TYPES.includes(m.investmentType)) return 'ISENTO';
  switch (m.investmentType) {
    case 'ACOES': return 'ACOES';
    case 'FIIS': return 'FII';
    case 'CRIPTO': return 'CRIPTO';
    case 'FUNDOS':
      if (m.fundTaxClass === 'CURTO_PRAZO') return 'FUNDO_CURTO_PRAZO';
      if (m.fundTaxClass === 'ACOES') return 'FUNDO_ACOES';
      return 'RENDA_FIXA'; // longo prazo (padrão da maioria dos fundos de RF/multimercado)
    case 'PREVIDENCIA':
      return m.pensionTaxTable === 'PROGRESSIVA' ? 'PREV_PROGRESSIVA' : 'PREV_REGRESSIVA';
    default:
      return 'RENDA_FIXA';
  }
}

/** Alíquota de IR do regime para um aporte mantido por `days` dias corridos. */
export function taxRateFor(regime: TaxRegime, days: number): number {
  switch (regime) {
    case 'ISENTO': return 0;
    case 'ACOES':
    case 'CRIPTO':
    case 'FUNDO_ACOES':
    case 'PREV_PROGRESSIVA':
      return 0.15;
    case 'FII': return 0.20;
    case 'FUNDO_CURTO_PRAZO': return days <= 180 ? 0.225 : 0.20;
    case 'PREV_REGRESSIVA':
      if (days <= 730) return 0.35;
      if (days <= 1460) return 0.30;
      if (days <= 2190) return 0.25;
      if (days <= 2920) return 0.20;
      if (days <= 3650) return 0.15;
      return 0.10;
    case 'RENDA_FIXA':
    default:
      if (days <= 180) return 0.225;
      if (days <= 360) return 0.20;
      if (days <= 720) return 0.175;
      return 0.15;
  }
}

/** A alíquota muda com o prazo de cada aporte? (senão é fixa). */
export function isTimeBasedRegime(regime: TaxRegime): boolean {
  return regime === 'RENDA_FIXA' || regime === 'FUNDO_CURTO_PRAZO' || regime === 'PREV_REGRESSIVA';
}

// Tabela do IOF regressivo (Decreto 6.306/2007), % do rendimento por dia corrido.
const IOF_TABLE = [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3];

/** IOF sobre o rendimento de resgate com `days` dias (só renda fixa / fundos de RF). */
export function iofRateFor(regime: TaxRegime, days: number): number {
  if (regime !== 'RENDA_FIXA' && regime !== 'FUNDO_CURTO_PRAZO') return 0;
  if (days < 1) return IOF_TABLE[0] / 100; // resgate no mesmo dia: tratado como dia 1
  if (days >= 30) return 0;
  return IOF_TABLE[days - 1] / 100;
}

/** Dias corridos entre duas datas AAAA-MM-DD (independe de hora e fuso). */
export function calendarDaysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.substring(0, 4), +from.substring(5, 7) - 1, +from.substring(8, 10));
  const b = Date.UTC(+to.substring(0, 4), +to.substring(5, 7) - 1, +to.substring(8, 10));
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

export interface TaxLot { amount: number; date: string }

export interface TaxLotBreakdown {
  amount: number;
  date: string;
  days: number;
  rate: number;
  gain: number;
  iof: number;
  tax: number;
}

export interface InvestmentTaxResult {
  regime: TaxRegime;
  taxAmount: number;   // IR estimado
  iofAmount: number;   // IOF estimado (só resgate < 30 dias)
  effectiveRate: number; // alíquota da tabela (média ponderada quando há vários aportes)
  weightedDays: number;
  breakdown: TaxLotBreakdown[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * IR/IOF estimados de um investimento com saldo bruto `gross`, custo `cost` e aportes
 * `lots`, se resgatado em `today` (AAAA-MM-DD).
 *
 * O rendimento é repartido entre os aportes proporcionalmente a valor × dias
 * aplicados: um aporte de ontem quase não rendeu, então não pode levar a mesma fatia
 * do lucro que um aporte de dois anos (antes a divisão era só pelo valor, o que jogava
 * lucro antigo na alíquota de 22,5% do aporte novo e inflava o IR).
 */
export function computeInvestmentTax(params: {
  meta: any;
  lots: TaxLot[];
  cost: number;
  gross: number;
  today: string;
}): InvestmentTaxResult {
  const { meta, lots, cost, gross, today } = params;
  const regime = resolveTaxRegime(meta);
  const gain = gross - cost;
  const empty: InvestmentTaxResult = { regime, taxAmount: 0, iofAmount: 0, effectiveRate: 0, weightedDays: 0, breakdown: [] };
  const validLots = (lots || []).filter(l => l.amount > 0);
  const totalLots = validLots.reduce((s, l) => s + l.amount, 0);
  if (totalLots <= 0) return empty;

  const withDays = validLots.map(l => ({ ...l, days: calendarDaysBetween(l.date, today) }));
  const weightedDays = Math.round(withDays.reduce((s, l) => s + l.days * (l.amount / totalLots), 0));

  if (regime === 'ISENTO') return { ...empty, weightedDays };

  // PGBL: o IR incide sobre todo o valor resgatado, não só sobre o rendimento.
  const isPgbl = (regime === 'PREV_REGRESSIVA' || regime === 'PREV_PROGRESSIVA') && meta?.pensionPlanType === 'PGBL';
  const base = isPgbl ? gross : gain;
  if (!(base > 0)) return { ...empty, weightedDays };

  const weightOf = (l: { amount: number; days: number }) => (isTimeBasedRegime(regime) ? l.amount * Math.max(l.days, 1) : l.amount);
  const totalWeight = withDays.reduce((s, l) => s + weightOf(l), 0);

  let taxAmount = 0;
  let iofAmount = 0;
  let weightedRate = 0; // alíquota da tabela, ponderada pelos aportes (sem efeito do IOF/arredondamento)
  const breakdown: TaxLotBreakdown[] = withDays.map(l => {
    const share = isPgbl ? l.amount / totalLots : weightOf(l) / totalWeight;
    const lotBase = base * share;
    const rate = taxRateFor(regime, l.days);
    const iof = isPgbl ? 0 : lotBase * iofRateFor(regime, l.days);
    const tax = (lotBase - iof) * rate; // o IOF sai antes e reduz a base do IR
    taxAmount += tax;
    iofAmount += iof;
    weightedRate += rate * share;
    return { amount: l.amount, date: l.date, days: l.days, rate, gain: round2(lotBase), iof: round2(iof), tax: round2(tax) };
  });

  taxAmount = round2(taxAmount);
  iofAmount = round2(iofAmount);
  return {
    regime,
    taxAmount,
    iofAmount,
    effectiveRate: Math.round(weightedRate * 10000) / 10000,
    weightedDays,
    breakdown,
  };
}

export const TAX_REGIME_LABEL: Record<TaxRegime, string> = {
  ISENTO: 'Isento',
  RENDA_FIXA: 'Tabela regressiva (renda fixa)',
  FUNDO_CURTO_PRAZO: 'Fundo de curto prazo (22,5% / 20%)',
  FUNDO_ACOES: 'Fundo de ações (15%)',
  ACOES: 'Ganho de capital 15% (isento em vendas até R$ 20 mil/mês)',
  FII: 'Ganho de capital 20% (FIIs)',
  CRIPTO: 'Ganho de capital 15% (isento em vendas até R$ 35 mil/mês)',
  PREV_REGRESSIVA: 'Previdência — tabela regressiva (35% → 10%)',
  PREV_PROGRESSIVA: 'Previdência — tabela progressiva (15% na fonte)',
};
