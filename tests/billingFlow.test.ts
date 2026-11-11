import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Cobrança de ponta a ponta, com o banco e o Asaas simulados:
 * assinar (Pix e cartão), renovar, atrasar, trocar de plano e substituir um Pix
 * não pago. Cada teste descreve um defeito que existia antes.
 */

process.env.ASAAS_WEBHOOK_TOKEN = 'segredo-do-webhook';
process.env.ASAAS_SANDBOX_KEY = '$aact_hmlg_teste';

// ---------- banco simulado ----------
const db = { tables: {} as Record<string, any[]>, failUpsert: false };
const get = (r: any, c: string) => r[c];
class Q {
  private filters: ((r: any) => boolean)[] = [];
  private mode: 'select' | 'update' | 'insert' | 'upsert' = 'select';
  private patch: any = null;
  private out: any[] = [];
  private error: any = null;
  constructor(private t: string) {}
  select() { return this; }
  eq(c: string, v: any) { this.filters.push(r => get(r, c) === v); return this; }
  in(c: string, vs: any[]) { this.filters.push(r => vs.includes(get(r, c))); return this; }
  lte(c: string, v: any) { this.filters.push(r => get(r, c) != null && String(get(r, c)) <= String(v)); return this; }
  not(c: string, _op: string, v: any) { this.filters.push(r => get(r, c) !== v); return this; }
  insert(rows: any) { this.mode = 'insert'; this.out = Array.isArray(rows) ? rows : [rows]; (db.tables[this.t] ||= []).push(...this.out); return this; }
  update(row: any) { this.mode = 'update'; this.patch = row; return this; }
  upsert(row: any, opts: any) {
    this.mode = 'upsert';
    if (db.failUpsert) { this.error = { message: 'banco fora do ar' }; return this; }
    const key = opts?.onConflict || 'id';
    const table = (db.tables[this.t] ||= []);
    const found = table.find(r => r[key] === row[key]);
    if (found) Object.assign(found, row); else table.push({ id: `sub-${table.length + 1}`, metadata: {}, ...row });
    return this;
  }
  private rows() { return (db.tables[this.t] || []).filter(r => this.filters.every(f => f(r))); }
  private exec() {
    if (this.error) return { data: null, error: this.error };
    if (this.mode === 'update') { const rs = this.rows(); for (const r of rs) Object.assign(r, this.patch); return { data: rs, error: null }; }
    if (this.mode === 'insert') return { data: this.out, error: null };
    if (this.mode === 'upsert') return { data: null, error: null };
    return { data: this.rows(), error: null };
  }
  // devolve cópias, como o banco de verdade (quem lê não enxerga gravações posteriores)
  maybeSingle() { const r = this.exec(); const row = Array.isArray(r.data) ? (r.data[0] || null) : null; return Promise.resolve({ data: row ? structuredClone(row) : null, error: r.error }); }
  single() { return this.maybeSingle(); }
  then(res: any, rej: any) { return Promise.resolve(this.exec()).then(res, rej); }
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t: string) => new Q(t),
    auth: {
      getUser: async (token: string) => token === 'token-ok'
        ? { data: { user: { id: 'u1', email: 'cliente@exemplo.com' } }, error: null }
        : { data: { user: null }, error: { message: 'inválido' } },
      admin: { getUserById: async () => ({ data: { user: { id: 'u1', email: 'cliente@exemplo.com' } } }) },
    },
  }),
}));

