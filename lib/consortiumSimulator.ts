/**
 * Simulador de consórcio — o motor de cálculo (sem tela, sem banco).
 *
 * Tudo segue a conta das administradoras: o plano é um PERCENTUAL da carta
 * (100% do fundo comum + taxa de administração + fundo de reserva). Cada
 * parcela amortiza um pedaço desse percentual e vale "% × carta do mês" — por
 * isso o reajuste anual da carta (INCC/IPCA) corrige parcela e saldo juntos.
 *
 * - Antes de contemplar a parcela pode ser reduzida (ex.: 70% da integral).
 * - Ao contemplar: paga a parcela do mês, depois o lance (livre = do bolso,
 *   embutido = sai da carta). O que falta do percentual é redistribuído:
 *   reduz parcela → restante ÷ meses que faltam; reduz prazo → parcela integral
 *   até zerar (nunca além do prazo original).
 * - Seguro prestamista: % ao mês sobre o saldo devedor (por padrão só depois
 *   de contemplar, que é quando a maioria das administradoras passa a cobrar).
 *
 * Comparações em valor presente usam a taxa de oportunidade (ex.: CDI líquido
 * de IR): o que custa menos em dinheiro de hoje é o melhor caminho.
 */

export type BidMode = 'REDUCE_TERM' | 'REDUCE_INSTALLMENT';
export type AmortizationSystem = 'PRICE' | 'SAC';

export interface Flow { t: number; v: number }

const EPS = 1e-9;
export const round2 = (v: number) => Math.round(v * 100) / 100;
const pos = (v: unknown) => Math.max(0, Number(v) || 0);

// ─── Taxas ───────────────────────────────────────────────────────────────────
export const annualToMonthly = (pctYear: number) => Math.pow(1 + (Number(pctYear) || 0) / 100, 1 / 12) - 1;
export const monthlyToAnnualPct = (rateMonth: number) => (Math.pow(1 + rateMonth, 12) - 1) * 100;

export function npv(rateMonthly: number, flows: Flow[]): number {
  return flows.reduce((s, f) => s + f.v / Math.pow(1 + rateMonthly, f.t), 0);
}

/** Quantas vezes o sinal do fluxo muda (ignorando zeros), em ordem de tempo. */
export function signChanges(flows: Flow[]): number {
  const signs = [...flows].sort((a, b) => a.t - b.t).map(f => Math.sign(f.v)).filter(s => s !== 0);
  let n = 0;
  for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) n++;
  return n;
}

/**
 * TIR mensal. Só devolve número quando o fluxo tem UMA troca de sinal (aí a
 * taxa é única); com mais trocas a TIR é ambígua e a comparação deve ser feita
 * pelo valor presente.
 */
export function irr(flows: Flow[]): number | null {
  if (signChanges(flows) !== 1) return null;
  let lo = -0.99, hi = 1;
  let flo = npv(lo, flows), fhi = npv(hi, flows);
  // Amplia o teto se preciso (taxas muito altas).
  for (let i = 0; i < 20 && Math.sign(flo) === Math.sign(fhi); i++) { hi *= 2; fhi = npv(hi, flows); }
  if (Math.sign(flo) === Math.sign(fhi)) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid, flows);
    if (Math.abs(fm) < 1e-7 || hi - lo < 1e-12) return mid;
    if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else { hi = mid; fhi = fm; }
  }
  return (lo + hi) / 2;
}

// ─── Lance em "parcelas" (como Ademicon e outras ofertam) ───────────────────
/** Valor de 1 parcela-base do plano: carta × plano% ÷ prazo-base do grupo. */
export function baseInstallmentValue(credit: number, planPct: number, baseTermMonths: number): number {
  return baseTermMonths > 0 ? (pos(credit) * pos(planPct) / 100) / baseTermMonths : 0;
}
/** Nº de parcelas-base → % da carta. */
export function installmentsToPct(count: number, planPct: number, baseTermMonths: number): number {
  return baseTermMonths > 0 ? pos(count) * pos(planPct) / baseTermMonths : 0;
}

