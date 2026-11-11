// Trava de uso de IA por plano — bloqueia quando o usuário estoura o limite
// mensal configurado no plano (Master Console > Planos). A janela é sempre de
// UM MÊS, ancorada no dia em que o ciclo da assinatura começou (não mês de
// calendário) — ver monthlyUsageWindow em payment/billing-rules.ts.
//
// REGRA DE OURO: só bloqueia com CERTEZA. Qualquer erro/instabilidade na própria
// checagem (banco fora do ar, dado inesperado, etc.) libera o uso — nunca trava
// um cliente pagante por causa de um bug aqui. Erros de checagem são logados
// (console.error) para dar pra monitorar se isso está acontecendo com frequência.
//
// Usado por api/_lib/finvision-chat.ts, whatsapp-webhook.ts, handle-receipt-items.ts,
// handle-wealth-analysis.ts, categorize-transactions.ts, handle-bank-reconcile.ts,
// handle-card-reconcile.ts (e futuramente a linha de importação de extrato/fatura).

import { monthlyUsageWindow } from './payment/billing-rules.js';

// Mapa oficial: cada `fn` gravado em ai_usage_logs (ver api/_lib/ai-usage.ts)
// pertence a UMA categoria de limite (chave dentro de plans.features). Um `fn`
// que não aparece aqui de propósito (ex: search_market_data) é uma sub-chamada
// interna já contada dentro da categoria da ação principal que a disparou —
// NÃO tem limite próprio. Se criar um novo ponto de chamada de IA, ele PRECISA
// entrar aqui, senão fica ilimitado sem ninguém perceber.
export const AI_ACTION_CATEGORIES: Record<string, string> = {
  chat: 'ai_chat',
  whatsapp_classifier: 'whatsapp_messages',
  whatsapp_date_extraction: 'whatsapp_messages',
  whatsapp_chat_smalltalk: 'whatsapp_messages',
  whatsapp_query: 'whatsapp_messages',
  whatsapp_voice_transcription: 'whatsapp_voice',
  receipt_items: 'ai_scanner',
  whatsapp_receipt_ocr: 'ai_scanner',
  bank_reconcile: 'reconcile',
  card_reconcile: 'reconcile',
  // parse_statement, parse_card_statement, process_import e import_worker NÃO
  // entram aqui: são rotas antigas que ainda existem no código mas nenhum
  // caminho do app hoje as chama (o fluxo real de importação de extrato/fatura
  // é o de reconcile acima). Se algum dia voltarem a ser usadas, mapear pra
  // uma categoria antes de ligar a chamada de novo.
  categorize: 'ai_categorize',
  wealth_analysis: 'ai_diagnosis',
  // Simulador de Consórcio (Planejamento): cada pedido conta como mensagem de Chat IA.
  consortium_sim: 'ai_chat',
  // Radar de Investimentos: "Analisar agora" e "Comparar sugestão do banco" contam
  // como diagnóstico. A varredura automática do cron grava 'investment_radar_auto'
  // e fica FORA dos limites de propósito: é rotina do sistema (como
  // search_market_data), não ação do usuário — senão o radar diário gastaria a
  // cota de diagnósticos dele.
  investment_radar: 'ai_diagnosis',
  investment_compare: 'ai_diagnosis',
};

// Rótulos amigáveis pra mensagem de bloqueio mostrada ao usuário.
const CATEGORY_LABELS: Record<string, string> = {
  ai_chat: 'mensagens no Chat IA',
  whatsapp_messages: 'mensagens no WhatsApp',
  whatsapp_voice: 'áudios no WhatsApp',
  ai_scanner: 'leituras de comprovante/nota',
  reconcile: 'conciliações com IA',
  import_docs: 'importações de extrato/fatura',
  ai_categorize: 'categorizações automáticas',
  ai_diagnosis: 'diagnósticos de patrimônio',
};

export interface AiLimitCheck {
  allowed: boolean;
  reason?: 'unlimited' | 'under_limit' | 'limit_reached' | 'no_subscription' | 'not_configured' | 'check_failed';
  used?: number;
  limit?: number;
  remaining?: number;
  message?: string;
}

// Início/fim do mês de uso atual do usuário, ancorado no início do ciclo da
// assinatura (ou na criação dela, quando ainda não há ciclo — teste grátis,
// plano liberado pelo admin). Antes a janela era o período de cobrança inteiro:
// no plano anual a cota "por mês" valia para o ano todo e, depois da primeira
// renovação, a janela ficava no passado e o limite deixava de contar.
function resolveUsageWindow(sub: { current_period_start: string | null; current_period_end: string | null; created_at: string }): { start: string; end: string } {
  return monthlyUsageWindow(sub.current_period_start || sub.created_at);
}

