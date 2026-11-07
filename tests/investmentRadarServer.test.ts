import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Servidor do Radar e a rotina diária.
 * - A rotina diária continua rodando contas a vencer, vencimentos, indicações
 *   e manutenção mesmo se o radar der erro.
 * - O radar grava o resultado, só avisa no WhatsApp quando é URGENTE e não
 *   avisa de novo no mesmo caso antes de 7 dias.
 */

const calls: string[] = [];

vi.mock('../api/_lib/notify-bills-due.js', () => ({ handleNotifyBillsDue: async (_r: any, res: any) => { calls.push('bills'); res.status(200).json({ ok: 1 }); } }));
vi.mock('../api/_lib/notify-investments-due.js', () => ({ handleNotifyInvestmentsDue: async (_r: any, res: any) => { calls.push('investments'); res.status(200).json({ ok: 1 }); } }));
vi.mock('../api/_lib/notify-referral-engagement.js', () => ({ handleNotifyReferralEngagement: async (_r: any, res: any) => { calls.push('referral'); res.status(200).json({ ok: 1 }); } }));
vi.mock('../api/_lib/maintenance.js', () => ({ handleMaintenance: async (_r: any, res: any) => { calls.push('maintenance'); res.status(200).json({ ok: 1 }); } }));

// Banco falso do servidor (cliente do supabase-js).
const db = {
  tables: {} as Record<string, any[]>,
  upserts: [] as any[],
  throwOn: '' as string
};
class Q {
  private filters: ((r: any) => boolean)[] = [];
  constructor(private t: string) {}
  select() { if (db.throwOn === this.t) throw new Error('banco fora do ar'); return this; }
  eq(c: string, v: any) { this.filters.push(r => !(c in r) || r[c] === v); return this; }
  in(c: string, vs: any[]) { this.filters.push(r => vs.includes(r[c])); return this; }
  upsert(row: any) { db.upserts.push(row); return Promise.resolve({ error: null }); }
  insert() { return this; }
  maybeSingle() { return Promise.resolve({ data: this.rows()[0] || null, error: null }); }
  private rows() { return (db.tables[this.t] || []).filter(r => this.filters.every(f => f(r))); }
  then(res: any, rej: any) { return Promise.resolve({ data: this.rows(), error: null }).then(res, rej); }
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => new Q(t), auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } }) }));
vi.mock('web-push', () => ({ default: { setVapidDetails: () => undefined, sendNotification: async () => undefined } }));

const captureRes = () => {
  const out: any = { status: 0, body: null };
  const res: any = { status(c: number) { out.status = c; return res; }, json(b: any) { out.body = b; return res; }, end() { return res; } };
  return { res, out };
};

beforeEach(() => {
  calls.length = 0;
  db.upserts = [];
  db.throwOn = '';
  process.env.IS_LOCAL = '1';
  delete process.env.GEMINI_API_KEY;
  delete process.env.API_KEY;
  process.env.EVOLUTION_API_URL = 'https://evo.test';
  process.env.EVOLUTION_API_KEY = 'k';
  process.env.EVOLUTION_INSTANCE = 'i';
  db.tables = {
    physical_assets: [
      { id: 'a1', user_id: 'u1', category: 'INVESTMENT', is_archived: false, name: 'CRA Raízen', estimated_value: 60000, acquisition_date: '2023-10-20', metadata: { investmentType: 'CRI_CRA', issuer: 'Raízen', marketValue: 26000 } },
      { id: 'a2', user_id: 'u1', category: 'INVESTMENT', is_archived: false, name: 'Fundo DI', estimated_value: 10000, metadata: { investmentType: 'FUNDOS' } }
    ],
    investment_radar: [],
    investment_movements: [],
    user_settings: [{ user_id: 'u1', whatsapp_enabled: true, whatsapp_number: '5511999999999', push_enabled: false, market_indexes: { cdi: 14 } }]
  };
  (globalThis as any).fetch = vi.fn(async (url: string) => {
    if (String(url).includes('bcb.gov.br')) return { ok: true, json: async () => [] };
    return { ok: true, json: async () => ({}), text: async () => '' };
  });
});

