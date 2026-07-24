import { describe, it, expect } from 'vitest';
import { isCapitalizedMovement, projectChartMetadata } from '../lib/historyUtils';

describe('isCapitalizedMovement', () => {
  it('reconhece recebimento de empréstimo/financiamento', () => {
    expect(isCapitalizedMovement({ metadata: { isCapitalized: true } })).toBe(true);
  });

  it('reconhece aquisição de ativo', () => {
    expect(isCapitalizedMovement({ metadata: { type: 'asset_purchase' } })).toBe(true);
  });

  it('não marca despesa/receita comum', () => {
    expect(isCapitalizedMovement({ metadata: { is_card: true } })).toBe(false);
    expect(isCapitalizedMovement({ metadata: {} })).toBe(false);
    expect(isCapitalizedMovement({})).toBe(false);
    expect(isCapitalizedMovement(null)).toBe(false);
  });
});

describe('projectChartMetadata — o dataset do gráfico de categorias', () => {
  // Regressão: o mapeamento antigo gravava só { is_card }, e por isso o filtro de
  // capitalizados do gráfico de categorias nunca excluía nada.
  it('mantém a marca de capitalizado depois da projeção', () => {
    const raw = { metadata: { isCapitalized: true, liability_id: 'abc', type: 'liability_inflow' } };
    const projetado = { metadata: projectChartMetadata(raw) };
    expect(isCapitalizedMovement(projetado)).toBe(true);
  });

  it('mantém a marca de aquisição de ativo depois da projeção', () => {
    const raw = { metadata: { type: 'asset_purchase' } };
    expect(isCapitalizedMovement({ metadata: projectChartMetadata(raw) })).toBe(true);
  });

  it('não transforma lançamento comum em capitalizado', () => {
    const raw = { metadata: { is_card: true, card_id: 'x' } };
    const projetado = projectChartMetadata(raw);
    expect(projetado.is_card).toBe(true);
    expect(isCapitalizedMovement({ metadata: projetado })).toBe(false);
  });

  it('funciona com lançamento sem metadata nenhum', () => {
    expect(projectChartMetadata({}).is_card).toBe(false);
    expect(isCapitalizedMovement({ metadata: projectChartMetadata({}) })).toBe(false);
  });
});
