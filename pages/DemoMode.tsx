import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase/client';
import { Sparkles, Loader2 } from 'lucide-react';
import { signOutSafely } from '../lib/session';

/**
 * Modo demo — por que demorava tanto para abrir
 * ---------------------------------------------
 * Eram cinco idas e voltas à rede EM FILA, cada uma esperando a anterior:
 * logout no servidor -> cadastro -> (login) -> clonagem dos dados -> busca do
 * plano -> assinatura. No celular em 4G isso vira uma eternidade encarando um
 * spinner sem nenhuma informação, e é fácil achar que travou.
 *
 * O que mudou:
 *  - o logout agora é só local (`localOnly`). A sessão anterior vai ser
 *    substituída por uma conta nova em seguida, então esperar até 4s por um
 *    logout de rede não servia para nada — e era a PRIMEIRA espera de todas;
 *  - a clonagem dos dados e a busca do plano passaram a rodar em paralelo: uma
 *    não depende do resultado da outra;
 *  - a tela diz em que passo está, em vez de um "Iniciando Demo..." fixo.
 */
export default function DemoMode() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [step, setStep] = useState('Preparando...');

  useEffect(() => {
    async function loginDemo() {
      if (!supabase) {
        setError('Erro de conexão. Tente novamente.');
        return;
      }
      
      // Só local: a sessão atual será trocada por uma conta nova logo abaixo.
      setStep('Criando seu acesso de demonstração');
      await signOutSafely(supabase, 4000, { localOnly: true });

      // Gerar email randômico para isolar os ambientes de testes de cada visitante
      const demoEmail = `demo+${Date.now()}@finvision.app`;

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: demoEmail,
        password: 'FinvisionDemo2025!'
      });

      if (signUpError || !signUpData.user) {
        setError('Erro ao carregar ambiente de demonstração: ' + (signUpError?.message || 'Falha no servidor.'));
        return;
      }

      // Se a engine de Auth (GoTrue) estiver requerindo e-mail para emitir a sessão, efetuamos login manual usando a senha padrão:
      if (!signUpData.session) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: demoEmail,
          password: 'FinvisionDemo2025!'
        });
        if (signInErr) {
          setError('Erro ao fazer login no ambiente de demonstração.');
          return;
        }
      }

      // Clonagem dos dados e busca do plano vão JUNTAS: uma não depende da
      // outra, e em fila elas somavam duas viagens de rede completas.
      setStep('Carregando contas, cartões e lançamentos');
      const [cloneRes, planRes] = await Promise.all([
        supabase.rpc('clone_demo_data', { new_uid: signUpData.user.id }),
        supabase.from('plans').select('id').eq('slug', 'starter').maybeSingle()
      ]);

      if (cloneRes.error) {
        console.warn('Erro populando dados demo. Ambiente será carregado vazio:', cloneRes.error);
      }

      // Garante que o usuário demo tenha plano Starter para limites ficarem definidos
      try {
        const starterPlan = planRes.data;

        if (starterPlan) {
          await supabase.from('subscriptions').upsert({
            user_id: signUpData.user.id,
            plan_id: starterPlan.id,
            status: 'active',
            billing_period: 'monthly',
            current_period_start: new Date().toISOString(),
            current_period_end: null
          }, { onConflict: 'user_id' });
        }
      } catch (subErr) {
        console.warn('Não foi possível criar assinatura demo:', subErr);
      }

      setStep('Quase lá');
      localStorage.setItem('is_finvision_demo', 'true');
      
      // Dá tempo do banco finalizar os triggers de accounts/profiles de entrada
      setTimeout(() => {
        navigate('/');
      }, 500);
    }

    loginDemo();
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#020617] text-white p-6">
      <div className="w-16 h-16 bg-gradient-to-br from-brand-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white mb-6 shadow-xl shadow-brand-500/20">
        <Sparkles size={32} />
      </div>
      
      <h1 className="text-2xl font-black text-slate-100 text-center tracking-tight">Preparando seu ambiente</h1>
      <p className="text-slate-400 font-medium text-center mt-2 max-w-sm">
        Estamos carregando transações, contas e cartões fictícios para você explorar todo o poder do Zyvion.
      </p>

      {error ? (
        <div className="mt-8 p-4 bg-rose-950/50 border border-rose-900/50 rounded-2xl text-rose-400 font-bold text-sm text-center">
          {error}
        </div>
      ) : (
        <div className="mt-10 flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin text-brand-400" />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest animate-pulse">{step}</span>
        </div>
      )}
    </div>
  );
}
