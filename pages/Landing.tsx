import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase/client';
import { ArrowRight, Menu, X } from 'lucide-react';
import { trackEvent, withUtmParams, captureUtmParams, initScrollDepthTracking } from '../lib/analytics';

import HeroSection from '../components/landing/HeroSection';
import ProductShowcase from '../components/landing/ProductShowcase';
import ProfileSelector from '../components/landing/ProfileSelector';
import ValueAnchor from '../components/landing/ValueAnchor';
import DifferentiatorsSection from '../components/landing/DifferentiatorsSection';
import EcosystemSection from '../components/landing/EcosystemSection';
import PrivacySection from '../components/landing/PrivacySection';
import ComparisonTable from '../components/landing/ComparisonTable';
import TestimonialsSection from '../components/landing/TestimonialsSection';
import FaqSection from '../components/landing/FaqSection';
import PricingSection from '../components/landing/PricingSection';

export default function Landing() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [annualBilling, setAnnualBilling] = useState(false);

  // Robust state initialization with fallbacks
  const [plans, setPlans] = useState<any[]>([
    { id: '1', name: 'Essencial', slug: 'essential', price_cents: 1990, price_cents_annual: 19900, ai_scans_limit: 60, features: ['1 Gestão de Conta', '60 Ações IA/mês', 'Suporte Básico'] },
    { id: '2', name: 'Plus', slug: 'plus', price_cents: 3990, price_cents_annual: 39900, ai_scans_limit: 125, features: ['Contas Ilimitadas', '125 Ações IA/mês', 'Diagnóstico Patrimonial', 'Fila de Conciliação'], featured: true },
    { id: '3', name: 'Pro', slug: 'pro', price_cents: 5990, price_cents_annual: 59900, ai_scans_limit: 175, features: ['Advisor Patrimonial Inteligente (IA)', '175 Ações IA/mês', 'Inflação Pessoal Exata', 'Gestão Multi-moedas'] }
  ]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    captureUtmParams();

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    const stopScrollDepthTracking = initScrollDepthTracking();

    const fetchPlans = async () => {
      if (!supabase) return;
      try {
        const { data } = await supabase.from('plans').select('*').eq('is_active', true).order('sort_order', { ascending: true });
        if (data && data.length > 0) {
          const essentialPlan = data.find((p: any) => p.slug === 'essential') || data.find((p: any) => p.slug === 'essencial');
          const plusPlan = data.find((p: any) => p.slug === 'plus') || data.find((p: any) => p.slug === 'familia');
          const proPlan = data.find((p: any) => p.slug === 'pro');

          const filtered = [essentialPlan, plusPlan, proPlan].filter(Boolean);
          if (filtered.length > 0) {
            const hasFeatured = filtered.some((p: any) => p.featured);
            const mappedPlans = filtered.map((p: any) => {
              let feats = p.features;
              if (p.slug === 'pro' && Array.isArray(feats)) {
                feats = feats.map((f: any) => f === 'Wealth Advisor Dedicado' ? 'Advisor Patrimonial Inteligente (IA)' : f);
              }
              const planItem = { ...p, features: feats };
              if (!hasFeatured && p.slug === 'plus') {
                planItem.featured = true;
              }
              return planItem;
            });
            setPlans(mappedPlans);
          }
        }
      } catch (e) {}
    };

    fetchPlans();
    return () => {
      window.removeEventListener('scroll', handleScroll);
      stopScrollDepthTracking();
    };
  }, []);

  // Bloqueio de scroll ao abrir menu mobile (mitigação para iOS Safari e vazamento de scroll)
  useEffect(() => {
    if (mobileMenuOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0', 10) * -1);
      }
    }
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen bg-[#020617] text-white font-sans selection:bg-brand-500/30 selection:text-brand-300 overflow-x-hidden">

      {/* HEADER / NAVBAR (GLASSMORPHISM) */}
      <nav
        style={{ transform: 'translate3d(0, 0, 50px)', WebkitTransform: 'translate3d(0, 0, 50px)' }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${isScrolled ? 'bg-[#020617]/80 backdrop-blur-xl border-b border-white/5 shadow-2xl py-4' : 'bg-transparent py-6'}`}
      >
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 flex justify-between items-center">
          <div className="flex items-center cursor-pointer" onClick={() => window.scrollTo(0, 0)}>
            <img src="/logo-lockup-nav.png" alt="Zyvion" className="h-14 md:h-16 w-auto object-contain" />
          </div>

          <div className="hidden md:flex items-center gap-10">
            <a href="#produto" onClick={(e) => { e.preventDefault(); scrollToSection('produto'); }} className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">O Produto</a>
            <a href="#ecosystem" onClick={(e) => { e.preventDefault(); scrollToSection('ecosystem'); }} className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">Ecossistema</a>
            <a href="#pricing" onClick={(e) => { e.preventDefault(); scrollToSection('pricing'); }} className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">Licenças</a>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <Link to="/login" className="text-xs font-bold text-slate-300 hover:text-white uppercase tracking-widest transition-colors">Acessar Conta</Link>
            <Link
              to={withUtmParams('/demo')}
              onClick={() => trackEvent('demo_click', { location: 'nav' })}
              className="relative group text-xs font-bold text-slate-900 bg-white px-8 py-3 rounded-xl overflow-hidden hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_-5px_rgba(255,255,255,0.4)] flex items-center justify-center min-h-[44px]"
            >
              <span className="relative z-10 flex items-center gap-2 uppercase tracking-widest">Testar Demo <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" /></span>
            </Link>
          </div>

          <button className="md:hidden text-white p-2 min-h-[44px] min-w-[44px]" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}>
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      {/* MOBILE MENU OVERLAY (Z-100 PARA FICAR ACIMA DE TUDO) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[100] md:hidden bg-[#020617] h-[100dvh] w-full flex flex-col items-center justify-center animate-in fade-in slide-in-from-top duration-300">
          <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center bg-[#020617]/80 backdrop-blur-md border-b border-white/5">
            <div className="flex items-center">
              <img src="/logo-lockup-nav.png" alt="Zyvion" className="h-11 w-auto object-contain" />
            </div>
            <button className="text-white p-2 min-h-[44px] min-w-[44px]" onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu">
              <X size={28} />
            </button>
          </div>

          <div className="flex flex-col items-center gap-8 w-full px-8 mt-16">
            <a href="#produto" onClick={(e) => { e.preventDefault(); setMobileMenuOpen(false); scrollToSection('produto'); }} className="text-xl font-bold text-slate-300 hover:text-white uppercase tracking-widest text-center">O Produto</a>
            <a href="#ecosystem" onClick={(e) => { e.preventDefault(); setMobileMenuOpen(false); scrollToSection('ecosystem'); }} className="text-xl font-bold text-slate-300 hover:text-white uppercase tracking-widest text-center">Ecossistema</a>
            <a href="#pricing" onClick={(e) => { e.preventDefault(); setMobileMenuOpen(false); scrollToSection('pricing'); }} className="text-xl font-bold text-slate-300 hover:text-white uppercase tracking-widest text-center">Licenças</a>

            <div className="w-full h-px bg-white/10 my-4" />

            <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="w-full py-4 text-lg font-bold text-white uppercase tracking-widest bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center min-h-[44px]">Acessar Conta</Link>
            <Link
              to={withUtmParams('/demo')}
              onClick={() => { setMobileMenuOpen(false); trackEvent('demo_click', { location: 'mobile_menu' }); }}
              className="w-full py-5 bg-white text-slate-900 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-2xl flex items-center justify-center min-h-[44px]"
            >
              Testar Demo
            </Link>
          </div>
        </div>
      )}

      <main>
        <HeroSection />
        <ProductShowcase />
        <ProfileSelector />
        <ValueAnchor plans={plans} />
        <DifferentiatorsSection />
        <EcosystemSection />
        <PrivacySection />
        <ComparisonTable />
        <TestimonialsSection />
        <FaqSection />
        <PricingSection plans={plans} annualBilling={annualBilling} onToggleBilling={setAnnualBilling} />

        {/* CTA FINAL */}
        <section className="py-24 md:py-32 relative z-10 bg-[#020617] border-t border-white/5 text-center overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-brand-600/10 rounded-full blur-[150px] pointer-events-none" />
          <div className="max-w-2xl mx-auto px-6 relative z-10">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-6 text-white">Pare de descobrir tarde demais para onde foi o seu dinheiro.</h2>
            <p className="text-slate-400 text-lg mb-10">Entre agora na demo gratuita, já preenchida com dados reais para você explorar sem compromisso.</p>
            <Link
              to={withUtmParams('/demo')}
              onClick={() => trackEvent('demo_click', { location: 'final_cta' })}
              className="inline-flex items-center gap-3 px-12 py-6 bg-white text-slate-900 rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:bg-slate-100 hover:scale-105 transition-all shadow-[0_0_50px_-10px_rgba(255,255,255,0.5)] min-h-[44px]"
            >
              Testar Demo Grátis <ArrowRight size={20} />
            </Link>
          </div>
        </section>
      </main>

      {/* FOOTER ULTRA DARK */}
      <footer className="bg-black py-16 text-center text-slate-400 font-medium relative border-t border-white/5 pb-32 md:pb-16">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 flex flex-col items-center">
          <img src="/logo-icon.png" alt="Zyvion" className="w-12 h-12 object-contain mb-6" />
          <h4 className="text-2xl font-black text-white tracking-tight mb-2">Zyvion</h4>
          <p className="text-slate-400 text-sm mb-10 max-w-sm">Elevando a barra do controle financeiro com tecnologia de inteligência artificial de ponta.</p>

          <div className="flex gap-8 mb-10 border-b border-white/5 pb-10 w-full justify-center">
            <Link to="/terms" className="font-bold text-[10px] uppercase tracking-widest hover:text-white transition-colors">Termos de Uso</Link>
            <Link to="/privacy" className="font-bold text-[10px] uppercase tracking-widest hover:text-white transition-colors">Privacidade</Link>
            <a href="mailto:suporte@automanow.com.br" className="font-bold text-[10px] uppercase tracking-widest hover:text-white transition-colors">Contato</a>
          </div>

          <p className="text-[10px] font-bold uppercase tracking-widest">© {new Date().getFullYear()} ZIntec LTDA. O Motor por Trás do Seu Sucesso.</p>
        </div>
      </footer>

      {/* BARRA STICKY MOBILE COM CTA PRINCIPAL */}
      <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-[#020617]/95 backdrop-blur-xl border-t border-white/10 p-4 pb-safe">
        <Link
          to={withUtmParams('/demo')}
          onClick={() => trackEvent('demo_click', { location: 'sticky_mobile_bar' })}
          className="w-full py-4 bg-white text-slate-900 rounded-xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 min-h-[44px]"
        >
          Testar Demo Grátis <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
