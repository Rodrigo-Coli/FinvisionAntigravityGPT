
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { UserPlus, Mail, Lock, Loader2, AlertCircle, CheckCircle, Database } from 'lucide-react';
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
      setError('Configuração do Supabase pendente. Verifique as variáveis de ambiente.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      if (authData.user) {
        // Tentar inserir perfil. 
        // Nota: Se o e-mail exigir confirmação, authData.session será null.
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: authData.user.id,
            email: authData.user.email,
            role: UserRole.USER,
            is_approved: false
          });

        if (profileError) {
          console.warn("Aviso ao criar perfil:", profileError.message);
        }

        if (!authData.session) {
          setNeedsConfirmation(true);
        }
        
        setSuccess(true);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-gray-100 p-8 text-center">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {needsConfirmation ? 'Confirme seu E-mail' : 'Conta Criada!'}
          </h1>
          <p className="text-gray-600 mb-8">
            {needsConfirmation 
              ? 'Enviamos um link de confirmação para seu e-mail. Após confirmar, você poderá aguardar a aprovação do administrador.'
              : 'Seu cadastro foi realizado com sucesso. Agora, aguarde a aprovação manual do administrador para acessar os módulos.'}
          </p>
          <Link 
            to="/login" 
            className="block w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
          >
            Ir para Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Criar Conta</h1>
          <p className="text-gray-500 mt-2">Cadastre-se para solicitar acesso ao sistema</p>
        </div>

        {!isSupabaseConfigured && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl flex items-start gap-3 text-sm animate-pulse">
            <Database size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Atenção: Supabase não configurado</p>
              <p className="text-xs">Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY na Vercel para habilitar o cadastro.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-700 rounded-xl flex items-start gap-3 text-sm">
            <AlertCircle size={18} className="shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-5">
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
            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Senha (Mín. 6 caracteres)</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="password" 
                required
                minLength={6}
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
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <UserPlus size={20} />}
            {loading ? 'Processando...' : 'Solicitar Cadastro'}
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-gray-100 text-center">
          <p className="text-sm text-gray-500">
            Já tem uma conta? <Link to="/login" className="text-blue-600 font-bold hover:underline">Faça login</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;
