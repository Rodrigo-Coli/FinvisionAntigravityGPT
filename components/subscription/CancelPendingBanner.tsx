import React, { useState } from 'react';
import { Clock } from 'lucide-react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { DateUtils } from '../../lib/dateUtils';
import AsaasCheckoutModal from './AsaasCheckoutModal';

// Mostra que a assinatura foi cancelada mas ainda está valendo (o usuário
// pagou até current_period_end e continua com acesso completo até lá).
// Some sozinho quando o cron diário rebaixa de fato na data — aí quem assume
// é o GracefulDowngradeBanner (status vira 'canceled').
export default function CancelPendingBanner() {
  const { subscription, loadingSub } = useSubscription();
  const [showReactivate, setShowReactivate] = useState(false);

  if (loadingSub || !subscription) return null;
  if (!subscription.cancel_at_period_end) return null;
  if (!['active', 'trialing'].includes(subscription.status)) return null;
  if (!subscription.plans) return null;

  return (
    <>
      <div className="w-full bg-slate-800 dark:bg-slate-900 px-4 py-2.5 flex flex-col sm:flex-row items-center justify-center gap-3 text-white z-50 text-center sm:text-left transition-all">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-slate-300 flex-shrink-0" />
          <span className="text-xs font-semibold leading-relaxed">
            Sua assinatura foi cancelada, mas continua ativa até{' '}
            <strong className="font-bold">
              {subscription.current_period_end ? DateUtils.formatDisplayDate(subscription.current_period_end) : '—'}
            </strong>. Depois disso você volta ao plano gratuito.
          </span>
        </div>
        <button
          onClick={() => setShowReactivate(true)}
          className="px-4 py-1.5 bg-white text-slate-900 text-[10px] font-black rounded-lg hover:bg-slate-100 transition-colors uppercase tracking-widest whitespace-nowrap shadow-md"
        >
          Reativar Assinatura
        </button>
      </div>

      {showReactivate && (
        <AsaasCheckoutModal
          plan={{
            id: subscription.plan_id,
            name: subscription.plans.name,
            slug: subscription.plans.slug || '',
            price_cents: subscription.plans.price_cents,
            price_cents_annual: subscription.plans.price_cents_annual,
            price_cents_semiannual: subscription.plans.price_cents_semiannual,
          }}
          period={subscription.billing_period || 'monthly'}
          onClose={() => setShowReactivate(false)}
        />
      )}
    </>
  );
}
