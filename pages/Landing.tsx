import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase/client';
import { 
  ArrowRight, Sparkles, Brain, ShieldCheck, 
  TrendingUp, Expand, Store, LayoutDashboard, 
  Target, Calculator, ChevronRight, Menu, X, 
  Smartphone, BarChart3, Database, Lock, Receipt, Box, Check, MessageCircle, Info, HelpCircle
} from 'lucide-react';

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
  ai_shopping_list: 'Lista de Compras' 
};

export default function Landing() {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [annualBilling, setAnnualBilling] = useState(false);
  const [familyIncome, setFamilyIncome] = useState(15000);
  const [email, setEmail] = useState('');
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);
  
  // Robust state initialization with fallbacks
  const [plans, setPlans] = useState<any[]>([
    { id: '1', name: 'Essencial', slug: 'essential', price_cents: 1990, price_cents_annual: 19900, ai_scans_limit: 60, features: ['1 Gestão de Conta', '60 Ações IA/mês', 'Suporte Básico'] },
    { id: '2', name: 'Plus', slug: 'plus', price_cents: 3990, price_cents_annual: 39900, ai_scans_limit: 125, features: ['Contas Ilimitadas', '125 Ações IA/mês', 'Diagnóstico Patrimonial', 'Fila de Conciliação'], featured: true },
    { id: '3', name: 'Pro', slug: 'pro', price_cents: 4990, price_cents_annual: 49900, ai_scans_limit: 175, features: ['Advisor Patrimonial Inteligente (IA)', '175 Ações IA/mês', 'Inflação Pessoal Exata', 'Gestão Multi-moedas'] }
  ]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    
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
    return () => window.removeEventListener('scroll', handleScroll);
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
      
      {/* 1. HEADER / NAVBAR (GLASSMORPHISM) */}
      <nav 
        style={{ transform: 'translate3d(0, 0, 50px)', WebkitTransform: 'translate3d(0, 0, 50px)' }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${isScrolled ? 'bg-[#020617]/80 backdrop-blur-xl border-b border-white/5 shadow-2xl py-4' : 'bg-transparent py-6'}`}
      >
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 flex justify-between items-center">
          <div className="flex items-center cursor-pointer" onClick={() => window.scrollTo(0,0)}>
            <img src="/logo-lockup-nav.png" alt="Zyvion" className="h-14 md:h-16 w-auto object-contain" />
          </div>

          <div className="hidden md:flex items-center gap-10">
            <a href="#inteligencia" onClick={(e) => { e.preventDefault(); scrollToSection('inteligencia'); }} className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">A Mágica da IA</a>
            <a href="#ecosystem" onClick={(e) => { e.preventDefault(); scrollToSection('ecosystem'); }} className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">Ecossistema</a>
            <a href="#pricing" onClick={(e) => { e.preventDefault(); scrollToSection('pricing'); }} className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">Licenças</a>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <Link to="/login" className="text-xs font-bold text-slate-300 hover:text-white uppercase tracking-widest transition-colors">Acessar Conta</Link>
            <Link to="/demo" className="relative group text-xs font-bold text-slate-900 bg-white px-8 py-3 rounded-xl overflow-hidden hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_-5px_rgba(255,255,255,0.4)] flex items-center justify-center">
              <span className="relative z-10 flex items-center gap-2 uppercase tracking-widest">Testar Demo <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" /></span>
            </Link>
          </div>

          <button className="md:hidden text-white p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
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
            <button className="text-white p-2" onClick={() => setMobileMenuOpen(false)}>
              <X size={28} />
            </button>
          </div>
          
          <div className="flex flex-col items-center gap-8 w-full px-8 mt-16">
            <a href="#inteligencia" onClick={(e) => { e.preventDefault(); setMobileMenuOpen(false); scrollToSection('inteligencia'); }} className="text-xl font-bold text-slate-300 hover:text-white uppercase tracking-widest text-center">A Mágica da IA</a>
            <a href="#ecosystem" onClick={(e) => { e.preventDefault(); setMobileMenuOpen(false); scrollToSection('ecosystem'); }} className="text-xl font-bold text-slate-300 hover:text-white uppercase tracking-widest text-center">Ecossistema</a>
            <a href="#pricing" onClick={(e) => { e.preventDefault(); setMobileMenuOpen(false); scrollToSection('pricing'); }} className="text-xl font-bold text-slate-300 hover:text-white uppercase tracking-widest text-center">Licenças</a>
            
            <div className="w-full h-px bg-white/10 my-4" />
            
            <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="w-full py-4 text-lg font-bold text-white uppercase tracking-widest bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center">Acessar Conta</Link>
            <Link to="/demo" onClick={() => setMobileMenuOpen(false)} className="w-full py-5 bg-white text-slate-900 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-2xl flex items-center justify-center">Testar Demo</Link>
          </div>
        </div>
      )}

      <main>
        {/* 2. HERO SECTION ÉPICA */}
        <section className="relative pt-24 pb-16 md:pt-32 md:pb-24 lg:pt-40 lg:pb-40 overflow-hidden">
          {/* Animated Background Gradients & Grids */}
          <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-brand-600/10 rounded-full blur-[150px] mix-blend-screen animate-pulse pointer-events-none duration-10000" />
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
          
          <div 
            style={{ transform: 'translate3d(0, 0, 30px)', WebkitTransform: 'translate3d(0, 0, 30px)' }}
            className="relative max-w-[1400px] mx-auto px-6 lg:px-12 text-center z-30"
          >
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-brand-300 text-[10px] font-black uppercase tracking-[0.2em] mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 shadow-xl backdrop-blur-md">
              <Brain size={14} /> Introduzindo O Advisor Inteligente Autônomo
            </div>
            
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-white/90 to-slate-500 mb-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-1000 leading-[1.05]">
              O controle do seu patrimônio, <br className="hidden md:block" /> inteligente e no piloto automático.
            </h1>
            
            <p className="text-sm sm:text-base md:text-xl text-slate-400 font-medium mb-14 max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-150">
              Consolide suas contas, cartões, investimentos e imóveis em uma única tela. Esqueça planilhas confusas e digitação manual: nossa IA faz a conciliação bancária por você em segundos, com segurança de nível bancário e isolamento total de dados.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300">
              <Link to="/demo" className="w-full sm:w-auto px-10 py-5 bg-white text-slate-900 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-[0_0_50px_-10px_rgba(255,255,255,0.5)] hover:bg-slate-100 hover:scale-105 transition-all">
                Testar Demo Grátis <ArrowRight size={18} />
              </Link>
              <a href="#pricing" onClick={(e) => { e.preventDefault(); scrollToSection('pricing'); }} className="w-full sm:w-auto px-10 py-5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 backdrop-blur-md hover:border-brand-500/50 transition-all">
                Visualizar Licenças
              </a>
            </div>
            <p className="mt-6 text-slate-400 font-bold text-[10px] uppercase tracking-widest animate-in fade-in delay-700">* Sem cartão de crédito. Ambiente lotado de dados reais para teste imersivo.</p>
          </div>

          {/* SaaS Mockup / Hero Animated DOM */}
          <div className="relative max-w-[1000px] mx-auto mt-24 px-6 animate-in fade-in slide-in-from-bottom-24 duration-1000 delay-500 z-10">
            <div className="relative rounded-3xl border border-white/10 bg-brand-900/60 backdrop-blur-2xl shadow-[0_0_100px_rgba(79,70,229,0.15)] p-4 md:p-8 overflow-hidden transform perspective-1000 rotate-x-12 scale-100 hover:scale-[1.02] transition-transform duration-1000 group">
              
              {/* Fake Dashboard Header */}
              <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
                 <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 animate-pulse"></div>
                    <div>
                      <div className="w-32 h-3 bg-slate-700 rounded-full mb-2"></div>
                      <div className="w-20 h-2 bg-slate-800 rounded-full"></div>
                    </div>
                 </div>
                 <div className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]"><Check size={14} strokeWidth={3} /></div>
                 </div>
              </div>

              {/* Fake Dashboard Content */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 {/* Main Chart Area */}
                 <div className="col-span-2 bg-slate-950/50 rounded-2xl p-6 border border-white/5 relative overflow-hidden">
                    <div className="flex justify-between items-center mb-6">
                      <div className="w-40 h-4 bg-brand-500/80 rounded-full"></div>
                      <div className="w-16 h-4 bg-slate-800 rounded-full"></div>
                    </div>
                    {/* Fake Chart Lines */}
                    <div className="h-40 flex items-end gap-2">
                       {[30, 45, 20, 60, 40, 80, 50, 90, 70, 100].map((h, idx) => (
                         <div key={idx} className="w-full bg-gradient-to-t from-brand-600 to-indigo-400 rounded-t-sm transition-all duration-1000 ease-out fill-mode-forwards opacity-0 animate-[rise_1s_ease-out_forwards]" style={{ height: `${h}%`, animationDelay: `${idx * 100}ms` }}></div>
                       ))}
                    </div>
                 </div>

                 {/* Side Cards Area */}
                 <div className="space-y-4 hidden md:block">
                    {/* Wealth Advisor Mini Card */}
                    <div className="bg-slate-950/50 rounded-2xl p-5 border border-white/5 flex flex-col justify-between h-24 transform transition-transform hover:-translate-y-1">
                      <div className="flex items-center justify-between">
                         <div className="w-20 h-3 bg-slate-700 rounded-full"></div>
                         <Brain size={16} className="text-brand-400" />
                      </div>
                      <div className="w-12 h-6 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-md flex items-center justify-center">+ 14%</div>
                    </div>
                    {/* OCR Scanner Alert */}
                    <div className="bg-brand-900/20 rounded-2xl p-5 border border-brand-500/30 flex items-start gap-3 transform transition-transform hover:-translate-y-1">
                       <div className="w-8 h-8 bg-brand-500/30 rounded-lg flex items-center justify-center shrink-0">
                         <Receipt size={14} className="text-brand-300" />
                       </div>
                       <div className="pt-1">
                         <div className="w-24 h-2 bg-white/60 mb-2 rounded-full"></div>
                         <div className="w-full h-1.5 bg-white/30 rounded-full mb-1"></div>
                         <div className="w-3/4 h-1.5 bg-white/30 rounded-full"></div>
                       </div>
                    </div>
                 </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent z-10 pointer-events-none" />
            </div>
            
            {/* Glow beneath the DOM elements */}
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-brand-500/30 blur-[100px] pointer-events-none" />
          </div>

          <style dangerouslySetInnerHTML={{__html: `
            @keyframes rise {
              from { height: 0%; opacity: 0; }
              to { opacity: 1; }
            }
          `}} />
        </section>

        {/* 3. SOCIAL PROOF (BANK INTEGRATIONS) */}
        <section className="py-10 border-y border-white/5 bg-brand-900/30 relative z-10">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-8">Compatível com extratos das maiores instituições</p>
            <div className="flex flex-wrap justify-center gap-12 md:gap-24 opacity-40 grayscale contrast-200">
               <span className="text-2xl font-black tracking-tighter">Itaú</span>
               <span className="text-2xl font-black tracking-tighter">Nubank</span>
               <span className="text-2xl font-black tracking-tighter">XP</span>
               <span className="text-2xl font-black tracking-tighter">Santander</span>
               <span className="text-2xl font-black tracking-tighter">Bradesco</span>
            </div>
          </div>
        </section>

        {/* 4. A MÁGICA DA IA (BENTO GRID 🍎) */}
        <section id="inteligencia" className="py-32 relative z-10">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
            <div className="mb-16">
              <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-4 text-white">Inteligência Autônoma.</h2>
              <p className="text-slate-400 font-medium text-xl max-w-2xl">Não é um chat bobo. Construímos um ecossistema de redes neurais que lê papel, calcula tendências macroeconômicas e diagnostica suas dívidas em milissegundos.</p>
            </div>

            {/* BENTO GRID */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[300px]">
              
              {/* BENTO ITEM 1: Wealth Advisor (Large, span 2) */}
              <div className="md:col-span-2 row-span-2 bg-gradient-to-br from-slate-900 to-[#0B1120] border border-white/10 rounded-[40px] p-10 md:p-14 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-96 h-96 bg-brand-600/20 blur-[100px] rounded-full group-hover:bg-brand-500/30 transition-colors duration-1000" />
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <div>
                    <div className="w-14 h-14 bg-brand-500/20 border border-brand-500/30 text-brand-400 rounded-2xl flex items-center justify-center mb-6">
                      <Brain size={28} />
                    </div>
                    <h3 className="text-3xl font-black tracking-tight mb-4">Zyvion Advisor</h3>
                    <p className="text-slate-400 text-lg max-w-md leading-relaxed">Seu conselheiro patrimonial inteligente. Ele analisa seus ativos (Investimentos, Casas, Carros), cruza com suas dívidas e emite relatórios analíticos profundos e prontos para leitura, diagnosticando exatamente se a sua Riqueza está blindada ou derretendo frente à inflação.</p>
                  </div>
                  
                  {/* Mockup Fictício do Relatório */}
                  <div className="mt-8 bg-slate-950/80 backdrop-blur-md border border-white/10 p-6 rounded-3xl transform group-hover:-translate-y-2 transition-transform duration-500">
                    <div className="flex items-center gap-3 mb-4">
                      <Sparkles size={16} className="text-brand-500" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Dossiê Gerado</span>
                    </div>
                    <div className="space-y-3">
                      <div className="h-2 w-3/4 bg-slate-800 rounded animate-pulse"></div>
                      <div className="h-2 w-full bg-slate-800 rounded animate-pulse delay-75"></div>
                      <div className="h-2 w-5/6 bg-slate-800 rounded animate-pulse delay-150"></div>
                      <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/5">
                        <span className="text-xs font-bold text-slate-500">Compromissão de Renda</span>
                        <span className="text-sm font-black text-emerald-500">14% Seguro</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* BENTO ITEM 2: Inflação Pessoal (Span 1) */}
              <div className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 border border-white/10 rounded-[40px] p-8 relative overflow-hidden group backdrop-blur-md">
                <div className="absolute bottom-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
                  <TrendingUp size={120} />
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-white/5 border border-white/10 text-white rounded-xl flex items-center justify-center mb-6">
                    <BarChart3 size={24} />
                  </div>
                  <h3 className="text-2xl font-black tracking-tight mb-2">Inflação Pessoal</h3>
                  <p className="text-slate-400 text-sm">O IPCA não reflete a sua vida real. Nossa IA traça o gráfico histórico do preço do Leite, Café e Condomínio que VOCÊ paga.</p>
                </div>
              </div>

              {/* BENTO ITEM 3: WhatsApp AI (Span 1) */}
              <div className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 border border-white/10 rounded-[40px] p-8 relative overflow-hidden group backdrop-blur-md">
                <div className="absolute top-10 right-10 opacity-30 group-hover:opacity-100 transition-opacity duration-500 delay-100 text-brand-400">
                   <MessageCircle size={64} className="animate-pulse" />
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-white/5 border border-white/10 text-white rounded-xl flex items-center justify-center mb-6">
                    <MessageCircle size={24} />
                  </div>
                  <h3 className="text-2xl font-black tracking-tight mb-2">WhatsApp AI</h3>
                  <p className="text-slate-400 text-sm">Sua central de inteligência no WhatsApp. Mande uma foto de um cupom amassado ou um áudio rápido no caminho do carro. A IA processa, categoriza e lança tudo em 3 segundos.</p>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* 5. VISÃO CONSOLIDADORA */}
        <section id="ecosystem" className="py-32 relative z-10 bg-slate-950/50 border-y border-white/5">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
            <div className="text-center mb-24">
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-4 block">Ecossistema Financeiro</span>
              <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-6">Tudo em um único lugar.</h2>
              <p className="text-slate-400 font-medium text-xl max-w-2xl mx-auto">Feito para não ter que usar 5 aplicativos diferentes e planilhas corrompidas do Excel nunca mais na sua vida.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: <LayoutDashboard size={24} />, title: "Conciliador 1-Click", color: "text-brand-400", bg: "bg-brand-500/10", border: "border-brand-500/20", desc: "Seu mouse clica, a classificação acontece. Importe centenas de OFX/CSV em ritmo industrial." },
                { icon: <Target size={24} />, title: "Progressão de Metas", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", desc: "Acompanhe do 0% ao 100% daquele apartamento ou da sua viagem dos sonhos." },
                { icon: <Box size={24} />, title: "Patrimônio e Dívidas", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", desc: "Registre imóveis, veículos, consórcios e financiamentos calculando amortização." },
                { icon: <Store size={24} />, title: "Lista de Compras IA", color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20", desc: "Aviso algorítmico te enviando exatamente para o Mercado onde seus itens são mais baratos." }
              ].map((ft, i) => (
                <div key={i} className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 border border-white/10 rounded-[32px] p-8 hover:bg-slate-800 transition-colors">
                  <div className={`w-14 h-14 ${ft.bg} ${ft.border} border rounded-2xl flex items-center justify-center ${ft.color} mb-6`}>{ft.icon}</div>
                  <h3 className="text-xl font-bold mb-3 text-white">{ft.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed font-medium">{ft.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 6. CALLOUT DE SEGURANÇA E PRIVACIDADE RIGOROSA */}
        <section className="py-24 relative z-10 border-t border-white/5 bg-black">
           <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-full max-w-4xl h-64 bg-emerald-600/5 blur-[120px] rounded-full pointer-events-none" />
           <div className="max-w-[1400px] mx-auto px-6 lg:px-12 grid md:grid-cols-2 gap-16 items-center relative z-10">
              <div>
                <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                  <ShieldCheck size={32} />
                </div>
                <h2 className="text-4xl lg:text-5xl font-black tracking-tight mb-6">Seus dados não treinam a <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Inteligência Artificial Pública</span>.</h2>
                <p className="text-slate-400 text-lg font-medium max-w-xl mb-10 leading-relaxed">
                  Aplicativos grátis vendem o seu perfil de compra.<br/> 
                  O Zyvion funciona como um cofre digital inviolável. Nossa Inteligência Artificial processa seus extratos e cupons de forma isolada, sob a proteção de criptografia militar. Seu patrimônio permanece invisível para terceiros e 100% sob seu controle.
                </p>
                <div className="inline-flex flex-wrap items-center gap-4">
                  <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-300"><Lock size={16} className="text-emerald-500"/> AES-256 Bit</div>
                  <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-300"><Database size={16} className="text-emerald-500"/> Local Storage First</div>
                </div>
              </div>
              <div className="relative">
                 <div className="aspect-square w-full max-w-md mx-auto relative group">
                    <div className="absolute inset-0 border-2 border-emerald-500/20 rounded-full group-hover:scale-105 transition-transform duration-1000"></div>
                    <div className="absolute inset-4 border border-dashed border-emerald-500/30 rounded-full animate-spin-slow"></div>
                    <div className="absolute inset-16 bg-gradient-to-br from-emerald-900/50 to-slate-900 rounded-full flex flex-col items-center justify-center p-8 text-center shadow-2xl backdrop-blur-md border border-emerald-500/20">
                      <Lock size={48} className="text-emerald-400 mb-4" />
                      <span className="text-emerald-400 font-bold tracking-widest uppercase text-xs">Cofre Local Ativo</span>
                      <span className="text-slate-500 text-[10px] mt-2">Segurança de Nível Bancário</span>
                    </div>
                 </div>
              </div>
           </div>
        </section>

        {/* 6.5. US VS THEM (TABELA DE COMPARAÇÃO BOLD) */}
        <section className="py-24 md:py-32 relative z-10 bg-[#020617] border-t border-white/5">
          <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
            <div className="text-center mb-16">
              <h2 className="text-3xl lg:text-5xl font-black tracking-tight mb-4">Por que migrar para o <span className="text-brand-500">Zyvion</span>?</h2>
              <p className="text-slate-400 font-medium">Compare e descubra por que os métodos tradicionais custam o seu tempo e a sua privacidade.</p>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-white/10 bg-slate-950/30">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="p-6 font-bold text-slate-500 uppercase tracking-widest text-xs w-[35%]">Recurso & Segurança</th>
                    <th className="p-6 text-center border-l border-white/5 w-[20%]">
                      <span className="inline-block bg-white/5 border border-white/10 px-3 py-1 rounded-md text-slate-400 font-bold text-[10px] uppercase tracking-widest">Planilhas Excel</span>
                    </th>
                    <th className="p-6 text-center border-l border-white/5 w-[25%]">
                      <span className="inline-block bg-white/5 border border-white/10 px-3 py-1 rounded-md text-slate-400 font-bold text-[10px] uppercase tracking-widest">Apps Tradicionais (Mobills/Organizze)</span>
                    </th>
                    <th className="p-6 text-center border-l border-brand-500/30 bg-brand-900/10 w-[20%]">
                      <span className="inline-block bg-brand-500 text-white px-4 py-1.5 rounded-md font-black text-[10px] uppercase tracking-[0.2em] shadow-lg">Zyvion</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {[
                    { 
                      label: "Sincronização de Extratos", 
                      excel: "Manual (Copiar & Colar)", 
                      trad: "Exige Senha do Banco (Open Finance instável)", 
                      pro: "Upload OFX/CSV em 1-Click (Sem dar suas senhas)",
                      isShield: false 
                    },
                    { 
                      label: "Privacidade & Custódia de Dados", 
                      excel: "Local (Seguro, porém isolado)", 
                      trad: "Venda de Perfil de Consumo para Crédito/Publicidade", 
                      pro: "Cofre PostgreSQL RLS Isolado (Dados 100% seus)",
                      isShield: true 
                    },
                    { 
                      label: "Classificação Inteligente de Gastos", 
                      excel: "Manual ou Fórmulas Complexas", 
                      trad: "Regras Básicas por Nome (Falha em 40% dos casos)", 
                      pro: "IA Autônoma (LLM + OCR de Cupons Fiscais)",
                      isShield: false 
                    },
                    { 
                      label: "Conselho Patrimonial (Wealth Advisor)", 
                      excel: "Não possui", 
                      trad: "Dicas prontas e anúncios de empréstimos", 
                      pro: "Dossiê Profundo gerado por IA",
                      isShield: false 
                    },
                    { 
                      label: "Medição de Inflação Pessoal Real", 
                      excel: "Impossível", 
                      trad: "Usa apenas índices genéricos (IPCA)", 
                      pro: "Mapeamento item a item das suas compras",
                      isShield: false 
                    },
                    { 
                      label: "Entrada Rápida via Mobile", 
                      excel: "Péssima no Celular", 
                      trad: "Formulários longos e cheios de etapas", 
                      pro: "Envio Instantâneo de Áudio ou Foto por WhatsApp",
                      isShield: false 
                    }
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-6 px-6 font-bold text-slate-300">{row.label}</td>
                      <td className="p-6 text-center border-l border-white/5 text-slate-400 font-medium text-sm">{row.excel}</td>
                      <td className="p-6 text-center border-l border-white/5 text-slate-400 font-medium text-sm">{row.trad}</td>
                      <td className="p-6 text-center border-l border-brand-500/30 bg-brand-900/10 text-emerald-400 font-bold text-sm">
                        <span className="flex flex-col items-center gap-1.5">
                          {row.isShield ? <ShieldCheck size={18} className="mx-auto" /> : <Check size={18} strokeWidth={3} className="mx-auto" />}
                          <span className="text-[10px] text-brand-200">{row.pro}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 6.7. SOCIAL PROOF (TESTIMONIALS) */}
        <section className="py-24 relative z-10 bg-[#020617] border-t border-white/5">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
            <div className="text-center mb-16">
              <span className="text-[10px] font-black text-brand-400 uppercase tracking-[0.3em] mb-4 block">Depoimentos reais</span>
              <h2 className="text-3xl lg:text-5xl font-black tracking-tight mb-4 text-white">Quem usa, aprova e confia</h2>
              <p className="text-slate-400 font-medium max-w-xl mx-auto">Histórias de médicos, empresários e investidores que abandonaram o preenchimento manual de planilhas.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  quote: "Sem tempo para planilhas. Eu gravo áudios de gastos no caminho do consultório ou tiro foto do cupom e a IA categoriza tudo pelo WhatsApp em segundos. Salvou minha rotina.",
                  name: "Dra. Mariana S.",
                  role: "Médica Cardiologista",
                  avatar: "MS"
                },
                {
                  quote: "Separar gastos pessoais de PJ era um pesadelo. Com a conciliação inteligente do Zyvion, arrasto os extratos de 3 bancos diferentes e resolvo tudo em minutos, sem expor minhas senhas bancárias.",
                  name: "Thiago A.",
                  role: "Empreendedor & Diretor de Tecnologia",
                  avatar: "TA"
                },
                {
                  quote: "O que me convenceu foi a privacidade absoluta do cofre isolado. Meus dados financeiros não treinam modelos públicos. E o diagnóstico do Advisor Patrimonial Inteligente é cirúrgico.",
                  name: "Rodrigo C.",
                  role: "Investidor Qualificado & Engenheiro de Software",
                  avatar: "RC"
                }
              ].map((item, idx) => (
                <div key={idx} className="bg-gradient-to-br from-slate-900/50 to-slate-950/50 border border-white/10 rounded-[32px] p-8 backdrop-blur-md flex flex-col justify-between hover:border-brand-500/30 transition-all duration-300">
                  <div className="mb-8">
                    <div className="flex gap-1 text-brand-400 mb-6">
                      {[...Array(5)].map((_, i) => (
                        <span key={i} className="text-lg">★</span>
                      ))}
                    </div>
                    <p className="text-slate-300 text-sm leading-relaxed italic">"{item.quote}"</p>
                  </div>
                  <div className="flex items-center gap-4 pt-6 border-t border-white/5">
                    <div className="w-10 h-10 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-xs font-black text-brand-300">
                      {item.avatar}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-white">{item.name}</h4>
                      <p className="text-xs text-slate-500">{item.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 6.8. SIMULADOR FINANCEIRO INTERATIVO */}
        <section className="py-24 relative z-10 bg-[#020617] border-t border-white/5">
          <div className="max-w-[1000px] mx-auto px-6">
            <div className="relative rounded-[40px] border border-white/10 bg-gradient-to-br from-slate-900 to-indigo-950/40 p-8 md:p-14 overflow-hidden shadow-[0_0_80px_rgba(79,70,229,0.15)]">
              <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-brand-500/10 rounded-full blur-[100px] pointer-events-none" />
              
              <div className="grid md:grid-cols-2 gap-12 items-center relative z-10">
                <div>
                  <span className="text-[10px] font-black text-brand-400 uppercase tracking-[0.3em] mb-4 block">Simulador Interativo</span>
                  <h2 className="text-3xl font-black tracking-tight mb-4 text-white">Quanto você está deixando escapar?</h2>
                  <p className="text-slate-400 text-sm mb-8 leading-relaxed font-medium">
                    Arraste a barra para definir suas despesas/rendimentos mensais e veja quanto tempo e dinheiro você pode recuperar anualmente usando nossa Inteligência Artificial para eliminar desperdícios invisíveis.
                  </p>
                  
                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Renda / Despesa Mensal</span>
                        <span className="text-xl font-black text-white">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(familyIncome)}</span>
                      </div>
                      <input 
                        type="range" 
                        min="2000" 
                        max="50000" 
                        step="1000"
                        value={familyIncome} 
                        onChange={(e) => setFamilyIncome(Number(e.target.value))}
                        className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-brand-500"
                      />
                      <div className="flex justify-between text-[9px] font-bold text-slate-500 uppercase mt-2">
                        <span>R$ 2.000</span>
                        <span>R$ 50.000</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-white/5 rounded-3xl p-8 space-y-8 backdrop-blur-md">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Economia Anual Projetada (7.5%)</p>
                      <p className="text-2xl font-black text-emerald-400 font-mono tracking-tight">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(familyIncome * 0.075 * 12)}</p>
                      <p className="text-[10px] text-slate-500 leading-tight">Média de desperdícios eliminados por IA</p>
                    </div>
                    <div className="space-y-2 border-l border-white/5 pl-6">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Tempo Salvo Mensalmente</p>
                      <p className="text-2xl font-black text-indigo-400 font-mono tracking-tight">{Math.round(4 + (familyIncome / 10000))} horas</p>
                      <p className="text-[10px] text-slate-500 leading-tight">Substituindo conciliação e digitação manual</p>
                    </div>
                  </div>

                  <div className="border-t border-white/5 pt-6 space-y-4">
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Receba seu Diagnóstico Gratuito por E-mail</p>
                    {leadSubmitted ? (
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-bold leading-normal">
                        ✓ Diagnóstico enviado com sucesso! Verifique sua caixa de entrada em instantes para acessar seus Wealth Insights + Cupom de 20% no plano anual.
                      </div>
                    ) : (
                      <form onSubmit={(e) => {
                        e.preventDefault();
                        if (!email) return;
                        setIsSubmittingLead(true);
                        setTimeout(() => {
                          setIsSubmittingLead(false);
                          setLeadSubmitted(true);
                        }, 800);
                      }} className="flex flex-col sm:flex-row gap-3">
                        <input 
                          type="email" 
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="seu@email.com"
                          className="flex-1 px-5 py-4 bg-slate-900 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                        />
                        <button 
                          type="submit"
                          disabled={isSubmittingLead}
                          className="px-6 py-4 bg-white text-slate-900 hover:bg-slate-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap disabled:opacity-50"
                        >
                          {isSubmittingLead ? 'Enviando...' : 'Enviar Diagnóstico'}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PRICING BOLD */}
        <section id="pricing" className="py-32 relative z-10 bg-brand-900 border-t border-white/5">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
            <div className="text-center mb-20">
              <span className="text-[10px] font-black text-brand-400 uppercase tracking-[0.3em] mb-4 block">Invista em Organização</span>
              <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-8">Planos Transparente.<br/>Sem Entrelinhas.</h2>
              
              <div className="inline-flex bg-[#020617] p-2 rounded-2xl border border-white/10 relative shadow-inner">
                <button onClick={() => setAnnualBilling(false)} className={`px-10 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-colors relative z-10 ${!annualBilling ? 'text-slate-900 bg-white shadow-md' : 'text-slate-500 hover:text-white'}`}>Mensal</button>
                <button onClick={() => setAnnualBilling(true)} className={`px-10 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-colors relative z-10 ${annualBilling ? 'text-slate-900 bg-white shadow-md' : 'text-slate-500 hover:text-white'}`}>Anual <span className="text-emerald-500 ml-1">(-20%)</span></button>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-8 items-stretch max-w-6xl mx-auto">
              {plans.map((plan: any, i) => {
                const getPlanSegment = (slug: string) => {
                  if (slug === 'essential' || slug === 'essencial') return 'Ideal para organizar as primeiras contas';
                  if (slug === 'plus' || slug === 'familia') return 'Recomendado para famílias e investidores ativos';
                  if (slug === 'pro') return 'Ideal para patrimônios complexos e holdings';
                  return '';
                };

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
                      <div className="flex items-baseline gap-2 mb-8">
                        <span className="text-5xl font-black tracking-tighter">R${(annualBilling ? (plan.price_cents_annual || plan.price_cents * 10) / 12 / 100 : (plan.price_cents / 100)).toFixed(2).replace('.', ',')}</span>
                        <span className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">/mês</span>
                      </div>

                      <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-8 border-b border-white/10 pb-8">
                        {annualBilling ? `R$${((plan.price_cents_annual || plan.price_cents * 10) / 100).toFixed(2)} faturado 1x por ano.` : 'Faturado mensalmente. Cancele quando quiser.'}
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
                            list = sortedKeys.map(k => FEAT_LABELS[k] || k);
                          }

                          if (plan.ai_scans_limit && plan.ai_scans_limit > 0) {
                            const scanLimitStr = `${plan.ai_scans_limit} Ações IA/mês`;
                            if (!list.some(f => String(f).includes('Ações IA') || String(f).includes('Ação IA'))) {
                              list.unshift(scanLimitStr);
                            }
                          }

                          list = list.map(f => {
                            if (f === 'Wealth Advisor Dedicado') return 'Advisor Patrimonial Inteligente (IA)';
                            return f;
                          });

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
                        to={plan.price_cents > 0 ? `/signup?plan=${plan.slug}` : '/demo'}
                        className={`w-full py-6 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${plan.featured ? 'bg-brand-500 hover:bg-brand-400 text-white hover:scale-[1.02] shadow-xl shadow-brand-500/30' : 'bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/30'}`}
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

        {/* FAQ SECTION */}
        <section className="py-32 relative z-10 bg-[#020617] border-t border-white/5">
          <div className="max-w-3xl mx-auto px-6 lg:px-8">
            <div className="text-center mb-16">
               <h2 className="text-3xl md:text-5xl font-black tracking-tight text-white mb-4">Perguntas Frequentes</h2>
               <p className="text-slate-400">Elimine qualquer dúvida antes de começar.</p>
            </div>
            <div className="space-y-4">
               {[
                 { q: 'O sistema puxa o extrato direto do banco sozinho?', a: 'Para garantir 100% de segurança da sua senha bancária, não usamos Open Finance invasivo. Você exporta o arquivo OFX ou CSV do seu banco e arrasta para o nosso Conciliador 1-Click. A Inteligência Artificial categoriza tudo em segundos.' },
                 { q: 'Posso testar sem cadastrar cartão de crédito?', a: 'Com certeza! Nós desenhamos o exclusivo Modo Demo: ao clicar para vivenciar a ferramenta, você entra num ambiente isolado já preenchido com dados reais (contas, carros, casas) para aprender a usar sem compromisso.' },
                 { q: 'Como funciona o Escâner Neural de Cupons?', a: 'Basta abrir pelo celular (PWA), focar a câmera no cupom ou nota fiscal de supermercado, e a nossa IA vai identificar o nome de cada produto, valor, quantidade e classificar por categoria automaticamente.' },
                 { q: 'A Inteligência Artificial lê meus dados bancários?', a: 'Sim, de forma 100% segura e privada. Ela processa seus extratos em ambiente de segurança isolado, sem que nenhum humano ou Inteligência Artificial pública utilize seus dados para treinamento. Privacidade nível institucional.' }
               ].map((faq, i) => (
                 <details key={i} className="group bg-white/5 border border-white/10 rounded-2xl cursor-pointer">
                    <summary className="flex items-center justify-between font-bold text-white p-6 list-none group-open:text-brand-400">
                      {faq.q}
                      <ChevronRight className="transform group-open:rotate-90 transition-transform text-slate-500" size={20} />
                    </summary>
                    <div className="px-6 pb-6 text-slate-400 text-sm leading-relaxed border-t border-white/5 pt-4">
                      {faq.a}
                    </div>
                 </details>
               ))}
            </div>
          </div>
        </section>

      </main>

      {/* FOOTER ULTRA DARK */}
      <footer className="bg-black py-16 text-center text-slate-400 font-medium relative border-t border-white/5">
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
    </div>
  );
}



