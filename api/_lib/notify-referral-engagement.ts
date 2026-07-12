import { createClient } from '@supabase/supabase-js';
import { releaseMaturedCommissions, getTierProgress } from './referral.service.js';
import { sendWhatsAppRotated } from './whatsapp-rotation.service.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

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

// Cron diário — estimula a indicação sem ser chato: cada usuário só recebe
// UMA mensagem por gatilho (comissão liberada, perto de subir de faixa, ou
// a dica única de "como isso paga sua assinatura"), nunca um bombardeio.
export async function handleNotifyReferralEngagement(req: any, res: any) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    if (!process.env.IS_LOCAL && req.query.key !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    let releasedCount = 0, nudgedCount = 0, onboardedCount = 0;

    // 1. Comissões cuja carência venceu agora: liberar + avisar quem indicou.
    const released = await releaseMaturedCommissions();
    const releasedByAffiliate = new Map<string, number>();
    for (const r of released) releasedByAffiliate.set(r.affiliateId, (releasedByAffiliate.get(r.affiliateId) || 0) + r.amountCents);

    if (releasedByAffiliate.size > 0) {
      const affiliateIds = [...releasedByAffiliate.keys()];
      const { data: affiliates } = await supabase.from('affiliates')
        .select('id, user_id, total_earned_cents, total_paid_cents')
        .in('id', affiliateIds);

      for (const aff of affiliates || []) {
        const { data: settings } = await supabase.from('user_settings')
          .select('whatsapp_number, whatsapp_enabled').eq('user_id', aff.user_id).maybeSingle();
        if (!settings?.whatsapp_enabled || !settings.whatsapp_number) continue;

        const releasedNow = releasedByAffiliate.get(aff.id) || 0;
        const balance = (aff.total_earned_cents || 0) - (aff.total_paid_cents || 0);
        const msg = `💸 *FinVision Pro — Indicação*\n\nSua comissão de *${money(releasedNow)}* acabou de ser liberada!\n\nSaldo disponível para saque: *${money(balance)}*.\n\nContinue indicando: cada amigo ativo aumenta sua renda todo mês. 🚀`;
        const ok = await sendWhatsAppRotated({ number: settings.whatsapp_number, text: msg, category: 'utility', purpose: 'referral_commission_released', userId: aff.user_id });
        if (ok) releasedCount++;
      }
    }

    // 2. Afiliados a 1-2 indicações de subir de faixa: dá um empurrãozinho.
    const { data: activeAffiliates } = await supabase.from('affiliates')
      .select('id, user_id').eq('is_active', true).eq('has_custom_terms', false);

    for (const aff of activeAffiliates || []) {
      const tier = await getTierProgress(aff.id);
      if (!tier || tier.referralsToNextTier == null || tier.referralsToNextTier > 2) continue;
      if (await wasNotifiedRecently(aff.user_id, 'referral_tier_nudge', 7)) continue;

      const { data: settings } = await supabase.from('user_settings')
        .select('whatsapp_number, whatsapp_enabled').eq('user_id', aff.user_id).maybeSingle();
      if (!settings?.whatsapp_enabled || !settings.whatsapp_number) continue;

      const faltam = tier.referralsToNextTier;
      const msg = `🚀 *FinVision Pro — Quase lá!*\n\nFaltam apenas *${faltam}* indicaç${faltam === 1 ? 'ão ativa' : 'ões ativas'} para sua comissão subir de *${tier.currentPercent}%* para *${tier.nextPercent}%* em todas as próximas indicações!\n\nCompartilhe seu link e garanta o próximo degrau. 💪`;
      const ok = await sendWhatsAppRotated({ number: settings.whatsapp_number, text: msg, category: 'utility', purpose: 'referral_tier_nudge', userId: aff.user_id });
      if (ok) nudgedCount++;
    }

    // 3. Assinantes pagantes que nunca ouviram falar do programa: dica única,
    //    com a conta de "quantos amigos pagam sua assinatura" já pronta.
    const { data: payingSubs } = await supabase.from('subscriptions')
      .select('user_id, plans(price_cents)').eq('status', 'active');
    const { data: existingAffiliates } = await supabase.from('affiliates').select('user_id');
    const affiliateSet = new Set((existingAffiliates || []).map((a: any) => a.user_id));
    const { data: settingsRow } = await supabase.from('referral_settings').select('commission_percent').eq('id', 1).single();
    const basePercent = settingsRow?.commission_percent || 20;

    const eligibleSubs = (payingSubs || []).filter((s: any) => (s.plans?.price_cents || 0) > 0 && !affiliateSet.has(s.user_id));

    for (const sub of eligibleSubs as any[]) {
      if (await wasNotifiedRecently(sub.user_id, 'referral_onboarding', 3650)) continue; // envia uma única vez

      const { data: userSettings } = await supabase.from('user_settings')
        .select('whatsapp_number, whatsapp_enabled').eq('user_id', sub.user_id).maybeSingle();
      if (!userSettings?.whatsapp_enabled || !userSettings.whatsapp_number) continue;

      const planPriceCents = sub.plans?.price_cents || 0;
      const commissionPerFriendCents = Math.round(planPriceCents * (basePercent / 100));
      const friendsToPaySystem = commissionPerFriendCents > 0 ? Math.ceil(planPriceCents / commissionPerFriendCents) : 0;

      const msg = `💡 *Você sabia?*\n\nIndicando o FinVision Pro para amigos, você ganha *${basePercent}%* da mensalidade de cada um, todo mês.\n\n${friendsToPaySystem > 0 ? `Com apenas *${friendsToPaySystem} amig${friendsToPaySystem === 1 ? 'o' : 'os'} ativo${friendsToPaySystem === 1 ? '' : 's'}*, sua própria assinatura já se paga sozinha!\n\n` : ''}Toque em "Indicar Amigos" no app e pegue seu link. 🔗`;
      const ok = await sendWhatsAppRotated({ number: userSettings.whatsapp_number, text: msg, category: 'utility', purpose: 'referral_onboarding', userId: sub.user_id });
      if (ok) onboardedCount++;
    }

    return res.status(200).json({ success: true, releasedCount, nudgedCount, onboardedCount });
  } catch (err: any) {
    console.error('notify-referral-engagement error:', err);
    return res.status(500).json({ error: err.message });
  }
}
