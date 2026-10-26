/**
 * Estado do simulador de consórcio ("Várias cotas") e a ponte com a IA.
 *
 * A IA NUNCA calcula: ela só devolve parâmetros (carta, prazo, taxas, lance,
 * mês…). Aqui eles são validados, limitados a faixas sensatas e aplicados sobre
 * o estado atual; o motor (lib/consortiumSimulator.ts) faz as contas. Cota
 * "minha" sempre parte dos números reais do cadastro — a IA não inventa saldo.
 */

export type BidUnit = 'PCT' | 'BRL' | 'INST';
export type QuotaBidMode = 'REDUCE_TERM' | 'REDUCE_INSTALLMENT';

export interface QuotaDraft {
  key: string;
  name: string;
  source: string;          // '' = cota nova; senão id do consórcio cadastrado
  credit: string; term: string; adm: string; fr: string; reduced: string;
  balance: string; remaining: string; installment: string;
  unit: BidUnit; baseTerm: string; free: string; emb: string;
  month: string; mode: QuotaBidMode;
}

export interface SimPremises { index: string; insurance: string; opportunity: string }
export interface SimulationState { premises: SimPremises; quotas: QuotaDraft[] }

/** Consórcio cadastrado, no formato que a tela e a IA usam. */
export interface KnownConsortium {
  id: string;
  name: string;
  administrator?: string | null;
  status?: string | null;
  credit: number;
  totalMonths: number;
  adminFeePct: number;
  reserveFundPct: number;
  balance: number | null;
  remainingMonths: number | null;
  currentInstallment: number | null;
  /** Já contemplada: o lance já foi registrado e o crédito disponível é o líquido. */
  contemplated?: boolean;
  netCredit?: number | null;
}

/**
 * Crédito que a cota tem para usar. Contemplada com lance embutido: o
 * crédito líquido (carta − embutido), que é o que a administradora libera.
 */
export function availableCredit(c: { credit_letter_value?: unknown; status?: string | null; metadata?: any }): { credit: number; contemplated: boolean; netCredit: number | null } {
  const carta = Number(c.credit_letter_value) || 0;
  const contemplated = !!c.status && c.status !== 'WAITING';
  const net = Number(c.metadata?.net_credit);
  const netCredit = contemplated && Number.isFinite(net) && net > 0 ? net : null;
  return { credit: netCredit ?? carta, contemplated, netCredit };
}

/**
 * Lances já dados na cota (registrados pelo botão "Lance"): quanto saiu do
 * bolso e quanto foi embutido. Lance antigo sem a divisão conta como do bolso.
 */
export function paidBids(metadata: any): { cash: number; embedded: number; firstDate: string | null } {
  const bids = Array.isArray(metadata?.bids) ? metadata.bids : [];
  let cash = 0, embedded = 0;
  let firstDate: string | null = null;
  for (const b of bids) {
    if (!b || typeof b !== 'object') continue;
    const hasSplit = b.cash_amount !== undefined || b.embedded_amount !== undefined;
    const c = hasSplit ? Number(b.cash_amount) || 0 : Number(b.amount) || 0;
    const e = hasSplit ? Number(b.embedded_amount) || 0 : 0;
    if (c <= 0 && e <= 0) continue;
    cash += c;
    embedded += e;
    const d = typeof b.date === 'string' ? b.date.slice(0, 10) : '';
    if (d && (!firstDate || d < firstDate)) firstDate = d;
  }
  return { cash: Math.round(cash * 100) / 100, embedded: Math.round(embedded * 100) / 100, firstDate };
}

export interface AiQuota {
  name?: string;
  source?: string;
  credit?: number; termMonths?: number; adminFeePct?: number; reserveFundPct?: number; reducedPct?: number;
  balance?: number; remainingMonths?: number; currentInstallment?: number;
  bidUnit?: string; baseTermMonths?: number; freeBid?: number; embeddedBid?: number;
  contemplationInMonths?: number; bidMode?: string;
}

export interface AiSimulation {
  reply?: string;
  premises?: { indexPct?: number; insurancePct?: number; opportunityPct?: number };
  quotas?: AiQuota[];
}

export const MAX_QUOTAS = 12;

