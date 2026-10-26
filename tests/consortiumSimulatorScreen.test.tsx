// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Tela do simulador: só lê do banco (nunca grava) e, escolhendo uma cota
 * minha, parte da situação de hoje — a mesma conta do modal de lance.
 */

const writes: string[] = [];
const tables: Record<string, any[]> = {
  consortiums: [{
    id: 'C1', name: 'Ademicon 570-807', liability_id: 'L1', credit_letter_value: 171789.09, total_months: 137,
    admin_fee_pct: 24, reserve_fund_pct: 0, insurance_monthly_amount: 0, status: 'WAITING', metadata: {}
  }],
  liabilities: [
    { id: 'L1', name: 'Ademicon 570-807', type: 'CONSORTIUM', remaining_balance: 206796.38, installment_amount: 1554.86, installments_remaining: 133, interest_rate: null, metadata: {} },
    { id: 'L2', name: 'Piazza do Bosque', type: 'PERSONAL_LOAN', remaining_balance: 149249.88, installment_amount: 1277.56, installments_remaining: 163, interest_rate: 0.79, metadata: { amortizationType: 'SAC' } }
  ],
  transactions: []
};

class Q {
  constructor(private t: string) {}
  select() { return this; }
  eq() { return this; }
  neq() { return this; }
  order() { return this; }
  insert() { writes.push(`insert ${this.t}`); return this; }
  update() { writes.push(`update ${this.t}`); return this; }
  delete() { writes.push(`delete ${this.t}`); return this; }
  then(resolve: (v: any) => void) { resolve({ data: tables[this.t] || [], error: null }); }
}

vi.mock('../lib/supabase/client', () => ({
  supabase: { from: (t: string) => new Q(t), auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) } }
}));

import ConsortiumSimulator from '../components/planning/ConsortiumSimulator';

let container: HTMLDivElement;
let root: Root;
const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); };
const text = () => container.textContent!.replace(/ /g, ' ');
const button = (t: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === t || b.textContent?.includes(t)) as HTMLButtonElement;
const field = (label: string) => {
  const l = Array.from(container.querySelectorAll('label')).find(x => x.textContent?.trim() === label)!;
  return l.parentElement!.querySelector('input') as HTMLInputElement;
};
const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
};

beforeEach(() => {
  writes.length = 0;
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('tela do simulador de consórcio', () => {
  it('abre em todas as abas sem gravar nada', async () => {
    await act(async () => { root.render(<ConsortiumSimulator />); });
    await flush();
    for (const t of ['Lance', 'Carta contemplada', 'Quitar financiamento', 'Vender cota', 'Plano']) {
      await act(async () => { button(t).click(); });
      await flush();
    }
    expect(text()).toContain('Simulador de Consórcio');
    expect(writes).toEqual([]);
  });

  it('cota minha: parte do saldo de hoje e dá a mesma parcela do modal de lance', async () => {
    await act(async () => { root.render(<ConsortiumSimulator />); });
    await flush();
    await act(async () => { button('Lance').click(); });
    const select = Array.from(container.querySelectorAll('select')).find(s => s.textContent?.includes('Cota nova'))!;
    await act(async () => { setValue(select, 'C1'); });
    await flush();
    expect(field('Saldo devedor hoje').value).toBe('206796,38');
    expect(field('Parcelas restantes').value).toBe('133');
    await act(async () => { setValue(field('Reajuste anual'), '0'); });
    await act(async () => { button('R$').click(); });
    await act(async () => { setValue(field('Lance do bolso (livre)'), '63913,10'); });
    await act(async () => { setValue(field('Lance embutido'), '53254,62'); });
    await act(async () => { setValue(field('Dar o lance daqui a'), '1'); });
    await flush();
    expect(text()).toContain('R$ 118.534,47');      // crédito líquido
    expect(text()).toContain('R$ 667,23');          // parcela depois do lance
    expect(writes).toEqual([]);
  });
  it('várias cotas: uma minha + uma nova, com o total somado e sem gravar nada', async () => {
    await act(async () => { root.render(<ConsortiumSimulator />); });
    await flush();
    await act(async () => { button('Várias cotas').click(); });
    await flush();
    const select = Array.from(container.querySelectorAll('select')).find(s => s.textContent?.includes('Cota nova'))!;
    await act(async () => { setValue(select, 'C1'); });
    await act(async () => { setValue(field('Reajuste anual'), '0'); });
    await act(async () => { button('R$').click(); });
    await act(async () => { setValue(field('Lance do bolso'), '63913,10'); });
    await act(async () => { setValue(field('Lance embutido'), '53254,62'); });
    await act(async () => { setValue(field('Contempla daqui a'), '1'); });
    await flush();
    expect(text()).toContain('R$ 118.534,47');
    expect(text()).toContain('R$ 667,23');

    await act(async () => { button('Adicionar cota').click(); });
    await flush();
    expect(text()).toContain('Total das 2 cotas');
    expect(text()).toContain('R$ 371.789,09'); // 171.789,09 + 200.000
    expect(JSON.parse(localStorage.getItem('finvision_consortium_sim_portfolio')!)).toHaveLength(2);
    expect(writes).toEqual([]);
  });
});
