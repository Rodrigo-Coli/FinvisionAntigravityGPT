import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LogOut, Sparkles, X, Check, Gift, Key, Mail, Lock, CheckSquare, Square, ChevronDown, ChevronUp, Loader2, Trophy, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import { useToast } from '../contexts/ToastContext';
import { signOutSafely } from '../lib/session';

export default function DemoBanner() {
  const location = useLocation();
  const { toast } = useToast();
  const [isDemo, setIsDemo] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  
  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Challenges tracking state
  const [tasks, setTasks] = useState({
    task1: false, // Explorar Ativos (/assets)
    task2: false, // Reconciliar (/reconcile)
    task3: false, // Planejamento (/planning)
    task4: false, // Conhecer o Advisor (Home Page)
    task5: false  // Falar com Advisor (Enviar pergunta)
  });

  useEffect(() => {
    const demoFlag = localStorage.getItem('is_finvision_demo') === 'true';
    const hasSession = localStorage.getItem('finvision_cached_profile') !== null;
    setIsDemo(demoFlag && hasSession);

    if (demoFlag && hasSession) {
      const savedTasks = JSON.parse(localStorage.getItem('finvision_demo_tasks') || '{}');
      setTasks({
        task1: !!savedTasks.task1,
        task2: !!savedTasks.task2,
        task3: !!savedTasks.task3,
        task4: !!savedTasks.task4,
        task5: !!savedTasks.task5
      });
    }
  }, [location]);

  // Route monitoring to auto-check tasks
  useEffect(() => {
    if (!isDemo) return;

    const path = location.pathname + location.search + window.location.hash;
    const saved = JSON.parse(localStorage.getItem('finvision_demo_tasks') || '{}');
    let updated = false;

    if (path.includes('/assets') && !saved.task1) {
      saved.task1 = true;
      updated = true;
    }
    if (path.includes('/reconcile') && !saved.task2) {
      saved.task2 = true;
      updated = true;
    }
    if (path.includes('/planning') && !saved.task3) {
      saved.task3 = true;
      updated = true;
    }
    // Home route check (renders floating AI Chat)
    const isHome = path === '/' || path === '/#' || path === '/#/' || (path.includes('/history') === false && path.includes('/banking') === false && path.includes('/settings') === false && path.includes('/reports') === false && path.includes('/assets') === false && path.includes('/reconcile') === false && path.includes('/planning') === false);
    if (isHome && !saved.task4) {
      saved.task4 = true;
      updated = true;
    }

    if (updated) {
      localStorage.setItem('finvision_demo_tasks', JSON.stringify(saved));
      setTasks({
        task1: !!saved.task1,
        task2: !!saved.task2,
        task3: !!saved.task3,
        task4: !!saved.task4,
        task5: !!saved.task5
      });
    }
  }, [location, isDemo]);

  // Periodic check for chat message submission
  useEffect(() => {
    if (!isDemo) return;

    const checkAskedAI = () => {
      if (localStorage.getItem('finvision_demo_asked_ai') === 'true') {
        const saved = JSON.parse(localStorage.getItem('finvision_demo_tasks') || '{}');
        if (!saved.task5) {
          saved.task5 = true;
          localStorage.setItem('finvision_demo_tasks', JSON.stringify(saved));
          setTasks(prev => ({ ...prev, task5: true }));
        }
      }
    };

    checkAskedAI();
    const interval = setInterval(checkAskedAI, 1500);
    return () => clearInterval(interval);
  }, [isDemo]);

  const completedCount = Object.values(tasks).filter(Boolean).length;

  const handlePromoteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    
    setErrorMsg('');
    if (!email || !password || !confirmPassword) {
      setErrorMsg('Por favor, preencha todos os campos.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('As senhas não coincidem.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      // Obtém o token de sessão para autenticar a requisição no servidor
      const { data: { session }, error: sessErr } = await supabase.auth.getSession();
      if (sessErr || !session) throw new Error('Sessão expirada. Recarregue o app e tente novamente.');

      // Chama o endpoint do servidor — ele usa permissão de admin para trocar o e-mail
      // sem rejeitar o e-mail temporário do demo
      const res = await fetch('/api/promote-demo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar conta.');

      localStorage.removeItem('is_finvision_demo');
      localStorage.setItem('is_finvision_demo_promoted', 'true');
      setIsDemo(false);
      setShowPromoteModal(false);

      toast('🎉 Conta criada! Seus dados do demo foram preservados. Bem-vindo ao Zyvion!', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      console.error('Erro na promoção de conta:', err);
      setErrorMsg(err.message || 'Ocorreu um erro ao criar a conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const discardDemoData = async () => {
    if (!supabase) return;
    localStorage.removeItem('is_finvision_demo');
    localStorage.removeItem('finvision_cached_profile');
    localStorage.removeItem('finvision_demo_tasks');
    localStorage.removeItem('finvision_demo_asked_ai');
    setShowDiscardConfirm(false);
    // signOutSafely nunca fica pendurado: antes, `await supabase.auth.signOut()`
    // sem prazo travava aqui em conexão ruim e as duas linhas seguintes nunca
    // rodavam — o botão parecia morto.
    await signOutSafely(supabase);
    // replace + reload: só trocar o hash não recarrega a página quando o
    // caminho já é '/', e o app continuava montado com o estado do demo.
    window.location.replace('/#/signup');
    window.location.reload();
  };

  if (!isDemo) return null;

  return (
    <>
      {/* Modal de confirmação para descartar demo */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-[28px] p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200 text-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-950/40 border border-rose-900/50 flex items-center justify-center">
                <AlertTriangle size={18} className="text-rose-400" />
              </div>
              <h3 className="font-black text-base">Sair do Demo?</h3>
            </div>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              Você vai ser desconectado e todo o progresso desta sessão de demonstração será descartado.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDiscardConfirm(false)}
                className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={discardDemoData}
                className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-bold text-xs uppercase tracking-widest hover:bg-rose-500 transition-all"
              >
                Sair mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. TOP BANNER (SLIM GLASSMORPHISM WITH DYNAMIC ISLAND CONCEPT) */}
      <div className="bg-[#020617]/95 border-b border-white/10 text-white px-6 py-3 flex flex-wrap items-center justify-between gap-4 shadow-xl z-45 sticky top-0 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Sparkles size={16} className="text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-sm uppercase tracking-wider text-slate-100">Modo Demo Interativo</span>
              <span className="bg-brand-500/20 text-brand-300 border border-brand-500/30 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">
                {completedCount}/5 Desafios
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium hidden md:block mt-0.5">
              Experimente todas as funções. Salve seu progresso e promova seus dados criando uma conta real definitiva.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDiscardConfirm(true)}
            title="Sair do modo demo"
            className="flex items-center justify-center p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-rose-950/20 hover:border-rose-900/50 hover:text-rose-400 text-slate-400 transition-all active:scale-95"
          >
            <LogOut size={16} />
          </button>
          
          <button 
            onClick={() => setShowPromoteModal(true)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-md ${
              completedCount === 5 
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/20 animate-bounce' 
                : 'bg-white text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Gift size={14} className={completedCount === 5 ? 'animate-bounce' : ''} />
            {completedCount === 5 ? 'Resgatar Conta + Desconto' : 'Criar minha conta'}
          </button>
        </div>
      </div>

      {/* 2. FLOATING ACTIVATION CHECKLIST (BOTTOM-RIGHT GAMIFICATION WIDGET) */}
      <div className="fixed bottom-24 md:bottom-28 right-6 z-[999] flex flex-col items-end font-sans">
        {isOpen && (
          <div className="bg-slate-950/95 border border-white/10 backdrop-blur-xl rounded-2xl p-5 w-80 shadow-[0_10px_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-6 duration-300 mb-3 text-slate-100">
            <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Trophy size={16} className="text-amber-400 animate-bounce" />
                <span className="font-black text-xs uppercase tracking-wider text-slate-100">Desafios da Demo</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            <p className="text-[11px] text-slate-400 font-medium mb-4 leading-normal">
              Conclua as tarefas de exploração guiada para experimentar os recursos de IA e desbloquear desconto.
            </p>

            <div className="space-y-3.5">
              {/* Task 1 */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-brand-400">
                  {tasks.task1 ? <CheckSquare size={16} className="text-emerald-400" /> : <Square size={16} className="text-slate-600" />}
                </div>
                <div className="text-xs">
                  <p className={`font-bold ${tasks.task1 ? 'line-through text-slate-500' : 'text-slate-200'}`}>1. Analisar Patrimônio Líquido</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Visite a aba de Ativos no menu.</p>
                </div>
              </div>

              {/* Task 2 */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-brand-400">
                  {tasks.task2 ? <CheckSquare size={16} className="text-emerald-400" /> : <Square size={16} className="text-slate-600" />}
                </div>
                <div className="text-xs">
                  <p className={`font-bold ${tasks.task2 ? 'line-through text-slate-500' : 'text-slate-200'}`}>2. Acessar Conciliação Inteligente</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Visite a aba Conciliação no menu.</p>
                </div>
              </div>

              {/* Task 3 */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-brand-400">
                  {tasks.task3 ? <CheckSquare size={16} className="text-emerald-400" /> : <Square size={16} className="text-slate-600" />}
                </div>
                <div className="text-xs">
                  <p className={`font-bold ${tasks.task3 ? 'line-through text-slate-500' : 'text-slate-200'}`}>3. Ajustar Limites e Orçamentos</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Visite a aba Planejamento no menu.</p>
                </div>
              </div>

              {/* Task 4 */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-brand-400">
                  {tasks.task4 ? <CheckSquare size={16} className="text-emerald-400" /> : <Square size={16} className="text-slate-600" />}
                </div>
                <div className="text-xs">
                  <p className={`font-bold ${tasks.task4 ? 'line-through text-slate-500' : 'text-slate-200'}`}>4. Abrir Chat com Advisor</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Volte para a tela inicial (Home Dashboard).</p>
                </div>
              </div>

              {/* Task 5 */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-brand-400">
                  {tasks.task5 ? <CheckSquare size={16} className="text-emerald-400" /> : <Square size={16} className="text-slate-600" />}
                </div>
                <div className="text-xs">
                  <p className={`font-bold ${tasks.task5 ? 'line-through text-slate-500' : 'text-slate-200'}`}>5. Fazer uma Pergunta Contábil/IA</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Envie uma mensagem no chat da IA.</p>
                </div>
              </div>
            </div>

            {/* Progress indicator */}
            <div className="mt-5 pt-4 border-t border-white/5">
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                <span>Progresso</span>
                <span>{completedCount * 20}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-brand-500 to-indigo-500 transition-all duration-500" style={{ width: `${completedCount * 20}%` }} />
              </div>
              
              {completedCount === 5 ? (
                <div className="mt-4 p-3 bg-emerald-950/40 border border-emerald-900/50 rounded-xl text-emerald-400 text-[10px] font-bold text-center leading-normal animate-pulse">
                  🎁 Cupom ativo: <strong className="text-white">FINVISION20</strong> para 20% OFF! Promova sua conta agora.
                </div>
              ) : (
                <p className="text-[9px] text-slate-500 font-medium text-center mt-3">
                  Complete para obter bônus.
                </p>
              )}
            </div>
          </div>
        )}

        <button 
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-2.5 px-4.5 py-3 rounded-full shadow-2xl font-black text-xs uppercase tracking-widest border transition-all active:scale-95 ${
            completedCount === 5
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 border-emerald-400 text-white shadow-emerald-500/20'
              : isOpen 
                ? 'bg-slate-900 border-white/20 text-white' 
                : 'bg-brand-600 hover:bg-brand-500 border-brand-500 text-white shadow-brand-500/20 animate-pulse'
          }`}
        >
          <Trophy size={16} className={completedCount === 5 ? 'animate-bounce' : ''} />
          <span>Desafios ({completedCount}/5)</span>
        </button>
      </div>

      {/* 3. PROMOTIONAL ACCOUNT PROMOTION MODAL */}
      {showPromoteModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-[32px] p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 text-slate-100">
            <div className="flex justify-between items-center pb-4 border-b border-white/5 mb-6">
              <div className="flex items-center gap-2">
                <Gift size={20} className="text-brand-400" />
                <h3 className="text-lg font-black tracking-tight">Criar Conta Definitiva</h3>
              </div>
              <button 
                onClick={() => setShowPromoteModal(false)}
                className="p-1.5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              Você está prestes a transformar este ambiente de demonstração na sua conta definitiva.
              <strong className="text-slate-200 block mt-1.5">✓ Todo o seu progresso e dados de teste serão salvos!</strong>
              {completedCount === 5 && (
                <span className="text-emerald-400 block mt-1">✓ Desconto de 20% (Cupom FINVISION20) aplicado no faturamento.</span>
              )}
            </p>

            <form onSubmit={handlePromoteAccount} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Seu E-mail Real</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input 
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-950 border border-white/10 rounded-2xl text-sm font-medium focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all text-white placeholder-slate-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Sua Senha Pessoal</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input 
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-950 border border-white/10 rounded-2xl text-sm font-medium focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all text-white placeholder-slate-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Confirmar Senha</label>
                <div className="relative">
                  <Key size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input 
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita sua senha"
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-950 border border-white/10 rounded-2xl text-sm font-medium focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all text-white placeholder-slate-600"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-3.5 bg-rose-950/40 border border-rose-900/50 rounded-xl text-rose-400 text-xs font-bold leading-normal">
                  {errorMsg}
                </div>
              )}

              <button 
                type="submit"
                disabled={loading}
                className="w-full py-4 mt-6 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Criando conta...
                  </>
                ) : (
                  'Promover para Conta Real'
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
