// Cópia de lib/categoryResolver.ts para as funções da API: o código de api/
// não importa de lib/ (já derrubou as rotas no deploy).
const normalizeStr = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Achar a categoria do usuário pelo NOME, do jeito que a pessoa enxerga.
 *
 * Antes cada tela buscava com `.eq('name', X).maybeSingle()`:
 * - "Transporte " (com espaço), "ativos fisicos" ou "Atívos Fisicos" não eram
 *   achados → a tela criava outra "Ativos Físicos";
 * - quando já existiam duas iguais, o `maybeSingle()` dava erro, voltava vazio
 *   e a tela criava a TERCEIRA.
 * Foi assim que as categorias duplicaram. Aqui o nome é comparado sem acento,
 * maiúscula e espaço nas pontas, e mais de uma igual não é erro.
 *
 * Tipo: categoria sem tipo (`type` nulo) vale para receita E despesa. Quando a
 * categoria já existe só como despesa e passa a ser usada numa receita (ou o
 * contrário), ela vira "das duas" em vez de ganhar uma gêmea do outro tipo.
 */

export type CategoryType = 'INCOME' | 'EXPENSE';

export interface CategoryRow {
  id: string;
  name: string;
  type?: string | null;
  is_archived?: boolean | null;
}

/** A categoria com esse nome (ativa primeiro; do mesmo tipo ou "das duas" antes). */
export function pickCategoryMatch<T extends CategoryRow>(rows: T[], name: string, type?: string | null): T | null {
  const key = normalizeStr(name || '');
  if (!key) return null;
  const same = rows.filter(r => r && r.name && normalizeStr(r.name) === key);
  if (!same.length) return null;
  const active = same.filter(r => r.is_archived !== true);
  const pool = active.length ? active : same;
  return (type && pool.find(r => r.type === type)) || pool.find(r => !r.type) || pool[0];
}

/** A categoria (com esse nome) serve para o tipo pedido? Nulo serve para os dois. */
export const categoryFitsType = (row: Pick<CategoryRow, 'type'>, type?: string | null) =>
  !type || !row.type || row.type === type;

/**
 * Busca pelo nome normalizado. Devolve `{ data }` como a consulta que substitui,
 * para encaixar no `const { data: x } = await ...` que já existia.
 */
export async function findCategoryByName(
  client: any,
  userId: string,
  name: string,
  type?: CategoryType | null
): Promise<{ data: { id: string; name: string; type?: string | null } | null }> {
  if (!client || !userId || !normalizeStr(name || '')) return { data: null };
  const { data: rows, error } = await client
    .from('categories')
    .select('id, name, type, is_archived')
    .eq('user_id', userId);
  if (error) {
    console.warn('[Categorias] Falha ao buscar categoria:', error);
    return { data: null };
  }
  const match = pickCategoryMatch((rows || []) as CategoryRow[], name, type);
  if (!match) return { data: null };

  if (!categoryFitsType(match, type)) {
    // Já existe do outro tipo: passa a valer para os dois (sem gêmea).
    const { error: widenError } = await client.from('categories').update({ type: null }).eq('id', match.id);
    if (!widenError) match.type = null;
  }
  return { data: { id: match.id, name: match.name, type: match.type } };
}
