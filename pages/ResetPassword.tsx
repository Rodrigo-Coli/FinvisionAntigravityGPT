import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { Lock, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured || !supabase) {
      setError('Serviço de autenticação indisponível (variáveis de ambiente não configuradas).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar senha');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6 animate-in fade-in duration-700">
      <div className="max-w-md w-full p-4">
        <div className="bg-slate-50/50 p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-8">
          {success ? (
            <div className="text-center py-6 animate-in zoom-in duration-500">
              <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-[32px] flex items-center justify-center mx-auto mb-6 shadow-inner">
                <CheckCircle size={40} />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-3 italic">Senha Atualizada!</h1>
              <p className="text-slate-400 font-medium text-sm leading-relaxed">
                Sua nova senha foi salva com sucesso. Redirecionando para o login...
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-4">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-tight">Nova Senha</h1>
                <p className="text-slate-400 font-medium text-sm mt-2">Defina seu novo segredo de acesso.</p>
              </div>

              {error && (
                <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl flex items-start gap-3 text-[11px] font-bold uppercase tracking-tight">
                  <AlertCircle size={16} className="shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <form onSubmit={handleUpdate} className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-2">Nova Senha (Mín. 6)</label>
                  <div className="relative group">
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-brand-600 transition-colors" size={20} />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-14 pr-6 h-14 bg-white border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-bold text-slate-900"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-16 bg-brand-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-brand-600 transition-all shadow-xl shadow-slate-200 disabled:opacity-50 active:scale-[0.98]"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <Lock size={20} />}
                  <span className="uppercase tracking-widest text-xs">Atualizar e Acessar</span>
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
