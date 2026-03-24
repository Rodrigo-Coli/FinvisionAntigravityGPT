import React, { useState, useEffect } from 'react';
import { Sparkles, Check, Loader2, Tag, X } from 'lucide-react';
import { useSubscription } from './SubscriptionGate';

const PLAN_HIGHLIGHTS: Record<string, string[]> = {
  essencial: ['10 scans de IA/mês', 'Conciliação bancária', 'Importação OFX', 'Metas e orçamentos'],
  pro: ['50 scans de IA/mês', 'Comparador de preços', 'Diagnóstico patrimonial', 'Alertas WhatsApp'],
  familia: ['500 scans de IA/mês', 'Até 5 usuários', 'Tudo do Pro incluído', 'Suporte dedicado'],
};

export default function UpgradeModal() {
  const { subscription, isAdmin } = useSubscription();
  const [visible, setVisible] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [couponCode, setCouponCode] = useState('');
  const [couponMsg, setCouponMsg] = useState('');
  const [loadingCoupon, setLoadingCoupon] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState(false);

  useEffect(() => {
    // Show when trial expired
    if (!isAdmin && subscription) {
      const isExpired = subscription.status === 'trialing' &&
        subscription.trial_ends_at &&
        new Date(subscription.trial_ends_at) < new Date();
      const isPastDue = subscription.status === 'past_due';
      setVisible(isExpired || isPastDue);
    }
  }, [subscription, isAdmin]);

  useEffect(() => {
    // Load paid plans
    fetch('/api/public-plans')
      .then(r => r.json())
      .then(data => setPlans((data || []).filter((p: any) => p.price_cents > 0 && p.slug !== 'especial')))
      .catch(() => {});
  }, []);

  const validateCoupon = async () => {
    if (!couponCode.trim()) return;
    setLoadingCoupon(true);
    setCouponMsg('');
    try {
      const res = await fetch('/api/apply-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: (window as any).__userId, couponCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setCouponMsg(`✅ ${data.message}`);
        if (data.success) setTimeout(() => window.location.reload(), 1500);
      } else {
        setCouponMsg(`❌ ${data.error}`);
      }
    } catch {
      setCouponMsg('❌ Erro ao validar cupom.');
    } finally {
      setLoadingCoupon(false);
    }
  };

  const startCheckout = async () => {
    setLoadingCheckout(true);
    try {
      const res = await fetch('/api/asaas-create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: (window as any).__userId,
          planSlug: selectedPlan,
          paymentMethod: 'PIX',
          couponCode: couponCode || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`✅ Assinatura criada! Você receberá o PIX por e-mail em breve.\nPlano: ${data.plan}`);
        window.location.reload();
      } else {
        alert(`Erro: ${data.error}`);
      }
    } catch {
      alert('Erro ao iniciar assinatura.');
    } finally {
      setLoadingCheckout(false);
    }
  };

  if (!visible) return null;

  const formatPrice = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}` ;
  const selectedPlanData = plans.find(p => p.slug === selectedPlan);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 p-10 text-center relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-brand-500/20 rounded-full blur-2xl" />
          <div className="w-14 h-14 bg-white/5 border border-white/10 rounded-[20px] flex items-center justify-center mx-auto mb-4">
            <Sparkles size={28} className="text-brand-400" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">Seu trial expirou</h2>
          <p className="text-slate-400 mt-2 font-medium">Escolha um plano para continuar usando o FinVision.</p>
        </div>

        <div className="p-8 space-y-6">
          {/* Plan selector */}
          <div className="grid grid-cols-3 gap-3">
            {plans.map(plan => (
              <button
                key={plan.slug}
                onClick={() => setSelectedPlan(plan.slug)}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${
                  selectedPlan === plan.slug
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-slate-100 hover:border-slate-200'
                }`}
              >
                <p className="font-black text-slate-900 text-sm">{plan.name}</p>
                <p className="text-brand-600 font-bold text-xs mt-0.5">{formatPrice(plan.price_cents)}<span className="text-slate-400">/mês</span></p>
                {plan.slug === 'pro' && (
                  <span className="inline-block mt-1.5 px-2 py-0.5 bg-brand-600 text-white text-[9px] font-bold uppercase tracking-wider rounded-full">Popular</span>
                )}
              </button>
            ))}
          </div>

          {/* Highlights */}
          {selectedPlanData && PLAN_HIGHLIGHTS[selectedPlan] && (
            <div className="space-y-2">
              {PLAN_HIGHLIGHTS[selectedPlan].map((h, i) => (
                <div key={i} className="flex items-center gap-3 text-sm text-slate-600">
                  <Check size={16} className="text-emerald-500 shrink-0" />
                  {h}
                </div>
              ))}
            </div>
          )}

          {/* Coupon */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={couponCode}
                  onChange={e => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="Código de cupom"
                  className="w-full h-11 bg-slate-50 rounded-xl pl-10 pr-4 font-bold text-slate-900 text-sm border-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <button
                onClick={validateCoupon}
                disabled={!couponCode.trim() || loadingCoupon}
                className="px-4 h-11 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest disabled:opacity-40 hover:bg-brand-600 transition-all"
              >
                {loadingCoupon ? <Loader2 size={14} className="animate-spin" /> : 'Aplicar'}
              </button>
            </div>
            {couponMsg && <p className="text-sm font-medium pl-1">{couponMsg}</p>}
          </div>

          {/* CTA */}
          <button
            onClick={startCheckout}
            disabled={loadingCheckout || !selectedPlan}
            className="w-full h-14 bg-brand-600 text-white rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-brand-700 transition-all shadow-xl shadow-brand-500/20 disabled:opacity-40 active:scale-95 flex items-center justify-center gap-3"
          >
            {loadingCheckout ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {loadingCheckout ? 'Aguarde...' : `Assinar via PIX — ${selectedPlanData ? formatPrice(selectedPlanData.price_cents) : '...'}/mês`}
          </button>

          <p className="text-center text-xs text-slate-400 font-medium">
            Você receberá o QR Code PIX por e-mail. Cancele a qualquer momento.
          </p>
        </div>
      </div>
    </div>
  );
}
