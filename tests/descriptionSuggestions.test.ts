import { describe, it, expect } from 'vitest';
import { normalizeStr } from '../lib/stringUtils';

/**
 * Sugestões de descrição no "Novo Lançamento".
 *
 * A tela busca as transações mais recentes para sugerir descrição, categoria,
 * conta e pessoa já usadas antes. Duas coisas impediam isso de funcionar numa
 * carteira real:
 *
 * 1. A consulta pegava as N linhas mais recentes POR DATA, sem recortar o
 *    futuro. Quem tem financiamento ou recorrência tem milhares de parcelas
 *    futuras: as 200 linhas mais recentes eram todas de 2033 a 2040, e uma
 *    despesa corriqueira nunca entrava no conjunto.
 * 2. O filtro do que foi digitado usava toLowerCase, sensível a acento.
 */

/** Mesma seleção que a tela faz na consulta ao banco. */
const selecionarRecentes = (txs: { description: string; date: string }[], hoje: string, limite: number) =>
  txs
    .filter(t => t.date <= hoje)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limite);

/** Mesma regra de filtro e ordenação que a tela aplica no que foi digitado. */
const sugerir = (recentes: { description: string }[], digitado: string) => {
  const query = normalizeStr(digitado);
  if (query.length < 2) return [];
  const comeca: string[] = [];
  const contem: string[] = [];
  for (const tx of recentes) {
    const desc = normalizeStr(tx.description || '');
    if (!desc) continue;
    if (desc.startsWith(query)) comeca.push(tx.description);
    else if (desc.includes(query)) contem.push(tx.description);
  }
  return [...comeca, ...contem].slice(0, 5);
};

const HOJE = '2026-09-08';

// Carteira parecida com a real: parcelas futuras em massa afogando o histórico.
const carteira = [
  ...Array.from({ length: 300 }, (_, i) => ({
    description: `Financiamento parcela ${i + 1}`,
    date: `20${33 + Math.floor(i / 60)}-01-${String((i % 28) + 1).padStart(2, '0')}`,
  })),
  { description: 'Diarista', date: '2026-09-01' },
  { description: 'Diarista', date: '2026-08-25' },
  { description: 'Água e Esgoto', date: '2026-08-20' },
  { description: 'Comida de rua (diet)', date: '2026-08-15' },
];

describe('seleção das transações que alimentam a sugestão', () => {
  it('ignora as parcelas futuras, que antes ocupavam a lista inteira', () => {
    const recentes = selecionarRecentes(carteira, HOJE, 200);
    expect(recentes.every(t => t.date <= HOJE)).toBe(true);
    expect(recentes.some(t => t.description.startsWith('Financiamento'))).toBe(false);
  });

  it('sem o recorte do futuro, nenhuma despesa do dia a dia sobrava', () => {
    // Reproduz o comportamento antigo: ordena por data e corta em 200.
    const antigo = [...carteira].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200);
    expect(sugerir(antigo, 'diarista')).toEqual([]);
  });

  it('com o recorte, a despesa recorrente volta a ser sugerida', () => {
    const recentes = selecionarRecentes(carteira, HOJE, 200);
    expect(sugerir(recentes, 'diarista')).toContain('Diarista');
  });
});

describe('filtro do que foi digitado', () => {
  const recentes = selecionarRecentes(carteira, HOJE, 200);

  it('encontra mesmo digitado sem acento', () => {
    expect(sugerir(recentes, 'agua')).toContain('Água e Esgoto');
  });

  it('quem começa com o termo vem antes de quem só contém', () => {
    // "Diarista" começa com "di"; "Comida de rua (diet)" apenas contém.
    expect(sugerir(recentes, 'di')[0]).toBe('Diarista');
  });

  it('não sugere nada com menos de dois caracteres', () => {
    expect(sugerir(recentes, 'd')).toEqual([]);
  });

  it('devolve no máximo cinco sugestões', () => {
    const muitas = Array.from({ length: 20 }, (_, i) => ({ description: `Diarista ${i}`, date: '2026-09-01' }));
    expect(sugerir(muitas, 'diarista')).toHaveLength(5);
  });
});
