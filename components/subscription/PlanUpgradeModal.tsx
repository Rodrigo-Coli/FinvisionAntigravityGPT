import React, { useState, useEffect } from 'react';
import { X, Check, Zap, Star, ArrowUpRight } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import AsaasCheckoutModal from './AsaasCheckoutModal';

interface PlanUpgradeModalProps {
  currentPlanId?: string;
  currentPlanSlug?: string;
  onClose: () => void;
}

export const FEATURE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard Financeiro',
  accounts: 'Contas Bancárias',
  cards: 'Cartões de Crédito',
  reconcile: 'Conciliação Bancária',
  ai_scanner: 'Scanner de Cupom IA',
  ai_comparator: 'Comparador de Preços',
  ai_diagnosis: 'Diagnóstico Patrimonial',
  goals: 'Metas Financeiras',
  reports_advanced: 'Relatórios Avançados',
  multi_user: 'Multi-usuário (Família)',
  priority_support: 'Suporte Prioritário',
  whatsapp_notifications: 'Notificações WhatsApp',
};

const PlanUpgradeModal: React.FC<PlanUpgradeModalProps> = ({ currentPlanId, currentPlanSlug, onClose }) => {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<any | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'semiannual' | 'annual'>('monthly');

  useEffect(() => {
    const fetchPlans = async () => {
      if (!supabase) return;
      const { data } = await supabase
        .from('plans')
        .select('*')
        .eq('is_active', true)
        .gt('price_cents', 0)
        .order('price_cents');
      if (data) setPlans(data);
      setLoading(false);
    };
    fetchPlans();
  }, []);

  const isCurrent = (plan: any) => plan.id === currentPlanId || plan.slug === currentPlanSlug;

  const handleUpgradeRequest = (plan: any) => {
    setSelectedPlan(plan);
  };

  const getPlanPriceDisplay = (plan: any) => {
    let cents = plan.price_cents;
    if (billingPeriod === 'semiannual') cents = plan.price_cents_semiannual || (plan.price_cents * 6);
    if (billingPeriod === 'annual') cents = plan.price_cents_annual || (plan.price_cents * 12);
    
    const value = cents / 100;
    if (billingPeriod === 'annual') {
      return {
        monthly: (value / 12).toFixed(2).replace('.', ','),
        total: value.toFixed(2).replace('.', ','),
        label: 'faturado R$ ' + value.toFixed(2).replace('.', ',') + '/ano'
      };
    }
    if (billingPeriod === 'semiannual') {
      return {
        monthly: (value / 6).toFixed(2).replace('.', ','),
        total: value.toFixed(2).replace('.', ','),
        label: 'faturado R$ ' + value.toFixed(2).replace('.', ',') + '/semestre'
      };
    }
    return {
      monthly: value.toFixed(2).replace('.', ','),
      total: value.toFixed(2).replace('.', ','),
      label: 'faturado mensalmente'
    };
  };

  const getHighlightedFeatures = (plan: any): string[] => {
    if (!plan.features) return [];
    return Object.entries(plan.features)
      .filter(([k, v]) => v && FEATURE_LABELS[k])
      .slice(0, 4)
      .map(([k]) => FEATURE_LABELS[k]);
  };

  const planColors = [
    'from-slate-600 to-slate-800',
    'from-brand-500 to-brand-700',
    'from-violet-500 to-purple-700',
    'from-amber-500 to-rose-600',
    'from-emerald-500 to-teal-700',
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white italic">Planos Disponíveis</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">Escolha o plano ideal para suas necessidades</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-8">
          {/* Billing Period Toggle */}
          <div className="flex items-center justify-center gap-2 mb-8 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl max-w-sm mx-auto">
            <button
              type="button"
              onClick={() => setBillingPeriod('monthly')}
              className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
                billingPeriod === 'monthly'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              Mensal
            </button>
            <button
              type="button"
              onClick={() => setBillingPeriod('semiannual')}
              className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all relative ${
                billingPeriod === 'semiannual'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              Semestral
              <span className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider scale-75">
                -10%
              </span>
            </button>
            <button
              type="button"
              onClick={() => setBillingPeriod('annual')}
              className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all relative ${
                billingPeriod === 'annual'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              Anual
              <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider scale-75">
                -20%
              </span>
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {plans.map((plan, idx) => {
                const current = isCurrent(plan);
                const features = getHighlightedFeatures(plan);
                const gradient = planColors[idx % planColors.length];
                const price = getPlanPriceDisplay(plan);

                return (
                  <div
                    key={plan.id}
                    className={`relative rounded-[28px] overflow-hidden bg-white dark:bg-slate-900 border-2 transition-all ${
                      current
                        ? 'border-brand-500 shadow-xl shadow-brand-500/20 scale-[1.02]'
                        : 'border-slate-100 dark:border-slate-800 hover:border-brand-200 hover:shadow-lg hover:scale-[1.01]'
                    }`}
                  >
                    {/* Card gradient header */}
                    <div className={`bg-gradient-to-br ${gradient} p-6 text-white`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.2em] text-white/70 mb-1">{plan.slug?.toUpperCase()}</p>
                          <h3 className="text-xl font-black">{plan.name}</h3>
                        </div>
                        {current && (
                          <span className="bg-white/20 backdrop-blur-sm text-white text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border border-white/30 flex items-center gap-1">
                            <Check size={10} /> Seu plano
                          </span>
                        )}
                        {idx === 1 && !current && (
                          <span className="bg-white/20 backdrop-blur-sm text-white text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border border-white/30 flex items-center gap-1">
                            <Star size={10} /> Popular
                          </span>
                        )}
                      </div>
                      <div className="mt-4">
                        <span className="text-3xl font-black">
                          R$ {price.monthly}
                        </span>
                        <span className="text-white/60 text-sm font-medium"> /mês</span>
                      </div>
                      <p className="text-[9px] font-black text-white/75 uppercase tracking-wider mt-1">{price.label}</p>
                      <div className="mt-4 flex items-center gap-2">
                        <Zap size={12} className="text-white/70" />
                        <span className="text-xs font-bold text-white/80">
                          {plan.ai_scans_limit === -1 ? 'Scans de IA ilimitados' : plan.ai_scans_limit === 0 ? 'Sem IA' : `${plan.ai_scans_limit} scans de IA /mês`}
                        </span>
                      </div>
                    </div>

                    {/* Features */}
                    <div className="p-5 space-y-3">
                      {plan.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">{plan.description}</p>
                      )}
                      <ul className="space-y-2">
                        {features.map((feat, i) => (
                          <li key={i} className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                            <Check size={12} className="text-emerald-500 flex-shrink-0" />
                            {feat}
                          </li>
                        ))}
                        {features.length === 0 && (
                          <li className="text-xs text-slate-400 italic">Funcionalidades básicas</li>
                        )}
                      </ul>

                      {current ? (
                        <div className="w-full py-3 bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400 rounded-2xl font-black uppercase tracking-widest text-[10px] text-center border border-brand-100 dark:border-brand-900/30">
                          Plano Atual
                        </div>
                      ) : (
                        <button
                          onClick={() => handleUpgradeRequest(plan)}
                          className="w-full py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-brand-600 dark:hover:bg-brand-50 transition-all flex items-center justify-center gap-2"
                        >
                          Assinar Agora <ArrowUpRight size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-center text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-8">
            Assinaturas geradas e processadas de forma 100% segura através do Checkout Transparente.
          </p>
        </div>
      </div>

      {selectedPlan && (
        <AsaasCheckoutModal
          plan={selectedPlan}
          period={billingPeriod}
          onClose={() => setSelectedPlan(null)}
        />
      )}
    </div>
  );
};

export default PlanUpgradeModal;
