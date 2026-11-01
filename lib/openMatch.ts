/**
 * Conciliação: o lançamento do extrato pode ser o PAGAMENTO de algo que já estava
 * lançado em aberto (parcela, conta a pagar, salário a receber...), em QUALQUER conta.
 *
 * Casa por: mesmo valor (absoluto), mesmo sentido (saída do extrato = despesa,
 * entrada = receita), não pago, até `maxDays` dias de diferença entre a data do
 * extrato e o vencimento. Fica de fora a fatura de cartão em aberto
 * (metadata.card_statement_id): ela é paga pelo fluxo de fatura, não por aqui.
 * Entre vários, vence o de data mais próxima.
 */
export interface OpenCandidate {
  id: string;
  date: string;
  amount: number | string;
  type: string;
  is_paid?: boolean | null;
  is_deleted?: boolean | null;
  description?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  liability_id?: string | null;
  metadata?: Record<string, any> | null;
}

export const OPEN_MATCH_DAYS = 7;

const day = (d: string) => String(d || '').split('T')[0].split(' ')[0];
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(day(a) + 'T12:00:00').getTime() - new Date(day(b) + 'T12:00:00').getTime()) / 86400000);

export function pickOpenMatch(
  rows: OpenCandidate[],
  stmt: { date: string; amount: number },
  maxDays: number = OPEN_MATCH_DAYS
): OpenCandidate | null {
  const target = Math.abs(Number(stmt.amount)).toFixed(2);
  const wantType = Number(stmt.amount) < 0 ? 'EXPENSE' : 'INCOME';
  const hits = (rows || []).filter(r =>
    r && !r.is_paid && !r.is_deleted
    && r.type === wantType
    && !(r.metadata && r.metadata.card_statement_id)
    && Math.abs(Number(r.amount)).toFixed(2) === target
    && Math.abs(daysBetween(r.date, stmt.date)) <= maxDays
  );
  hits.sort((a, b) => Math.abs(daysBetween(a.date, stmt.date)) - Math.abs(daysBetween(b.date, stmt.date)));
  return hits[0] || null;
}
