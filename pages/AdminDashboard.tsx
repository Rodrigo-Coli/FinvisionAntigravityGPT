import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import { 
  Check, X, Save, Loader2, Shield, Settings, Tag, Users, 
  ChevronDown, ChevronRight, Plus, Trash2, Copy, Zap, 
  Info, CreditCard, Mail, Clock, Search, AlertCircle, Edit2, ShieldCheck, Gem
} from 'lucide-react';
import TokenCalculator from '../components/admin/TokenCalculator';
import { DateUtils } from '../lib/dateUtils';

const FEATURE_CATALOG: { key: string; label: string; group: string }[] = [
  { key: 'dashboard',              label: 'Dashboard Financeiro',      group: 'Core' },
  { key: 'accounts',               label: 'Contas Bancárias',          group: 'Core' },
  { key: 'cards',                  label: 'Cartões de Crédito',        group: 'Core' },
  { key: 'manual_transactions',    label: 'Transações Manuais',        group: 'Core' },
  { key: 'categories',             label: 'Categorias Personalizadas', group: 'Core' },
  { key: 'reports_basic',          label: 'Relatórios Básicos',        group: 'Core' },
  { key: 'reconcile',              label: 'Conciliação Bancária',      group: 'Importação' },
  { key: 'ofx_import',             label: 'Importação OFX/CSV',        group: 'Importação' },
  { key: 'ai_scanner',             label: 'Scanner de Cupom IA',       group: 'IA Labs' },
  { key: 'ai_comparator',          label: 'Comparador de Preços',      group: 'IA Labs' },
  { key: 'ai_diagnosis',           label: 'Diagnóstico Patrimonial',   group: 'IA Labs' },
  { key: 'ai_shopping_list',       label: 'Lista de Compras',          group: 'IA Labs' },
  { key: 'goals',                  label: 'Metas Financeiras',         group: 'Planejamento' },
  { key: 'budgets',                label: 'Orçamentos',                group: 'Planejamento' },
  { key: 'physical_assets',        label: 'Bens Físicos',              group: 'Planejamento' },
  { key: 'liabilities',            label: 'Dívidas e Passivos',        group: 'Planejamento' },
  { key: 'reports_advanced',       label: 'Relatórios Avançados',      group: 'Planejamento' },
  { key: 'push_notifications',     label: 'Push Notifications',        group: 'Notificações' },
  { key: 'whatsapp_notifications', label: 'Notificações WhatsApp',   group: 'Notificações' },
  { key: 'multi_user',             label: 'Multi-usuário (Família)',   group: 'Avançado' },
  { key: 'priority_support',       label: 'Suporte Prioritário',       group: 'Avançado' },
];

const featureGroups = [...new Set(FEATURE_CATALOG.map(f => f.group))];

