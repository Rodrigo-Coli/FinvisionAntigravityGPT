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
  order() { return this; }
  limit() { return this; }
  gte() { return this; }
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

vi.mock('../api/_lib/ai-usage-limits.js', () => ({ checkAiActionAllowed: async () => ({ allowed: true }) }));
vi.mock('../api/_lib/ai-models.js', () => ({
  generateWithFallback: async () => ({
    response: { text: '## O que a resposta esclareceu\n- **Taxa**: 102% do CDI\nVEREDITO: VALE' },
    model: 'test'
  })
}));

describe('WhatsApp: só entra no radar o que é claramente sobre investimento', () => {
  it('mensagens comuns seguem o fluxo de sempre', async () => {
    const { isInvestmentWhatsAppMessage } = await import('../api/_lib/investment-radar');
    for (const caption of ['comprovante de aplicação', 'investimento', 'aplicação no CDB', 'fundo de reserva', 'mercado', 'gasolina posto', '']) {
      expect(isInvestmentWhatsAppMessage(caption, true)).toBeNull();
    }
    for (const t of ['Gastei 50 no mercado', 'almoço com o gerente 80 reais', 'quanto rendeu meu investimento?', 'sugestão de jantar']) {
      expect(isInvestmentWhatsAppMessage(t, false)).toBeNull();
    }
  });
  it('print/PDF com "sugestão", "proposta", "radar" ou "vale a pena" vira análise', async () => {
    const { isInvestmentWhatsAppMessage } = await import('../api/_lib/investment-radar');
    expect(isInvestmentWhatsAppMessage('sugestão do gerente', true)).toBe('proposal');
    expect(isInvestmentWhatsAppMessage('Proposta Safra', true)).toBe('proposal');
    expect(isInvestmentWhatsAppMessage('vale a pena?', true)).toBe('proposal');
  });
  it('"gerente:" é resposta do gerente (texto, áudio transcrito ou print)', async () => {
    const { isInvestmentWhatsAppMessage } = await import('../api/_lib/investment-radar');
    expect(isInvestmentWhatsAppMessage('gerente: a taxa é 102% do CDI', false)).toBe('answer');
    expect(isInvestmentWhatsAppMessage('Resposta do gerente - tem FGC', false)).toBe('answer');
    expect(isInvestmentWhatsAppMessage('gerente: segue o print', true)).toBe('answer');
  });
  it('formata para o WhatsApp', async () => {
    const { toWhatsAppText } = await import('../api/_lib/investment-radar');
    expect(toWhatsAppText('## Título\n- **Taxa**: 1%')).toBe('*Título*\n- *Taxa*: 1%');
  });
});

describe('resposta do gerente (memória da conversa)', () => {
  const updates: any[] = [];
  beforeEach(() => {
    updates.length = 0;
    process.env.GEMINI_API_KEY = 'k';
    db.tables.investment_proposals = [{ id: 'p1', user_id: 'u1', source_name: 'CDB Safra', analysis: 'Perguntas: qual a taxa?', follow_ups: [{ at: '2026-11-01', answer: 'é 2 anos', verdict: 'DEPENDE', analysis: 'ok' }], created_at: '2026-11-01' }];
    (Q.prototype as any).update = function (row: any) { updates.push(row); return { eq: () => Promise.resolve({ error: null }) }; };
  });

  it('junta a resposta às anteriores e atualiza o veredito', async () => {
    const { addManagerAnswer } = await import('../api/_lib/investment-radar');
    const r: any = await addManagerAnswer('u1', null, 'a taxa é 102% do CDI', null, 'whatsapp');
    expect(r.ok).toBe(true);
    expect(r.verdict).toBe('VALE');
    expect(updates[0].follow_ups).toHaveLength(2);
    expect(updates[0].follow_ups[1]).toMatchObject({ answer: 'a taxa é 102% do CDI', channel: 'whatsapp', verdict: 'VALE' });
    expect(updates[0].verdict).toBe('VALE');
  });

  it('sem sugestão anterior, pede o print primeiro', async () => {
    db.tables.investment_proposals = [];
    const { addManagerAnswer } = await import('../api/_lib/investment-radar');
    const r: any = await addManagerAnswer('u1', null, 'a taxa é 102%', null, 'app');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Mande primeiro');
  });

  it('pelo WhatsApp responde com o veredito e o lembrete de como continuar', async () => {
    const { handleInvestmentWhatsApp } = await import('../api/_lib/investment-radar');
    const reply = await handleInvestmentWhatsApp({ userId: 'u1', text: 'gerente: 102% do CDI', hasFile: false, fetchMedia: async () => null });
    expect(reply).toContain('Veredito agora');
    expect(reply).toContain('*Taxa*');
  });

  it('mensagem comum não é tratada pelo radar', async () => {
    const { handleInvestmentWhatsApp } = await import('../api/_lib/investment-radar');
    const reply = await handleInvestmentWhatsApp({ userId: 'u1', text: 'Gastei 50 no mercado', hasFile: false, fetchMedia: async () => null });
    expect(reply).toBeNull();
  });
});

describe('WhatsApp em conversa natural (sem comando)', () => {
  beforeEach(() => {
    db.tables.investment_proposals = [];
  });
  it('entende uma oferta contada do jeito da pessoa', async () => {
    const { classifyInvestmentMessage } = await import('../api/_lib/investment-radar');
    expect(await classifyInvestmentMessage('u1', 'O gerente me ofereceu um CDB de 102% do CDI por 2 anos, vale a pena?', false)).toBe('proposal');
    expect(await classifyInvestmentMessage('u1', 'o Safra sugeriu trocar meu CRA por uma LCA', false)).toBe('proposal');
    expect(await classifyInvestmentMessage('u1', 'vale a pena investir nesse fundo que a assessora mandou?', false)).toBe('proposal');
    expect(await classifyInvestmentMessage('u1', 'olha essa aplicação que o banco ofereceu', true)).toBe('proposal');
  });
  it('não pega o que não é sugestão de investimento', async () => {
    const { classifyInvestmentMessage } = await import('../api/_lib/investment-radar');
    for (const t of [
      'o banco sugeriu parcelar a fatura',
      'Gastei 50 no mercado',
      'quanto rendeu meu investimento?',
      'almoço com o gerente 80 reais',
      'Recebi 2000 de salário',
      'transferi 500 para a XP',
      'paguei a fatura do Bradesco'
    ]) expect(await classifyInvestmentMessage('u1', t, false)).toBeNull();
    expect(await classifyInvestmentMessage('u1', 'comprovante de aplicação', true)).toBeNull();
    expect(await classifyInvestmentMessage('u1', 'o Bradesco mandou o comprovante da aplicação', true)).toBeNull();
    expect(await classifyInvestmentMessage('u1', 'Apliquei 1000 no CDB do Bradesco', false)).toBeNull();
  });
  it('"o gerente disse…" vira resposta só se houver sugestão recente e falar de investimento', async () => {
    const { classifyInvestmentMessage } = await import('../api/_lib/investment-radar');
    expect(await classifyInvestmentMessage('u1', 'o gerente disse que a taxa é 102% do CDI', false)).toBeNull();
    db.tables.investment_proposals = [{ id: 'p1', user_id: 'u1', created_at: new Date().toISOString() }];
    expect(await classifyInvestmentMessage('u1', 'o gerente disse que a taxa é 102% do CDI', false)).toBe('answer');
    expect(await classifyInvestmentMessage('u1', 'o gerente disse que meu limite aumentou', false)).toBeNull();
  });
});
