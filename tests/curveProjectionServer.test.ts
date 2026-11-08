import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Curva automática no servidor:
 * - "saldo na tela do banco": fundo/CDB vira valor atual + rendimento no extrato;
 *   CRA/CRI/debênture vira valor de mercado (patrimônio continua pela curva);
 * - "valor pela curva do relatório": lança só o acerto da diferença;
 * - rotina diária: fecha os meses e mantém uma linha do mês, sem duplicar.
 */

const db = { tables: {} as Record<string, any[]>, inserts: [] as any[], updates: [] as { t: string; row: any; id?: any }[] };
class Q {
  private filters: ((r: any) => boolean)[] = [];
  private pendingUpdate: any = null;
  constructor(private t: string) {}
  select() { return this; }
  eq(c: string, v: any) {
    if (this.pendingUpdate) { db.updates.push({ t: this.t, row: this.pendingUpdate, id: v }); this.pendingUpdate = null; return Promise.resolve({ error: null }) as any; }
    if (c.startsWith('metadata->>')) { const k = c.slice(11); this.filters.push(r => String(r.metadata?.[k]) === String(v)); }
    else this.filters.push(r => !(c in r) || r[c] === v);
    return this;
  }
  order() { return this; } limit() { return this; } gte() { return this; } in() { return this; }
  insert(rows: any) { (Array.isArray(rows) ? rows : [rows]).forEach(r => { db.inserts.push({ t: this.t, ...r }); (db.tables[this.t] ||= []).push(r); }); return Promise.resolve({ error: null }) as any; }
  update(row: any) { this.pendingUpdate = row; return this; }
  private rows() { return (db.tables[this.t] || []).filter(r => this.filters.every(f => f(r))); }
  maybeSingle() { return Promise.resolve({ data: this.rows()[0] || null, error: null }); }
  then(res: any, rej: any) { return Promise.resolve({ data: this.rows(), error: null }).then(res, rej); }
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => new Q(t), rpc: async () => ({ error: null }) }) }));

beforeEach(() => {
  db.inserts = []; db.updates = [];
  process.env.IS_LOCAL = '1';
  (globalThis as any).fetch = vi.fn(async () => ({ ok: false, json: async () => [] })); // sem BCB: usa CDI/IPCA anuais
  db.tables = {
    user_settings: [{ user_id: 'u1', market_indexes: { cdi: 14, ipca: 4.5 } }],
    physical_assets: [
      { id: 'raizen', user_id: 'u1', name: 'CRA Raízen', estimated_value: 61418.18, category: 'INVESTMENT', is_archived: false,
        metadata: { investmentType: 'CRI_CRA', interestType: 'PRE', yieldRate: '12.29', autoCurve: true, brokerAccountId: 'b1' } },
      { id: 'fundo', user_id: 'u1', name: 'Fundo DI', estimated_value: 1000, category: 'INVESTMENT', is_archived: false,
        metadata: { investmentType: 'FUNDOS', brokerAccountId: 'b1' } }
    ],
    investment_movements: [
      { id: 'm1', asset_id: 'raizen', movement_type: 'APORTE', amount: 55000, movement_date: '2023-10-20', notes: null, is_projected: false },
      { id: 'm2', asset_id: 'raizen', movement_type: 'RENDIMENTO_ACUMULADO', amount: 6418.18, movement_date: '2026-09-30', notes: 'Set/2026', is_projected: false }
    ]
  };
});

describe('saldo da tela do app do banco', () => {
  it('fundo: troca o valor e lança a diferença como rendimento', async () => {
    const { handleCurveAction } = await import('../api/_lib/curve-projection');
    const r = await handleCurveAction('u1', { action: 'bank_value', assetId: 'fundo', value: 1012.5, date: '2026-11-08' });
    expect(r.status).toBe(200);
    expect(r.json.kind).toBe('value');
    const mv = db.inserts.find(i => i.t === 'investment_movements');
    expect(mv).toMatchObject({ movement_type: 'RENDIMENTO_ACUMULADO', amount: 12.5, movement_date: '2026-11-08' });
    expect(db.updates.find(u => u.t === 'physical_assets')?.row.estimated_value).toBe(1012.5);
  });

  it('CRA: vira valor de mercado e não mexe no valor pela curva', async () => {
    const { handleCurveAction } = await import('../api/_lib/curve-projection');
    const r = await handleCurveAction('u1', { action: 'bank_value', assetId: 'raizen', value: 26341.55, date: '2026-11-08' });
    expect(r.json.kind).toBe('market');
    expect(db.inserts.filter(i => i.t === 'investment_movements')).toHaveLength(0);
    const upd = db.updates.find(u => u.t === 'physical_assets')!;
    expect(upd.row.metadata).toMatchObject({ marketValue: 26341.55, marketValueDate: '2026-11-08' });
    expect(upd.row.estimated_value).toBeUndefined();
  });

  it('não aceita investimento de outra pessoa', async () => {
    const { handleCurveAction } = await import('../api/_lib/curve-projection');
    const r = await handleCurveAction('outra-pessoa', { action: 'bank_value', assetId: 'fundo', value: 10 });
    expect(r.status).toBe(404);
  });
});

describe('valor pela curva do relatório', () => {
  it('lança só o acerto da diferença na data do relatório', async () => {
    const { handleCurveAction } = await import('../api/_lib/curve-projection');
    const r = await handleCurveAction('u1', { action: 'report_curve', assetId: 'raizen', value: 61500, date: '2026-09-30' });
    expect(r.status).toBe(200);
    const adj = db.inserts.find(i => i.t === 'investment_movements' && i.movement_type === 'AJUSTE_MANUAL');
    expect(adj.amount).toBeCloseTo(81.82, 2);
    expect(adj.movement_date).toBe('2026-09-30');
  });
});

describe('rotina diária', () => {
  it('fecha outubro, abre novembro e atualiza o valor', async () => {
    const { refreshAssetCurve } = await import('../api/_lib/curve-projection');
    const v = await refreshAssetCurve(db.tables.physical_assets[0], { cdiAnnual: 14, ipcaAnnual: 4.5 }, '2026-11-08');
    expect(v).toBeGreaterThan(61418.18);
    const rows = db.inserts.filter(i => i.t === 'investment_movements');
    expect(rows.map(r => r.movement_date)).toEqual(['2026-10-31', '2026-11-08']);
    expect(rows.every(r => String(r.notes).startsWith('[curva automática]'))).toBe(true);
    // segunda rodada no mesmo mês: atualiza a linha do mês, não cria outra
    db.tables.investment_movements.forEach((m, i) => { if (!m.id) m.id = `auto${i}`; });
    db.inserts = [];
    await refreshAssetCurve(db.tables.physical_assets[0], { cdiAnnual: 14, ipcaAnnual: 4.5 }, '2026-11-20');
    expect(db.inserts.filter(i => i.t === 'investment_movements')).toHaveLength(0);
    expect(db.updates.some(u => u.t === 'investment_movements')).toBe(true);
  });

  it('título sem curva automática não é mexido', async () => {
    const { refreshAssetCurve } = await import('../api/_lib/curve-projection');
    expect(await refreshAssetCurve(db.tables.physical_assets[1], { cdiAnnual: 14, ipcaAnnual: 4.5 }, '2026-11-08')).toBeNull();
    expect(db.inserts).toHaveLength(0);
  });
});