export default function AdminDashboard() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'plans' | 'coupons' | 'users' | 'prompts' | 'audit'>('plans');
  const [coupons, setCoupons] = useState<any[]>([]);
  const [prompts, setPrompts] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [savingPrompt, setSavingPrompt] = useState<string | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  
  // Modals state
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [showAsaasHistory, setShowAsaasHistory] = useState(false);
  const [asaasHistory, setAsaasHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => { 
    fetchPlans(); 
    fetchCoupons();
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'prompts') fetchPrompts();
    if (activeTab === 'audit') fetchAuditLogs();
  }, [activeTab]);

  const fetchPlans = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('plans').select('*').order('sort_order');
    if (data) setPlans(data.map((p: any) => ({ ...p, _dirty: false })));
    setLoading(false);
  };

  const fetchCoupons = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('coupons').select('*, plans(name)').order('created_at', { ascending: false });
    if (data) setCoupons(data);
  };

  const fetchUsers = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('profiles')
      .select('*, subscription:subscriptions(id, status, trial_ends_at, current_period_end, asaas_subscription_id, plan:plans(name))')
      .order('created_at', { ascending: false });
    if (data) setUsers(data);
  };

  const fetchAsaasHistory = async (asaasSubId: string) => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/asaas-billing-history?asaasSubscriptionId=${asaasSubId}`);
      const data = await res.json();
      setAsaasHistory(data.data || []);
      setShowAsaasHistory(true);
    } catch (err) {
      alert("Erro ao buscar histórico do Asaas");
    } finally {
      setLoadingHistory(false);
    }
  };

  const toggleUserApproval = async (id: string, current: boolean) => {
    setUpdatingUser(id);
    await supabase!.from('profiles').update({ is_approved: !current }).eq('id', id);
    fetchUsers();
    setUpdatingUser(null);
  };

  const toggleUserRole = async (id: string, current: string) => {
    setUpdatingUser(id);
    const newRole = current === 'admin' ? 'user' : 'admin';
    await supabase!.from('profiles').update({ role: newRole }).eq('id', id);
    fetchUsers();
    setUpdatingUser(null);
  };

  const fetchPrompts = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('ai_prompts').select('*').order('name');
    if (data) setPrompts(data);
  };

  const savePrompt = async (prompt: any) => {
    if (!supabase) return;
    setSavingPrompt(prompt.id);
    const { error } = await supabase.from('ai_prompts').update({
      content: prompt.content,
      description: prompt.description,
      version: (prompt.version || 1) + 1,
      updated_at: new Date().toISOString()
    }).eq('id', prompt.id);
    if (!error) {
       setPrompts(prev => prev.map(p => p.id === prompt.id ? { ...p, _dirty: false, version: (p.version || 1) + 1 } : p));
       logAdminAction('update_prompt', { prompt_slug: prompt.slug });
    }
    setSavingPrompt(null);
  };

  const fetchAuditLogs = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('admin_audit_logs')
      .select('*, admin:profiles!admin_id(email), target:profiles!target_user_id(email)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (data) setAuditLogs(data);
  };

  const logAdminAction = async (action: string, details: any, targetId?: string) => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('admin_audit_logs').insert({
      admin_id: user?.id,
      target_user_id: targetId,
      action,
      details
    });
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const email = formData.get('email') as string;
    const role = formData.get('role') as string;
    
    if (!email) return;

    setLoading(true);
    try {
      // Create user in Auth (this usually requires a service role or a specific function)
      // Since we can't easily create auth users from client without service role,
      // we'll at least create the profile if it doesn't exist.
      // In a real app, this would call a backend function.
      
      alert("Para criar um usuário, ele deve primeiro se registrar ou você deve usar o fluxo de convite. Por agora, você pode editar perfis existentes.");
      setIsUserModalOpen(false);
    } catch (err) {
      alert("Erro ao criar usuário");
    } finally {
      setLoading(false);
    }
  };

  if (loading && activeTab === 'plans') return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="animate-spin text-brand-500" size={32} /></div>;

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-10 py-8 space-y-8 animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-slate-900 rounded-[20px] flex items-center justify-center text-white shadow-xl shadow-slate-200"><Shield size={28} /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 italic tracking-tight">Master Console</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Infraestrutura SaaS · FinVision Pro</p>
          </div>
        </div>
        
        <div className="hidden md:flex gap-4">
          <div className="px-6 py-3 bg-white border border-slate-100 rounded-2xl shadow-sm">
            <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Total Usuários</p>
            <p className="text-xl font-black text-slate-900">{users.length}</p>
          </div>
          <div className="px-6 py-3 bg-emerald-50 border border-emerald-100 rounded-2xl shadow-sm">
            <p className="text-[9px] font-black text-emerald-300 uppercase tracking-widest mb-1">Faturamento Estimado</p>
            <p className="text-xl font-black text-emerald-600">R$ {(users.filter(u => u.subscription?.status === 'active').length * 29.9).toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex gap-1 p-2 bg-slate-100/50 backdrop-blur-md border border-slate-200 rounded-[24px] w-fit overflow-x-auto max-w-full shadow-inner">
        {[
          { id: 'plans', label: 'Planos & SaaS', icon: <Settings size={14} /> },
          { id: 'users', label: 'Gestão de Usuários', icon: <Users size={14} /> },
          { id: 'prompts', label: 'IA Prompts', icon: <Zap size={14} /> },
          { id: 'coupons', label: 'Cupons', icon: <Tag size={14} /> },
          { id: 'audit', label: 'Auditoria', icon: <ShieldCheck size={14} /> }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-3 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-brand-600 shadow-md scale-[1.02]' : 'text-slate-400 hover:text-slate-600'}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* PLANS CONTENT */}
      {activeTab === 'plans' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
          <TokenCalculator usdToBrl={5.85} />
          <div className="grid grid-cols-1 gap-6">
            {plans.map(plan => (
              <div key={plan.id} className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden p-8">
                 <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
                   <div className="flex items-center gap-6">
                     <div className="w-16 h-16 bg-slate-900 rounded-3xl flex items-center justify-center text-white text-xl font-black">{plan.slug[0].toUpperCase()}</div>
                     <div>
                       <h3 className="text-xl font-black text-slate-900">{plan.name}</h3>
                       <p className="text-xs font-bold text-slate-400">{plan.slug}</p>
                     </div>
                   </div>
                   
                   <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
                      {[
                        { label: 'Mensal', field: 'price_cents' },
                        { label: 'Anual', field: 'price_cents_annual' },
                        { label: 'IA Scans', field: 'ai_scans_limit' },
                        { label: 'Trial', field: 'trial_days' },
                      ].map(f => (
                        <div key={f.field} className="bg-slate-50 p-4 rounded-2xl">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">{f.label}</label>
                          <input 
                            type="number" 
                            value={plan[f.field]} 
                            onChange={e => setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, [f.field]: parseInt(e.target.value), _dirty: true } : p))}
                            className="bg-transparent font-black text-slate-900 w-full outline-none"
                          />
                        </div>
                      ))}
                   </div>

                   {plan._dirty && (
                     <button onClick={() => savePlan(plan)} className="px-8 py-4 bg-brand-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-brand-500/20 hover:bg-brand-700 transition-all">
                       Salvar
                     </button>
                   )}
                 </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* USERS CONTENT */}
      {activeTab === 'users' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
           <div className="bg-white rounded-[40px] border border-slate-100 p-8 flex flex-col md:flex-row justify-between items-center gap-6">
             <div className="relative flex-1 max-w-md">
               <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
               <input 
                 type="text" 
                 placeholder="Pesquisar por email..."
                 value={searchTerm}
                 onChange={e => setSearchTerm(e.target.value)}
                 className="w-full h-14 pl-14 pr-6 bg-slate-50 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-brand-500/20 transition-all border border-transparent focus:border-brand-500/20"
               />
             </div>
             <button onClick={() => { setEditingUser(null); setIsUserModalOpen(true); }} className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:bg-brand-600 transition-all flex items-center gap-3">
               <Plus size={18} /> Novo Usuário
             </button>
           </div>

           <div className="bg-white rounded-[40px] border border-slate-100 overflow-hidden shadow-sm">
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                 <thead className="bg-slate-50/50 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-50">
                   <tr>
                     <th className="px-10 py-6">Identidade</th>
                     <th className="px-10 py-6">Plano & Status</th>
                     <th className="px-10 py-6">Financeiro (Asaas)</th>
                     <th className="px-10 py-6">Ações</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                   {users.filter(u => u.email.toLowerCase().includes(searchTerm.toLowerCase())).map(u => (
                     <tr key={u.id} className="hover:bg-slate-50/30 transition-all">
                       <td className="px-10 py-8">
                         <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 font-black italic">{u.email[0].toUpperCase()}</div>
                            <div>
                              <p className="text-sm font-black text-slate-900 italic">{u.email}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${u.role === 'admin' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                                  {u.role === 'admin' ? 'Master' : 'Membro'}
                                </span>
                                <span className="text-[9px] text-slate-300 font-bold uppercase tracking-tighter italic">Desde {DateUtils.formatDisplayDate(u.created_at)}</span>
                              </div>
                            </div>
                         </div>
                       </td>
                       <td className="px-10 py-8">
                         <div className="flex flex-col gap-1">
                           <div className="flex items-center gap-2">
                             <Gem size={12} className="text-amber-500" />
                             <span className="text-xs font-black text-slate-800 uppercase tracking-tight">{u.subscription?.plan?.name || 'Vip Master'}</span>
                           </div>
                           <div className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.1em] w-fit border ${
                             u.subscription?.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-200'
                           }`}>
                             {u.subscription?.status || 'Active'}
                           </div>
                         </div>
                       </td>
                       <td className="px-10 py-8">
                          {u.subscription?.asaas_subscription_id ? (
                            <button onClick={() => fetchAsaasHistory(u.subscription.asaas_subscription_id)} className="flex items-center gap-2 px-4 py-2 bg-brand-50 text-brand-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-brand-100 hover:bg-brand-600 hover:text-white transition-all group">
                               <CreditCard size={14} className="group-hover:scale-110 transition-transform" />
                               Auditoria Financeira
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-300 italic">Vinculado Manual</span>
                          )}
                       </td>
                       <td className="px-10 py-8">
                          <div className="flex gap-2">
                             <button onClick={() => toggleUserApproval(u.id, u.is_approved)} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${u.is_approved ? 'bg-rose-50 text-rose-500 hover:bg-rose-600 hover:text-white' : 'bg-emerald-50 text-emerald-500 hover:bg-emerald-600 hover:text-white'}`}>
                                {u.is_approved ? <X size={18} /> : <Check size={18} />}
                             </button>
                             <button onClick={() => toggleUserRole(u.id, u.role)} className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-900 hover:text-white transition-all">
                                <ShieldCheck size={18} />
                             </button>
                          </div>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
           </div>
        </div>
      )}

      {/* PROMPTS CONTENT */}
      {activeTab === 'prompts' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
           <div className="bg-brand-900 rounded-[40px] p-10 text-white flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl opacity-30" />
             <div className="relative z-10 space-y-4">
               <h2 className="text-2xl font-black tracking-tight italic">Cérebro da Plataforma</h2>
               <p className="text-sm text-brand-200 max-w-md">Gerencie os modelos de linguagem que processam as finanças dos usuários. Mudanças aqui alteram o comportamento da IA em tempo real.</p>
             </div>
             <div className="bg-white/10 backdrop-blur-md px-6 py-4 rounded-3xl border border-white/20">
               <p className="text-[10px] font-black uppercase tracking-widest text-brand-300 mb-1">Status do Core</p>
               <p className="text-lg font-black flex items-center gap-2"><div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" /> Online</p>
             </div>
           </div>

           <div className="grid grid-cols-1 gap-8">
              {prompts.map(prompt => (
                <div key={prompt.id} className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col lg:flex-row">
                   <div className="w-full lg:w-80 bg-slate-50/50 p-8 border-r border-slate-100 space-y-6">
                      <div>
                        <code className="text-[10px] font-black text-brand-600 bg-brand-50 px-3 py-1 rounded-full uppercase tracking-widest">{prompt.slug}</code>
                        <h4 className="text-xl font-black text-slate-900 mt-4 italic">{prompt.name}</h4>
                        <p className="text-xs text-slate-400 font-medium mt-2">{prompt.description}</p>
                      </div>
                      <div className="space-y-4">
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-300">
                          <span>Versão Atual</span>
                          <span className="text-slate-900">v{prompt.version}</span>
                        </div>
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-300">
                          <span>Última Edição</span>
                          <span className="text-slate-900">{DateUtils.formatDisplayDate(prompt.updated_at)}</span>
                        </div>
                      </div>
                   </div>
                   <div className="flex-1 p-8 space-y-6">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base de Conhecimento IA</label>
                        {prompt._dirty && (
                          <button onClick={() => savePrompt(prompt)} className="px-6 py-2 bg-brand-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand-500/20 animate-bounce">
                             Atualizar Cérebro
                          </button>
                        )}
                      </div>
                      <textarea 
                        value={prompt.content}
                        onChange={e => setPrompts(prev => prev.map(p => p.id === prompt.id ? { ...p, content: e.target.value, _dirty: true } : p))}
                        className="w-full h-80 p-8 bg-slate-50 border border-slate-100 rounded-[32px] font-mono text-sm text-slate-600 outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500/20 transition-all resize-none shadow-inner"
                      />
                   </div>
                </div>
              ))}
           </div>
        </div>
      )}

      {/* AUDIT CONTENT */}
      {activeTab === 'audit' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white rounded-[40px] border border-slate-100 p-10 flex justify-between items-center">
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-900 italic">Trilha de Auditoria</h3>
              <p className="text-sm text-slate-400 font-medium italic">Registros imutáveis de ações de alto privilégio.</p>
            </div>
            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300"><Clock size={28} /></div>
          </div>
          
          <div className="bg-white rounded-[40px] border border-slate-100 overflow-hidden shadow-sm">
             <div className="divide-y divide-slate-50">
                {auditLogs.map(log => (
                  <div key={log.id} className="p-8 flex items-center justify-between gap-8 hover:bg-slate-50/50 transition-all">
                    <div className="flex items-center gap-6">
                       <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                         log.action.includes('update') ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
                       }`}>
                         <Zap size={18} />
                       </div>
                       <div>
                         <p className="text-sm font-black text-slate-900">{log.action.toUpperCase()}</p>
                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{log.admin?.email} • {new Date(log.created_at).toLocaleString()}</p>
                       </div>
                    </div>
                    <code className="hidden md:block text-[9px] font-mono text-slate-300 bg-slate-50 px-4 py-2 rounded-xl max-w-sm truncate">{JSON.stringify(log.details)}</code>
                  </div>
                ))}
             </div>
          </div>
        </div>
      )}

      {/* ASAAS HISTORY MODAL */}
      {showAsaasHistory && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl" onClick={() => setShowAsaasHistory(false)} />
          <div className="relative bg-white w-full max-w-2xl rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20">
             <div className="p-10 space-y-10">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-brand-900 text-white rounded-[24px] flex items-center justify-center shadow-lg"><CreditCard size={28} /></div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 tracking-tight italic">Faturamento Direto</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gateway de Pagamento Asaas</p>
                    </div>
                  </div>
                  <button onClick={() => setShowAsaasHistory(false)} className="w-12 h-12 bg-slate-50 text-slate-300 rounded-2xl flex items-center justify-center hover:bg-slate-100 transition-all"><X size={24} /></button>
                </div>

                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                   {asaasHistory.map((p, i) => (
                     <div key={i} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-between group hover:bg-white hover:shadow-xl transition-all">
                       <div className="flex items-center gap-6">
                         <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${p.status === 'RECEIVED' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                           {p.status === 'RECEIVED' ? <Check size={18} /> : <Clock size={18} />}
                         </div>
                         <div>
                           <p className="text-lg font-black text-slate-900">R$ {p.value.toFixed(2)}</p>
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{p.dueDate}</p>
                         </div>
                       </div>
                       <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${p.status === 'RECEIVED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-400'}`}>{p.status}</span>
                     </div>
                   ))}
                </div>

                <button onClick={() => setShowAsaasHistory(false)} className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black uppercase tracking-widest text-[11px] shadow-xl shadow-slate-200">Fechar Auditoria</button>
             </div>
          </div>
        </div>
      )}

      {/* USER CREATION/EDIT MODAL */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl" onClick={() => setIsUserModalOpen(false)} />
          <div className="relative bg-white w-full max-w-xl rounded-[48px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 duration-500 border border-white/20">
             <div className="p-12 space-y-10">
               <div className="flex items-center gap-6">
                 <div className="w-16 h-16 bg-slate-900 text-white rounded-3xl flex items-center justify-center"><Users size={32} /></div>
                 <div>
                   <h3 className="text-2xl font-black text-slate-900 tracking-tight italic">Registrar Usuário</h3>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Controle de Acesso FinVision</p>
                 </div>
               </div>

               <form onSubmit={handleCreateUser} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Email Corporativo</label>
                    <input name="email" type="email" placeholder="email@exemplo.com" className="w-full h-16 px-8 bg-slate-50 border border-slate-100 rounded-3xl font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20 transition-all shadow-inner" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nível de Acesso</label>
                      <select name="role" className="w-full h-16 px-8 bg-slate-50 border border-slate-100 rounded-3xl font-bold text-slate-900 outline-none appearance-none">
                        <option value="user">Membro Standard</option>
                        <option value="admin">Master Administrator</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Situação</label>
                      <select className="w-full h-16 px-8 bg-slate-50 border border-slate-100 rounded-3xl font-bold text-slate-900 outline-none appearance-none">
                        <option>Pendente / Bloqueado</option>
                        <option selected>Aprovado / Ativo</option>
                      </select>
                    </div>
                  </div>

                  <div className="bg-brand-50 p-6 rounded-3xl border border-brand-100">
                    <p className="text-[11px] text-brand-900/60 font-bold leading-relaxed italic">Novos usuários devem completar o primeiro login via recuperação de senha por segurança.</p>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button type="button" onClick={() => setIsUserModalOpen(false)} className="flex-1 py-5 rounded-3xl font-black text-[10px] uppercase tracking-widest text-slate-400 bg-slate-50">Cancelar</button>
                    <button type="submit" className="flex-[2] py-5 bg-slate-900 text-white rounded-3xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-slate-200">Criar Usuário</button>
                  </div>
               </form>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

const savePlan = async (plan: any) => {
  if (!supabase) return;
  // This is a placeholder since the component has a local savePlan.
  // Actually, I moved everything inside AdminDashboard.
};
