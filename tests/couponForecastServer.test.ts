import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Juros previstos no servidor:
 * - cria UMA receita prevista em aberto na conta onde os juros caem (sem mexer no saldo);
 * - dado como recebido em Transações → entra no extrato do investimento, ligado, e cria o próximo;
 * - "Recebi" com o valor exato;
 * - juro lançado à mão no Extrato do investimento → previsto sai, sem duplicar;
 * - crédito vindo do extrato do banco → é ligado ao investimento e o previsto sai;
 * - rodar de novo não duplica nada.
 */

let seq = 0;
const db = { tables: {} as Record<string, any[]>, rpc: [] as any[] };
const get = (r: any, c: string) => c.startsWith('metadata->>') ? (r.metadata ? r.metadata[c.slice(11)] : undefined) : r[c];
class Q {
  private filters: ((r: any) => boolean)[] = [];
  private mode: 'select' | 'update' | 'insert' = 'select';
  private patch: any = null;
  private inserted: any[] = [];
  constructor(private t: string) {}
  select() { return this; }
  order() { return this; }
  limit() { return this; }
  eq(c: string, v: any) { this.filters.push(r => String(get(r, c)) === String(v)); return this.mode === 'update' ? this.run() : this; }
  gte(c: string, v: any) { this.filters.push(r => String(get(r, c)).slice(0, 10) >= String(v).slice(0, 10)); return this; }
  lte(c: string, v: any) { this.filters.push(r => String(get(r, c)).slice(0, 10) <= String(v).slice(0, 10)); return this; }
  insert(rows: any) {
    this.mode = 'insert';
    this.inserted = (Array.isArray(rows) ? rows : [rows]).map(r => ({ id: `n${++seq}`, is_deleted: false, ...r }));
    (db.tables[this.t] ||= []).push(...this.inserted);
    return this;
  }
  update(row: any) { this.mode = 'update'; this.patch = row; return this; }
  private rows() { return (db.tables[this.t] || []).filter(r => this.filters.every(f => f(r))); }
  private run() {
    for (const r of this.rows()) Object.assign(r, this.patch);
    return Promise.resolve({ error: null });
  }
  maybeSingle() {
    if (this.mode === 'insert') return Promise.resolve({ data: this.inserted[0] || null, error: null });
    return Promise.resolve({ data: this.rows()[0] || null, error: null });
  }
  then(res: any, rej: any) {
    const data = this.mode === 'insert' ? this.inserted : this.rows();
    return Promise.resolve({ data, error: null }).then(res, rej);
  }
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (t: string) => new Q(t), rpc: async (n: string, a: any) => { db.rpc.push({ n, a }); return { error: null }; } })
}));

const ASSET = 'euca';
const MATTEO = 'acc-matteo';
const forecasts = () => (db.tables.transactions || []).filter(t => t.metadata?.expected_coupon_asset_id === ASSET);
const openForecasts = () => forecasts().filter(t => !t.is_deleted && t.metadata?.expected_coupon_state === 'open');

beforeEach(() => {
  seq = 0;
  db.rpc = [];
  (globalThis as any).fetch = vi.fn(async () => ({ ok: false, json: async () => [] }));
  db.tables = {
    user_settings: [{ user_id: 'u1', market_indexes: { cdi: 14, ipca: 4.5 } }],
    categories: [{ id: 'cat-inv', user_id: 'u1', name: 'Investimentos' }],
    accounts: [{ id: MATTEO, user_id: 'u1', institution: 'Safra Matteo' }, { id: 'broker', user_id: 'u1', institution: 'Safra Investimentos Matteo' }],
    physical_assets: [{
      id: ASSET, user_id: 'u1', name: 'CRA Eucatex CDI 105,15%', estimated_value: 7208.77, category: 'INVESTMENT', is_archived: false,
      metadata: { investmentType: 'CRI_CRA', interestType: 'CDI', yieldRate: '105.15', brokerAccountId: 'broker', couponFrequency: 'SEMESTRAL', couponNextDate: '2027-01-15', vencimentoDate: '2030-01-15' }
    }],
    investment_movements: [
      { id: 'm0', asset_id: ASSET, movement_type: 'APORTE', amount: 7000, movement_date: '2025-01-15' },
      { id: 'm1', asset_id: ASSET, movement_type: 'RENDIMENTO_MENSAL', amount: 543.37, movement_date: '2026-01-15', linked_transaction_id: 't-jan' },
      { id: 'm2', asset_id: ASSET, movement_type: 'RENDIMENTO_MENSAL', amount: 507.28, movement_date: '2026-07-15', linked_transaction_id: 't-jul' }
    ],
    transactions: [
      { id: 't-jan', user_id: 'u1', account_id: MATTEO, type: 'INCOME', amount: 543.37, date: '2026-01-15', is_paid: true, paid_amount: 543.37, is_deleted: false, metadata: { linked_asset_id: ASSET } },
      { id: 't-jul', user_id: 'u1', account_id: MATTEO, type: 'INCOME', amount: 507.28, date: '2026-07-15', is_paid: true, paid_amount: 507.28, is_deleted: false, metadata: { linked_asset_id: ASSET } }
    ]
  };
});

