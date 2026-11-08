// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Telas novas (Radar de Investimentos, faixa urgente da tela inicial e
 * Benefícios e Milhas) e a aba de Contas & Cartões onde elas entram.
 * O que importa aqui é: nada quebra — nem com o banco já atualizado, nem
 * antes da atualização (tabela/coluna nova ainda inexistente) — e as telas
 * que já existiam continuam abrindo como antes.
 */

const state = {
  missing: new Set<string>(),
  writes: [] as string[],
  tables: {} as Record<string, any[]>
};

const today = new Date();
const monthsAgo = (m: number) => { const d = new Date(today); d.setMonth(d.getMonth() - m); return d.toISOString().slice(0, 10); };

const baseTables = () => ({
  physical_assets: [
    { id: 'a1', user_id: 'u1', category: 'INVESTMENT', is_archived: false, name: 'CRA Raízen', estimated_value: 61418.18, metadata: { investmentType: 'CRI_CRA' } },
    { id: 'a2', user_id: 'u1', category: 'INVESTMENT', is_archived: false, name: 'SulAmérica Excellence', estimated_value: 51727.13, metadata: { investmentType: 'FUNDOS' } },
    { id: 'a3', user_id: 'u1', category: 'INVESTMENT', is_archived: false, name: 'Fundo resgatado', estimated_value: 0, metadata: { status: 'RESGATADO' } }
  ],
  investment_radar: [
    { asset_id: 'a1', user_id: 'u1', level: 'URGENTE', score: 20, summary: 'Preço de mercado despencou', signals: [{ key: 'market_gap', severity: 'severe', label: 'Preço de mercado despencou', detail: 'x' }], recommendation: 'Avalie a saída.', exit_math: { holdGross: 61418.18, sellGross: 26133.78, costOfExit: 35284.4, irNote: 'Isento', note: '' }, news: null, sources: [], history: [], checked_at: today.toISOString(), next_check_at: today.toISOString(), dismissed_until: null, physical_assets: { name: 'CRA Raízen' } }
  ],
  investment_proposals: [],
  cards: [
    { id: 'c1', user_id: 'u1', is_archived: false, name: 'XP', brand: 'Visa', last4: '3769', is_additional: false, parent_card_id: null, sums_into_invoice: null, benefits: { type: 'CASHBACK', cashbackPct: 1 } },
    { id: 'c2', user_id: 'u1', is_archived: false, name: 'XP Carol', brand: 'Visa', last4: '7727', is_additional: true, parent_card_id: 'c1', sums_into_invoice: true, benefits: null }
  ],
  card_transactions: Array.from({ length: 12 }).flatMap((_, i) => [
    { user_id: 'u1', card_id: 'c1', amount: 4000, date: monthsAgo(i) },
    { user_id: 'u1', card_id: 'c2', amount: 1000, date: monthsAgo(i) }
  ])
});

class Q {
  private filters: ((r: any) => boolean)[] = [];
  private cols = '';
  constructor(private t: string) {}
  select(cols = '') { this.cols = cols; return this; }
  eq(col: string, v: any) { this.filters.push(r => !(col in r) || r[col] === v); return this; }
  neq() { return this; } gte() { return this; } lte() { return this; } in() { return this; } is() { return this; }
  order() { return this; } limit() { return this; } range() { return this; } or() { return this; } not() { return this; } ilike() { return this; }
  insert() { state.writes.push(`insert ${this.t}`); return this; }
  update() { state.writes.push(`update ${this.t}`); return this; }
  upsert() { state.writes.push(`upsert ${this.t}`); return this; }
  delete() { state.writes.push(`delete ${this.t}`); return this; }
  private result() {
    if (state.missing.has(this.t)) return { data: null, error: { message: `relation "public.${this.t}" does not exist` } };
    if (state.missing.has(`${this.t}.benefits`) && this.cols.includes('benefits')) return { data: null, error: { message: 'column cards.benefits does not exist' } };
    return { data: (state.tables[this.t] || []).filter(r => this.filters.every(f => f(r))), error: null };
  }
  maybeSingle() { const r = this.result(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); }
  single() { return this.maybeSingle(); }
  then(resolve: (v: any) => void, reject?: any) { return Promise.resolve(this.result()).then(resolve, reject); }
}

vi.mock('../lib/supabase/client', () => ({
  supabase: {
    from: (t: string) => new Q(t),
    rpc: async () => ({ data: null, error: null }),
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' }, access_token: 't' } } }) }
  },
  isSupabaseConfigured: () => true
}));

import InvestmentRadarPanel from '../components/assets/InvestmentRadarPanel';
import RadarUrgentBanner from '../components/home/RadarUrgentBanner';
import CardBenefitsSection from '../components/banking/CardBenefitsSection';

let container: HTMLDivElement;
let root: Root;
const errors: any[] = [];
const flush = async () => { for (let i = 0; i < 15; i++) await act(async () => { await Promise.resolve(); }); };
const text = () => (container.textContent || '').replace(/\u00a0/g, ' ');

const mount = async (node: React.ReactNode, path = '/') => {
  await act(async () => { root.render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>); });
  await flush();
};

