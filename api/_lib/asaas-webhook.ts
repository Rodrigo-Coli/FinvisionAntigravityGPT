import { createClient } from '@supabase/supabase-js';
import { getPaymentGateway } from './payment/index.js';
import type { NormalizedWebhookEventType } from './payment/types.js';
import { recordCommissionEvent, reverseCommissionEvent, syncReferralStatusFromSubscription, recordCommissionEventFailure } from './referral.service.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

// payment_deleted e subscription_deleted NÃO entram aqui de propósito: o
// endpoint asaas-cancel-subscription já deleta a assinatura no Asaas para
// parar as próximas cobranças, e isso dispara esses dois eventos de volta.
// Se eles rebaixassem o status na hora, o "cancelar mas continuar até o fim
// do período pago" quebraria — o usuário perderia o acesso no mesmo instante
// em que clicasse em cancelar. Quem decide quando o status vira 'canceled'
// de fato é o cron diário (ver maintenance.ts), comparando current_period_end.
const STATUS_MAP: Partial<Record<NormalizedWebhookEventType, string>> = {
  payment_confirmed: 'active',
  payment_overdue: 'past_due',
  payment_refunded: 'past_due',
  payment_chargeback: 'past_due',
};

export async function handleAsaasWebhook(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const gateway = getPaymentGateway('asaas');
  if (!gateway.verifyWebhookAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const event = gateway.normalizeWebhookEvent(req.body || {});
    if (event.type === 'ignored' || !event.gatewaySubscriptionId) {
      return res.status(200).json({ received: true, ignored: true });
    }

    let subscriptionRow: { id: string } | null = null;
    const nextStatus = STATUS_MAP[event.type];
    if (nextStatus) {
      const { data } = await supabase.from('subscriptions')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('asaas_subscription_id', event.gatewaySubscriptionId)
        .select('id')
        .maybeSingle();
      subscriptionRow = data;
      if (subscriptionRow) {
        await syncReferralStatusFromSubscription(subscriptionRow.id, nextStatus)
          .catch(err => console.error('[referral] syncReferralStatusFromSubscription:', err));
      }
    }

    // Só agora que o Asaas confirmou o recebimento do pagamento é que o cupom
    // (se houver) é marcado como usado — evita queimar o cupom de quem nunca pagou.
    const refUserId = event.externalReference?.split(':')[0] || null;
    if (event.type === 'payment_confirmed') {
      const parts = event.externalReference?.split(':') || [];
      const [, , , couponCode] = parts;
      if (refUserId && couponCode) {
        const { data: coupon } = await supabase
          .from('coupons')
          .select('id, uses_count')
          .eq('code', couponCode)
          .maybeSingle();
        if (coupon) {
          const { data: used } = await supabase.from('coupon_uses')
            .select('id').eq('coupon_id', coupon.id).eq('user_id', refUserId).maybeSingle();
          if (!used) {
            await supabase.from('coupon_uses').insert({ coupon_id: coupon.id, user_id: refUserId });
            await supabase.from('coupons').update({ uses_count: (coupon.uses_count || 0) + 1 }).eq('id', coupon.id);
          }
        }
      }
    }

    // Comissão de indicação: cada pagamento confirmado do indicado gera um
    // evento de comissão (com carência) para quem o indicou, se houver.
    if (event.type === 'payment_confirmed' && event.gatewayPaymentId && event.amountCents != null && refUserId) {
      const { data: referral } = await supabase
        .from('affiliate_referrals')
        .select('id, subscription_id')
        .eq('referred_user_id', refUserId)
        .maybeSingle();

      if (referral) {
        if (!referral.subscription_id && subscriptionRow?.id) {
          await supabase.from('affiliate_referrals').update({ subscription_id: subscriptionRow.id }).eq('id', referral.id);
        }
        const recordParams = {
          referralId: referral.id,
          subscriptionId: subscriptionRow?.id || referral.subscription_id,
          gateway: gateway.name,
          gatewayPaymentId: event.gatewayPaymentId,
          chargeAmountCents: event.amountCents,
        };
        await recordCommissionEvent(recordParams).catch(err => {
          console.error('[referral] recordCommissionEvent:', err);
          return recordCommissionEventFailure('record', recordParams, err);
        });
      }
    }

    // Estorno/chargeback: cancela a comissão daquele pagamento específico.
    if ((event.type === 'payment_refunded' || event.type === 'payment_chargeback') && event.gatewayPaymentId) {
      const reverseParams = {
        gateway: gateway.name,
        gatewayPaymentId: event.gatewayPaymentId,
        reason: event.type,
      };
      await reverseCommissionEvent(reverseParams).catch(err => {
        console.error('[referral] reverseCommissionEvent:', err);
        return recordCommissionEventFailure('reverse', reverseParams, err);
      });
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('asaas-webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
