// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Registrar/desfazer lance de consórcio contra um banco em memória: confere
 * exatamente o que é gravado (lance, parcelas, passivo, histórico) e que uma
 * falha no meio desfaz o que já tinha sido gravado.
 */

type Row = Record<string, any>;
const db: { transactions: Row[]; liabilities: Row[]; consortiums: Row[]; accounts: Row[]; categories: Row[]; subcategories: Row[] } = {
  transactions: [], liabilities: [], consortiums: [], accounts: [], categories: [], subcategories: []
};
const failOn: { table?: string; op?: string } = {};
const toasts: { msg: string; type?: string }[] = [];

class Query {
  private filters: ((r: Row) => boolean)[] = [];
  private op: 'select' | 'insert' | 'update' = 'select';
  private payload: any;
  private returning = false;
  private one = false;
  constructor(private table: keyof typeof db) {}
  select() { if (this.op !== 'select') this.returning = true; return this; }
  insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
  update(p: any) { this.op = 'update'; this.payload = p; return this; }
  eq(col: string, v: any) { this.filters.push(r => r[col] === v); return this; }
  in(col: string, vs: any[]) { this.filters.push(r => vs.includes(r[col])); return this; }
  or(_expr: string) { this.filters.push(r => r.is_deleted !== true); return this; }
  not() { return this; }
  lte() { return this; }
  limit() { return this; }
  order() { return this; }
  maybeSingle() { this.one = true; return this; }
  single() { this.one = true; return this; }
  then(resolve: (v: any) => void, reject?: (e: any) => void) {
    try { resolve(this.run()); } catch (e) { reject?.(e); }
  }
  private run() {
    if (failOn.table === this.table && failOn.op === this.op) return { data: null, error: { message: 'falha simulada' } };
    const rows = db[this.table];
    if (this.op === 'insert') {
      const row = { id: `new-${rows.length + 1}`, ...this.payload };
      rows.push(row);
      return { data: { id: row.id }, error: null };
    }
    const hit = rows.filter(r => this.filters.every(f => f(r)));
    if (this.op === 'update') {
      hit.forEach(r => Object.assign(r, this.payload));
      return { data: this.returning ? hit.map(r => ({ id: r.id })) : null, error: null };
    }
    return { data: this.one ? (hit[0] ?? null) : hit, error: null };
  }
}

vi.mock('../lib/supabase/client', () => ({
  supabase: {
    from: (t: any) => new Query(t),
    rpc: async () => ({ error: null }),
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) }
  }
}));
vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ toast: (msg: string, type?: string) => toasts.push({ msg, type }) })
}));

import ConsortiumBidModal from '../components/assets/ConsortiumBidModal';

const seed = () => {
  db.transactions = [
    { id: 'old', user_id: 'u1', date: '2020-01-10', amount: 500, is_paid: true, paid_amount: 500, is_deleted: false, liability_id: 'L1', metadata: {} },
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `p${i + 1}`, user_id: 'u1', date: `${2090 + i}-01-10`, amount: 1000, is_paid: false, paid_amount: 0, is_deleted: false, liability_id: 'L1', metadata: {}
    }))
  ];
  db.liabilities = [{ id: 'L1', remaining_balance: 50000, installments_remaining: 6, installment_amount: 1000 }];
  db.consortiums = [{ id: 'C1', name: 'HS Teste', liability_id: 'L1', metadata: { bid_type: 'FREE' } }];
  db.accounts = [{ id: 'A1', user_id: 'u1', institution: 'Banco X', is_archived: false }];
};

let container: HTMLDivElement;
let root: Root;
const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); };

const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
};
const button = (text: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes(text)) as HTMLButtonElement;

const render = async (onSaved = vi.fn()) => {
  const c = db.consortiums[0];
  await act(async () => {
    root.render(<ConsortiumBidModal consortium={{ id: c.id, name: c.name, liability_id: c.liability_id, metadata: { ...c.metadata } }} onClose={() => {}} onSaved={onSaved} />);
  });
  await flush();
  return onSaved;
};

const fillBid = async (amount: string, mode: 'Reduzir prazo' | 'Reduzir parcela', override = '') => {
  const inputs = container.querySelectorAll('input');
  await act(async () => { setValue(inputs[0] as HTMLInputElement, amount); });
  await act(async () => { setValue(container.querySelector('select')!, 'A1'); });
  await act(async () => { button(mode).click(); });
  if (override) {
    const ov = container.querySelector('input[placeholder^="Ex.:"]') as HTMLInputElement;
    await act(async () => { setValue(ov, override); });
  }
};

