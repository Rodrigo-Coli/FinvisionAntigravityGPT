import { describe, it, expect } from 'vitest';
import { visibleDeliveryReminders, DELIVERY_REMINDER_LEAD_DAYS } from '../lib/deliveryReminder';

/** Lembrete "Saldo de entrega a definir": só perto da entrega. */
describe('lembrete de saldo de entrega', () => {
  const now = Date.parse('2026-11-11T12:00:00');
  const at = (days: number) => new Date(now + days * 86400000).toISOString().slice(0, 10);

  it('não aparece com anos de antecedência (Solina 2030)', () => {
    expect(visibleDeliveryReminders([{ id: 's', deliveryDate: '2030-06-01' }], now)).toEqual([]);
  });
  it(`aparece a partir de ${DELIVERY_REMINDER_LEAD_DAYS} dias antes e depois da data`, () => {
    const items = [
      { id: 'longe', deliveryDate: at(DELIVERY_REMINDER_LEAD_DAYS + 1) },
      { id: 'perto', deliveryDate: at(DELIVERY_REMINDER_LEAD_DAYS) },
      { id: 'passou', deliveryDate: at(-10) }
    ];
    expect(visibleDeliveryReminders(items, now).map(i => i.id)).toEqual(['perto', 'passou']);
  });
  it('sem data de entrega continua aparecendo (pede a data)', () => {
    expect(visibleDeliveryReminders([{ id: 'x', deliveryDate: null }], now).map(i => i.id)).toEqual(['x']);
    expect(visibleDeliveryReminders(null, now)).toEqual([]);
  });
});
