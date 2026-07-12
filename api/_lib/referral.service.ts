import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

// ============================================================
// Motor de comissão de indicação.
//
// Regra central: os termos (percentual, duração, carência) são
// resolvidos UMA VEZ, no momento em que a indicação é criada
// (attachReferral), e ficam TRAVADOS na própria linha de
// affiliate_referrals. Mudar o padrão global (referral_settings)
// ou o override de um afiliado (affiliates.has_custom_terms) só
// afeta indicações CRIADAS DEPOIS da mudança — nunca as que já
// existem. Isso vale também para o escalonamento automático por
// indicações ativas: o degrau é calculado no momento da nova
// indicação, não recalculado retroativamente nas antigas.
// ============================================================

export interface ResolvedReferralTerms {
  commissionPercent: number;
  durationMonths: number | null; // null = vitalício
  holdPeriodDays: number;
}

async function getGlobalSettings() {
  const { data } = await supabase.from('referral_settings').select('*').eq('id', 1).single();
  return data;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export async function resolveReferralTerms(affiliateId: string): Promise<ResolvedReferralTerms> {
  const [{ data: affiliate }, settings] = await Promise.all([
    supabase.from('affiliates').select('*').eq('id', affiliateId).single(),
    getGlobalSettings(),
  ]);
  if (!affiliate) throw new Error('Afiliado não encontrado.');
  if (!settings) throw new Error('Configuração de indicação (referral_settings) não encontrada.');

  if (affiliate.has_custom_terms) {
    return {
      commissionPercent: affiliate.commission_percent_override ?? settings.commission_percent,
      durationMonths: affiliate.duration_lifetime_override
        ? null
        : (affiliate.duration_months_override ?? settings.duration_months),
      holdPeriodDays: settings.hold_period_days,
    };
  }

  const { count: activeCount } = await supabase
    .from('affiliate_referrals')
    .select('id', { count: 'exact', head: true })
    .eq('affiliate_id', affiliateId)
    .eq('status', 'active');

  const steps = Math.floor((activeCount || 0) / settings.tier_step_referrals);
  const commissionPercent = Math.min(
    settings.commission_percent + steps * settings.tier_step_percent,
    settings.tier_cap_percent
  );

  return {
    commissionPercent,
    durationMonths: settings.duration_months,
    holdPeriodDays: settings.hold_period_days,
  };
}

// Progresso de escalonamento — usado nas notificações de engajamento
// ("faltam 2 indicações ativas para você subir para 25%").
export async function getTierProgress(affiliateId: string) {
  const [{ data: affiliate }, settings, { count: rawActiveCount }] = await Promise.all([
    supabase.from('affiliates').select('*').eq('id', affiliateId).single(),
    getGlobalSettings(),
    supabase.from('affiliate_referrals').select('id', { count: 'exact', head: true }).eq('affiliate_id', affiliateId).eq('status', 'active'),
  ]);
  if (!affiliate || !settings) return null;
  const activeCount = rawActiveCount || 0;

  if (affiliate.has_custom_terms) {
    return {
      currentPercent: affiliate.commission_percent_override ?? settings.commission_percent,
      nextPercent: null as number | null,
      referralsToNextTier: null as number | null,
      activeCount,
      capPercent: settings.tier_cap_percent,
    };
  }

  const steps = Math.floor(activeCount / settings.tier_step_referrals);
  const currentPercent = Math.min(settings.commission_percent + steps * settings.tier_step_percent, settings.tier_cap_percent);
  const atCap = currentPercent >= settings.tier_cap_percent;
  const nextPercent = atCap ? null : Math.min(settings.commission_percent + (steps + 1) * settings.tier_step_percent, settings.tier_cap_percent);
  const referralsToNextTier = atCap ? null : (steps + 1) * settings.tier_step_referrals - activeCount;

  return { currentPercent, nextPercent, referralsToNextTier, activeCount, capPercent: settings.tier_cap_percent };
}

function generateAffiliateCode(userId: string): string {
  const base = userId.replace(/-/g, '').slice(0, 6).toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `FV${base}${suffix}`;
}

export async function getOrCreateAffiliate(userId: string) {
  const { data: existing } = await supabase.from('affiliates').select('*').eq('user_id', userId).maybeSingle();
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateAffiliateCode(userId);
    const { data, error } = await supabase.from('affiliates').insert({ user_id: userId, affiliate_code: code }).select().single();
    if (!error) return data;
    if (error.code !== '23505') throw error; // erro != "código já existe" -> propaga
  }
  throw new Error('Não foi possível gerar um código de indicação único após 5 tentativas.');
}

