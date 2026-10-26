import { describe, it, expect } from 'vitest';
import { amortizedOf, consortiumAmortized, nextConsortiumBalance, unpaidInstallmentsCount, paidInstallmentsCount } from '../lib/consortiumBalance';

/**
 * Saldo devedor do consórcio: anda pelo que foi pago desde a âncora — nunca
 * pela soma das parcelas futuras (plano com parcela reduzida somaria bem menos).
 */
const inst = (amount: number, paid: boolean, extra: any = {}) => ({ type: 'EXPENSE', amount, is_paid: paid, paid_amount: paid ? amount : 0, ...extra });

describe('amortização do consórcio', () => {
  it('conta só saída paga (parcial também), sem seguro e sem a entrada de crédito', () => {
    expect(amortizedOf(inst(398.36, true))).toBe(398.36);
    expect(amortizedOf(inst(398.36, false))).toBe(0);
    expect(amortizedOf({ type: 'EXPENSE', amount: 600, is_paid: false, paid_amount: 250 })).toBe(250);
    expect(amortizedOf(inst(1000, true, { metadata: { components: { insurance: 30 } } }))).toBe(970);
    expect(amortizedOf({ type: 'INCOME', amount: 116649.17, is_paid: true, paid_amount: 116649.17 })).toBe(0);
    expect(amortizedOf(inst(398.36, true, { is_deleted: true }))).toBe(0);
    expect(amortizedOf({ type: 'EXPENSE', amount: 500, is_paid: true, paid_amount: null })).toBe(500);
  });

  it('conta parcelas pagas e em aberto sem o lance', () => {
    const txs = [inst(10, true), inst(10, false), inst(10, false), inst(5000, true, { metadata: { type: 'consortium_bid' } })];
    expect(unpaidInstallmentsCount(txs)).toBe(2);
    expect(paidInstallmentsCount(txs)).toBe(1);
    expect(consortiumAmortized(txs)).toBe(5010);
  });
});

describe('saldo devedor pela âncora', () => {
  it('sem âncora: o saldo atual vira a referência e não muda', () => {
    const r = nextConsortiumBalance(128739.27, null, 2390.16);
    expect(r).toEqual({ balance: 128739.27, anchor: { raw: 128739.27, amortized: 2390.16 }, anchoredNow: true });
  });

  it('pagar desconta, desfazer devolve, e sincronizar de novo não desconta duas vezes', () => {
    let s = nextConsortiumBalance(128739.27, null, 2390.16);
    s = nextConsortiumBalance(s.balance, s.anchor, 2788.52); // pagou uma parcela de 398,36
    expect(s.balance).toBe(128340.91);
    s = nextConsortiumBalance(s.balance, s.anchor, 2788.52); // mesma situação
    expect(s.balance).toBe(128340.91);
    s = nextConsortiumBalance(s.balance, s.anchor, 2390.16); // desmarcou o pagamento
    expect(s.balance).toBe(128739.27);
  });

  it('saldo editado à mão (extrato) vira a nova referência', () => {
    const s = nextConsortiumBalance(128739.27, null, 0);
    const edited = nextConsortiumBalance(131000, s.anchor, 398.36);
    expect(edited.balance).toBe(131000);
    expect(edited.anchoredNow).toBe(true);
    expect(nextConsortiumBalance(edited.balance, edited.anchor, 796.72).balance).toBe(130601.64);
  });

  it('quitado fica em zero e desfazer o pagamento volta ao valor certo', () => {
    let s = nextConsortiumBalance(1000, null, 0);
    s = nextConsortiumBalance(s.balance, s.anchor, 1500);
    expect(s.balance).toBe(0);
    s = nextConsortiumBalance(s.balance, s.anchor, 0);
    expect(s.balance).toBe(1000);
  });
});
