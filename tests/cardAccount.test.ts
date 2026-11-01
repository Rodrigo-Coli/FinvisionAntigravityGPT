import { describe, it, expect } from 'vitest';
import { suggestCardAccountId } from '../lib/cardAccount';

describe('conta que paga a fatura do cartão', () => {
  const accounts = [
    { id: 'brad', institution: 'Bradesco' },
    { id: 'nu', institution: 'Nubank 927.634.561-20' },
    { id: 'xp', institution: 'XP' },
    { id: 'btg', institution: 'BTG Invest' }
  ];
  it('sugere pelo nome do cartão; sem nada parecido, a primeira conta', () => {
    expect(suggestCardAccountId('Bradesco Infinite', accounts)).toBe('brad');
    expect(suggestCardAccountId('XP Carol', accounts)).toBe('xp');
    expect(suggestCardAccountId('Nubank', accounts)).toBe('nu');
    expect(suggestCardAccountId('BTG', accounts)).toBe('btg');
    expect(suggestCardAccountId('Porto seguro', accounts)).toBe('brad');
    expect(suggestCardAccountId('Qualquer', [])).toBe('');
  });
});
