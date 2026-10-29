import { describe, it, expect } from 'vitest';
import { summarizeLoan } from '../lib/loanSummary';

/**
 * Empréstimo "Devolução Sonata Ricardo": R$ 36.000 em 15/08/2023, 1% a.m.
 * simples, 13 pagamentos. A entrada de R$ 7.000 foi no MESMO dia da concessão
 * — o cartão a ignorava e mostrava "Total já recebido" R$ 30.500 e saldo
 * R$ 10.814,36.
 */
const payments = [
  ['2023-08-15', 7000], ['2023-09-11', 3000], ['2023-10-11', 2500], ['2023-11-09', 3000], ['2023-12-11', 3000],
  ['2024-01-11', 3000], ['2024-02-23', 3000], ['2024-03-12', 3000], ['2024-04-26', 3000], ['2024-06-12', 3000],
  ['2024-09-10', 3000], ['2026-06-26', 500], ['2026-08-27', 500]
].map(([date, amount]) => ({ date: `${date}T00:00:00+00:00`, amount }));

describe('resumo do empréstimo concedido (conta corrente)', () => {
  const s = summarizeLoan({ principal: 36000, monthlyRatePct: 1, isCompound: false, concessionDate: '2023-08-15', payments, today: '2026-10-28' });

  it('total recebido é tudo que foi pago, inclusive a entrada no dia da concessão', () => {
    expect(s.totalReceived).toBe(37500);
    expect(s.schedule[0]).toMatchObject({ date: '2023-08-15', days: 0, interest: 0, principalPaid: 7000, balance: 29000 });
  });

  it('recebido = juros pagos + principal devolvido; saldo = principal + juros − recebido', () => {
    expect(s.interestReceived + s.principalReturned).toBeCloseTo(37500, 1);
    expect(s.openBalance).toBeCloseTo(699.47, 2);
    expect(s.totalInterest).toBeCloseTo(2199.47, 2);
    expect(s.openBalance).toBeCloseTo(36000 + s.totalInterest - s.totalReceived, 1);
  });

  it('sem pagamentos: só juros sobre o principal', () => {
    const z = summarizeLoan({ principal: 1000, monthlyRatePct: 1, isCompound: false, concessionDate: '2026-01-01', payments: [], today: '2026-01-31' });
    expect(z.openBalance).toBeCloseTo(1010, 2);
    expect(z.totalReceived).toBe(0);
  });
});

describe('acréscimo à dívida', () => {
  it('soma ao saldo na data e corre juros dali em diante; pagamentos abatem', () => {
    const s = summarizeLoan({
      principal: 1000, monthlyRatePct: 1, isCompound: false, concessionDate: '2026-01-01',
      payments: [{ date: '2026-03-02', amount: 500 }],
      additions: [{ date: '2026-01-31', amount: 600, description: 'acordo' }],
      today: '2026-03-02'
    });
    // 30 dias de juros sobre 1000 = 10 → saldo 1610 em 31/01; 30 dias sobre 1610 = 16,10 → 1626,10 − 500
    expect(s.schedule[0]).toMatchObject({ kind: 'ADDITION', added: 600, interestAccrued: 10, balance: 1610 });
    expect(s.schedule[1]).toMatchObject({ kind: 'PAYMENT', received: 500, interestAccrued: 16.1, balance: 1126.1 });
    expect(s.additionsTotal).toBe(600);
    expect(s.totalLent).toBe(1600);
    expect(s.totalReceived).toBe(500);
    expect(s.openBalance).toBeCloseTo(1126.1, 2);
  });

  it('no mesmo dia, o acréscimo entra antes do pagamento', () => {
    const s = summarizeLoan({ principal: 0, monthlyRatePct: 1, isCompound: false, concessionDate: '2026-01-01',
      payments: [{ date: '2026-02-01', amount: 100 }], additions: [{ date: '2026-02-01', amount: 100 }], today: '2026-02-01' });
    expect(s.schedule.map(r => r.kind)).toEqual(['ADDITION', 'PAYMENT']);
    expect(s.openBalance).toBe(0);
  });
});
