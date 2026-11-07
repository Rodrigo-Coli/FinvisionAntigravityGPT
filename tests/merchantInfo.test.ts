import { describe, it, expect } from 'vitest';
import {
  normalizeMerchantSegment,
  pickMerchantName,
  formatCnpj,
  groupEstablishments,
  sortSegments,
  parseNameDisplay,
} from '../lib/merchantInfo';
import { suggestCategory } from '../lib/categorySuggestion';

describe('normalizeMerchantSegment', () => {
  it('caso do usuário: cupom da Panvel cai em Farmácia', () => {
    expect(normalizeMerchantSegment('Farmácia')).toBe('Farmácia');
    expect(normalizeMerchantSegment('farmacia')).toBe('Farmácia');
    expect(normalizeMerchantSegment('Drogaria')).toBe('Farmácia');
    expect(normalizeMerchantSegment('Farmácia e Drogaria')).toBe('Farmácia');
  });

  it('sinônimos comuns viram o segmento padrão', () => {
    expect(normalizeMerchantSegment('Supermercado')).toBe('Mercado');
    expect(normalizeMerchantSegment('Combustível')).toBe('Posto');
    expect(normalizeMerchantSegment('Lanchonete')).toBe('Restaurante');
    expect(normalizeMerchantSegment('Padaria')).toBe('Padaria');
    expect(normalizeMerchantSegment('Petshop')).toBe('Pet Shop');
  });

  it('vazio ou desconhecido usa o fallback', () => {
    expect(normalizeMerchantSegment('')).toBe('Outros');
    expect(normalizeMerchantSegment(undefined, 'Mercado')).toBe('Mercado');
    expect(normalizeMerchantSegment('xyz qualquer')).toBe('Outros');
  });
});

describe('pickMerchantName', () => {
  const names = { trade: 'Panvel', legal: 'PANVEL FARMACIAS' };
  it('nome fantasia por padrão, razão social quando preferida', () => {
    expect(pickMerchantName(names, 'trade')).toBe('Panvel');
    expect(pickMerchantName(names, 'legal')).toBe('PANVEL FARMACIAS');
  });
  it('sem o nome preferido, usa o outro; sem nenhum, o fallback', () => {
    expect(pickMerchantName({ trade: 'Panvel' }, 'legal')).toBe('Panvel');
    expect(pickMerchantName({ legal: 'X LTDA' }, 'trade')).toBe('X LTDA');
    expect(pickMerchantName({}, 'trade', 'CARREFOUR')).toBe('CARREFOUR');
  });
  it('preferência inválida vale nome fantasia', () => {
    expect(parseNameDisplay(undefined)).toBe('trade');
    expect(parseNameDisplay('legal')).toBe('legal');
  });
});

describe('formatCnpj', () => {
  it('formata 14 dígitos', () => {
    expect(formatCnpj('92665611066860')).toBe('92.665.611/0668-60');
    expect(formatCnpj('92.665.611/0668-60')).toBe('92.665.611/0668-60');
    expect(formatCnpj('')).toBe('');
  });
});

describe('sortSegments', () => {
  it('ordem da lista padrão, sem repetir', () => {
    expect(sortSegments(['Outros', 'Farmácia', 'Mercado', 'Farmácia'])).toEqual(['Mercado', 'Farmácia', 'Outros']);
  });
});

describe('groupEstablishments', () => {
  it('agrupa pelo CNPJ, mostra o nome preferido e mantém cupons antigos', () => {
    const docs = [
      { id: '1', merchant_raw: 'Panvel', document_date: '2026-11-07', ocr_structured: { merchant_trade_name: 'Panvel', merchant_legal_name: 'PANVEL FARMACIAS', merchant_cnpj: '92.665.611/0668-60', merchant_category: 'Farmácia' } },
      { id: '2', merchant_raw: 'PANVEL FILIAL 891', document_date: '2026-10-01', ocr_structured: { merchant_cnpj: '92665611066860', merchant_category: 'Drogaria' } },
      // Cupom antigo: só merchant_raw, sem segmento → Mercado (como antes).
      { id: '3', merchant_raw: 'CARREFOUR', document_date: '2026-09-01', ocr_structured: {} },
      { id: '4', merchant_raw: 'carrefour', document_date: '2026-08-01', ocr_structured: null },
    ];
    const trade = groupEstablishments(docs, 'trade');
    expect(trade).toHaveLength(2);
    expect(trade[0]).toMatchObject({ name: 'Panvel', legalName: 'PANVEL FARMACIAS', segment: 'Farmácia', count: 2, lastActive: '2026-11-07', docIds: ['1', '2'] });
    expect(trade[1]).toMatchObject({ name: 'CARREFOUR', segment: 'Mercado', count: 2 });

    const legal = groupEstablishments(docs, 'legal');
    expect(legal[0].name).toBe('PANVEL FARMACIAS');
    expect(legal[1].name).toBe('CARREFOUR');
  });
});

describe('suggestCategory com tipo Farmácia', () => {
  it('sem histórico, Farmácia acha a subcategoria Farmácia ou a categoria Saúde', () => {
    expect(suggestCategory('Panvel', [], ['Saúde'], [{ name: 'Farmácia', category_name: 'Saúde' }], ['Farmácia']))
      .toMatchObject({ category: 'Saúde', subcategory: 'Farmácia', source: 'merchant_type' });
    expect(suggestCategory('Panvel', [], ['Saúde'], [], ['Farmácia']))
      .toMatchObject({ category: 'Saúde', subcategory: '', source: 'merchant_type' });
  });
});
