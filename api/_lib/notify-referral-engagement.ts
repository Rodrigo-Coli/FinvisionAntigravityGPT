import { createClient } from '@supabase/supabase-js';
import { releaseMaturedCommissions, getTierProgress, getRecentCommissionTrend, getUpgradeOpportunity, getAvailableBalanceCents, retryFailedCommissionEvents } from './referral.service.js';
import { sendWhatsAppRotated } from './whatsapp-rotation.service.js';
import { isCronAuthorized } from './cron-auth.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

const APP_URL = process.env.APP_URL || 'https://finvision-antigravity-gpt.vercel.app';
const REFERRALS_LINK = `${APP_URL}/#/referrals`;

function money(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

async function wasNotifiedRecently(userId: string, purpose: string, withinDays: number): Promise<boolean> {
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase.from('whatsapp_usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('purpose', purpose).gte('created_at', since);
  return (count || 0) > 0;
}

async function getWhatsappTarget(userId: string): Promise<string | null> {
  const { data } = await supabase.from('user_settings').select('whatsapp_number, whatsapp_enabled').eq('user_id', userId).maybeSingle();
  if (!data?.whatsapp_enabled || !data.whatsapp_number) return null;
  return data.whatsapp_number;
}

// Cron diário — estimula a indicação sem ser chato: cada gatilho manda no
// máximo 1 mensagem por usuário dentro da sua janela (nunca bombardeio).
// Não avisa mais "comissão liberada" (decisão de produto: informação de
// baixo valor, o saldo já aparece na tela do indicador).
export async function handleNotifyReferralEngagement(req: any, res: any) {
  if (!isCronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Libera para saque quem já passou da carência — sem notificar (só a
    // liberação operacional; o saldo aparece na tela quando o usuário abrir).
    await releaseMaturedCommissions();

    // Reprocessa comissões que falharam no webhook por algum motivo passageiro
    // (ver recordCommissionEventFailure) — idempotente, seguro rodar todo dia.
    const commissionRetry = await retryFailedCommissionEvents();

    let nudgedCount = 0, decliningCount = 0, upgradeCount = 0, onboardedCount = 0;

    const { data: activeAffiliates } = await supabase.from('affiliates')
      .select('id, user_id, has_custom_terms').eq('is_active', true);

    for (const aff of activeAffiliates || []) {
      const target = await getWhatsappTarget(aff.user_id);
      if (!target) continue;

      // 1. Perto de subir de faixa (só quem está no escalonamento automático)
      if (!aff.has_custom_terms) {
        const tier = await getTierProgress(aff.id);
        if (tier && tier.referralsToNextTier != null && tier.referralsToNextTier <= 2 && !(await wasNotifiedRecently(aff.user_id, 'referral_tier_nudge', 7))) {
          const faltam = tier.referralsToNextTier;
          const msg = `🚀 *FinVision Pro — Quase lá!*\n\nFaltam apenas *${faltam}* indicaç${faltam === 1 ? 'ão ativa' : 'ões ativas'} para seu cashback subir de *${tier.currentPercent}%* para *${tier.nextPercent}%* em todas as próximas indicações!\n\nCompartilhe seu link e garanta o próximo degrau: ${REFERRALS_LINK}`;
          if (await sendWhatsAppRotated({ number: target, text: msg, category: 'utility', purpose: 'referral_tier_nudge', userId: aff.user_id })) nudgedCount++;
          continue; // uma mensagem por afiliado por execução do cron
        }
      }

      // 2. Comissões em queda: estimula indicar mais
      const trend = await getRecentCommissionTrend(aff.id);
      if (trend.decreasing && !(await wasNotifiedRecently(aff.user_id, 'referral_declining_nudge', 21))) {
        const msg = `📉 *FinVision Pro — Indicação*\n\nSeu cashback de indicação caiu nos últimos 30 dias (de ${money(trend.prev30)} para ${money(trend.last30)}).\n\nQuanto mais amigos ativos você tiver, maior sua renda todo mês. Que tal chamar mais alguém hoje? Você pode ganhar muito mais: ${REFERRALS_LINK}`;
        if (await sendWhatsAppRotated({ number: target, text: msg, category: 'utility', purpose: 'referral_declining_nudge', userId: aff.user_id })) decliningCount++;
        continue;
      }

      // 3. Saldo já cobre um upgrade
      const availableCents = await getAvailableBalanceCents(aff.id);
      if (availableCents > 0) {
        const opportunity = await getUpgradeOpportunity(aff.user_id, availableCents);
        if (opportunity && !(await wasNotifiedRecently(aff.user_id, 'referral_upgrade_opportunity', 30))) {
          const msg = `⭐ *FinVision Pro — Seu cashback já pode virar upgrade!*\n\nSeu saldo de cashback de indicação (${money(availableCents)}) já cobre o plano *${opportunity.planName}* (${money(opportunity.planPriceCents)}).\n\nVocê pode usar esse saldo para abater sua própria mensalidade sempre que quiser — é só autorizar aqui: ${REFERRALS_LINK}`;
          if (await sendWhatsAppRotated({ number: target, text: msg, category: 'utility', purpose: 'referral_upgrade_opportunity', userId: aff.user_id })) upgradeCount++;
        }
      }
    }

    // 4. Assinantes pagantes que nunca ouviram falar do programa: dica única.
    // Importante: NÃO prometer "N amigos pagam sua assinatura" — o cashback
    // depende do plano que CADA amigo escolher (pode ser mais barato ou mais
    // caro que o seu), prometer um número fixo seria propaganda enganosa.
    // A mensagem destaca o percentual de cashback, que é sempre verdadeiro.
    const { data: payingSubs } = await supabase.from('subscriptions')
      .select('user_id, plans(price_cents)').eq('status', 'active');
    const { data: existingAffiliates } = await supabase.from('affiliates').select('user_id');
    const affiliateSet = new Set((existingAffiliates || []).map((a: any) => a.user_id));
    const { data: settingsRow } = await supabase.from('referral_settings').select('commission_percent').eq('id', 1).single();
    const basePercent = settingsRow?.commission_percent || 20;

    const eligibleSubs = (payingSubs || []).filter((s: any) => (s.plans?.price_cents || 0) > 0 && !affiliateSet.has(s.user_id));

    for (const sub of eligibleSubs as any[]) {
      if (await wasNotifiedRecently(sub.user_id, 'referral_onboarding', 3650)) continue; // envia uma única vez

      const target = await getWhatsappTarget(sub.user_id);
      if (!target) continue;

      const msg = `💡 *Cashback FinVision Pro*\n\nIndicando amigos para o FinVision Pro, você ganha *${basePercent}% de cashback* sobre a mensalidade de cada um, todo mês, enquanto a indicação durar.\n\nQuanto mais amigos ativos, maior seu cashback recorrente — e você ainda pode usar esse saldo para abater sua própria mensalidade quando quiser.\n\nPegue seu link aqui: ${REFERRALS_LINK}`;
      if (await sendWhatsAppRotated({ number: target, text: msg, category: 'utility', purpose: 'referral_onboarding', userId: sub.user_id })) onboardedCount++;
    }

    return res.status(200).json({ success: true, nudgedCount, decliningCount, upgradeCount, onboardedCount, commissionRetry });
  } catch (err: any) {
    console.error('notify-referral-engagement error:', err);
    return res.status(500).json({ error: err.message });
  }
}