beforeEach(() => {
  seed();
  toasts.length = 0;
  delete failOn.table; delete failOn.op;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const tx = (id: string) => db.transactions.find(t => t.id === id)!;

describe('modal de lance de consórcio', () => {
  it('reduzir prazo: grava o lance, oculta as últimas parcelas e abate o passivo', async () => {
    const onSaved = await render();
    await fillBid('2500', 'Reduzir prazo');
    expect(container.textContent).toContain('Saem 2 parcela(s) do fim');
    await act(async () => { button('Registrar e recalcular').click(); });
    await flush();

    const bid = db.transactions.find(t => t.metadata?.type === 'consortium_bid')!;
    expect(bid).toMatchObject({ amount: 2500, is_paid: true, paid_amount: 2500, type: 'EXPENSE', account_id: 'A1', account_name: 'Banco X', liability_id: 'L1', consortium_id: 'C1' });
    expect(['p5', 'p6'].map(id => tx(id).is_deleted)).toEqual([true, true]);
    expect(['p1', 'p2', 'p3', 'p4'].every(id => tx(id).is_deleted === false && tx(id).amount === 1000)).toBe(true);
    expect(tx('old')).toMatchObject({ is_deleted: false, amount: 500 });
    // Saldo devedor cai pelo VALOR DO LANCE (não vira a soma das parcelas).
    expect(db.liabilities[0]).toMatchObject({ remaining_balance: 47500, installments_remaining: 4, installment_amount: 1000 });
    const bids = db.consortiums[0].metadata.bids;
    expect(db.consortiums[0].metadata.bid_type).toBe('FREE');
    expect(bids).toHaveLength(1);
    expect(bids[0]).toMatchObject({ transaction_id: bid.id, amount: 2500, mode: 'REDUCE_TERM', removed_ids: ['p5', 'p6'] });
    expect(onSaved).toHaveBeenCalled();
  });

  it('reduzir parcela com o valor da administradora e depois desfazer volta tudo', async () => {
    await render();
    await fillBid('1200', 'Reduzir parcela', '801,50');
    await act(async () => { button('Registrar e recalcular').click(); });
    await flush();
    expect(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map(id => tx(id).amount)).toEqual(Array(6).fill(801.5));
    expect(db.liabilities[0]).toMatchObject({ remaining_balance: 48800, installments_remaining: 6, installment_amount: 801.5 });

    // Uma parcela é paga depois do lance: o desfazer não mexe nela.
    tx('p1').is_paid = true;
    act(() => root.unmount()); root = createRoot(container);
    await render();
    await act(async () => { button('Desfazer último lance').click(); });
    await act(async () => { button('Sim, desfazer').click(); });
    await flush();

    expect(tx('p1').amount).toBe(801.5);
    expect(['p2', 'p3', 'p4', 'p5', 'p6'].map(id => tx(id).amount)).toEqual(Array(5).fill(1000));
    expect(db.transactions.find(t => t.metadata?.type === 'consortium_bid')!.is_deleted).toBe(true);
    expect(db.liabilities[0]).toMatchObject({ remaining_balance: 50000, installment_amount: 1000 });
    expect(db.consortiums[0].metadata.bids).toEqual([]);
  });

  it('falha ao atualizar o passivo desfaz o lance e as parcelas', async () => {
    failOn.table = 'liabilities'; failOn.op = 'update';
    const onSaved = await render();
    await fillBid('2500', 'Reduzir prazo');
    await act(async () => { button('Registrar e recalcular').click(); });
    await flush();

    expect(onSaved).not.toHaveBeenCalled();
    expect(toasts.some(t => t.type === 'error')).toBe(true);
    expect(db.transactions.filter(t => t.id.startsWith('p')).every(t => t.is_deleted === false && t.amount === 1000)).toBe(true);
    expect(db.transactions.find(t => t.metadata?.type === 'consortium_bid')!.is_deleted).toBe(true);
    expect(db.consortiums[0].metadata.bids || []).toEqual([]);
    expect(db.liabilities[0].remaining_balance).toBe(50000);
  });
});
