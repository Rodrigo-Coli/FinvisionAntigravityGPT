import { GoogleGenAI } from '@google/genai';

/**
 * Modelos do Gemini usados pelo app: GRATUITO primeiro, PAGO só no fim.
 *
 * Histórico: cada rota tinha o modelo escrito à mão e só a conciliação tinha
 * reserva (`gemini-2.0-flash`, desativado pelo Google — 404). Quando os
 * créditos pré-pagos acabaram (402) a tela só dizia "A IA não retornou dados".
 *
 * Como funciona agora — duas chaves, cada uma com a sua fila de modelos:
 *
 * 1. Chave GRATUITA (`GEMINI_API_KEY_FREE`, projeto do AI Studio SEM cobrança).
 *    Os modelos vão em ordem de cota (os que têm mais requisições por dia
 *    primeiro). Quando um esgota (429), passa ao próximo; o esgotado fica de
 *    fora por um tempo (ver `cooldown`) para não gastar uma tentativa a cada
 *    chamada. Chave inválida/sem permissão pula a camada inteira.
 * 2. Chave PAGA (`GEMINI_API_KEY`, projeto com pré-pagamento). Só é usada
 *    quando TODOS os gratuitos falharam. Crédito esgotado (402) aqui para tudo
 *    com a mensagem clara para o usuário.
 *
 * Sem `GEMINI_API_KEY_FREE`, tudo funciona como antes, só com a paga.
 *
 * Trocável SEM mexer no código (variáveis de ambiente na Vercel, valem no
 * próximo deploy/redeploy), listas separadas por vírgula:
 * - GEMINI_FREE_MODELS: fila da chave gratuita;
 * - GEMINI_MODEL + GEMINI_FALLBACK_MODELS: fila da chave paga.
 *
 * Nome de modelo errado ou que sumir não quebra nada: dá 404 e a fila segue.
 */

const clean = (value: string | undefined) => (value || '').trim();
const list = (value: string | undefined) => clean(value).split(',').map(m => m.trim()).filter(Boolean);
const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

/**
 * Fila gratuita padrão: os Flash Lite primeiro (são os de cota maior — 4K RPM
 * contra 1K dos Flash na tela de limites do projeto), depois os Flash.
 */
const DEFAULT_FREE_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-3-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash'
];

/** Fila paga padrão: o 2.5 Flash (prompts ajustados para ele) e os Flash 3.x. */
const DEFAULT_PAID_PRIMARY = 'gemini-2.5-flash';
const DEFAULT_PAID_FALLBACKS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3-flash',
  'gemini-2.5-flash-lite'
];

export const GEMINI_PRIMARY_MODEL = clean(process.env.GEMINI_MODEL) || DEFAULT_PAID_PRIMARY;
export const GEMINI_FALLBACK_MODELS: string[] = list(process.env.GEMINI_FALLBACK_MODELS).length
  ? list(process.env.GEMINI_FALLBACK_MODELS)
  : DEFAULT_PAID_FALLBACKS;
export const GEMINI_FREE_MODELS: string[] = list(process.env.GEMINI_FREE_MODELS).length
  ? unique(list(process.env.GEMINI_FREE_MODELS))
  : DEFAULT_FREE_MODELS;

/** Fila da chave paga: principal + reservas, em ordem e sem repetir. */
export const geminiModelChain = (): string[] => unique([GEMINI_PRIMARY_MODEL, ...GEMINI_FALLBACK_MODELS]);

// ---------------------------------------------------------------------------
// Classificação dos erros do Gemini
// ---------------------------------------------------------------------------

const statusOf = (err: any): number => Number(err?.status ?? err?.code ?? err?.error?.code);
const textOf = (err: any): string => String(err?.message || err || '');

/** Créditos pré-pagos esgotados (402): problema da conta, não do modelo. */
export const isAiBillingError = (err: any): boolean => {
  if (statusOf(err) === 402) return true;
  const text = textOf(err).toLowerCase();
  return text.includes('prepayment credits') || text.includes('credits are depleted');
};

/** Cota do modelo estourada (por minuto ou por dia). */
export const isQuotaError = (err: any): boolean =>
  statusOf(err) === 429 || /resource.?exhausted|quota/i.test(textOf(err));

/** Chave inválida, sem permissão ou API desligada no projeto: vale para a chave toda. */
export const isKeyError = (err: any): boolean => {
  const status = statusOf(err);
  const text = textOf(err).toLowerCase();
  return status === 401 || status === 403
    || text.includes('api key not valid') || text.includes('api_key_invalid')
    || text.includes('permission_denied') || text.includes('has not been used in project');
};

/**
 * Vale tentar o próximo modelo da MESMA chave? Sim quando o problema é daquele
 * modelo: cota (429), desativado/nome errado (404), fora do ar (5xx), tempo
 * esgotado (408) ou falha de rede sem status. Pedido inválido (400) falharia
 * igual em todos.
 */
export const shouldTryNextModel = (err: any): boolean => {
  if (isAiBillingError(err) || isKeyError(err)) return false;
  const status = statusOf(err);
  if (!Number.isFinite(status) || status === 0) return true;
  return status === 404 || status === 408 || status === 429 || status >= 500;
};

