// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/** Faixa laranja "Juros não recebidos" e o "Ocultar por X dias". */
const state = { rows: [] as any[], updates: [] as any[] };

class Q {
  private t: string; private isUpdate = false; private payload: any = null;
  constructor(t: string) { this.t = t; }
  select() { return this; }
  eq(col: string, v: any) { if (this.isUpdate && col === 'id') state.updates.push({ table: this.t, id: v, payload: this.payload }); return this; }
  in() { return this; }
  update(p: any) { this.isUpdate = true; this.payload = p; return this; }
  then(resolve: (v: any) => void) {
    const data = this.t === 'transactions' && !this.isUpdate ? state.rows : [];
    return Promise.resolve({ data, error: null }).then(resolve);
  }
}

vi.mock('../lib/supabase/client', () => ({
  supabase: { from: (t: string) => new Q(t), auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' }, access_token: 't' } } }) } },
  isSupabaseConfigured: () => true
}));

import MissedCouponBanner from '../components/home/MissedCouponBanner';

let container: HTMLDivElement; let root: Root;
const flush = async () => { for (let i = 0; i < 15; i++) await act(async () => { await Promise.resolve(); }); };
const late = (id: string, extra: any = {}) => ({ id, date: '2026-04-15', amount: 3307.97, description: 'Juros previstos - CRA Raízen (estimado)', metadata: { expected_coupon_state: 'open', expected_coupon_cycle: '2026-04-15', ...extra } });

beforeEach(() => {
  state.rows = []; state.updates = [];
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const mount = async () => { await act(async () => { root.render(<MemoryRouter><MissedCouponBanner /></MemoryRouter>); }); await flush(); };

describe('Faixa de juros não recebidos', () => {
  it('aparece com os juros em atraso', async () => {
    state.rows = [late('a'), late('b')];
    await mount();
    expect(container.textContent).toContain('2 juros previstos não caíram na conta');
  });

  it('"Ocultar" marca cada juro pelos dias escolhidos e some', async () => {
    state.rows = [late('a', { foo: 1 }), late('b')];
    await mount();
    await act(async () => { (container.querySelector('[data-testid="coupon-snooze"]') as HTMLButtonElement).click(); });
    const opts = container.querySelector('[data-testid="coupon-snooze-options"]')!;
    const input = opts.querySelector('input') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '45');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const ok = opts.querySelector('button[aria-label="Ocultar pelos dias informados"]') as HTMLButtonElement;
    await act(async () => { ok.click(); });
    await flush();
    expect(state.updates.map(u => u.id).sort()).toEqual(['a', 'b']);
    const a = state.updates.find(u => u.id === 'a')!.payload.metadata;
    expect(a.foo).toBe(1); // não perde o que já estava salvo
    const days = (Date.parse(a.missed_snoozed_until) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(44.9); expect(days).toBeLessThan(45.1);
    expect(container.textContent).toBe('');
  });

  it('juros ocultados ainda dentro do prazo não aparecem', async () => {
    state.rows = [late('a', { missed_snoozed_until: new Date(Date.now() + 86400000).toISOString() })];
    await mount();
    expect(container.textContent).toBe('');
  });

  it('passado o prazo, volta a aparecer', async () => {
    state.rows = [late('a', { missed_snoozed_until: new Date(Date.now() - 86400000).toISOString() })];
    await mount();
    expect(container.textContent).toContain('CRA Raízen');
  });
});
