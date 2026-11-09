import { describe, it, expect } from 'vitest';
import { matchesInvestmentStatus, countByInvestmentStatus, canArchiveInvestment } from '../lib/closedInvestments';

/** Filtro de situação dos investimentos: Ativos · Encerrados · Arquivados. */

const ativo = { id: 'a', name: 'CDB', category: 'INVESTMENT', estimatedValue: 1000, metadata: { status: 'ATIVO' } };
const semStatus = { id: 'b', name: 'Fundo antigo', category: 'INVESTMENT', estimatedValue: 50, metadata: {} };
const encerrado = { id: 'c', name: 'LCA BBM', category: 'INVESTMENT', estimatedValue: 0, metadata: { status: 'RESGATADO' } };
const arquivado = { id: 'd', name: 'CDB velho', category: 'INVESTMENT', estimatedValue: 0, is_archived: true, metadata: { status: 'RESGATADO' } };
const arquivadoAtivo = { id: 'e', name: 'Arquivado antes', category: 'INVESTMENT', estimatedValue: 10, is_archived: true, metadata: { status: 'ATIVO' } };
const casa = { id: 'f', name: 'Casa', category: 'REAL_ESTATE', estimatedValue: 0, is_archived: true, metadata: {} };
const all = [ativo, semStatus, encerrado, arquivado, arquivadoAtivo, casa];

describe('filtro de situação', () => {
  it('Ativos = carteira de sempre (sem encerrados nem arquivados)', () => {
    expect(all.filter(a => matchesInvestmentStatus(a, 'ATIVOS')).map(a => a.id)).toEqual(['a', 'b']);
  });
  it('Encerrados = resgatados/vencidos não arquivados', () => {
    expect(all.filter(a => matchesInvestmentStatus(a, 'ENCERRADOS')).map(a => a.id)).toEqual(['c']);
  });
  it('Arquivados = qualquer investimento arquivado (nunca outros bens)', () => {
    expect(all.filter(a => matchesInvestmentStatus(a, 'ARQUIVADOS')).map(a => a.id)).toEqual(['d', 'e']);
  });
  it('contagem para o rótulo do filtro', () => {
    expect(countByInvestmentStatus(all)).toEqual({ ATIVOS: 2, ENCERRADOS: 1, ARQUIVADOS: 2 });
  });
});

describe('arquivar', () => {
  it('só encerrado sem valor (o saldo da corretora não muda)', () => {
    expect(canArchiveInvestment(encerrado)).toBe(true);
    expect(canArchiveInvestment(ativo)).toBe(false);
    expect(canArchiveInvestment({ ...encerrado, estimatedValue: 50 })).toBe(false);
    expect(canArchiveInvestment(arquivado)).toBe(false);
  });
});