beforeEach(() => {
  state.missing = new Set();
  state.writes = [];
  state.tables = baseTables();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  errors.length = 0;
  vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a); });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('Radar de Investimentos (tela)', () => {
  it('lista os investimentos ativos com o nível e esconde os resgatados', async () => {
    await mount(<InvestmentRadarPanel />);
    expect(text()).toContain('Radar de Investimentos');
    expect(text()).toContain('CRA Raízen');
    expect(text()).toContain('Urgente');
    expect(text()).toContain('SulAmérica Excellence');
    expect(text()).toContain('Sem análise');
    expect(text()).not.toContain('Fundo resgatado');
    expect(state.writes).toEqual([]); // abrir a tela não grava nada
  });

  it('antes da atualização do banco: avisa e não quebra', async () => {
    state.missing.add('investment_radar');
    state.missing.add('investment_proposals');
    await mount(<InvestmentRadarPanel />);
    expect(text()).toContain('ainda está sendo ativado');
    expect(text()).toContain('CRA Raízen');
  });

  it('sem investimentos não mostra nada', async () => {
    state.tables.physical_assets = [];
    await mount(<InvestmentRadarPanel />);
    expect(text()).toBe('');
  });
});

describe('Faixa urgente da tela inicial', () => {
  it('aparece quando há investimento URGENTE', async () => {
    await mount(<RadarUrgentBanner />);
    expect(text()).toContain('CRA Raízen');
  });
  it('some quando o aviso foi escondido', async () => {
    state.tables.investment_radar[0].dismissed_until = new Date(Date.now() + 86400000).toISOString();
    await mount(<RadarUrgentBanner />);
    expect(text()).toBe('');
  });
  it('some quando não há urgente', async () => {
    state.tables.investment_radar[0].level = 'ATENCAO';
    await mount(<RadarUrgentBanner />);
    expect(text()).toBe('');
  });
  it('antes da atualização do banco: não mostra nada e não quebra', async () => {
    state.missing.add('investment_radar');
    await mount(<RadarUrgentBanner />);
    expect(text()).toBe('');
  });
});

describe('Benefícios e Milhas (tela)', () => {
  it('soma o adicional no titular e calcula o benefício com o gasto real', async () => {
    await mount(<CardBenefitsSection />);
    // XP R$ 4.000 + XP Carol R$ 1.000 por mês = R$ 5.000; 1% = R$ 600 por ano
    expect(text()).toContain('R$ 5.000,00/mês');
    expect(text()).toContain('R$ 600,00');
    expect(text()).not.toContain('XP Carol •7727'); // adicional não aparece como cartão separado
    expect(state.writes).toEqual([]);
  });

  it('antes da atualização do banco: abre os cartões e os simuladores mesmo sem a coluna', async () => {
    state.missing.add('cards.benefits');
    await mount(<CardBenefitsSection />);
    expect(text()).toContain('ainda está sendo ativado');
    expect(text()).toContain('XP •3769');
    expect(text()).toContain('Pontos ou cashback?');
    expect(text()).toContain('Vale fazer este cartão?');
  });
});

describe('Sugestão do banco: conversa com o gerente fica guardada', () => {
  it('mostra a análise, as respostas do gerente e o campo para nova resposta', async () => {
    state.tables.investment_proposals = [{
      id: 'p1', user_id: 'u1', created_at: today.toISOString(), source_name: 'lamina_cdb.pdf', verdict: 'VALE', channel: 'whatsapp',
      analysis: '## Perguntas\n- Qual a taxa?',
      follow_ups: [{ at: today.toISOString(), channel: 'whatsapp', answer: 'é 102% do CDI', verdict: 'VALE', analysis: 'Melhorou.' }]
    }];
    await mount(<InvestmentRadarPanel />);
    const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('lamina_cdb.pdf'))!;
    await act(async () => { btn.click(); });
    await flush();
    expect(text()).toContain('Qual a taxa?');
    expect(text()).toContain('pelo WhatsApp');
    expect(text()).toContain('é 102% do CDI');
    expect(text()).toContain('Reavaliar com a resposta');
    expect(state.writes).toEqual([]);
  });
});

describe('Benefícios: guia de onde ver os pontos', () => {
  it('abre o guia', async () => {
    await mount(<CardBenefitsSection />);
    const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Onde ver seus pontos'))!;
    await act(async () => { btn.click(); });
    expect(text()).toContain('Livelo');
    expect(text()).toContain('Investback');
  });
});

describe('Radar: guia para atualizar todo mês', () => {
  it('abre o passo a passo', async () => {
    await mount(<InvestmentRadarPanel />);
    const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Como atualizar todo mês'))!;
    await act(async () => { btn.click(); });
    expect(text()).toContain('Rendimento acumulado (fica no ativo)');
    expect(text()).toContain('Marcação Curva');
    expect(state.writes).toEqual([]);
  });
});

describe('Radar: atualizar pelo banco', () => {
  const openForm = async () => {
    const row = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('CRA Raízen'))!;
    await act(async () => { row.click(); });
    const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Atualizar pelo banco'))!;
    await act(async () => { btn.click(); });
  };
  it('CRA com taxa mostra a curva automática e o campo do relatório', async () => {
    state.tables.physical_assets[0].metadata = { investmentType: 'CRI_CRA', interestType: 'PRE', yieldRate: '12.29' };
    await mount(<InvestmentRadarPanel />);
    await openForm();
    expect(text()).toContain('Curva automática pela taxa contratada (12,29% a.a. prefixado)');
    expect(text()).toContain('Saldo na tela do app do banco');
    expect(text()).toContain('Valor pela curva no relatório');
    expect(state.writes).toEqual([]); // abrir o formulário não grava nada
  });
  it('fundo não mostra curva nem relatório (só o saldo da tela)', async () => {
    state.tables.physical_assets[0].metadata = { investmentType: 'FUNDOS' };
    await mount(<InvestmentRadarPanel />);
    await openForm();
    expect(text()).toContain('Saldo na tela do app do banco');
    expect(text()).not.toContain('Curva automática');
    expect(text()).not.toContain('Valor pela curva no relatório');
  });
});
