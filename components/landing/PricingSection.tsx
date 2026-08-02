import React from 'react';
import { Link } from 'react-router-dom';
import { Check, Info } from 'lucide-react';
import { trackEvent, withUtmParams } from '../../lib/analytics';
import { applyFoundingDiscount } from '../../lib/foundingOffer';
import { useFoundingCountdown } from './FoundingBar';

const FEAT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard Financeiro',
  accounts: 'Contas Bancárias',
  cards: 'Cartões de Crédito',
  manual_transactions: 'Transações Manuais',
  categories: 'Categorias',
  reports_basic: 'Relatórios Básicos',
  reconcile: 'Conciliação Bancária',
  ofx_import: 'Importação OFX/CSV',
  ai_scanner: 'Scanner de Cupom IA',
  goals: 'Metas Financeiras',
  budgets: 'Orçamentos',
  physical_assets: 'Bens Físicos',
  liabilities: 'Dívidas e Passivos',
  reports_advanced: 'Relatórios Avançados',
  multi_user: 'Multi-usuário',
  priority_support: 'Suporte Prioritário',
  ai_comparator: 'Comparador de Preços',
  ai_diagnosis: 'Diagnóstico Patrimonial',
  ai_shopping_list: 'Lista de Compras',
};

function getPlanSegment(slug: string) {
  if (slug === 'essential' || slug === 'essencial') return 'Ideal para organizar as primeiras contas';
  if (slug === 'plus' || slug === 'familia') return 'Recomendado para famílias e investidores ativos';
  if (slug === 'pro') return 'Ideal para patrimônios complexos e holdings';
  return '';
}

const currency = (value: number) => value.toFixed(2).replace('.', ',');

interface PricingSectionProps {
  plans: any[];
  annualBilling: boolean;
  onToggleBilling: (annual: boolean) => void;
}

