import { describe, it, expect } from 'vitest';
import {
  statementMonthKey, shiftMonthKey, availableMonthKeys, orderCards, buildCardsMonthSummary
} from '../lib/cardsMonthSummary';

/**
 * Cartões (card Resumo das faturas): uma linha por cartão com a fatura que
 * VENCE no mês escolhido — o mesmo nome do seletor de Período da tela.
 */
const cards = [
  { id: 'XP', name: 'XP', is_additional: false },
  { id: 'BRA', name: 'Bradesco', is_additional: false },
  { id: 'INF', name: 'Bradesco Infinite', is_additional: false },
  { id: 'CAR', name: 'XP Carol', is_additional: true, parent_card_id: 'XP', sums_into_invoice: false }
];
const st = (id: string, card_id: string, year: number, month: number, due: string, total: number, paid = 0, status = 'OPEN') =>
  ({ id, card_id, year, month, due_date: `${due}T00:00:00+00:00`, total_amount: total, paid_amount: paid, status });

const statements = [
  st('b10', 'BRA', 2026, 10, '2026-10-25', 3891.49, 3891.49, 'PAID'),
  st('b11', 'BRA', 2026, 11, '2026-11-25', 522.44),
  // Fatura de outubro do Infinite vence em 10/11: entra em novembro.
  st('i10', 'INF', 2026, 10, '2026-11-10', 61),
  st('i11', 'INF', 2026, 11, '2026-12-10', 61),
  st('c11', 'CAR', 2026, 11, '2026-11-20', 54.54)
];

describe('mês da fatura', () => {
  it('é o mês do vencimento, lido em UTC (não volta um dia)', () => {
    expect(statementMonthKey(st('x', 'A', 2026, 10, '2026-11-01', 0))).toBe('2026-11');
    expect(statementMonthKey({ year: 2026, month: 3, due_date: null })).toBe('2026-03');
  });
  it('troca de mês atravessando o ano', () => {
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthKey('2027-01', -1)).toBe('2026-12');
  });
  it('lista os meses com fatura, mais novo primeiro, sempre com o mês atual', () => {
    expect(availableMonthKeys(statements, '2026-09')).toEqual(['2026-12', '2026-11', '2026-10', '2026-09']);
  });
});

describe('resumo do mês', () => {
  it('adicional aparece logo abaixo do titular', () => {
    expect(orderCards(cards).map(r => `${r.level}:${r.card.id}`)).toEqual(['0:BRA', '0:INF', '0:XP', '1:CAR']);
  });

  it('novembro: soma as faturas que vencem no mês, sem contar nada duas vezes', () => {
    const s = buildCardsMonthSummary(cards, statements, '2026-11');
    const byId = Object.fromEntries(s.rows.map(r => [r.card.id, r]));
    expect(byId.BRA.total).toBe(522.44);
    expect(byId.INF.total).toBe(61);
    expect(byId.CAR.total).toBe(54.54);
    expect(byId.XP.status).toBe('SEM_FATURA');
    expect(s.total).toBe(637.98);
    expect(s.open).toBe(637.98);
    expect(s.paid).toBe(0);
  });

  it('outubro: fatura paga entra no total e no "já pago"', () => {
    const s = buildCardsMonthSummary(cards, statements, '2026-10');
    expect(s.total).toBe(3891.49);
    expect(s.paid).toBe(3891.49);
    expect(s.open).toBe(0);
    expect(s.rows.find(r => r.card.id === 'BRA')!.status).toBe('PAGA');
  });

  it('usa a soma das compras quando disponível (como a tela do cartão)', () => {
    const s = buildCardsMonthSummary(cards, statements, '2026-11', { b11: 600, i10: 61 });
    expect(s.rows.find(r => r.card.id === 'BRA')!.total).toBe(600);
    // Sem soma das compras: usa o total gravado.
    expect(s.rows.find(r => r.card.id === 'CAR')!.total).toBe(54.54);
  });

  it('pagamento parcial: falta o resto', () => {
    const s = buildCardsMonthSummary(cards, [st('b11', 'BRA', 2026, 11, '2026-11-25', 500, 200)], '2026-11');
    const bra = s.rows.find(r => r.card.id === 'BRA')!;
    expect(bra.status).toBe('ABERTA');
    expect(bra.open).toBe(300);
  });

  it('estorno (fatura negativa) abate do total', () => {
    const s = buildCardsMonthSummary(cards, [st('b11', 'BRA', 2026, 11, '2026-11-25', -50)], '2026-11');
    expect(s.total).toBe(-50);
    expect(s.rows.find(r => r.card.id === 'BRA')!.status).toBe('PAGA');
  });
});
