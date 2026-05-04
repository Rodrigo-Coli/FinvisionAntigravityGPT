
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Profile } from '../types';
import { supabase } from '../lib/supabase/client';
import { Clock, LogOut, ShieldAlert, Mail, Loader2 } from 'lucide-react';

interface PendingApprovalProps {
  user: Profile;
}

const PendingApproval: React.FC<PendingApprovalProps> = ({ user }) => {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleCheckStatus = async () => {
    if (!supabase) return;
    setChecking(true);
    setStatusMsg(null);
    
    try {
      // 1) Obter UID atual
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        window.location.reload();
        return;
      }

      // 2) Buscar profile via maybeSingle
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (error) throw error;

      // 3) Se aprovado, redirecionar
      if (data?.is_approved) {
        // Forçamos um reload para garantir que o estado global do App.tsx seja atualizado
        // e as rotas protegidas sejam liberadas corretamente.
        window.location.href = '/';
        window.location.reload();
      } else {
        // 4) Se continuar false, feedback leve
        setStatusMsg("Seu acesso ainda está sendo analisado. Por favor, aguarde.");
      }
    } catch (err: any) {
      console.error("Erro ao verificar status:", err);
      setStatusMsg("Não foi possível verificar seu status agora.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-lg w-full bg-white rounded-3xl shadow-xl border border-gray-100 p-8 md:p-12">
        <div className="text-center mb-10">
          <div className="w-24 h-24 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-lg">
            <Clock size={48} />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Aguardando Aprovação</h1>
          <p className="text-gray-500 mt-3 leading-relaxed">
            Sua conta (<span className="font-bold text-gray-700">{user.email}</span>) foi criada, mas requer ativação manual pelo administrador.
          </p>
        </div>

        <div className="bg-gray-50 rounded-2xl p-6 mb-8 border border-gray-100 space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-white rounded-xl shadow-sm text-blue-600">
              <ShieldAlert size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Segurança em Primeiro Lugar</p>
              <p className="text-xs text-gray-500">Este procedimento evita acessos não autorizados a dados financeiros sensíveis.</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="p-2 bg-white rounded-xl shadow-sm text-emerald-600">
              <Mail size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Aviso por E-mail</p>
              <p className="text-xs text-gray-500">Você receberá uma notificação assim que seu acesso for liberado.</p>
            </div>
          </div>
        </div>

        {statusMsg && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-100 text-amber-700 rounded-xl text-xs font-bold text-center animate-in fade-in slide-in-from-top-2">
            {statusMsg}
          </div>
        )}

        <div className="space-y-3">
          <button 
            onClick={handleCheckStatus}
            disabled={checking}
            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {checking && <Loader2 className="animate-spin" size={20} />}
            {checking ? 'Verificando...' : 'Verificar Status Novamente'}
          </button>
          <button 
            onClick={handleLogout}
            className="w-full py-4 bg-white text-red-600 border border-red-100 rounded-2xl font-bold hover:bg-red-50 transition-all flex items-center justify-center gap-2"
          >
            <LogOut size={18} /> Sair da Conta
          </button>
        </div>

        <p className="text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-8">
          FinVision Pro Master &bull; Gestão de Acesso
        </p>
      </div>
    </div>
  );
};

export default PendingApproval;
