// Benefícios de cartão (cashback, pontos e milhas) — as contas do comparador.
//
// Tudo em reais por ano, para o usuário comparar maçã com maçã:
//   · Cashback: gasto × % de volta (com teto mensal, se houver).
//   · Pontos/milhas: pontos ganhos × (1 + bônus de transferência) × valor do
//     milheiro ÷ 1000 × quanto dos pontos a pessoa de fato usa antes de vencer.
//   · Anuidade sai do benefício (a menos que o gasto do mês isente).
// O "retorno efetivo" é o benefício líquido dividido pelo gasto do ano — é o
// número que diz se o cartão compensa e qual de dois cartões rende mais.
//
// Quem usa: components/banking/CardBenefitsSection.tsx (cadastro dos benefícios,
// análise por cartão, "pontos ou cashback?" e "vale fazer este cartão?").

export type BenefitType = 'NONE' | 'CASHBACK' | 'PONTOS' | 'MILHAS';

export interface CardBenefits {
  type: BenefitType;
  /** % que volta em dinheiro (ex.: 1 = 1%). */
  cashbackPct?: number;
  /** Teto de cashback por mês em R$ (vazio = sem teto). */
  cashbackCapMonthly?: number;
  /** Pontos ganhos por unidade gasta. */
  pointsPerUnit?: number;
  /** A unidade da regra de pontos: por dólar (mais comum) ou por real. */
  pointsUnit?: 'USD' | 'BRL';
  /** Cotação do dólar usada pelo banco para converter o gasto em pontos. */
  usdRate?: number;
  /** Programa de pontos/milhas (Livelo, Esfera, Smiles, LATAM Pass, Azul…). */
  program?: string;
  /** Quanto valem 1.000 pontos/milhas para você, em R$. */
  milheiroValue?: number;
  /** Bônus ao transferir para a companhia aérea (ex.: 80 = +80%). */
  transferBonusPct?: number;
  /** Quanto dos pontos você de fato usa antes de vencer (ex.: 90 = 90%). */
  usageRatePct?: number;
  /** Anuidade por ano, em R$. */
  annualFee?: number;
  /** Gasto por mês que isenta a anuidade (vazio = não isenta). */
  feeWaiverMinMonthlySpend?: number;
  /** Validade dos pontos em meses. */
  pointsExpiryMonths?: number;
  /** Onde o cashback cai: abate na fatura, numa conta ou num investimento. */
  destination?: 'FATURA' | 'CONTA' | 'INVESTIMENTO';
  /** Conta ou investimento de destino (quando houver). */
  destinationId?: string;
  notes?: string;
}

export const DEFAULT_USD_RATE = 5.3;

const n = (v: any, fallback = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
};
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Pontos ganhos num gasto em reais. */
export function pointsEarned(spendBrl: number, b: CardBenefits): number {
  const per = n(b.pointsPerUnit);
  if (per <= 0 || spendBrl <= 0) return 0;
  if ((b.pointsUnit || 'USD') === 'BRL') return spendBrl * per;
  const rate = n(b.usdRate, DEFAULT_USD_RATE) || DEFAULT_USD_RATE;
  return (spendBrl / rate) * per;
}

/** Quanto vale, em R$, cada R$ 1 gasto (antes da anuidade) — o "cashback equivalente". */
export function grossRate(b: CardBenefits): number {
  if (b.type === 'CASHBACK') return n(b.cashbackPct) / 100;
  if (b.type === 'PONTOS' || b.type === 'MILHAS') {
    const pts = pointsEarned(1000, b) / 1000; // pontos por R$ 1
    const bonus = 1 + n(b.transferBonusPct) / 100;
    const usage = Math.min(100, Math.max(0, n(b.usageRatePct, 100))) / 100;
    return pts * bonus * (n(b.milheiroValue) / 1000) * usage;
  }
  return 0;
}

export interface BenefitResult {
  /** Benefício bruto no ano, em R$. */
  gross: number;
  /** Anuidade cobrada (0 se o gasto isenta). */
  fee: number;
  /** Benefício menos anuidade. */
  net: number;
  /** Benefício líquido ÷ gasto do ano. */
  effectivePct: number;
  /** Pontos no ano (quando é cartão de pontos). */
  pointsYear: number;
  feeWaived: boolean;
}

