import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import { recordAiUsage } from './ai-usage.js';
import { generateWithFallback } from './ai-models.js';
import { checkAiActionAllowed } from './ai-usage-limits.js';
import { requireUser } from './require-user.js';

/**
 * IA do Simulador de Consórcio (Planejamento).
 *
 * Entende o pedido (escrito ou falado) e devolve SÓ PARÂMETROS da simulação
 * (cotas, lances, premissas) em JSON. Não calcula nada — as contas são do
 * motor do app (lib/consortiumSimulator.ts) — e não lê nem grava dados do
 * usuário: o contexto (cotas cadastradas e simulação atual) vem da própria
 * tela. A única escrita é o registro de uso de IA, como em toda IA do app.
 */

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const MAX_MESSAGE = 2000;
const MAX_CONTEXT = 24000;

export const CONSORTIUM_SIM_SYSTEM_PROMPT = `Você é o assistente do Simulador de Consórcio do Zyvion. O usuário descreve (por texto ou voz) o que quer simular; você devolve os PARÂMETROS da simulação em JSON. Você NÃO calcula valores: o app calcula tudo com precisão a partir dos parâmetros.

COMO O APP CALCULA (para escolher parâmetros certos):
- Plano = % da carta: 100% + taxa de administração total + fundo de reserva, dividido pelo prazo; corrigido pelo reajuste anual.
- Cota nova: carta (credit), prazo em meses (termMonths), taxa de adm total % (adminFeePct), fundo de reserva % (reserveFundPct), parcela até contemplar em % da integral (reducedPct; 100 = cheia).
- Cota existente ("minha"): use source = id da cota cadastrada; o app usa o saldo, as parcelas restantes e a parcela de hoje do cadastro. Só mande balance/remainingMonths/currentInstallment se o usuário pedir outro valor.
- Lance: freeBid = do bolso; embeddedBid = embutido (sai da carta). bidUnit: "PCT" (% da carta), "BRL" (reais) ou "INST" (nº de parcelas do plano-base; então informe baseTermMonths = prazo original do grupo). bidMode: "REDUCE_INSTALLMENT" (reduz parcela) ou "REDUCE_TERM" (reduz prazo).
- contemplationInMonths: daqui a quantos meses contempla (1 = próxima assembleia).
- Premissas (premises): indexPct = reajuste anual %, insurancePct = seguro prestamista % ao mês sobre o saldo, opportunityPct = rendimento líquido do dinheiro % ao ano.

REGRAS:
- Responda SEMPRE com o JSON do schema. "reply" em português do Brasil, curto e claro: o que você montou ou mudou e as suposições que fez (ex.: "usei 24% de taxa como nas suas cotas Ademicon").
- Se o pedido muda a simulação, devolva em "quotas" a LISTA COMPLETA de cotas como deve ficar (inclua as que continuam, com os mesmos nomes/source, para não perder edições). Se for só uma pergunta, não mande "quotas".
- Use os PADRÕES do usuário: se ele fala de uma administradora que ele já tem (ex.: Ademicon), copie taxa de adm, fundo de reserva e prazo-base das cotas dele dessa administradora, a menos que ele diga outros números.
- "Lance de 60 embutidas e 72 pagas" na Ademicon = bidUnit "INST", baseTermMonths 240 (ou o prazo-base que ele informar), embeddedBid 60, freeBid 72.
- Nunca invente saldo de cota existente. Se faltar um número essencial de cota nova (ex.: valor da carta), use um valor razoável e diga no reply que ele pode ajustar.
- Valores em reais como número (171789.09), percentuais como número (24 = 24%).
- Máximo de 12 cotas.`;

export interface ConsortiumSimRequest {
  message: string;
  history?: { role: 'user' | 'assistant'; text: string }[];
  state?: unknown;     // simulação atual (cotas e premissas) com resultados resumidos
  known?: unknown;     // cotas cadastradas do usuário (resumo)
  today?: string;
}

