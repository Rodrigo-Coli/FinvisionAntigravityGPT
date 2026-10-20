import { describe, it, expect } from 'vitest';
import { pickCurrentStatement, targetStatementPeriod, statementOptionsForTx } from '../lib/cardStatements';

/**
 * Cartão XP (titular, fecha dia 13): em 20/10 a compra já cai na fatura de
 * 11/2026, que ainda não existe. A regra antiga pegava "a aberta mais antiga" —
 * uma fatura vazia de 07/2020 — e a tela abria em 2020, com 04/2026…10/2026
 * listadas como "Próximas" e a de outubro como "anterior pendente".
 */
const xp = [
  { id: 's2020-07', year: 2020, month: 7, status: 'OPEN' },
  { id: 's2024-06', year: 2024, month: 6, status: 'OPEN' },
  { id: 's2026-04', year: 2026, month: 4, status: 'OPEN' },
  { id: 's2026-05', year: 2026, month: 5, status: 'OPEN' },
  { id: 's2026-06', year: 2026, month: 6, status: 'OPEN' },
  { id: 's2026-07', year: 2026, month: 7, status: 'PAID' },
  { id: 's2026-08', year: 2026, month: 8, status: 'PAID' },
  { id: 's2026-09', year: 2026, month: 9, status: 'OPEN' },
  { id: 's2026-10', year: 2026, month: 10, status: 'OPEN' }
];

describe('pickCurrentStatement', () => {
  it('sem a fatura do período, fica a aberta mais próxima — não a de 2020', () => {
    expect(pickCurrentStatement(xp, 2026, 11)?.id).toBe('s2026-10');
  });

  it('a do período-alvo, quando existe, vence sempre', () => {
    expect(pickCurrentStatement(xp, 2026, 9)?.id).toBe('s2026-09');
    expect(pickCurrentStatement(xp, 2026, 7)?.id).toBe('s2026-07');
  });

  it('empate de distância: a anterior (vence primeiro)', () => {
    const s = [
      { id: 'a', year: 2026, month: 9, status: 'OPEN' },
      { id: 'b', year: 2026, month: 11, status: 'OPEN' }
    ];
    expect(pickCurrentStatement(s, 2026, 10)?.id).toBe('a');
  });

  it('sem nenhuma aberta, a mais próxima de qualquer situação', () => {
    const s = [
      { id: 'old', year: 2025, month: 1, status: 'PAID' },
      { id: 'near', year: 2026, month: 9, status: 'PAID' }
    ];
    expect(pickCurrentStatement(s, 2026, 11)?.id).toBe('near');
  });

  it('cartão sem faturas: nenhuma', () => {
    expect(pickCurrentStatement([], 2026, 11)).toBeUndefined();
  });
});

describe('targetStatementPeriod', () => {
  it('depois do fechamento, é o mês seguinte', () => {
    expect(targetStatementPeriod(new Date(2026, 9, 20), 13)).toEqual({ year: 2026, month: 11 });
  });
  it('até o fechamento, é o próprio mês', () => {
    expect(targetStatementPeriod(new Date(2026, 9, 13), 13)).toEqual({ year: 2026, month: 10 });
  });
  it('dezembro depois do fechamento vira janeiro do ano seguinte', () => {
    expect(targetStatementPeriod(new Date(2026, 11, 20), 13)).toEqual({ year: 2027, month: 1 });
  });
});

describe('statementOptionsForTx (visão consolidada)', () => {
  const family = [
    { id: 'xp-10', card_id: 'xp', year: 2026, month: 10 },
    { id: 'carol-10', card_id: 'carol', year: 2026, month: 10 },
    { id: 'xp-07', card_id: 'xp', year: 2026, month: 7 }
  ];

  it('o lançamento do titular vê as faturas do titular — a dele aparece', () => {
    const opts = statementOptionsForTx(family, { card_id: 'xp', statement_id: 'xp-10' });
    expect(opts.map(s => s.id)).toEqual(['xp-10', 'xp-07']);
  });

  it('o do adicional vê as do adicional e a do titular em que já está', () => {
    const opts = statementOptionsForTx(family, { card_id: 'carol', statement_id: 'xp-07' });
    expect(opts.map(s => s.id)).toEqual(['carol-10', 'xp-07']);
  });

  it('fora da visão consolidada (faturas sem card_id na lista) nada muda', () => {
    const plain = [{ id: 'x', year: 2026, month: 10 }];
    expect(statementOptionsForTx(plain, { card_id: 'xp', statement_id: 'x' })).toHaveLength(1);
  });
});