// ─── Plano do consórcio ──────────────────────────────────────────────────────
export interface PlanInput {
  credit: number;              // carta de crédito (R$) na adesão
  termMonths: number;          // prazo da cota (meses)
  adminFeePct: number;         // taxa de administração total (% da carta)
  reserveFundPct?: number;     // fundo de reserva total (% da carta)
  annualIndexPct?: number;     // reajuste anual da carta (%)
  reducedPct?: number;         // parcela até contemplar, % da integral (100 = cheia)
  insuranceMonthlyPct?: number;// seguro prestamista, % a.m. sobre o saldo devedor
  insuranceFromStart?: boolean;// cobra seguro desde a adesão (padrão: só após contemplar)
  contemplationMonth: number;  // mês da contemplação (1 = primeira assembleia)
  freeBidPct?: number;         // lance livre (% da carta)
  embeddedBidPct?: number;     // lance embutido (% da carta)
  bidMode?: BidMode;
  /**
   * Cota que já existe: parte do saldo devedor de hoje em vez do plano cheio.
   * `startBalancePct` = saldo ÷ carta × 100; `preInstallmentPct` = parcela
   * atual ÷ carta × 100 (paga até contemplar). `termMonths` = parcelas restantes.
   */
  startBalancePct?: number;
  preInstallmentPct?: number;
}

/** Monta o plano de uma cota existente a partir dos números de hoje. */
export function existingQuotaPlan(q: {
  credit: number; balance: number; remainingMonths: number; currentInstallment: number;
}): Pick<PlanInput, 'credit' | 'termMonths' | 'adminFeePct' | 'startBalancePct' | 'preInstallmentPct'> {
  const C = pos(q.credit);
  return {
    credit: C,
    termMonths: Math.max(1, Math.floor(pos(q.remainingMonths))),
    adminFeePct: 0,
    startBalancePct: C > 0 ? (pos(q.balance) / C) * 100 : 0,
    preInstallmentPct: C > 0 ? (pos(q.currentInstallment) / C) * 100 : 0
  };
}

export interface PlanRow {
  month: number;
  phase: 'pre' | 'post';
  credit: number;        // carta corrigida no mês
  pct: number;           // % da carta amortizado na parcela
  installment: number;   // parcela (sem seguro)
  insurance: number;
  bidCash: number;       // lance do bolso pago no mês
  total: number;         // saída do bolso no mês
  balancePct: number;    // % que falta depois do mês
  balance: number;       // saldo devedor (R$) depois do mês
}

export interface PlanResult {
  planPct: number;
  contemplationMonth: number;
  fullInstallment: number;      // parcela integral na adesão
  preInstallment: number;       // parcela até contemplar (na adesão)
  postInstallment: number;      // 1ª parcela depois de contemplar
  creditAtContemplation: number;
  bidCash: number;
  bidEmbedded: number;
  netCredit: number;            // carta na contemplação − embutido
  balanceBeforeBid: number;     // saldo devedor (R$) logo antes do lance
  balanceAfterBid: number;
  monthsTotal: number;
  monthsAfterContemplation: number;
  totalInstallments: number;
  totalInsurance: number;
  totalCashOut: number;         // parcelas + seguro + lance do bolso
  nominalCost: number;          // totalCashOut − crédito líquido
  costPctOfCredit: number;
  /** Custo efetivo do saldo "financiado" depois de contemplar (% a.a.). */
  cetAfterContemplationPct: number | null;
  rows: PlanRow[];
  flows: Flow[];                // fluxo do consorciado (− sai, + entra o crédito)
  warnings: string[];
}