export const newQuotaKey = () => Math.random().toString(36).slice(2, 10);

/** Número → texto do campo ("1234,5"); inteiro sem casas. */
export const numToField = (v: number, digits = 2): string => {
  if (!Number.isFinite(v)) return '';
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return String(r).replace('.', ',');
};

export const blankQuota = (n: number): QuotaDraft => ({
  key: newQuotaKey(), name: `Cota ${n}`, source: '',
  credit: '200.000', term: '200', adm: '18', fr: '2', reduced: '100',
  balance: '', remaining: '', installment: '',
  unit: 'PCT', baseTerm: '240', free: '0', emb: '0', month: '1', mode: 'REDUCE_INSTALLMENT'
});

/** Cota "minha" a partir do cadastro (números reais). */
export const quotaFromKnown = (c: KnownConsortium): QuotaDraft => ({
  ...blankQuota(1),
  name: c.name,
  source: c.id,
  // Contemplada: crédito líquido, sem lance (o lance já foi dado e registrado).
  credit: numToField(c.contemplated && c.netCredit ? c.netCredit : c.credit),
  free: '0', emb: '0', month: '1',
  term: String(c.totalMonths || ''),
  adm: numToField(c.adminFeePct),
  fr: numToField(c.reserveFundPct),
  balance: c.balance !== null ? numToField(c.balance) : '',
  remaining: c.remainingMonths !== null ? String(c.remainingMonths) : '',
  installment: c.currentInstallment !== null ? numToField(c.currentInstallment) : ''
});

const fieldToNum = (s: string): number => {
  const t = String(s ?? '').trim();
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Rascunhos salvos no aparelho antes de a cota ser contemplada (ou antes desta
 * regra) guardam a carta cheia e às vezes um lance. Cota minha já contemplada
 * usa sempre o crédito líquido, sem lance novo. Devolve a mesma lista quando
 * nada muda (para não re-renderizar à toa).
 */
export function refreshContemplatedQuotas(quotas: QuotaDraft[], known: KnownConsortium[]): QuotaDraft[] {
  let changed = false;
  const next = quotas.map(q => {
    const k = q.source ? known.find(x => x.id === q.source) : undefined;
    if (!k?.contemplated || !k.netCredit) return q;
    const staleCredit = Math.abs(fieldToNum(q.credit) - k.credit) < 0.01;
    const hasBid = fieldToNum(q.free) > 0 || fieldToNum(q.emb) > 0;
    if (!staleCredit && !hasBid) return q;
    changed = true;
    return { ...q, ...(staleCredit ? { credit: numToField(k.netCredit) } : {}), free: '0', emb: '0', month: '1' };
  });
  return changed ? next : quotas;
}

/** Chaves das cotas que repetem uma cota minha já listada antes (a mesma cota não conta duas vezes). */
export function repeatedQuotaKeys(quotas: QuotaDraft[]): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const q of quotas) {
    if (!q.source) continue;
    if (seen.has(q.source)) repeated.add(q.key); else seen.add(q.source);
  }
  return repeated;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Aplica a resposta da IA sobre o estado atual.
 * - Sem `quotas` na resposta: as cotas ficam como estão (a IA só conversou).
 * - Com `quotas`: a lista passa a ser a da IA (é assim que ela adiciona,
 *   remove ou muda cotas). Cada cota parte da cota atual de mesmo nome/origem
 *   (para manter o que o usuário editou), ou do cadastro, ou do padrão.
 */
