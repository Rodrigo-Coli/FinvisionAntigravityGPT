// Curva automática de títulos de renda fixa (CRA, CRI, debêntures, CDB…).
//
// O app do banco mostra o valor de MERCADO; o relatório mensal traz a CURVA
// (o que o título vale se você segurar até o vencimento). Para não depender do
// relatório todo mês, a curva é projetada pela taxa contratada:
//   · Prefixado (PRE):  valor × (1 + taxa)^(dias úteis/252)
//   · % do CDI:         valor × Π(1 + CDI do dia × %)          (CDI diário do Banco Central)
//   · IPCA + taxa:      valor × (1 + IPCA do mês)^(du/du do mês) × (1 + taxa)^(du/252)
// Quando o relatório chega, um acerto (Ajuste Manual) corrige a diferença e a
// projeção segue a partir dali.
//
// Quem usa: api/_lib/curve-projection.ts (rotina diária) e a tela do Radar.

export type CurveIndex = 'PRE' | 'CDI' | 'IPCA';

const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
const addDays = (s: string, n: number) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function easter(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const holidayCache = new Map<number, Set<string>>();
/** Feriados nacionais (calendário da B3/ANBIMA): fixos + Carnaval, Sexta-feira Santa e Corpus Christi. */
export function holidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const e = easter(year);
  const set = new Set<string>([
    `${year}-01-01`, `${year}-04-21`, `${year}-05-01`, `${year}-09-07`, `${year}-10-12`,
    `${year}-11-02`, `${year}-11-15`, `${year}-11-20`, `${year}-12-25`,
    addDays(e, -48), addDays(e, -47), // Carnaval (segunda e terça)
    addDays(e, -2),                   // Sexta-feira Santa
    addDays(e, 60)                    // Corpus Christi
  ]);
  holidayCache.set(year, set);
  return set;
}

export function isBusinessDay(day: string): boolean {
  const wd = parse(day).getUTCDay();
  if (wd === 0 || wd === 6) return false;
  return !holidays(Number(day.slice(0, 4))).has(day);
}

/** Dias úteis em (from, to] — o dia de partida já está no valor; conta até o dia final. */
export function businessDaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  if (to <= from) return out;
  let d = addDays(from, 1);
  while (d <= to) {
    if (isBusinessDay(d)) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export interface Indexes {
  /** CDI do dia em % a.d. (série 12 do BCB), por data AAAA-MM-DD. */
  cdiDaily?: Map<string, number>;
  /** CDI anual em % (usado nos dias sem dado diário). */
  cdiAnnual: number;
  /** IPCA do mês em % (série 433 do BCB), por AAAA-MM. */
  ipcaMonthly?: Map<string, number>;
  /** IPCA anual em % (usado nos meses ainda sem IPCA divulgado). */
  ipcaAnnual: number;
}

export interface CurveSpec {
  index: CurveIndex;
  /** PRE e IPCA: taxa ao ano em %. CDI: % do CDI (ex.: 105,15). */
  rate: number;
}

/** Fator da curva entre duas datas. */
export function curveFactor(spec: CurveSpec, from: string, to: string, idx: Indexes): number {
  const days = businessDaysBetween(from, to);
  if (days.length === 0) return 1;
  const rate = Number(spec.rate) || 0;
  if (spec.index === 'PRE') return Math.pow(1 + rate / 100, days.length / 252);

  if (spec.index === 'CDI') {
    const fallback = Math.pow(1 + (idx.cdiAnnual || 0) / 100, 1 / 252) - 1;
    let lastKnown: number | null = null;
    let f = 1;
    for (const d of days) {
      const v = idx.cdiDaily?.get(d);
      const daily = v !== undefined ? v / 100 : (lastKnown ?? fallback);
      if (v !== undefined) lastKnown = v / 100;
      f *= 1 + daily * (rate / 100);
    }
    return f;
  }

  // IPCA + taxa: correção pelo IPCA pró-rata (dias úteis do mês) × juro real.
  const fallbackMonth = Math.pow(1 + (idx.ipcaAnnual || 0) / 100, 1 / 12) - 1;
  let f = Math.pow(1 + rate / 100, days.length / 252);
  const byMonth = new Map<string, number>();
  for (const d of days) byMonth.set(d.slice(0, 7), (byMonth.get(d.slice(0, 7)) || 0) + 1);
  for (const [month, count] of byMonth) {
    const [y, m] = month.split('-').map(Number);
    const first = `${month}-01`;
    const last = iso(new Date(Date.UTC(y, m, 0)));
    const duMonth = businessDaysBetween(addDays(first, -1), last).length || 21;
    const ipca = idx.ipcaMonthly?.get(month);
    const monthRate = ipca !== undefined ? ipca / 100 : fallbackMonth;
    f *= Math.pow(1 + monthRate, count / duMonth);
  }
  return f;
}

/** Qual curva o título segue (a partir do cadastro). null = não dá para projetar. */
export function curveSpecOf(meta: Record<string, any> | null | undefined): CurveSpec | null {
  if (!meta) return null;
  const rate = Number(String(meta.yieldRate ?? '').replace(',', '.'));
  if (!(rate > 0)) return null;
  const interest = String(meta.interestType || '').toUpperCase();
  if (interest.includes('IPCA')) return { index: 'IPCA', rate };
  if (interest.includes('CDI') || interest.includes('SELIC')) return { index: 'CDI', rate };
  if (interest.includes('PRE') || interest.includes('PRÉ') || interest.includes('FIXO')) return { index: 'PRE', rate };
  return null;
}

/** Tipos em que a curva automática faz sentido (fundos e ações seguem a cota/bolsa). */
export const CURVE_TYPES = ['CRI_CRA', 'DEBENTURES', 'CDB', 'LCI_LCA', 'TESOURO'];

export const AUTO_NOTE_PREFIX = '[curva automática]';

export interface Movement {
  id?: string;
  movement_type: string;
  amount: number;
  movement_date: string;
  notes?: string | null;
}

/** Quanto o movimento mexe no valor do título (mesma regra do extrato do Patrimônio). */
export function valueDelta(m: Movement): number {
  const amt = Number(m.amount) || 0;
  switch (m.movement_type) {
    case 'APORTE':
    case 'RENDIMENTO_ACUMULADO':
    case 'AJUSTE_MANUAL':
      return amt;
    case 'AMORTIZACAO':
    case 'RESGATE_PARCIAL':
    case 'RESGATE_TOTAL':
      return -Math.abs(amt);
    default:
      return 0;
  }
}

const isAuto = (m: Movement) => String(m.notes || '').startsWith(AUTO_NOTE_PREFIX);
const monthEnd = (s: string) => { const d = parse(s); return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))); };
const round2 = (n: number) => Math.round(n * 100) / 100;
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export interface ProjectionPlan {
  /** Linhas de meses que já fecharam e ainda não tinham rendimento (uma por mês, no último dia). */
  closedRows: { movement_date: string; amount: number; notes: string }[];
  /** Linha do mês atual (substitui a anterior do mês, se houver). null quando não há o que lançar. */
  openRow: { movement_date: string; amount: number; notes: string } | null;
  /** Id da linha automática do mês atual que será substituída. */
  replaceOpenRowId: string | null;
  /** Valor pela curva hoje. */
  value: number;
}