// ---------- Asaas simulado ----------
const asaas = { calls: [] as { method: string; path: string; body: any }[], customers: [] as any[], subscriptions: {} as Record<string, any>, seq: 0 };
function installAsaas() {
  (globalThis as any).fetch = vi.fn(async (url: string, init: any = {}) => {
    const path = String(url).replace('https://sandbox.asaas.com/api/v3', '');
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    asaas.calls.push({ method, path, body });
    const json = (data: any) => ({ ok: true, json: async () => data });
    if (method === 'GET' && path.startsWith('/customers?')) return json({ data: asaas.customers });
    if (method === 'POST' && path === '/customers') { const c = { id: `cus_${++asaas.seq}`, ...body }; asaas.customers.push(c); return json(c); }
    if (method === 'PUT' && path.startsWith('/customers/')) { const c = asaas.customers.find(x => `/customers/${x.id}` === path); Object.assign(c, body); return json(c); }
    if (method === 'POST' && path === '/subscriptions') {
      if (!asaas.customers.find(c => c.id === body.customer)?.cpfCnpj) return json({ errors: [{ description: 'Para criar esta cobrança é necessário preencher o CPF ou CNPJ do cliente.' }] });
      const s = { id: `sub_${++asaas.seq}`, ...body }; asaas.subscriptions[s.id] = s; return json(s);
    }
    if (method === 'GET' && path.startsWith('/subscriptions/')) return json(asaas.subscriptions[path.split('/')[2]] || {});
    if (method === 'DELETE' && path.startsWith('/subscriptions/')) { delete asaas.subscriptions[path.split('/')[2]]; return json({ deleted: true }); }
    if (method === 'GET' && path.startsWith('/payments?')) return json({ data: [{ id: 'pay_1' }] });
    if (method === 'GET' && path.endsWith('/pixQrCode')) return json({ success: true, encodedImage: 'QR', payload: 'copia-e-cola', expirationDate: '2026-11-12' });
    return json({});
  });
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: any) => { res.body = b; return res; };
  res.end = () => res;
  return res;
}
const authed = (body: any) => ({ method: 'POST', headers: { authorization: 'Bearer token-ok' }, body });
const webhook = (body: any, token = 'segredo-do-webhook') => ({ method: 'POST', headers: { 'asaas-access-token': token }, body });
const sub = () => db.tables.subscriptions.find(s => s.user_id === 'u1');
const CPF = '529.982.247-25';

const NOW = new Date('2026-11-11T15:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  db.failUpsert = false;
  asaas.calls = []; asaas.customers = []; asaas.subscriptions = {}; asaas.seq = 0;
  installAsaas();
  db.tables = {
    plans: [
      { id: 'p-ess', slug: 'essencial', name: 'Essencial', price_cents: 1990, price_cents_annual: 19104, price_cents_semiannual: 10746 },
      { id: 'p-pro', slug: 'pro', name: 'Pro', price_cents: 5990, price_cents_annual: 57504, price_cents_semiannual: 32346 },
    ],
    subscriptions: [],
    coupons: [], coupon_uses: [], landing_settings: [], affiliate_referrals: [],
  };
});

async function createSubscription(body: any) {
  const { default: handler } = await import('../api/_lib/asaas-create-subscription');
  const res = makeRes();
  const p = handler(authed(body), res);
  await vi.waitFor(async () => { await p; }, { timeout: 5000 });
  return res;
}
async function sendWebhook(body: any, token?: string) {
  const { handleAsaasWebhook } = await import('../api/_lib/asaas-webhook');
  const res = makeRes();
  await handleAsaasWebhook(webhook(body, token), res);
  return res;
}

