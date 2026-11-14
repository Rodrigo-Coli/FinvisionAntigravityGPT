import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkAiActionAllowed, isDowngradedSubscription } from '../api/_lib/ai-usage-limits';

/**
 * Limite de IA por plano: quem caiu para o plano gratuito (teste vencido,
 * pagamento pendente, cancelado) usa os limites do gratuito — antes ficava com
 * IA liberada. Pagante e teste em andamento não mudam.
 */

const NOW = new Date('2026-11-20T12:00:00Z');
const STARTER = { ai_chat: false, ai_scanner: false, reconcile: false, ai_categorize: false, whatsapp_messages: false };
const PRO = { ai_chat: true, ai_scanner: -1, reconcile: true };
const PLUS = { ai_chat: false, ai_scanner: 10, reconcile: true };

function fakeSupabase(sub: any, used = 0, opts: { starterMissing?: boolean; subError?: boolean } = {}) {
  const seen: any = { window: null };
  return {
    seen,
    from(table: string) {
      const q: any = {
        select: () => q, eq: () => q, in: () => q,
        gte: (_c: string, v: string) => { seen.window = { ...(seen.window || {}), start: v }; return q; },
        lt: (_c: string, v: string) => { seen.window = { ...(seen.window || {}), end: v }; return Promise.resolve({ count: used, error: null }); },
        maybeSingle: () => {
          if (table === 'subscriptions') return Promise.resolve(opts.subError ? { data: null, error: { message: 'fora do ar' } } : { data: sub, error: null });
          if (table === 'plans') return Promise.resolve({ data: opts.starterMissing ? null : { features: STARTER }, error: null });
          return Promise.resolve({ data: null, error: null });
        },
      };
      return q;
    },
  };
}
const base = { plan_id: 'p', current_period_start: '2026-01-05T00:00:00.000Z', current_period_end: '2027-01-05T00:00:00.000Z', created_at: '2026-01-05T00:00:00.000Z', trial_ends_at: null };

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); vi.spyOn(console, 'error').mockImplementation(() => {}); });

describe('quem está no plano gratuito na prática', () => {
  it('reconhece teste vencido, pagamento pendente e cancelado', () => {
    expect(isDowngradedSubscription({ status: 'past_due' }, NOW)).toBe(true);
    expect(isDowngradedSubscription({ status: 'canceled' }, NOW)).toBe(true);
    expect(isDowngradedSubscription({ status: 'trialing', trial_ends_at: '2026-11-01T00:00:00Z' }, NOW)).toBe(true);
    expect(isDowngradedSubscription({ status: 'trialing', trial_ends_at: '2026-12-01T00:00:00Z' }, NOW)).toBe(false);
    expect(isDowngradedSubscription({ status: 'active' }, NOW)).toBe(false);
    expect(isDowngradedSubscription({ status: 'admin_granted' }, NOW)).toBe(false);
  });

  it('cancelado ou com pagamento pendente não tem mais IA liberada', async () => {
    for (const status of ['past_due', 'canceled']) {
      const r = await checkAiActionAllowed(fakeSupabase({ ...base, status, plans: { features: PRO } }), 'u1', 'chat');
      expect(r.allowed).toBe(false);
      expect(r.message).toMatch(/não está incluído no seu plano/);
    }
  });

  it('teste vencido usa o gratuito; teste em andamento usa o plano do teste', async () => {
    const vencido = await checkAiActionAllowed(fakeSupabase({ ...base, status: 'trialing', trial_ends_at: '2026-11-01T00:00:00Z', plans: { features: PRO } }), 'u1', 'bank_reconcile');
    expect(vencido.allowed).toBe(false);
    const rodando = await checkAiActionAllowed(fakeSupabase({ ...base, status: 'trialing', trial_ends_at: '2026-12-01T00:00:00Z', plans: { features: PRO } }), 'u1', 'bank_reconcile');
    expect(rodando).toMatchObject({ allowed: true, reason: 'unlimited' });
  });

  it('categorização por IA e WhatsApp deixam de ser ilimitados no gratuito', async () => {
    const sub = { ...base, status: 'canceled', plans: { features: PRO } };
    expect((await checkAiActionAllowed(fakeSupabase(sub), 'u1', 'categorize')).allowed).toBe(false);
    expect((await checkAiActionAllowed(fakeSupabase(sub), 'u1', 'whatsapp_query')).allowed).toBe(false);
  });
});

describe('quem paga não é afetado', () => {
  it('Pro (ativo ou liberado pelo admin): sem limite', async () => {
    for (const status of ['active', 'admin_granted']) {
      const r = await checkAiActionAllowed(fakeSupabase({ ...base, status, plans: { features: PRO } }), 'u1', 'chat');
      expect(r).toMatchObject({ allowed: true, reason: 'unlimited' });
    }
  });

  it('Plus: conta o uso do MÊS atual, não do ano inteiro do plano anual', async () => {
    const client = fakeSupabase({ ...base, status: 'active', plans: { features: PLUS } }, 4);
    const r = await checkAiActionAllowed(client, 'u1', 'receipt_items');
    expect(r).toMatchObject({ allowed: true, used: 4, limit: 10, remaining: 6 });
    expect(client.seen.window).toEqual({ start: '2026-11-05T00:00:00.000Z', end: '2026-12-05T00:00:00.000Z' });
  });

  it('Plus no limite: bloqueia e diz quando libera', async () => {
    const r = await checkAiActionAllowed(fakeSupabase({ ...base, status: 'active', plans: { features: PLUS } }, 10), 'u1', 'receipt_items');
    expect(r.allowed).toBe(false);
    expect(r.message).toMatch(/limite de 10/);
  });
});

describe('na dúvida, libera (nunca trava cliente por falha da checagem)', () => {
  it('banco fora do ar, plano gratuito não encontrado, sem usuário', async () => {
    expect((await checkAiActionAllowed(fakeSupabase(null, 0, { subError: true }), 'u1', 'chat')).allowed).toBe(true);
    expect((await checkAiActionAllowed(fakeSupabase({ ...base, status: 'canceled', plans: { features: PRO } }, 0, { starterMissing: true }), 'u1', 'chat')).allowed).toBe(true);
    expect((await checkAiActionAllowed(fakeSupabase(null), null, 'chat')).allowed).toBe(true);
    expect((await checkAiActionAllowed(fakeSupabase(null), 'u1', 'chat')).allowed).toBe(true);
  });
});
