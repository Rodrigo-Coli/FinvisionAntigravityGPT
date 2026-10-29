/**
 * Vencimento da parcela N de uma série mensal: mesmo dia da 1ª parcela nos
 * meses seguintes; em mês mais curto, o último dia (31/01 → 28/02 → 31/03).
 * `new Date().setMonth(+1)` pulava de 31/01 para 03/03.
 */
export function monthlyDueDate(firstDue: string, installmentNumber: number): string {
  const [y, m, d] = String(firstDue).split(/[ T]/)[0].split('-').map(Number);
  const offset = Math.max(0, Math.floor(installmentNumber) - 1);
  const total = (m - 1) + offset;
  const year = y + Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(Math.min(d, lastDay))}`;
}