export default function PricingSection({ plans, annualBilling, onToggleBilling }: PricingSectionProps) {
  const founding = useFoundingCountdown();

  return (
    <section id="pricing" className="py-32 relative z-10 bg-brand-900 border-t border-white/5">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="text-center mb-20">
          <span className="text-[10px] font-black text-brand-400 uppercase tracking-[0.3em] mb-4 block">Invista em Organização</span>
          <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-8">Planos Transparentes.<br />Sem Entrelinhas.</h2>

          <div className="inline-flex bg-[#020617] p-2 rounded-2xl border border-white/10 relative shadow-inner mb-6">
            <button onClick={() => onToggleBilling(false)} className={`px-10 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-colors relative z-10 min-h-[44px] ${!annualBilling ? 'text-slate-900 bg-white shadow-md' : 'text-slate-500 hover:text-white'}`}>Mensal</button>
            <button onClick={() => onToggleBilling(true)} className={`px-10 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-colors relative z-10 min-h-[44px] ${annualBilling ? 'text-slate-900 bg-white shadow-md' : 'text-slate-500 hover:text-white'}`}>Anual <span className="text-emerald-500 ml-1">(-20%)</span></button>
          </div>

          {founding.active && (
            <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest">
              Turma Fundadora ativa: assine até o fim da contagem e trave este preço para sempre.
            </p>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-8 items-stretch max-w-6xl mx-auto">
          {plans.map((plan: any, i: number) => {
            const fullMonthlyPrice = annualBilling
              ? (plan.price_cents_annual || plan.price_cents * 10) / 12 / 100
              : plan.price_cents / 100;
            const fullMonthlyCents = annualBilling
              ? (plan.price_cents_annual || plan.price_cents * 10) / 12
              : plan.price_cents;
            const foundingMonthlyCents = founding.active ? applyFoundingDiscount(fullMonthlyCents) : fullMonthlyCents;
            const annualTotal = (plan.price_cents_annual || plan.price_cents * 10) / 100;
            const annualSavings = (plan.price_cents * 12 - (plan.price_cents_annual || plan.price_cents * 10)) / 100;

            return (
              <div key={i} className={`relative rounded-[40px] p-10 flex flex-col justify-between ${plan.featured ? 'bg-gradient-to-b from-brand-900 to-slate-900 border-2 border-brand-500 shadow-[0_0_80px_rgba(79,70,229,0.2)] transform md:-translate-y-6 z-20' : 'bg-white/5 border border-white/10 z-10'}`}>
                {plan.featured && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-5 py-2 bg-brand-500 text-white text-[9px] font-black uppercase tracking-[0.3em] rounded-full shadow-lg">
                    RECOMENDADO
                  </div>
                )}

                <div>
                  <span className="text-[9px] font-black text-brand-400 uppercase tracking-widest block mb-2">
                    {getPlanSegment(plan.slug)}
                  </span>
                  <h3 className={`text-3xl font-black tracking-tight mb-2 ${plan.featured ? 'text-white' : 'text-slate-300'}`}>{plan.name}</h3>

                  <div className="mb-2">
                    {founding.active ? (
                      <div className="flex items-baseline gap-3 flex-wrap">
                        <span className="text-5xl font-black tracking-tighter text-emerald-400">R${currency(foundingMonthlyCents / 100)}</span>
                        <span className="text-lg font-bold text-slate-500 line-through">R${currency(fullMonthlyPrice)}</span>
                        <span className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">/mês</span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black tracking-tighter">R${currency(fullMonthlyPrice)}</span>
                        <span className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">/mês</span>
                      </div>
                    )}
                  </div>
                  {founding.active && (
                    <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-6">Preço da Turma Fundadora — travado enquanto sua assinatura estiver ativa</p>
                  )}

                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-8 border-b border-white/10 pb-8">
                    {annualBilling
                      ? `R$${currency(annualTotal)} faturado 1x por ano (economia de R$${currency(annualSavings)}).`
                      : 'Faturado mensalmente. Cancele quando quiser.'}
                  </p>

                  <ul className="space-y-6 mb-12">
                    {(() => {
                      let list: string[] = [];
                      if (Array.isArray(plan.features)) {
                        list = [...plan.features];
                      } else if (typeof plan.features === 'object' && plan.features) {
                        const keys = Object.entries(plan.features).filter(([, v]) => v).map(([k]) => k);
                        const priorityKeys = ['accounts', 'reconcile', 'ai_scanner', 'ai_diagnosis', 'ai_comparator', 'physical_assets', 'liabilities', 'multi_user'];
                        const sortedKeys = keys.sort((a, b) => {
                          const idxA = priorityKeys.indexOf(a);
                          const idxB = priorityKeys.indexOf(b);
                          if (idxA === -1 && idxB === -1) return 0;
                          if (idxA === -1) return 1;
                          if (idxB === -1) return -1;
                          return idxA - idxB;
                        }).slice(0, 5);
                        list = sortedKeys.map((k) => FEAT_LABELS[k] || k);
                      }

                      if (plan.ai_scans_limit && plan.ai_scans_limit > 0) {
                        const scanLimitStr = `${plan.ai_scans_limit} Ações IA/mês`;
                        if (!list.some((f) => String(f).includes('Ações IA') || String(f).includes('Ação IA'))) {
                          list.unshift(scanLimitStr);
                        }
                      }

                      list = list.map((f) => (f === 'Wealth Advisor Dedicado' ? 'Advisor Patrimonial Inteligente (IA)' : f));

                      return list.map((ft: any, j: number) => {
                        const isAiFeature = String(ft).includes('Ações IA') || String(ft).includes('Ação IA');
                        return (
                          <li key={j} className="flex items-start gap-4">
                            <div className={`mt-0.5 rounded-full p-1 border ${plan.featured ? 'bg-brand-500/20 border-brand-500/50 text-brand-400' : 'bg-white/5 border-white/10 text-slate-400'}`}>
                              <Check size={12} strokeWidth={3} />
                            </div>
                            <span className={`text-sm font-bold ${plan.featured ? 'text-white' : 'text-slate-300'} flex items-center`}>
                              {String(ft)}
                              {isAiFeature && (
                                <div className="relative group/tooltip inline-block ml-1.5 cursor-help">
                                  <Info size={14} className="text-slate-500 hover:text-slate-300 inline-block -mt-0.5" />
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 hidden group-hover/tooltip:block bg-slate-950 text-[10px] text-slate-300 p-2.5 rounded-xl border border-white/10 shadow-2xl z-30 font-medium normal-case leading-normal text-left">
                                    1 Ação IA = 1 escaneamento de cupom via WhatsApp/App OR 1 análise de investimento do Advisor. Excedeu o limite? Continue usando funções manuais ilimitadas.
                                  </div>
                                </div>
                              )}
                            </span>
                          </li>
                        );
                      });
                    })()}
                  </ul>
                </div>

                <div>
                  <Link
                    to={plan.price_cents > 0 ? withUtmParams(`/signup?plan=${plan.slug}`) : withUtmParams('/demo')}
                    onClick={() => trackEvent('plan_click', { plan: plan.slug })}
                    className={`w-full py-6 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 min-h-[44px] ${plan.featured ? 'bg-brand-500 hover:bg-brand-400 text-white hover:scale-[1.02] shadow-xl shadow-brand-500/30' : 'bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/30'}`}
                  >
                    {plan.price_cents > 0 ? 'Assinar a Licença' : 'Experimentar Ferramenta'}
                  </Link>
                  <div className="text-center mt-3">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                      ✓ Garantia incondicional de 7 dias
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
