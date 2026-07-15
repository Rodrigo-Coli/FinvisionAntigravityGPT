import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { UserPlus, Mail, Lock, Loader2, AlertCircle, CheckCircle, Database, Shield, Sparkles } from 'lucide-react';
import { UserRole } from '../types';

const Signup: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured || !supabase) {
      setError('Configuração do servidor pendente. Entre em contato com o suporte.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin }
      });
      if (authError) throw authError;

      if (authData.user) {
        // Perfil com acesso imediato — sem aprovação manual
        await supabase.from('profiles').upsert({
          id: authData.user.id,
          email: authData.user.email,
          role: UserRole.USER,
          is_approved: true
        });

        // Captura número WhatsApp opcional da URL (?wp=5511...)
        const urlParams = new URLSearchParams(window.location.search);
        const wpPhone = urlParams.get('wp');
        if (wpPhone) {
          const cleanPhone = wpPhone.replace(/\D/g, '');
          if (cleanPhone) {
            await supabase.from('user_settings').upsert({
              user_id: authData.user.id,
              whatsapp_number: cleanPhone,
              whatsapp_enabled: true,
              updated_at: new Date().toISOString()
            });
          }
        }

        // Cria assinatura gratuita (plano Starter) automaticamente
        try {
          const { data: starterPlan } = await supabase
            .from('plans')
            .select('id')
            .eq('slug', 'starter')
            .maybeSingle();

          if (starterPlan) {
            await supabase.from('subscriptions').upsert({
              user_id: authData.user.id,
              plan_id: starterPlan.id,
              status: 'active',
              billing_period: 'monthly',
              current_period_start: new Date().toISOString(),
              current_period_end: null
            }, { onConflict: 'user_id' });
          }
        } catch (subErr) {
          // Não bloqueia o cadastro se a assinatura falhar
          console.warn('Não foi possível criar assinatura Starter:', subErr);
        }

        if (!authData.session) setNeedsConfirmation(true);
        setSuccess(true);
      }
    } catch (err: any) {
      if (err.message?.includes('already registered')) {
        setError('Este e-mail já está cadastrado. Faça login ou recupere sua senha.');
      } else {
        setError(err.message || 'Erro ao criar conta. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6 animate-in fade-in duration-700">
        <div className="max-w-md w-full bg-slate-50 border border-slate-100 p-12 rounded-[40px] text-center shadow-sm">
          <div className="w-24 h-24 bg-emerald-50 text-emerald-600 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-inner">
            <CheckCircle size={48} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-4 italic">
            {needsConfirmation ? 'Confirme seu E-mail' : 'Conta Criada!'}
          </h1>
          <p className="text-slate-400 font-medium text-sm leading-relaxed mb-4">
            {needsConfirmation
              ? <>Enviamos um link de confirmação para <strong className="text-slate-700">{email}</strong>. Acesse seu e-mail e clique no link para ativar sua conta.</>
              : <>Bem-vindo ao <strong className="text-slate-700">Zyvion</strong>! Sua conta gratuita está pronta.</>
            }
          </p>
          {!needsConfirmation && (
            <div className="flex items-center gap-2 justify-center mb-6 text-xs text-emerald-600 font-bold bg-emerald-50 rounded-xl px-4 py-2.5 border border-emerald-100">
              <Sparkles size={14} />
              Plano Gratuito ativado automaticamente
            </div>
          )}
          <Link
            to="/login"
            className="block w-full h-14 bg-brand-900 text-white rounded-2xl font-bold flex items-center justify-center uppercase tracking-widest text-xs hover:bg-brand-600 transition-all shadow-xl shadow-slate-200"
          >
            {needsConfirmation ? 'Ir para o Login' : 'Entrar agora'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6 animate-in fade-in duration-700">
      <div className="max-w-md w-full p-4">
        <div className="text-center mb-12">
          <img src="/logo-icon.png" alt="Zyvion" className="w-14 h-14 object-contain mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Crie sua conta grátis</h1>
          <p className="text-slate-400 font-medium text-sm mt-2">Acesso imediato · Sem cartão de crédito</p>
        </div>

        <div className="bg-slate-50/50 p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-8">
          {!isSupabaseConfigured && (
            <div className="p-4 bg-amber-50 border border-amber-100 text-amber-700 rounded-2xl flex items-start gap-3 text-[11px] font-bold uppercase tracking-tight">
              <Database size={16} className="shrink-0 mt-0.5" />
              <p>Servidor indisponível. Verifique as configurações.</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl flex items-start gap-3 text-[11px] font-bold">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">E-mail</label>
              <div className="relative group">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-brand-600 transition-colors" size={20} />
                <input
                  type="email"
                  required
                  disabled={!isSupabaseConfigured || loading}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full pl-14 pr-6 h-14 bg-white border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-bold text-slate-900"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Senha</label>
              <div className="relative group">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-brand-600 transition-colors" size={20} />
                <input
                  type="password"
                  required
                  minLength={6}
                  disabled={!isSupabaseConfigured || loading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full pl-14 pr-6 h-14 bg-white border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-bold text-slate-900"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !isSupabaseConfigured}
              className="w-full h-16 bg-brand-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-brand-600 transition-all shadow-xl shadow-slate-200 disabled:opacity-50 active:scale-[0.98]"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <UserPlus size={20} />}
              <span className="uppercase tracking-widest text-xs">Criar conta grátis</span>
            </button>
          </form>

          <div className="pt-2 text-center space-y-3">
            <p className="text-xs text-slate-400 font-medium">
              Já tem conta? <Link to="/login" className="text-brand-600 font-bold hover:underline">Fazer Login</Link>
            </p>
            <p className="text-[10px] text-slate-300 leading-relaxed">
              Ao criar conta você concorda com os{' '}
              <Link to="/terms" className="underline hover:text-slate-400">Termos de Uso</Link>
              {' '}e{' '}
              <Link to="/privacy" className="underline hover:text-slate-400">Política de Privacidade</Link>.
            </p>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-3 text-[10px] text-slate-300 font-bold uppercase tracking-[0.3em]">
          <Shield size={14} />
          Dados criptografados · Supabase
        </div>
      </div>
    </div>
  );
};

export default Signup;