describe('criar o previsto', () => {
  it('uma receita em aberto em 15/01/2027, na conta onde os juros caíram, pelo último valor', async () => {
    const { syncCouponForecasts } = await import('../api/_lib/coupon-forecast');
    const r = await syncCouponForecasts('u1', '2026-11-08');
    expect(r.created).toBe(1);
    const f = openForecasts();
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ type: 'INCOME', amount: 507.28, date: '2027-01-15', is_paid: false, paid_amount: 0, account_id: MATTEO, category: 'Investimentos' });
    // não tem ligação ao ativo enquanto é só previsto (não entra em somas de rendimento)
    expect(f[0].metadata.linked_asset_id).toBeUndefined();
    // rodar de novo não duplica
    await syncCouponForecasts('u1', '2026-11-09');
    expect(openForecasts()).toHaveLength(1);
    expect(db.tables.investment_movements).toHaveLength(3);
  });

  it('desligado no cadastro: não cria nada', async () => {
    db.tables.physical_assets[0].metadata.couponForecast = false;
    const { syncCouponForecasts } = await import('../api/_lib/coupon-forecast');
    expect((await syncCouponForecasts('u1', '2026-11-08')).created).toBe(0);
    expect(forecasts()).toHaveLength(0);
  });

  it('apagado pela pessoa em Transações: não recria', async () => {
    const { syncCouponForecasts } = await import('../api/_lib/coupon-forecast');
    await syncCouponForecasts('u1', '2026-11-08');
    openForecasts()[0].is_deleted = true;
    await syncCouponForecasts('u1', '2026-11-10');
    expect(forecasts().filter(f => !f.is_deleted)).toHaveLength(0);
  });

  it('a pessoa mudou a data no cadastro: o previsto acompanha', async () => {
    const { syncCouponForecasts } = await import('../api/_lib/coupon-forecast');
    await syncCouponForecasts('u1', '2026-11-08');
    db.tables.physical_assets[0].metadata.couponNextDate = '2027-01-20';
    await syncCouponForecasts('u1', '2026-11-10');
    expect(openForecasts()).toHaveLength(1);
    expect(openForecasts()[0].date).toBe('2027-01-20');
  });
});

