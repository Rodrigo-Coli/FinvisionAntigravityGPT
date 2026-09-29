import { describe, it, expect } from 'vitest';
import { ledgerImpliedGross, grossChangeToRecord, netOfTax } from '../lib/investmentLedger';

describe('extrato do investimento fecha com o saldo bruto', () => {
  it('soma aportes, rendimentos acumulados e ajustes', () => {
    expect(ledgerImpliedGross([
      { movement_type: 'APORTE', amount: 2076.53 },
      { movement_type: 'RENDIMENTO_ACUMULADO', amount: 17.44 },
      { movement_type: 'RENDIMENTO_MENSAL', amount: 50 },
      { movement_type: 'AJUSTE_MANUAL', amount: -1 },
    ])).toBe(2092.97);
  });

  it('não concilia com resgate/amortização ou sem aporte', () => {
    expect(ledgerImpliedGross([{ movement_type: 'APORTE', amount: 100 }, { movement_type: 'RESGATE_PARCIAL', amount: 10 }])).toBeNull();
    expect(ledgerImpliedGross([])).toBeNull();
  });

  it('caso real: custo 2.076,53, saldo inicial 2.080,82 editado para 2.098,26', () => {
    const ledger = [{ movement_type: 'APORTE', amount: 2076.53 }];
    // regra antiga lançaria 17,44 (2.098,26 − 2.080,82) e o extrato somaria 2.093,97
    expect(grossChangeToRecord(ledger, 2080.82, 2098.26)).toBe(21.73);
  });

  it('sem extrato conciliável, usa saldo novo − saldo anterior', () => {
    expect(grossChangeToRecord([], 1000, 1010.5)).toBe(10.5);
  });

  it('líquido estimado do rendimento', () => {
    expect(netOfTax(21.73, 0.2)).toBe(17.38);
    expect(netOfTax(21.73, 0)).toBe(21.73);
  });
});
