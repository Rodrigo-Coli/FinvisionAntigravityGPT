
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase/client';
import { Lock, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase!.auth.updateUser({
        password: password,
      });

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-gray-100 p-8">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">Nova Senha</h1>
        <p className="text-gray-500 mb-8">Defina sua nova senha de acesso.</p>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-700 rounded-xl flex items-start gap-3 text-sm">
            <AlertCircle size={18} className="shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {success ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Senha Atualizada!</h1>
            <p className="text-gray-500 text-sm">Redirecionando para o login em instantes...</p>
          </div>
        ) : (
          <form onSubmit={handleUpdate} className="space-y-5">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Nova Senha</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="password" 
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : 'Atualizar Senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
