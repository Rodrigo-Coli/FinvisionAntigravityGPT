import { normalizeStr } from './stringUtils';

/**
 * Opções de um campo com sugestões (Categoria, Subcategoria, Pessoa).
 *
 * - Sem termo: TODAS as opções, em ordem alfabética — o campo funciona como
 *   uma lista para olhar e escolher, sem precisar digitar nada.
 * - Com termo: ignora acento e maiúscula; quem começa com o termo vem antes
 *   de quem só o contém.
 * - Repetidas com grafia diferente ("Moradia" e "moradia ") aparecem uma vez.
 */
export function filterOptions(options: string[], term: string): string[] {
    const t = normalizeStr(term || '');
    const seen = new Set<string>();
    const unique = (options || []).filter(opt => {
        const key = opt ? normalizeStr(opt) : '';
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    const cmp = (a: string, b: string) => a.localeCompare(b, 'pt-BR');
    if (!t) return unique.sort(cmp);

    const starts: string[] = [];
    const contains: string[] = [];
    for (const opt of unique) {
        const norm = normalizeStr(opt);
        if (norm.startsWith(t)) starts.push(opt);
        else if (norm.includes(t)) contains.push(opt);
    }
    return [...starts.sort(cmp), ...contains.sort(cmp)];
}