export function simulatePlan(input: PlanInput, opportunityPctYear = 0): PlanResult {
  const C = pos(input.credit);
  const N = Math.max(1, Math.floor(pos(input.termMonths)));
  const existing = input.startBalancePct !== undefined && input.startBalancePct !== null;
  const planPct = existing ? pos(input.startBalancePct) : 100 + pos(input.adminFeePct) + pos(input.reserveFundPct);
  const m = planPct / N;
  const reduced = Math.min(100, Math.max(1, Number(input.reducedPct) || 100)) / 100;
  // Cota existente: até contemplar paga a parcela de hoje (pode ser reduzida).
  const prePct = existing && pos(input.preInstallmentPct) > 0 ? pos(input.preInstallmentPct) : m * reduced;
  const k = Math.min(N, Math.max(1, Math.floor(Number(input.contemplationMonth) || 1)));
  const idx = pos(input.annualIndexPct) / 100;
  const ins = pos(input.insuranceMonthlyPct) / 100;
  const mode: BidMode = input.bidMode || 'REDUCE_INSTALLMENT';
  const warnings: string[] = [];

  let R = planPct;
  let postPct = m;
  let bidCash = 0, bidEmbedded = 0, creditAtK = C, balanceBeforeBid = 0, balanceAfterBid = 0;
  const rows: PlanRow[] = [];
  const flows: Flow[] = [];

  for (let t = 1; t <= N + 1200 && R > EPS; t++) {
    const credit = C * Math.pow(1 + idx, Math.floor((t - 1) / 12));
    const pre = t <= k;
    let pct = pre ? Math.min(R, prePct) : Math.min(R, postPct);
    const insurance = (ins > 0 && (input.insuranceFromStart || !pre)) ? ins * (R / 100) * credit : 0;
    R -= pct;
    let rowBidCash = 0;

    if (t === k) {
      creditAtK = credit;
      balanceBeforeBid = (R / 100) * credit;
      let free = pos(input.freeBidPct), emb = pos(input.embeddedBidPct);
      if (free + emb > R + EPS) {
        warnings.push('O lance é maior que o saldo devedor — limitado ao que falta pagar.');
        const scale = R / (free + emb);
        free *= scale; emb *= scale;
      }
      if (emb > 100) warnings.push('Lance embutido acima da própria carta.');
      R -= free + emb;
      rowBidCash = (free / 100) * credit;
      bidCash = rowBidCash;
      bidEmbedded = (emb / 100) * credit;
      balanceAfterBid = (Math.max(0, R) / 100) * credit;
      const monthsLeft = N - k;
      if (R > EPS) {
        if (monthsLeft <= 0) {
          postPct = R; // contemplou no último mês: o que falta vai numa parcela
        } else if (mode === 'REDUCE_TERM' && free + emb > 0) {
          // Volta à parcela integral e encurta o prazo — sem passar do original.
          postPct = Math.max(m, R / monthsLeft);
        } else {
          postPct = R / monthsLeft;
        }
      }
    }

    const installment = (pct / 100) * credit;
    rows.push({
      month: t, phase: pre ? 'pre' : 'post', credit, pct, installment, insurance, bidCash: rowBidCash,
      total: installment + insurance + rowBidCash, balancePct: Math.max(0, R), balance: (Math.max(0, R) / 100) * credit
    });
    flows.push({ t, v: -(installment + insurance + rowBidCash) });
    if (t === k) flows.push({ t, v: creditAtK - bidEmbedded });
  }

  const netCredit = Math.max(0, creditAtK - bidEmbedded);
  const totalInstallments = rows.reduce((s, r) => s + r.installment, 0);
  const totalInsurance = rows.reduce((s, r) => s + r.insurance, 0);
  const totalCashOut = totalInstallments + totalInsurance + bidCash;
  const postRow = rows.find(r => r.phase === 'post');

  // Custo do saldo financiado após contemplar: o crédito líquido, menos o lance
  // do bolso e o que já tinha sido pago antes (levado à data pela taxa de
  // oportunidade), contra as parcelas que faltam.
  const o = annualToMonthly(opportunityPctYear);
  const prePaidFV = rows.filter(r => r.month <= k).reduce((s, r) => s + (r.installment + r.insurance) * Math.pow(1 + o, k - r.month), 0);
  const financed = netCredit - bidCash - prePaidFV;
  const postFlows: Flow[] = [{ t: 0, v: financed }, ...rows.filter(r => r.month > k).map(r => ({ t: r.month - k, v: -(r.installment + r.insurance) }))];
  const cetM = financed > 0 ? irr(postFlows) : null;

  if (netCredit <= 0) warnings.push('O embutido consome toda a carta.');
  if (pos(input.embeddedBidPct) > 30) warnings.push('Embutido acima de 30% da carta — a maioria dos grupos limita entre 25% e 30%.');

  return {
    planPct,
    contemplationMonth: k,
    fullInstallment: (m / 100) * C,
    preInstallment: (prePct / 100) * C,
    postInstallment: postRow ? postRow.installment : 0,
    creditAtContemplation: creditAtK,
    bidCash, bidEmbedded, netCredit, balanceBeforeBid, balanceAfterBid,
    monthsTotal: rows.length,
    monthsAfterContemplation: rows.filter(r => r.phase === 'post').length,
    totalInstallments, totalInsurance, totalCashOut,
    nominalCost: totalCashOut - netCredit,
    costPctOfCredit: netCredit > 0 ? ((totalCashOut - netCredit) / netCredit) * 100 : 0,
    cetAfterContemplationPct: cetM === null ? null : monthlyToAnnualPct(cetM),
    rows, flows, warnings
  };
}

// ─── Financiamento (para comparar) ───────────────────────────────────────────
export interface FinancingResult {
  firstInstallment: number;
  lastInstallment: number;
  totalPaid: number;
  totalInterest: number;
  flows: Flow[]; // só as parcelas (negativas), t = 1..n
}

