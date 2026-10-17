/**
 * Modelos do Gemini usados pelo app — num lugar só.
 *
 * Antes cada rota tinha o nome do modelo escrito à mão e a conciliação usava
 * `gemini-2.0-flash` como reserva. O Google desativou esse modelo (404 "no
 * longer available") e ninguém percebeu: a reserva estava morta. Quando os
 * créditos pré-pagos acabaram (402), as duas tentativas falharam e a tela só
 * dizia "A IA não retornou dados".
 *
 * Escolha (out/2026, conferida na tela de limites do AI Studio do projeto):
 * - Principal `gemini-2.5-flash`: é com ele que todos os prompts e esquemas de
 *   resposta foram ajustados (extratos, cupom, WhatsApp, chat) e continua
 *   ativo no projeto (1K RPM no plano pago).
 * - Reserva `gemini-3.8-flash`: o Flash mais novo do projeto (1K RPM), e o que
 *   o próprio Google indica na resposta de erro do modelo desativado.
 * - Fora: os Pro (3.1 Pro tem 25 RPM — pouco para o app inteiro — e são mais
 *   caros e lentos) e os Flash Lite (mais fracos para ler PDF de extrato).
 *
 * Os dois podem ser trocados SEM deploy de código, pelas variáveis de ambiente
 * GEMINI_MODEL e GEMINI_FALLBACK_MODEL na Vercel (valem no próximo deploy ou
 * redeploy) — quando o Google aposentar o 2.5, é só apontar para o novo.
 */

const clean = (value: string | undefined) => (value || '').trim();

export const GEMINI_PRIMARY_MODEL = clean(process.env.GEMINI_MODEL) || 'gemini-2.5-flash';
export const GEMINI_FALLBACK_MODEL = clean(process.env.GEMINI_FALLBACK_MODEL) || 'gemini-3.8-flash';

/** Principal e reserva, sem repetir (se as duas variáveis apontarem para o mesmo). */
export const geminiModelChain = (): string[] =>
  Array.from(new Set([GEMINI_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL].filter(Boolean)));

/**
 * Créditos pré-pagos esgotados (HTTP 402). É problema da conta de cobrança, não
 * do modelo: TODAS as chaves daquela conta param. Trocar de modelo não ajuda,
 * então a reserva nem é tentada.
 */
export const isAiBillingError = (err: any): boolean => {
  const status = Number(err?.status ?? err?.code ?? err?.error?.code);
  if (status === 402) return true;
  const text = String(err?.message || err || '').toLowerCase();
  return text.includes('prepayment credits') || text.includes('credits are depleted');
};

export const AI_BILLING_MESSAGE =
  'Os créditos da IA acabaram e a leitura automática está pausada. Avise o administrador do Zyvion para recarregar.';
