/**
 * Card "Resumo das faturas" (Cartões): quanto cada cartão tem de fatura num mês.
 *
 * O mês é o do VENCIMENTO — o mesmo nome que o seletor de Período da tela usa
 * (DateUtils.formatStatementLabel: "NOVEMBRO / 2026" é a fatura que vence em
 * novembro). Assim o resumo e a tela do cartão falam da mesma fatura.
 *
 * O valor da fatura é a soma das compras dela (como a tela do cartão calcula),
 * e só cai no total gravado (total_amount) quando as compras não puderam ser
 * lidas (offline). Cada fatura pertence a um cartão só, então somar as linhas
 * não conta nada duas vezes.
 */
import { isSettledStatement } from './cardStatements';

export interface SummaryCard {
  id: string;
  name?: string | null;
  last4?: string | null;
  is_additional?: boolean | null;
  parent_card_id?: string | null;
  sums_into_invoice?: boolean | null;
}

export interface SummaryStatement {
  id: string;
  card_id: string;
  year: number;
  month: number;
  due_date?: string | null;
  status?: string | null;
  total_amount?: number | string | null;
  paid_amount?: number | string | null;
}

export type SummaryStatus = 'PAGA' | 'ABERTA' | 'SEM_FATURA';

export interface SummaryRow<C extends SummaryCard = SummaryCard> {
  card: C;
  /** 0 = titular/sem adicional; 1 = adicional, mostrado abaixo do titular. */
  level: 0 | 1;
  statementIds: string[];
  dueDate: string | null;
  total: number;
  paid: number;
  open: number;
  status: SummaryStatus;
}

export interface CardsMonthSummary<C extends SummaryCard = SummaryCard> {
  rows: SummaryRow<C>[];
  total: number;
  paid: number;
  open: number;
}

const r2 = (v: number) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/** "AAAA-MM" do vencimento (UTC, como o seletor da tela); sem vencimento, ano/mês da fatura. */
export function statementMonthKey(s: Pick<SummaryStatement, 'due_date' | 'year' | 'month'>): string {
  const due = s.due_date ? new Date(s.due_date) : null;
  if (due && !isNaN(due.getTime())) {
    return `${due.getUTCFullYear()}-${String(due.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return `${Number(s.year)}-${String(Number(s.month)).padStart(2, '0')}`;
}

export const monthKeyOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

/** Meses com fatura (mais novo primeiro), sempre incluindo `ensure` (o mês atual). */
export function availableMonthKeys(statements: SummaryStatement[], ensure?: string): string[] {
  const set = new Set((statements || []).map(statementMonthKey));
  if (ensure) set.add(ensure);
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

/** Titular primeiro (por nome) e, logo abaixo, os adicionais dele. */
export function orderCards<C extends SummaryCard>(cards: C[]): { card: C; level: 0 | 1 }[] {
  const byName = (a: C, b: C) => String(a.name || '').localeCompare(String(b.name || ''));
  const ids = new Set(cards.map(c => c.id));
  // Adicional cujo titular não está na lista (arquivado) vira linha própria.
  const mains = cards.filter(c => !c.is_additional || !c.parent_card_id || !ids.has(c.parent_card_id)).sort(byName);
  const out: { card: C; level: 0 | 1 }[] = [];
  for (const main of mains) {
    out.push({ card: main, level: 0 });
    cards
      .filter(c => c.is_additional && c.parent_card_id === main.id && c.id !== main.id)
      .sort(byName)
      .forEach(child => out.push({ card: child, level: 1 }));
  }
  return out;
}

/**
 * Monta o resumo do mês. `txTotals` = soma das compras por fatura (id → valor);
 * fatura sem entrada ali usa o total gravado.
 */
export function buildCardsMonthSummary<C extends SummaryCard>(
  cards: C[],
  statements: SummaryStatement[],
  monthKey: string,
  txTotals?: Record<string, number> | null
): CardsMonthSummary<C> {
  const ofMonth = (statements || []).filter(s => statementMonthKey(s) === monthKey);
  const rows: SummaryRow<C>[] = orderCards(cards || []).map(({ card, level }) => {
    const mine = ofMonth.filter(s => s.card_id === card.id);
    let total = 0;
    let paid = 0;
    for (const s of mine) {
      const t = txTotals && Object.prototype.hasOwnProperty.call(txTotals, s.id) ? txTotals[s.id] : Number(s.total_amount) || 0;
      total += t;
      paid += Number(s.paid_amount) || 0;
    }
    total = r2(total);
    paid = r2(paid);
    const open = r2(Math.max(0, total - paid));
    const settled = mine.every(s => isSettledStatement({
      ...s,
      total_amount: txTotals && Object.prototype.hasOwnProperty.call(txTotals, s.id) ? txTotals[s.id] : s.total_amount
    }));
    const status: SummaryStatus = mine.length === 0 ? 'SEM_FATURA' : settled || open === 0 ? 'PAGA' : 'ABERTA';
    const dueDate = mine.map(s => String(s.due_date || '').slice(0, 10)).filter(Boolean).sort()[0] || null;
    return { card, level, statementIds: mine.map(s => s.id), dueDate, total, paid, open, status };
  });
  return {
    rows,
    total: r2(rows.reduce((s, r) => s + r.total, 0)),
    paid: r2(rows.reduce((s, r) => s + r.paid, 0)),
    open: r2(rows.reduce((s, r) => s + r.open, 0))
  };
}
