
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
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        if (authError.message.includes("Email not confirmed")) {
          throw new Error("E-mail não confirmado. Por favor, verifique sua caixa de entrada.");
        }
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black italic text-3xl mx-auto mb-4 shadow-lg shadow-blue-200">
            FV
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">FinVision Pro</h1>
          <p className="text-gray-500 mt-2">Torre de Controle Financeiro</p>
        </div>

        {!isSupabaseConfigured && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl flex items-start gap-3 text-sm">
            <Database size={18} className="shrink-0 mt-0.5" />
            <p>Configuração do Supabase pendente no ambiente.</p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-700 rounded-xl flex items-start gap-3 text-sm">
            <AlertCircle size={18} className="shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="email" 
                required
                disabled={!isSupabaseConfigured || loading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5 ml-1">
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Senha</label>
              <Link to="/forgot-password" className="text-xs font-bold text-blue-600 hover:underline">Esqueci a senha</Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="password" 
                required
                disabled={!isSupabaseConfigured || loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !isSupabaseConfigured}
            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <LogIn size={20} />}
            {loading ? 'Entrando...' : 'Entrar no Sistema'}
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-gray-100 text-center">
          <p className="text-sm text-gray-500">
            Não tem uma conta? <Link to="/signup" className="text-blue-600 font-bold hover:underline">Crie agora</Link>
          </p>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
          <Shield size={12} />
          Acesso Seguro &bull; v2.1
        </div>
      </div>
    </div>
  );
};

export default Login;
