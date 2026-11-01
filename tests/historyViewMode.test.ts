import { describe, it, expect } from 'vitest';
import { filterRowsByViewMode } from '../lib/historyUtils';

/** "Abertos" filtra antes de paginar: as páginas contam só o que aparece. */
describe('filtro Pagos/Abertos nas linhas do banco', () => {
  const rows = [
    { id: 'pago', amount: 100, is_paid: true, paid_amount: 100 },
    { id: 'importado', amount: 50, is_paid: true, paid_amount: null },
    { id: 'aberto', amount: 80, is_paid: false, paid_amount: 0 },
    { id: 'parcial', amount: 80, is_paid: false, paid_amount: 30 }
  ];
  it('Abertos = pendentes e parciais; Pagos = quitados', () => {
    expect(filterRowsByViewMode(rows, 'PENDING').map(r => r.id)).toEqual(['aberto', 'parcial']);
    expect(filterRowsByViewMode(rows, 'SETTLED').map(r => r.id)).toEqual(['pago', 'importado']);
    expect(filterRowsByViewMode(rows, 'ALL')).toBe(rows);
  });
});
