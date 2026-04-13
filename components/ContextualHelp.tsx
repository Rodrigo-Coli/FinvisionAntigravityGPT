import React, { useState } from 'react';
import { HelpCircle, X, Sparkles } from 'lucide-react';

interface ContextualHelpProps {
  title: string;
  description: string;
}

const ContextualHelp: React.FC<ContextualHelpProps> = ({ title, description }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2.5 bg-brand-50 text-brand-600 rounded-xl hover:bg-brand-100 transition-all flex items-center gap-2 group"
      >
        <HelpCircle size={18} />
        <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Como funciona?</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-4 w-[300px] sm:w-[380px] bg-slate-900 text-white p-7 rounded-[32px] shadow-2xl z-[110] animate-in zoom-in-95 fade-in duration-300 border border-white/10 origin-top-right">
             <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-2 text-brand-400">
                  <Sparkles size={18} className="animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Guia de Tela</span>
                </div>
                <button onClick={() => setIsOpen(false)} className="text-white/30 hover:text-white p-1"><X size={18} /></button>
             </div>
             <h4 className="text-xl font-bold mb-3 tracking-tight">{title}</h4>
             <p className="text-sm text-slate-300 font-medium leading-relaxed">{description}</p>
             <div className="mt-8 flex justify-between items-center">
                <div className="w-10 h-1 bg-brand-500 rounded-full" />
                <button 
                  onClick={() => setIsOpen(false)} 
                  className="px-6 py-2.5 bg-white text-brand-900 hover:bg-brand-50 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg"
                >
                  Entendi
                </button>
             </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ContextualHelp;
