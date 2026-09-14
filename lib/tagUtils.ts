/**
 * Tags — um único lugar que decide o formato
 * ------------------------------------------
 * `transactions.tags` e `card_transactions.tags` são colunas `text[]`. Cada tela
 * fazia a sua própria conversão de "texto digitado" para array, com regras
 * levemente diferentes — e uma delas mandava a string crua para o banco quando o
 * campo era esvaziado (`if (patch.tags && ...)`: `''` é falso, então a conversão
 * era pulada). O Postgres recusa `''` num `text[]`, o erro era engolido por um
 * `console.error`, e para o usuário a tag simplesmente "não ficava salva".
 *
 * Toda conversão passa a vir daqui.
 */

/**
 * Converte o que veio da tela (texto separado por vírgula, array, nulo) para o
 * formato da coluna. Sempre devolve array — nunca `undefined`, nunca string —
 * então nenhum caminho consegue mandar tipo errado para o banco.
 */
export function parseTags(input: unknown): string[] {
  const raw: string[] = Array.isArray(input)
    ? input.map(v => String(v ?? ''))
    : typeof input === 'string'
      ? input.split(',')
      : [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of raw) {
    const tag = item.trim();
    if (!tag) continue;
    // Duplicata é ruído no filtro: "viagem, viagem" vira uma tag só.
    // A comparação ignora caixa e acento, mas guardamos como o usuário escreveu.
    const key = normalizeTag(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }

  return out;
}

/** Texto para exibir no campo de edição. */
export function formatTags(tags: unknown): string {
  return parseTags(tags).join(', ');
}

/** Chave de comparação: ignora caixa e acento ("Maceió" ≡ "maceio"). */
export function normalizeTag(tag: string): string {
  return String(tag || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Lista de tags já usadas, para sugerir na digitação e alimentar o filtro.
 * Agrupa variações de acento/caixa sob a grafia mais frequente — sem isso,
 * "Maceió.26", "Maceio.26" e "maceió.26" apareceriam como três tags distintas
 * no filtro, que é justamente o que atrapalha a busca.
 */
export function collectTags(...rowGroups: any[][]): string[] {
  const byKey = new Map<string, Map<string, number>>();

  for (const rows of rowGroups) {
    for (const row of rows || []) {
      for (const tag of parseTags(row?.tags)) {
        const key = normalizeTag(tag);
        if (!key) continue;
        const spellings = byKey.get(key) || new Map<string, number>();
        spellings.set(tag, (spellings.get(tag) || 0) + 1);
        byKey.set(key, spellings);
      }
    }
  }

  const winners: string[] = [];
  for (const spellings of byKey.values()) {
    let best = '';
    let bestCount = -1;
    for (const [spelling, count] of spellings) {
      if (count > bestCount) { best = spelling; bestCount = count; }
    }
    winners.push(best);
  }

  return winners.sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** A linha tem alguma das tags selecionadas no filtro? */
export function matchesAnyTag(rowTags: unknown, selected: string[]): boolean {
  if (!selected || selected.length === 0) return true;
  const wanted = new Set(selected.map(normalizeTag));
  return parseTags(rowTags).some(tag => wanted.has(normalizeTag(tag)));
}

/**
 * Catálogo de tags conhecidas — por que precisa existir
 * ----------------------------------------------------
 * As sugestões de tag eram montadas SÓ com o que estava carregado na tela no
 * momento (`collectTags(transactions)`). Isso quebrava em três situações reais:
 *
 *   - na tela de Cartões, `transactions` é só a fatura aberta do cartão
 *     selecionado; tags usadas em lançamentos bancários, em outro cartão ou em
 *     outra fatura simplesmente não existiam ali;
 *   - offline, quando a tela vinha do cache de um recorte curto de período;
 *   - na PRIMEIRA vez que a pessoa usa tags: ela digita "Maceió.26", salva, e a
 *     tag só vira sugestão depois de a linha voltar do banco — o que offline
 *     nunca acontece.
 *
 * O resultado era sempre o mesmo: campo de tags sem nenhuma sugestão. Agora toda
 * tag vista ou digitada é guardada neste catálogo local, que sobrevive a
 * recarregamento e funciona sem internet.
 */
const KNOWN_TAGS_KEY = 'finvision_known_tags';

/** Teto do catálogo: evita crescer sem limite no localStorage. */
const KNOWN_TAGS_LIMIT = 400;

/** Tags já conhecidas neste aparelho, em ordem alfabética. */
export function getKnownTags(): string[] {
  try {
    const raw = localStorage.getItem(KNOWN_TAGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parseTags(Array.isArray(parsed) ? parsed : []);
  } catch {
    return []; // storage indisponível (modo privado, cota): segue sem sugestões
  }
}

/**
 * Acrescenta tags ao catálogo local. Aceita array, texto com vírgulas ou nada —
 * nunca lança, porque isto roda dentro de fluxos de salvamento e não pode
 * derrubar o lançamento do usuário.
 */
export function rememberTags(input: unknown): string[] {
  const incoming = parseTags(input);
  if (incoming.length === 0) return getKnownTags();

  const merged = parseTags([...getKnownTags(), ...incoming])
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .slice(0, KNOWN_TAGS_LIMIT);

  try {
    localStorage.setItem(KNOWN_TAGS_KEY, JSON.stringify(merged));
  } catch {
    /* cota estourada: as sugestões desta sessão continuam valendo em memória */
  }
  return merged;
}

/**
 * Lista para sugerir na digitação: o que está na tela AGORA somado ao catálogo
 * local. De quebra, alimenta o catálogo com o que a tela trouxe — então abrir o
 * Histórico uma vez já deixa as tags disponíveis na tela de Cartões, e vice-versa.
 */
export function suggestTags(...rowGroups: any[][]): string[] {
  const onScreen = collectTags(...rowGroups);
  const known = onScreen.length > 0 ? rememberTags(onScreen) : getKnownTags();
  return parseTags([...onScreen, ...known]).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
