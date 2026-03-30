import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase/client';
import { 
  ArrowRight, Sparkles, Brain, ShieldCheck, 
  TrendingUp, Expand, Store, LayoutDashboard, 
  Target, Calculator, ChevronRight, Menu, X, 
  Smartphone, BarChart3, Database, Lock, Receipt, Box, Check, MessageCircle, Info, HelpCircle
} from 'lucide-react';

export default function Landing() {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [annualBilling, setAnnualBilling] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    
    const fetchPlans = async () => {
      if (!supabase) return;
      try {
        const { data } = await supabase.from('plans').select('*').order('price_monthly', { ascending: true });
        if (data && data.length > 0) {
          setPlans(data);
        } else {
          setPlans([
            { id: '1', name: 'Essencial', price_monthly: 19.90, price_annual: 199.00, max_ai_interactions: 60, features: ['1 Gestão de Conta', '60 Ações IA/mês', 'Suporte Básico'] },
            { id: '2', name: 'Plus', price_monthly: 39.90, price_annual: 399.00, max_ai_interactions: 125, features: ['Contas Ilimitadas', '125 Ações IA/mês', 'Diagnóstico Patrimonial', 'Fila de Conciliação'], featured: true },
            { id: '3', name: 'Pro', price_monthly: 49.90, price_annual: 499.00, max_ai_interactions: 175, features: ['Wealth Advisor Dedicado', '175 Ações IA/mês', 'Inflação Pessoal Exata', 'Gestão Multi-moedas'] }
          ]);
        }
      } catch (e) {}
    };
    
    fetchPlans();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Bloqueio de scroll ao abrir menu mobile
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen bg-[#020617] text-white font-sans selection:bg-brand-500/30 selection:text-brand-300 overflow-x-hidden">
      
      {/* 1. HEADER / NAVBAR (GLASSMORPHISM) */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${isScrolled ? 'bg-[#020617]/80 backdrop-blur-xl border-b border-white/5 shadow-2xl py-4' : 'bg-transparent py-6'}`}>
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo(0,0)}>
            <div className="w-10 h-10 bg-gradient-to-br from-brand-600 to-indigo-600 rounded-[14px] flex items-center justify-center text-white shadow-[0_0_20px_rgba(79,70,229,0.3)]">
              <Sparkles size={20} />
            </div>
            <span className="text-xl font-black tracking-tight text-white">FinVision<span className="text-brand-400">Pro</span></span>
          </div>

          <div className="hidden md:flex items-center gap-10">
            <a href="#inteligencia" className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">A Mágica da IA</a>
            <a href="#ecosystem" className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">Ecossistema</a>
            <a href="#pricing" className="text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">Licenças</a>
          </div>

          <div className="hidden md:flex items-center gap-6">
            <button onClick={() => navigate('/login')} className="text-xs font-bold text-slate-300 hover:text-white uppercase tracking-widest transition-colors">Acessar Conta</button>
            <button onClick={() => navigate('/demo')} className="relative group text-xs font-bold text-slate-900 bg-white px-8 py-3 rounded-xl overflow-hidden hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_-5px_rgba(255,255,255,0.4)]">
              <span className="relative z-10 flex items-center gap-2 uppercase tracking-widest">Vivenciar Agora <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" /></span>
            </button>
          </div>

          <button className="md:hidden text-white p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      {/* MOBILE MENU OVERLAY (Z-100 PARA FICAR ACIMA DE TUDO) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[100] md:hidden bg-[#020617] h-screen w-screen flex flex-col items-center justify-center animate-in fade-in slide-in-from-top duration-300">
          <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center bg-[#020617]/80 backdrop-blur-md border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-brand-600 to-indigo-600 rounded-lg flex items-center justify-center text-white">
                <Sparkles size={16} />
              </div>
              <span className="text-lg font-black tracking-tight text-white">FinVision<span className="text-brand-400">Pro</span></span>
            </div>
            <button className="text-white p-2" onClick={() => setMobileMenuOpen(false)}>
              <X size={28} />
            </button>
          </div>
          
          <div className="flex flex-col items-center gap-8 w-full px-8 mt-16">
            <a href="#inteligencia" onClick={() => setMobileMenuOpen(false)} className="text-xl font-bold text-slate-300 hover:text-white uppercase tracking-widest text-center">A Mágica da IA</a>
            <a href="#ecosystem" onClick={() => setMobileMenuOpen(false)} className="text-xl font-bold text-slate-300 hover:text-white uppercase tracking-widest text-center">Ecossistema</a>
            <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="text-xl font-bold text-slate-300 hover:text-white uppercase tracking-widest text-center">Licenças</a>
            
            <div className="w-full h-px bg-white/10 my-4" />
            
            <button onClick={() => { setMobileMenuOpen(false); navigate('/login'); }} className="w-full py-4 text-lg font-bold text-white uppercase tracking-widest bg-white/5 rounded-2xl border border-white/10">Acessar Conta</button>
            <button onClick={() => { setMobileMenuOpen(false); navigate('/demo'); }} className="w-full py-5 bg-white text-slate-900 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-2xl">Vivenciar Demo</button>
          </div>
        </div>
      )}

      <main>
        {/* 2. HERO SECTION ÉPICA */}
        <section className="relative pt-48 pb-24 lg:pt-64 lg:pb-40 overflow-hidden">
          {/* Animated Background Gradients & Grids */}
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-brand-600/10 rounded-full blur-[150px] mix-blend-screen animate-pulse pointer-events-none duration-10000" />
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />
          
          <div className="relative max-w-[1400px] mx-auto px-6 lg:px-12 text-center z-10">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-brand-300 text-[10px] font-black uppercase tracking-[0.2em] mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 shadow-xl backdrop-blur-md">
              <Brain size={14} /> Introduzindo O Wealth Advisor Autônomo
            </div>
            
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-white/90 to-slate-500 mb-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-1000 leading-[1.05]">
              O primeiro Private Banker<br className="hidden md:block"/>que cabe no seu bolso.
            </h1>
            
            <p className="text-lg md:text-xl text-slate-400 font-medium mb-14 max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-150">
              Esqueça o trabalho braçal de planilhas. <span className="text-white italic">Orquestre sua riqueza</span>. O FinVision importa, cataloga e diagnostica seu patrimônio automaticamente com extrema precisão utilizando IA.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300">
              <button onClick={() => navigate('/demo')} className="w-full sm:w-auto px-10 py-5 bg-white text-slate-900 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-[0_0_50px_-10px_rgba(255,255,255,0.5)] hover:bg-slate-100 hover:scale-105 transition-all">
                Entrar no Modo Demo Interativo <ArrowRight size={18} />
              </button>
              <button onClick={() => { document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }) }} className="w-full sm:w-auto px-10 py-5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 backdrop-blur-md hover:border-brand-500/50 transition-all">
                Visualizar Licenças
              </button>
            </div>
            <p className="mt-6 text-slate-500 font-bold text-[10px] uppercase tracking-widest animate-in fade-in delay-700">* Sem cartão de crédito. Ambiente lotado de dados reais para teste imersivo.</p>
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
              <div className="grid grid-cols-3 gap-6">
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
                 <div className="space-y-4">
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
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-8">Compatível com extratos das maiores instituições</p>
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
                    <h3 className="text-3xl font-black tracking-tight mb-4">FinVision Advisor</h3>
                    <p className="text-slate-400 text-lg max-w-md leading-relaxed">Analisa seus ativos (Casas, Carros, Investimentos), compara com as suas Dívidas (Passivos) e gera um dossiê escrito em Markdown diagnosticando exatamente se a sua Riqueza está subindo ou derretendo.</p>
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
              <div className="bg-brand-900 border border-white/10 rounded-[40px] p-8 relative overflow-hidden group">
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

              {/* BENTO ITEM 3: Escâner de Cupom (Span 1) */}
              <div className="bg-brand-900 border border-white/10 rounded-[40px] p-8 relative overflow-hidden group">
                <div className="absolute top-10 right-10 opacity-30 group-hover:opacity-100 transition-opacity duration-500 delay-100">
                   <div className="w-16 h-16 border-2 border-dashed border-brand-500 rounded-xl animate-spin-slow"></div>
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-white/5 border border-white/10 text-white rounded-xl flex items-center justify-center mb-6">
                    <Receipt size={24} />
                  </div>
                  <h3 className="text-2xl font-black tracking-tight mb-2">Escâner Extração</h3>
                  <p className="text-slate-400 text-sm">Tire uma foto amorfa de um cupom amassado do mercado. O Laboratório processa os itens por nome, preço e imposto 1 a 1 em segundos.</p>
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
                <div key={i} className="bg-brand-900 border border-white/5 rounded-[32px] p-8 hover:bg-slate-800 transition-colors">
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
                  O FinVision Pro usa um contêiner hermético. Nosso LLM processa seus cupons e contas bancárias estritamente em memória volátil, sob a proteção do <strong>Row-Level Security</strong> impenetrável do PostgreSQL. Seu patrimônio é e sempre será invisível para nós e para a internet.
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
                      <span className="text-slate-500 text-[10px] mt-2">RLS Constraint ENABLED</span>
                    </div>
                 </div>
              </div>
           </div>
        </section>

        {/* 6.5. US VS THEM (TABELA DE COMPARAÇÃO BOLD) */}
        <section className="py-32 relative z-10 bg-[#020617] border-t border-white/5">
          <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
            <div className="text-center mb-16">
              <h2 className="text-3xl lg:text-5xl font-black tracking-tight mb-4">Por que migrar para o <span className="text-brand-500">FinVision Pro</span>?</h2>
              <p className="text-slate-400 font-medium">As diferenças claras entre profissionais e amadores do seu dinheiro.</p>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-white/10 bg-slate-950/30">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="p-6 font-bold text-slate-500 uppercase tracking-widest text-xs w-[40%]">Capacidade Operacional</th>
                    <th className="p-6 text-center border-l border-white/5 w-[20%]">
                      <span className="inline-block bg-brand-900 px-3 py-1 rounded-md text-slate-500 font-bold text-[10px] uppercase tracking-widest">Planilhas Excel</span>
                    </th>
                    <th className="p-6 text-center border-l border-white/5 w-[20%]">
                      <span className="inline-block bg-brand-900 px-3 py-1 rounded-md text-slate-500 font-bold text-[10px] uppercase tracking-widest">Apps Genéricos</span>
                    </th>
                    <th className="p-6 text-center border-l border-brand-500/30 bg-brand-900/10 w-[20%]">
                      <span className="inline-block bg-brand-500 text-white px-4 py-1.5 rounded-md font-black text-[10px] uppercase tracking-[0.2em] shadow-lg">FinVision Pro</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {[
                    { label: "Conciliação Bancária via Upload (Algoritmo)", e: "Manual", a: "Não tem", f: "Automática em Segundos" },
                    { label: "Cálculo Exato de Patrimônio Líquido vs Dívida", e: "Manual", a: "Muito Básico", f: "Tempo Real com Gráficos" },
                    { label: "Extração de Cupons/Notas Fiscais (OCR Neural)", e: "Não", a: "Não", f: "Sim + Classificação IA" },
                    { label: "Gráfico de Inflação Pessoal Histórica", e: "Impossível", a: "Usa o IPCA", f: "Item a Item da Despensa" },
                    { label: "Relatórios de Wealth Advisor Autônomo", e: "Não", a: "Não", f: "Dossiê Profundo em Markdown" },
                    { label: "Privacidade Militar sem Venda de Dados", e: "Seguro", a: "Seus dados são o produto", f: "Cofre RLS Isolado" }
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-6 px-6 font-bold text-slate-300">{row.label}</td>
                      <td className="p-6 text-center border-l border-white/5 text-slate-500 font-medium text-sm">{row.e === "Não" ? <X className="mx-auto opacity-30" size={18}/> : row.e}</td>
                      <td className="p-6 text-center border-l border-white/5 text-slate-500 font-medium text-sm">{row.a === "Não" ? <X className="mx-auto opacity-30" size={18}/> : row.a}</td>
                      <td className="p-6 text-center border-l border-brand-500/30 bg-brand-900/10 text-emerald-400 font-bold text-sm">
                        {row.f.startsWith("Sim") || row.f.startsWith("Automática") || row.f.startsWith("Tempo") || row.f.startsWith("Item") || row.f.startsWith("Dossiê") || row.f.startsWith("Cofre") ? 
                          <span className="flex flex-col items-center gap-1.5">
                            {row.f.startsWith("Cofre") ? <ShieldCheck size={18} /> : <Check size={18} strokeWidth={3} />}
                            <span className="text-[10px] text-brand-200">{row.f}</span>
                          </span> 
                        : row.f}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              {plans.map((plan: any, i) => (
                <div key={i} className={`relative rounded-[40px] p-10 flex flex-col justify-between ${plan.featured ? 'bg-gradient-to-b from-brand-900 to-slate-900 border-2 border-brand-500 shadow-[0_0_80px_rgba(79,70,229,0.2)] transform md:-translate-y-6 z-20' : 'bg-white/5 border border-white/10 z-10'}`}>
                  {plan.featured && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-5 py-2 bg-brand-500 text-white text-[9px] font-black uppercase tracking-[0.3em] rounded-full shadow-lg">
                      RECOMENDADO
                    </div>
                  )}
                  
                  <div>
                    <h3 className={`text-3xl font-black tracking-tight mb-2 ${plan.featured ? 'text-white' : 'text-slate-300'}`}>{plan.name}</h3>
                    <div className="flex items-baseline gap-2 mb-8">
                      <span className="text-5xl font-black tracking-tighter">R${(annualBilling ? plan.price_annual / 12 : plan.price_monthly).toFixed(2).replace('.', ',')}</span>
                      <span className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">/mês</span>
                    </div>

                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-8 border-b border-white/10 pb-8">
                      {annualBilling ? `R$${plan.price_annual.toFixed(2)} faturado 1x por ano.` : 'Faturado mensalmente. Cancele quando quiser.'}
                    </p>

                    <ul className="space-y-6 mb-12">
                      {plan.features?.map((ft: string, j: number) => (
                        <li key={j} className="flex items-start gap-4">
                          <div className={`mt-0.5 rounded-full p-1 border ${plan.featured ? 'bg-brand-500/20 border-brand-500/50 text-brand-400' : 'bg-white/5 border-white/10 text-slate-400'}`}><Check size={12} strokeWidth={3} /></div>
                          <span className={`text-sm font-bold ${plan.featured ? 'text-white' : 'text-slate-300'}`}>{ft}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button 
                    onClick={() => navigate(plan.featured ? '/signup' : '/demo')} 
                    className={`w-full py-6 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${plan.featured ? 'bg-brand-500 hover:bg-brand-400 text-white hover:scale-[1.02] shadow-xl shadow-brand-500/30' : 'bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/30'}`}
                  >
                    {plan.featured ? 'Assinar a Licença' : 'Experimentar Ferramenta'}
                  </button>
                </div>
              ))}
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
                 { q: 'Como funciona o Escâner Neural de Cupons?', a: 'Basta abrir pelo celular (PWA), focar a câmera no cupom ou nota fiscal de supermercado, e a IA no servidor vai identificar o nome de cada produto, valor, quantidade e classificar por categoria automaticamente.' },
                 { q: 'A Inteligência Artificial lê meus dados bancários?', a: 'Sim, mas com RLS (Row-Level Security). Ela processa seus extratos em ambiente local restrito, sem que nenhum humano da equipe ou LLM externo utilize seus dados para treinamento. Privacidade nível institucional.' }
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
      <footer className="bg-black py-16 text-center text-slate-500 font-medium relative border-t border-white/5">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 flex flex-col items-center">
          <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-slate-300 mb-6">
            <Sparkles size={24} />
          </div>
          <h4 className="text-2xl font-black text-white tracking-tight mb-2">FinVision Pro</h4>
          <p className="text-slate-400 text-sm mb-10 max-w-sm">Elevando a barra do controle financeiro com tecnologia de inteligência artificial de ponta.</p>
          
          <div className="flex gap-8 mb-10 border-b border-white/5 pb-10 w-full justify-center">
            <Link to="/terms" className="font-bold text-[10px] uppercase tracking-widest hover:text-white transition-colors">Termos de Uso</Link>
            <Link to="/privacy" className="font-bold text-[10px] uppercase tracking-widest hover:text-white transition-colors">Privacidade</Link>
            <a href="mailto:suporte@automanow.com.br" className="font-bold text-[10px] uppercase tracking-widest hover:text-white transition-colors">Contato</a>
          </div>

          <p className="text-[10px] font-bold uppercase tracking-widest">© {new Date().getFullYear()} FinVision Software LTDA. O Motor por Trás do Seu Sucesso.</p>
        </div>
      </footer>
    </div>
  );
}