describe('assinar', () => {
  it('Pix: o CPF e o nome vão para o cadastro do cliente no Asaas (antes a cobrança era recusada)', async () => {
    const res = await createSubscription({ planSlug: 'pro', period: 'monthly', paymentMethod: 'PIX', customer: { name: 'Maria Souza', cpfCnpj: CPF } });
    expect(res.statusCode).toBe(200);
    expect(asaas.customers[0]).toMatchObject({ name: 'Maria Souza', cpfCnpj: '52998224725', email: 'cliente@exemplo.com' });
    expect(res.body.pix).toMatchObject({ copiaECola: 'copia-e-cola' });
    expect(res.body.status).toBe('past_due'); // só vira ativo quando o pagamento cair
    expect(sub()).toMatchObject({ plan_id: 'p-pro', status: 'past_due', billing_period: 'monthly' });
  });

  it('CPF inválido é recusado antes de qualquer chamada ao Asaas', async () => {
    const res = await createSubscription({ planSlug: 'pro', paymentMethod: 'PIX', customer: { name: 'Maria', cpfCnpj: '111.111.111-11' } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/CPF ou CNPJ inválido/);
    expect(asaas.calls).toHaveLength(0);
  });

  it('cliente antigo sem CPF no Asaas tem o cadastro completado em vez de falhar', async () => {
    asaas.customers.push({ id: 'cus_velho', name: 'cliente', email: 'cliente@exemplo.com' });
    const res = await createSubscription({ planSlug: 'pro', paymentMethod: 'PIX', customer: { name: 'Maria Souza', cpfCnpj: CPF } });
    expect(res.statusCode).toBe(200);
    expect(asaas.customers[0]).toMatchObject({ id: 'cus_velho', cpfCnpj: '52998224725', name: 'Maria Souza' });
  });

  it('erro do Asaas chega em português para o cliente, não como JSON cru', async () => {
    const res = await createSubscription({ planSlug: 'pro', paymentMethod: 'PIX' }); // app antigo, sem CPF
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Para criar esta cobrança é necessário preencher o CPF ou CNPJ do cliente.');
    expect(sub()).toBeUndefined();
  });

  it('plano anual é gravado como anual (antes toda assinatura ficava "mensal")', async () => {
    await createSubscription({ planSlug: 'pro', period: 'annual', paymentMethod: 'PIX', customer: { name: 'Maria', cpfCnpj: CPF } });
    expect(sub().billing_period).toBe('annual');
    expect(Object.values(asaas.subscriptions)[0]).toMatchObject({ cycle: 'YEARLY', value: 575.04, nextDueDate: '2026-11-11' });
  });

  it('teste grátis em andamento: primeira cobrança só no fim do teste, e continua em teste', async () => {
    db.tables.subscriptions.push({ id: 's1', user_id: 'u1', plan_id: 'p-ess', status: 'trialing', trial_ends_at: '2026-11-20T12:00:00.000Z', billing_period: 'monthly', metadata: {} });
    const res = await createSubscription({ planSlug: 'pro', paymentMethod: 'CREDIT_CARD', creditCard: { number: '4111' }, creditCardHolderInfo: { name: 'Maria', cpfCnpj: CPF, phone: '11999999999' } });
    expect(res.body).toMatchObject({ status: 'trialing', nextDueDate: '2026-11-20' });
    expect(sub()).toMatchObject({ status: 'trialing', plan_id: 'p-pro' });
  });

  it('se o banco falhar ao gravar, a cobrança recém-criada no Asaas é desfeita', async () => {
    db.failUpsert = true;
    const res = await createSubscription({ planSlug: 'pro', paymentMethod: 'PIX', customer: { name: 'Maria', cpfCnpj: CPF } });
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/Nenhuma cobrança foi feita/);
    expect(Object.keys(asaas.subscriptions)).toHaveLength(0);
  });

  it('sem login não cria nada', async () => {
    const { default: handler } = await import('../api/_lib/asaas-create-subscription');
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: { planSlug: 'pro' } }, res);
    expect(res.statusCode).toBe(401);
    expect(asaas.calls).toHaveLength(0);
  });
});

