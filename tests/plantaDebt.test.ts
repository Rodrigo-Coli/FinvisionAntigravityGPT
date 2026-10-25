import { describe, it, expect } from 'vitest';
import { plantaRemainingDebt } from '../lib/plantaDebt';

/**
 * Imóvel na planta no patrimônio: o que falta pagar é dívida. Antes as
 * parcelas a vencer até a entrega contavam como patrimônio do dono.
 */
const asset = { metadata: { propertyStage: 'PLANTA', deliveryBalance: 300000 } };
const tx = (type: string, amount: number, paid: boolean, extra: any = {}) => ({
  type: 'EXPENSE', amount, isPaid: paid, paidAmount: paid ? amount : 0, metadata: { property_tx_type: type }, ...extra
});

describe('dívida do imóvel na planta', () => {
  it('soma o saldo da entrega e as parcelas ainda não pagas até a entrega', () => {
    const txs = [
      tx('DOWN_PAYMENT', 20000, true),
      tx('CONSTRUCTOR_INSTALLMENT', 2000, true),
      tx('CONSTRUCTOR_INSTALLMENT', 2000, false),
      tx('CONSTRUCTOR_INSTALLMENT', 2000, false),
      tx('BALLOON', 10000, false)
    ];
    expect(plantaRemainingDebt(asset, txs, false)).toEqual({ delivery: 300000, installments: 14000, total: 314000 });
  });

  it('com passivo vinculado, o saldo da entrega já está nele (não conta duas vezes)', () => {
    expect(plantaRemainingDebt(asset, [tx('BALLOON', 10000, false)], true)).toEqual({ delivery: 0, installments: 10000, total: 10000 });
  });

  it('parcela que pertence a um passivo, paga parcialmente ou de outro tipo', () => {
    const txs = [
      tx('CONSTRUCTOR_INSTALLMENT', 2000, false, { liability_id: 'l1' }), // já está no passivo
      { ...tx('CONSTRUCTOR_INSTALLMENT', 2000, false), paidAmount: 500 },  // falta 1.500
      tx('CONDO', 800, false),                                          // condomínio não é dívida do imóvel
      { ...tx('BALLOON', 5000, false), type: 'INCOME' }
    ];
    expect(plantaRemainingDebt({ metadata: {} }, txs, false)).toEqual({ delivery: 0, installments: 1500, total: 1500 });
  });
});