export function simulateFinancing(principal: number, ratePctYear: number, months: number, system: AmortizationSystem = 'PRICE'): FinancingResult {
  const P = pos(principal);
  const n = Math.max(1, Math.floor(pos(months)));
  const i = annualToMonthly(ratePctYear);
  const flows: Flow[] = [];
  let balance = P;
  const pmt = i > 0 ? P * i / (1 - Math.pow(1 + i, -n)) : P / n;
  for (let t = 1; t <= n; t++) {
    const interest = balance * i;
    const amort = system === 'SAC' ? P / n : pmt - interest;
    const payment = system === 'SAC' ? amort + interest : pmt;
    balance -= amort;
    flows.push({ t, v: -payment });
  }
  const totalPaid = -flows.reduce((s, f) => s + f.v, 0);
  return {
    firstInstallment: -flows[0].v,
    lastInstallment: -flows[flows.length - 1].v,
    totalPaid,
    totalInterest: totalPaid - P,
    flows
  };
}

// ─── Probabilidade de contemplação por sorteio ──────────────────────────────
export function lotteryOdds(activeQuotas: number, lotteryPerAssembly: number, months = 12) {
  const n = pos(activeQuotas), s = pos(lotteryPerAssembly);
  const p = n > 0 ? Math.min(1, s / n) : 0;
  return {
    perAssemblyPct: p * 100,
    withinMonthsPct: (1 - Math.pow(1 - p, months)) * 100,
    expectedMonths: p > 0 ? 1 / p : Infinity
  };
}

export type BidChance = 'ALTA' | 'MEDIA' | 'BAIXA' | 'SEM_DADOS';
/** Compara o lance com o histórico das assembleias (mínimo e médio vencedores). */
export function bidChance(myBidPct: number, minWinningPct?: number | null, avgWinningPct?: number | null): BidChance {
  const min = Number(minWinningPct) || 0, avg = Number(avgWinningPct) || 0;
  if (!min && !avg) return 'SEM_DADOS';
  if (avg && myBidPct >= avg) return 'ALTA';
  if (min && myBidPct >= min) return 'MEDIA';
  if (!min && avg && myBidPct >= avg * 0.9) return 'MEDIA';
  return 'BAIXA';
}

// ─── Vale a pena dar o lance? ───────────────────────────────────────────────
export interface BidDecisionInput {
  plan: Omit<PlanInput, 'contemplationMonth' | 'freeBidPct' | 'embeddedBidPct'>;
  bidMonth: number;            // quando daria o lance
  freeBidPct: number;
  embeddedBidPct?: number;
  lotteryMonth: number;        // quando esperaria ser sorteado sem lance
  opportunityPctYear: number;  // rendimento líquido do dinheiro parado
  monthlyBenefit: number;      // ganho por mês de ter o crédito antes (aluguel, juros evitados…)
}

export interface BidDecision {
  withBid: PlanResult;
  withoutBid: PlanResult;
  monthsAnticipated: number;
  pvCostWithBid: number;       // custo em valor presente (positivo = custo)
  pvCostWithoutBid: number;
  pvBenefit: number;           // valor presente do ganho de antecipar
  advantage: number;           // > 0: o lance compensa
  maxWorthwhileFreeBidPct: number | null; // maior lance livre que ainda compensa (null = nenhum)
}

/**
 * Custo em valor presente do que SAI do bolso (parcelas, seguro, lance) mais o
 * embutido (é carta a menos para comprar o bem). A carta em si não entra: ela
 * só compra o bem, e é corrigida pelo índice — receber antes não é dinheiro em
 * caixa. O ganho de ter o bem antes entra à parte (`monthlyBenefit`).
 */
function pvCostOf(plan: PlanResult, o: number): number {
  const k = plan.contemplationMonth;
  const out = plan.rows.reduce((s, r) => s + r.total / Math.pow(1 + o, r.month), 0);
  return out + plan.bidEmbedded / Math.pow(1 + o, k);
}

