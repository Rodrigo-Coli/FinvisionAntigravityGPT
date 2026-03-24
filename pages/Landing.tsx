import React, { useState, useEffect } from 'react';
import { Sparkles, BarChart3, Store, Receipt, Brain, Shield, TrendingUp, Check, ChevronDown, ArrowRight, Star, Zap, Bell, CreditCard, Target, Users } from 'lucide-react';

const FEATURES = [
  {
    icon: <BarChart3 size={28} />,
    title: 'Dashboard Financeiro',
    description: 'Visão completa do seu patrimônio, contas, cartões e fluxo de caixa em tempo real.',
    color: 'bg-brand-50 text-brand-600',
  },
  {
    icon: <CreditCard size={28} />,
    title: 'Cartões de Crédito',
    description: 'Gerencie faturas, parcelas e limite de todos os seus cartões em um só lugar.',
    color: 'bg-violet-50 text-violet-600',
  },
  {
    icon: <Receipt size={28} />,
    title: 'Scanner de Cupom IA',
    description: 'Fotografe o cupom fiscal e a IA extrai e categoriza todos os itens automaticamente.',
    color: 'bg-emerald-50 text-emerald-600',
  },
  {
    icon: <Store size={28} />,
    title: 'Comparador de Preços',
    description: 'Descubra onde cada produto é mais barato e em quais lojas você gasta mais.',
    color: 'bg-amber-50 text-amber-600',
  },
  {
    icon: <Brain size={28} />,
    title: 'Diagnóstico Patrimonial',
    description: 'IA analisa toda sua vida financeira e entrega um plano de ação personalizado.',
    color: 'bg-rose-50 text-rose-600',
  },
  {
    icon: <Bell size={28} />,
    title: 'Alertas Inteligentes',
    description: 'Receba notificações no WhatsApp quando contas vencerem ou orçamentos dispararem.',
    color: 'bg-sky-50 text-sky-600',
  },
  {
    icon: <TrendingUp size={28} />,
    title: 'Minha Inflação',
    description: 'Veja a variação real dos preços dos produtos que você compra ao longo do tempo.',
    color: 'bg-orange-50 text-orange-600',
  },
  {
    icon: <Target size={28} />,
    title: 'Metas e Orçamentos',
    description: 'Defina metas de economia e orçamentos mensais por categoria com acompanhamento visual.',
    color: 'bg-teal-50 text-teal-600',
  },
];

const FAQ = [
  { q: 'Preciso cadastrar cartão para testar?', a: 'Não. Os 14 dias de trial são completamente gratuitos e sem cartão.' },
  { q: 'Meus dados financeiros são seguros?', a: 'Sim. Usamos Supabase com criptografia em repouso, Row Level Security (cada usuário só acessa seus próprios dados) e conexão HTTPS em todas as requisições.' },
  { q: 'Como funciona o Scanner de Cupom?', a: 'Você fotografa ou faz upload do cupom fiscal. Nossa IA (Google Gemini) extrai todos os itens, quantidades e preços e já os categoriza automaticamente.' },
  { q: 'Posso cancelar a qualquer momento?', a: 'Sim. Cancele com apenas um clique nas configurações. Você não receberá cobranças após o cancelamento.' },
  { q: 'Existe plano gratuito permanente?', a: 'Sim. O plano Free inclui dashboard, contas bancárias e cartões sem prazo de expiração.' },
  { q: 'Vocês têm programa de afiliados?', a: 'Sim! Ganhe 20% de comissão por cada assinante que você indicar. Cadastre-se na área de afiliados dentro do app.' },
];

