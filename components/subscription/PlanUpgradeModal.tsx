import React, { useState, useEffect } from 'react';
import { X, Check, Zap, TrendingUp, Star, ArrowUpRight } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';

interface PlanUpgradeModalProps {
  currentPlanId?: string;
  currentPlanSlug?: string;
  onClose: () => void;
}

const FEATURE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard Financeiro',
  accounts: 'Contas Bancarias',
  cards: 'Cartoes de Credito',
  reconcile: 'Conciliacao Bancaria',
  ai_scanner: 'Scanner de Cupom IA',
  ai_comparator: 'Comparador de Precos',
  ai_diagnosis: 'Diagnostico Patrimonial',
  goals: 'Metas Financeiras',
  reports_advanced: 'Relatorios Avancados',
  multi_user: 'Multi-usuario (Familia)',
  priority_support: 'Suporte Prioritario',
  whatsapp_notifications: 'Notificacoes WhatsApp',
};

const PlanUpgradeModal: React.FC<PlanUpgradeModalProps> = ({ currentPlanId, currentPlanSlug, onClose }) => {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
    const msg = encodeURIComponent(
      `Ola! Gostaria de fazer upgrade do meu plano FinVision para o plano ${plan.name} (R$ ${(plan.price_cents / 100).toFixed(2).replace('.', ',')} /mes). Pode me ajudar?`
    );
    window.open(`https://wa.me/5511999999999?text=${msg}`, '_blank');
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
            <h2 className="text-2xl font-black text-slate-900 dark:text-white italic">Planos Disponiveis</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">Escolha o plano ideal para voce</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-8">
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

                return (
                  <div
                    key={plan.id}
                    className={`relative rounded-[28px] overflow-hidden border-2 transition-all ${
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
                          R$ {(plan.price_cents / 100).toFixed(2).replace('.', ',')}
                        </span>
                        <span className="text-white/60 text-sm font-medium"> /mes</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Zap size={12} className="text-white/70" />
                        <span className="text-xs font-bold text-white/80">
                          {plan.ai_scans_limit === -1 ? 'Scans ilimitados' : `${plan.ai_scans_limit} scans IA/mes`}
                        </span>
                      </div>
                    </div>

                    {/* Features */}
                    <div className="bg-white dark:bg-slate-900 p-5 space-y-3">
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
                          <li className="text-xs text-slate-400 italic">Funcionalidades basicas</li>
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
                          Solicitar Upgrade <ArrowUpRight size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-center text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-8">
            Para upgrades, entre em contato via WhatsApp ou e-mail. Nossa equipe ativara seu novo plano em instantes.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PlanUpgradeModal;
