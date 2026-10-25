import { describe, it, expect } from 'vitest';
import { ownerKey, uniqueOwners, matchesOwnerFilter } from '../lib/ownerUtils';

/**
 * Filtro "Pessoa ou empresa" do Histórico: a lista mostrava "pessoal" e
 * "Pessoal" como duas pessoas, e filtrar Pessoal deixava de fora o lançamento
 * sem pessoa (vazio) e as outras grafias — a maior parte sumia.
 */
describe('pessoa ou empresa', () => {
  it('"pessoal", "Pessoal", " PESSOAL " e vazio são a mesma pessoa', () => {
    expect(ownerKey('pessoal')).toBe(ownerKey('Pessoal'));
    expect(ownerKey(' PESSOAL ')).toBe(ownerKey('Pessoal'));
    expect(ownerKey('')).toBe(ownerKey('Pessoal'));
    expect(ownerKey(null)).toBe(ownerKey('Pessoal'));
  });

  it('a lista não repete: fica uma "Pessoal"', () => {
    expect(uniqueOwners(['Pessoal', 'pessoal', 'Mãe', 'mae', 'Rodrigo', '', null])).toEqual(['Mãe', 'Pessoal', 'Rodrigo']);
    expect(uniqueOwners(['matteo', 'Matteo'])).toEqual(['Matteo']);
  });

  it('filtrar Pessoal traz os lançamentos sem pessoa e com qualquer grafia', () => {
    const sel = ['Pessoal'];
    expect(matchesOwnerFilter(null, sel)).toBe(true);
    expect(matchesOwnerFilter('', sel)).toBe(true);
    expect(matchesOwnerFilter('pessoal', sel)).toBe(true);
    expect(matchesOwnerFilter('Pessoal ', sel)).toBe(true);
    expect(matchesOwnerFilter('Matteo', sel)).toBe(false);
  });

  it('sem filtro, passa tudo', () => {
    expect(matchesOwnerFilter('Matteo', [])).toBe(true);
  });
});
