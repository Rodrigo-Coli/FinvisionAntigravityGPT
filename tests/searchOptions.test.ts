import { describe, it, expect } from 'vitest';
import { filterOptions } from '../lib/searchOptions';

const many = Array.from({ length: 76 }, (_, i) => `Categoria ${String(i).padStart(2, '0')}`);

describe('filterOptions (lista de categorias)', () => {
  it('sem termo mostra TODAS as opções, em ordem alfabética', () => {
    const out = filterOptions([...many].reverse(), '');
    expect(out).toHaveLength(76);
    expect(out[0]).toBe('Categoria 00');
    expect(out[75]).toBe('Categoria 75');
  });

  it('ignora acento e maiúscula e põe quem começa com o termo primeiro', () => {
    const opts = ['Saúde Alimentar', 'Alimentação', 'Moradia'];
    expect(filterOptions(opts, 'alimentacao')).toEqual(['Alimentação']);
    expect(filterOptions(opts, 'ali')).toEqual(['Alimentação', 'Saúde Alimentar']);
  });

  it('não repete a mesma opção com grafia diferente', () => {
    expect(filterOptions(['Moradia', 'moradia ', 'Lazer', ''], '')).toEqual(['Lazer', 'Moradia']);
  });
});
