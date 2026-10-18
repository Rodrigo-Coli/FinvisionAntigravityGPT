import { describe, it, expect, vi, afterEach } from 'vitest';

// Erros exatamente como vieram nos logs da Vercel (17/10/2026).
const PREPAY_DEPLETED = {
  status: 402,
  message: '{"error":{"code":402,"message":"Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.","status":"RESOURCE_EXHAUSTED"}}'
};
const MODEL_GONE = {
  status: 404,
  message: '{"error":{"code":404,"message":"This model models/gemini-2.0-flash is no longer available.","status":"NOT_FOUND"}}'
};
const QUOTA = { status: 429, message: 'Resource has been exhausted (e.g. check quota).' };
const BAD_REQUEST = { status: 400, message: 'Request contains an invalid argument.' };

const load = async () => {
  vi.resetModules();
  return import('../api/_lib/ai-models');
};

/** Cliente falso: cada modelo responde ou falha conforme o mapa. */
const fakeAi = (behavior: Record<string, any>) => {
  const calls: string[] = [];
  return {
    calls,
    models: {
      generateContent: async (params: any) => {
        calls.push(params.model);
        const b = behavior[params.model];
        if (b instanceof Error || (b && typeof b === 'object' && 'status' in b)) throw b;
        return { text: `ok:${params.model}`, echo: params };
      }
    }
  };
};

afterEach(() => {
  vi.unstubAllEnvs();
});

vi.spyOn(console, 'error').mockImplementation(() => {});

describe('fila de modelos do Gemini', () => {
  it('padrão: 2.5 Flash, depois os Flash 3.x e, por último, o Flash Lite (sem o 2.0 desativado)', async () => {
    vi.stubEnv('GEMINI_MODEL', '');
    vi.stubEnv('GEMINI_FALLBACK_MODELS', '');
    const m = await load();
    expect(m.geminiModelChain()).toEqual([
      'gemini-2.5-flash',
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3-flash',
      'gemini-2.5-flash-lite'
    ]);
    expect(m.geminiModelChain()).not.toContain('gemini-2.0-flash');
  });

  it('variáveis da Vercel trocam principal e reservas sem mexer no código', async () => {
    vi.stubEnv('GEMINI_MODEL', ' gemini-3.8-flash ');
    vi.stubEnv('GEMINI_FALLBACK_MODELS', 'gemini-3.7-flash, gemini-3.8-flash ,, gemini-2.5-flash');
    const m = await load();
    expect(m.geminiModelChain()).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-2.5-flash']);
  });
});

describe('quando passar para o próximo modelo', () => {
  it('cota estourada, modelo desativado, fora do ar ou rede: tenta o próximo', async () => {
    const m = await load();
    expect(m.shouldTryNextModel(QUOTA)).toBe(true);
    expect(m.shouldTryNextModel(MODEL_GONE)).toBe(true);
    expect(m.shouldTryNextModel({ status: 503, message: 'overloaded' })).toBe(true);
    expect(m.shouldTryNextModel(new Error('fetch failed'))).toBe(true);
  });

  it('crédito esgotado ou pedido inválido: não adianta trocar de modelo', async () => {
    const m = await load();
    expect(m.isAiBillingError(PREPAY_DEPLETED)).toBe(true);
    expect(m.shouldTryNextModel(PREPAY_DEPLETED)).toBe(false);
    expect(m.shouldTryNextModel(BAD_REQUEST)).toBe(false);
    expect(m.shouldTryNextModel({ status: 403, message: 'permission denied' })).toBe(false);
  });
});

describe('generateWithFallback', () => {
  const chain = ['a', 'b', 'c'];

  it('usa o principal quando ele responde', async () => {
    const m = await load();
    const ai = fakeAi({});
    const { response, model } = await m.generateWithFallback(ai, { contents: 'x' }, chain);
    expect(model).toBe('a');
    expect(response.text).toBe('ok:a');
    expect(ai.calls).toEqual(['a']);
  });

  it('cota do principal estourada: o próximo assume, com os mesmos parâmetros', async () => {
    const m = await load();
    const ai = fakeAi({ a: QUOTA, b: MODEL_GONE });
    const { response, model } = await m.generateWithFallback(ai, { contents: 'x', config: { t: 1 } }, chain);
    expect(model).toBe('c');
    expect(ai.calls).toEqual(['a', 'b', 'c']);
    expect(response.echo).toMatchObject({ contents: 'x', config: { t: 1 }, model: 'c' });
  });

  it('crédito esgotado: para na hora, com a mensagem clara', async () => {
    const m = await load();
    const ai = fakeAi({ a: PREPAY_DEPLETED });
    await expect(m.generateWithFallback(ai, {}, chain)).rejects.toThrow('créditos da IA acabaram');
    expect(ai.calls).toEqual(['a']);
  });

  it('pedido inválido: não queima os outros modelos', async () => {
    const m = await load();
    const ai = fakeAi({ a: BAD_REQUEST });
    await expect(m.generateWithFallback(ai, {}, chain)).rejects.toMatchObject({ status: 400 });
    expect(ai.calls).toEqual(['a']);
  });

  it('todos falharam: devolve o último erro', async () => {
    const m = await load();
    const ai = fakeAi({ a: QUOTA, b: QUOTA, c: MODEL_GONE });
    await expect(m.generateWithFallback(ai, {}, chain)).rejects.toMatchObject({ status: 404 });
    expect(ai.calls).toEqual(['a', 'b', 'c']);
  });
});
