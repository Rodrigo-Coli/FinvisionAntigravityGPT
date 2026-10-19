import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// Erros no formato que o Gemini devolve (402 e 404 copiados dos logs da Vercel).
const PREPAY_DEPLETED = {
  status: 402,
  message: '{"error":{"code":402,"message":"Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.","status":"RESOURCE_EXHAUSTED"}}'
};
const MODEL_GONE = {
  status: 404,
  message: '{"error":{"code":404,"message":"This model models/gemini-2.0-flash is no longer available.","status":"NOT_FOUND"}}'
};
const QUOTA_MINUTE = { status: 429, message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 15. Please retry in 37s. "retryDelay": "37s"' };
const QUOTA_DAY = { status: 429, message: 'Quota exceeded: GenerateRequestsPerDayPerProjectPerModel-FreeTier' };
const BAD_REQUEST = { status: 400, message: 'Request contains an invalid argument.' };
const BAD_KEY = { status: 400, message: 'API key not valid. Please pass a valid API key.' };

const load = async () => {
  vi.resetModules();
  return import('../api/_lib/ai-models');
};

/** Cliente falso: cada modelo responde, falha ou devolve vazio conforme o mapa. */
const fakeClient = (behavior: Record<string, any> = {}) => {
  const calls: string[] = [];
  return {
    calls,
    models: {
      generateContent: async (params: any) => {
        calls.push(params.model);
        const b = behavior[params.model];
        if (b === 'empty') return { text: '' };
        if (b && typeof b === 'object' && 'status' in b) throw b;
        return { text: `ok:${params.model}`, echo: params };
      }
    }
  };
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('filas padrão', () => {
  it('gratuita: Flash Lite primeiro (mais cota), depois os Flash', async () => {
    vi.stubEnv('GEMINI_FREE_MODELS', '');
    const m = await load();
    expect(m.GEMINI_FREE_MODELS.slice(0, 3)).toEqual(['gemini-2.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
    expect(m.GEMINI_FREE_MODELS).toContain('gemini-2.5-flash');
    expect(m.GEMINI_FREE_MODELS).not.toContain('gemini-2.0-flash');
  });

  it('paga: 2.5 Flash e os Flash 3.x (sem o 2.0 desativado)', async () => {
    vi.stubEnv('GEMINI_MODEL', '');
    vi.stubEnv('GEMINI_FALLBACK_MODELS', '');
    const m = await load();
    expect(m.geminiModelChain()[0]).toBe('gemini-2.5-flash');
    expect(m.geminiModelChain()).toContain('gemini-3.8-flash');
    expect(m.geminiModelChain()).not.toContain('gemini-2.0-flash');
  });

  it('variáveis da Vercel trocam as filas sem mexer no código', async () => {
    vi.stubEnv('GEMINI_FREE_MODELS', 'a-lite, b-flash ,, a-lite');
    vi.stubEnv('GEMINI_MODEL', 'p1');
    vi.stubEnv('GEMINI_FALLBACK_MODELS', 'p2,p1');
    const m = await load();
    expect(m.GEMINI_FREE_MODELS).toEqual(['a-lite', 'b-flash']);
    expect(m.geminiModelChain()).toEqual(['p1', 'p2']);
  });

  it('sem chave gratuita, só a camada paga existe (como antes)', async () => {
    vi.stubEnv('GEMINI_API_KEY_FREE', '');
    const m = await load();
    const tiers = m.buildAiTiers(fakeClient());
    expect(tiers.map(t => t.name)).toEqual(['paid']);
  });

  it('com chave gratuita, a gratuita vem antes da paga', async () => {
    vi.stubEnv('GEMINI_API_KEY_FREE', 'chave-de-teste');
    const m = await load();
    const tiers = m.buildAiTiers(fakeClient());
    expect(tiers.map(t => t.name)).toEqual(['free', 'paid']);
  });
});

describe('classificação dos erros', () => {
  it('cota, modelo sumido, fora do ar e rede: próximo modelo', async () => {
    const m = await load();
    for (const e of [QUOTA_MINUTE, QUOTA_DAY, MODEL_GONE, { status: 503 }, new Error('fetch failed')]) {
      expect(m.shouldTryNextModel(e)).toBe(true);
    }
  });

  it('crédito, chave inválida e pedido inválido: não adianta outro modelo da mesma chave', async () => {
    const m = await load();
    expect(m.isAiBillingError(PREPAY_DEPLETED)).toBe(true);
    expect(m.isKeyError(BAD_KEY)).toBe(true);
    expect(m.isKeyError({ status: 403, message: 'PERMISSION_DENIED' })).toBe(true);
    for (const e of [PREPAY_DEPLETED, BAD_KEY, BAD_REQUEST]) {
      expect(m.shouldTryNextModel(e)).toBe(false);
    }
  });

  it('tempo de pausa: cota do dia 1h, por minuto o que o Google pedir, modelo inexistente 6h', async () => {
    const m = await load();
    expect(m.cooldownMsFor(QUOTA_DAY)).toBe(60 * 60 * 1000);
    expect(m.cooldownMsFor(QUOTA_MINUTE)).toBe(37 * 1000);
    expect(m.cooldownMsFor(MODEL_GONE)).toBe(6 * 60 * 60 * 1000);
    expect(m.cooldownMsFor({ status: 429, message: 'Resource has been exhausted' })).toBe(60 * 1000);
  });
});

describe('generateWithFallback: gratuito primeiro, pago no fim', () => {
  const setup = async (freeBehavior: Record<string, any>, paidBehavior: Record<string, any> = {}) => {
    const m = await load();
    m.resetAiCooldowns();
    const free = fakeClient(freeBehavior);
    const paid = fakeClient(paidBehavior);
    const tiers = [
      { name: 'free' as const, client: free, models: ['lite', 'flash'] },
      { name: 'paid' as const, client: paid, models: ['p1', 'p2'] }
    ];
    return { m, free, paid, tiers };
  };

  it('gratuito respondendo: a chave paga nem é tocada', async () => {
    const { m, free, paid, tiers } = await setup({});
    const r = await m.generateWithFallback(paid, { contents: 'x' }, { tiers });
    expect(r.model).toBe('lite@free');
    expect(r.tier).toBe('free');
    expect(free.calls).toEqual(['lite']);
    expect(paid.calls).toEqual([]);
  });

  it('primeiro gratuito esgotado: o segundo gratuito assume, com os mesmos parâmetros', async () => {
    const { m, free, paid, tiers } = await setup({ lite: QUOTA_DAY });
    const r = await m.generateWithFallback(paid, { contents: 'x', config: { t: 1 } }, { tiers });
    expect(r.model).toBe('flash@free');
    expect(r.response.echo).toMatchObject({ contents: 'x', config: { t: 1 }, model: 'flash' });
    expect(free.calls).toEqual(['lite', 'flash']);
    expect(paid.calls).toEqual([]);
  });

  it('todos os gratuitos esgotados: só aí vai para o pago', async () => {
    const { m, free, paid, tiers } = await setup({ lite: QUOTA_DAY, flash: QUOTA_MINUTE });
    const r = await m.generateWithFallback(paid, {}, { tiers });
    expect(r.model).toBe('p1@paid');
    expect(free.calls).toEqual(['lite', 'flash']);
    expect(paid.calls).toEqual(['p1']);
  });

  it('gratuito esgotado fica em pausa: a chamada seguinte nem tenta ele', async () => {
    const { m, free, paid, tiers } = await setup({ lite: QUOTA_DAY });
    let t = 1_000_000;
    const now = () => t;
    await m.generateWithFallback(paid, {}, { tiers, now });
    free.calls.length = 0;
    await m.generateWithFallback(paid, {}, { tiers, now });
    expect(free.calls).toEqual(['flash']); // o lite foi pulado

    t += 61 * 60 * 1000; // passou a pausa de 1h: volta a tentar
    free.calls.length = 0;
    await m.generateWithFallback(paid, {}, { tiers, now });
    expect(free.calls[0]).toBe('lite');
  });

  it('chave gratuita inválida: pula a camada inteira e usa a paga', async () => {
    const { m, free, paid, tiers } = await setup({ lite: BAD_KEY });
    const r = await m.generateWithFallback(paid, {}, { tiers });
    expect(r.model).toBe('p1@paid');
    expect(free.calls).toEqual(['lite']);
  });

  it('resposta vazia (accept) conta como falha e passa para o próximo', async () => {
    const { m, paid, tiers } = await setup({ lite: 'empty' });
    const r = await m.generateWithFallback(paid, {}, { tiers, accept: (res: any) => !!res.text });
    expect(r.model).toBe('flash@free');
  });

  it('pago sem crédito depois dos gratuitos esgotados: mensagem clara', async () => {
    const { m, paid, tiers } = await setup({ lite: QUOTA_DAY, flash: QUOTA_DAY }, { p1: PREPAY_DEPLETED });
    await expect(m.generateWithFallback(paid, {}, { tiers })).rejects.toThrow('créditos da IA acabaram');
    expect(paid.calls).toEqual(['p1']);
  });

  it('pedido inválido na paga: para, sem queimar os outros modelos pagos', async () => {
    const { m, paid, tiers } = await setup({ lite: QUOTA_DAY, flash: QUOTA_DAY }, { p1: BAD_REQUEST });
    await expect(m.generateWithFallback(paid, {}, { tiers })).rejects.toMatchObject({ status: 400 });
    expect(paid.calls).toEqual(['p1']);
  });
});
