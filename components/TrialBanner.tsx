import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock } from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';

export default function TrialBanner() {
  const navigate = useNavigate();
  const { subscription, loadingSub } = useSubscription();

  if (loadingSub || !subscription || subscription.status !== 'trialing' || !subscription.trial_ends_at) return null;

  const now = new Date();
  const endsAt = new Date(subscription.trial_ends_at);
  const daysLeft = Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) return null; // Será pego pelo UpgradeModal

  return (
    <div className="w-full bg-indigo-600 px-4 py-2.5 flex items-center justify-center gap-4 text-white z-50">
      <div className="flex items-center gap-2">
        <Clock size={16} className="text-indigo-200" />
        <span className="text-sm font-medium">
          Você está no período de teste do plano <strong className="font-bold">{subscription.plans?.name || 'Pro'}</strong>. Faltam <strong className="font-bold">{daysLeft} dias</strong>.
        </span>
      </div>
      <button 
        onClick={() => navigate('/admin/planos')} 
        className="px-4 py-1 bg-white text-indigo-900 text-xs font-bold rounded hover:bg-indigo-50 transition-colors uppercase tracking-widest"
      >
        Assinar Agora
      </button>
    </div>
  );
}
