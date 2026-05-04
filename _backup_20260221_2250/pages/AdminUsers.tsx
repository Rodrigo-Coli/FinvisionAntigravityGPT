import React, { useState, useEffect } from 'react';
import { DateUtils } from '../lib/dateUtils';
import { Profile, UserRole } from '../types';
import { supabase } from '../lib/supabase/client';
import {
  Users,
  Search,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Mail,
  Clock,
  MoreVertical,
  Loader2,
  AlertCircle,
  Shield,
  Check
} from 'lucide-react';

interface AdminUsersProps {
  currentUser: Profile;
}

const AdminUsers: React.FC<AdminUsersProps> = ({ currentUser }) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    // DEV BYPASS
    if (window.location.href.includes('dev=true')) {
      setProfiles([
        { id: '1', email: 'admin@finvision.pro', role: UserRole.ADMIN, is_approved: true, created_at: new Date().toISOString() },
        { id: '2', email: 'user@finvision.pro', role: UserRole.USER, is_approved: false, created_at: new Date().toISOString() }
      ]);
      setLoading(false);
      return;
    }

    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setProfiles(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleApproval = async (id: string, currentStatus: boolean) => {
    setUpdatingId(id);
    try {
      const { error } = await supabase!.from('profiles').update({ is_approved: !currentStatus }).eq('id', id);
      if (error) throw error;
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, is_approved: !currentStatus } : p));
    } catch (err) { alert("Erro ao atualizar"); } finally { setUpdatingId(null); }
  };

  const toggleRole = async (id: string, currentRole: UserRole) => {
    if (id === currentUser.id) { alert("Ação negada"); return; }
    setUpdatingId(id);
    const newRole = currentRole === UserRole.ADMIN ? UserRole.USER : UserRole.ADMIN;
    try {
      const { error } = await supabase!.from('profiles').update({ role: newRole }).eq('id', id);
      if (error) throw error;
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, role: newRole } : p));
    } catch (err) { alert("Erro ao atualizar"); } finally { setUpdatingId(null); }
  };

  const filteredProfiles = profiles.filter(p => p.email.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-10 py-8 space-y-8 animate-in fade-in duration-500">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestão de Usuários</h1>
          <p className="text-sm text-slate-400 font-medium">Controle de acessos e protocolos administrativos.</p>
        </div>
        <div className="p-3 bg-brand-50 text-brand-600 rounded-xl border border-brand-100 shadow-sm">
          <Users size={24} />
        </div>
      </div>

      <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden border-b-4 border-b-slate-100">
        <div className="p-8 border-b border-slate-50 bg-slate-50/20">
          <div className="relative max-w-lg">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
            <input
              type="text"
              placeholder="Pesquisar por conta ou e-mail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-14 pl-16 pr-6 bg-white border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-bold text-slate-900 placeholder:text-slate-200"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-300 tracking-[0.2em] border-b border-slate-50">
              <tr>
                <th className="px-10 py-6">Usuário / Identidade</th>
                <th className="px-10 py-6">Privilégios</th>
                <th className="px-10 py-6">Status Logístico</th>
                <th className="px-10 py-6">Data de Ingresso</th>
                <th className="px-10 py-6 text-right">Controle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-10 py-32 text-center">
                    <Loader2 className="w-10 h-10 text-brand-600 animate-spin mx-auto mb-4" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sincronizando banco de dados...</p>
                  </td>
                </tr>
              ) : filteredProfiles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-10 py-32 text-center">
                    <XCircle className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                    <p className="text-sm text-slate-400 font-medium">Nenhum registro encontrado.</p>
                  </td>
                </tr>
              ) : (
                filteredProfiles.map(profile => (
                  <tr key={profile.id} className="hover:bg-slate-50/30 transition-all group">
                    <td className="px-10 py-8">
                      <div className="flex items-center gap-5">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-sm ${profile.role === UserRole.ADMIN ? 'bg-slate-900 shadow-slate-200' : 'bg-brand-400 shadow-brand-100'}`}>
                          {profile.email.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate uppercase tracking-tight italic">{profile.email}</p>
                          <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest mt-0.5">{profile.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-8">
                      <button
                        onClick={() => toggleRole(profile.id, profile.role)}
                        disabled={updatingId === profile.id}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all ${profile.role === UserRole.ADMIN
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-slate-100 text-slate-400 hover:text-slate-900 hover:border-slate-900'
                          }`}
                      >
                        <Shield size={12} />
                        {profile.role === UserRole.ADMIN ? 'Conselho' : 'Operador'}
                      </button>
                    </td>
                    <td className="px-10 py-8">
                      <div className={`inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${profile.is_approved ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {profile.is_approved ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                        {profile.is_approved ? 'Ativo' : 'Pendente'}
                      </div>
                    </td>
                    <td className="px-10 py-8">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">{DateUtils.formatDisplayDate(profile.created_at?.split('T')[0])}</span>
                    </td>
                    <td className="px-10 py-8 text-right">
                      <button
                        onClick={() => toggleApproval(profile.id, profile.is_approved)}
                        disabled={updatingId === profile.id}
                        className={`min-w-[120px] h-11 px-6 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${profile.is_approved
                          ? 'bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white'
                          : 'bg-brand-600 text-white hover:bg-slate-900 shadow-lg shadow-brand-100'
                          }`}
                      >
                        {updatingId === profile.id ? 'Sinc...' : profile.is_approved ? 'Bloquear' : 'Autorizar'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminUsers;