export function evaluateBid(input: BidDecisionInput): BidDecision {
  const o = annualToMonthly(input.opportunityPctYear);
  const bidMonth = Math.max(1, Math.floor(input.bidMonth));
  const lotteryMonth = Math.max(bidMonth, Math.floor(input.lotteryMonth));
  const run = (free: number) => simulatePlan({ ...input.plan, contemplationMonth: bidMonth, freeBidPct: free, embeddedBidPct: input.embeddedBidPct || 0 }, input.opportunityPctYear);
  const withoutBid = simulatePlan({ ...input.plan, contemplationMonth: lotteryMonth, freeBidPct: 0, embeddedBidPct: 0 }, input.opportunityPctYear);
  const monthsAnticipated = lotteryMonth - bidMonth;
  let pvBenefit = 0;
  for (let t = bidMonth + 1; t <= lotteryMonth; t++) pvBenefit += pos(input.monthlyBenefit) / Math.pow(1 + o, t);
  const pvCostWithoutBid = pvCostOf(withoutBid, o);
  const advantageOf = (free: number) => pvCostWithoutBid - pvCostOf(run(free), o) + pvBenefit;

  const withBid = run(pos(input.freeBidPct));
  const advantage = advantageOf(pos(input.freeBidPct));

  // Maior lance livre que ainda compensa (busca binária; a vantagem cai com o lance).
  const maxPct = Math.max(0, withBid.planPct - pos(input.embeddedBidPct));
  let maxWorthwhile: number | null;
  if (advantageOf(0) < 0) maxWorthwhile = null;
  else if (advantageOf(maxPct) >= 0) maxWorthwhile = maxPct;
  else {
    let lo = 0, hi = maxPct;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (advantageOf(mid) >= 0) lo = mid; else hi = mid; }
    maxWorthwhile = lo;
  }

  return {
    withBid, withoutBid, monthsAnticipated,
    pvCostWithBid: pvCostOf(withBid, o), pvCostWithoutBid, pvBenefit, advantage,
    maxWorthwhileFreeBidPct: maxWorthwhile
  };
}

// ─── Comprar cota já contemplada ────────────────────────────────────────────
export interface ContemplatedQuotaInput {
  entry: number;               // ágio/entrada pago ao vendedor
  transferFee?: number;        // taxa de transferência (R$)
  credit: number;              // crédito disponível
  installment: number;         // parcela atual
  remainingMonths: number;
  annualIndexPct?: number;     // reajuste anual da parcela
}

export function evaluateContemplatedQuota(q: ContemplatedQuotaInput) {
  const idx = pos(q.annualIndexPct) / 100;
  const n = Math.max(0, Math.floor(pos(q.remainingMonths)));
  const flows: Flow[] = [{ t: 0, v: pos(q.credit) - pos(q.entry) - pos(q.transferFee) }];
  let totalInstallments = 0;
  for (let t = 1; t <= n; t++) {
    const p = pos(q.installment) * Math.pow(1 + idx, Math.floor((t - 1) / 12));
    totalInstallments += p;
    flows.push({ t, v: -p });
  }
  const r = irr(flows);
  const totalPaid = pos(q.entry) + pos(q.transferFee) + totalInstallments;
  return {
    flows,
    totalPaid,
    totalInstallments,
    nominalCost: totalPaid - pos(q.credit),
    cetMonthlyPct: r === null ? null : r * 100,
    cetAnnualPct: r === null ? null : monthlyToAnnualPct(r)
  };
}

// ─── Quitar um financiamento com a carta ────────────────────────────────────
export interface PayoffInput {
  financingBalance: number;
  financingRatePctYear: number;
  financingMonths: number;
  financingSystem?: AmortizationSystem;
  /** Parcelas reais que faltam (em ordem). Quando vêm, valem mais que taxa/sistema. */
  financingInstallments?: number[];
  netCredit: number;           // crédito líquido liberado
  ownBid: number;              // lance pago do bolso para contemplar
  consortiumInstallment: number;
  consortiumMonths: number;
  annualIndexPct?: number;
  opportunityPctYear: number;
}

export function evaluatePayoff(p: PayoffInput) {
  const o = annualToMonthly(p.opportunityPctYear);
  const real = (p.financingInstallments || []).filter(v => pos(v) > 0);
  const fin: FinancingResult = real.length
    ? {
      firstInstallment: real[0],
      lastInstallment: real[real.length - 1],
      totalPaid: real.reduce((s, v) => s + v, 0),
      totalInterest: real.reduce((s, v) => s + v, 0) - pos(p.financingBalance),
      flows: real.map((v, i) => ({ t: i + 1, v: -v }))
    }
    : simulateFinancing(p.financingBalance, p.financingRatePctYear, p.financingMonths, p.financingSystem || 'PRICE');
  const idx = pos(p.annualIndexPct) / 100;
  const freeCapital = pos(p.netCredit) - pos(p.financingBalance);
  const consFlows: Flow[] = [{ t: 0, v: freeCapital - pos(p.ownBid) }];
  let consTotal = 0;
  for (let t = 1; t <= Math.floor(pos(p.consortiumMonths)); t++) {
    const v = pos(p.consortiumInstallment) * Math.pow(1 + idx, Math.floor((t - 1) / 12));
    consTotal += v;
    consFlows.push({ t, v: -v });
  }
  const pvKeep = -npv(o, fin.flows);
  const pvSwitch = -npv(o, consFlows);
  return {
    financing: fin,
    freeCapital,
    consortiumTotal: consTotal,
    monthlyDifference: fin.firstInstallment - pos(p.consortiumInstallment),
    pvCostKeepFinancing: pvKeep,
    pvCostSwitch: pvSwitch,
    advantage: pvKeep - pvSwitch // > 0: trocar compensa
  };
}

