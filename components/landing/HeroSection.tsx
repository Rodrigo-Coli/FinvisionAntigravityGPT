import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Brain } from 'lucide-react';
import { trackEvent, withUtmParams } from '../../lib/analytics';
import FoundingBar from './FoundingBar';

export default function HeroSection() {
  return (
    <section className="relative pt-24 pb-16 md:pt-32 md:pb-24 lg:pt-40 lg:pb-32 overflow-hidden">
      <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-brand-600/10 rounded-full blur-[150px] mix-blend-screen animate-pulse pointer-events-none duration-10000" />
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />

      <div
        style={{ transform: 'translate3d(0, 0, 30px)', WebkitTransform: 'translate3d(0, 0, 30px)' }}
        className="relative max-w-[1400px] mx-auto px-6 lg:px-12 text-center z-30"
      >
        <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-brand-300 text-[10px] font-black uppercase tracking-[0.2em] mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 shadow-xl backdrop-blur-md">
          <Brain size={14} /> Introduzindo o Advisor Patrimonial Autônomo
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-white/90 to-slate-500 mb-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-1000 leading-[1.05]">
          Você só descobre para onde foi o seu dinheiro <br className="hidden md:block" /> depois que ele já foi.
        </h1>

        <p className="text-sm sm:text-base md:text-xl text-slate-400 font-medium mb-10 max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-150">
          O Zyvion consolida contas, cartões, investimentos, imóveis e dívidas em uma única tela — com conciliação bancária por Inteligência Artificial e sem que você precise entregar a senha do seu banco.
        </p>

        <div className="flex flex-col items-center justify-center gap-6 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-300">
          <Link
            to={withUtmParams('/demo')}
            onClick={() => trackEvent('demo_click', { location: 'hero' })}
            className="w-full sm:w-auto px-10 py-5 bg-white text-slate-900 rounded-2xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-[0_0_50px_-10px_rgba(255,255,255,0.5)] hover:bg-slate-100 hover:scale-105 transition-all min-h-[44px]"
          >
            Testar Demo Grátis <ArrowRight size={18} />
          </Link>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest animate-in fade-in delay-700">
            * Sem cartão de crédito. Ambiente de demonstração com dados reais para você explorar sem compromisso.
          </p>
        </div>

        <div className="mt-10 flex justify-center animate-in fade-in duration-1000 delay-500">
          <FoundingBar />
        </div>
      </div>
    </section>
  );
}
