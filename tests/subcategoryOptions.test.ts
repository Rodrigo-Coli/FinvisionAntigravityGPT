import { describe, it, expect } from 'vitest';
import { normalizeStr } from '../lib/stringUtils';

/**
 * Subcategoria não listava as opções da categoria escolhida (tela de cartão).
 *
 * Uma subcategoria só entra na lista se souber a QUAL categoria pertence
 * (`category_name`). A tela de cartão guarda o próprio cache já com esse campo,
 * mas cai no cache compartilhado com o Histórico quando o dela não existe — e
 * ali as linhas são cruas do banco (`select('*')`): têm `category_id` e não têm
 * `category_name`. Lido sem traduzir, todo mundo ficava sem dono e a lista da
 * subcategoria vinha vazia, mesmo com a categoria preenchida.
 */

const categoriasCache = [
  { id: 'c1', name: 'Alimentação' },
  { id: 'c2', name: 'Moradia' },
];

/** Linhas cruas, como o Histórico grava no cache compartilhado. */
const cacheCru = [
  { id: 's1', name: 'Restaurante', category_id: 'c1' },
  { id: 's2', name: 'Delivery', category_id: 'c1' },
  { id: 's3', name: 'Serviços/Manutenção ', category_id: 'c2' },
];

/** Mesma normalização que a tela aplica ao ler qualquer cache. */
const normalizeSubcategories = (raw: any[], cats: any[]) => {
  const mapped = raw.map((s: any) => ({
    id: s.id,
    name: s.name,
    category_name: s.category_name || (s.category_id ? cats.find(c => c.id === s.category_id)?.name : undefined),
  }));
  const unique: any[] = [];
  const seen = new Set<string>();
  for (const sub of mapped) {
    if (!sub.name) continue;
    const key = `${normalizeStr(sub.name)}::${normalizeStr(sub.category_name || '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(sub);
  }
  return unique;
};

/** Mesma regra de filtro do campo de subcategoria. */
const opcoes = (subs: any[], categoria: string) =>
  subs
    .filter(s => !categoria || normalizeStr(s.category_name || '') === normalizeStr(categoria))
    .map(s => s.name);

describe('lista de subcategorias da categoria escolhida', () => {
  it('sem traduzir o cache cru, nenhuma opção aparecia', () => {
    // Reproduz o comportamento antigo: JSON.parse direto, sem normalizar.
    expect(opcoes(cacheCru, 'Alimentação')).toEqual([]);
  });

  it('traduzindo category_id em category_name, as opções voltam', () => {
    const subs = normalizeSubcategories(cacheCru, categoriasCache);
    expect(opcoes(subs, 'Alimentação')).toEqual(['Restaurante', 'Delivery']);
  });

  it('mostra apenas as subcategorias da categoria escolhida', () => {
    const subs = normalizeSubcategories(cacheCru, categoriasCache);
    expect(opcoes(subs, 'Moradia')).toEqual(['Serviços/Manutenção ']);
  });

  it('sem categoria escolhida, oferece todas', () => {
    const subs = normalizeSubcategories(cacheCru, categoriasCache);
    expect(opcoes(subs, '')).toHaveLength(3);
  });

  it('categoria com espaço sobrando ainda casa', () => {
    // A base do usuário tem categorias e subcategorias com espaço nas pontas;
    // com `===` cru essas linhas nunca casavam.
    const subs = normalizeSubcategories(cacheCru, categoriasCache);
    expect(opcoes(subs, 'Alimentação ')).toEqual(['Restaurante', 'Delivery']);
    expect(opcoes(subs, 'ALIMENTAÇÃO')).toEqual(['Restaurante', 'Delivery']);
  });

  it('cache já normalizado (o da própria tela) segue funcionando', () => {
    const jaNormalizado = [{ id: 's1', name: 'Restaurante', category_name: 'Alimentação' }];
    const subs = normalizeSubcategories(jaNormalizado, categoriasCache);
    expect(opcoes(subs, 'Alimentação')).toEqual(['Restaurante']);
  });

  it('nao duplica quando o cache traz a mesma subcategoria duas vezes', () => {
    const comDuplicata = [...cacheCru, { id: 's9', name: 'restaurante', category_id: 'c1' }];
    const subs = normalizeSubcategories(comDuplicata, categoriasCache);
    expect(opcoes(subs, 'Alimentação')).toEqual(['Restaurante', 'Delivery']);
  });
});
