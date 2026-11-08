// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/** Quadro "Juros previstos" em Patrimônio › Investimentos. */

vi.mock('../lib/supabase/client', () => ({
  supabase: {
    from: () => ({
      select() { return this; }, order() { return Promise.resolve({ data: [{ id: 'acc-matteo', institution: 'Safra Matteo' }, { id: 'acc-2', institution: 'Nubank' }], error: null }); }
    }),
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' }, access_token: 't' } } }) }
  },
  isSupabaseConfigured: () => true
}));

import CouponForecastPanel from '../components/assets/CouponForecastPanel';

let container: HTMLDivElement;
let root: Root;
let calls: any[] = [];
let forecasts: any[] = [];
const flush = async () => { for (let i = 0; i < 15; i++) await act(async () => { await Promise.resolve(); }); };
const text = () => (container.textContent || '').replace(/ /g, ' ');

beforeEach(() => {
  calls = [];
  forecasts = [{ id: 'f1', date: '2027-01-15', amount: 507.28, account_id: 'acc-matteo', account_name: 'Safra Matteo', description: 'Juros previstos - CRA Eucatex CDI 105,15% (estimado)', metadata: {} }];
  (globalThis as any).fetch = vi.fn(async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.action === 'coupon_receive') { forecasts = []; return { ok: true, json: async () => ({ message: 'Juros recebidos.' }) }; }
    return { ok: true, json: async () => ({ created: 0, received: 0, linked: 0, superseded: 0, forecasts }) };
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

describe('Juros previstos (tela)', () => {
  it('mostra o previsto e dá como recebido com o valor exato', async () => {
    const changed = vi.fn();
    await act(async () => { root.render(<CouponForecastPanel onAssetsChanged={changed} />); });
    await flush();
    expect(calls[0]).toEqual({ action: 'coupon_sync' });
    expect(text()).toContain('Juros previstos');
    expect(text()).toContain('CRA Eucatex CDI 105,15%');
    expect(text()).toContain('15/01/2027');
    expect(text()).toContain('cai em Safra Matteo');

    const recebi = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Recebi'))!;
    await act(async () => { recebi.click(); });
    await flush();
    const input = container.querySelector('input[aria-label="Valor que caiu"]') as HTMLInputElement;
    expect(input.value).toBe('507,28');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(input, '521,90'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    const confirm = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Confirmar recebimento'))!;
    await act(async () => { confirm.click(); });
    await flush();
    const receive = calls.find(c => c.action === 'coupon_receive');
    expect(receive).toMatchObject({ transactionId: 'f1', value: 521.9, accountId: 'acc-matteo' });
    expect(changed).toHaveBeenCalled();
    expect(text()).toBe(''); // sem previstos, o quadro some
  });

  it('sem previstos (ou sem servidor) não mostra nada', async () => {
    forecasts = [];
    await act(async () => { root.render(<CouponForecastPanel />); });
    await flush();
    expect(text()).toBe('');
    (globalThis as any).fetch = vi.fn(async () => { throw new Error('offline'); });
    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => { root.render(<CouponForecastPanel />); });
    await flush();
    expect(text()).toBe('');
  });

  it('juro que não caiu aparece em "Juros não recebidos", com Dispensar', async () => {
    forecasts = [
      { id: 'late', date: '2026-04-15', amount: 3307.97, account_id: 'acc-matteo', account_name: 'Safra Matteo', description: 'Juros previstos - CRA Raízen (estimado)', metadata: { expected_coupon_state: 'open', expected_coupon_cycle: '2026-04-15' } },
      { id: 'next', date: '2099-01-15', amount: 507.28, account_id: 'acc-matteo', account_name: 'Safra Matteo', description: 'Juros previstos - CRA Eucatex (estimado)', metadata: { expected_coupon_state: 'open', expected_coupon_cycle: '2099-01-15' } }
    ];
    await act(async () => { root.render(<CouponForecastPanel />); });
    await flush();
    const box = container.querySelector('[data-testid="missed-coupons"]')!;
    expect(box).toBeTruthy();
    expect(box.textContent).toContain('Juros não recebidos');
    expect(box.textContent).toContain('CRA Raízen');
    expect(box.textContent).not.toContain('CRA Eucatex');
    expect(text()).toContain('1 não recebido');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const dispensar = [...box.querySelectorAll('button')].find(b => b.textContent?.includes('Dispensar'))!;
    await act(async () => { dispensar.click(); });
    await flush();
    expect(calls.find(c => c.action === 'coupon_dismiss')).toMatchObject({ transactionId: 'late' });
  });

  it('sem atraso, o quadro de não recebidos não aparece', async () => {
    await act(async () => { root.render(<CouponForecastPanel />); });
    await flush();
    expect(container.querySelector('[data-testid="missed-coupons"]')).toBeNull();
  });
});

