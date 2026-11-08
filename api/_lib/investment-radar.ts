import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import webpush from 'web-push';
import { recordAiUsage } from './ai-usage.js';
import { generateWithFallback } from './ai-models.js';
import { checkAiActionAllowed } from './ai-usage-limits.js';
import { requireUser } from './require-user.js';
import { isCronAuthorized } from './cron-auth.js';
import { handleCurveAction } from './curve-projection.js';
import { handleCouponAction } from './coupon-forecast.js';
import {
  evaluateAsset, issuerOf, monthlyFromAnnual, nextCheckAt, shouldNotify, LEVEL_LABEL,
  type LedgerMovement, type NewsAssessment, type RadarAsset, type RadarEvaluation, type RadarLevel
} from '../../lib/investmentRadar.js';

// Radar de Investimentos (servidor).
//
// POST /api/investment-radar
//   { action: 'scan', assetId? }       → analisa agora (todos ou um investimento)
//   { action: 'compare', file, note }  → lê o print/PDF de uma sugestão do banco
//                                         e compara com a carteira
// Cron (daily-cron): runInvestmentRadarCron — checa só o que está vencido
//   (OK a cada 7 dias; Atenção/Urgente todo dia) e avisa no WhatsApp/push
//   quando algo vira URGENTE.
//
// As regras de nível ficam em lib/investmentRadar.ts. Aqui só se junta os
// dados (extrato do ativo, CDI do Banco Central, notícias do emissor pela IA
// com busca na internet) e se grava o resultado em investment_radar.

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

