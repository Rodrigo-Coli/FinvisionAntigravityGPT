// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Telas que JÁ existiam e ganharam pedaços novos (Radar no Patrimônio, faixa
 * na tela inicial, aba Benefícios em Contas & Cartões): continuam abrindo sem
 * erro, com o banco antes ou depois da atualização das tabelas novas.
 * O banco aqui é falso e devolve listas vazias para qualquer consulta.
 */

const missing = new Set<string>();

const makeQuery = (table: string): any => {
  const result = () => (missing.has(table)
    ? { data: null, error: { message: `relation "public.${table}" does not exist` }, count: 0 }
    : { data: [], error: null, count: 0 });
  const handler: ProxyHandler<any> = {
    get(_t, prop) {
      if (prop === 'then') return (res: any, rej: any) => Promise.resolve(result()).then(res, rej);
      if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve({ data: null, error: missing.has(table) ? result().error : null });
      return () => proxy;
    }
  };
  const proxy: any = new Proxy({}, handler);
  return proxy;
};

const channel: any = new Proxy({}, { get: (_t, p) => (p === 'subscribe' ? () => channel : () => channel) });

vi.mock('../lib/supabase/client', () => ({
  supabase: {
    from: (t: string) => makeQuery(t),
    rpc: async () => ({ data: null, error: null }),
    channel: () => channel,
    removeChannel: () => undefined,
    storage: { from: () => ({ upload: async () => ({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'a@b.c' }, access_token: 't' } } }),
      getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.c' } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
    }
  },
  isSupabaseConfigured: () => true
}));

let container: HTMLDivElement;
let root: Root;
let consoleErrors: string[] = [];
const flush = async () => { for (let i = 0; i < 25; i++) await act(async () => { await Promise.resolve(); }); };
const text = () => (container.textContent || '').replace(/ /g, ' ');

const mount = async (node: React.ReactNode, path: string) => {
  await act(async () => { root.render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>); });
  await flush();
};

beforeEach(() => {
  missing.clear();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  consoleErrors = [];
  vi.spyOn(console, 'error').mockImplementation((...a: any[]) => { consoleErrors.push(a.map(String).join(' ')); });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  (globalThis as any).fetch = vi.fn(async () => ({ ok: false, json: async () => ({}), text: async () => '' }));
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  (window as any).scrollTo = () => undefined;
  (Element.prototype as any).scrollIntoView = () => undefined;
  (Element.prototype as any).scrollTo = () => undefined; // o jsdom não tem; navegadores têm
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

// Erros de render do React (não os logs propositais de falha de rede do app).
const renderCrashes = () => consoleErrors.filter(e => /The above error occurred|Uncaught|Cannot read properties|is not a function|Minified React error/i.test(e));

import Banking from '../pages/Banking';

describe('Contas & Cartões continua abrindo nas três abas', () => {
  for (const [tab, expected] of [['accounts', 'Contas e Carteiras'], ['cards', 'Cart'], ['benefits', 'Benefícios e Milhas']] as const) {
    it(`aba ${tab}`, async () => {
      await mount(<Banking />, `/banking?tab=${tab}`);
      expect(renderCrashes()).toEqual([]);
      expect(text()).toContain(expected);
    });
  }

  it('sem ?tab abre em Contas (como antes)', async () => {
    await mount(<Banking />, '/banking');
    expect(renderCrashes()).toEqual([]);
    expect(text()).toContain('Contas e Carteiras');
  });

  it('aba Benefícios abre mesmo antes da atualização do banco', async () => {
    missing.add('investment_radar');
    await mount(<Banking />, '/banking?tab=benefits');
    expect(renderCrashes()).toEqual([]);
    expect(text()).toContain('Pontos ou cashback?');
  });
});

import Assets from '../pages/Assets';
import Home from '../pages/Home';

describe('Patrimônio e tela inicial continuam abrindo', () => {
  it('Patrimônio › Investimentos abre, com o Radar sem quebrar nada', async () => {
    await mount(<Assets />, '/assets?view=investments');
    expect(renderCrashes()).toEqual([]);
    expect(text()).toContain('Sua Carteira de Investimentos Financeiros');
  });

  it('Patrimônio › Investimentos abre antes da atualização do banco', async () => {
    missing.add('investment_radar');
    missing.add('investment_proposals');
    await mount(<Assets />, '/assets?view=investments');
    expect(renderCrashes()).toEqual([]);
    expect(text()).toContain('Sua Carteira de Investimentos Financeiros');
  });

  it('Patrimônio › Visão Geral continua abrindo', async () => {
    await mount(<Assets />, '/assets');
    expect(renderCrashes()).toEqual([]);
  });

  it('tela inicial abre sem a faixa quando não há urgente', async () => {
    await mount(<Home user={{ id: 'u1', name: 'Rodrigo' }} />, '/');
    expect(renderCrashes()).toEqual([]);
    expect(text()).not.toContain('Radar de Investimentos · Urgente');
  });

  it('tela inicial abre antes da atualização do banco', async () => {
    missing.add('investment_radar');
    await mount(<Home user={{ id: 'u1', name: 'Rodrigo' }} />, '/');
    expect(renderCrashes()).toEqual([]);
  });
});
