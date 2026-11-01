import { describe, it, expect } from 'vitest';
import { pickOpenMatch } from '../lib/openMatch';

const rows: any[] = [
  { id: 'a', date: '2026-04-10', amount: 398.36, type: 'EXPENSE', is_paid: false, account_name: 'Botmasters' },
  { id: 'b', date: '2026-04-10', amount: 398.36, type: 'EXPENSE', is_paid: true },
  { id: 'c', date: '2026-04-30', amount: 398.36, type: 'EXPENSE', is_paid: false },
  { id: 'd', date: '2026-04-09', amount: 436.9, type: 'EXPENSE', is_paid: false, metadata: { card_statement_id: 's1' } },
  { id: 'e', date: '2026-04-27', amount: 30227.05, type: 'INCOME', is_paid: false }
];

describe('conciliação: pagamento de lançamento em aberto', () => {
  it('acha a parcela em aberto em outra conta, 2 dias antes do vencimento', () => {
    expect(pickOpenMatch(rows, { date: '2026-04-08', amount: -398.36 })?.id).toBe('a');
  });
  it('ignora pago, fatura de cartão e o que está longe demais', () => {
    expect(pickOpenMatch(rows, { date: '2026-04-09', amount: -436.9 })).toBeNull();
    expect(pickOpenMatch([rows[1], rows[2]], { date: '2026-04-08', amount: -398.36 })).toBeNull();
  });
  it('entrada só casa com receita em aberto', () => {
    expect(pickOpenMatch(rows, { date: '2026-04-28', amount: 30227.05 })?.id).toBe('e');
    expect(pickOpenMatch(rows, { date: '2026-04-28', amount: -30227.05 })).toBeNull();
  });
});
