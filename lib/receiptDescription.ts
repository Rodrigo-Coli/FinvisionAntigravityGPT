/**
 * Descrição do lançamento que vem do cupom (Inteligência Labs).
 *
 * Antes ela era montada como `Labs: <estabelecimento> ` — com o prefixo, que
 * só dizia de onde o lançamento veio e poluía a lista de Transações, e com um
 * espaço sobrando no fim quando a moeda era real. Agora é só o nome do
 * estabelecimento (e a moeda entre colchetes, quando não é BRL).
 */

const LABS_PREFIX = /^\s*labs\s*:\s*/i;

export const buildReceiptDescription = (merchant: string | null | undefined, currency?: string | null): string => {
  const name = String(merchant || '').replace(LABS_PREFIX, '').trim() || 'Compra';
  const cur = String(currency || '').trim().toUpperCase();
  return cur && cur !== 'BRL' ? `${name} [${cur}]` : name;
};

/**
 * Tira o "Labs: " de descrições geradas antes da mudança — os itens que já
 * estavam esperando em Conciliar entram em Transações com o nome normal.
 */
export const stripLabsPrefix = (description: string | null | undefined): string => {
  const raw = String(description ?? '');
  if (!LABS_PREFIX.test(raw)) return raw;
  return raw.replace(LABS_PREFIX, '').trim();
};
