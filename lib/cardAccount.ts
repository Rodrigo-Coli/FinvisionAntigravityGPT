/**
 * Conta que paga a fatura do cartão. Todo cartão tem uma: a escolhida no
 * cadastro, ou uma sugerida pelo nome (cartão "XP" → conta "XP"; "Bradesco
 * Infinite" → "Bradesco") e, sem nada parecido, a primeira conta.
 */
const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function suggestCardAccountId(cardName: string, accounts: { id: string; institution?: string | null; name?: string | null }[]): string {
  if (!accounts.length) return '';
  const card = norm(cardName);
  const firstWord = card.split(/\s+/)[0] || '';
  const label = (a: any) => norm(a.institution || a.name);
  return (
    accounts.find(a => label(a) === card) ||
    accounts.find(a => firstWord && label(a) === firstWord) ||
    accounts.find(a => firstWord && label(a).split(/\s+/)[0] === firstWord) ||
    accounts[0]
  ).id;
}