const stripQuotes = (v: string) => (/^['"].*['"]$/.test(v) ? v.slice(1, -1) : v);
const vapidPub = stripQuotes(process.env.VAPID_PUBLIC_KEY || '');
const vapidPriv = stripQuotes(process.env.VAPID_PRIVATE_KEY || '');
if (vapidPub && vapidPriv) {
  try { webpush.setVapidDetails('mailto:suporte@finvision.com.br', vapidPub, vapidPriv); } catch { /* sem push */ }
}

/** Quantos emissores a IA consulta por rodada (custo e tempo da função). */
const MAX_NEWS_ISSUERS_MANUAL = 12;
const MAX_NEWS_ISSUERS_CRON = 4;
/** Quantos investimentos a varredura diária checa no máximo por rodada. */
const MAX_CRON_ASSETS = 60;
/**
 * Tempo máximo da varredura diária. O radar roda por último no daily-cron;
 * passado esse tempo ele para e o resto fica para o dia seguinte (o que não
 * foi checado continua "vencido" e entra primeiro na próxima rodada).
 */
const CRON_TIME_BUDGET_MS = 40_000;

const todayStr = () => new Date().toISOString().slice(0, 10);
const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ---------------------------------------------------------------------------
// CDI mês a mês (Banco Central, série 4391 = CDI acumulado no mês, % a.m.)
// ---------------------------------------------------------------------------

let cdiCache: { at: number; byMonth: Map<string, number> } | null = null;

async function loadCdiByMonth(): Promise<Map<string, number>> {
  if (cdiCache && Date.now() - cdiCache.at < 12 * 3600 * 1000) return cdiCache.byMonth;
  const byMonth = new Map<string, number>();
  try {
    const r = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.4391/dados/ultimos/14?formato=json');
    if (r.ok) {
      const rows = await r.json();
      for (const row of rows || []) {
        const [, mm, yyyy] = String(row.data || '').split('/');
        const v = Number(String(row.valor).replace(',', '.'));
        if (yyyy && mm && Number.isFinite(v)) byMonth.set(`${yyyy}-${mm}`, v / 100);
      }
    }
  } catch { /* sem rede: usa o CDI anual do usuário */ }
  cdiCache = { at: Date.now(), byMonth };
  return byMonth;
}

async function cdiResolver(userId: string): Promise<(month: string) => number> {
  const byMonth = await loadCdiByMonth();
  let annual = 14;
  try {
    const { data } = await supabase.from('user_settings').select('market_indexes').eq('user_id', userId).maybeSingle();
    const cdi = Number(data?.market_indexes?.cdi);
    if (cdi > 0) annual = cdi;
  } catch { /* padrão */ }
  const fallback = monthlyFromAnnual(annual);
  return (month: string) => byMonth.get(month) ?? fallback;
}

// ---------------------------------------------------------------------------
// Notícias do emissor (IA com busca na internet)
// ---------------------------------------------------------------------------

interface NewsResult extends NewsAssessment {
  sources: { title: string; url: string }[];
}

const NEWS_PROMPT = (issuer: string, products: string) => `Você é um analista de crédito brasileiro. Pesquise na internet notícias dos ÚLTIMOS 90 DIAS sobre o emissor/gestor "${issuer}" (produtos do investidor: ${products}).

Procure especificamente: recuperação judicial ou extrajudicial, calote/atraso de pagamento (default), renegociação de dívida, rebaixamento de rating, liquidação ou intervenção, fechamento ou resgates suspensos de fundo, fraude, troca de gestor, perdas relevantes.

Responda SÓ com um JSON, sem texto fora dele:
{"risk":"none|watch|severe","headline":"frase curta em português","events":["fato 1 com data","fato 2 com data"]}

Regras:
- "severe" SÓ para evento de crédito confirmado ou muito provável (recuperação judicial/extrajudicial, default, renegociação forçada com perda, rebaixamento forte de rating, liquidação, resgates suspensos).
- "watch" para notícia negativa relevante ainda sem evento de crédito (resultado ruim, alavancagem alta, rating em observação negativa).
- "none" se não houver nada relevante ou se não encontrar notícias confiáveis.
- Nunca invente fatos. Na dúvida, "none".`;

function parseJsonObject(text: string): any | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

async function fetchIssuerNews(ai: GoogleGenAI, userId: string, issuer: string, products: string, fn: string): Promise<NewsResult | null> {
  try {
    const { response, model } = await generateWithFallback(ai, {
      contents: [{ role: 'user', parts: [{ text: NEWS_PROMPT(issuer, products) }] }],
      config: { tools: [{ googleSearch: {} }], temperature: 0.1 }
    });
    await recordAiUsage(supabase, fn, userId, response, model);
    const raw: any = response;
    const text = raw.text || raw.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
    const parsed = parseJsonObject(text);
    if (!parsed) return null;
    const risk = ['none', 'watch', 'severe'].includes(parsed.risk) ? parsed.risk : 'none';
    const chunks = raw.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks
      .map((c: any) => ({ title: String(c?.web?.title || ''), url: String(c?.web?.uri || '') }))
      .filter((s: any) => s.url)
      .slice(0, 6);
    // Sem fonte nenhuma, uma notícia "grave" não é confiável o bastante: rebaixa para acompanhar.
    const safeRisk = risk === 'severe' && sources.length === 0 ? 'watch' : risk;
    return {
      risk: safeRisk,
      headline: String(parsed.headline || '').slice(0, 300),
      events: Array.isArray(parsed.events) ? parsed.events.map((e: any) => String(e).slice(0, 300)).slice(0, 5) : [],
      sources
    };
  } catch (err: any) {
    console.warn('[InvestmentRadar] notícias falharam para', issuer, err?.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

async function sendWhatsApp(number: string, text: string) {
  const base = process.env.EVOLUTION_API_URL;
  if (!base || !process.env.EVOLUTION_API_KEY || !process.env.EVOLUTION_INSTANCE) return;
  try {
    await fetch(`${base.replace(/\/$/, '')}/message/sendText/${process.env.EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_API_KEY as string },
      body: JSON.stringify({ number, text, options: { delay: 1200, presence: 'composing' }, textMessage: { text } })
    });
  } catch (err) {
    console.error('[InvestmentRadar] WhatsApp falhou:', err);
  }
}

async function notifyUrgent(userId: string, items: { name: string; evaluation: RadarEvaluation }[]) {
  if (items.length === 0) return;
  const { data: settings } = await supabase
    .from('user_settings')
    .select('whatsapp_enabled, whatsapp_number, push_enabled, push_subscription')
    .eq('user_id', userId)
    .maybeSingle();
  if (!settings) return;

  let msg = `*Zyvion* 🚨 *Radar de Investimentos*\n${items.length === 1 ? 'Um investimento pede' : `${items.length} investimentos pedem`} sua atenção urgente:\n\n`;
  for (const { name, evaluation } of items) {
    msg += `• *${name}*\n`;
    for (const s of evaluation.signals.filter(x => x.severity !== 'info')) msg += `  └─ ${s.label}: ${s.detail}\n`;
    msg += `  └─ 💰 ${evaluation.exit.note}\n\n`;
  }
  msg += 'Abra Patrimônio › Investimentos › Radar para ver as fontes e decidir. Nada é feito sem você.';

  if (settings.whatsapp_enabled && settings.whatsapp_number) await sendWhatsApp(settings.whatsapp_number, msg);
  if (settings.push_enabled && settings.push_subscription && vapidPub && vapidPriv) {
    try {
      await webpush.sendNotification(settings.push_subscription, JSON.stringify({
        title: 'Zyvion 🚨 Radar de Investimentos',
        body: items.length === 1 ? `${items[0].name}: avalie a saída.` : `${items.length} investimentos pedem atenção urgente.`,
        url: '/#/assets?view=investments&radar=1'
      }));
    } catch (err: any) {
      console.warn('[InvestmentRadar] push falhou:', err?.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Varredura
// ---------------------------------------------------------------------------

function recommendationFor(level: RadarLevel, evaluation: RadarEvaluation): string {
  if (level === 'URGENTE') {
    return `Avalie a saída. ${evaluation.exit.note} Converse com o gerente antes de decidir e veja as fontes abaixo.`;
  }
  if (level === 'ATENCAO') {
    return 'Acompanhe. Ainda não há confirmação suficiente para sugerir a saída; o radar volta a checar todo dia.';
  }
  return 'Nada a fazer agora. O radar checa de novo em 7 dias.';
}

interface ScanOptions {
  assetIds?: string[];
  onlyDue?: boolean;
  maxNewsIssuers: number;
  aiFn: string;
  notify: boolean;
}

export async function scanUser(userId: string, opts: ScanOptions) {
  const now = new Date();
  const today = todayStr();

  const { data: assetsRaw } = await supabase
    .from('physical_assets')
    .select('id, name, estimated_value, acquisition_date, metadata')
    .eq('user_id', userId)
    .eq('category', 'INVESTMENT')
    .eq('is_archived', false);
  const active = (assetsRaw || []).filter((a: any) => a.metadata?.status !== 'RESGATADO' && Number(a.estimated_value) > 0) as RadarAsset[];
  if (active.length === 0) return { checked: 0, results: [] as any[] };

  const { data: radarRows } = await supabase.from('investment_radar').select('asset_id, level, notified_at, next_check_at, history').eq('user_id', userId);
  const prevByAsset = new Map((radarRows || []).map((r: any) => [r.asset_id, r]));

  let targets = active;
  if (opts.assetIds?.length) targets = targets.filter(a => opts.assetIds!.includes(a.id));
  if (opts.onlyDue) {
    targets = targets.filter(a => {
      const prev: any = prevByAsset.get(a.id);
      return !prev?.next_check_at || Date.parse(prev.next_check_at) <= now.getTime();
    });
  }
  if (targets.length === 0) return { checked: 0, results: [] as any[] };

  const totalInvested = active.reduce((s, a) => s + Number(a.estimated_value || 0), 0);
  const byIssuer = new Map<string, RadarAsset[]>();
  for (const a of active) {
    const key = issuerOf(a).toLowerCase();
    byIssuer.set(key, [...(byIssuer.get(key) || []), a]);
  }

  const { data: movementsRaw } = await supabase
    .from('investment_movements')
    .select('asset_id, movement_type, amount, movement_date, notes')
    .in('asset_id', targets.map(a => a.id))
    .eq('is_projected', false);
  const movementsByAsset = new Map<string, LedgerMovement[]>();
  for (const m of movementsRaw || []) {
    movementsByAsset.set(m.asset_id, [...(movementsByAsset.get(m.asset_id) || []), m as LedgerMovement]);
  }

  const cdi = await cdiResolver(userId);

  // Notícias: um pedido por emissor, priorizando os de maior valor.
  const newsByIssuer = new Map<string, NewsResult | null>();
  const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (geminiKey && opts.maxNewsIssuers > 0) {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const issuersToCheck = Array.from(new Set(targets.map(a => issuerOf(a).toLowerCase())))
      .map(key => ({ key, assets: byIssuer.get(key) || [] }))
      .sort((x, y) => y.assets.reduce((s, a) => s + Number(a.estimated_value), 0) - x.assets.reduce((s, a) => s + Number(a.estimated_value), 0))
      .slice(0, opts.maxNewsIssuers);
    for (const { key, assets } of issuersToCheck) {
      const products = assets.map(a => `${a.name} (${a.metadata?.investmentType || 'investimento'})`).join('; ');
      newsByIssuer.set(key, await fetchIssuerNews(ai, userId, issuerOf(assets[0]), products, opts.aiFn));
    }
  }

  const urgentToNotify: { name: string; evaluation: RadarEvaluation }[] = [];
  const results: any[] = [];

  for (const asset of targets) {
    const issuerKey = issuerOf(asset).toLowerCase();
    const issuerTotal = (byIssuer.get(issuerKey) || []).reduce((s, a) => s + Number(a.estimated_value || 0), 0);
    const prev: any = prevByAsset.get(asset.id) || null;
    // Sem notícia nova nesta rodada, mantém a última avaliação de notícias (não "esquece" um alerta).
    const freshNews = newsByIssuer.has(issuerKey) ? newsByIssuer.get(issuerKey) : undefined;

    let news: NewsResult | null | undefined = freshNews;
    if (freshNews === undefined) {
      const { data: last } = await supabase.from('investment_radar').select('news, sources').eq('asset_id', asset.id).maybeSingle();
      news = last?.news ? { ...(last.news as any), sources: (last.sources as any) || [] } : null;
    }

    const evaluation = evaluateAsset({
      asset,
      movements: movementsByAsset.get(asset.id) || [],
      today,
      cdiMonthly: cdi,
      issuerShare: totalInvested > 0 ? issuerTotal / totalInvested : 0,
      news
    });

    const notify = opts.notify && shouldNotify(prev, evaluation.level, now);
    if (notify) urgentToNotify.push({ name: asset.name, evaluation });

    const history = [{ at: now.toISOString(), level: evaluation.level, score: evaluation.score }, ...((prev?.history as any[]) || [])].slice(0, 12);
    const row = {
      user_id: userId,
      asset_id: asset.id,
      level: evaluation.level,
      score: evaluation.score,
      signals: evaluation.signals,
      summary: evaluation.signals.filter(s => s.severity !== 'info').map(s => s.label).join(' · ') || 'Sem sinais de risco',
      recommendation: recommendationFor(evaluation.level, evaluation),
      exit_math: evaluation.exit,
      news: news ? { risk: news.risk, headline: news.headline, events: news.events } : null,
      sources: news?.sources || [],
      history,
      checked_at: now.toISOString(),
      next_check_at: nextCheckAt(evaluation.level, now),
      notified_at: notify ? now.toISOString() : prev?.notified_at || null
    };
    const { error } = await supabase.from('investment_radar').upsert(row, { onConflict: 'asset_id' });
    if (error) console.warn('[InvestmentRadar] gravar falhou:', error.message);
    results.push({ asset_id: asset.id, name: asset.name, level: evaluation.level, label: LEVEL_LABEL[evaluation.level], signals: evaluation.signals });
  }

  if (urgentToNotify.length) await notifyUrgent(userId, urgentToNotify);
  return { checked: results.length, results };
}

/** Rodada diária: só o que venceu a data de checagem, em todos os usuários com investimentos. */
export async function runInvestmentRadarCron(req: any, res: any) {
  if (!isCronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { data: owners } = await supabase
      .from('physical_assets')
      .select('user_id')
      .eq('category', 'INVESTMENT')
      .eq('is_archived', false);
    const userIds = Array.from(new Set((owners || []).map((o: any) => o.user_id)));
    let checked = 0;
    const started = Date.now();
    for (const userId of userIds) {
      if (checked >= MAX_CRON_ASSETS || Date.now() - started > CRON_TIME_BUDGET_MS) break;
      const r = await scanUser(userId, { onlyDue: true, maxNewsIssuers: MAX_NEWS_ISSUERS_CRON, aiFn: 'investment_radar_auto', notify: true });
      checked += r.checked;
    }
    return res.status(200).json({ success: true, users: userIds.length, checked });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Comparar sugestão do banco/gerente
// ---------------------------------------------------------------------------

const COMPARE_PROMPT = (portfolio: string, note: string) => `Você é um consultor de investimentos independente e conservador, falando com um investidor pessoa física brasileiro. Ele recebeu do banco/gerente a sugestão do arquivo anexo.${note ? `\nObservação dele: "${note}"` : ''}

Carteira atual dele:
${portfolio}

Faça em português, direto e honesto:
1. **O que é o produto sugerido**: emissor/gestor, tipo, indexador e taxa, prazo/vencimento, liquidez, garantia do FGC (sim/não), IR (isento ou tabela), taxas (administração, performance, corretagem/spread embutido) e risco de crédito.
2. **Comparação com o que ele já tem**: rentabilidade líquida de IR estimada lado a lado, risco, liquidez e concentração (se aumentaria exposição a um emissor que ele já tem).
3. **Veredito**: "Vale", "Não vale" ou "Depende" — e por quê, em 2 a 3 frases. Se for para trocar algo da carteira, diga o quê, e quanto custaria sair do atual (IR, preço de mercado, carência).
4. **Perguntas para fazer ao gerente** antes de decidir (no máximo 5).

Se faltar informação no arquivo, diga o que falta em vez de supor. Use R$ e % no formato brasileiro.
No fim, numa linha separada, escreva exatamente: VEREDITO: VALE ou VEREDITO: NAO_VALE ou VEREDITO: DEPENDE`;

async function portfolioSummary(userId: string): Promise<string> {
  const { data: assets } = await supabase
    .from('physical_assets')
    .select('name, estimated_value, metadata')
    .eq('user_id', userId)
    .eq('category', 'INVESTMENT')
    .eq('is_archived', false);
  return (assets || [])
    .filter((a: any) => a.metadata?.status !== 'RESGATADO' && Number(a.estimated_value) > 0)
    .map((a: any) => {
      const m = a.metadata || {};
      const rate = [m.interestType, m.yieldRate ? `${m.yieldRate}%` : ''].filter(Boolean).join(' ');
      return `- ${a.name}: ${brl(a.estimated_value)} (${m.investmentType || 'investimento'}${rate ? `, ${rate}` : ''}${m.vencimentoDate ? `, vence ${m.vencimentoDate}` : ''})`;
    })
    .join('\n') || '- (nenhum investimento cadastrado)';
}

const splitVerdict = (text: string) => {
  const verdictMatch = text.match(/VEREDITO:\s*(VALE|NAO_VALE|DEPENDE)/i);
  return {
    verdict: verdictMatch ? verdictMatch[1].toUpperCase() : 'DEPENDE',
    analysis: text.replace(/\n?VEREDITO:\s*(VALE|NAO_VALE|DEPENDE)\s*$/i, '').trim()
  };
};

const responseText = (raw: any): string =>
  raw?.text || raw?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';

export interface ProposalFile { data: string; mimeType: string; name?: string }
export type ProposalOutcome =
  | { ok: true; id: string | null; verdict: string; analysis: string }
  | { ok: false; status: number; error: string; limitReached?: boolean };

/** Lê a sugestão (print/PDF), compara com a carteira e guarda em investment_proposals. */
export async function analyzeProposal(userId: string, file: ProposalFile | null, note: string, channel: 'app' | 'whatsapp'): Promise<ProposalOutcome> {
  const hasFile = !!(file?.data && file?.mimeType);
  // Sem arquivo, vale a descrição em texto (ex.: "o gerente me ofereceu um CDB de 102% do CDI por 2 anos").
  if (!hasFile && String(note || '').trim().length < 15) return { ok: false, status: 400, error: 'Envie o print ou o PDF da sugestão (ou descreva o produto: tipo, taxa, prazo e emissor).' };
  if (hasFile && String(file!.data).length > 12_000_000) return { ok: false, status: 413, error: 'Arquivo grande demais (máx. ~8 MB).' };
  const limit = await checkAiActionAllowed(supabase, userId, 'investment_compare');
  if (!limit.allowed) return { ok: false, status: 429, error: limit.message || 'Limite atingido.', limitReached: true };
  const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!geminiKey) return { ok: false, status: 500, error: 'IA não configurada.' };
  const ai = new GoogleGenAI({ apiKey: geminiKey });
  try {
    const { response, model } = await generateWithFallback(ai, {
      contents: [{
        role: 'user',
        parts: hasFile
          ? [
              { inlineData: { mimeType: file!.mimeType, data: file!.data } },
              { text: COMPARE_PROMPT(await portfolioSummary(userId), String(note || '').slice(0, 500)) }
            ]
          : [
              { text: COMPARE_PROMPT(await portfolioSummary(userId), '').replace('a sugestão do arquivo anexo.', `esta sugestão, descrita por ele em mensagem: "${String(note).slice(0, 1500)}"`) }
            ]
      }],
      config: { temperature: 0.2 }
    });
    await recordAiUsage(supabase, 'investment_compare', userId, response, model);
    const text = responseText(response);
    if (!text) return { ok: false, status: 502, error: 'A IA não conseguiu ler o arquivo. Tente um print mais nítido.' };
    const { verdict, analysis } = splitVerdict(text);
    const { data: saved } = await supabase
      .from('investment_proposals')
      .insert({ user_id: userId, source_name: String(file?.name || (hasFile ? 'sugestão' : `descrição: ${String(note).slice(0, 80)}`)).slice(0, 200), user_note: note || null, verdict, analysis, channel })
      .select('id, created_at')
      .maybeSingle();
    return { ok: true, id: saved?.id || null, verdict, analysis };
  } catch (err: any) {
    console.error('[InvestmentRadar] comparar falhou:', err?.message);
    return { ok: false, status: 500, error: 'Não foi possível analisar agora. Tente de novo em instantes.' };
  }
}

const FOLLOWUP_PROMPT = (portfolio: string, original: string, thread: string, answer: string) => `Você é o mesmo consultor de investimentos independente e conservador. Antes você analisou uma sugestão do banco/gerente e listou perguntas para o investidor fazer. Agora ele trouxe a resposta do gerente.

Carteira atual dele:
${portfolio}

SUA ANÁLISE ANTERIOR:
${original}
${thread ? `\nCONVERSA ATÉ AQUI:\n${thread}\n` : ''}
RESPOSTA DO GERENTE AGORA (texto e/ou arquivo anexo):
${answer || '(veja o arquivo anexo)'}

Faça em português, direto:
1. **O que a resposta esclareceu** (e o que continua sem resposta).
2. **Muda o veredito?** Explique em 2 a 3 frases, com números quando houver.
3. **Próximo passo**: o que fazer agora (aceitar, recusar, negociar taxa/prazo, pedir mais algo — diga o quê).
No fim, numa linha separada, escreva exatamente: VEREDITO: VALE ou VEREDITO: NAO_VALE ou VEREDITO: DEPENDE`;

/**
 * Resposta do gerente a uma sugestão já analisada: reavalia com tudo o que já
 * foi dito (a análise e as respostas anteriores ficam guardadas em follow_ups)
 * e atualiza o veredito. Sem proposalId, usa a sugestão mais recente.
 */
export async function addManagerAnswer(userId: string, proposalId: string | null, answerText: string, file: ProposalFile | null, channel: 'app' | 'whatsapp'): Promise<ProposalOutcome & { sourceName?: string }> {
  if (!String(answerText || '').trim() && !file?.data) return { ok: false, status: 400, error: 'Escreva ou anexe a resposta do gerente.' };
  let query = supabase.from('investment_proposals').select('id, source_name, analysis, follow_ups, created_at').eq('user_id', userId);
  if (proposalId) query = query.eq('id', proposalId);
  const { data: rows } = await query.order('created_at', { ascending: false }).limit(1);
  const proposal: any = rows?.[0];
  if (!proposal) return { ok: false, status: 404, error: 'Não encontrei a sugestão. Mande primeiro o print ou o PDF do produto.' };

  const limit = await checkAiActionAllowed(supabase, userId, 'investment_compare');
  if (!limit.allowed) return { ok: false, status: 429, error: limit.message || 'Limite atingido.', limitReached: true };
  const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!geminiKey) return { ok: false, status: 500, error: 'IA não configurada.' };
  const ai = new GoogleGenAI({ apiKey: geminiKey });

  const previous: any[] = Array.isArray(proposal.follow_ups) ? proposal.follow_ups : [];
  const thread = previous.map((f: any, i: number) => `Resposta ${i + 1} do gerente: ${f.answer || '(arquivo)'}\nSua avaliação: ${f.analysis || ''}`).join('\n\n');
  try {
    const parts: any[] = [];
    if (file?.data && file?.mimeType) parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
    parts.push({ text: FOLLOWUP_PROMPT(await portfolioSummary(userId), proposal.analysis || '', thread, String(answerText || '').slice(0, 4000)) });
    const { response, model } = await generateWithFallback(ai, { contents: [{ role: 'user', parts }], config: { temperature: 0.2 } });
    await recordAiUsage(supabase, 'investment_compare', userId, response, model);
    const text = responseText(response);
    if (!text) return { ok: false, status: 502, error: 'A IA não conseguiu ler a resposta. Tente de novo.' };
    const { verdict, analysis } = splitVerdict(text);
    const followUps = [...previous, {
      at: new Date().toISOString(),
      channel,
      answer: String(answerText || '').slice(0, 4000) || null,
      file_name: file?.name || null,
      verdict,
      analysis
    }].slice(-20);
    await supabase.from('investment_proposals').update({ follow_ups: followUps, verdict }).eq('id', proposal.id);
    return { ok: true, id: proposal.id, verdict, analysis, sourceName: proposal.source_name };
  } catch (err: any) {
    console.error('[InvestmentRadar] resposta do gerente falhou:', err?.message);
    return { ok: false, status: 500, error: 'Não foi possível analisar agora. Tente de novo em instantes.' };
  }
}

export async function handleInvestmentRadar(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;
  const body = req.body || {};

  if (body.action === 'curve_refresh' || body.action === 'bank_value' || body.action === 'report_curve') {
    try {
      const r = await handleCurveAction(user.id, body);
      return res.status(r.status).json(r.json);
    } catch (err: any) {
      console.error('[Curve] ação falhou:', err?.message);
      return res.status(500).json({ error: 'Não foi possível atualizar agora. Tente de novo em instantes.' });
    }
  }

  if (body.action === 'coupon_sync' || body.action === 'coupon_receive') {
    try {
      const r = await handleCouponAction(user.id, body);
      return res.status(r.status).json(r.json);
    } catch (err: any) {
      console.error('[Juros previstos] ação falhou:', err?.message);
      return res.status(500).json({ error: 'Não foi possível atualizar os juros previstos agora. Tente de novo em instantes.' });
    }
  }

  if (body.action === 'compare' || body.action === 'answer') {
    const outcome = body.action === 'compare'
      ? await analyzeProposal(user.id, body.file, String(body.note || ''), 'app')
      : await addManagerAnswer(user.id, body.proposalId || null, String(body.text || ''), body.file?.data ? body.file : null, 'app');
    if (!outcome.ok) return res.status(outcome.status).json({ error: outcome.error, limitReached: outcome.limitReached });
    return res.status(200).json({ id: outcome.id, verdict: outcome.verdict, analysis: outcome.analysis });
  }

  try {
    const limit = await checkAiActionAllowed(supabase, user.id, 'investment_radar');
    const allowAi = limit.allowed;
    const result = await scanUser(user.id, {
      assetIds: body.assetId ? [String(body.assetId)] : undefined,
      maxNewsIssuers: allowAi ? MAX_NEWS_ISSUERS_MANUAL : 0,
      aiFn: 'investment_radar',
      notify: true
    });
    return res.status(200).json({ ...result, newsChecked: allowAi, limitMessage: allowAi ? null : limit.message });
  } catch (err: any) {
    console.error('[InvestmentRadar] scan falhou:', err?.message);
    return res.status(500).json({ error: 'Não foi possível analisar agora. Tente de novo em instantes.' });
  }
}

// ---------------------------------------------------------------------------
// WhatsApp: sugestão do banco e resposta do gerente
// ---------------------------------------------------------------------------
//
// O webhook do WhatsApp chama isto ANTES do fluxo normal (comprovantes,
// lançamentos). Só responde quando a mensagem é claramente sobre isto:
//   · print/PDF com legenda "sugestão", "proposta", "radar" ou "vale a pena" → analisa a sugestão;
//   · texto, áudio transcrito ou print começando com "gerente:" ou
//     "resposta do gerente" → junta à última sugestão e reavalia.
// Qualquer outra mensagem devolve null e segue o caminho de sempre.

// Só palavras que ninguém usa para legendar um comprovante: "investimento",
// "aplicação" ou "fundo" ficam de fora de propósito (um comprovante de
// aplicação legendado assim continua virando lançamento, como sempre).
const PROPOSAL_CAPTION = /(sugest[aã]o|proposta|radar|vale a pena|oferta d[eo] (banco|gerente|investimento))/i;
const MANAGER_ANSWER = /^\s*(resposta\s+d[oa]\s+gerente|gerente)\s*[:\-–]/i;

/** Markdown da IA → formatação do WhatsApp (*negrito*), sem estourar o tamanho da mensagem. */
export function toWhatsAppText(markdown: string, max = 3500): string {
  const out = markdown
    .replace(/^#{1,3}\s*(.+)$/gm, '*$1*')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out.length > max ? `${out.slice(0, max)}…\n\n(Análise completa no app: Patrimônio › Investimentos › Radar)` : out;
}

const VERDICT_EMOJI: Record<string, string> = { VALE: '✅ Vale', NAO_VALE: '⛔ Não vale', DEPENDE: '🤔 Depende' };

export function isInvestmentWhatsAppMessage(text: string, hasFile: boolean): 'proposal' | 'answer' | null {
  if (MANAGER_ANSWER.test(text || '')) return 'answer';
  if (hasFile && PROPOSAL_CAPTION.test(text || '')) return 'proposal';
  return null;
}

// Conversa natural: a pessoa não precisa saber nenhum "comando".
// Só entra aqui quando a frase junta quem ofereceu (gerente/banco/assessor) +
// a oferta + um assunto de INVESTIMENTO — "o banco sugeriu parcelar a fatura"
// não é investimento e segue o fluxo normal.
const INVEST_WORD = /\b(investimentos?|investir|aplica[cç][aã]o|aplicar|cdb|lci|lca|lc|cri|cra|deb[eê]ntures?|fundos?|coe|tesouro|previd[eê]ncia|renda fixa|t[ií]tulos?|carteira|rentabilidade|% ?do cdi|ipca ?\+)/i;
const OFFER = /\b(gerente|assessora?|banco|corretora|safra|bradesco|btg|xp|itau|itaú|santander|nubank)\b[^.?!\n]{0,60}\b(ofereceu|ofereceram|oferecendo|sugeriu|sugeriram|sugerindo|indicou|indicaram|prop[oô]s|propuseram|recomendou|recomendaram|quer que eu)\b/i;
const DECISION = /\b(vale a pena|compensa|devo (aceitar|aplicar|investir|trocar|resgatar)|é bom|e bom|recomenda|faço|fa[cç]o o que|aceito)\b/i;
const NATURAL_ANSWER = /\b(gerente|assessora?)\b[^.?!\n]{0,30}\b(respondeu|disse|falou|mandou|informou|confirmou|explicou|retornou|passou)\b/i;
const ANSWER_DETAIL = /(\d|taxa|prazo|car[eê]ncia|liquidez|fgc|cdi|ipca|rende|rendimento|vencimento|isento|ir\b|imposto|garantia|emissor)/i;

/** Classifica a mensagem (comando explícito ou conversa natural). null = segue o fluxo de sempre. */
export async function classifyInvestmentMessage(userId: string, text: string, hasFile: boolean): Promise<'proposal' | 'answer' | null> {
  const explicit = isInvestmentWhatsAppMessage(text, hasFile);
  if (explicit) return explicit;
  const t = String(text || '');
  if (!t.trim()) return null;
  // "o gerente disse que é 102% do CDI…" só vira resposta se houver sugestão recente (30 dias).
  if (NATURAL_ANSWER.test(t) && (ANSWER_DETAIL.test(t) || hasFile)) {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data } = await supabase.from('investment_proposals').select('id').eq('user_id', userId).gte('created_at', since).limit(1);
    if (data && data.length) return 'answer';
  }
  const aboutInvestment = INVEST_WORD.test(t);
  if (aboutInvestment && (OFFER.test(t) || DECISION.test(t))) return 'proposal';
  return null;
}

export async function handleInvestmentWhatsApp(params: {
  userId: string;
  text: string;
  hasFile: boolean;
  fileName?: string;
  fetchMedia: () => Promise<{ base64: string; mimeType: string } | null>;
  /** Já classificada pelo webhook (classifyInvestmentMessage); sem isso, só os comandos explícitos. */
  kind?: 'proposal' | 'answer' | null;
}): Promise<string | null> {
  const kind = params.kind !== undefined ? params.kind : isInvestmentWhatsAppMessage(params.text, params.hasFile);
  if (!kind) return null;

  let file: ProposalFile | null = null;
  if (params.hasFile) {
    const media = await params.fetchMedia();
    if (!media) return '❌ Não consegui abrir o arquivo. Tente mandar de novo (print nítido ou PDF).';
    file = { data: media.base64, mimeType: media.mimeType.split(';')[0].trim(), name: params.fileName || (kind === 'answer' ? 'resposta do gerente' : 'sugestão pelo WhatsApp') };
  }

  if (kind === 'answer') {
    const answerText = params.text.replace(MANAGER_ANSWER, '').trim();
    const r = await addManagerAnswer(params.userId, null, answerText, file, 'whatsapp');
    if (!r.ok) return `⚠️ ${r.error}`;
    return `*Zyvion* 📊 *Resposta do gerente analisada*${r.sourceName ? ` (${r.sourceName})` : ''}\n*Veredito agora:* ${VERDICT_EMOJI[r.verdict] || r.verdict}\n\n${toWhatsAppText(r.analysis)}\n\n_Se o gerente responder mais alguma coisa, é só me contar aqui do seu jeito (ex.: "o gerente disse que…"), em texto, áudio ou print. Tudo fica guardado no app em Patrimônio › Investimentos › Radar._`;
  }

  const note = params.text.trim();
  const r = await analyzeProposal(params.userId, file, note, 'whatsapp');
  if (!r.ok) return `⚠️ ${r.error}`;
  const howToContinue = file
    ? '_Quando o gerente responder, é só me contar aqui do seu jeito (ex.: "o gerente disse que a taxa é 102% do CDI"), em texto, áudio ou print. Eu junto com esta análise e reavalio. Tudo fica guardado no app em Patrimônio › Investimentos › Radar._'
    : '_Analisei pelo que você descreveu. Se tiver o print ou a lâmina do produto, mande aqui que eu refaço com todos os detalhes. Quando o gerente responder às perguntas, é só me contar do seu jeito (texto, áudio ou print). Tudo fica guardado no app em Patrimônio › Investimentos › Radar._';
  return `*Zyvion* 📊 *Sugestão analisada*\n*Veredito:* ${VERDICT_EMOJI[r.verdict] || r.verdict}\n\n${toWhatsAppText(r.analysis)}\n\n${howToContinue}`;
}
