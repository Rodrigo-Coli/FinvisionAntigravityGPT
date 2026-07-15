import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import PlanUpgradeModal from './PlanUpgradeModal';

export default function GracefulDowngradeBanner() {
  const { subscription, loadingSub } = useSubscription();
  const [showPlans, setShowPlans] = useState(false);

  if (loadingSub || !subscription) return null;

  const isTrialExpired = subscription.status === 'trialing' && subscription.trial_ends_at && new Date(subscription.trial_ends_at) < new Date();
  const isPastDue = subscription.status === 'past_due';
  const isCanceled = subscription.status === 'canceled';

  if (!isPastDue && !isCanceled && !isTrialExpired) return null;

  let message = '';
  if (isTrialExpired) {
    message = 'Seu período de teste do Zyvion acabou. Seus limites foram reduzidos para o plano Starter (Gratuito).';
  } else if (isPastDue) {
    message = 'Sua assinatura possui uma fatura pendente. Seus limites foram temporariamente reduzidos para o plano Starter (Gratuito).';
  } else {
    message = 'Sua assinatura foi cancelada. Seus limites foram reduzidos para o plano Starter (Gratuito).';
  }

  return (
    <>
      <div className="w-full bg-orange-600 dark:bg-orange-700 px-4 py-2.5 flex flex-col sm:flex-row items-center justify-center gap-3 text-white z-50 text-center sm:text-left transition-all">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-orange-200 flex-shrink-0 animate-pulse" />
          <span className="text-xs font-semibold leading-relaxed">
            {message} <strong className="font-bold">Todos os seus dados históricos continuam salvos e acessíveis em modo de leitura.</strong>
          </span>
        </div>
        <button 
          onClick={() => setShowPlans(true)} 
          className="px-4 py-1.5 bg-white text-orange-950 text-[10px] font-black rounded-lg hover:bg-orange-50 transition-colors uppercase tracking-widest whitespace-nowrap shadow-md shadow-orange-950/20"
        >
          Regularizar Agora
        </button>
      </div>

      {showPlans && (
        <PlanUpgradeModal
          currentPlanId={subscription.plan_id}
          currentPlanSlug={isTrialExpired ? 'starter' : undefined}
          onClose={() => setShowPlans(false)}
        />
      )}
    </>
  );
}
