import { describe, it, expect } from 'vitest';
import { brokerOf, withBroker, accountLabel } from '../lib/assetLocation';

describe('onde o investimento está', () => {
  const accounts = [{ id: 'b1', institution: 'BTG Invest' }, { id: 'b2', institution: null, name: 'XP' }];
  it('mostra a corretora pelo cadastro do investimento', () => {
    expect(brokerOf({ brokerAccountId: 'b1' }, accounts)).toBe('BTG Invest');
    expect(brokerOf({ brokerAccountId: 'b2' }, new Map(accounts.map(a => [a.id, a])))).toBe('XP');
    expect(brokerOf({}, accounts)).toBe('');
    expect(brokerOf({ brokerAccountId: 'sumiu' }, accounts)).toBe('');
    expect(accountLabel(null)).toBe('');
  });
  it('junta ao nome só quando existe', () => {
    expect(withBroker('CRA Raízen', 'Safra Investimentos Matteo')).toBe('CRA Raízen (Safra Investimentos Matteo)');
    expect(withBroker('Fundo X', '')).toBe('Fundo X');
  });
});
