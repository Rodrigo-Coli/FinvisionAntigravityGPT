import { describe, it, expect } from 'vitest';
import { normalizeStr } from '../lib/stringUtils';

/**
 * Regra de busca por digitação: acento e maiúscula não podem atrapalhar.
 *
 * Os campos de Categoria/Subcategoria/Pessoa usavam `<datalist>` nativo, cujo
 * filtro é do NAVEGADOR e é sensível a acento. Digitando "alimentacao" a opção
 * "Alimentação" não aparecia — e como o campo aceita texto livre (é assim que
 * se cria categoria nova), o usuário acabava criando uma duplicada sem acento.
 * A filtragem agora é nossa, com normalizeStr.
 */

/** Mesma regra que o SearchableInput aplica. */
const matches = (option: string, typed: string) =>
  normalizeStr(option).includes(normalizeStr(typed));

describe('busca por digitação ignora acento e maiúscula', () => {
  const casos: [string, string][] = [
    ['Alimentação', 'alimentacao'],
    ['Alimentação', 'ALIMENTA'],
    ['Alimentação', 'Ç'],
    ['Cartão de Crédito', 'cartao'],
    ['Cartão de Crédito', 'credito'],
    ['Saúde', 'saude'],
    ['Educação', 'educacao'],
    ['Serviços', 'servicos'],
    ['Habitação', 'HABITAcao'],
    ['Férias', 'ferias'],
    ['Água e Esgoto', 'agua'],
    ['Transporte', '  transporte  ']
  ];

  it.each(casos)('"%s" é encontrada digitando "%s"', (opcao, digitado) => {
    expect(matches(opcao, digitado)).toBe(true);
  });

  it('não casa o que realmente é diferente', () => {
    expect(matches('Alimentação', 'moradia')).toBe(false);
    expect(matches('Saúde', 'sande')).toBe(false);
  });

  it('campo vazio não descarta nenhuma opção', () => {
    expect(matches('Qualquer Categoria', '')).toBe(true);
  });
});

describe('normalizeStr', () => {
  it('remove acento, caixa e espaço nas pontas', () => {
    expect(normalizeStr('  Alimentação  ')).toBe('alimentacao');
    expect(normalizeStr('CARTÃO')).toBe('cartao');
    expect(normalizeStr('Maceió.26')).toBe('maceio.26');
  });

  it('preserva o que não é acento', () => {
    expect(normalizeStr('Wave Beach Prime - 106')).toBe('wave beach prime - 106');
  });
});
