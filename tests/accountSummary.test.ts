import { describe, it, expect } from 'vitest';
import { accountBucket, summarizeAccounts, sharePct } from '../lib/accountSummary';

/**
 * Contas e Carteiras: o total de cima soma contas + investimentos (como o
 * Início); contas fora do painel aparecem num grupo próprio e não somam.
 */
const acc = (type: string, currentBalance: number, includeInDashboard = true) => ({ type, currentBalance, includeInDashboard });

describe('separação das contas', () => {
  it('classifica por tipo e por "soma no painel"', () => {
    expect(accountBucket(acc('CHECKING', 1))).toBe('cash');
    expect(accountBucket(acc('SAVINGS', 1))).toBe('cash');
    expect(accountBucket(acc('CASH', 1))).toBe('cash');
    expect(accountBucket(acc('INVESTMENT', 1))).toBe('investment');
    expect(accountBucket(acc('INVESTMENT', 1, false))).toBe('excluded');
    expect(accountBucket(acc('CHECKING', 1, false))).toBe('excluded');
  });

  it('total = contas + investimentos; as que não somam ficam fora', () => {
    const s = summarizeAccounts([
      acc('CHECKING', 41040.59),
      acc('INVESTMENT', 310400.05),
      acc('CHECKING', 0),
      acc('INVESTMENT', 50.31),
      acc('CHECKING', 512.97, false)
    ]);
    expect(s.cash.total).toBe(41040.59);
    expect(s.investment.total).toBe(310450.36);
    expect(s.excluded.total).toBe(512.97);
    expect(s.total).toBe(351490.95);
    expect(s.cash.count + s.investment.count + s.excluded.count).toBe(5);
  });

  it('maior saldo primeiro, zeradas no fim', () => {
    const s = summarizeAccounts([acc('CHECKING', 0), acc('CHECKING', 900), acc('CHECKING', 4400)]);
    expect(s.cash.accounts.map(a => a.currentBalance)).toEqual([4400, 900, 0]);
  });

  it('saldo negativo (cheque especial) desconta do total', () => {
    const s = summarizeAccounts([acc('CHECKING', -200), acc('CHECKING', 1000)]);
    expect(s.cash.total).toBe(800);
  });

  it('participação para as barras nunca passa de 0–100', () => {
    expect(sharePct(25, 100)).toBe(25);
    expect(sharePct(-10, 100)).toBe(0);
    expect(sharePct(10, 0)).toBe(0);
    expect(sharePct(150, 100)).toBe(100);
  });
});