/**
 * Plano de atualização da curva até `today`:
 *  1. parte do último movimento antes do mês atual (o valor do extrato até ali);
 *  2. fecha os meses que faltam com uma linha de rendimento cada (último dia do mês);
 *  3. no mês atual, projeta passando pelos movimentos do mês (aportes, juros pagos,
 *     acertos pelo relatório) e grava/atualiza UMA linha automática do mês.
 * Movimentos digitados pela pessoa nunca são mexidos.
 */
export function planCurve(movements: Movement[], spec: CurveSpec, today: string, idx: Indexes): ProjectionPlan {
  const monthStart = `${today.slice(0, 7)}-01`;
  const currentAuto = movements.filter(m => isAuto(m) && m.movement_date >= monthStart);
  const rest = movements
    .filter(m => !currentAuto.includes(m))
    .sort((a, b) => a.movement_date.localeCompare(b.movement_date));
  const before = rest.filter(m => m.movement_date < monthStart);
  const inMonth = rest.filter(m => m.movement_date >= monthStart && m.movement_date <= today);

  let value = before.reduce((s, m) => s + valueDelta(m), 0);
  let cursor = before.length ? before[before.length - 1].movement_date : null;
  const closedRows: ProjectionPlan['closedRows'] = [];

  if (cursor && value > 0) {
    // Fecha os meses entre o último movimento e o mês atual.
    let end = monthEnd(cursor);
    if (end === cursor) end = monthEnd(addDays(cursor, 1));
    while (end < monthStart) {
      const next = value * curveFactor(spec, cursor, end, idx);
      const amount = round2(next - value);
      if (amount !== 0) {
        const d = parse(end);
        closedRows.push({ movement_date: end, amount, notes: `${AUTO_NOTE_PREFIX} ${MONTHS[d.getUTCMonth()]}/${d.getUTCFullYear()} pela taxa contratada` });
      }
      value = round2(value + amount);
      cursor = end;
      end = monthEnd(addDays(end, 1));
    }
  }

  // Mês atual, passando pelos movimentos digitados.
  let projected = value;
  let flows = 0;
  for (const m of inMonth) {
    if (cursor && projected > 0) projected *= curveFactor(spec, cursor, m.movement_date, idx);
    const delta = valueDelta(m);
    projected += delta;
    flows += delta;
    cursor = m.movement_date;
  }
  if (cursor && projected > 0) projected *= curveFactor(spec, cursor, today, idx);
  projected = round2(projected);
  const openAmount = round2(projected - value - flows);
  const d = parse(today);
  return {
    closedRows,
    openRow: openAmount !== 0
      ? { movement_date: today, amount: openAmount, notes: `${AUTO_NOTE_PREFIX} ${MONTHS[d.getUTCMonth()]}/${d.getUTCFullYear()} até ${today.split('-').reverse().join('/')} pela taxa contratada` }
      : null,
    replaceOpenRowId: currentAuto[0]?.id || null,
    value: projected
  };
}

/**
 * Acerto pela curva do relatório: dado o valor real numa data, quanto lançar
 * de Ajuste Manual para o extrato bater (positivo ou negativo).
 */
export function reportAdjustment(projectedAtDate: number, reportValue: number): number {
  return round2(reportValue - projectedAtDate);
}
