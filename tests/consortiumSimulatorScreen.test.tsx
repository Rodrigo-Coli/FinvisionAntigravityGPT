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
    id: 'C1', name: 'Ademicon 570-807', group_number: '570', quota_number: '807', liability_id: 'L1', credit_letter_value: 171789.09, total_months: 137,
    admin_fee_pct: 24, reserve_fund_pct: 0, insurance_monthly_amount: 0, status: 'WAITING', metadata: {}
  }],
  liabilities: [
    { id: 'L1', name: 'Ademicon 570-807', type: 'CONSORTIUM', remaining_balance: 206796.38, installment_amount: 1554.86, installments_remaining: 133, interest_rate: null, metadata: {} },
    { id: 'L2', name: 'Piazza do Bosque', type: 'PERSONAL_LOAN', remaining_balance: 149249.88, installment_amount: 1277.56, installments_remaining: 163, interest_rate: 0.79, metadata: { amortizationType: 'SAC' } }
  ],
  transactions: [] as any[]
};

class Q {
  private filters: ((r: any) => boolean)[] = [];
  constructor(private t: string) {}
  select() { return this; }
  eq(col: string, v: any) { this.filters.push(r => !(col in r) || r[col] === v); return this; }
  neq() { return this; }
  is(col: string, v: any) { this.filters.push(r => (r[col] ?? null) === v); return this; }
  ilike(col: string, pattern: string) {
    const needle = pattern.replace(/%/g, '').toLowerCase();
    this.filters.push(r => String(r[col] || '').toLowerCase().includes(needle));
    return this;
  }
  order() { return this; }
  insert() { writes.push(`insert ${this.t}`); return this; }
  update() { writes.push(`update ${this.t}`); return this; }
  delete() { writes.push(`delete ${this.t}`); return this; }
  then(resolve: (v: any) => void) { resolve({ data: (tables[this.t] || []).filter(r => this.filters.every(f => f(r))), error: null }); }
}

vi.mock('../lib/supabase/client', () => ({
  supabase: { from: (t: string) => new Q(t), auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) } }
}));

import ConsortiumSimulator from '../components/planning/ConsortiumSimulator';