export function isDowngradedSubscription(sub: { status: string; trial_ends_at?: string | null }, now: Date = new Date()): boolean {
  if (sub.status === 'past_due' || sub.status === 'canceled') return true;
  return sub.status === 'trialing' && !!sub.trial_ends_at && new Date(sub.trial_ends_at).getTime() < now.getTime();
}

// Recursos que valem AGORA para a assinatura. null = não deu para saber (libera,
// pela regra de ouro acima).
async function resolveEffectiveFeatures(supabase: any, sub: any): Promise<Record<string, any> | null> {
  if (isDowngradedSubscription(sub)) {
    const { data: starter, error } = await supabase.from('plans').select('features').eq('slug', 'starter').maybeSingle();
    if (error) throw error;
    return starter?.features ?? null;
  }
  if (!['active', 'trialing', 'admin_granted'].includes(sub.status)) return null;
  return sub.plans?.features ?? {};
}

/**
 * Verifica se o usuário ainda pode executar uma ação de IA (`fn`) dentro do
 * limite do plano atual. NÃO registra o uso — isso continua sendo feito por
 * recordAiUsage() depois da chamada ao Gemini, como já era. Esta função só
 * decide se a chamada deve ACONTECER.
 */
export async function checkAiActionAllowed(supabase: any, userId: string | null | undefined, fn: string): Promise<AiLimitCheck> {
  if (!userId) return { allowed: true, reason: 'no_subscription' };

  const category = AI_ACTION_CATEGORIES[fn];
  if (!category) return { allowed: true, reason: 'not_configured' };

  try {
    const { data: sub, error: subErr } = await supabase
      .from('subscriptions')
      .select('plan_id, status, trial_ends_at, current_period_start, current_period_end, created_at, plans(features)')
      .eq('user_id', userId)
      .maybeSingle();

    if (subErr) throw subErr;
    // Sem assinatura reconhecida aqui: outras camadas do app (login/gate de
    // rota) já cuidam de barrar quem não tem acesso nenhum — esta função só
    // cuida do LIMITE de uso, então na dúvida libera.
    if (!sub) return { allowed: true, reason: 'no_subscription' };

    // Mesma regra das telas (SubscriptionContext): teste vencido, pagamento
    // pendente/atrasado além da tolerância ou assinatura cancelada usam os limites
    // do plano gratuito. Antes, 'past_due' e 'canceled' caíam em "sem assinatura"
    // e ficavam com IA liberada sem limite, e o teste vencido continuava com os
    // limites do plano pago.
    const features = await resolveEffectiveFeatures(supabase, sub);
    if (!features) return { allowed: true, reason: 'no_subscription' };

    const rawVal = features[category];
    // true / -1 / ausente = sem limite configurado (não bloqueia).
    if (rawVal === undefined || rawVal === null || rawVal === true || rawVal === -1) {
      return { allowed: true, reason: 'unlimited' };
    }
    const limit = typeof rawVal === 'number' ? rawVal : (rawVal === false ? 0 : -1);
    if (limit === -1) return { allowed: true, reason: 'unlimited' };

    if (limit === 0) {
      return {
        allowed: false, reason: 'limit_reached', used: 0, limit: 0, remaining: 0,
        message: `Esse recurso não está incluído no seu plano atual.`
      };
    }

    const { start, end } = resolveUsageWindow(sub as any);
    const categoryFns = Object.entries(AI_ACTION_CATEGORIES).filter(([, cat]) => cat === category).map(([f]) => f);

    const { count, error: countErr } = await supabase
      .from('ai_usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('fn', categoryFns)
      .gte('created_at', start)
      .lt('created_at', end);

    if (countErr) throw countErr;
    const used = count || 0;

    if (used >= limit) {
      return {
        allowed: false, reason: 'limit_reached', used, limit, remaining: 0,
        message: `Você atingiu o limite de ${limit} ${CATEGORY_LABELS[category] || category} do seu plano neste ciclo. Ele libera de novo em ${new Date(end).toLocaleDateString('pt-BR')}, ou faça upgrade pra continuar agora.`
      };
    }

    return { allowed: true, reason: 'under_limit', used, limit, remaining: limit - used };
  } catch (e: any) {
    console.error(`[ai-usage-limits] Falha ao checar limite (fn=${fn}, userId=${userId}) — liberando por segurança:`, e?.message || e);
    return { allowed: true, reason: 'check_failed' };
  }
}
