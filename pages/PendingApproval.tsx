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
      const { data: { session } } = await supabase.auth.getSession();
      const authUser = session?.user;
      if (!authUser) { window.location.reload(); return; }
      const { data, error } = await supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
      if (error) throw error;
      if (data?.is_approved) {
        window.location.href = '/';
        window.location.reload();
      } else {
        setStatusMsg("Status inalterado. Entre em contato com o suporte.");
      }
    } catch (err: any) {
      setStatusMsg("Falha na sincronização.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6 animate-in fade-in duration-700">
      <div className="max-w-xl w-full p-4">
        <div className="bg-slate-50/50 p-12 rounded-[40px] border border-slate-100 shadow-sm space-y-12 text-center">
          <div className="space-y-6">
            <div className="w-24 h-24 bg-amber-50 text-amber-500 rounded-[32px] flex items-center justify-center mx-auto shadow-inner">
              <Clock size={48} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight leading-tight italic">Aprovação Pendente</h1>
              <p className="text-slate-400 font-medium text-sm mt-4 leading-relaxed">
                Sua identificação <span className="font-bold text-slate-900">{user.email}</span> foi registrada. <br />
                Aguarde a ativação pelo conselho administrativo.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
            <div className="p-6 bg-white rounded-3xl border border-slate-50 space-y-3">
              <ShieldAlert size={20} className="text-brand-600" />
              <p className="text-xs font-bold text-slate-900 uppercase tracking-tight">Segurança Ativa</p>
              <p className="text-[10px] text-slate-400 font-medium leading-relaxed">Apenas usuários verificados acessam a infraestrutura.</p>
            </div>
            <div className="p-6 bg-white rounded-3xl border border-slate-50 space-y-3">
              <Mail size={20} className="text-brand-600" />
              <p className="text-xs font-bold text-slate-900 uppercase tracking-tight">Aviso Direto</p>
              <p className="text-[10px] text-slate-400 font-medium leading-relaxed">Você receberá um e-mail automático após a liberação.</p>
            </div>
          </div>

          {statusMsg && (
            <div className="p-4 bg-brand-50 border border-brand-100 text-brand-700 rounded-2xl text-[10px] font-bold uppercase tracking-widest animate-in fade-in slide-in-from-top-2">
              {statusMsg}
            </div>
          )}

          <div className="space-y-4">
            <button
              onClick={handleCheckStatus}
              disabled={checking}
              className="w-full h-16 bg-brand-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-brand-600 transition-all shadow-xl shadow-slate-200 disabled:opacity-50"
            >
              {checking ? <Loader2 className="animate-spin" size={20} /> : <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />}
              <span className="uppercase tracking-widest text-xs">Atualizar Status</span>
            </button>
            <button
              onClick={handleLogout}
              className="w-full h-14 bg-white text-rose-500 border border-slate-100 rounded-2xl font-bold hover:bg-rose-50 hover:border-rose-100 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
            >
              <LogOut size={16} /> Encerrar Sessão
            </button>
          </div>

          <p className="text-[10px] text-slate-300 font-bold uppercase tracking-[0.4em]">
            Controle de Acesso &bull; FinVision Pro
          </p>
        </div>
      </div>
    </div>
  );
};

export default PendingApproval;
