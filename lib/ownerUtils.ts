import { normalizeStr } from './stringUtils';

/**
 * Pessoa/empresa dos lançamentos — uma regra só de comparação.
 *
 * O filtro "Pessoa ou empresa" comparava o nome EXATO: a lista mostrava
 * "pessoal" e "Pessoal" como duas pessoas, e o lançamento sem pessoa (vazio,
 * que é Pessoal) ou gravado como "Pessoal " ficava de fora quando se filtrava
 * Pessoal — a maior parte dos lançamentos sumia do resultado.
 *
 * Agora: sem acento, maiúscula ou espaço; vazio é Pessoal.
 */

export const DEFAULT_OWNER = 'Pessoal';

export const ownerKey = (name?: string | null): string => normalizeStr(String(name || '')) || normalizeStr(DEFAULT_OWNER);

/** Lista sem repetidos ("pessoal" e "Pessoal" viram um só, com a grafia "Pessoal"). */
export function uniqueOwners(names: Array<string | null | undefined>): string[] {
  const byKey = new Map<string, string>();
  for (const raw of names) {
    const name = String(raw || '').trim();
    if (!name) continue;
    const key = ownerKey(name);
    const current = byKey.get(key);
    if (!current) { byKey.set(key, key === ownerKey(DEFAULT_OWNER) ? DEFAULT_OWNER : name); continue; }
    // Prefere a grafia com inicial maiúscula ("Matteo" a "matteo").
    if (key !== ownerKey(DEFAULT_OWNER) && current[0] === current[0].toLowerCase() && name[0] !== name[0].toLowerCase()) {
      byKey.set(key, name);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** O lançamento é de alguma das pessoas escolhidas? Sem escolha, passa tudo. */
export function matchesOwnerFilter(ownerName: string | null | undefined, selected: string[]): boolean {
  if (!selected || selected.length === 0) return true;
  const key = ownerKey(ownerName);
  return selected.some(s => ownerKey(s) === key);
}
