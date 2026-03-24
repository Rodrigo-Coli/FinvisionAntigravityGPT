import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase/client';
import { Sparkles, Loader2 } from 'lucide-react';

export default function DemoMode() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    async function loginDemo() {
      if (!supabase) {
        setError('Erro de conexão. Tente novamente.');
        return;
      }
      
      // Sign out current user first if any
      await supabase.auth.signOut();

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: 'demo@finvision.app',
        password: 'FinvisionDemo2025!'
      });

      if (signInError) {
        setError('Erro ao carregar ambiente de demonstração: ' + signInError.message);
      } else {
        localStorage.setItem('is_finvision_demo', 'true');
        navigate('/');
      }
    }

    loginDemo();
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
      <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center text-white mb-6 shadow-xl shadow-brand-500/20">
        <Sparkles size={32} />
      </div>
      
      <h1 className="text-2xl font-black text-slate-900 text-center tracking-tight">Preparando seu ambiente</h1>
      <p className="text-slate-500 font-medium text-center mt-2 max-w-sm">
        Estamos carregando transações, contas e cartões fictícios para você explorar todo o poder do FinVision.
      </p>

      {error ? (
        <div className="mt-8 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 font-bold text-sm text-center">
          {error}
        </div>
      ) : (
        <div className="mt-10 flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin text-brand-500" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Iniciando Demo...</span>
        </div>
      )}
    </div>
  );
}
