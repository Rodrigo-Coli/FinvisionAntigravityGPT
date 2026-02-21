
import React, { useState, useEffect } from 'react';
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
  AlertCircle
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
    setLoading(true);
    try {
      const { data, error } = await supabase!
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
    } catch (err) {
      console.error("Error fetching profiles:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleApproval = async (id: string, currentStatus: boolean) => {
    setUpdatingId(id);
    try {
      const { error } = await supabase!
        .from('profiles')
        .update({ is_approved: !currentStatus })
        .eq('id', id);

      if (error) throw error;
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, is_approved: !currentStatus } : p));
    } catch (err) {
      alert("Erro ao atualizar status");
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleRole = async (id: string, currentRole: UserRole) => {
    if (id === currentUser.id) {
      alert("Você não pode remover seu próprio acesso admin");
      return;
    }

    setUpdatingId(id);
    const newRole = currentRole === UserRole.ADMIN ? UserRole.USER : UserRole.ADMIN;
    try {
      const { error } = await supabase!
        .from('profiles')
        .update({ role: newRole })
        .eq('id', id);

      if (error) throw error;
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, role: newRole } : p));
    } catch (err) {
      alert("Erro ao atualizar papel");
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredProfiles = profiles.filter(p => p.email.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="w-full flex justify-center py-6 sm:py-10 px-4 sm:px-6 lg:px-8 animate-in fade-in duration-700 bg-gray-50 min-h-screen">
      <div className="inline-block min-w-min max-w-full space-y-8 sm:space-y-10">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
              <Users className="text-blue-600" />
              Gestão de Usuários
            </h1>
            <p className="text-gray-500 text-sm">Controle de acessos, aprovações e permissões do sistema</p>
          </div>
        </header>

        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50">
            <div className="relative max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Pesquisar por e-mail..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-[10px] font-black uppercase text-gray-400 tracking-widest border-b border-gray-100">
                <tr>
                  <th className="px-8 py-4">Usuário</th>
                  <th className="px-8 py-4">Papel</th>
                  <th className="px-8 py-4">Status</th>
                  <th className="px-8 py-4">Criado em</th>
                  <th className="px-8 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-12 text-center">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
                      <p className="text-sm text-gray-400 font-medium">Carregando usuários...</p>
                    </td>
                  </tr>
                ) : filteredProfiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-12 text-center">
                      <AlertCircle className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                      <p className="text-sm text-gray-400 font-medium">Nenhum usuário encontrado.</p>
                    </td>
                  </tr>
                ) : (
                  filteredProfiles.map(profile => (
                    <tr key={profile.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg ${profile.role === UserRole.ADMIN ? 'bg-indigo-600' : 'bg-blue-400'}`}>
                            {profile.email.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">{profile.email}</p>
                            <p className="text-[10px] text-gray-400 font-mono">{profile.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <button
                          onClick={() => toggleRole(profile.id, profile.role)}
                          disabled={updatingId === profile.id}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter border transition-all ${profile.role === UserRole.ADMIN
                              ? 'bg-indigo-50 border-indigo-100 text-indigo-700'
                              : 'bg-gray-50 border-gray-100 text-gray-600 hover:bg-white'
                            }`}
                        >
                          <ShieldCheck size={12} />
                          {profile.role === UserRole.ADMIN ? 'Administrador' : 'Usuário'}
                        </button>
                      </td>
                      <td className="px-8 py-5">
                        <div className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-tighter ${profile.is_approved ? 'text-green-600' : 'text-amber-600'
                          }`}>
                          {profile.is_approved ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                          {profile.is_approved ? 'Aprovado' : 'Pendente'}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-sm text-gray-500">
                        {new Date(profile.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => toggleApproval(profile.id, profile.is_approved)}
                            disabled={updatingId === profile.id}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${profile.is_approved
                                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                : 'bg-green-600 text-white hover:bg-green-700 shadow-md shadow-green-100'
                              }`}
                          >
                            {updatingId === profile.id ? '...' : profile.is_approved ? 'Bloquear' : 'Aprovar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminUsers;
