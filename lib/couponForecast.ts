// Juros previstos (cupom) de títulos que pagam juros na conta (CRI, CRA, debêntures…).
//
// Para cada título com "Frequência dos Juros" e "Próximo Pagamento" cadastrados, o app
// mantém UMA receita prevista (em aberto) nas Transações, na conta onde os juros caem.
// Quando o dinheiro cai, a pessoa dá como recebido (ou ele chega pelo extrato) e o app
// liga ao investimento e cria o próximo previsto.
//
// Aqui ficam só as regras (sem banco): datas do cronograma, valor estimado e como
// reconhecer o crédito do extrato. Quem usa: api/_lib/coupon-forecast.ts.

import { curveFactor, curveSpecOf, valueDelta, type Indexes, type Movement } from './curveProjection.js';

export const FREQ_MONTHS: Record<string, number> = { MENSAL: 1, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 };

const pad = (n: number) => String(n).padStart(2, '0');
const isIso = (s: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').slice(0, 10));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Soma meses mantendo o dia (31/01 + 1 mês = 28 ou 29/02). */
export function addMonthsIso(date: string, months: number): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const total = (m - 1) + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(d, last))}`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400000);
}

/** Janela em que um pagamento real "é" o juro previsto daquela data. */
export const MATCH_BEFORE_DAYS = 20;
export const MATCH_AFTER_DAYS = 25;
/** Previsto vencido há mais que isso sem nada recebido: pula para o próximo. */
export const STALE_DAYS = 45;

export function inWindow(cycle: string, date: string): boolean {
  const diff = daysBetween(cycle, date);
  return diff >= -MATCH_BEFORE_DAYS && diff <= MATCH_AFTER_DAYS;
}

/** O título está pedindo juros previstos? */
export function wantsForecast(meta: Record<string, any> | null | undefined): boolean {
  if (!meta) return false;
  if (meta.couponForecast === false) return false;
  if (meta.status === 'RESGATADO') return false;
  if (!isIso(meta.couponNextDate)) return false;
  return true;
}

/**
 * Data do próximo juro a prever. Parte do "Próximo Pagamento" cadastrado e anda pelo
 * cronograma enquanto a data já foi paga (há juro recebido perto dela) ou ficou velha.
 * null = não há mais o que prever (passou do vencimento ou não tem periodicidade).
 */
export function nextCycle(
  meta: Record<string, any>,
  receivedDates: string[],
  today: string
): string | null {
  if (!isIso(meta.couponNextDate)) return null;
  const step = FREQ_MONTHS[String(meta.couponFrequency || '').toUpperCase()] || 0;
  const maturity = isIso(meta.vencimentoDate) ? String(meta.vencimentoDate).slice(0, 10) : null;
  let cycle = String(meta.couponNextDate).slice(0, 10);
  for (let guard = 0; guard < 240; guard++) {
    const paid = receivedDates.some(d => inWindow(cycle, d));
    const stale = daysBetween(cycle, today) > STALE_DAYS;
    if (!paid && !stale) break;
    if (!step) return null; // pagamento único/irregular: já foi, não há próximo
    cycle = addMonthsIso(cycle, step);
  }
  if (maturity && cycle > maturity) return null;
  return cycle;
}

/**
 * Valor estimado do juro: o último juro recebido (mesmo cronograma, valor parecido).
 * Sem histórico, projeta pela taxa sobre o valor aplicado no período.
 */
export function estimateCoupon(
  movements: Movement[],
  meta: Record<string, any>,
  cycle: string,
  idx: Indexes
): number | null {
  const coupons = movements
    .filter(m => m.movement_type === 'RENDIMENTO_MENSAL' && Math.abs(Number(m.amount)) > 0)
    .sort((a, b) => a.movement_date.localeCompare(b.movement_date));
  const last = coupons[coupons.length - 1];
  if (last) return round2(Math.abs(Number(last.amount)));

  const spec = curveSpecOf(meta);
  const step = FREQ_MONTHS[String(meta.couponFrequency || '').toUpperCase()] || 0;
  if (!spec || !step) return null;
  const principal = movements.reduce((s, m) => {
    if (m.movement_type === 'APORTE' || ['AMORTIZACAO', 'RESGATE_PARCIAL', 'RESGATE_TOTAL'].includes(m.movement_type)) return s + valueDelta(m);
    return s;
  }, 0);
  if (!(principal > 0)) return null;
  const est = principal * (curveFactor(spec, addMonthsIso(cycle, -step), cycle, idx) - 1);
  return est > 0.01 ? round2(est) : null;
}

const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const COUPON_WORDS = /\b(juros?|jur|cupom|cupons|rendimentos?|remunera\w*|pgto|pagto|pagamento|amort\w*)\b/;
const STOP = new Set(['cra', 'cri', 'cdb', 'lci', 'lca', 'cdi', 'ipca', 'pre', 'deb', 'debenture', 'debentures', 'sa', 's/a', 'ltda', 'de', 'do', 'da', 'e', 'and']);

/** Palavras do nome do título/emissor que ajudam a reconhecer o crédito no extrato. */
export function nameTokens(...names: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const n of names) {
    for (const w of norm(n || '').split(/[^a-z0-9]+/)) {
      if (w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)) out.add(w);
    }
  }
  return [...out];
}

/**
 * Esse crédito do extrato (já pago, numa conta) é o juro previsto?
 * Pede: data na janela, valor parecido com o estimado e descrição que fale de juros
 * ou cite o título/emissor. Lançamento já ligado a outro investimento não serve.
 */
export function isLikelyCouponCredit(
  tx: { date: string; amount: number; description?: string | null; type?: string; metadata?: any },
  ctx: { cycle: string; estimate: number; tokens: string[] }
): boolean {
  if (tx.type && tx.type !== 'INCOME') return false;
  const meta = tx.metadata || {};
  if (meta.expected_coupon_asset_id || meta.linked_asset_id || meta.investment_movement_id) return false;
  if (!inWindow(ctx.cycle, String(tx.date).slice(0, 10))) return false;
  const amt = Math.abs(Number(tx.amount) || 0);
  if (!(ctx.estimate > 0) || amt < ctx.estimate * 0.5 || amt > ctx.estimate * 1.6) return false;
  const desc = norm(tx.description || '');
  const mentionsAsset = ctx.tokens.some(t => desc.includes(t));
  return mentionsAsset || COUPON_WORDS.test(desc);
}

export const FORECAST_PREFIX = 'Juros previstos';

/** Dias de tolerância depois da data prevista antes de avisar que o juro não caiu. */
export const MISSED_GRACE_DAYS = 5;

export interface ForecastLite {
  id?: string;
  date: string;
  amount: number;
  metadata?: Record<string, any> | null;
}

export const cycleOf = (f: ForecastLite) => String(f.metadata?.expected_coupon_cycle || f.date || '').slice(0, 10);

/**
 * Juros não recebidos: previsto em aberto cuja data passou há mais de
 * MISSED_GRACE_DAYS dias. É só isso que dispara o alerta — enquanto o juro está
 * dentro do prazo, ou depois que é recebido/dispensado, nada aparece.
 */
export function missedCoupons<T extends ForecastLite>(forecasts: T[], today: string, grace = MISSED_GRACE_DAYS): T[] {
  return (forecasts || [])
    .filter(f => f.metadata?.expected_coupon_state === 'open' && cycleOf(f) && daysBetween(cycleOf(f), today) > grace)
    .sort((a, b) => cycleOf(a).localeCompare(cycleOf(b)));
}