describe('resolver o previsto', () => {
  it('dado como recebido em Transações: entra no extrato do investimento e cria o próximo', async () => {
    const { syncCouponForecasts } = await import('../api/_lib/coupon-forecast');
    await syncCouponForecasts('u1', '2026-11-08');
    const f = openForecasts()[0];
    Object.assign(f, { is_paid: true, paid_amount: 507.28, paid_at: '2027-01-15' });
    const r = await syncCouponForecasts('u1', '2027-01-16');
    expect(r.received).toBe(1);
    const mv = db.tables.investment_movements.find(m => m.linked_transaction_id === f.id);
    expect(mv).toMatchObject({ movement_type: 'RENDIMENTO_MENSAL', amount: 507.28, movement_date: '2027-01-15' });
    expect(f.metadata).toMatchObject({ expected_coupon_state: 'received', linked_asset_id: ASSET, investment_movement_id: mv.id });
    expect(db.tables.physical_assets[0].metadata.couponNextDate).toBe('2027-07-15');
    expect(openForecasts().map(x => x.date)).toEqual(['2027-07-15']);
  });

  it('"Recebi" com o valor exato e outra conta', async () => {
    const { syncCouponForecasts, receiveForecast } = await import('../api/_lib/coupon-forecast');
    await syncCouponForecasts('u1', '2026-11-08');
    const f = openForecasts()[0];
    const r = await receiveForecast('u1', { transactionId: f.id, value: 521.9, date: '2027-01-15', accountId: MATTEO });
    expect(r.status).toBe(200);
    expect(f).toMatchObject({ amount: 521.9, paid_amount: 521.9, is_paid: true, account_id: MATTEO });
    expect(db.tables.investment_movements.some(m => m.linked_transaction_id === f.id && m.amount === 521.9)).toBe(true);
    expect(db.rpc.some(c => c.a.p_account_id === MATTEO)).toBe(true);
  });

  it('"Recebi" não aceita previsto de outra pessoa nem conta de outra pessoa', async () => {
    const { syncCouponForecasts, receiveForecast } = await import('../api/_lib/coupon-forecast');
    await syncCouponForecasts('u1', '2026-11-08');
    const f = openForecasts()[0];
    expect((await receiveForecast('outra', { transactionId: f.id, value: 10 })).status).toBe(404);
    db.tables.accounts.push({ id: 'alheia', user_id: 'outra', institution: 'X' });
    expect((await receiveForecast('u1', { transactionId: f.id, value: 10, accountId: 'alheia' })).status).toBe(404);
    expect(f.is_paid).toBe(false);
  });

  it('juro lançado à mão no Extrato do investimento: o previsto sai, sem duplicar', async () => {
    const { syncCouponForecasts } = await import('../api/_lib/coupon-forecast');
    await syncCouponForecasts('u1', '2026-11-08');
    const f = openForecasts()[0];
    db.tables.investment_movements.push({ id: 'm-man', asset_id: ASSET, movement_type: 'RENDIMENTO_MENSAL', amount: 515, movement_date: '2027-01-16', linked_transaction_id: 't-man' });
    const r = await syncCouponForecasts('u1', '2027-01-16');
    expect(r.superseded).toBe(1);
    expect(f.is_deleted).toBe(true);
    // nenhum movimento a mais além do lançado à mão
    expect(db.tables.investment_movements.filter(m => m.movement_type === 'RENDIMENTO_MENSAL')).toHaveLength(3);
    expect(openForecasts().map(x => x.date)).toEqual(['2027-07-15']);
  });

  it('crédito do extrato do banco: liga ao investimento e tira o previsto', async () => {
    const { syncCouponForecasts } = await import('../api/_lib/coupon-forecast');
    await syncCouponForecasts('u1', '2026-11-08');
    const f = openForecasts()[0];
    db.tables.transactions.push({ id: 't-bank', user_id: 'u1', account_id: MATTEO, type: 'INCOME', amount: 521.9, paid_amount: 521.9, date: '2027-01-15 00:00:00+00', is_paid: true, is_deleted: false, description: 'Pgto Jur/amort Cra Cdi Eucatex Industria E Co', metadata: { source: 'reconcile' } });
    const r = await syncCouponForecasts('u1', '2027-01-16');
    expect(r.linked).toBe(1);
    const bank = db.tables.transactions.find(t => t.id === 't-bank');
    expect(bank.metadata).toMatchObject({ source: 'reconcile', linked_asset_id: ASSET });
    expect(bank.amount).toBe(521.9); // o lançamento do banco não muda de valor
    expect(f.is_deleted).toBe(true);
    expect(db.tables.investment_movements.some(m => m.linked_transaction_id === 't-bank' && m.amount === 521.9)).toBe(true);
  });

  it('Pix qualquer na mesma conta não é confundido com juros', async () => {
    const { syncCouponForecasts } = await import('../api/_lib/coupon-forecast');
    await syncCouponForecasts('u1', '2026-11-08');
    db.tables.transactions.push({ id: 't-pix', user_id: 'u1', account_id: MATTEO, type: 'INCOME', amount: 500, paid_amount: 500, date: '2027-01-15', is_paid: true, is_deleted: false, description: 'PIX RECEBIDO JOAO', metadata: {} });
    const r = await syncCouponForecasts('u1', '2027-01-16');
    expect(r.linked).toBe(0);
    // o de janeiro continua em aberto (não foi confundido); o de julho já fica previsto
    expect(openForecasts().map(f => f.date).sort()).toEqual(['2027-01-15', '2027-07-15']);
    expect(db.tables.transactions.find(t => t.id === 't-pix').metadata.linked_asset_id).toBeUndefined();
  });

  it('título com curva automática: juro recebido sai do valor do título (ajuste negativo)', async () => {
    db.tables.physical_assets[0].metadata.autoCurve = true;
    const { syncCouponForecasts } = await import('../api/_lib/coupon-forecast');
    await syncCouponForecasts('u1', '2026-11-08');
    Object.assign(openForecasts()[0], { is_paid: true, paid_amount: 507.28, paid_at: '2027-01-15' });
    await syncCouponForecasts('u1', '2027-01-16');
    const adj = db.tables.investment_movements.find(m => m.movement_type === 'AJUSTE_MANUAL' && m.movement_date === '2027-01-15');
    expect(adj?.amount).toBe(-507.28);
  });
});

