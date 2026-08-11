// Trava de uso de IA por plano — bloqueia quando o usuário estoura o limite
// mensal configurado no plano (Master Console > Planos), contando pela janela
// real de cobrança (current_period_start -> current_period_end da assinatura,
// não mês de calendário), já que o ciclo reinicia a cada troca/renovação de plano.
//
// REGRA DE OURO: só bloqueia com CERTEZA. Qualquer erro/instabilidade na própria
// checagem (banco fora do ar, dado inesperado, etc.) libera o uso — nunca trava
// um cliente pagante por causa de um bug aqui. Erros de checagem são logados
// (console.error) para dar pra monitorar se isso está acontecendo com frequência.
//
// Usado por api/_lib/finvision-chat.ts, whatsapp-webhook.ts, handle-receipt-items.ts,
// handle-wealth-analysis.ts, categorize-transactions.ts, handle-bank-reconcile.ts,
// handle-card-reconcile.ts (e futuramente a linha de importação de extrato/fatura).

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
  parse_statement: 'import_docs',
  parse_card_statement: 'import_docs',
  process_import: 'import_docs',
  import_worker: 'import_docs',
  categorize: 'ai_categorize',
  wealth_analysis: 'ai_diagnosis',
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

// Início/fim do ciclo de uso atual do usuário. Prioriza a janela real de
// cobrança (current_period_start/end); cai para "desde a criação da assinatura,
// por 30 dias" só quando a assinatura ainda não tem período definido (ex: trial
// antigo, admin_granted sem data de fim).
function resolveUsageWindow(sub: { current_period_start: string | null; current_period_end: string | null; created_at: string }): { start: string; end: string } {
  const start = sub.current_period_start || sub.created_at;
  let end = sub.current_period_end;
  if (!end) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + 1);
    end = d.toISOString();
  }
  return { start, end };
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
      .select('plan_id, status, current_period_start, current_period_end, created_at, plans(features)')
      .eq('user_id', userId)
      .maybeSingle();

    if (subErr) throw subErr;
    // Sem assinatura reconhecida aqui: outras camadas do app (login/gate de
    // rota) já cuidam de barrar quem não tem acesso nenhum — esta função só
    // cuida do LIMITE de uso, então na dúvida libera.
    if (!sub || !['active', 'trialing', 'admin_granted'].includes(sub.status)) {
      return { allowed: true, reason: 'no_subscription' };
    }

    const rawVal = sub.plans?.features?.[category];
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