export function buildConsortiumSimPrompt(body: ConsortiumSimRequest): string {
  const history = (Array.isArray(body.history) ? body.history : []).slice(-6)
    .map(h => `${h.role === 'assistant' ? 'Assistente' : 'Usuário'}: ${String(h.text || '').slice(0, 600)}`).join('\n');
  const context = JSON.stringify({ cotasCadastradas: body.known ?? [], simulacaoAtual: body.state ?? {} }).slice(0, MAX_CONTEXT);
  return [
    `Hoje: ${body.today || new Date().toISOString().slice(0, 10)}. Referências: CDI 13,65% a.a., Selic 13,75% a.a., INCC 12m 6,66% (set/2026).`,
    `CONTEXTO (JSON): ${context}`,
    history ? `CONVERSA ANTERIOR:\n${history}` : '',
    `PEDIDO DO USUÁRIO: ${String(body.message || '').slice(0, MAX_MESSAGE)}`
  ].filter(Boolean).join('\n\n');
}

const quotaSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    source: { type: Type.STRING },
    credit: { type: Type.NUMBER },
    termMonths: { type: Type.NUMBER },
    adminFeePct: { type: Type.NUMBER },
    reserveFundPct: { type: Type.NUMBER },
    reducedPct: { type: Type.NUMBER },
    balance: { type: Type.NUMBER },
    remainingMonths: { type: Type.NUMBER },
    currentInstallment: { type: Type.NUMBER },
    bidUnit: { type: Type.STRING, enum: ['PCT', 'BRL', 'INST'] },
    baseTermMonths: { type: Type.NUMBER },
    freeBid: { type: Type.NUMBER },
    embeddedBid: { type: Type.NUMBER },
    contemplationInMonths: { type: Type.NUMBER },
    bidMode: { type: Type.STRING, enum: ['REDUCE_INSTALLMENT', 'REDUCE_TERM'] }
  }
};

export const CONSORTIUM_SIM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    premises: {
      type: Type.OBJECT,
      properties: { indexPct: { type: Type.NUMBER }, insurancePct: { type: Type.NUMBER }, opportunityPct: { type: Type.NUMBER } }
    },
    quotas: { type: Type.ARRAY, items: quotaSchema }
  },
  required: ['reply']
};

/** Lê o JSON da IA sem confiar no formato: só passa o que tem o tipo certo. */
export function parseConsortiumSimResponse(raw: string): { reply: string; premises?: any; quotas?: any[] } {
  const clean = String(raw || '').replace(/```json|```/g, '').trim();
  const data = JSON.parse(clean);
  const out: { reply: string; premises?: any; quotas?: any[] } = {
    reply: typeof data?.reply === 'string' && data.reply.trim() ? data.reply.trim() : 'Simulação atualizada.'
  };
  if (data?.premises && typeof data.premises === 'object') out.premises = data.premises;
  if (Array.isArray(data?.quotas)) out.quotas = data.quotas.filter((q: any) => q && typeof q === 'object').slice(0, 12);
  return out;
}

export async function handleConsortiumSimAi(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;

  const body: ConsortiumSimRequest = req.body || {};
  if (!body.message || typeof body.message !== 'string' || !body.message.trim()) {
    return res.status(400).json({ error: 'Escreva o que você quer simular.' });
  }

  try {
    const limitCheck = await checkAiActionAllowed(supabase, user.id, 'consortium_sim');
    if (!limitCheck.allowed) return res.status(429).json({ error: limitCheck.message, limitReached: true });

    const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');
    const ai = new GoogleGenAI({ apiKey: geminiKey });

    const { response, model } = await generateWithFallback(ai, {
      contents: [{ parts: [{ text: buildConsortiumSimPrompt(body) }] }],
      config: {
        systemInstruction: CONSORTIUM_SIM_SYSTEM_PROMPT,
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: CONSORTIUM_SIM_SCHEMA
      }
    });
    await recordAiUsage(supabase, 'consortium_sim', user.id, response, model);

    const rawText = (response as any).text || (response as any).candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!rawText) throw new Error('IA não retornou conteúdo.');
    return res.status(200).json(parseConsortiumSimResponse(rawText));
  } catch (err: any) {
    console.error('[SimuladorConsorcio IA] Erro:', err?.message);
    const status = err?.status === 402 ? 402 : 500;
    return res.status(status).json({ error: status === 402 ? err.message : 'Não consegui montar a simulação agora. Tente de novo em instantes.' });
  }
}
