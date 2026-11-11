// Lembrete "Saldo de entrega a definir" (imóvel na planta) na tela inicial.
// Só aparece perto da entrega, quando é hora de decidir como pagar o saldo
// (financiamento leva meses para aprovar): a partir de 180 dias antes.
// Sem data de entrega, continua aparecendo para pedir a data.
export const DELIVERY_REMINDER_LEAD_DAYS = 180;

export function daysUntil(dateIso: string, now: number = Date.now()): number {
  return Math.round((new Date(dateIso + 'T12:00:00').getTime() - now) / 86400000);
}

export function visibleDeliveryReminders<T extends { deliveryDate: string | null }>(
  items: T[] | null | undefined,
  now: number = Date.now(),
  leadDays: number = DELIVERY_REMINDER_LEAD_DAYS
): T[] {
  return (items || []).filter(i => !i.deliveryDate || daysUntil(i.deliveryDate, now) <= leadDays);
}