// Chamada uma vez, logo após o cadastro do indicado (attach-referral.ts).
export async function attachReferral(referredUserId: string, affiliateCode: string): Promise<{ attached: boolean; reason?: string }> {
  if (!affiliateCode) return { attached: false, reason: 'no_code' };

  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('id, user_id, is_active')
    .eq('affiliate_code', affiliateCode.trim().toUpperCase())
    .maybeSingle();

  if (!affiliate || !affiliate.is_active) return { attached: false, reason: 'invalid_code' };
  if (affiliate.user_id === referredUserId) return { attached: false, reason: 'self_referral' };

  const terms = await resolveReferralTerms(affiliate.id);
  const commissionActiveUntil = terms.durationMonths != null
    ? addMonths(new Date(), terms.durationMonths).toISOString()
    : null;

  const { error } = await supabase.from('affiliate_referrals').insert({
    affiliate_id: affiliate.id,
    referred_user_id: referredUserId,
    commission_percent: terms.commissionPercent,
    duration_months: terms.durationMonths,
    hold_period_days: terms.holdPeriodDays,
    commission_active_until: commissionActiveUntil,
    status: 'active',
  });

  if (error) {
    if (error.code === '23505') return { attached: false, reason: 'already_referred' };
    throw error;
  }
  return { attached: true };
}

