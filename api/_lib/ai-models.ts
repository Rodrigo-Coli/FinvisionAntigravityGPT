/**
 * Modelos do Gemini usados pelo app — num lugar só, com uma fila de reservas.
 *
 * Antes cada rota tinha o nome do modelo escrito à mão e só a conciliação
 * tinha reserva — `gemini-2.0-flash`, que o Google desativou (404 "no longer
 * available") sem ninguém perceber. Quando os créditos pré-pagos acabaram
 * (402), as duas tentativas falharam e a tela só dizia "A IA não retornou
 * dados".
 *
 * Cada modelo tem a SUA cota por minuto/dia no projeto (tela de limites do AI
 * Studio). Por isso a fila: se um modelo bate o limite (429), está fora do ar
 * (5xx) ou foi desativado (404), o próximo assume e o usuário nem percebe.
 *
 * Ordem (out/2026, conferida na tela de limites do projeto):
 * 1. `gemini-2.5-flash` — com ele foram ajustados todos os prompts e esquemas
 *    de resposta (extratos, cupom, WhatsApp, chat). 1K RPM.
 * 2. `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`,
 *    `gemini-3-flash` — os Flash mais novos, 1K RPM cada. O 3.8 é o que o
 *    próprio Google indica na resposta de erro do modelo desativado.
 * 3. `gemini-2.5-flash-lite` — último recurso: mais fraco para PDF, mas 4K RPM
 *    e melhor do que falhar.
 * Fora: os Pro (3.1 Pro tem 25 RPM, mais caros e lentos).
 *
 * Nome errado ou modelo que sumir não quebra nada: dá 404 e a fila segue.
 *
 * Trocável SEM mexer no código, pelas variáveis de ambiente na Vercel (valem
 * no próximo deploy/redeploy):
 * - GEMINI_MODEL: o principal;
 * - GEMINI_FALLBACK_MODELS: as reservas, em ordem, separadas por vírgula.
 */

const clean = (value: string | undefined) => (value || '').trim();

const DEFAULT_PRIMARY = 'gemini-2.5-flash';
const DEFAULT_FALLBACKS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3-flash',
  'gemini-2.5-flash-lite'
];

export const GEMINI_PRIMARY_MODEL = clean(process.env.GEMINI_MODEL) || DEFAULT_PRIMARY;

const envFallbacks = clean(process.env.GEMINI_FALLBACK_MODELS)
  .split(',')
  .map(m => m.trim())
  .filter(Boolean);

export const GEMINI_FALLBACK_MODELS: string[] = envFallbacks.length ? envFallbacks : DEFAULT_FALLBACKS;

/** Principal + reservas, em ordem e sem repetir. */
export const geminiModelChain = (): string[] =>
  Array.from(new Set([GEMINI_PRIMARY_MODEL, ...GEMINI_FALLBACK_MODELS].filter(Boolean)));

const statusOf = (err: any): number => Number(err?.status ?? err?.code ?? err?.error?.code);

/**
 * Créditos pré-pagos esgotados (HTTP 402). É problema da conta de cobrança, não
 * do modelo: TODAS as chaves daquela conta param. Trocar de modelo não ajuda,
 * então a fila para aí.
 */
export const isAiBillingError = (err: any): boolean => {
  if (statusOf(err) === 402) return true;
  const text = String(err?.message || err || '').toLowerCase();
  return text.includes('prepayment credits') || text.includes('credits are depleted');
};

/**
 * Vale tentar o próximo modelo? Sim quando o problema é DAQUELE modelo:
 * cota estourada (429), desativado/nome errado (404), fora do ar (5xx) ou
 * falha de rede sem status. Pedido inválido (400) ou chave sem permissão
 * (401/403) falhariam igual em todos — aí para.
 */
export const shouldTryNextModel = (err: any): boolean => {
  if (isAiBillingError(err)) return false;
  const status = statusOf(err);
  if (!Number.isFinite(status) || status === 0) return true;
  return status === 404 || status === 408 || status === 429 || status >= 500;
};

export const AI_BILLING_MESSAGE =
  'Os créditos da IA acabaram e a leitura automática está pausada. Avise o administrador do Zyvion para recarregar.';

interface GenerateCapable {
  models: { generateContent: (params: any) => Promise<any> };
}

/**
 * `ai.models.generateContent` com a fila de modelos. Recebe os mesmos
 * parâmetros, sem o `model`, e devolve a resposta junto com o modelo que
 * respondeu (para o registro de uso).
 */
export async function generateWithFallback<T = any>(
  ai: GenerateCapable,
  params: Record<string, any>,
  chain: string[] = geminiModelChain()
): Promise<{ response: T; model: string }> {
  let lastError: any = null;
  for (const model of chain) {
    try {
      const response = await ai.models.generateContent({ ...params, model });
      return { response, model };
    } catch (err) {
      lastError = err;
      console.error(`[IA] Falha no modelo ${model}:`, err);
      if (isAiBillingError(err)) {
        throw Object.assign(new Error(AI_BILLING_MESSAGE), { cause: err, status: 402 });
      }
      if (!shouldTryNextModel(err)) throw err;
    }
  }
  throw lastError || new Error('Nenhum modelo de IA disponível.');
}
