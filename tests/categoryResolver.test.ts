import { describe, it, expect } from 'vitest';
import { pickCategoryMatch, findCategoryByName, categoryFitsType } from '../lib/categoryResolver';
import * as serverCopy from '../api/_lib/category-resolver';

/**
 * Categorias duplicadas: as telas buscavam pelo nome EXATO com maybeSingle().
 * "Transporte " (com espaço) ou "Ativos Fisicos" não eram achados e, quando já
 * havia duas iguais, o maybeSingle() falhava — e a tela criava mais uma.
 */

const rows = [
  { id: 'a', name: 'Ativos Físicos', type: 'EXPENSE' },
  { id: 'b', name: 'Investimento', type: null },
  { id: 'c', name: 'Moradia', type: 'EXPENSE' },
  { id: 'd', name: 'moradia ', type: 'INCOME' },
  { id: 'e', name: 'Saúde', type: 'EXPENSE', is_archived: true },
  { id: 'f', name: 'Saude', type: 'EXPENSE' }
];

describe('pickCategoryMatch', () => {
  it('acha sem acento, maiúscula ou espaço nas pontas', () => {
    expect(pickCategoryMatch(rows, 'ativos fisicos')?.id).toBe('a');
    expect(pickCategoryMatch(rows, '  ATIVOS FÍSICOS ')?.id).toBe('a');
  });

  it('com mais de uma igual, prefere a do mesmo tipo', () => {
    expect(pickCategoryMatch(rows, 'Moradia', 'INCOME')?.id).toBe('d');
    expect(pickCategoryMatch(rows, 'Moradia', 'EXPENSE')?.id).toBe('c');
  });

  it('a sem tipo serve para receita e despesa', () => {
    expect(pickCategoryMatch(rows, 'investimento', 'INCOME')?.id).toBe('b');
    expect(pickCategoryMatch(rows, 'investimento', 'EXPENSE')?.id).toBe('b');
    expect(categoryFitsType({ type: null }, 'INCOME')).toBe(true);
    expect(categoryFitsType({ type: 'EXPENSE' }, 'INCOME')).toBe(false);
  });

  it('prefere a ativa à arquivada', () => {
    expect(pickCategoryMatch(rows, 'saúde')?.id).toBe('f');
  });

  it('nome vazio ou inexistente não acha nada', () => {
    expect(pickCategoryMatch(rows, '')).toBeNull();
    expect(pickCategoryMatch(rows, 'Lazer')).toBeNull();
  });

  it('a cópia da API segue a mesma regra', () => {
    expect(serverCopy.pickCategoryMatch(rows, 'ativos fisicos')?.id).toBe('a');
    expect(serverCopy.pickCategoryMatch(rows, 'Moradia', 'INCOME')?.id).toBe('d');
  });
});

/** Cliente falso: só o que findCategoryByName usa. */
const fakeClient = (data: any[]) => {
  const updates: any[] = [];
  return {
    updates,
    from: () => ({
      select: () => ({ eq: async () => ({ data, error: null }) }),
      update: (patch: any) => ({
        eq: async (_col: string, id: string) => { updates.push({ id, ...patch }); return { error: null }; }
      })
    })
  };
};

describe('findCategoryByName', () => {
  it('devolve { data } com a categoria achada', async () => {
    const client = fakeClient(rows);
    const { data } = await findCategoryByName(client, 'u1', 'ATIVOS FISICOS', 'EXPENSE');
    expect(data?.id).toBe('a');
    expect(client.updates).toEqual([]);
  });

  it('existente só do outro tipo passa a valer para os dois (sem criar gêmea)', async () => {
    const client = fakeClient([{ id: 'x', name: 'Mensal Carol', type: 'EXPENSE' }]);
    const { data } = await findCategoryByName(client, 'u1', 'mensal carol', 'INCOME');
    expect(data?.id).toBe('x');
    expect(data?.type).toBeNull();
    expect(client.updates).toEqual([{ id: 'x', type: null }]);
  });

  it('não acha → { data: null } (aí a tela cria)', async () => {
    const { data } = await findCategoryByName(fakeClient(rows), 'u1', 'Viagem');
    expect(data).toBeNull();
  });
});