describe('trocar de assinatura', () => {
  it('Pix gerado e não pago é substituído: a assinatura antiga é encerrada no Asaas', async () => {
    await createSubscription({ planSlug: 'essencial', paymentMethod: 'PIX', customer: { name: 'Maria', cpfCnpj: CPF } });
    const first = sub().asaas_subscription_id;
    await createSubscription({ planSlug: 'pro', paymentMethod: 'PIX', customer: { name: 'Maria', cpfCnpj: CPF } });
    const second = sub().asaas_subscription_id;
    expect(second).not.toBe(first);
    expect(Object.keys(asaas.subscriptions)).toEqual([second]); // só uma cobrando
  });

  it('pagante que muda de plano não paga em dobro: o que sobrou vira dias do plano novo', async () => {
    asaas.customers.push({ id: 'cus_1', email: 'cliente@exemplo.com', cpfCnpj: '52998224725', name: 'Maria' });
    asaas.subscriptions['sub_antiga'] = { id: 'sub_antiga', value: 19.9 };
    db.tables.subscriptions.push({
      id: 's1', user_id: 'u1', plan_id: 'p-ess', status: 'active', billing_period: 'monthly', cancel_at_period_end: false,
      asaas_subscription_id: 'sub_antiga', metadata: { active_account_id: 'conta-1' },
      current_period_start: '2026-10-27T03:00:00.000Z', current_period_end: '2026-11-27T03:00:00.000Z', // metade usada
    });
    const res = await createSubscription({ planSlug: 'pro', paymentMethod: 'CREDIT_CARD', creditCard: { number: '4111' }, creditCardHolderInfo: { name: 'Maria', cpfCnpj: CPF, phone: '11999999999' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.creditDays).toBe(5); // ~R$ 9,90 de crédito ÷ ~R$ 1,97 por dia do Pro
    expect(res.body.nextDueDate).toBe('2026-11-16');
    expect(Object.keys(asaas.subscriptions)).toEqual([sub().asaas_subscription_id]); // a antiga foi encerrada
    expect(sub()).toMatchObject({ plan_id: 'p-pro', status: 'active' });
    expect(sub().metadata).toEqual({ active_account_id: 'conta-1' }); // nada do cliente se perde
    // ordem segura: cria a nova primeiro, encerra a antiga depois
    const order = asaas.calls.filter(c => c.path.startsWith('/subscriptions') && c.method !== 'GET').map(c => c.method);
    expect(order).toEqual(['POST', 'DELETE']);
  });
});

describe('avisos de pagamento (webhook)', () => {
  const base = () => ({
    id: 's1', user_id: 'u1', plan_id: 'p-pro', status: 'active', billing_period: 'monthly', asaas_subscription_id: 'sub_1',
    current_period_start: '2026-10-11T03:00:00.000Z', current_period_end: '2026-11-12T02:59:59.000Z',
    metadata: { active_account_id: 'conta-1' },
  });
  const paid = (dueDate: string) => ({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_9', subscription: 'sub_1', value: 59.9, dueDate, externalReference: 'u1:pro:monthly:' } });

  it('token errado é recusado', async () => {
    db.tables.subscriptions.push(base());
    expect((await sendWebhook(paid('2026-11-11'), 'errado')).statusCode).toBe(401);
    expect((await sendWebhook(paid('2026-11-11'), 'segredo-do-webhook-com-sobra')).statusCode).toBe(401);
    expect(sub().current_period_end).toBe('2026-11-12T02:59:59.000Z');
  });

  it('renovação paga avança o período (antes ficava parado e o cancelamento tirava o acesso na hora)', async () => {
    db.tables.subscriptions.push(base());
    const res = await sendWebhook(paid('2026-11-11'));
    expect(res.statusCode).toBe(200);
    expect(sub()).toMatchObject({ status: 'active', current_period_start: '2026-11-11T03:00:00.000Z', current_period_end: '2026-12-12T02:59:59.000Z' });
    expect(sub().metadata).toEqual({ active_account_id: 'conta-1' });
  });

  it('o mesmo aviso duas vezes não soma dois meses', async () => {
    db.tables.subscriptions.push(base());
    await sendWebhook(paid('2026-11-11'));
    await sendWebhook(paid('2026-11-11'));
    expect(sub().current_period_end).toBe('2026-12-12T02:59:59.000Z');
  });

  it('primeiro pagamento ativa quem estava aguardando', async () => {
    db.tables.subscriptions.push({ ...base(), status: 'past_due', current_period_start: '2026-11-11T15:00:00.000Z', current_period_end: '2026-12-11T15:00:00.000Z' });
    await sendWebhook(paid('2026-11-11'));
    expect(sub().status).toBe('active');
    expect(sub().current_period_end).toBe('2026-12-12T02:59:59.000Z');
  });

  it('atraso de quem já pagava NÃO derruba o plano no dia seguinte: fica ativo, com o atraso anotado', async () => {
    db.tables.subscriptions.push(base());
    await sendWebhook({ event: 'PAYMENT_OVERDUE', payment: { id: 'pay_9', subscription: 'sub_1', value: 59.9, dueDate: '2026-11-10' } });
    expect(sub().status).toBe('active');
    expect(sub().metadata).toEqual({ active_account_id: 'conta-1', overdue_since: NOW.toISOString() });

    // segundo aviso de atraso não reinicia a contagem
    vi.setSystemTime(new Date('2026-11-13T15:00:00Z'));
    await sendWebhook({ event: 'PAYMENT_OVERDUE', payment: { id: 'pay_9', subscription: 'sub_1', value: 59.9, dueDate: '2026-11-10' } });
    expect(sub().metadata.overdue_since).toBe(NOW.toISOString());

    // pagou: a anotação some e o período avança
    await sendWebhook(paid('2026-11-10'));
    expect(sub().metadata).toEqual({ active_account_id: 'conta-1' });
    expect(sub().status).toBe('active');
  });

  it('atraso de quem nunca pagou (teste/aguardando) continua suspendendo na hora', async () => {
    db.tables.subscriptions.push({ ...base(), status: 'trialing' });
    await sendWebhook({ event: 'PAYMENT_OVERDUE', payment: { id: 'pay_9', subscription: 'sub_1', value: 59.9 } });
    expect(sub().status).toBe('past_due');
    expect(sub().metadata.overdue_since).toBeUndefined();
  });

  it('estorno suspende na hora', async () => {
    db.tables.subscriptions.push(base());
    await sendWebhook({ event: 'PAYMENT_REFUNDED', payment: { id: 'pay_9', subscription: 'sub_1', value: 59.9 } });
    expect(sub().status).toBe('past_due');
  });

  it('aviso de assinatura que não é de ninguém (substituída) é ignorado sem erro', async () => {
    db.tables.subscriptions.push(base());
    const res = await sendWebhook({ event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_x', subscription: 'sub_antiga', value: 19.9, dueDate: '2026-11-11' } });
    expect(res.statusCode).toBe(200);
    expect(sub().current_period_end).toBe('2026-11-12T02:59:59.000Z');
  });
});

describe('rotina diária', () => {
  async function runMaintenance() {
    const { handleMaintenance } = await import('../api/_lib/maintenance');
    const res = makeRes();
    await handleMaintenance({ method: 'GET', headers: {}, query: {} }, res);
    return res;
  }
  // as duas rotinas de banco (rpc) não fazem parte deste teste
  beforeEach(async () => {
    const mod: any = await import('@supabase/supabase-js');
    const client = mod.createClient();
    expect(client.rpc).toBeUndefined(); // o erro do rpc é absorvido pela própria rotina
  });

  it('atraso dentro da tolerância: continua ativo', async () => {
    db.tables.subscriptions.push({ id: 's1', user_id: 'u1', status: 'active', metadata: { overdue_since: '2026-11-08T15:00:00.000Z' } });
    const res = await runMaintenance();
    expect(res.body.suspendOverdueSubscriptions).toEqual({ suspended: 0 });
    expect(sub().status).toBe('active');
  });

  it('atraso além da tolerância: suspende; quem está em dia não é tocado', async () => {
    db.tables.subscriptions.push(
      { id: 's1', user_id: 'u1', status: 'active', metadata: { overdue_since: '2026-11-05T15:00:00.000Z' } },
      { id: 's2', user_id: 'u2', status: 'active', metadata: {} },
      { id: 's3', user_id: 'u3', status: 'active', metadata: { active_account_id: 'x' } },
    );
    const res = await runMaintenance();
    expect(res.body.suspendOverdueSubscriptions).toEqual({ suspended: 1 });
    expect(db.tables.subscriptions.map(s => s.status)).toEqual(['past_due', 'active', 'active']);
  });

  it('cancelamento agendado continua valendo só no fim do período pago', async () => {
    db.tables.subscriptions.push(
      { id: 's1', user_id: 'u1', status: 'active', cancel_at_period_end: true, current_period_end: '2026-11-10T00:00:00.000Z', metadata: {} },
      { id: 's2', user_id: 'u2', status: 'active', cancel_at_period_end: true, current_period_end: '2026-12-10T00:00:00.000Z', metadata: {} },
    );
    const res = await runMaintenance();
    expect(res.body.expireCanceledSubscriptions).toEqual({ downgraded: 1 });
    expect(db.tables.subscriptions.map(s => s.status)).toEqual(['canceled', 'active']);
  });
});
