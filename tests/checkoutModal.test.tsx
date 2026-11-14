// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/** Tela de pagamento: Pix pede nome + CPF/CNPJ, confere o documento antes de enviar e manda o cupom. */
const sub = { current: { status: 'trialing' } as any };
vi.mock('../lib/supabase/client', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
  isSupabaseConfigured: () => true,
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'cliente@exemplo.com' } }) }));
vi.mock('../contexts/SubscriptionContext', () => ({ useSubscription: () => ({ subscription: sub.current, refreshSubscription: async () => {} }) }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ toast: () => {} }) }));

import AsaasCheckoutModal from '../components/subscription/AsaasCheckoutModal';

let container: HTMLDivElement; let root: Root;
const flush = async () => { for (let i = 0; i < 15; i++) await act(async () => { await Promise.resolve(); }); };
const plan = { id: 'p-pro', name: 'Pro', slug: 'pro', price_cents: 5990, price_cents_annual: 57504, price_cents_semiannual: 32346 };
const text = () => container.textContent || '';
const button = (label: string) => Array.from(container.querySelectorAll('button')).find(b => (b.textContent || '').includes(label)) as HTMLButtonElement;
const input = (placeholder: string) => container.querySelector(`input[placeholder="${placeholder}"]`) as HTMLInputElement;
const type = async (el: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const submit = async () => { await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await flush(); };

beforeEach(() => {
  sub.current = { status: 'trialing' };
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

const mount = async () => { await act(async () => { root.render(<AsaasCheckoutModal plan={plan} period="monthly" onClose={() => {}} />); }); await flush(); };

describe('tela de pagamento', () => {
  it('abre no cartão, com o campo de cupom', async () => {
    await mount();
    expect(text()).toContain('Assinar Pro');
    expect(text()).toContain('Dados do Cartão');
    expect(input('Se tiver um cupom, digite aqui')).toBeTruthy();
  });

  it('Pix pede nome e CPF/CNPJ e não envia documento inválido', async () => {
    const fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;
    await mount();
    await act(async () => { button('Pix Instantâneo').click(); });
    expect(input('Como está no seu documento')).toBeTruthy();
    await type(input('Como está no seu documento'), 'Maria Souza');
    await type(input('000.000.000-00'), '11111111111');
    expect(input('000.000.000-00').value).toBe('111.111.111-11'); // formata enquanto digita
    await submit();
    expect(text()).toContain('CPF ou CNPJ inválido');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Pix válido envia nome, documento e cupom, e mostra o QR Code', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, status: 'past_due', totalPrice: 53.91, nextDueDate: '2026-11-11', pix: { qrCode: 'QR', copiaECola: 'codigo', expirationDate: '2026-11-12' } }) }));
    (globalThis as any).fetch = fetchMock;
    await mount();
    await act(async () => { button('Pix Instantâneo').click(); });
    await type(input('Como está no seu documento'), 'Maria Souza');
    await type(input('000.000.000-00'), '52998224725');
    await type(input('Se tiver um cupom, digite aqui'), 'bemvindo10');
    await submit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url).toBe('/api/asaas-create-subscription');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({
      planSlug: 'pro', period: 'monthly', paymentMethod: 'PIX', couponCode: 'BEMVINDO10',
      customer: { name: 'Maria Souza', cpfCnpj: '52998224725', phone: '' },
    });
    expect(text()).toContain('Pague com Pix');
  });

  it('assinar durante o teste grátis não diz "pagamento confirmado": avisa a data da primeira cobrança', async () => {
    (globalThis as any).fetch = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, status: 'trialing', totalPrice: 59.9, nextDueDate: '2026-11-20', pix: null }) }));
    await mount();
    await act(async () => { button('Pix Instantâneo').click(); });
    await type(input('Como está no seu documento'), 'Maria Souza');
    await type(input('000.000.000-00'), '52998224725');
    await submit();
    expect(text()).toContain('Assinatura agendada!');
    expect(text()).toContain('20/11/2026');
    expect(text()).not.toContain('Pagamento confirmado');
  });

  it('erro do servidor aparece na tela', async () => {
    (globalThis as any).fetch = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Cartão recusado pela operadora.' }) }));
    await mount();
    await act(async () => { button('Pix Instantâneo').click(); });
    await type(input('Como está no seu documento'), 'Maria Souza');
    await type(input('000.000.000-00'), '52998224725');
    await submit();
    expect(text()).toContain('Cartão recusado pela operadora.');
  });
});
