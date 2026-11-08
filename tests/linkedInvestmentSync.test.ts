import { describe, it, expect, beforeEach } from 'vitest';
import {
  syncMovementFromTransaction, syncTransactionFromMovement, deleteMovementOfTransaction, deleteTransactionOfMovement,
  linkedMovementIdOf, signedFor
} from '../lib/linkedInvestmentSync';

/**
 * Transações ↔ extrato do investimento, sempre ligados:
 * alterar valor/data num lado altera o outro (e o ajuste da curva e o valor do título);
 * excluir num lado pode excluir o outro.
 */

let db: Record<string, any[]>;
let rpc: string[];
const get = (r: any, c: string) => r[c];
class Q {
  private f: ((r: any) => boolean)[] = [];
  private mode: 'select' | 'update' | 'delete' = 'select';
  private patch: any;
  constructor(private t: string) {}
  select() { return this; }
  eq(c: string, v: any) {
    this.f.push(r => String(get(r, c)) === String(v));
    if (this.mode === 'update') { this.rows().forEach(r => Object.assign(r, this.patch)); return Promise.resolve({ error: null }); }
    if (this.mode === 'delete') { const keep = (db[this.t] || []).filter(r => !this.f.every(fn => fn(r))); db[this.t] = keep; return Promise.resolve({ error: null }); }
    return this;
  }
  update(p: any) { this.mode = 'update'; this.patch = p; return this; }
  delete() { this.mode = 'delete'; return this; }
  private rows() { return (db[this.t] || []).filter(r => this.f.every(fn => fn(r))); }
  maybeSingle() { return Promise.resolve({ data: this.rows()[0] || null, error: null }); }
  then(res: any, rej: any) { return Promise.resolve({ data: this.rows(), error: null }).then(res, rej); }
}
const sb = { from: (t: string) => new Q(t), rpc: async (_n: string, a: any) => { rpc.push(a.p_account_id); return { error: null }; } };

beforeEach(() => {
  rpc = [];
  db = {
    physical_assets: [
      { id: 'euca', estimated_value: 7208.77, metadata: { autoCurve: true, brokerAccountId: 'broker' } },
      { id: 'fundo', estimated_value: 1000, metadata: { brokerAccountId: 'broker' } }
    ],
    investment_movements: [
      { id: 'mj', asset_id: 'euca', movement_type: 'RENDIMENTO_MENSAL', amount: 507.28, movement_date: '2026-07-15', linked_transaction_id: 'tj' },
      { id: 'aj', asset_id: 'euca', movement_type: 'AJUSTE_MANUAL', amount: -507.28, movement_date: '2026-07-15', notes: 'Juros pagos na conta (saem do valor do título)' },
      { id: 'ma', asset_id: 'fundo', movement_type: 'APORTE', amount: 1000, movement_date: '2026-03-01', linked_transaction_id: 'ta' },
      { id: 'mr', asset_id: 'fundo', movement_type: 'RESGATE_PARCIAL', amount: -200, movement_date: '2026-05-01', linked_transaction_id: 'tr' }
    ],
    transactions: [
      { id: 'tj', account_id: 'matteo', amount: 507.28, paid_amount: 507.28, is_paid: true, date: '2026-07-15', metadata: { investment_movement_id: 'mj' } },
      { id: 'ta', account_id: 'xp', amount: 1000, paid_amount: 1000, is_paid: true, date: '2026-03-01', metadata: { investment_movement_id: 'ma' } },
      { id: 'tr', account_id: 'xp', amount: 200, paid_amount: 200, is_paid: true, date: '2026-05-01', metadata: { investment_movement_id: 'mr' } }
    ]
  };
});

const mv = (id: string) => db.investment_movements.find(m => m.id === id);
const tx = (id: string) => db.transactions.find(t => t.id === id);
const asset = (id: string) => db.physical_assets.find(a => a.id === id);

describe('ligação', () => {
  it('reconhece o lançamento ligado e o sinal de cada tipo', () => {
    expect(linkedMovementIdOf(tx('tj'))).toBe('mj');
    expect(linkedMovementIdOf({ metadata: {} })).toBeNull();
    expect(signedFor('RESGATE_PARCIAL', 200)).toBe(-200);
    expect(signedFor('APORTE', -50)).toBe(50);
  });
});

describe('alterou em Transações', () => {
  it('juro com curva automática: muda o juro, o ajuste e o valor do título', async () => {
    expect(await syncMovementFromTransaction(sb, tx('tj'), { amount: 520 })).toBe(true);
    expect(mv('mj').amount).toBe(520);
    expect(mv('aj').amount).toBe(-520);
    // juro sai do título: 12,72 a mais saiu
    expect(asset('euca').estimated_value).toBeCloseTo(7208.77 - 12.72, 2);
    expect(rpc).toContain('broker');
  });

  it('data: move o juro e o ajuste juntos', async () => {
    await syncMovementFromTransaction(sb, tx('tj'), { date: '2026-07-16' });
    expect(mv('mj').movement_date).toBe('2026-07-16');
    expect(mv('aj').movement_date).toBe('2026-07-16');
    expect(asset('euca').estimated_value).toBe(7208.77);
  });

  it('aporte maior aumenta o valor do título; resgate mantém o sinal negativo', async () => {
    await syncMovementFromTransaction(sb, tx('ta'), { amount: 1100 });
    expect(mv('ma').amount).toBe(1100);
    expect(asset('fundo').estimated_value).toBe(1100);
    await syncMovementFromTransaction(sb, tx('tr'), { amount: 250 });
    expect(mv('mr').amount).toBe(-250);
    expect(asset('fundo').estimated_value).toBe(1050);
  });

  it('lançamento sem ligação não mexe em nada', async () => {
    expect(await syncMovementFromTransaction(sb, { metadata: {} }, { amount: 5 })).toBe(false);
    expect(db.investment_movements).toHaveLength(4);
  });
});

describe('alterou no Extrato do investimento', () => {
  it('muda o lançamento da conta (valor, pago e data) e recalcula o saldo', async () => {
    const before = { ...mv('mj') };
    mv('mj').amount = 530; // o Extrato já gravou a movimentação
    expect(await syncTransactionFromMovement(sb, before, { amount: 530, movement_date: '2026-07-15' })).toBe(true);
    expect(tx('tj')).toMatchObject({ amount: 530, paid_amount: 530, date: '2026-07-15' });
    expect(mv('aj').amount).toBe(-530);
    expect(rpc).toContain('matteo');
  });
});

describe('excluiu', () => {
  it('em Transações: tira o juro e o ajuste do extrato, e o título volta ao valor de antes', async () => {
    expect(await deleteMovementOfTransaction(sb, tx('tj'))).toBe(true);
    expect(mv('mj')).toBeUndefined();
    expect(mv('aj')).toBeUndefined();
    expect(asset('euca').estimated_value).toBeCloseTo(7208.77 + 507.28, 2);
  });

  it('no Extrato: manda o lançamento da conta para a lixeira e recalcula o saldo', async () => {
    const m = { ...mv('ma') };
    db.investment_movements = db.investment_movements.filter(x => x.id !== 'ma');
    expect(await deleteTransactionOfMovement(sb, m)).toBe(true);
    expect(tx('ta').is_deleted).toBe(true);
    expect(asset('fundo').estimated_value).toBe(0);
    expect(rpc).toContain('xp');
  });
});