export function applyAiSimulation(ai: AiSimulation, current: SimulationState, known: KnownConsortium[]): SimulationState {
  const premises: SimPremises = { ...current.premises };
  const p = ai?.premises || {};
  if (finite(p.indexPct)) premises.index = numToField(clamp(p.indexPct, -20, 50));
  if (finite(p.insurancePct)) premises.insurance = numToField(clamp(p.insurancePct, 0, 2), 4);
  if (finite(p.opportunityPct)) premises.opportunity = numToField(clamp(p.opportunityPct, 0, 60));

  if (!Array.isArray(ai?.quotas) || ai.quotas.length === 0) return { premises, quotas: current.quotas };

  const used = new Set<string>();
  const quotas = ai.quotas.slice(0, MAX_QUOTAS).map((q, i) => {
    const knownMatch = q.source ? known.find(k => k.id === q.source) : undefined;
    // Reaproveita a cota atual equivalente (mesma origem, ou mesmo nome numa cota nova).
    const prev = current.quotas.find(c => !used.has(c.key) && (
      (knownMatch && c.source === knownMatch.id) || (!knownMatch && !c.source && q.name && c.name === q.name)
    ));
    if (prev) used.add(prev.key);
    let d: QuotaDraft = prev ? { ...prev } : knownMatch ? quotaFromKnown(knownMatch) : blankQuota(i + 1);
    if (!knownMatch) d.source = '';
    else if (!prev) d = quotaFromKnown(knownMatch);
    d.key = prev ? prev.key : newQuotaKey();

    if (typeof q.name === 'string' && q.name.trim()) d.name = q.name.trim().slice(0, 60);
    if (finite(q.credit) && q.credit > 0) d.credit = numToField(clamp(q.credit, 1000, 100_000_000));
    if (!d.source) {
      if (finite(q.termMonths) && q.termMonths > 0) d.term = String(Math.round(clamp(q.termMonths, 1, 420)));
      if (finite(q.reducedPct)) d.reduced = numToField(clamp(q.reducedPct, 1, 100));
    } else {
      // Cota minha: saldo/parcelas/parcela só mudam se a IA mandar (ex.: "considere saldo de X").
      if (finite(q.balance) && q.balance >= 0) d.balance = numToField(clamp(q.balance, 0, 100_000_000));
      if (finite(q.remainingMonths) && q.remainingMonths > 0) d.remaining = String(Math.round(clamp(q.remainingMonths, 1, 420)));
      if (finite(q.currentInstallment) && q.currentInstallment >= 0) d.installment = numToField(clamp(q.currentInstallment, 0, 10_000_000));
    }
    if (finite(q.adminFeePct)) d.adm = numToField(clamp(q.adminFeePct, 0, 60));
    if (finite(q.reserveFundPct)) d.fr = numToField(clamp(q.reserveFundPct, 0, 15));
    if (q.bidUnit === 'PCT' || q.bidUnit === 'BRL' || q.bidUnit === 'INST') d.unit = q.bidUnit;
    if (finite(q.baseTermMonths) && q.baseTermMonths > 0) d.baseTerm = String(Math.round(clamp(q.baseTermMonths, 1, 420)));
    const bidMax = d.unit === 'PCT' ? 200 : d.unit === 'INST' ? 420 : 100_000_000;
    if (finite(q.freeBid)) d.free = numToField(clamp(q.freeBid, 0, bidMax));
    if (finite(q.embeddedBid)) d.emb = numToField(clamp(q.embeddedBid, 0, bidMax));
    if (finite(q.contemplationInMonths) && q.contemplationInMonths > 0) d.month = String(Math.round(clamp(q.contemplationInMonths, 1, 420)));
    if (q.bidMode === 'REDUCE_TERM' || q.bidMode === 'REDUCE_INSTALLMENT') d.mode = q.bidMode;
    return d;
  });
  return { premises, quotas };
}

const normalize = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Lançamento antigo, sem vínculo com o consórcio, que é pagamento desta cota
 * pela descrição: "Grupo 1119 cota 403", "grupo: 1119 - cota: 403", "1119-403",
 * "1119/403". Número exato (403 não casa com 4030).
 */
export function matchesQuotaDescription(description: string, group: string | number, quota: string | number): boolean {
  const g = String(group ?? '').replace(/^0+/, '').trim();
  const q = String(quota ?? '').replace(/^0+/, '').trim();
  if (!g || !q || !/^\d+$/.test(g) || !/^\d+$/.test(q)) return false;
  const d = normalize(description);
  const named = new RegExp(`grupo\\D{0,3}0*${g}(?!\\d)\\D{1,12}cota\\D{0,3}0*${q}(?!\\d)`);
  // Sem lookbehind (iOS antigo não suporta): o número tem que vir no início ou depois de não-dígito.
  const pair = new RegExp(`(?:^|\\D)0*${g}\\s*[-/]\\s*0*${q}(?!\\d)`);
  return named.test(d) || pair.test(d);
}
