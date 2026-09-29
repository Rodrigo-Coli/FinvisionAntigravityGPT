import { describe, it, expect } from 'vitest';
import { suggestCategory, significantTokens } from '../lib/categorySuggestion';

const categories = ['Veículo', 'Transporte', 'Mercado', 'Alimentação'];
const subcategories = [
  { name: 'Combustível', category_name: 'Veículo' },
  { name: 'Manutenção', category_name: 'Veículo' },
  { name: 'Combustível', category_name: 'Transporte' },
  { name: 'Supermercado', category_name: 'Alimentação' },
];
// Formato real do histórico do usuário (descrições, prefixo "Labs:", espaço no fim).
const history = [
  { description: 'Labs: GASFORT F01 GRAMADO ', category: 'Veículo', subcategory: 'Combustível', date: '2026-09-21' },
  { description: 'POSTO SERVICO DAMO', category: 'Veículo', subcategory: 'Combustível', date: '2026-08-02' },
  { description: 'POSTO SERVICO DAMO FOZ DO IGUAC', category: 'Veículo', subcategory: 'Combustível', date: '2026-07-10' },
  { description: 'Combustível', category: 'Transporte ', subcategory: 'Combustível', date: '2025-01-01' },
  { description: 'CARREFOUR COMERCIO E INDUSTRIA LTDA', category: 'Alimentação', subcategory: 'Supermercado', date: '2026-08-11' },
];

describe('significantTokens', () => {
  it('tira prefixo, acento, termos genéricos e números soltos', () => {
    expect(significantTokens('Labs: GASFORT F01 GRAMADO ')).toEqual(['gasfort', 'f01', 'gramado']);
    expect(significantTokens('POSTO SERVIÇO DAMO')).toEqual(['damo']);
    expect(significantTokens('CARREFOUR COMERCIO E INDUSTRIA LTDA')).toEqual(['carrefour']);
  });
});

describe('suggestCategory', () => {
  it('caso do usuário: GASFORT F01 → Veículo / Combustível', () => {
    expect(suggestCategory('GASFORT F01 GRAMADO', history, categories, subcategories)).toMatchObject({
      category: 'Veículo', subcategory: 'Combustível', source: 'history', basedOn: 'GASFORT F01 GRAMADO',
    });
  });

  it('mesmo lugar com nome diferente (cidade a mais) é reconhecido', () => {
    expect(suggestCategory('POSTO SERVICO DAMO LTDA', history, categories, subcategories)).toMatchObject({
      category: 'Veículo', subcategory: 'Combustível',
    });
    expect(suggestCategory('Carrefour', history, categories, subcategories)).toMatchObject({
      category: 'Alimentação', subcategory: 'Supermercado',
    });
  });

  it('sem histórico parecido usa o tipo do estabelecimento, só se existir', () => {
    expect(suggestCategory('SHELL BR 101', history, categories, subcategories, ['Posto'])).toMatchObject({
      category: 'Veículo', subcategory: 'Combustível', source: 'merchant_type',
    });
    expect(suggestCategory('LOJA X', history, categories, subcategories, ['Eletrônicos'])).toBeNull();
  });

  it('tipo genérico ("Outros", "Geral") não gera sugestão (caso real: Netflix virava Saúde / Outros)', () => {
    const subs = [...subcategories, { name: 'Outros', category_name: 'Alimentação' }];
    expect(suggestCategory('NETFLIX.COM', history, categories, subs, ['Outros'])).toBeNull();
    expect(suggestCategory('NETFLIX.COM', history, categories, subs, ['Geral'])).toBeNull();
  });

  it('não sugere categoria que não existe mais', () => {
    const h = [{ description: 'GASFORT', category: 'Carro (antiga)', subcategory: 'Combustível', date: '2026-01-01' }];
    expect(suggestCategory('GASFORT F01', h, categories, subcategories)).toBeNull();
  });

  it('palavra genérica sozinha não gera sugestão', () => {
    expect(suggestCategory('POSTO', history, categories, subcategories)).toBeNull();
    expect(suggestCategory('', history, categories, subcategories)).toBeNull();
  });
});