// ─── Vender a cota ──────────────────────────────────────────────────────────
export interface SaleFlow { date: string; amount: number } // amount > 0 = pago

const monthsBetween = (fromIso: string, toIso: string) =>
  (new Date(toIso + 'T12:00:00').getTime() - new Date(fromIso + 'T12:00:00').getTime()) / (86400000 * 30.4375);

export function evaluateSale(payments: SaleFlow[], salePrice: number, saleDate: string, opportunityPctYear = 0) {
  const paid = (payments || []).filter(p => pos(p.amount) > 0 && p.date);
  const invested = paid.reduce((s, p) => s + pos(p.amount), 0);
  const first = paid.length ? paid.map(p => p.date).sort()[0] : saleDate;
  const flows: Flow[] = [
    ...paid.map(p => ({ t: monthsBetween(first, p.date), v: -pos(p.amount) })),
    { t: monthsBetween(first, saleDate), v: pos(salePrice) }
  ];
  const r = invested > 0 && salePrice > 0 ? irr(flows) : null;
  const o = annualToMonthly(opportunityPctYear);
  const opportunityValue = paid.reduce((s, p) => s + pos(p.amount) * Math.pow(1 + o, Math.max(0, monthsBetween(p.date, saleDate))), 0);
  const profit = pos(salePrice) - invested;
  return {
    invested,
    profit,
    profitPct: invested > 0 ? (profit / invested) * 100 : 0,
    monthlyIrrPct: r === null ? null : r * 100,
    annualIrrPct: r === null ? null : monthlyToAnnualPct(r),
    months: monthsBetween(first, saleDate),
    opportunityValue, // quanto o mesmo dinheiro teria virado aplicado
    excessOverOpportunity: pos(salePrice) - opportunityValue
  };
}

/** Preço de venda para atingir uma meta: % total sobre o investido, ou % ao mês desde cada pagamento. */
export function targetSalePrice(payments: SaleFlow[], saleDate: string, targetPct: number, basis: 'TOTAL' | 'MONTHLY'): number {
  const paid = (payments || []).filter(p => pos(p.amount) > 0 && p.date);
  if (basis === 'TOTAL') return paid.reduce((s, p) => s + pos(p.amount), 0) * (1 + (Number(targetPct) || 0) / 100);
  const r = (Number(targetPct) || 0) / 100;
  return paid.reduce((s, p) => s + pos(p.amount) * Math.pow(1 + r, Math.max(0, monthsBetween(p.date, saleDate))), 0);
}

// ─── Várias cotas (carteira) ────────────────────────────────────────────────
export interface QuotaSummary {
  credit: number;          // carta na contemplação
  bidCash: number;         // lance do bolso
  bidEmbedded: number;     // lance embutido
  netCredit: number;       // crédito líquido (carta − embutido)
  netCash: number;         // saque líquido (crédito líquido − lance do bolso)
  initialInstallment: number;
  postInstallment: number;
  monthsAfter: number;
  contemplationMonth: number;
  totalCashOut: number;
}

export function summarizePlan(r: PlanResult): QuotaSummary {
  return {
    credit: r.creditAtContemplation,
    bidCash: r.bidCash,
    bidEmbedded: r.bidEmbedded,
    netCredit: r.netCredit,
    netCash: r.netCredit - r.bidCash,
    initialInstallment: r.rows[0] ? r.rows[0].installment : 0,
    postInstallment: r.postInstallment,
    monthsAfter: r.monthsAfterContemplation,
    contemplationMonth: r.contemplationMonth,
    totalCashOut: r.totalCashOut
  };
}

/** Soma das cotas e a saída do bolso mês a mês (todas começando no mês 1). */
export function aggregatePlans(results: PlanResult[]) {
  const sums = results.map(summarizePlan);
  const total = sums.reduce((acc, s) => ({
    credit: acc.credit + s.credit,
    bidCash: acc.bidCash + s.bidCash,
    bidEmbedded: acc.bidEmbedded + s.bidEmbedded,
    netCredit: acc.netCredit + s.netCredit,
    netCash: acc.netCash + s.netCash,
    initialInstallment: acc.initialInstallment + s.initialInstallment,
    postInstallment: acc.postInstallment + s.postInstallment,
    monthsAfter: Math.max(acc.monthsAfter, s.monthsAfter),
    contemplationMonth: Math.max(acc.contemplationMonth, s.contemplationMonth),
    totalCashOut: acc.totalCashOut + s.totalCashOut
  }), { credit: 0, bidCash: 0, bidEmbedded: 0, netCredit: 0, netCash: 0, initialInstallment: 0, postInstallment: 0, monthsAfter: 0, contemplationMonth: 0, totalCashOut: 0 } as QuotaSummary);
  const months = Math.max(0, ...results.map(r => r.rows.length));
  const monthly = Array.from({ length: months }, (_, i) => results.reduce((s, r) => {
    const row = r.rows[i];
    return s + (row ? row.installment + row.insurance : 0);
  }, 0));
  return { quotas: sums, total, monthly };
}

