import { describe, it, expect, vi } from 'vitest';
import {
  commissionModeOf,
  netOfCommission,
  shouldRecordCommissionExpense,
  saleReceivableOpen,
  saleReceivablesTotal,
  saleAccountFields
} from '../lib/saleAccounting';

describe('comissão de venda', () => {
  it('sem modo gravado = paga à parte (vendas antigas não mudam)', () => {
    expect(commissionModeOf(undefined)).toBe('SEPARATE');
    expect(commissionModeOf('qualquer')).toBe('SEPARATE');
    expect(commissionModeOf('DEDUCTED')).toBe('DEDUCTED');
  });

  it('paga à parte: entra o valor cheio e há despesa de comissão', () => {
    expect(netOfCommission(40000, 2500, 'SEPARATE')).toBe(40000);
    expect(shouldRecordCommissionExpense(2500, 'SEPARATE')).toBe(true);
  });

  it('descontada no repasse: entra o líquido e não há despesa', () => {
    expect(netOfCommission(40000, 2500, 'DEDUCTED')).toBe(37500);
    expect(shouldRecordCommissionExpense(2500, 'DEDUCTED')).toBe(false);
  });

  it('sem comissão não gera despesa nem desconto', () => {
    expect(netOfCommission(1000, 0, 'DEDUCTED')).toBe(1000);
    expect(shouldRecordCommissionExpense(0, 'SEPARATE')).toBe(false);
  });
});

describe('vendas a receber', () => {
  const row = (type: string, amount: number, extra: any = {}) => ({ amount, metadata: { type, linked_asset_id: 'A' }, ...extra });

  it('soma só entrada/parcelas de venda ainda não recebidas', () => {
    const rows = [
      row('vehicle_sale_installment', 1000),
      row('vehicle_sale_installment', 1000, { is_paid: true, paid_amount: 1000 }),
      row('real_estate_sale_down_payment', 5000, { paid_amount: 2000 }),
      row('other_sale_installment', 300, { is_deleted: true }),
      row('vehicle_rental_income', 800),
      row('vehicle_sale_revenue', 9000)
    ];
    expect(saleReceivableOpen(rows[2])).toBe(3000);
    expect(saleReceivablesTotal(rows)).toBe(4000);
  });

  it('nada a receber = 0 (o card some)', () => {
    expect(saleReceivablesTotal([])).toBe(0);
  });
});

describe('conta da venda', () => {
  it('preenche conta e nome; sem conta não preenche nada', () => {
    const accs = [{ id: 'b1', institution: 'Bradesco' }];
    expect(saleAccountFields('b1', accs)).toEqual({ account_id: 'b1', account_name: 'Bradesco' });
    expect(saleAccountFields('', accs)).toEqual({});
  });
});