export function annualBenefit(monthlySpend: number, b: CardBenefits): BenefitResult {
  const spend = Math.max(0, n(monthlySpend));
  let grossMonthly = spend * grossRate(b);
  if (b.type === 'CASHBACK' && n(b.cashbackCapMonthly) > 0) grossMonthly = Math.min(grossMonthly, n(b.cashbackCapMonthly));
  const waiver = n(b.feeWaiverMinMonthlySpend);
  const feeWaived = waiver > 0 && spend >= waiver;
  const fee = feeWaived ? 0 : n(b.annualFee);
  const gross = round2(grossMonthly * 12);
  const net = round2(gross - fee);
  const yearSpend = spend * 12;
  return {
    gross,
    fee: round2(fee),
    net,
    effectivePct: yearSpend > 0 ? net / yearSpend : 0,
    pointsYear: b.type === 'PONTOS' || b.type === 'MILHAS' ? Math.round(pointsEarned(spend, b) * 12) : 0,
    feeWaived
  };
}

/** Gasto mensal a partir do qual o benefício paga a anuidade (null = nunca paga). */
export function breakEvenMonthlySpend(b: CardBenefits): number | null {
  const fee = n(b.annualFee);
  if (fee <= 0) return 0;
  const rate = grossRate(b);
  if (rate <= 0) return null;
  const spend = fee / 12 / rate;
  const waiver = n(b.feeWaiverMinMonthlySpend);
  return round2(waiver > 0 ? Math.min(spend, waiver) : spend);
}

export type Verdict = 'COMPENSA' | 'FRACO' | 'NAO_COMPENSA' | 'SEM_BENEFICIO';

export function verdictFor(r: BenefitResult, b: CardBenefits): { verdict: Verdict; text: string } {
  if (b.type === 'NONE') {
    return r.fee > 0
      ? { verdict: 'NAO_COMPENSA', text: 'Cobra anuidade e não devolve nada. Vale negociar a isenção ou trocar.' }
      : { verdict: 'SEM_BENEFICIO', text: 'Sem anuidade e sem benefício: não custa, mas também não rende.' };
  }
  if (r.net <= 0) return { verdict: 'NAO_COMPENSA', text: 'A anuidade come todo o benefício no seu nível de gasto.' };
  if (r.effectivePct < 0.005) return { verdict: 'FRACO', text: 'Rende menos de 0,5% do que você gasta. Um cartão sem anuidade com 1% de cashback ganharia dele.' };
  return { verdict: 'COMPENSA', text: `Devolve ${(r.effectivePct * 100).toFixed(2).replace('.', ',')}% do que você gasta, já descontada a anuidade.` };
}

export interface Comparison {
  a: BenefitResult;
  b: BenefitResult;
  winner: 'A' | 'B' | 'EMPATE';
  difference: number;
}

export function compare(monthlySpend: number, a: CardBenefits, b: CardBenefits): Comparison {
  const ra = annualBenefit(monthlySpend, a);
  const rb = annualBenefit(monthlySpend, b);
  const diff = round2(ra.net - rb.net);
  return { a: ra, b: rb, winner: Math.abs(diff) < 1 ? 'EMPATE' : diff > 0 ? 'A' : 'B', difference: Math.abs(diff) };
}

/** Valor do milheiro que faz os pontos empatarem com um cashback de X%. */
export function milheiroToMatchCashback(b: CardBenefits, cashbackPct: number): number | null {
  const pts = pointsEarned(1000, b) / 1000;
  const bonus = 1 + n(b.transferBonusPct) / 100;
  const usage = Math.min(100, Math.max(0, n(b.usageRatePct, 100))) / 100;
  const denom = pts * bonus * usage;
  if (denom <= 0) return null;
  return round2(((cashbackPct / 100) * 1000) / denom);
}

export const BENEFIT_TYPE_LABEL: Record<BenefitType, string> = {
  NONE: 'Sem benefício',
  CASHBACK: 'Cashback',
  PONTOS: 'Pontos',
  MILHAS: 'Milhas'
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  COMPENSA: 'Compensa',
  FRACO: 'Fraco',
  NAO_COMPENSA: 'Não compensa',
  SEM_BENEFICIO: 'Sem benefício'
};