export const AI_BILLING_MESSAGE =
  'Os créditos da IA acabaram e a leitura automática está pausada. Avise o administrador do Zyvion para recarregar.';

// ---------------------------------------------------------------------------
// Pausa dos modelos gratuitos esgotados
// ---------------------------------------------------------------------------
//
// A cota gratuita por DIA zera à meia-noite do Pacífico; a por MINUTO, em
// segundos. Sem a pausa, cada chamada gastaria uma tentativa em cada modelo
// já esgotado antes de chegar num que responde. A memória vale enquanto a
// instância da função estiver quente — instância nova simplesmente tenta de
// novo, sem prejuízo.

const cooldownUntil = new Map<string, number>();

/** Quanto tempo deixar o modelo de fora depois de um erro. */
export const cooldownMsFor = (err: any): number => {
  const text = textOf(err);
  if (statusOf(err) === 404) return 6 * 60 * 60 * 1000; // não existe nesse projeto
  if (/per.?day|daily/i.test(text)) return 60 * 60 * 1000; // cota do dia: reconfere de hora em hora
  const retry = text.match(/retry(?:Delay)?["\s:]*["']?(\d+(?:\.\d+)?)s/i);
  if (retry) return Math.min(Math.ceil(Number(retry[1]) * 1000), 10 * 60 * 1000);
  return 60 * 1000;
};

export const resetAiCooldowns = () => cooldownUntil.clear();

const isCoolingDown = (key: string, now: number) => (cooldownUntil.get(key) || 0) > now;

// ---------------------------------------------------------------------------
// Chamada com as duas filas
// ---------------------------------------------------------------------------

export interface GenerateCapable {
  models: { generateContent: (params: any) => Promise<any> };
}

export interface AiTier {
  name: 'free' | 'paid';
  client: GenerateCapable;
  models: string[];
}

let freeClient: GenerateCapable | null = null;
const getFreeClient = (): GenerateCapable | null => {
  const key = clean(process.env.GEMINI_API_KEY_FREE);
  if (!key) return null;
  if (!freeClient) freeClient = new GoogleGenAI({ apiKey: key });
  return freeClient;
};

/** Camadas na ordem de uso: gratuita (se houver chave) e paga (o cliente da rota). */
export const buildAiTiers = (paidClient: GenerateCapable): AiTier[] => {
  const tiers: AiTier[] = [];
  const free = getFreeClient();
  if (free) tiers.push({ name: 'free', client: free, models: GEMINI_FREE_MODELS });
  tiers.push({ name: 'paid', client: paidClient, models: geminiModelChain() });
  return tiers;
};

export interface GenerateOptions {
  /** Resposta aproveitável? Se não (ex.: texto vazio), tenta o próximo modelo. */
  accept?: (response: any) => boolean;
  /** Para testes: camadas prontas em vez das variáveis de ambiente. */
  tiers?: AiTier[];
  now?: () => number;
}

/**
 * `ai.models.generateContent` com as duas filas. Recebe os mesmos parâmetros,
 * sem o `model`; `ai` é o cliente da chave paga que a rota já cria. Devolve a
 * resposta e o rótulo do modelo que respondeu (`gemini-x@free` / `@paid`) para
 * o registro de uso.
 */
export async function generateWithFallback<T = any>(
  ai: GenerateCapable,
  params: Record<string, any>,
  options: GenerateOptions = {}
): Promise<{ response: T; model: string; tier: 'free' | 'paid' }> {
  const tiers = options.tiers || buildAiTiers(ai);
  const now = options.now || Date.now;
  let lastError: any = null;

  for (const tier of tiers) {
    for (const model of tier.models) {
      const key = `${tier.name}:${model}`;
      // Só a camada gratuita pula modelo em pausa: a paga é o último recurso.
      if (tier.name === 'free' && isCoolingDown(key, now())) continue;

      try {
        const response = await tier.client.models.generateContent({ ...params, model });
        if (options.accept && !options.accept(response)) {
          lastError = new Error(`O modelo ${model} devolveu uma resposta vazia.`);
          continue;
        }
        return { response, model: `${model}@${tier.name}`, tier: tier.name };
      } catch (err) {
        lastError = err;
        console.error(`[IA] Falha no modelo ${model} (${tier.name === 'free' ? 'gratuito' : 'pago'}):`, err);

        if (isAiBillingError(err)) {
          if (tier.name === 'paid') {
            throw Object.assign(new Error(AI_BILLING_MESSAGE), { cause: err, status: 402 });
          }
          break; // camada gratuita sem crédito (não deveria acontecer): vai para a paga
        }
        if (isKeyError(err)) break; // chave desta camada não serve: próxima camada
        if (tier.name === 'free' && (isQuotaError(err) || statusOf(err) === 404)) {
          cooldownUntil.set(key, now() + cooldownMsFor(err));
        }
        if (shouldTryNextModel(err)) continue;
        // Pedido inválido (400): na gratuita pode ser limitação daquele
        // projeto/modelo, então ainda vale a camada paga; na paga, para.
        if (tier.name === 'free') break;
        throw err;
      }
    }
  }

  throw lastError || new Error('Nenhum modelo de IA disponível.');
}
