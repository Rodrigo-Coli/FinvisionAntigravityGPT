import { describe, it, expect } from 'vitest';
import { eligibleBidInstallments, planConsortiumBid, BidInstallment } from '../lib/consortiumBid';

/**
 * Lance de consórcio: só parcelas futuras, não pagas e sem pagamento parcial
 * podem ser retiradas (reduz prazo) ou recalculadas (reduz valor).
 */
const months = (n: number, amount = 1000, startMonth = 11): BidInstallment[] =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, startMonth - 1 + i, 10));
    return { id: `p${i + 1}`, date: d.toISOString().slice(0, 10), amount };
  });

describe('parcelas que o lance pode alterar', () => {
  it('ignora paga, com pagamento parcial, vencida até a data do lance e zerada', () => {
    const list: BidInstallment[] = [
      { id: 'vencida', date: '2026-10-10', amount: 1000 },
      { id: 'mesmoDia', date: '2026-10-25', amount: 1000 },
      { id: 'paga', date: '2026-11-10', amount: 1000, isPaid: true },
      { id: 'parcial', date: '2026-12-10', amount: 1000, paidAmount: 300 },
      { id: 'zerada', date: '2027-01-10', amount: 0 },
      { id: 'b', date: '2027-03-10', amount: 1000 },
      { id: 'a', date: '2027-02-10', amount: 1000 }
    ];
    expect(eligibleBidInstallments(list, '2026-10-25').map(t => t.id)).toEqual(['a', 'b']);
  });
});

describe('lance reduzindo o prazo', () => {
  it('retira as últimas parcelas que o lance cobre por inteiro e avisa a sobra', () => {
    const plan = planConsortiumBid({ installments: months(10), bidAmount: 3500, bidDate: '2026-10-25', mode: 'REDUCE_TERM' });
    expect(plan.deleteIds).toEqual(['p8', 'p9', 'p10']);
    expect(plan.updates).toEqual([]);
    expect(plan.remainingCount).toBe(7);
    expect(plan.appliedAmount).toBe(3000);
    expect(plan.newInstallmentAmount).toBe(1000);
    expect(plan.warnings.join(' ')).toMatch(/Sobram/);
  });

  it('usa o número de parcelas restantes informado pela administradora', () => {
    const plan = planConsortiumBid({
      installments: months(10), bidAmount: 3500, bidDate: '2026-10-25', mode: 'REDUCE_TERM', overrideRemainingCount: 6
    });
    expect(plan.deleteIds).toEqual(['p7', 'p8', 'p9', 'p10']);
    expect(plan.remainingCount).toBe(6);
    expect(plan.warnings).toEqual([]);
  });

  it('não retira nada quando o lance não cobre uma parcela', () => {
    const plan = planConsortiumBid({ installments: months(10), bidAmount: 500, bidDate: '2026-10-25', mode: 'REDUCE_TERM' });
    expect(plan.deleteIds).toEqual([]);
    expect(plan.remainingCount).toBe(10);
    expect(plan.warnings.length).toBe(1);
  });

  it('nunca retira parcela paga ou com pagamento parcial', () => {
    const list = months(4);
    list[3] = { ...list[3], isPaid: true };
    list[2] = { ...list[2], paidAmount: 100 };
    const plan = planConsortiumBid({ installments: list, bidAmount: 5000, bidDate: '2026-10-25', mode: 'REDUCE_TERM' });
    expect(plan.deleteIds).toEqual(['p1', 'p2']);
    expect(plan.remainingCount).toBe(0);
  });
});

describe('lance reduzindo o valor da parcela', () => {
  it('divide o que falta igualmente entre as parcelas futuras', () => {
    const plan = planConsortiumBid({ installments: months(10), bidAmount: 2500, bidDate: '2026-10-25', mode: 'REDUCE_INSTALLMENT' });
    expect(plan.deleteIds).toEqual([]);
    expect(plan.updates).toHaveLength(10);
    expect(plan.updates.every(u => u.amount === 750)).toBe(true);
    expect(plan.newInstallmentAmount).toBe(750);
    expect(plan.appliedAmount).toBe(2500);
  });

  it('usa o novo valor informado pela administradora', () => {
    const plan = planConsortiumBid({
      installments: months(10), bidAmount: 2500, bidDate: '2026-10-25', mode: 'REDUCE_INSTALLMENT', overrideInstallmentAmount: 761.37
    });
    expect(plan.updates.every(u => u.amount === 761.37)).toBe(true);
  });

  it('lance que cobre tudo quita as parcelas futuras', () => {
    const plan = planConsortiumBid({ installments: months(3), bidAmount: 5000, bidDate: '2026-10-25', mode: 'REDUCE_INSTALLMENT' });
    expect(plan.deleteIds).toEqual(['p1', 'p2', 'p3']);
    expect(plan.remainingCount).toBe(0);
  });

  it('lance zerado ou sem parcelas futuras não muda nada', () => {
    expect(planConsortiumBid({ installments: months(3), bidAmount: 0, bidDate: '2026-10-25', mode: 'REDUCE_INSTALLMENT' }))
      .toMatchObject({ deleteIds: [], updates: [], remainingCount: 3 });
    const none = planConsortiumBid({ installments: months(3, 1000, 1), bidAmount: 1000, bidDate: '2026-10-25', mode: 'REDUCE_TERM' });
    expect(none).toMatchObject({ deleteIds: [], updates: [], remainingCount: 0 });
    expect(none.warnings.length).toBe(1);
  });
});