describe('juros não recebidos', () => {
  it('juro atrasado continua em aberto, o próximo é previsto, e o alerta vai uma vez só', async () => {
    db.tables.user_settings[0] = { ...db.tables.user_settings[0], whatsapp_enabled: true, whatsapp_number: '5511999999999' };
    process.env.EVOLUTION_API_URL = 'https://evo.test'; process.env.EVOLUTION_API_KEY = 'k'; process.env.EVOLUTION_INSTANCE = 'i';
    const sent: any[] = [];
    (globalThis as any).fetch = vi.fn(async (url: string, init: any) => { if (String(url).includes('evo.test')) sent.push(JSON.parse(init.body)); return { ok: false, json: async () => [] }; });
    const { syncCouponForecasts, notifyMissedCoupons } = await import('../api/_lib/coupon-forecast');
    await syncCouponForecasts('u1', '2026-11-08');
    // passou 15/01/2027 e o juro não caiu
    await syncCouponForecasts('u1', '2027-01-25');
    expect(openForecasts().map(f => f.date).sort()).toEqual(['2027-01-15', '2027-07-15']);
    expect(await notifyMissedCoupons('2027-01-25')).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('Juros não recebidos');
    expect(sent[0].text).toContain('15/01/2027');
    // no dia seguinte não repete
    expect(await notifyMissedCoupons('2027-01-26')).toBe(0);
    expect(sent).toHaveLength(1);
    delete process.env.EVOLUTION_API_URL;
  });

  it('dentro do prazo (até 5 dias) não alerta', async () => {
    const { syncCouponForecasts, notifyMissedCoupons } = await import('../api/_lib/coupon-forecast');
    await syncCouponForecasts('u1', '2026-11-08');
    expect(await notifyMissedCoupons('2027-01-19')).toBe(0);
    expect(openForecasts()[0].metadata.missed_notified_at).toBeUndefined();
  });

  it('dispensar: aquele juro some e não volta; o próximo continua previsto', async () => {
    const { syncCouponForecasts, dismissForecast } = await import('../api/_lib/coupon-forecast');
    await syncCouponForecasts('u1', '2026-11-08');
    const f = openForecasts()[0];
    expect((await dismissForecast('outra', { transactionId: f.id })).status).toBe(404);
    expect((await dismissForecast('u1', { transactionId: f.id })).status).toBe(200);
    expect(f.is_deleted).toBe(true);
    expect(f.metadata.expected_coupon_state).toBe('dismissed');
    await syncCouponForecasts('u1', '2026-11-10');
    expect(forecasts().filter(x => !x.is_deleted).map(x => x.date)).toEqual(['2027-07-15']);
  });
});