export default function Landing() {
  const [plans, setPlans] = useState<any[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    // Load plans from Supabase at runtime
    fetch('/api/public-plans')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setPlans(data); })
      .catch(() => {
        // Fallback static plans if API fails
        setPlans([
          { name: 'Free', slug: 'free', price_cents: 0, ai_scans_limit: 0, features: {} },
          { name: 'Essencial', slug: 'essencial', price_cents: 1490, ai_scans_limit: 10, features: {} },
          { name: 'Pro', slug: 'pro', price_cents: 2990, ai_scans_limit: 50, features: {} },
          { name: 'Família', slug: 'familia', price_cents: 4990, ai_scans_limit: 500, features: {} },
        ]);
      });
  }, []);

  const formatPrice = (cents: number) =>
    cents === 0 ? 'Grátis' : `R$ ${(cents / 100).toFixed(2).replace('.', ',')}` ;

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="min-h-screen bg-white font-sans antialiased">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-600 rounded-xl flex items-center justify-center">
              <Sparkles size={16} className="text-white" />
            </div>
            <span className="font-bold text-slate-900 text-lg">FinVision</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            {[['Funcionalidades', 'features'], ['Planos', 'pricing'], ['FAQ', 'faq']].map(([label, id]) => (
              <button key={id} onClick={() => scrollTo(id)}
                className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <a href="/login" className="text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors">Entrar</a>
            <a href="/signup"
              className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-brand-600 transition-all shadow-lg">
              Começar Grátis
            </a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="pt-32 pb-24 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-brand-50/40 to-transparent pointer-events-none" />
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-50 border border-brand-100 rounded-full text-brand-700 text-xs font-bold uppercase tracking-widest mb-8">
            <Sparkles size={12} />
            Powered by Google Gemini AI
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-slate-900 tracking-tight mb-6 leading-none">
            Sua vida financeira,
            <br />
            <span className="text-brand-600">inteligente.</span>
          </h1>
          <p className="text-xl text-slate-500 font-medium max-w-2xl mx-auto mb-12 leading-relaxed">
            O único app financeiro com IA que escaneia seus cupons, compara preços entre lojas
            e faz um diagnóstico completo do seu patrimônio.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/signup"
              className="inline-flex items-center justify-center gap-3 px-10 py-5 bg-slate-900 text-white rounded-2xl font-bold text-base hover:bg-brand-600 transition-all shadow-xl shadow-slate-900/10 active:scale-95">
              <Sparkles size={20} />
              Começar Grátis — 14 dias
            </a>
            <a href="/demo"
              className="inline-flex items-center justify-center gap-3 px-10 py-5 bg-white text-slate-700 rounded-2xl font-bold text-base border border-slate-200 hover:border-brand-300 hover:text-brand-600 transition-all">
              Ver Demo
              <ArrowRight size={18} />
            </a>
          </div>
          <p className="mt-6 text-sm text-slate-400 font-medium">Sem cartão de crédito. Cancele quando quiser.</p>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="py-10 px-6 border-y border-slate-50 bg-slate-50/50">
        <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-10">
          {[
            { value: 'IA Gemini', label: 'Tecnologia' },
            { value: '100%', label: 'Dados isolados por usuário' },
            { value: 'PIX & Boleto', label: 'Formas de pagamento' },
            { value: '14 dias', label: 'Trial gratuito' },
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <p className="text-2xl font-black text-slate-900">{stat.value}</p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[10px] font-bold text-brand-600 uppercase tracking-[0.3em] mb-3">Funcionalidades</p>
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">Tudo que você precisa,
              <br />em um só lugar.
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((feat, i) => (
              <div key={i} className="bg-white border border-slate-100 rounded-[28px] p-8 hover:border-brand-100 hover:shadow-lg transition-all group">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${feat.color} mb-6 group-hover:scale-110 transition-all`}>
                  {feat.icon}
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{feat.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{feat.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-24 px-6 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[10px] font-bold text-brand-600 uppercase tracking-[0.3em] mb-3">Planos</p>
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">Simples e transparente.</h2>
            <p className="text-slate-500 mt-4 font-medium">14 dias grátis em todos os planos pagos. Sem cartão.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {(plans.length > 0 ? plans : [
              { name: 'Free', slug: 'free', price_cents: 0, ai_scans_limit: 0 },
              { name: 'Essencial', slug: 'essencial', price_cents: 1490, ai_scans_limit: 10 },
              { name: 'Pro', slug: 'pro', price_cents: 2990, ai_scans_limit: 50 },
              { name: 'Família', slug: 'familia', price_cents: 4990, ai_scans_limit: 500 },
            ]).filter(p => p.slug !== 'especial').map((plan: any, i: number) => {
              const isPopular = plan.slug === 'pro';
              return (
                <div key={plan.slug} className={`relative bg-white rounded-[32px] p-8 border transition-all ${
                  isPopular ? 'border-brand-200 shadow-xl shadow-brand-100 ring-2 ring-brand-400' : 'border-slate-100'
                }`}>
                  {isPopular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full">
                      Mais Popular
                    </div>
                  )}
                  <h3 className="font-black text-slate-900 text-xl mb-1">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-4xl font-black text-slate-900">{formatPrice(plan.price_cents)}</span>
                    {plan.price_cents > 0 && <span className="text-slate-400 text-sm font-medium">/mês</span>}
                  </div>
                  <div className="space-y-2 mb-8">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Check size={16} className="text-emerald-500 shrink-0" />
                      {plan.ai_scans_limit === -1 ? 'IA ilimitada' :
                       plan.ai_scans_limit === 0 ? 'Sem uso de IA' :
                       `${plan.ai_scans_limit} scans de IA/mês`}
                    </div>
                    {[
                      plan.slug !== 'free' && 'Conciliação bancária',
                      plan.slug !== 'free' && 'Importação OFX',
                      (plan.slug === 'pro' || plan.slug === 'familia') && 'Comparador de preços',
                      (plan.slug === 'pro' || plan.slug === 'familia') && 'Diagnóstico patrimonial',
                      (plan.slug === 'pro' || plan.slug === 'familia') && 'Alertas WhatsApp',
                      plan.slug === 'familia' && 'Até 5 usuários',
                    ].filter(Boolean).map((feat, j) => (
                      <div key={j} className="flex items-center gap-2 text-sm text-slate-600">
                        <Check size={16} className="text-emerald-500 shrink-0" />
                        {feat}
                      </div>
                    ))}
                  </div>
                  <a href={plan.price_cents === 0 ? '/signup' : `/signup?plan=${plan.slug}`}
                    className={`block w-full text-center py-3.5 rounded-2xl font-bold text-sm transition-all ${
                      isPopular
                        ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-lg shadow-brand-500/20'
                        : 'bg-slate-900 text-white hover:bg-slate-700'
                    }`}>
                    {plan.price_cents === 0 ? 'Começar Grátis' : 'Testar 14 dias'}
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[10px] font-bold text-brand-600 uppercase tracking-[0.3em] mb-3">FAQ</p>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">Dúvidas Frequentes</h2>
          </div>
          <div className="space-y-3">
            {FAQ.map((item, i) => (
              <div key={i} className="bg-white border border-slate-100 rounded-[20px] overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full p-6 flex items-center justify-between text-left">
                  <span className="font-bold text-slate-900">{item.q}</span>
                  <ChevronDown size={18} className={`text-slate-400 transition-transform shrink-0 ml-4 ${
                    openFaq === i ? 'rotate-180' : ''
                  }`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-6 text-slate-500 font-medium leading-relaxed border-t border-slate-50 pt-4">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto bg-slate-900 rounded-[48px] p-16 text-center relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-64 h-64 bg-brand-500/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl" />
          <div className="relative">
            <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-[20px] flex items-center justify-center mx-auto mb-8">
              <Sparkles size={32} className="text-brand-400" />
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-6">
              Comece gratuitamente hoje.
            </h2>
            <p className="text-slate-400 text-lg font-medium mb-12 max-w-xl mx-auto">
              Sem cartão de crédito. 14 dias de todas as funcionalidades Pro liberadas.
            </p>
            <a href="/signup"
              className="inline-flex items-center gap-3 px-12 py-5 bg-brand-600 text-white rounded-2xl font-bold text-base hover:bg-brand-500 transition-all shadow-xl shadow-brand-900/30 active:scale-95">
              <Sparkles size={20} />
              Criar Conta Grátis
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-100 py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center">
              <Sparkles size={14} className="text-white" />
            </div>
            <span className="font-bold text-slate-900">FinVision</span>
            <span className="text-slate-300 text-sm ml-2">by Automanow</span>
          </div>
          <div className="flex gap-6 text-sm font-medium text-slate-400">
            <a href="/privacy" className="hover:text-slate-700 transition-colors">Privacidade</a>
            <a href="/terms" className="hover:text-slate-700 transition-colors">Termos</a>
            <a href="mailto:contato@automanow.com.br" className="hover:text-slate-700 transition-colors">Contato</a>
          </div>
          <p className="text-sm text-slate-300">© 2025 Automanow. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
