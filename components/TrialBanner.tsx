import React, { useState } from 'react';
import { Clock, X, Sparkles, ArrowRight } from 'lucide-react';
import { useSubscription } from './SubscriptionGate';

export default function TrialBanner() {
  const { subscription, plan, isAdmin } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  if (isAdmin || dismissed || !subscription) return null;
  if (subscription.status !== 'trialing') return null;

  const trialEnd = subscription.trial_ends_at ? new Date(subscription.trial_ends_at) : null;
  if (!trialEnd) return null;

  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  if (daysLeft <= 0) return null; // show UpgradeModal instead

  const isUrgent = daysLeft <= 3;

  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-6 py-4 rounded-2xl shadow-2xl border transition-all animate-in slide-in-from-bottom duration-500 ${
      isUrgent
        ? 'bg-rose-600 border-rose-500 text-white'
        : 'bg-slate-900 border-slate-700 text-white'
    }`}>
      <Clock size={18} className={isUrgent ? 'text-rose-200' : 'text-slate-400'} />
      <p className="text-sm font-bold">
        {isUrgent
          ? `⚠️ Apenas ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'} de trial restante!`
          : `Trial gratuito: ${daysLeft} ${daysLeft === 1 ? 'dia restante' : 'dias restantes'}`
        }
      </p>
      <a
        href="#/upgrade"
        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
          isUrgent
            ? 'bg-white text-rose-600 hover:bg-rose-50'
            : 'bg-brand-600 text-white hover:bg-brand-500'
        }`}
      >
        <Sparkles size={12} />
        Assinar
        <ArrowRight size={12} />
      </a>
      <button
        onClick={() => setDismissed(true)}
        className="ml-1 p-1 rounded-lg opacity-50 hover:opacity-100 transition-opacity"
      >
        <X size={14} />
      </button>
    </div>
  );
}
