import React, { useEffect, useState, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase/client';
import { Lock, Sparkles, ArrowRight } from 'lucide-react';

interface SubscriptionContextType {
  plan: any;
  subscription: any;
  hasFeature: (featureKey: string) => boolean;
  canUseAI: () => boolean;
  incrementAIUsage: () => Promise<void>;
  isLoading: boolean;
  isAdmin: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  plan: null,
  subscription: null,
  hasFeature: () => false,
  canUseAI: () => false,
  incrementAIUsage: async () => {},
  isLoading: true,
  isAdmin: false,
});

export const useSubscription = () => useContext(SubscriptionContext);

export function SubscriptionProvider({ children, userId }: { children: React.ReactNode; userId: string }) {
  const [plan, setPlan] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetchSubscription();
  }, [userId]);

  const fetchSubscription = async () => {
    if (!supabase) return;
    setIsLoading(true);
    try {
      // Check admin role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      setIsAdmin(profile?.role === 'admin');

      // Fetch subscription + plan
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('*, plans(*)')
        .eq('user_id', userId)
        .single();

      if (sub) {
        setSubscription(sub);
        setPlan(sub.plans);
      } else {
        // Auto-create free subscription for new users
        const { data: freePlan } = await supabase
          .from('plans')
          .select('*')
          .eq('slug', 'free')
          .single();
        if (freePlan) {
          const { data: newSub } = await supabase
            .from('subscriptions')
            .insert({ user_id: userId, plan_id: freePlan.id, status: 'active' })
            .select('*, plans(*)')
            .single();
          if (newSub) {
            setSubscription(newSub);
            setPlan(freePlan);
          }
        }
      }
    } catch (err) {
      console.error('SubscriptionProvider error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const hasFeature = (featureKey: string): boolean => {
    if (isAdmin) return true; // admin always has everything
    if (!plan?.features) return false;
    return !!plan.features[featureKey];
  };

  const canUseAI = (): boolean => {
    if (isAdmin) return true;
    if (!plan) return false;
    if (plan.ai_scans_limit === -1) return true;  // unlimited
    if (plan.ai_scans_limit === 0) return false;  // none
    return (subscription?.ai_scans_used ?? 0) < plan.ai_scans_limit;
  };

  const incrementAIUsage = async () => {
    if (!supabase || !subscription || isAdmin) return;
    await supabase
      .from('subscriptions')
      .update({ ai_scans_used: (subscription.ai_scans_used || 0) + 1 })
      .eq('id', subscription.id);
    setSubscription((prev: any) => ({ ...prev, ai_scans_used: (prev.ai_scans_used || 0) + 1 }));
  };

  return (
    <SubscriptionContext.Provider value={{ plan, subscription, hasFeature, canUseAI, incrementAIUsage, isLoading, isAdmin }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

// Wrapper component: wraps any section that requires a specific plan feature
export function FeatureGate({ feature, children, planRequired = 'Pro' }: {
  feature: string;
  children: React.ReactNode;
  planRequired?: string;
}) {
  const { hasFeature, isLoading } = useSubscription();

  if (isLoading) return null;
  if (hasFeature(feature)) return <>{children}</>;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-30 blur-sm">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm rounded-[28px] z-10">
        <div className="text-center p-8">
          <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock size={24} className="text-white" />
          </div>
          <h3 className="font-bold text-slate-900 text-lg mb-2">Funcionalidade {planRequired}</h3>
          <p className="text-sm text-slate-500 mb-6">Faça upgrade do seu plano para desbloquear este recurso.</p>
          <a href="/upgrade"
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-brand-700 transition-all">
            <Sparkles size={14} />
            Ver Planos
            <ArrowRight size={14} />
          </a>
        </div>
      </div>
    </div>
  );
}