// Chamada pelo webhook do gateway a cada pagamento confirmado do indicado.
// Idempotente: um mesmo pagamento (gateway + gatewayPaymentId) nunca gera
// duas comissões, mesmo que o webhook dispare mais de uma vez.
export async function recordCommissionEvent(params: {
  referralId: string;
  subscriptionId: string;
  gateway: string;
  gatewayPaymentId: string;
  chargeAmountCents: number;
}): Promise<{ created: boolean; reason?: string; amountCents?: number }> {
  const { data: referral } = await supabase.from('affiliate_referrals').select('*').eq('id', params.referralId).single();
  if (!referral) return { created: false, reason: 'referral_not_found' };

  if (referral.commission_active_until && new Date(referral.commission_active_until).getTime() < Date.now()) {
    if (referral.status !== 'expired') {
      await supabase.from('affiliate_referrals').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', referral.id);
    }
    return { created: false, reason: 'duration_expired' };
  }

  const amountCents = Math.round(params.chargeAmountCents * (Number(referral.commission_percent) / 100));
  const availableAt = new Date(Date.now() + referral.hold_period_days * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('affiliate_commission_events').insert({
    affiliate_id: referral.affiliate_id,
    referral_id: referral.id,
    subscription_id: params.subscriptionId,
    gateway: params.gateway,
    gateway_payment_id: params.gatewayPaymentId,
    charge_amount_cents: params.chargeAmountCents,
    commission_percent_applied: referral.commission_percent,
    amount_cents: amountCents,
    status: 'pending_hold',
    available_at: availableAt,
  });

  if (error) {
    if (error.code === '23505') return { created: false, reason: 'duplicate_payment' }; // webhook duplicado
    throw error;
  }

  await supabase.from('affiliate_referrals').update({
    status: 'active',
    total_commission_cents: (referral.total_commission_cents || 0) + amountCents,
    updated_at: new Date().toISOString(),
  }).eq('id', referral.id);

  const { data: affiliateRow } = await supabase.from('affiliates').select('total_earned_cents').eq('id', referral.affiliate_id).single();
  await supabase.from('affiliates').update({
    total_earned_cents: (affiliateRow?.total_earned_cents || 0) + amountCents,
  }).eq('id', referral.affiliate_id);

  return { created: true, amountCents };
}

// Chamada pelo webhook em estorno/chargeback. "Sem estorno" = a comissão
// referente àquele pagamento específico é cancelada; se já tinha sido
// liberada (ou paga), o saldo do afiliado fica negativo até compensar em
// comissões futuras (mesma lógica de clawback usada no mercado).
export async function reverseCommissionEvent(params: { gateway: string; gatewayPaymentId: string; reason: string }): Promise<{ reversed: boolean }> {
  if (!params.gatewayPaymentId) return { reversed: false };

  const { data: event } = await supabase.from('affiliate_commission_events')
    .select('*')
    .eq('gateway', params.gateway)
    .eq('gateway_payment_id', params.gatewayPaymentId)
    .maybeSingle();

  if (!event || event.status === 'reversed') return { reversed: false };

  await supabase.from('affiliate_commission_events').update({
    status: 'reversed',
    reversed_at: new Date().toISOString(),
    reversed_reason: params.reason,
  }).eq('id', event.id);

  const [{ data: referral }, { data: affiliate }] = await Promise.all([
    supabase.from('affiliate_referrals').select('total_commission_cents').eq('id', event.referral_id).single(),
    supabase.from('affiliates').select('total_earned_cents').eq('id', event.affiliate_id).single(),
  ]);

  await Promise.all([
    supabase.from('affiliate_referrals').update({
      total_commission_cents: (referral?.total_commission_cents || 0) - event.amount_cents,
      updated_at: new Date().toISOString(),
    }).eq('id', event.referral_id),
    supabase.from('affiliates').update({
      total_earned_cents: (affiliate?.total_earned_cents || 0) - event.amount_cents,
    }).eq('id', event.affiliate_id),
  ]);

  return { reversed: true };
}

// Mantém affiliate_referrals.status espelhando o status real da assinatura
// do indicado, para o indicador acompanhar se a indicação está ativa.
export async function syncReferralStatusFromSubscription(subscriptionId: string, subscriptionStatus: string): Promise<void> {
  const { data: referral } = await supabase.from('affiliate_referrals').select('id, status').eq('subscription_id', subscriptionId).maybeSingle();
  if (!referral || referral.status === 'expired') return;

  const nextStatus = subscriptionStatus === 'active' ? 'active' : 'inactive';
  if (nextStatus !== referral.status) {
    await supabase.from('affiliate_referrals').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', referral.id);
  }
}

// Aprovação/pagamento/rejeição de saque pelo superadmin.
export async function processPayout(payoutId: string, action: 'approve' | 'pay' | 'reject', adminUserId: string, rejectionReason?: string) {
  const { data: payout } = await supabase.from('affiliate_payouts').select('*').eq('id', payoutId).single();
  if (!payout) throw new Error('Pedido de saque não encontrado.');
  if (payout.status === 'paid' || payout.status === 'rejected') {
    throw new Error(`Este pedido já foi ${payout.status === 'paid' ? 'pago' : 'rejeitado'}.`);
  }

  const now = new Date().toISOString();

  if (action === 'approve') {
    await supabase.from('affiliate_payouts').update({ status: 'approved', reviewed_at: now, reviewed_by: adminUserId }).eq('id', payoutId);
    return { status: 'approved' };
  }

  if (action === 'reject') {
    await supabase.from('affiliate_payouts').update({
      status: 'rejected', reviewed_at: now, reviewed_by: adminUserId, rejection_reason: rejectionReason || null,
    }).eq('id', payoutId);
    // Libera os eventos de volta ao saldo disponível para um novo pedido.
    await supabase.from('affiliate_commission_events').update({ paid_in_payout_id: null }).eq('paid_in_payout_id', payoutId);
    return { status: 'rejected' };
  }

  // action === 'pay'
  await supabase.from('affiliate_payouts').update({
    status: 'paid', paid_at: now, reviewed_at: payout.reviewed_at || now, reviewed_by: payout.reviewed_by || adminUserId,
  }).eq('id', payoutId);
  await supabase.from('affiliate_commission_events').update({ status: 'paid' }).eq('paid_in_payout_id', payoutId);

  const { data: affiliate } = await supabase.from('affiliates').select('total_paid_cents').eq('id', payout.affiliate_id).single();
  await supabase.from('affiliates').update({
    total_paid_cents: (affiliate?.total_paid_cents || 0) + payout.amount_cents,
  }).eq('id', payout.affiliate_id);

  return { status: 'paid' };
}

// Marca disponível para saque as comissões cuja carência já venceu, e
// devolve por afiliado quanto foi liberado agora (para notificar). Chamada
// pelo cron diário (notify-referral-engagement.ts).
export async function releaseMaturedCommissions(): Promise<{ affiliateId: string; amountCents: number }[]> {
  const { data, error } = await supabase
    .from('affiliate_commission_events')
    .update({ status: 'available' })
    .eq('status', 'pending_hold')
    .lte('available_at', new Date().toISOString())
    .select('affiliate_id, amount_cents');
  if (error) throw error;
  return (data || []).map((r: any) => ({ affiliateId: r.affiliate_id, amountCents: r.amount_cents }));
}