let container: HTMLDivElement;
let root: Root;
const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); };
const text = () => container.textContent!.replace(/ /g, ' ');
const button = (t: string) => {
  const all = Array.from(container.querySelectorAll('button'));
  return (all.find(b => b.textContent?.trim() === t) || all.find(b => b.textContent?.includes(t))) as HTMLButtonElement;
};
const field = (label: string) => {
  const l = Array.from(container.querySelectorAll('label')).find(x => x.textContent?.trim() === label)!;
  return (l.closest('[data-field]') || l.parentElement!.parentElement!).querySelector('input') as HTMLInputElement;
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
  it('IA: o pedido monta as cotas (nova + minha), o simulador calcula e nada é gravado', async () => {
    const calls: any[] = [];
    const fetchMock = vi.fn(async (url: string, init: any) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return {
        ok: true,
        json: async () => ({
          reply: 'Montei a 570-807 com seu lance e 1 cota nova da Ademicon de R$ 174.647,06.',
          premises: { indexPct: 0 },
          quotas: [
            { source: 'C1', bidUnit: 'BRL', freeBid: 63913.10, embeddedBid: 53254.62, contemplationInMonths: 1, bidMode: 'REDUCE_INSTALLMENT' },
            { name: 'Ademicon 560', credit: 174647.06, termMonths: 128, adminFeePct: 24, reserveFundPct: 0, bidUnit: 'INST', baseTermMonths: 240, embeddedBid: 60, freeBid: 65, contemplationInMonths: 1 }
          ]
        })
      } as any;
    });
    vi.stubGlobal('fetch', fetchMock);
    await act(async () => { root.render(<ConsortiumSimulator />); });
    await flush();
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, 'Quero simular a minha 570-807 com o lance e uma cota nova da 560');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { (container.querySelector('button[aria-label="Simular"]') as HTMLButtonElement).click(); });
    await flush();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/consortium-sim-ai');
    expect(calls[0].body.known[0]).toMatchObject({ id: 'C1', name: 'Ademicon 570-807', balance: 206796.38, remainingMonths: 133 });
    expect(text()).toContain('Montei a 570-807');
    expect(text()).toContain('Total das 2 cotas');
    expect(text()).toContain('R$ 118.534,47');   // crédito líquido da 570-807
    expect(text()).toContain('R$ 667,23');       // parcela depois do lance
    expect(text()).toContain('R$ 120.506,4');    // crédito líquido da 560 (60 embutidas)
    expect(writes).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('salvar e abrir uma simulação ficam no aparelho', async () => {
    await act(async () => { root.render(<ConsortiumSimulator />); });
    await flush();
    await act(async () => { button('Várias cotas').click(); });
    const nameInput = Array.from(container.querySelectorAll('input')).find(i => i.placeholder === 'Cota 1') as HTMLInputElement;
    await act(async () => { setValue(nameInput, 'Plano Piazza'); });
    await act(async () => { button('Salvar').click(); });
    const saved = JSON.parse(localStorage.getItem('finvision_consortium_sim_saved')!);
    expect(saved[0]).toMatchObject({ name: 'Plano Piazza' });
    expect(text()).toContain('Simulação "Plano Piazza" salva neste aparelho.');
    await act(async () => { button('Abrir').click(); });
    expect(text()).toContain('Simulação "Plano Piazza" aberta.');
    expect(writes).toEqual([]);
  });
  it('vender cota: soma os pagamentos vinculados e os antigos achados pela descrição (pode desmarcar)', async () => {
    tables.transactions = [
      { liability_id: 'L1', user_id: 'u1', date: '2026-07-03', paid_at: null, amount: 1554.86, paid_amount: 1554.86, is_paid: true, type: 'EXPENSE', description: 'Parcela 2/137', metadata: {} },
      { liability_id: null, user_id: 'u1', date: '2024-03-07', paid_at: null, amount: 1000, paid_amount: 1000, is_paid: true, type: 'EXPENSE', description: 'Grupo 570 cota 807', metadata: {} },
      { liability_id: null, user_id: 'u1', date: '2024-04-04', paid_at: null, amount: 1000, paid_amount: 1000, is_paid: true, type: 'EXPENSE', description: 'Grupo 570 cota 8070', metadata: {} },
      { liability_id: null, user_id: 'u1', date: '2024-05-04', paid_at: null, amount: 500, paid_amount: 500, is_paid: true, type: 'EXPENSE', description: 'Consórcio 570-807', metadata: {} }
    ];
    await act(async () => { root.render(<ConsortiumSimulator />); });
    await flush();
    await act(async () => { button('Vender cota').click(); });
    const select = Array.from(container.querySelectorAll('select')).find(s => s.textContent?.includes('pagamentos reais'))!;
    await act(async () => { setValue(select, 'C1'); });
    await flush();
    expect(text()).toContain('1 pagamentos vinculados ao consórcio: R$ 1.554,86');
    expect(text()).toContain('Incluir 2 pagamentos anteriores');
    expect(text()).toContain('R$ 1.500,00 (07/03/2024 a 04/05/2024)');
    expect(text()).toContain('Total considerado: R$ 3.054,86');
    const box = Array.from(container.querySelectorAll('input[type="checkbox"]')).at(-1) as HTMLInputElement;
    await act(async () => { box.click(); });
    expect(text()).toContain('Total considerado: R$ 1.554,86');
    expect(writes).toEqual([]);
    tables.transactions = [];
  });
  it('autoexplicativo: "?" abre a explicação do campo, guia de cada aba e aviso de valor fora do comum', async () => {
    await act(async () => { root.render(<ConsortiumSimulator />); });
    await flush();
    expect(text()).toContain('Para que serve:');
    const help = container.querySelector('button[aria-label="O que é: Taxa de adm. (total)"]') as HTMLButtonElement;
    await act(async () => { help.click(); });
    expect(text()).toContain('Taxa de administração total do plano');
    await act(async () => { setValue(field('Taxa de adm. (total)'), '0,5'); });
    expect(text()).toContain('Muito baixa para o total do plano');
    await act(async () => { setValue(field('Taxa de adm. (total)'), '40'); });
    expect(text()).toContain('Acima do comum (13% a 25%)');
    // Todas as abas têm o guia.
    for (const t of ['Lance', 'Várias cotas', 'Carta contemplada', 'Quitar financiamento', 'Vender cota']) {
      await act(async () => { button(t).click(); });
      expect(text()).toContain('Para que serve:');
    }
    expect(writes).toEqual([]);
  });
});
