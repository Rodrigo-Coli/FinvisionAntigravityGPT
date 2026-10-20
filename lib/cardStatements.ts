/**
 * Qual fatura o cartão abre como "Fatura Atual".
 *
 * O período-alvo é o mês em que uma compra feita HOJE cai (passou do
 * fechamento, já é a do mês seguinte). Quando essa fatura ainda não existe —
 * ela só é criada na primeira compra do período — o app pegava "a aberta mais
 * antiga". Num cartão com uma fatura velha esquecida em aberto (ex.: 07/2020,
 * vazia), a tela abria em 2020: nenhuma compra aparecia, todas as faturas
 * reais viravam "Próximas" e a do mês aparecia como "anterior pendente".
 *
 * Agora, sem a do período-alvo, fica a aberta MAIS PRÓXIMA dele (no empate, a
 * anterior — é a que vence primeiro); sem nenhuma aberta, a mais próxima de
 * qualquer situação. Zerada não conta como aberta. As antigas em aberto
 * continuam no aviso de pendentes.
 */

export interface StatementLike {
  id?: string;
  year: number;
  month: number;
  status?: string | null;
  total_amount?: number | string | null;
  paid_amount?: number | string | null;
  closing_date?: string | null;
}

const OPEN_STATUSES = ['OPEN', 'DUE', 'PENDING'];

const money = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

/**
 * Fatura quitada: paga, ou ZERADA (nada a pagar não é conta em aberto — uma
 * fatura vazia de 2020 aparecia como "aberta" e virava a fatura atual).
 */
export const isSettledStatement = (s: StatementLike): boolean => {
  const total = money(s.total_amount);
  if (String(s.status || '').toUpperCase() === 'PAID') return true;
  if (total <= 0) return true;
  return money(s.paid_amount) >= total;
};

export type StatementSituation = 'ABERTA' | 'FECHADA' | 'PAGA';

/** Paga (ou zerada), fechada esperando pagamento, ou aberta recebendo compras. */
export function statementSituation(s: StatementLike, today: Date = new Date()): StatementSituation {
  if (isSettledStatement(s)) return 'PAGA';
  const closing = String(s.closing_date || '').slice(0, 10);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return closing && closing < todayStr ? 'FECHADA' : 'ABERTA';
}

const keyOf = (s: { year: number; month: number }) => Number(s.year) * 12 + Number(s.month);

const nearest = <T extends StatementLike>(pool: T[], target: number): T | undefined =>
  [...pool].sort((a, b) => {
    const da = Math.abs(keyOf(a) - target);
    const db = Math.abs(keyOf(b) - target);
    if (da !== db) return da - db;
    return keyOf(a) - keyOf(b); // empate: a anterior
  })[0];

export function pickCurrentStatement<T extends StatementLike>(
  statements: T[],
  targetYear: number,
  targetMonth: number
): T | undefined {
  if (!statements || statements.length === 0) return undefined;
  const exact = statements.find(s => Number(s.month) === targetMonth && Number(s.year) === targetYear);
  if (exact) return exact;

  const target = targetYear * 12 + targetMonth;
  // Zerada não conta como aberta (ver isSettledStatement).
  const open = statements.filter(s => OPEN_STATUSES.includes(String(s.status || '').toUpperCase()) && !isSettledStatement(s));
  return nearest(open, target) || nearest(statements, target);
}

/** Mês/ano em que uma compra feita em `today` cai, pelo dia de fechamento. */
export function targetStatementPeriod(today: Date, closingDay?: number | null): { year: number; month: number } {
  let month = today.getMonth(); // 0-11
  let year = today.getFullYear();
  if (closingDay && today.getDate() > closingDay) {
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return { year, month: month + 1 };
}

/**
 * Faturas que o lançamento pode escolher: as do cartão dele. Na visão
 * consolidada (titular + adicionais) a tela tem faturas "somadas", que não
 * existem no banco — o lançamento guarda a fatura real do seu cartão, então
 * nenhuma batia e todos mostravam "Nenhuma fatura". A fatura em que ele já
 * está entra sempre (compras antigas do adicional ficaram na do titular).
 */
export function statementOptionsForTx<T extends StatementLike & { card_id?: string | null }>(
  statements: T[],
  tx: { card_id?: string | null; statement_id?: string | null }
): T[] {
  // Cartões cujas faturas valem para o lançamento: o dele e o dono da fatura em
  // que ele está (compra do adicional que entrou na fatura do titular pode ser
  // movida entre as faturas do titular).
  const holder = statements.find(s => s.id === tx.statement_id)?.card_id;
  return statements.filter(s => !s.card_id || !tx.card_id || s.card_id === tx.card_id || (!!holder && s.card_id === holder));
}