describe('rotina diária', () => {
  it('roda tudo o que já rodava e o radar por último', async () => {
    const { handleDailyCron } = await import('../api/_lib/daily-cron');
    const { res, out } = captureRes();
    await handleDailyCron({ headers: {}, query: {} }, res);
    expect(out.status).toBe(200);
    expect(calls).toEqual(['bills', 'investments', 'referral', 'maintenance']);
    expect(out.body.investmentRadar.statusCode).toBe(200);
  });

  it('se o radar quebrar, o resto continua e a rotina responde 200', async () => {
    db.throwOn = 'physical_assets';
    const { handleDailyCron } = await import('../api/_lib/daily-cron');
    const { res, out } = captureRes();
    await handleDailyCron({ headers: {}, query: {} }, res);
    expect(out.status).toBe(200);
    expect(calls).toEqual(['bills', 'investments', 'referral', 'maintenance']);
  });
});

describe('varredura do radar', () => {
  it('grava o resultado de cada investimento ativo', async () => {
    const { scanUser } = await import('../api/_lib/investment-radar');
    const r = await scanUser('u1', { maxNewsIssuers: 0, aiFn: 'investment_radar', notify: true });
    expect(r.checked).toBe(2);
    expect(db.upserts.map(u => u.asset_id).sort()).toEqual(['a1', 'a2']);
  });

  it('mercado despencando + concentração alta = URGENTE e avisa no WhatsApp uma vez', async () => {
    const { scanUser } = await import('../api/_lib/investment-radar');
    await scanUser('u1', { maxNewsIssuers: 0, aiFn: 'investment_radar', notify: true });
    const raizen = db.upserts.find(u => u.asset_id === 'a1');
    expect(raizen.level).toBe('URGENTE'); // 57% abaixo da curva (grave) + 86% num emissor (moderado)
    const whatsCalls = (globalThis.fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes('evo.test'));
    expect(whatsCalls.length).toBe(1);
    expect(raizen.notified_at).toBeTruthy();
  });

  it('não repete o aviso antes de 7 dias', async () => {
    db.tables.investment_radar = [{ asset_id: 'a1', user_id: 'u1', level: 'URGENTE', notified_at: new Date(Date.now() - 2 * 86400000).toISOString(), next_check_at: null, history: [] }];
    const { scanUser } = await import('../api/_lib/investment-radar');
    await scanUser('u1', { maxNewsIssuers: 0, aiFn: 'investment_radar', notify: true });
    const whatsCalls = (globalThis.fetch as any).mock.calls.filter((c: any[]) => String(c[0]).includes('evo.test'));
    expect(whatsCalls.length).toBe(0);
  });

  it('na rodada automática só checa o que está vencido', async () => {
    const future = new Date(Date.now() + 3 * 86400000).toISOString();
    db.tables.investment_radar = [
      { asset_id: 'a1', user_id: 'u1', level: 'OK', next_check_at: future, history: [] },
      { asset_id: 'a2', user_id: 'u1', level: 'OK', next_check_at: future, history: [] }
    ];
    const { scanUser } = await import('../api/_lib/investment-radar');
    const r = await scanUser('u1', { onlyDue: true, maxNewsIssuers: 0, aiFn: 'investment_radar_auto', notify: true });
    expect(r.checked).toBe(0);
    expect(db.upserts).toEqual([]);
  });

  it('a rota exige login', async () => {
    const { handleInvestmentRadar } = await import('../api/_lib/investment-radar');
    const { res, out } = captureRes();
    await handleInvestmentRadar({ method: 'POST', headers: {}, body: { action: 'scan' } }, res);
    expect(out.status).toBe(401);
  });
});
