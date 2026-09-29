import { normalizeStr, findCloseMatch } from './stringUtils';

/**
 * Sugestão de categoria/subcategoria para um estabelecimento lido do cupom
 * ------------------------------------------------------------------------
 * O usuário já classificou compras parecidas antes ("GASFORT F01 GRAMADO" →
 * Veículo / Combustível). A tela do cupom deixava os campos vazios e ele
 * tinha de escolher tudo de novo a cada abastecimento.
 *
 * A comparação não pode ser por igualdade: o mesmo lugar aparece como
 * "POSTO SERVICO DAMO" e "POSTO SERVICO DAMO FOZ DO IGUAC", e o que veio do
 * cupom carrega o prefixo "Labs: ". Por isso cada descrição vira uma lista de
 * palavras relevantes (sem acento, sem prefixo, sem termos genéricos como
 * "posto", "comercio", "ltda") e a nota vai de 3 (mesma descrição) a 1
 * (alguma palavra relevante em comum). Vence a classificação com a melhor
 * nota; empate, a mais usada; depois, a mais recente.
 */

export interface ClassifiedTx {
  description: string;
  category?: string | null;
  subcategory?: string | null;
  date?: string | null;
}

export interface CategorySuggestion {
  category: string;
  subcategory: string;
  /** Descrição do lançamento anterior que originou a sugestão (para mostrar ao usuário). */
  basedOn: string;
  source: 'history' | 'merchant_type';
}

const GENERIC = new Set([
  'labs', 'compra', 'compras', 'pagamento', 'pagto', 'pag', 'cartao', 'credito', 'debito',
  'posto', 'servico', 'servicos', 'comercio', 'industria', 'ltda', 'eireli', 'me', 'sa', 'epp',
  'filial', 'loja', 'lojas', 'de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'com',
  'the', 'via', 'br', 'brasil', 'pix', 'ted', 'doc',
]);

/** Palavras relevantes da descrição, na ordem em que aparecem. */
export const significantTokens = (description: string): string[] =>
  normalizeStr(description)
    .replace(/^labs:\s*/, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !GENERIC.has(t) && !/^\d+$/.test(t));

const scoreMatch = (target: string[], candidate: string[]): number => {
  if (target.length === 0 || candidate.length === 0) return 0;
  if (target.join(' ') === candidate.join(' ')) return 3;
  if (target[0] === candidate[0] && target[0].length >= 4) return 2;
  const set = new Set(candidate.filter(t => t.length >= 4));
  return target.some(t => t.length >= 4 && set.has(t)) ? 1 : 0;
};

/**
 * @param merchant   nome do estabelecimento lido do cupom
 * @param history    lançamentos já classificados do usuário (conta e cartão)
 * @param categories categorias existentes (nomes), para só sugerir o que existe
 * @param subcategories subcategorias existentes com o nome da categoria mãe
 * @param merchantTypeHints tipo do estabelecimento lido pela IA ("Posto", "Mercado"...), usado se não houver histórico
 */
export function suggestCategory(
  merchant: string,
  history: ClassifiedTx[],
  categories: string[],
  subcategories: { name: string; category_name?: string }[],
  merchantTypeHints: string[] = []
): CategorySuggestion | null {
  const target = significantTokens(merchant);

  // Resolve contra o que existe hoje (categoria arquivada/apagada não é sugerida;
  // "Transporte " com espaço vira "Transporte").
  const resolve = (cat?: string | null, sub?: string | null) => {
    const category = cat ? findCloseMatch(cat.trim(), categories) : null;
    if (!category) return null;
    const subNames = subcategories
      .filter(s => normalizeStr(s.category_name || '') === normalizeStr(category))
      .map(s => s.name);
    const subcategory = sub ? findCloseMatch(sub.trim(), subNames) || '' : '';
    return { category, subcategory };
  };

  if (target.length > 0) {
    const votes = new Map<string, { category: string; subcategory: string; score: number; count: number; lastDate: string; basedOn: string }>();
    for (const tx of history) {
      if (!tx.category) continue;
      const score = scoreMatch(target, significantTokens(tx.description || ''));
      if (score === 0) continue;
      const resolved = resolve(tx.category, tx.subcategory);
      if (!resolved) continue;
      const key = `${resolved.category}\u0000${resolved.subcategory}`;
      const date = String(tx.date || '');
      const prev = votes.get(key);
      if (!prev) {
        votes.set(key, { ...resolved, score, count: 1, lastDate: date, basedOn: tx.description });
      } else {
        prev.count++;
        if (score > prev.score || (score === prev.score && date > prev.lastDate)) {
          prev.basedOn = tx.description;
        }
        prev.score = Math.max(prev.score, score);
        if (date > prev.lastDate) prev.lastDate = date;
      }
    }
    const best = [...votes.values()].sort((a, b) =>
      b.score - a.score || b.count - a.count || b.lastDate.localeCompare(a.lastDate)
    )[0];
    if (best) {
      return {
        category: best.category,
        subcategory: best.subcategory,
        basedOn: best.basedOn.replace(/^\s*labs:\s*/i, '').trim(),
        source: 'history',
      };
    }
  }

  // Sem histórico: o tipo de estabelecimento lido pela IA, só se bater com
  // uma subcategoria ou categoria que o usuário já tem.
  const TYPE_SYNONYMS: Record<string, string[]> = {
    posto: ['Combustível'],
    mercado: ['Mercado', 'Supermercado'],
    supermercado: ['Mercado', 'Supermercado'],
    farmacia: ['Farmácia'],
    restaurante: ['Restaurante'],
  };
  // Tipo genérico não diz nada: "Outros" casava com a subcategoria "Outros"
  // de Saúde e a Netflix saía como Saúde / Outros.
  const GENERIC_TYPES = new Set(['outros', 'outro', 'geral', 'diversos', 'loja', 'servicos', 'servico', 'nao identificado']);
  for (const hint of merchantTypeHints.filter(h => h && !GENERIC_TYPES.has(normalizeStr(h)))) {
    const options = [hint, ...(TYPE_SYNONYMS[normalizeStr(hint)] || [])];
    for (const opt of options) {
      const sub = subcategories.find(s => normalizeStr(s.name) === normalizeStr(opt) && s.category_name);
      if (sub) {
        const resolved = resolve(sub.category_name, sub.name);
        if (resolved) return { ...resolved, basedOn: hint, source: 'merchant_type' };
      }
      const cat = categories.find(c => normalizeStr(c) === normalizeStr(opt));
      if (cat) return { category: cat, subcategory: '', basedOn: hint, source: 'merchant_type' };
    }
  }
  return null;
}
