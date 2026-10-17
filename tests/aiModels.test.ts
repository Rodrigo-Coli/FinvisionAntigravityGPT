import { describe, it, expect, vi, afterEach } from 'vitest';

// Mensagens exatamente como vieram nos logs da Vercel (17/10/2026).
const PREPAY_DEPLETED = {
  status: 402,
  message: '{"error":{"code":402,"message":"Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.","status":"RESOURCE_EXHAUSTED"}}'
};
const MODEL_GONE = {
  status: 404,
  message: '{"error":{"code":404,"message":"This model models/gemini-2.0-flash is no longer available.","status":"NOT_FOUND"}}'
};

const load = async () => {
  vi.resetModules();
  return import('../api/_lib/ai-models');
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('modelos do Gemini', () => {
  it('padrão: 2.5 Flash como principal e 3.8 Flash como reserva (o 2.0 foi desativado)', async () => {
    vi.stubEnv('GEMINI_MODEL', '');
    vi.stubEnv('GEMINI_FALLBACK_MODEL', '');
    const m = await load();
    expect(m.GEMINI_PRIMARY_MODEL).toBe('gemini-2.5-flash');
    expect(m.geminiModelChain()).toEqual(['gemini-2.5-flash', 'gemini-3.8-flash']);
    expect(m.geminiModelChain()).not.toContain('gemini-2.0-flash');
  });

  it('variáveis da Vercel trocam os modelos sem mexer no código', async () => {
    vi.stubEnv('GEMINI_MODEL', ' gemini-3.8-flash ');
    vi.stubEnv('GEMINI_FALLBACK_MODEL', 'gemini-3.7-flash');
    const m = await load();
    expect(m.geminiModelChain()).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash']);
  });

  it('principal e reserva iguais não tentam o mesmo modelo duas vezes', async () => {
    vi.stubEnv('GEMINI_MODEL', 'gemini-3.8-flash');
    vi.stubEnv('GEMINI_FALLBACK_MODEL', 'gemini-3.8-flash');
    const m = await load();
    expect(m.geminiModelChain()).toEqual(['gemini-3.8-flash']);
  });
});

describe('erro de crédito esgotado', () => {
  it('reconhece o 402 de crédito pré-pago esgotado', async () => {
    const m = await load();
    expect(m.isAiBillingError(PREPAY_DEPLETED)).toBe(true);
    expect(m.isAiBillingError(new Error('Your prepayment credits are depleted.'))).toBe(true);
  });

  it('modelo desativado ou falha comum NÃO é falta de crédito (aí a reserva é tentada)', async () => {
    const m = await load();
    expect(m.isAiBillingError(MODEL_GONE)).toBe(false);
    expect(m.isAiBillingError(new Error('fetch failed'))).toBe(false);
    expect(m.isAiBillingError({ status: 429, message: 'Resource has been exhausted (e.g. check quota).' })).toBe(false);
    expect(m.isAiBillingError(undefined)).toBe(false);
  });

  it('a mensagem para o usuário diz o que aconteceu', async () => {
    const m = await load();
    expect(m.AI_BILLING_MESSAGE).toContain('créditos da IA acabaram');
  });
});
