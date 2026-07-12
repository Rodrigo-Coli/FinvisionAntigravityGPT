import React, { useEffect, useState } from 'react';
import { Sparkles, X, ArrowUpRight } from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { supabase } from '../lib/supabase/client';
import PlanUpgradeModal, { FEATURE_LABELS } from './subscription/PlanUpgradeModal';

const STORAGE_KEY = 'fv_upsell_last_shown_at';
const MIN_DAYS_BETWEEN = 30;

// Aviso discreto ao abrir o app destacando benefícios de um plano superior
// — no máximo 1x a cada 30 dias (controlado por localStorage), nunca mais
// que isso. Não aparece para quem já está no plano mais alto.
export default function PlanUpsellNudge() {
  const { subscription, loadingSub } = useSubscription();
  const [nextPlan, setNextPlan] = useState<any | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [showFullModal, setShowFullModal] = useState(false);

  useEffect(() => {
    if (loadingSub || !subscription || !supabase) return;
    if (subscription.status !== 'active' && subscription.status !== 'trialing') return;

    const lastShown = localStorage.getItem(STORAGE_KEY);
    if (lastShown) {
      const daysSince = (Date.now() - new Date(lastShown).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < MIN_DAYS_BETWEEN) return;
    }

    const currentPriceCents = subscription.plans?.price_cents || 0;

    supabase.from('plans')
      .select('id, name, slug, price_cents, features')
      .eq('is_active', true)
      .gt('price_cents', currentPriceCents)
      .order('price_cents', { ascending: true })
      .limit(1)
      .then(({ data }: { data: any[] | null }) => {
        if (data && data[0]) {
          setNextPlan(data[0]);
          setDismissed(false);
        }
      });
  }, [loadingSub, subscription]);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    setDismissed(true);
  };

  if (dismissed || !nextPlan) return null;

  const highlights: string[] = nextPlan.features
    ? Object.entries(nextPlan.features).filter(([k, v]) => v && FEATURE_LABELS[k]).slice(0, 3).map(([k]) => FEATURE_LABELS[k])
    : [];

  return (
    <>
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-[400] bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-2xl p-5 animate-in slide-in-from-bottom duration-300">
        <button onClick={dismiss} className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <X size={14} />
        </button>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 shrink-0 bg-gradient-to-tr from-brand-600 to-indigo-500 rounded-2xl flex items-center justify-center text-white shadow-lg">
            <Sparkles size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wide">Conheça o plano {nextPlan.name}</p>
            {highlights.length > 0 && (
              <ul className="mt-2 space-y-1">
                {highlights.map(h => (
                  <li key={h} className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-brand-500 shrink-0" /> {h}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <button
          onClick={() => { setShowFullModal(true); dismiss(); }}
          className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-brand-600 dark:hover:bg-brand-50 transition-all"
        >
          Ver plano completo <ArrowUpRight size={13} />
        </button>
      </div>

      {showFullModal && (
        <PlanUpgradeModal
          currentPlanId={subscription?.plan_id}
          onClose={() => setShowFullModal(false)}
        />
      )}
    </>
  );
}