// ─── Capital livre: rendimento e cobertura das parcelas ─────────────────────
export interface CapitalCoverage {
  capital: number;
  monthlyIncome: number;        // rendimento do 1º mês (+ renda extra)
  coveragePct: number;          // quanto da 1ª parcela o rendimento paga
  monthsCovered: number;        // meses em que o capital (rendendo) paga as parcelas
  coversAll: boolean;
  leftover: number;             // o que sobra se pagar tudo
}

/**
 * Capital investido pagando parcelas: rende todo mês e, no mesmo mês, sai a
 * parcela (menos uma renda extra, como aluguel). Conta quantos meses ele aguenta.
 */
export function capitalCoverage(capital: number, ratePctYear: number, outflows: number[], extraMonthlyIncome = 0): CapitalCoverage {
  const c0 = pos(capital);
  const r = annualToMonthly(ratePctYear);
  const extra = pos(extraMonthlyIncome);
  const first = outflows.find(v => v > 0) || 0;
  const monthlyIncome = c0 * r + extra;
  let bal = c0;
  let months = 0;
  for (const out of outflows) {
    const next = bal * (1 + r) + extra - pos(out);
    if (next < -0.005) break;
    bal = next;
    months++;
  }
  const coversAll = months === outflows.length;
  return {
    capital: c0, monthlyIncome,
    coveragePct: first > 0 ? (monthlyIncome / first) * 100 : 0,
    monthsCovered: months, coversAll, leftover: coversAll ? bal : 0
  };
}

// ─── Quitar financiamento com várias cotas ──────────────────────────────────
export interface PayoffPortfolioInput {
  financingBalance: number;           // saldo para quitar HOJE
  financingInstallments?: number[];   // parcelas reais que faltam (mês 1, 2…)
  financingRatePctMonth?: number;     // sem parcelas reais: juros do contrato
  financingMonths?: number;
  financingSystem?: AmortizationSystem;
  quotas: PlanResult[];               // cotas escolhidas (já simuladas)
  /**
   * Por cota: true = cota que você JÁ TEM. As parcelas (e o crédito) dela
   * existem com ou sem a quitação, então entram nos dois caminhos — só a
   * cota nova é custo a mais por trocar.
   */
  committed?: boolean[];
  opportunityPctYear: number;
  renovation?: number;                // parte do capital livre usada em reforma
  investRatePctYear?: number;         // rendimento do que for investido
  extraMonthlyIncome?: number;        // ex.: aluguel a mais depois da reforma
}

