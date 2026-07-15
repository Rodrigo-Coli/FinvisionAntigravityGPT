import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { LogIn, Mail, Lock, Loader2, AlertCircle, Shield, Database } from 'lucide-react';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured || !supabase) {
      setError('Serviço de autenticação indisponível (variáveis de ambiente não configuradas).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        if (authError.message.includes("Email not confirmed")) throw new Error("E-mail não confirmado. Por favor, verifique sua caixa de entrada.");
        throw authError;
      }
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Erro ao realizar login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6 animate-in fade-in duration-700">
      <div className="max-w-md w-full p-4">
        <div className="text-center mb-12">
          <img src="/logo-icon.png" alt="Zyvion" className="w-20 h-20 object-contain mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Zyvion</h1>
          <p className="text-slate-400 font-medium text-sm mt-3 uppercase tracking-widest">Torre de Controle Financeiro</p>
        </div>

        <div className="bg-slate-50/50 p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-8">
          {!isSupabaseConfigured && (
            <div className="p-4 bg-amber-50 border border-amber-100 text-amber-700 rounded-2xl flex items-start gap-3 text-[11px] font-bold uppercase tracking-tight">
              <Database size={16} className="shrink-0" />
              <p>Configuração do Cloud pendente.</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl flex items-start gap-3 text-[11px] font-bold uppercase tracking-tight">
              <AlertCircle size={16} className="shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Identificação</label>
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
              <div className="flex justify-between items-center ml-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Senha</label>
                <Link to="/forgot-password" title="Recuperar Senha" className="text-[10px] font-bold text-brand-600 uppercase tracking-widest hover:underline">Recuperar</Link>
              </div>
              <div className="relative group">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-brand-600 transition-colors" size={20} />
                <input
                  type="password"
                  required
                  disabled={!isSupabaseConfigured || loading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-14 pr-6 h-14 bg-white border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-bold text-slate-900"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !isSupabaseConfigured}
              className="w-full h-16 bg-brand-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-brand-600 transition-all shadow-xl shadow-slate-200 disabled:opacity-50 active:scale-[0.98]"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <LogIn size={20} />}
              <span className="uppercase tracking-widest text-xs">Entrar no Sistema</span>
            </button>
          </form>

          <div className="pt-4 text-center">
            <p className="text-xs text-slate-400 font-medium tracking-tight">
              Novo por aqui? <Link to="/signup" className="text-brand-600 font-bold hover:underline">Solicitar Acesso</Link>
            </p>
          </div>
        </div>

        <div className="mt-12 flex items-center justify-center gap-3 text-[10px] text-slate-300 font-bold uppercase tracking-[0.3em]">
          <Shield size={14} />
          Protocolo Seguro &bull; Zen v2
        </div>
      </div >
    </div >
  );
};

export default Login;
