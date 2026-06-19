import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import { 
  Check, X, Save, Loader2, Shield, Settings, Tag, Users, 
  ChevronDown, ChevronRight, ChevronUp, Plus, Trash2, Copy, Zap, 
  Info, CreditCard, Mail, Clock, Search, AlertCircle, Edit2, ShieldCheck, Gem, Brain
} from 'lucide-react';
import TokenCalculator from '../components/admin/TokenCalculator';
import { DateUtils } from '../lib/dateUtils';
import { useToast } from '../contexts/ToastContext';

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
const LIMIT_FEATURES = ['accounts', 'cards', 'multi_user'];

export default function AdminDashboard() {
  const { toast } = useToast();
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [aiCostConfig, setAiCostConfig] = useState<any>(null);
  
  // Plan CRUD state
  const [showNewPlanForm, setShowNewPlanForm] = useState(false);
  const [newPlanData, setNewPlanData] = useState({
    name: '', slug: '', description: '',
    price_cents: 0, price_cents_annual: 0,
    ai_scans_limit: 10, trial_days: 7, sort_order: 99
  });
  const [planSubscriberCounts, setPlanSubscriberCounts] = useState<Record<string, number>>({});
  
  // Modals state
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [showAsaasHistory, setShowAsaasHistory] = useState(false);
  const [asaasHistory, setAsaasHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    const fetchSessionUser = async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        setCurrentUserId(data.session.user.id);
      }
    };
    fetchSessionUser();
  }, []);

  useEffect(() => { 
    fetchPlans(); 
    fetchCoupons();
    fetchAiCostConfig();
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'prompts') fetchPrompts();
    if (activeTab === 'audit') fetchAuditLogs();
  }, [activeTab]);

  const fetchPlans = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('plans').select('*').order('sort_order');
    if (data) {
      setPlans(data.map((p: any) => ({ ...p, _dirty: false })));
      // Fetch subscriber counts per plan
      const counts: Record<string, number> = {};
      await Promise.all(data.map(async (plan: any) => {
        const { count } = await supabase!.from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('plan_id', plan.id)
          .in('status', ['active', 'trialing', 'admin_granted']);
        counts[plan.id] = count || 0;
      }));
      setPlanSubscriberCounts(counts);
    }
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
      .select('*, subscription:subscriptions(id, status, trial_ends_at, current_period_end, asaas_subscription_id, plan:plans(name, price_cents))')
      .order('created_at', { ascending: false });
    if (data) setUsers(data);
  };

  const fetchAiCostConfig = async () => {
    if (!supabase) return;
    try {
      const { data } = await supabase.from('ai_cost_config').select('*').maybeSingle();
      if (data) {
        setAiCostConfig(data);
        // Check if last update was more than 3 days ago (72 hours)
        const lastUpdated = new Date(data.updated_at);
        const diffDays = (new Date().getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays >= 3) {
          autoUpdateAiCosts(data);
        }
      } else {
        // If no record exists, insert a default one
        const defaultConfig = {
          model_name: 'Gemini 2.5 Flash',
          input_1m_tokens_usd: 0.30,
          output_1m_tokens_usd: 2.50,
          audio_1m_tokens_usd: 1.00,
          tokens_per_image: 258,
          tokens_per_audio_second: 32,
          usd_to_brl_rate: 5.85,
          updated_at: new Date().toISOString()
        };
        const { data: inserted } = await supabase.from('ai_cost_config').insert(defaultConfig).select().single();
        if (inserted) setAiCostConfig(inserted);
      }
    } catch (e) {
      console.warn("Erro ao buscar ai_cost_config:", e);
    }
  };

  const autoUpdateAiCosts = async (currentConfig: any) => {
    try {
      // 1. Fetch exchange rate from awesomeapi
      const exchangeRes = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
      const exchangeData = await exchangeRes.json();
      const fetchedRate = parseFloat(exchangeData?.USDBRL?.bid || '0');
      
      const minInputUsd = 0.30;
      const minOutputUsd = 2.50;
      const minAudioUsd = 1.00;

      let hasChanges = false;
      const updatedConfig = { ...currentConfig };

      // Update rate if fetched rate is higher/newer
      if (fetchedRate > 0 && fetchedRate > parseFloat(currentConfig.usd_to_brl_rate)) {
        updatedConfig.usd_to_brl_rate = fetchedRate;
        hasChanges = true;
      }

      // Update token costs if outdated (lower than minimum threshold)
      if (parseFloat(currentConfig.input_1m_tokens_usd) < minInputUsd) {
        updatedConfig.input_1m_tokens_usd = minInputUsd;
        hasChanges = true;
      }
      if (parseFloat(currentConfig.output_1m_tokens_usd) < minOutputUsd) {
        updatedConfig.output_1m_tokens_usd = minOutputUsd;
        hasChanges = true;
      }
      if (parseFloat(currentConfig.audio_1m_tokens_usd) < minAudioUsd) {
        updatedConfig.audio_1m_tokens_usd = minAudioUsd;
        hasChanges = true;
      }

      updatedConfig.updated_at = new Date().toISOString();
      
      const { error } = await supabase!.from('ai_cost_config').update(updatedConfig).eq('id', currentConfig.id);
      if (!error) {
        setAiCostConfig(updatedConfig);
        logAdminAction('auto_update_ai_costs', { 
          reason: 'Verificação periódica de 3 dias',
          rate_updated: fetchedRate > parseFloat(currentConfig.usd_to_brl_rate),
          previous_rate: currentConfig.usd_to_brl_rate,
          new_rate: updatedConfig.usd_to_brl_rate
        });
        toast("Custos de IA verificados e atualizados automaticamente!", "info");
      }
    } catch (err) {
      console.warn("Erro na atualização automática de custos de IA:", err);
    }
  };

  const getPredictedAiCost = (aiScansLimit: number) => {
    if (!aiCostConfig) return 0;
    const input1mUsd = parseFloat(aiCostConfig.input_1m_tokens_usd) || 0.30;
    const output1mUsd = parseFloat(aiCostConfig.output_1m_tokens_usd) || 2.50;
    const audio1mUsd = parseFloat(aiCostConfig.audio_1m_tokens_usd) || 1.00;
    const usdRate = parseFloat(aiCostConfig.usd_to_brl_rate) || 5.85;

    // Tokens assumptions per scan
    const inputTokens = 1258; // 1000 prompt + 258 image
    const audioTokens = 320;  // 10 sec * 32 tokens/sec
    const outputTokens = 800;

    const costPerScanUsd = (inputTokens / 1_000_000) * input1mUsd +
                           (audioTokens / 1_000_000) * audio1mUsd +
                           (outputTokens / 1_000_000) * output1mUsd;
    
    const costPerScanBrl = costPerScanUsd * usdRate;
    const scansCount = aiScansLimit === -1 ? 1000 : aiScansLimit;
    return scansCount * costPerScanBrl;
  };

  const fetchAsaasHistory = async (asaasSubId: string) => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/asaas-billing-history?asaasSubscriptionId=${asaasSubId}`);
      const data = await res.json();
      setAsaasHistory(data.data || []);
      setShowAsaasHistory(true);
    } catch (err) {
      toast("Erro ao buscar histórico do Asaas", "error");
    } finally {
      setLoadingHistory(false);
    }
  };

  const toggleUserApproval = async (id: string, current: boolean) => {
    if (id === currentUserId) {
      toast("Você não pode suspender sua própria conta administrativa.", "error");
      return;
    }

    if (!confirm(`Tem certeza de que deseja ${current ? 'suspender/bloquear' : 'aprovar/ativar'} este usuário?`)) {
      return;
    }

    setUpdatingUser(id);
    const { error } = await supabase!.from('profiles').update({ is_approved: !current }).eq('id', id);
    if (!error) {
      toast(`Situação do usuário alterada para ${!current ? 'Aprovado' : 'Bloqueado'}!`, "success");
      logAdminAction('toggle_user_approval', { target_user_id: id, approved: !current }, id);
      fetchUsers();
    } else {
      toast(`Erro ao alterar situação: ${error.message}`, "error");
    }
    setUpdatingUser(null);
  };

  const toggleUserRole = async (id: string, current: string) => {
    if (id === currentUserId) {
      toast("Você não pode revogar seus próprios privilégios administrativos para evitar o bloqueio da conta.", "error");
      return;
    }

    if (!confirm(`Tem certeza de que deseja alterar o nível de acesso deste usuário para ${current === 'admin' ? 'Membro' : 'Administrador'}?`)) {
      return;
    }

    setUpdatingUser(id);
    const newRole = current === 'admin' ? 'user' : 'admin';
    const { error } = await supabase!.from('profiles').update({ role: newRole }).eq('id', id);
    if (!error) {
      toast(`Cargo do usuário alterado para ${newRole === 'admin' ? 'Master' : 'Membro'}!`, "success");
      logAdminAction('toggle_user_role', { target_user_id: id, role: newRole }, id);
      fetchUsers();
    } else {
      toast(`Erro ao alterar cargo: ${error.message}`, "error");
    }
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
       toast("Prompt de IA atualizado com sucesso!", "success");
    } else {
       toast(`Erro ao salvar prompt: ${error.message}`, "error");
    }
    setSavingPrompt(null);
  };

  const savePlan = async (plan: any) => {
    if (!supabase) return;

    if (plan.price_cents < 0 || plan.price_cents_annual < 0 || plan.trial_days < 0) {
      toast('Os valores de preco e dias de trial nao podem ser negativos.', 'error');
      return;
    }
    if (plan.ai_scans_limit < -1) {
      toast('O limite de IA Scans nao pode ser menor que -1.', 'error');
      return;
    }

    setSaving(plan.id);
    try {
      const { error } = await supabase.from('plans').update({
        price_cents: plan.price_cents,
        price_cents_annual: plan.price_cents_annual,
        ai_scans_limit: plan.ai_scans_limit,
        trial_days: plan.trial_days,
        features: plan.features,
        description: plan.description || '',
        updated_at: new Date().toISOString()
      }).eq('id', plan.id);
      
      if (!error) {
        setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, _dirty: false } : p));
        logAdminAction('update_plan', { 
          plan_slug: plan.slug, 
          price_cents: plan.price_cents,
          price_cents_annual: plan.price_cents_annual,
          ai_scans_limit: plan.ai_scans_limit,
          trial_days: plan.trial_days,
          features: plan.features
        });
        toast(`Plano "${plan.name}" atualizado com sucesso!`, 'success');
      } else {
        throw error;
      }
    } catch (err: any) {
      toast(`Erro ao salvar plano: ${err.message}`, 'error');
    } finally {
      setSaving(null);
    }
  };

  const createPlan = async () => {
    if (!supabase) return;
    const { name, slug, description, price_cents, price_cents_annual, ai_scans_limit, trial_days, sort_order } = newPlanData;
    if (!name.trim() || !slug.trim()) {
      toast('Nome e Slug sao obrigatorios.', 'error');
      return;
    }
    // Check slug uniqueness
    const { data: existing } = await supabase.from('plans').select('id').eq('slug', slug.trim()).maybeSingle();
    if (existing) {
      toast(`Ja existe um plano com o slug "${slug}". Escolha um slug unico.`, 'error');
      return;
    }
    setSaving('new');
    try {
      const { data, error } = await supabase.from('plans').insert({
        name: name.trim(),
        slug: slug.trim().toLowerCase().replace(/\s+/g, '-'),
        description: description.trim(),
        price_cents,
        price_cents_annual,
        ai_scans_limit,
        trial_days,
        sort_order,
        is_active: true,
        features: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).select().single();
      if (!error && data) {
        toast(`Plano "${name}" criado com sucesso!`, 'success');
        logAdminAction('create_plan', { plan_slug: slug });
        setShowNewPlanForm(false);
        setNewPlanData({ name: '', slug: '', description: '', price_cents: 0, price_cents_annual: 0, ai_scans_limit: 10, trial_days: 7, sort_order: 99 });
        fetchPlans();
      } else {
        throw error;
      }
    } catch (err: any) {
      toast(`Erro ao criar plano: ${err.message}`, 'error');
    } finally {
      setSaving(null);
    }
  };

  const togglePlanActive = async (plan: any) => {
    if (!supabase) return;
    const newActive = !plan.is_active;
    if (!newActive) {
      const count = planSubscriberCounts[plan.id] || 0;
      if (count > 0) {
        const confirmed = confirm(`Este plano possui ${count} assinante(s) ativo(s). Ao arquiva-lo, novos usuarios nao poderao mais selecioná-lo, mas os atuais continuarao. Confirmar?`);
        if (!confirmed) return;
      }
    }
    const { error } = await supabase.from('plans').update({ is_active: newActive, updated_at: new Date().toISOString() }).eq('id', plan.id);
    if (!error) {
      setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, is_active: newActive } : p));
      toast(`Plano "${plan.name}" ${newActive ? 'ativado' : 'arquivado'}!`, 'success');
      logAdminAction('toggle_plan_active', { plan_slug: plan.slug, active: newActive });
    } else {
      toast(`Erro ao alterar plano: ${error.message}`, 'error');
    }
  };

  const deletePlan = async (plan: any) => {
    if (!supabase) return;
    const count = planSubscriberCounts[plan.id] || 0;
    if (count > 0) {
      toast(`Nao e possivel excluir: este plano tem ${count} assinante(s) ativo(s). Arquive-o primeiro.`, 'error');
      return;
    }
    if (plan.is_active) {
      toast('Arquive o plano antes de excluir permanentemente.', 'error');
      return;
    }
    const confirmed = confirm(`ATENCAO: Excluir permanentemente o plano "${plan.name}"? Esta acao nao pode ser desfeita.`);
    if (!confirmed) return;
    const typeConfirm = prompt(`Digite o nome do plano para confirmar: "${plan.name}"`);
    if (typeConfirm !== plan.name) {
      toast('Nome incorreto. Exclusao cancelada.', 'warning');
      return;
    }
    const { error } = await supabase.from('plans').delete().eq('id', plan.id);
    if (!error) {
      toast(`Plano "${plan.name}" excluido permanentemente.`, 'success');
      logAdminAction('delete_plan', { plan_slug: plan.slug });
      fetchPlans();
    } else {
      toast(`Erro ao excluir: ${error.message}`, 'error');
    }
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
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
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
    
    if (!email) return;

    setLoading(true);
    try {
      toast("Para criar um usuário, ele deve primeiro se registrar ou você deve usar o fluxo de convite. Por agora, você pode editar perfis existentes.", "warning");
      setIsUserModalOpen(false);
    } catch (err) {
      toast("Erro ao criar usuário", "error");
    } finally {
      setLoading(false);
    }
  };

  // MRR sum
  const activeUsers = users.filter(u => u.subscription?.status === 'active');
  const totalBilled = activeUsers.reduce((sum, u) => {
    const planPrice = u.subscription?.plan?.price_cents || 0;
    return sum + (planPrice / 100);
  }, 0);

  if (loading && activeTab === 'plans') return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="animate-spin text-brand-500" size={32} /></div>;

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-10 py-8 space-y-8 animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-slate-900 dark:bg-slate-800 rounded-[20px] flex items-center justify-center text-white shadow-xl shadow-slate-200 dark:shadow-none"><Shield size={28} /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white italic tracking-tight">Master Console</h1>
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em]">Infraestrutura SaaS · FinVision Pro</p>
          </div>
        </div>
        
        <div className="hidden md:flex gap-4">
          <div className="px-6 py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm">
            <p className="text-[9px] font-black text-slate-300 dark:text-slate-500 uppercase tracking-widest mb-1">Total Usuários</p>
            <p className="text-xl font-black text-slate-900 dark:text-white">{users.length}</p>
          </div>
          <div className="px-6 py-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl shadow-sm">
            <p className="text-[9px] font-black text-emerald-300 dark:text-emerald-500 uppercase tracking-widest mb-1">Faturamento Estimado</p>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">R$ {totalBilled.toFixed(2).replace('.', ',')}</p>
          </div>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex gap-1 p-2 bg-slate-100/50 dark:bg-slate-800/30 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-[24px] w-fit overflow-x-auto max-w-full shadow-inner">
        {[
          { id: 'plans', label: 'Planos & SaaS', icon: <Settings size={14} /> },
          { id: 'users', label: 'Gestão de Usuários', icon: <Users size={14} /> },
          { id: 'prompts', label: 'IA Prompts', icon: <Zap size={14} /> },
          { id: 'coupons', label: 'Cupons', icon: <Tag size={14} /> },
          { id: 'audit', label: 'Auditoria', icon: <ShieldCheck size={14} /> }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-3 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-md scale-[1.02]' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* PLANS CONTENT */}
      {activeTab === 'plans' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
          <TokenCalculator usdToBrl={aiCostConfig ? parseFloat(aiCostConfig.usd_to_brl_rate) : 5.85} />

          {/* CONFIGURAÇÃO MANUAL DE CUSTOS DE IA */}
          {aiCostConfig && (
            <div className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-100 dark:border-slate-800 p-8 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <Brain size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white">Custos Unitários da IA</h3>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Modelo Base: {aiCostConfig.model_name}</p>
                  </div>
                </div>
                <button 
                  onClick={async () => {
                    const { error } = await supabase!.from('ai_cost_config').update({
                      input_1m_tokens_usd: aiCostConfig.input_1m_tokens_usd,
                      output_1m_tokens_usd: aiCostConfig.output_1m_tokens_usd,
                      audio_1m_tokens_usd: aiCostConfig.audio_1m_tokens_usd,
                      usd_to_brl_rate: aiCostConfig.usd_to_brl_rate,
                      updated_at: new Date().toISOString()
                    }).eq('id', aiCostConfig.id);
                    if (!error) {
                      toast("Custos de IA salvos com sucesso!", "success");
                      logAdminAction('update_ai_costs', aiCostConfig);
                    } else {
                      toast(`Erro ao salvar: ${error.message}`, "error");
                    }
                  }}
                  className="px-6 py-3 bg-slate-900 dark:bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-md hover:bg-brand-600 transition-all flex items-center gap-2"
                >
                  <Save size={14} /> Salvar Parâmetros
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Câmbio USD -> BRL', field: 'usd_to_brl_rate', step: '0.01' },
                  { label: 'Input 1M Tokens (USD)', field: 'input_1m_tokens_usd', step: '0.01' },
                  { label: 'Output 1M Tokens (USD)', field: 'output_1m_tokens_usd', step: '0.01' },
                  { label: 'Audio 1M Tokens (USD)', field: 'audio_1m_tokens_usd', step: '0.01' },
                ].map(cfg => (
                  <div key={cfg.field} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl">
                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2">{cfg.label}</label>
                    <input 
                      type="number" 
                      step={cfg.step}
                      value={aiCostConfig[cfg.field]} 
                      onChange={e => setAiCostConfig({ ...aiCostConfig, [cfg.field]: parseFloat(e.target.value) })}
                      className="bg-transparent font-black text-slate-900 dark:text-white w-full outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="space-y-6">
            {/* HEADER DE PLANOS */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">Planos Cadastrados</h2>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{plans.length} planos · {plans.filter(p => p.is_active).length} ativos</p>
              </div>
              <button
                onClick={() => setShowNewPlanForm(!showNewPlanForm)}
                className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-brand-500/20 hover:bg-brand-700 transition-all"
              >
                <Plus size={14} /> Novo Plano
              </button>
            </div>

            {/* FORMULARIO DE NOVO PLANO */}
            {showNewPlanForm && (
              <div className="bg-brand-50 dark:bg-brand-950/20 border-2 border-brand-200 dark:border-brand-800 rounded-[32px] p-8 space-y-6 animate-in slide-in-from-top-4 duration-300">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-brand-900 dark:text-brand-300 uppercase tracking-widest">Criar Novo Plano</h3>
                  <button onClick={() => setShowNewPlanForm(false)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors"><X size={16} /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { label: 'Nome do Plano *', field: 'name', type: 'text', placeholder: 'Ex: Premium' },
                    { label: 'Slug (URL) *', field: 'slug', type: 'text', placeholder: 'Ex: premium' },
                    { label: 'Descricao', field: 'description', type: 'text', placeholder: 'Descricao curta do plano' },
                    { label: 'Preco Mensal (Centavos)', field: 'price_cents', type: 'number', placeholder: '1990' },
                    { label: 'Preco Anual (Centavos)', field: 'price_cents_annual', type: 'number', placeholder: '19900' },
                    { label: 'Scans IA por Mes', field: 'ai_scans_limit', type: 'number', placeholder: '50' },
                    { label: 'Trial (Dias)', field: 'trial_days', type: 'number', placeholder: '7' },
                    { label: 'Ordem de Exibicao', field: 'sort_order', type: 'number', placeholder: '99' },
                  ].map(f => (
                    <div key={f.field} className="bg-white dark:bg-slate-900 p-4 rounded-2xl">
                      <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2">{f.label}</label>
                      <input
                        type={f.type}
                        placeholder={f.placeholder}
                        value={(newPlanData as any)[f.field]}
                        onChange={e => setNewPlanData(prev => ({ ...prev, [f.field]: f.type === 'number' ? parseInt(e.target.value) || 0 : e.target.value }))}
                        className="bg-transparent font-bold text-slate-900 dark:text-white w-full outline-none placeholder:text-slate-300 text-sm"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-4">
                  <button onClick={() => setShowNewPlanForm(false)} className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">
                    Cancelar
                  </button>
                  <button
                    onClick={createPlan}
                    disabled={saving === 'new'}
                    className="px-8 py-3 bg-brand-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-brand-500/20 hover:bg-brand-700 transition-all flex items-center gap-2 disabled:opacity-60"
                  >
                    {saving === 'new' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Criar Plano
                  </button>
                </div>
              </div>
            )}

            {/* LISTA DE PLANOS */}
            <div className="grid grid-cols-1 gap-6">
            {plans.map(plan => (
              <div key={plan.id} className={`bg-white dark:bg-slate-900 rounded-[40px] border shadow-sm overflow-hidden p-8 space-y-6 transition-all ${plan.is_active ? 'border-slate-100 dark:border-slate-800' : 'border-slate-200 dark:border-slate-700 opacity-60'}`}>
                 <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
                   <div className="flex items-center gap-6">
                     <div className={`w-16 h-16 rounded-3xl flex items-center justify-center text-white text-xl font-black ${plan.is_active ? 'bg-slate-900 dark:bg-slate-800' : 'bg-slate-400 dark:bg-slate-700'}`}>{plan.slug[0].toUpperCase()}</div>
                     <div className="space-y-1">
                       <div className="flex items-center gap-3 flex-wrap">
                         <h3 className="text-xl font-black text-slate-900 dark:text-white">{plan.name}</h3>
                         {plan.is_active ? (
                           <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-100 dark:border-emerald-900/30">Ativo</span>
                         ) : (
                           <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full">Inativo</span>
                         )}
                         {planSubscriberCounts[plan.id] > 0 && (
                           <span className="text-[9px] font-black uppercase tracking-widest text-brand-600 bg-brand-50 dark:bg-brand-950/30 dark:text-brand-400 px-2.5 py-1 rounded-full border border-brand-100 dark:border-brand-900/30">
                             {planSubscriberCounts[plan.id]} assinante{planSubscriberCounts[plan.id] > 1 ? 's' : ''}
                           </span>
                         )}
                       </div>
                       <p className="text-xs font-bold text-slate-400 dark:text-slate-500">{plan.slug}</p>
                       <p className="text-[10px] font-black text-rose-500 dark:text-rose-400 uppercase tracking-widest pt-0.5">
                         Custo IA Previsto: R$ {getPredictedAiCost(plan.ai_scans_limit).toFixed(2).replace('.', ',')} / mês
                         {plan.ai_scans_limit === -1 && ' (Simulado: 1000 scans)'}
                       </p>
                       <button 
                         onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                         className="flex items-center gap-1.5 text-[10px] font-black text-brand-600 dark:text-brand-400 uppercase tracking-widest hover:underline pt-1.5"
                       >
                         {expandedPlan === plan.id ? (
                           <>Recolher Recursos <ChevronUp size={12} /></>
                         ) : (
                           <>Configurar Recursos & Limites <ChevronDown size={12} /></>
                         )}
                       </button>
                     </div>
                   </div>
                   
                   <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
                      {[
                        { label: 'Mensal (Centavos)', field: 'price_cents' },
                        { label: 'Anual (Centavos)', field: 'price_cents_annual' },
                        { label: 'IA Scans', field: 'ai_scans_limit' },
                        { label: 'Trial (Dias)', field: 'trial_days' },
                      ].map(f => (
                        <div key={f.field} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl">
                          <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2">{f.label}</label>
                          <input 
                            type="number" 
                            min={f.field === 'ai_scans_limit' ? -1 : 0}
                            value={plan[f.field]} 
                            onChange={e => setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, [f.field]: parseInt(e.target.value), _dirty: true } : p))}
                            className="bg-transparent font-black text-slate-900 dark:text-white w-full outline-none"
                          />
                        </div>
                      ))}
                   </div>

                   <div className="flex flex-col gap-2">
                     {plan._dirty && (
                       <button onClick={() => savePlan(plan)} className="px-8 py-4 bg-brand-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-brand-500/20 hover:bg-brand-700 transition-all flex items-center gap-2">
                         <Save size={14} /> Salvar
                       </button>
                     )}
                     {/* ARCHIVE / DELETE CONTROLS */}
                     <div className="flex items-center gap-2">
                       <button
                         onClick={() => togglePlanActive(plan)}
                         title={plan.is_active ? 'Arquivar plano' : 'Reativar plano'}
                         className={`px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all flex items-center gap-1.5 ${
                           plan.is_active
                             ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 hover:bg-amber-100 border border-amber-100 dark:border-amber-900/30'
                             : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 border border-emerald-100 dark:border-emerald-900/30'
                         }`}
                       >
                         {plan.is_active ? <><X size={10} /> Arquivar</> : <><Check size={10} /> Ativar</>}
                       </button>
                       {!plan.is_active && (planSubscriberCounts[plan.id] || 0) === 0 && (
                         <button
                           onClick={() => deletePlan(plan)}
                           title="Excluir permanentemente"
                           className="px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[9px] bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 border border-rose-100 dark:border-rose-900/30 transition-all flex items-center gap-1.5"
                         >
                           <Trash2 size={10} /> Excluir
                         </button>
                       )}
                     </div>
                   </div>
                 </div>

                 {/* EXPANDED FEATURES GRID */}
                 {expandedPlan === plan.id && (
                   <div className="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-6 animate-in fade-in duration-300">
                     <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">Funcionalidades do Plano</h4>
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                       {featureGroups.map(group => (
                         <div key={group} className="bg-slate-50 dark:bg-slate-850 p-6 rounded-3xl border border-slate-100/50 dark:border-slate-800/50 space-y-4">
                           <h5 className="text-[10px] font-black text-brand-600 dark:text-brand-400 uppercase tracking-widest">{group}</h5>
                           <div className="space-y-3">
                             {FEATURE_CATALOG.filter(f => f.group === group).map(feature => {
                               const featuresObj = plan.features || {};
                               const featureVal = featuresObj[feature.key];
                               const isChecked = featureVal !== undefined && featureVal !== false && featureVal !== null;
                               const hasLimitInput = LIMIT_FEATURES.includes(feature.key);
                               const limitVal = typeof featureVal === 'number' ? featureVal : (feature.key === 'multi_user' ? 10 : -1);

                               return (
                                 <div key={feature.key} className="flex flex-col gap-2 p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-100 dark:hover:border-slate-700">
                                   <label className="flex items-center gap-3 cursor-pointer select-none">
                                     <input 
                                       type="checkbox"
                                       checked={isChecked}
                                       onChange={e => {
                                         const nextChecked = e.target.checked;
                                         const nextFeatures = { ...featuresObj };
                                         if (nextChecked) {
                                           nextFeatures[feature.key] = hasLimitInput ? limitVal : true;
                                         } else {
                                           nextFeatures[feature.key] = false;
                                         }
                                         setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, features: nextFeatures, _dirty: true } : p));
                                       }}
                                       className="rounded border-slate-300 dark:border-slate-700 text-brand-600 focus:ring-brand-500 w-4 h-4"
                                     />
                                     <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{feature.label}</span>
                                   </label>
                                   
                                   {isChecked && hasLimitInput && (
                                     <div className="flex items-center gap-2 pl-7">
                                       <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Limite:</span>
                                       <input 
                                         type="number"
                                         value={limitVal}
                                         onChange={e => {
                                           const val = parseInt(e.target.value);
                                           const nextFeatures = { ...featuresObj };
                                           nextFeatures[feature.key] = isNaN(val) ? -1 : val;
                                           setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, features: nextFeatures, _dirty: true } : p));
                                         }}
                                         placeholder="Ilimitado (-1)"
                                         className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/20"
                                       />
                                     </div>
                                   )}
                                 </div>
                               );
                             })}
                           </div>
                         </div>
                       ))}
                     </div>
                   </div>
                 )}
              </div>
            ))}
            </div>
          </div>
        </div>
      )}

      {/* USERS CONTENT */}
      {activeTab === 'users' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
           <div className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-100 dark:border-slate-800 p-8 flex flex-col md:flex-row justify-between items-center gap-6">
             <div className="relative flex-1 max-w-md">
               <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600" size={20} />
               <input 
                 type="text" 
                 placeholder="Pesquisar por email..."
                 value={searchTerm}
                 onChange={e => setSearchTerm(e.target.value)}
                 className="w-full h-14 pl-14 pr-6 bg-slate-50 dark:bg-slate-800 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-brand-500/20 transition-all border border-transparent focus:border-brand-500/20 dark:text-white"
               />
             </div>
             <button onClick={() => { setEditingUser(null); setIsUserModalOpen(true); }} className="px-8 py-4 bg-slate-900 dark:bg-slate-850 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:bg-brand-600 dark:hover:bg-brand-600 transition-all flex items-center gap-3">
               <Plus size={18} /> Novo Usuário
             </button>
           </div>

           <div className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                 <thead className="bg-slate-50/50 dark:bg-slate-800/50 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest border-b border-slate-50 dark:border-slate-800">
                   <tr>
                     <th className="px-10 py-6">Identidade</th>
                     <th className="px-10 py-6">Plano & Status</th>
                     <th className="px-10 py-6">Financeiro (Asaas)</th>
                     <th className="px-10 py-6">Ações</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                   {users.filter(u => u.email.toLowerCase().includes(searchTerm.toLowerCase())).map(u => (
                     <tr key={u.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/30 transition-all">
                       <td className="px-10 py-8">
                         <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 dark:text-slate-500 font-black italic">{u.email[0].toUpperCase()}</div>
                            <div>
                              <p className="text-sm font-black text-slate-900 dark:text-white italic">{u.email}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${u.role === 'admin' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                                  {u.role === 'admin' ? 'Master' : 'Membro'}
                                </span>
                                <span className="text-[9px] text-slate-300 dark:text-slate-500 font-bold uppercase tracking-tighter italic">Desde {DateUtils.formatDisplayDate(u.created_at)}</span>
                              </div>
                            </div>
                         </div>
                       </td>
                       <td className="px-10 py-8">
                         <div className="flex flex-col gap-1">
                           <div className="flex items-center gap-2">
                             <Gem size={12} className="text-amber-500" />
                             <span className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight">{u.subscription?.plan?.name || 'Vip Master'}</span>
                           </div>
                           <div className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.1em] w-fit border ${
                             u.subscription?.status === 'active' ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                           }`}>
                             {u.subscription?.status || 'Active'}
                           </div>
                         </div>
                       </td>
                       <td className="px-10 py-8">
                          {u.subscription?.asaas_subscription_id ? (
                            <button onClick={() => fetchAsaasHistory(u.subscription.asaas_subscription_id)} className="flex items-center gap-2 px-4 py-2 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 rounded-xl text-[10px] font-black uppercase tracking-widest border border-brand-100 dark:border-brand-900 hover:bg-brand-600 hover:text-white transition-all group">
                               <CreditCard size={14} className="group-hover:scale-110 transition-transform" />
                               Auditoria Financeira
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-300 dark:text-slate-600 italic">Vinculado Manual</span>
                          )}
                       </td>
                       <td className="px-10 py-8">
                          <div className="flex gap-2">
                             <button onClick={() => toggleUserApproval(u.id, u.is_approved)} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${u.is_approved ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-500 hover:bg-rose-600 hover:text-white' : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 hover:bg-emerald-600 hover:text-white'}`}>
                                {u.is_approved ? <X size={18} /> : <Check size={18} />}
                             </button>
                             <button onClick={() => toggleUserRole(u.id, u.role)} className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-400 flex items-center justify-center hover:bg-slate-900 dark:hover:bg-slate-750 hover:text-white dark:hover:text-white transition-all">
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
           <div className="bg-brand-900 dark:bg-brand-950 rounded-[40px] p-10 text-white flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden">
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
                <div key={prompt.id} className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col lg:flex-row">
                   <div className="w-full lg:w-80 bg-slate-50/50 dark:bg-slate-800/30 p-8 border-r border-slate-100 dark:border-slate-800 space-y-6">
                      <div>
                        <code className="text-[10px] font-black text-brand-600 bg-brand-50 dark:bg-brand-900/30 dark:text-brand-400 px-3 py-1 rounded-full uppercase tracking-widest">{prompt.slug}</code>
                        <h4 className="text-xl font-black text-slate-900 dark:text-white mt-4 italic">{prompt.name}</h4>
                        <p className="text-xs text-slate-400 dark:text-slate-500 font-medium mt-2">{prompt.description}</p>
                      </div>
                      <div className="space-y-4">
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-300 dark:text-slate-600">
                          <span>Versão Atual</span>
                          <span className="text-slate-900 dark:text-white">v{prompt.version}</span>
                        </div>
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-300 dark:text-slate-600">
                          <span>Última Edição</span>
                          <span className="text-slate-900 dark:text-white">{DateUtils.formatDisplayDate(prompt.updated_at)}</span>
                        </div>
                      </div>
                   </div>
                   <div className="flex-1 p-8 space-y-6">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Base de Conhecimento IA</label>
                        {prompt._dirty && (
                          <button onClick={() => savePrompt(prompt)} className="px-6 py-2 bg-brand-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand-500/20 animate-bounce">
                             Atualizar Cérebro
                          </button>
                        )}
                      </div>
                      <textarea 
                        value={prompt.content}
                        onChange={e => setPrompts(prev => prev.map(p => p.id === prompt.id ? { ...p, content: e.target.value, _dirty: true } : p))}
                        className="w-full h-80 p-8 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[32px] font-mono text-sm text-slate-600 dark:text-slate-200 outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500/20 transition-all resize-none shadow-inner"
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
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-10 flex justify-between items-center rounded-[40px]">
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-900 dark:text-white italic">Trilha de Auditoria</h3>
              <p className="text-sm text-slate-400 dark:text-slate-500 font-medium italic">Registros imutáveis de ações de alto privilégio.</p>
            </div>
            <div className="w-14 h-14 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-300 dark:text-slate-600"><Clock size={28} /></div>
          </div>
          
          <div className="bg-white dark:bg-slate-900 rounded-[40px] border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
             <div className="divide-y divide-slate-50 dark:divide-slate-800">
                {auditLogs.map(log => (
                  <div key={log.id} className="p-8 flex items-center justify-between gap-8 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-all">
                    <div className="flex items-center gap-6">
                       <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                         log.action.includes('update') ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                       }`}>
                          <Zap size={18} />
                       </div>
                       <div>
                          <p className="text-sm font-black text-slate-900 dark:text-white">{log.action.toUpperCase()}</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">{log.admin?.email} • {new Date(log.created_at).toLocaleString()}</p>
                       </div>
                    </div>
                    <code className="hidden md:block text-[9px] font-mono text-slate-300 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 px-4 py-2 rounded-xl max-w-sm truncate">{JSON.stringify(log.details)}</code>
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
          <div className="relative bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20 dark:border-slate-800 text-slate-900 dark:text-white">
             <div className="p-10 space-y-10">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-brand-900 text-white rounded-[24px] flex items-center justify-center shadow-lg"><CreditCard size={28} /></div>
                    <div>
                      <h3 className="text-2xl font-black tracking-tight italic">Faturamento Direto</h3>
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Gateway de Pagamento Asaas</p>
                    </div>
                  </div>
                  <button onClick={() => setShowAsaasHistory(false)} className="w-12 h-12 bg-slate-50 dark:bg-slate-850 text-slate-300 dark:text-slate-500 rounded-2xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"><X size={24} /></button>
                </div>

                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                   {asaasHistory.map((p, i) => (
                     <div key={i} className="p-6 bg-slate-50 dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 flex items-center justify-between group hover:bg-white dark:hover:bg-slate-700 hover:shadow-xl transition-all">
                       <div className="flex items-center gap-6">
                         <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${p.status === 'RECEIVED' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'}`}>
                           {p.status === 'RECEIVED' ? <Check size={18} /> : <Clock size={18} />}
                         </div>
                         <div>
                           <p className="text-lg font-black">R$ {p.value.toFixed(2)}</p>
                           <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{p.dueDate}</p>
                         </div>
                       </div>
                       <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${p.status === 'RECEIVED' ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'}`}>{p.status}</span>
                     </div>
                   ))}
                </div>

                <button onClick={() => setShowAsaasHistory(false)} className="w-full py-5 bg-slate-900 dark:bg-slate-800 text-white rounded-3xl font-black uppercase tracking-widest text-[11px] shadow-xl shadow-slate-200 dark:shadow-none">Fechar Auditoria</button>
             </div>
          </div>
        </div>
      )}

      {/* USER CREATION/EDIT MODAL */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl" onClick={() => setIsUserModalOpen(false)} />
          <div className="relative bg-white dark:bg-slate-900 w-full max-w-xl rounded-[48px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 duration-500 border border-white/20 dark:border-slate-800 text-slate-900 dark:text-white">
             <div className="p-12 space-y-10">
               <div className="flex items-center gap-6">
                 <div className="w-16 h-16 bg-slate-900 dark:bg-slate-800 text-white rounded-3xl flex items-center justify-center"><Users size={32} /></div>
                 <div>
                   <h3 className="text-2xl font-black tracking-tight italic">Registrar Usuário</h3>
                   <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Controle de Acesso FinVision</p>
                 </div>
               </div>

               <form onSubmit={handleCreateUser} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-4">Email Corporativo</label>
                    <input name="email" type="email" placeholder="email@exemplo.com" className="w-full h-16 px-8 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500/20 transition-all shadow-inner" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-4">Nível de Acesso</label>
                      <select name="role" className="w-full h-16 px-8 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl font-bold text-slate-900 dark:text-white outline-none appearance-none">
                        <option value="user">Membro Standard</option>
                        <option value="admin">Master Administrator</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-4">Situação</label>
                      <select className="w-full h-16 px-8 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl font-bold text-slate-900 dark:text-white outline-none appearance-none">
                        <option>Pendente / Bloqueado</option>
                        <option defaultValue="approved">Aprovado / Ativo</option>
                      </select>
                    </div>
                  </div>

                  <div className="bg-brand-50 dark:bg-brand-900/30 p-6 rounded-3xl border border-brand-100 dark:border-brand-900">
                    <p className="text-[11px] text-brand-900/60 dark:text-brand-300/60 font-bold leading-relaxed italic">Novos usuários devem completar o primeiro login via recuperação de senha por segurança.</p>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button type="button" onClick={() => setIsUserModalOpen(false)} className="flex-1 py-5 rounded-3xl font-black text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800">Cancelar</button>
                    <button type="submit" className="flex-[2] py-5 bg-slate-900 dark:bg-slate-800 text-white rounded-3xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-slate-200 dark:shadow-none">Criar Usuário</button>
                  </div>
                </form>
              </div>
          </div>
        </div>
      )}
    </div>
  );
}
