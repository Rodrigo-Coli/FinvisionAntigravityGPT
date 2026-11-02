/**
 * Resumo da tela "Contas e Carteiras": separa as contas em três grupos.
 *
 *  - cash:       corrente, poupança e dinheiro que SOMAM no patrimônio;
 *  - investment: contas de investimento (corretoras, caixinhas) que SOMAM;
 *  - excluded:   contas marcadas para não aparecer no painel ("privadas"):
 *                ficam visíveis aqui, mas NÃO entram no total nem no Início.
 *
 * O total de cima é cash + investment — a mesma regra do Início (Contas +
 * Investimentos), para os dois números baterem.
 */
export type AccountBucket = 'cash' | 'investment' | 'excluded';

export interface SummaryAccount {
  type: string;
  currentBalance: number;
  includeInDashboard: boolean;
}

export interface BucketSummary<T> {
  total: number;
  count: number;
  accounts: T[];
}

export interface AccountsSummary<T> {
  /** O que soma no patrimônio (contas + investimentos). */
  total: number;
  cash: BucketSummary<T>;
  investment: BucketSummary<T>;
  excluded: BucketSummary<T>;
}

const r2 = (v: number) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

export function accountBucket(acc: SummaryAccount): AccountBucket {
  if (!acc.includeInDashboard) return 'excluded';
  return String(acc.type || '').toUpperCase() === 'INVESTMENT' ? 'investment' : 'cash';
}

/** Separa e soma. Dentro de cada grupo, maior saldo primeiro (zeradas no fim). */
export function summarizeAccounts<T extends SummaryAccount>(accounts: T[]): AccountsSummary<T> {
  const empty = (): BucketSummary<T> => ({ total: 0, count: 0, accounts: [] });
  const out = { cash: empty(), investment: empty(), excluded: empty() };
  for (const acc of accounts || []) {
    const b = out[accountBucket(acc)];
    b.accounts.push(acc);
    b.total += Number(acc.currentBalance) || 0;
    b.count += 1;
  }
  for (const b of Object.values(out)) {
    b.total = r2(b.total);
    b.accounts.sort((a, z) => (Number(z.currentBalance) || 0) - (Number(a.currentBalance) || 0));
  }
  return { total: r2(out.cash.total + out.investment.total), ...out };
}

/** Participação (0–100) de um valor no total, para as barras. Negativo/zero → 0. */
export function sharePct(value: number, total: number): number {
  if (!(total > 0) || !(value > 0)) return 0;
  return Math.min(100, (value / total) * 100);
}