export function evaluatePayoffPortfolio(p: PayoffPortfolioInput) {
  const B0 = pos(p.financingBalance);
  // Parcelas do financiamento: as reais, ou geradas pela taxa/sistema.
  const real = (p.financingInstallments || []).filter(v => pos(v) > 0);
  const finPayments = real.length
    ? real
    : simulateFinancing(B0, monthlyToAnnualPct(pos(p.financingRatePctMonth) / 100), p.financingMonths || 1, p.financingSystem || 'PRICE').flows.map(f => -f.v);
  // Juros do financiamento: os do contrato, ou o implícito nas parcelas reais.
  const implied = irr([{ t: 0, v: B0 }, ...finPayments.map((v, i) => ({ t: i + 1, v: -v }))]);
  const r = real.length ? Math.max(0, implied ?? 0) : pos(p.financingRatePctMonth) / 100;

  // Quita quando todo o crédito das cotas escolhidas estiver liberado.
  const X = Math.max(1, ...p.quotas.map(q => q.contemplationMonth));
  const paidBefore = finPayments.slice(0, X - 1);
  const owedAtX = Math.max(0, finPayments.slice(X - 1).reduce((s, v, i) => s + v / Math.pow(1 + r, i), 0));

  const netCredit = p.quotas.reduce((s, q) => s + q.netCredit, 0);
  const ownBid = p.quotas.reduce((s, q) => s + q.bidCash, 0);
  const freeCapital = netCredit - owedAtX;
  const renovation = Math.min(Math.max(0, freeCapital), pos(p.renovation));
  const invested = Math.max(0, freeCapital - renovation);

  // Saída mensal das cotas (sem lances), mês a mês desde o mês 1.
  const months = Math.max(0, ...p.quotas.map(q => q.rows.length));
  const consMonthly = Array.from({ length: months }, (_, i) => p.quotas.reduce((s, q) => {
    const row = q.rows[i];
    return s + (row ? row.installment + row.insurance : 0);
  }, 0));
  const afterX = consMonthly.slice(X);

  const committed = p.quotas.map((_, i) => !!p.committed?.[i]);
  // O que você já paga hoje das cotas que já tem (1º mês).
  const alreadyPaying = p.quotas.reduce((s, q, i) => s + (committed[i] && q.rows[0] ? q.rows[0].installment + q.rows[0].insurance : 0), 0);
  const todayMonthly = (finPayments[0] || 0) + alreadyPaying;

  const o = annualToMonthly(p.opportunityPctYear);
  const keepFlows: Flow[] = [
    ...finPayments.map((v, i) => ({ t: i + 1, v: -v })),
    ...p.quotas.flatMap((q, i) => (committed[i] ? q.flows : []))
  ];
  const switchFlows: Flow[] = [
    ...paidBefore.map((v, i) => ({ t: i + 1, v: -v })),
    { t: X, v: -owedAtX },
    ...p.quotas.flatMap(q => q.flows)
  ];
  const pvKeep = -npv(o, keepFlows);
  const pvSwitch = -npv(o, switchFlows);

  return {
    payoffMonth: X,
    owedAtPayoff: owedAtX,
    impliedRatePctMonth: r * 100,
    netCredit, ownBid, freeCapital, renovation, invested,
    newMoney: freeCapital - ownBid,                 // capital livre menos o lance do bolso
    financingInstallment: finPayments[0] || 0,
    alreadyPaying,
    todayMonthly,
    financingTotal: finPayments.reduce((s, v) => s + v, 0),
    bothBeforePayoff: X > 1 ? (finPayments[0] || 0) + (consMonthly[0] || 0) : 0,
    consortiumAfter: afterX[0] || 0,
    consortiumTotal: consMonthly.reduce((s, v) => s + v, 0),
    monthlyDifference: todayMonthly - (afterX[0] || 0),
    pvCostKeepFinancing: pvKeep,
    pvCostSwitch: pvSwitch,
    advantage: pvKeep - pvSwitch,
    coverage: capitalCoverage(invested, p.investRatePctYear ?? p.opportunityPctYear, afterX, p.extraMonthlyIncome || 0)
  };
}

/**
 * Consórcio digitado à mão (já contemplado no mês 1): crédito líquido, lance
 * do bolso e as parcelas que ficam — no formato do plano, para a quitação.
 */
export function manualContemplatedPlan(q: { netCredit: number; ownBid: number; installment: number; months: number; annualIndexPct?: number }): PlanResult {
  const n = Math.max(0, Math.floor(pos(q.months)));
  const idx = pos(q.annualIndexPct) / 100;
  const rows: PlanRow[] = [{ month: 1, phase: 'pre', credit: pos(q.netCredit), pct: 0, installment: 0, insurance: 0, bidCash: pos(q.ownBid), total: pos(q.ownBid), balancePct: 0, balance: 0 }];
  for (let i = 0; i < n; i++) {
    const installment = pos(q.installment) * Math.pow(1 + idx, Math.floor(i / 12));
    rows.push({ month: i + 2, phase: 'post', credit: pos(q.netCredit), pct: 0, installment, insurance: 0, bidCash: 0, total: installment, balancePct: 0, balance: 0 });
  }
  const totalInstallments = rows.reduce((s, r) => s + r.installment, 0);
  return {
    planPct: 0, contemplationMonth: 1, fullInstallment: pos(q.installment), preInstallment: 0, postInstallment: pos(q.installment),
    creditAtContemplation: pos(q.netCredit), bidCash: pos(q.ownBid), bidEmbedded: 0, netCredit: pos(q.netCredit),
    balanceBeforeBid: 0, balanceAfterBid: totalInstallments, monthsTotal: rows.length, monthsAfterContemplation: n,
    totalInstallments, totalInsurance: 0, totalCashOut: totalInstallments + pos(q.ownBid),
    nominalCost: totalInstallments + pos(q.ownBid) - pos(q.netCredit), costPctOfCredit: 0, cetAfterContemplationPct: null,
    rows,
    flows: [...rows.map(r => ({ t: r.month, v: -r.total })), { t: 1, v: pos(q.netCredit) }],
    warnings: []
  };
}
