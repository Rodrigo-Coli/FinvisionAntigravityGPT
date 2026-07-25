import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import { useAuth } from './AuthContext';

export interface SubscriptionData {
  id: string;
  plan_id: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'admin_granted';
  billing_period?: 'monthly' | 'semiannual' | 'annual';
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end?: boolean;
  canceled_at?: string | null;
  metadata?: any;
  plans?: {
    name: string;
    slug?: string;
    features: any;
    price_cents: number;
    price_cents_annual?: number;
    price_cents_semiannual?: number;
    ai_scans_limit: number;
    max_cards?: number;
    max_accounts?: number;
  };
}

interface SubscriptionContextType {
  subscription: SubscriptionData | null;
  loadingSub: boolean;
  refreshSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  subscription: null,
  loadingSub: true,
  refreshSubscription: async () => {},
});

export const useSubscription = () => useContext(SubscriptionContext);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loadingSub, setLoadingSub] = useState(true);

  const fetchSub = async () => {
    if (!user) {
      setSubscription(null);
      setLoadingSub(false);
      return;
    }
    setLoadingSub(true);
    try {
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('*, plans(*)')
        .eq('user_id', user.id)
        .maybeSingle();

      if (subData) {
        const isTrialExpired = subData.status === 'trialing' && subData.trial_ends_at && new Date(subData.trial_ends_at) < new Date();
        if (subData.status === 'past_due' || subData.status === 'canceled' || isTrialExpired) {
          const { data: starterPlan } = await supabase
            .from('plans')
            .select('*')
            .eq('slug', 'starter')
            .maybeSingle();
          if (starterPlan) {
            subData.plans = {
              name: starterPlan.name,
              features: starterPlan.features,
              price_cents: starterPlan.price_cents,
              ai_scans_limit: starterPlan.ai_scans_limit,
            };
          }
        }
        setSubscription(subData);
      } else {
        setSubscription(null);
      }
    } catch (err) {
      console.warn('Falha ao buscar assinatura, continuando sem dados de plano:', err);
      setSubscription(null);
    } finally {
      setLoadingSub(false);
    }
  };

  useEffect(() => {
    if (!loading) fetchSub();
  }, [user, loading]);

  return (
    <SubscriptionContext.Provider value={{ subscription, loadingSub, refreshSubscription: fetchSub }}>
      {children}
    </SubscriptionContext.Provider>
  );
};
