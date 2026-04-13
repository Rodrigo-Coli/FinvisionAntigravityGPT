import React, { useEffect, useState } from 'react';
import { LogOut, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase/client';

export default function DemoBanner() {
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    setIsDemo(localStorage.getItem('is_finvision_demo') === 'true');
  }, []);

  const exitDemo = async () => {
    if (!supabase) return;
    localStorage.removeItem('is_finvision_demo');
    await supabase.auth.signOut();
    window.location.href = '/#/signup';
  };

  if (!isDemo) return null;

  return (
    <div className="bg-gradient-to-r from-brand-600 to-indigo-600 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-md z-50 sticky top-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <Sparkles size={16} className="text-white" />
        </div>
        <div>
          <p className="font-bold text-sm leading-tight">Você está no Modo Demonstração</p>
          <p className="text-xs text-white/80 font-medium hidden sm:block">Todos os dados aqui são fictícios e resetam periodicamente.</p>
        </div>
      </div>
      <button onClick={exitDemo}
        className="flex items-center gap-2 bg-white text-brand-900 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95 shadow-sm">
        <LogOut size={14} />
        Criar minha conta
      </button>
    </div>
  );
}
