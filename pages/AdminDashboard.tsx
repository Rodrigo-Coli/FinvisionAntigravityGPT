import { DateUtils } from '../lib/dateUtils';
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { resolveTabParam } from '../lib/urlTabState';
import { supabase } from '../lib/supabase/client';
import {
  Check, X, Save, Loader2, Shield, Settings, Tag, Users,
  Plus, Trash2, Zap, Info, Clock, Search, Edit2, ShieldCheck,
  Gem, Brain, TrendingUp, BarChart3, ChevronDown, Copy,
  Megaphone, Gift, AlertTriangle, ToggleLeft, ToggleRight,
  Eye, EyeOff, Calendar, DollarSign, Star, Palette,
  RefreshCw, ArrowUpRight, XCircle, Globe
} from 'lucide-react';
import TokenCalculator from '../components/admin/TokenCalculator';
import ReferralAdminPanel from '../components/admin/ReferralAdminPanel';
import LandingSettingsPanel from '../components/admin/LandingSettingsPanel';
import { useToast } from '../contexts/ToastContext';
import { isSuperadmin } from '../lib/authUtils';
import { Profile } from '../types';

// ─── Catálogo de features dos planos ────────────────────────────────────────
const FEATURE_CATALOG = [
  { key: 'dashboard',              label: 'Dashboard Financeiro',      group: 'Core' },
  { key: 'accounts',               label: 'Contas Bancárias',          group: 'Core' },
  { key: 'cards',                  label: 'Cartões de Crédito',        group: 'Core' },
  { key: 'manual_transactions',    label: 'Transações Manuais',        group: 'Core' },
  { key: 'categories',             label: 'Categorias',                group: 'Core' },
  { key: 'reports_basic',          label: 'Relatórios Básicos',        group: 'Core' },
  { key: 'reconcile',              label: 'Conciliação Bancária',      group: 'Importação' },
  { key: 'ofx_import',             label: 'Importação OFX/CSV',        group: 'Importação' },
  { key: 'ai_scanner',             label: 'Scanner de Cupom IA',       group: 'IA Labs' },
  { key: 'ai_comparator',          label: 'Comparador de Preços',      group: 'IA Labs' },
  { key: 'ai_diagnosis',           label: 'Diagnóstico Patrimonial',   group: 'IA Labs' },
  { key: 'ai_shopping_list',       label: 'Lista de Compras IA',       group: 'IA Labs' },
  { key: 'goals',                  label: 'Metas Financeiras',         group: 'Planejamento' },
  { key: 'budgets',                label: 'Orçamentos',                group: 'Planejamento' },
  { key: 'physical_assets',        label: 'Bens Físicos',              group: 'Planejamento' },
  { key: 'liabilities',            label: 'Dívidas e Passivos',        group: 'Planejamento' },
  { key: 'reports_advanced',       label: 'Relatórios Avançados',      group: 'Planejamento' },
  { key: 'push_notifications',     label: 'Push Notifications',        group: 'Notificações' },
  { key: 'whatsapp_notifications', label: 'WhatsApp Notifications',    group: 'Notificações' },
  { key: 'multi_user',             label: 'Multi-usuário (Família)',   group: 'Avançado' },
  { key: 'priority_support',       label: 'Suporte Prioritário',       group: 'Avançado' },
  { key: 'ai_chat',                label: 'Chat IA Financeiro',        group: 'IA Labs' },
];

const LIMIT_FEATURES = ['accounts', 'cards', 'multi_user', 'ai_scanner', 'ai_shopping_list'];

// ─── Tipos ───────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'plans' | 'users' | 'campaigns' | 'coupons' | 'prompts' | 'audit' | 'referrals' | 'landing';

// ─── Componente de confirmação inline ────────────────────────────────────────
const ConfirmAction: React.FC<{
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}> = ({ message, onConfirm, onCancel, danger }) => (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
    <div className="bg-white dark:bg-slate-900 rounded-[28px] p-8 w-full max-w-sm shadow-2xl border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${danger ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-500'}`}>
          <AlertTriangle size={18} />
        </div>
        <h3 className="font-black text-slate-900 dark:text-white text-base">Confirmar Ação</h3>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">{message}</p>
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
          Cancelar
        </button>
        <button onClick={onConfirm} className={`flex-1 py-3 rounded-xl text-white font-bold text-xs uppercase tracking-widest transition-all ${danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-slate-900 hover:bg-brand-600'}`}>
          Confirmar
        </button>
      </div>
    </div>
  </div>
);

// ─── Componente principal ────────────────────────────────────────────────────
export default function AdminDashboard({ user }: { user?: Profile | null }) {
  const { toast } = useToast();
  const canSeeLanding = isSuperadmin(user);
  const ADMIN_TABS: Tab[] = [
    'overview', 'plans', 'users', 'campaigns', 'coupons', 'prompts', 'audit', 'referrals',
    ...(canSeeLanding ? (['landing'] as Tab[]) : []),
  ];
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: Tab = resolveTabParam(searchParams.get('view'), ADMIN_TABS, 'overview');
  const setActiveTab = (tab: Tab) => {
    setSearchParams(tab === 'overview' ? {} : { view: tab }, { replace: true });
  };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void; danger?: boolean } | null>(null);

  // Plans
  const [plans, setPlans] = useState<any[]>([]);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [planSubscriberCounts, setPlanSubscriberCounts] = useState<Record<string, number>>({});
  const [showNewPlanForm, setShowNewPlanForm] = useState(false);
  const [newPlanData, setNewPlanData] = useState({
    name: '', slug: '', description: '',
    price_cents: 0, price_cents_annual: 0, price_cents_semiannual: 0,
    ai_scans_limit: 10, trial_days: 7, sort_order: 99,
    max_accounts: 3, max_cards: 2, max_categories: -1,
    max_transactions_per_month: -1, max_multi_users: 1,
    highlight_label: '', badge_color: '#6366f1',
    visible_on_landing: true
  });

  // Users
  const [users, setUsers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDemoUsers, setShowDemoUsers] = useState(false);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [grantPlanModal, setGrantPlanModal] = useState<{ user: any } | null>(null);
  const [grantPlanId, setGrantPlanId] = useState('');
  const [grantDays, setGrantDays] = useState(30);

  // Campaigns
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    title: '', description: '', type: 'announcement' as string,
    discount_percent: 0, trial_days_extension: 0,
    banner_text: '', target_audience: 'all' as string,
    starts_at: DateUtils.formatToISODate(),
    ends_at: '', is_active: true
  });

  // Coupons
  const [coupons, setCoupons] = useState<any[]>([]);

  // Prompts
  const [prompts, setPrompts] = useState<any[]>([]);
  const [savingPrompt, setSavingPrompt] = useState<string | null>(null);

  // Audit
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // AI Cost
  const [aiCostConfig, setAiCostConfig] = useState<any>(null);

  // Overview metrics
  const [metrics, setMetrics] = useState({
    totalUsers: 0, newToday: 0, newThisWeek: 0,
    activeSubscriptions: 0, trialing: 0, churnedThisMonth: 0,
    mrr: 0, mrrByPlan: [] as { name: string; count: number; mrr: number }[]
  });

  const tabs: { id: Tab; label: string; icon: React.ReactNode; short: string }[] = [
    { id: 'overview',   label: 'Visão Geral',         icon: <BarChart3 size={15} />,   short: 'Overview' },
    { id: 'plans',      label: 'Planos & SaaS',        icon: <Gem size={15} />,         short: 'Planos' },
    { id: 'users',      label: 'Usuários',              icon: <Users size={15} />,       short: 'Usuários' },
    { id: 'campaigns',  label: 'Campanhas',             icon: <Megaphone size={15} />,   short: 'Campanhas' },
    { id: 'coupons',    label: 'Cupons',                icon: <Tag size={15} />,         short: 'Cupons' },
    { id: 'referrals',  label: 'Indicações',            icon: <Gift size={15} />,        short: 'Indicações' },
    { id: 'prompts',    label: 'IA & Custos',           icon: <Brain size={15} />,       short: 'IA' },
    { id: 'audit',      label: 'Auditoria',             icon: <ShieldCheck size={15} />, short: 'Audit' },
    ...(canSeeLanding ? [{ id: 'landing' as Tab, label: 'Landing',  icon: <Globe size={15} />,       short: 'Landing' }] : []),
  ];

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }: any) => {
      if (data?.session?.user) setCurrentUserId(data.session.user.id);
    });
    fetchPlans();
    fetchCoupons();
    fetchAiCostConfig();
    fetchMetrics();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'prompts') fetchPrompts();
    if (activeTab === 'audit') fetchAuditLogs();
    if (activeTab === 'campaigns') fetchCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, showDemoUsers]);

  // ─── Data fetchers ────────────────────────────────────────────────────────

  const fetchMetrics = async () => {
    if (!supabase) return;
    const today = DateUtils.formatToISODate();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    // Exclui contas demo (demo+...@finvision.app) de todas as métricas
    const DEMO = '%finvision.app';
    const [totalRes, todayRes, weekRes, subRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).not('email', 'like', DEMO),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).not('email', 'like', DEMO).gte('created_at', today),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).not('email', 'like', DEMO).gte('created_at', weekAgo),
      // Subscriptions com join em profiles para excluir demos e órfãs
      supabase.from('subscriptions').select('status, plans(name, price_cents), profiles!inner(email)').in('status', ['active', 'trialing', 'admin_granted', 'canceled']),
    ]);

    const subs: any[] = (subRes.data || []).filter((s: any) => {
      const email = (s.profiles as any)?.email || '';
      return !email.endsWith('finvision.app'); // exclui demos
    });
    const active = subs.filter((s: any) => ['active', 'admin_granted'].includes(s.status));
    const trialing = subs.filter((s: any) => s.status === 'trialing');
    const churned = subs.filter((s: any) => s.status === 'canceled').length;
    const mrr = active.reduce((sum: number, s: any) => sum + ((s.plans as any)?.price_cents || 0) / 100, 0);

    const byPlan: Record<string, { name: string; count: number; mrr: number }> = {};
    active.forEach((s: any) => {
      const name = (s.plans as any)?.name || 'Sem Plano';
      const price = ((s.plans as any)?.price_cents || 0) / 100;
      if (!byPlan[name]) byPlan[name] = { name, count: 0, mrr: 0 };
      byPlan[name].count++;
      byPlan[name].mrr += price;
    });

    setMetrics({
      totalUsers: totalRes.count || 0,
      newToday: todayRes.count || 0,
      newThisWeek: weekRes.count || 0,
      activeSubscriptions: active.length,
      trialing: trialing.length,
      churnedThisMonth: churned,
      mrr,
      mrrByPlan: Object.values(byPlan).sort((a, b) => b.mrr - a.mrr)
    });
  };

  const fetchPlans = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('plans').select('*').order('sort_order');
    if (data) {
      setPlans(data.map((p: any) => ({ ...p, _dirty: false })));
      const counts: Record<string, number> = {};
      await Promise.all(data.map(async (plan: any) => {
        const { count } = await supabase!.from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('plan_id', plan.id).in('status', ['active', 'trialing', 'admin_granted']);
        counts[plan.id] = count || 0;
      }));
      setPlanSubscriberCounts(counts);
    }
    setLoading(false);
  };

  const fetchUsers = async () => {
    if (!supabase) return;
    let query = supabase
      .from('profiles')
      .select('*, subscription:subscriptions(id, status, trial_ends_at, current_period_end, asaas_subscription_id, plan:plans(name, price_cents))')
      .order('created_at', { ascending: false });
    // Por padrão esconde contas demo (demo+...@finvision.app)
    if (!showDemoUsers) query = query.not('email', 'like', '%finvision.app');
    const { data } = await query;
    if (data) setUsers(data);
  };

  const fetchCampaigns = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('campaigns').select('*, free_plan:plans(name)').order('created_at', { ascending: false });
    if (data) setCampaigns(data);
  };

  const fetchCoupons = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('coupons').select('*, plans(name)').order('created_at', { ascending: false });
    if (data) setCoupons(data);
  };

  const fetchPrompts = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('ai_prompts').select('*').order('name');
    if (data) setPrompts(data);
  };

  const fetchAuditLogs = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('admin_audit_logs')
      .select('*, admin:profiles!admin_id(email), target:profiles!target_user_id(email)')
      .order('created_at', { ascending: false }).limit(100);
    if (data) setAuditLogs(data);
  };

  const fetchAiCostConfig = async () => {
    if (!supabase) return;
    try {
      const { data } = await supabase.from('ai_cost_config').select('*').maybeSingle();
      if (data) setAiCostConfig(data);
      else {
        const def = { model_name: 'Gemini 2.5 Flash', input_1m_tokens_usd: 0.30, output_1m_tokens_usd: 2.50, audio_1m_tokens_usd: 1.00, tokens_per_image: 258, tokens_per_audio_second: 32, usd_to_brl_rate: 5.85, updated_at: new Date().toISOString() };
        const { data: ins } = await supabase.from('ai_cost_config').insert(def).select().single();
        if (ins) setAiCostConfig(ins);
      }
    } catch (e) { console.warn('ai_cost_config error', e); }
  };

  const logAdminAction = async (action: string, details: any, targetId?: string) => {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from('admin_audit_logs').insert({ admin_id: session?.user?.id, target_user_id: targetId, action, details });
  };

  // ─── Plan actions ─────────────────────────────────────────────────────────

  const savePlan = async (plan: any) => {
    if (!supabase) return;
    setSaving(plan.id);
    try {
      const { error } = await supabase.from('plans').update({
        name: plan.name,
        description: plan.description || '',
        price_cents: plan.price_cents,
        price_cents_annual: plan.price_cents_annual,
        price_cents_semiannual: plan.price_cents_semiannual || 0,
        ai_scans_limit: plan.ai_scans_limit,
        trial_days: plan.trial_days,
        sort_order: plan.sort_order || 0,
        max_accounts: plan.max_accounts ?? 1,
        max_cards: plan.max_cards ?? 0,
        max_categories: plan.max_categories ?? 10,
        max_transactions_per_month: plan.max_transactions_per_month ?? 50,
        max_multi_users: plan.max_multi_users ?? 1,
        highlight_label: plan.highlight_label || null,
        badge_color: plan.badge_color || null,
        visible_on_landing: plan.visible_on_landing !== false,
        features: plan.features,
        updated_at: new Date().toISOString()
      }).eq('id', plan.id);
      if (!error) {
        setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, _dirty: false } : p));
        logAdminAction('update_plan', { plan_slug: plan.slug });
        toast(`Plano "${plan.name}" salvo!`, 'success');
      } else throw error;
    } catch (err: any) {
      toast(`Erro: ${err.message}`, 'error');
    } finally { setSaving(null); }
  };

  const createPlan = async () => {
    if (!supabase) return;
    const { name, slug } = newPlanData;
    if (!name.trim() || !slug.trim()) { toast('Nome e Slug são obrigatórios.', 'error'); return; }
    const { data: existing } = await supabase.from('plans').select('id').eq('slug', slug.trim()).maybeSingle();
    if (existing) { toast(`Slug "${slug}" já existe.`, 'error'); return; }
    setSaving('new');
    try {
      const { data, error } = await supabase.from('plans').insert({
        ...newPlanData,
        slug: slug.trim().toLowerCase().replace(/\s+/g, '-'),
        is_active: true, features: {},
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }).select().single();
      if (!error && data) {
        toast(`Plano "${name}" criado!`, 'success');
        logAdminAction('create_plan', { plan_slug: slug });
        setShowNewPlanForm(false);
        setNewPlanData({ name: '', slug: '', description: '', price_cents: 0, price_cents_annual: 0, price_cents_semiannual: 0, ai_scans_limit: 10, trial_days: 7, sort_order: 99, max_accounts: 3, max_cards: 2, max_categories: -1, max_transactions_per_month: -1, max_multi_users: 1, highlight_label: '', badge_color: '#6366f1', visible_on_landing: true });
        fetchPlans();
      } else throw error;
    } catch (err: any) { toast(`Erro: ${err.message}`, 'error'); }
    finally { setSaving(null); }
  };

  const togglePlanActive = (plan: any) => {
    const count = planSubscriberCounts[plan.id] || 0;
    const msg = !plan.is_active
      ? `Ativar o plano "${plan.name}"?`
      : count > 0
        ? `Arquivar "${plan.name}"? Ele tem ${count} assinante(s) ativo(s). Novos usuários não poderão mais escolhê-lo, mas os atuais continuam.`
        : `Arquivar o plano "${plan.name}"?`;
    setConfirmState({ message: msg, danger: plan.is_active && count > 0, onConfirm: async () => {
      setConfirmState(null);
      const { error } = await supabase!.from('plans').update({ is_active: !plan.is_active, updated_at: new Date().toISOString() }).eq('id', plan.id);
      if (!error) { setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, is_active: !plan.is_active } : p)); toast(`Plano ${!plan.is_active ? 'ativado' : 'arquivado'}!`, 'success'); logAdminAction('toggle_plan_active', { plan_slug: plan.slug, active: !plan.is_active }); }
      else toast(`Erro: ${error.message}`, 'error');
    }});
  };

  const deletePlan = (plan: any) => {
    const count = planSubscriberCounts[plan.id] || 0;
    if (count > 0) { toast(`Não é possível excluir: ${count} assinante(s) ativo(s). Arquive primeiro.`, 'error'); return; }
    if (plan.is_active) { toast('Arquive o plano antes de excluir.', 'error'); return; }
    setConfirmState({ message: `Excluir permanentemente o plano "${plan.name}"? Esta ação não pode ser desfeita.`, danger: true, onConfirm: async () => {
      setConfirmState(null);
      const { error } = await supabase!.from('plans').delete().eq('id', plan.id);
      if (!error) { toast(`Plano "${plan.name}" excluído.`, 'success'); logAdminAction('delete_plan', { plan_slug: plan.slug }); fetchPlans(); }
      else toast(`Erro: ${error.message}`, 'error');
    }});
  };

  const duplicatePlan = async (plan: any) => {
    if (!supabase) return;
    const copy = { ...plan, name: `${plan.name} (Cópia)`, slug: `${plan.slug}-copy-${Date.now()}`, is_active: false, id: undefined, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const { error } = await supabase.from('plans').insert(copy);
    if (!error) { toast('Plano duplicado!', 'success'); fetchPlans(); }
    else toast(`Erro: ${error.message}`, 'error');
  };

  // ─── User actions ─────────────────────────────────────────────────────────

  const toggleUserApproval = (id: string, current: boolean) => {
    if (id === currentUserId) { toast('Você não pode suspender sua própria conta.', 'error'); return; }
    setConfirmState({ message: `${current ? 'Suspender' : 'Ativar'} este usuário?`, danger: current, onConfirm: async () => {
      setConfirmState(null); setUpdatingUser(id);
      const { error } = await supabase!.from('profiles').update({ is_approved: !current }).eq('id', id);
      if (!error) { toast(`Usuário ${!current ? 'ativado' : 'suspenso'}!`, 'success'); logAdminAction('toggle_user_approval', { approved: !current }, id); fetchUsers(); }
      else toast(`Erro: ${error.message}`, 'error');
      setUpdatingUser(null);
    }});
  };

  const toggleUserRole = (id: string, current: string) => {
    if (id === currentUserId) { toast('Não é possível alterar seu próprio cargo.', 'error'); return; }
    const newRole = current === 'admin' ? 'user' : 'admin';
    setConfirmState({ message: `Alterar cargo para ${newRole === 'admin' ? 'Administrador' : 'Membro'}?`, onConfirm: async () => {
      setConfirmState(null); setUpdatingUser(id);
      const { error } = await supabase!.from('profiles').update({ role: newRole }).eq('id', id);
      if (!error) { toast(`Cargo alterado para ${newRole === 'admin' ? 'Admin' : 'Membro'}!`, 'success'); logAdminAction('toggle_user_role', { role: newRole }, id); fetchUsers(); }
      else toast(`Erro: ${error.message}`, 'error');
      setUpdatingUser(null);
    }});
  };

  const grantPlanToUser = async () => {
    if (!supabase || !grantPlanModal || !grantPlanId) return;
    setSaving('grant');
    try {
      const userId = grantPlanModal.user.id;
      const periodEnd = new Date(Date.now() + grantDays * 86400000).toISOString();
      const { error } = await supabase.from('subscriptions').upsert({
        user_id: userId, plan_id: grantPlanId, status: 'admin_granted',
        current_period_start: new Date().toISOString(), current_period_end: periodEnd,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      if (!error) {
        toast(`Plano concedido por ${grantDays} dias!`, 'success');
        logAdminAction('grant_plan', { plan_id: grantPlanId, days: grantDays }, userId);
        setGrantPlanModal(null); setGrantPlanId(''); setGrantDays(30);
        fetchUsers();
      } else throw error;
    } catch (err: any) { toast(`Erro: ${err.message}`, 'error'); }
    finally { setSaving(null); }
  };

  // ─── Campaign actions ─────────────────────────────────────────────────────

  const createCampaign = async () => {
    if (!supabase || !newCampaign.title.trim()) { toast('Título é obrigatório.', 'error'); return; }
    setSaving('campaign');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.from('campaigns').insert({
        ...newCampaign, created_by: session?.user?.id,
        starts_at: newCampaign.starts_at ? new Date(newCampaign.starts_at).toISOString() : new Date().toISOString(),
        ends_at: newCampaign.ends_at ? new Date(newCampaign.ends_at).toISOString() : null,
      });
      if (!error) {
        toast('Campanha criada!', 'success');
        setShowNewCampaign(false);
        setNewCampaign({ title: '', description: '', type: 'announcement', discount_percent: 0, trial_days_extension: 0, banner_text: '', target_audience: 'all', starts_at: DateUtils.formatToISODate(), ends_at: '', is_active: true });
        fetchCampaigns();
      } else throw error;
    } catch (err: any) { toast(`Erro: ${err.message}`, 'error'); }
    finally { setSaving(null); }
  };

  const toggleCampaign = async (id: string, current: boolean) => {
    const { error } = await supabase!.from('campaigns').update({ is_active: !current }).eq('id', id);
    if (!error) { setCampaigns(prev => prev.map(c => c.id === id ? { ...c, is_active: !current } : c)); toast(`Campanha ${!current ? 'ativada' : 'pausada'}!`, 'success'); }
    else toast(`Erro: ${error.message}`, 'error');
  };

  const deleteCampaign = (id: string, title: string) => {
    setConfirmState({ message: `Excluir a campanha "${title}"?`, danger: true, onConfirm: async () => {
      setConfirmState(null);
      const { error } = await supabase!.from('campaigns').delete().eq('id', id);
      if (!error) { toast('Campanha excluída.', 'success'); fetchCampaigns(); }
      else toast(`Erro: ${error.message}`, 'error');
    }});
  };

  // ─── Prompts ──────────────────────────────────────────────────────────────

  const savePrompt = async (prompt: any) => {
    if (!supabase) return;
    setSavingPrompt(prompt.id);
    const { error } = await supabase.from('ai_prompts').update({ content: prompt.content, description: prompt.description, version: (prompt.version || 1) + 1, updated_at: new Date().toISOString() }).eq('id', prompt.id);
    if (!error) { setPrompts(prev => prev.map(p => p.id === prompt.id ? { ...p, _dirty: false } : p)); logAdminAction('update_prompt', { prompt_slug: prompt.slug }); toast('Prompt salvo!', 'success'); }
    else toast(`Erro: ${error.message}`, 'error');
    setSavingPrompt(null);
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const filteredUsers = users.filter(u => !searchTerm || u.email?.toLowerCase().includes(searchTerm.toLowerCase()));

  const campaignTypeLabel: Record<string, string> = {
    announcement: 'Anúncio / Banner',
    discount: 'Desconto em Plano',
    trial_extension: 'Trial Estendido',
    free_plan: 'Plano Grátis'
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8 space-y-6 animate-in fade-in duration-500 pb-24">

      {/* Modal de confirmação inline */}
      {confirmState && (
        <ConfirmAction
          message={confirmState.message}
          danger={confirmState.danger}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}

      {/* Modal Conceder Plano */}
      {grantPlanModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-[28px] p-8 w-full max-w-sm shadow-2xl border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-50 text-brand-600 rounded-xl flex items-center justify-center"><Gift size={18} /></div>
                <h3 className="font-black text-slate-900 dark:text-white">Conceder Plano</h3>
              </div>
              <button onClick={() => setGrantPlanModal(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50"><X size={18} /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">Usuário: <strong>{grantPlanModal.user.email}</strong></p>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Plano</label>
                <select value={grantPlanId} onChange={e => setGrantPlanId(e.target.value)} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none">
                  <option value="">Selecione...</option>
                  {plans.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.name} — {fmt(p.price_cents / 100)}/mês</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Duração (dias)</label>
                <input type="number" value={grantDays} min={1} max={3650} onChange={e => setGrantDays(Number(e.target.value))} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none" />
              </div>
              <button onClick={grantPlanToUser} disabled={!grantPlanId || saving === 'grant'} className="w-full py-3.5 bg-brand-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
                {saving === 'grant' ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
                Conceder Plano
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-900 dark:bg-slate-800 rounded-[18px] flex items-center justify-center text-white shadow-xl"><Shield size={24} /></div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white italic tracking-tight">Master Console</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Infraestrutura SaaS · Zyvion</p>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className="px-5 py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm">
            <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Usuários</p>
            <p className="text-lg font-black text-slate-900 dark:text-white">{metrics.totalUsers}</p>
          </div>
          <div className="px-5 py-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl shadow-sm">
            <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">MRR Estimado</p>
            <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">{fmt(metrics.mrr)}</p>
          </div>
          <div className="px-5 py-3 bg-brand-50 dark:bg-brand-950/30 border border-brand-100 dark:border-brand-900/30 rounded-2xl shadow-sm">
            <p className="text-[9px] font-black text-brand-400 uppercase tracking-widest mb-1">Novos Hoje</p>
            <p className="text-lg font-black text-brand-600 dark:text-brand-400">+{metrics.newToday}</p>
          </div>
        </div>
      </div>

      {/* NAVEGAÇÃO — responsiva */}
      <div className="relative">
        {/* Desktop: abas completas (md-lg; a partir de lg o menu lateral tem o submenu) */}
        <div className="hidden gap-1 p-1.5 bg-slate-100/50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-[20px] w-full overflow-x-auto shadow-inner">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-[14px] text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex-1 justify-center ${activeTab === tab.id ? 'bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-md' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: VISÃO GERAL                                                    */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          {/* Badge dados reais */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dados em tempo real do Supabase</span>
            <button onClick={fetchMetrics} className="p-1 text-slate-300 hover:text-brand-500 transition-colors" title="Atualizar métricas">
              <RefreshCw size={12} />
            </button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Assinaturas Ativas', value: metrics.activeSubscriptions, icon: <TrendingUp size={18} />, color: 'emerald' },
              { label: 'Em Trial', value: metrics.trialing, icon: <Clock size={18} />, color: 'blue' },
              { label: 'Novos esta semana', value: `+${metrics.newThisWeek}`, icon: <ArrowUpRight size={18} />, color: 'violet' },
              { label: 'Cancelamentos/mês', value: metrics.churnedThisMonth, icon: <XCircle size={18} />, color: 'rose' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[24px] p-5 shadow-sm">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-${kpi.color}-50 text-${kpi.color}-500`}>{kpi.icon}</div>
                <p className="text-2xl font-black text-slate-900 dark:text-white">{kpi.value}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{kpi.label}</p>
              </div>
            ))}
          </div>

          {/* MRR por Plano */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[32px] p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-black text-slate-900 dark:text-white text-base">Receita por Plano</h3>
              <button onClick={fetchMetrics} className="p-2 text-slate-400 hover:text-brand-600 rounded-xl hover:bg-slate-50 transition-all"><RefreshCw size={16} /></button>
            </div>
            {metrics.mrrByPlan.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">Nenhuma assinatura ativa ainda.</p>
            ) : (
              <div className="space-y-3">
                {metrics.mrrByPlan.map(item => {
                  const pct = metrics.mrr > 0 ? (item.mrr / metrics.mrr) * 100 : 0;
                  return (
                    <div key={item.name}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{item.name}</span>
                        <span className="text-xs font-black text-slate-900 dark:text-white">{fmt(item.mrr)}/mês <span className="text-slate-400 font-bold">· {item.count} ass.</span></span>
                      </div>
                      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Planos na Landing */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[32px] p-6 shadow-sm">
            <h3 className="font-black text-slate-900 dark:text-white text-base mb-4">Planos exibidos na Landing Page</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {plans.filter(p => p.visible_on_landing).map(p => (
                <div key={p.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                  <div>
                    <p className="font-black text-slate-900 dark:text-white text-sm">{p.name}</p>
                    <p className="text-xs text-slate-400">{fmt(p.price_cents / 100)}/mês</p>
                  </div>
                  <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                </div>
              ))}
              {plans.filter(p => !p.visible_on_landing).map(p => (
                <div key={p.id} className="flex items-center justify-between p-4 bg-slate-50/50 dark:bg-slate-800/50 rounded-2xl opacity-50">
                  <div>
                    <p className="font-bold text-slate-500 text-sm">{p.name} (oculto)</p>
                    <p className="text-xs text-slate-400">{fmt(p.price_cents / 100)}/mês</p>
                  </div>
                  <EyeOff size={14} className="text-slate-300" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: PLANOS                                                          */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'plans' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-black text-slate-900 dark:text-white text-lg">Planos & SaaS</h2>
              <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                {plans.length} plano(s) · {plans.filter(p => p.is_active).length} ativo(s) · {plans.filter(p => !p.is_active).length} arquivado(s)
                <span className="text-slate-300"> — arquivados aparecem esmaecidos abaixo</span>
              </p>
            </div>
            <button onClick={() => setShowNewPlanForm(true)} className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform">
              <Plus size={14} /> Novo Plano
            </button>
          </div>

          <TokenCalculator usdToBrl={aiCostConfig ? parseFloat(aiCostConfig.usd_to_brl_rate) : 5.85} />

          {/* Form novo plano */}
          {showNewPlanForm && (
            <div className="bg-white dark:bg-slate-900 border-2 border-brand-200 dark:border-brand-900 rounded-[32px] p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-900 dark:text-white">Criar Novo Plano</h3>
                <button onClick={() => setShowNewPlanForm(false)} className="p-2 text-slate-400 hover:text-rose-500 rounded-xl"><X size={18} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { label: 'Nome', field: 'name', type: 'text', span: 1 },
                  { label: 'Slug (ID único)', field: 'slug', type: 'text', span: 1 },
                  { label: 'Descrição', field: 'description', type: 'text', span: 1 },
                  { label: 'Preço Mensal (centavos)', field: 'price_cents', type: 'number', span: 1 },
                  { label: 'Preço Anual (centavos)', field: 'price_cents_annual', type: 'number', span: 1 },
                  { label: 'Preço Semestral (centavos)', field: 'price_cents_semiannual', type: 'number', span: 1 },
                  { label: 'Scans IA/mês (-1=ilimitado)', field: 'ai_scans_limit', type: 'number', span: 1 },
                  { label: 'Dias de trial', field: 'trial_days', type: 'number', span: 1 },
                  { label: 'Ordem (sort)', field: 'sort_order', type: 'number', span: 1 },
                  { label: 'Máx. Contas', field: 'max_accounts', type: 'number', span: 1 },
                  { label: 'Máx. Cartões', field: 'max_cards', type: 'number', span: 1 },
                  { label: 'Máx. Usuários', field: 'max_multi_users', type: 'number', span: 1 },
                  { label: 'Badge (ex: Mais Popular)', field: 'highlight_label', type: 'text', span: 1 },
                  { label: 'Cor do badge', field: 'badge_color', type: 'color', span: 1 },
                ].map(f => (
                  <div key={f.field}>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">{f.label}</label>
                    <input
                      type={f.type}
                      value={(newPlanData as any)[f.field]}
                      onChange={e => setNewPlanData(p => ({ ...p, [f.field]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500 transition-colors"
                    />
                  </div>
                ))}
                <div className="flex items-center gap-3 pt-4">
                  <input type="checkbox" id="visible_landing" checked={newPlanData.visible_on_landing} onChange={e => setNewPlanData(p => ({ ...p, visible_on_landing: e.target.checked }))} className="w-4 h-4 accent-brand-600" />
                  <label htmlFor="visible_landing" className="text-sm font-bold text-slate-700 dark:text-slate-300">Exibir na Landing Page</label>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowNewPlanForm(false)} className="px-6 py-3 border border-slate-200 dark:border-slate-700 text-slate-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">Cancelar</button>
                <button onClick={createPlan} disabled={saving === 'new'} className="px-8 py-3 bg-brand-600 text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-brand-500/20">
                  {saving === 'new' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar Plano
                </button>
              </div>
            </div>
          )}

          {/* Lista de planos */}
          {loading ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-brand-500" size={32} /></div> : (
            <div className="space-y-4">
              {plans.map(plan => (
                <div key={plan.id} className={`bg-white dark:bg-slate-900 border rounded-[28px] shadow-sm transition-all ${!plan.is_active ? 'opacity-60 border-slate-100 dark:border-slate-800' : plan._dirty ? 'border-amber-300 dark:border-amber-700' : 'border-slate-100 dark:border-slate-800'}`}>
                  {/* Header do plano */}
                  <div className="flex items-center justify-between p-5 cursor-pointer" onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-sm shadow" style={{ background: plan.badge_color || '#6366f1' }}>
                        {plan.name[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900 dark:text-white">{plan.name}</span>
                          {plan.highlight_label && <span className="px-2 py-0.5 text-[9px] font-black rounded-full text-white" style={{ background: plan.badge_color || '#6366f1' }}>{plan.highlight_label}</span>}
                          {!plan.is_active && <span className="px-2 py-0.5 text-[9px] font-black bg-slate-100 text-slate-400 rounded-full uppercase">Arquivado</span>}
                          {!plan.visible_on_landing && <span className="px-2 py-0.5 text-[9px] font-black bg-slate-100 text-slate-400 rounded-full flex items-center gap-1"><EyeOff size={9} /> Oculto</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-slate-500">{fmt(plan.price_cents / 100)}/mês</span>
                          <span className="text-[10px] text-slate-400">{planSubscriberCounts[plan.id] || 0} assinante(s)</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {plan._dirty && <span className="text-[9px] font-black text-amber-500 uppercase bg-amber-50 px-2 py-0.5 rounded-full">Não salvo</span>}
                      <button onClick={e => { e.stopPropagation(); duplicatePlan(plan); }} className="p-2 text-slate-400 hover:text-brand-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all" title="Duplicar"><Copy size={14} /></button>
                      <button onClick={e => { e.stopPropagation(); togglePlanActive(plan); }} className={`p-2 rounded-xl transition-all ${plan.is_active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-400 hover:text-emerald-500 hover:bg-emerald-50'}`} title={plan.is_active ? 'Arquivar' : 'Ativar'}>
                        {plan.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      </button>
                      <button onClick={e => { e.stopPropagation(); deletePlan(plan); }} className="p-2 text-slate-300 hover:text-rose-500 rounded-xl hover:bg-rose-50 transition-all" title="Excluir"><Trash2 size={14} /></button>
                      <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${expandedPlan === plan.id ? 'rotate-180' : ''}`} />
                    </div>
                  </div>

                  {/* Corpo expandido */}
                  {expandedPlan === plan.id && (
                    <div className="px-5 pb-6 space-y-6 border-t border-slate-50 dark:border-slate-800 pt-5">
                      {/* Campos básicos */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[
                          { label: 'Nome do Plano', field: 'name', type: 'text' },
                          { label: 'Descrição', field: 'description', type: 'text' },
                          { label: 'Badge (ex: Mais Popular)', field: 'highlight_label', type: 'text' },
                        ].map(f => (
                          <div key={f.field}>
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">{f.label}</label>
                            <input type={f.type} value={plan[f.field] || ''} onChange={e => setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, [f.field]: e.target.value, _dirty: true } : p))} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500 transition-colors" />
                          </div>
                        ))}
                      </div>

                      {/* Preços */}
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Preços (em centavos — R$19,90 = 1990)</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {[
                            { label: 'Mensal', field: 'price_cents' },
                            { label: 'Semestral', field: 'price_cents_semiannual' },
                            { label: 'Anual', field: 'price_cents_annual' },
                          ].map(f => (
                            <div key={f.field} className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">{f.label}</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  value={plan[f.field] === 0 ? '' : plan[f.field] || ''}
                                  placeholder="0"
                                  min={0}
                                  onFocus={e => e.target.select()}
                                  onChange={e => {
                                    const raw = e.target.value;
                                    const num = raw === '' ? 0 : parseInt(raw.replace(/^0+(?=\d)/, ''), 10);
                                    setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, [f.field]: isNaN(num) ? 0 : num, _dirty: true } : p));
                                  }}
                                  className="flex-1 bg-transparent font-black text-slate-900 dark:text-white text-lg outline-none w-full"
                                />
                                <span className="text-xs text-slate-400 font-bold">{fmt((plan[f.field] || 0) / 100)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Limites */}
                      <div>
                        <div className="flex items-center gap-3 mb-3">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Limites</p>
                          <span className="text-[9px] font-bold text-brand-500 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-100">-1 = ∞ Ilimitado · 0 = Sem acesso</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                          {[
                            { label: 'Scans IA', field: 'ai_scans_limit' },
                            { label: 'Contas', field: 'max_accounts' },
                            { label: 'Cartões', field: 'max_cards' },
                            { label: 'Usuários', field: 'max_multi_users' },
                            { label: 'Categorias', field: 'max_categories' },
                            { label: 'Dias Trial', field: 'trial_days' },
                          ].map(f => {
                            const rawVal = plan[f.field] ?? 0;
                            const isUnlimited = rawVal === -1;
                            return (
                              <div key={f.field} className={`p-3 rounded-2xl text-center border-2 transition-all ${isUnlimited ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 dark:bg-slate-800 border-transparent'}`}>
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">{f.label}</label>
                                {isUnlimited ? (
                                  <div>
                                    <p className="text-2xl font-black text-emerald-600">∞</p>
                                    <button
                                      type="button"
                                      onClick={() => setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, [f.field]: 0, _dirty: true } : p))}
                                      className="text-[8px] text-slate-400 hover:text-rose-500 underline mt-0.5"
                                    >remover</button>
                                  </div>
                                ) : (
                                  <div>
                                    <input
                                      type="number"
                                      value={rawVal === 0 ? '' : rawVal}
                                      placeholder="0"
                                      onFocus={e => e.target.select()}
                                      onChange={e => {
                                        const raw = e.target.value;
                                        const num = raw === '' ? 0 : parseInt(raw.replace(/^0+(?=\d)/, ''), 10);
                                        setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, [f.field]: isNaN(num) ? 0 : num, _dirty: true } : p));
                                      }}
                                      className="bg-transparent font-black text-slate-900 dark:text-white text-xl outline-none w-full text-center"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, [f.field]: -1, _dirty: true } : p))}
                                      className="text-[8px] text-brand-400 hover:text-brand-600 underline mt-0.5"
                                    >∞ ilimitado</button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Estimativa de Custo IA */}
                        {aiCostConfig && (plan.ai_scans_limit !== 0) && (
                          <div className="mt-4 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                            <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-2">Estimativa de Custo IA por Usuário/Mês</p>
                            {(() => {
                              const scans = plan.ai_scans_limit === -1 ? 500 : (plan.ai_scans_limit || 0);
                              const inp1m = parseFloat(aiCostConfig.input_1m_tokens_usd) || 0.30;
                              const out1m = parseFloat(aiCostConfig.output_1m_tokens_usd) || 2.50;
                              const aud1m = parseFloat(aiCostConfig.audio_1m_tokens_usd) || 1.00;
                              const rate  = parseFloat(aiCostConfig.usd_to_brl_rate) || 5.85;
                              const costPerScanUsd = (1258/1_000_000)*inp1m + (320/1_000_000)*aud1m + (800/1_000_000)*out1m;
                              const costBrl = costPerScanUsd * rate * scans;
                              const price  = (plan.price_cents || 0) / 100;
                              const margin = price - costBrl;
                              return (
                                <div className="space-y-1 text-xs">
                                  <div className="flex justify-between">
                                    <span className="text-amber-700">{plan.ai_scans_limit === -1 ? 'Estimativa (500 scans)' : `${scans} scans × R$${(costPerScanUsd*rate).toFixed(4)}`}:</span>
                                    <span className="font-black text-amber-800">{fmt(costBrl)}/usuário</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Preço do plano:</span>
                                    <span className="font-black text-slate-700">{fmt(price)}/mês</span>
                                  </div>
                                  <div className={`flex justify-between border-t border-amber-200 pt-1 mt-1 font-black ${margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    <span>Margem por usuário:</span>
                                    <span>{margin >= 0 ? '+' : ''}{fmt(margin)} {margin < 0 ? '⚠️ PREJUÍZO' : '✓'}</span>
                                  </div>
                                  {plan.ai_scans_limit === -1 && (
                                    <p className="text-[9px] text-amber-500 italic">* Estimativa baseada em 500 scans. Ilimitado sem preço adequado = risco alto.</p>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>

                      {/* Visual e Landing */}
                      <div className="flex flex-wrap gap-4 items-center">
                        <div>
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Cor do Badge</label>
                          <input type="color" value={plan.badge_color || '#6366f1'} onChange={e => setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, badge_color: e.target.value, _dirty: true } : p))} className="w-12 h-10 rounded-xl cursor-pointer border border-slate-200" />
                        </div>
                        <div className="flex items-center gap-3 mt-4">
                          <input type="checkbox" id={`landing-${plan.id}`} checked={plan.visible_on_landing !== false} onChange={e => setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, visible_on_landing: e.target.checked, _dirty: true } : p))} className="w-4 h-4 accent-brand-600" />
                          <label htmlFor={`landing-${plan.id}`} className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                            <Eye size={14} className="text-slate-400" /> Exibir na Landing Page
                          </label>
                        </div>
                        <div className="flex items-center gap-3 mt-4">
                          <input type="checkbox" id={`active-${plan.id}`} checked={plan.is_active} onChange={() => togglePlanActive(plan)} className="w-4 h-4 accent-emerald-600" />
                          <label htmlFor={`active-${plan.id}`} className="text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer">Plano Ativo</label>
                        </div>
                      </div>

                      {/* Features */}
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Features do Plano</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {FEATURE_CATALOG.map(feat => {
                            const val = plan.features?.[feat.key];
                            const isOn = val === true || val === -1 || (typeof val === 'number' && val > 0);
                            const isLimit = LIMIT_FEATURES.includes(feat.key);
                            return (
                              <div key={feat.key} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isOn ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30' : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700'}`}>
                                <div>
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{feat.group}</p>
                                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{feat.label}</p>
                                </div>
                                {isLimit ? (
                                  <div className="flex flex-col items-center gap-0.5">
                                    {(typeof val === 'number' && val === -1) ? (
                                      <div className="flex flex-col items-center">
                                        <span className="text-emerald-600 font-black text-base">∞</span>
                                        <input type="hidden" value={-1} />
                                        <button type="button" onClick={() => setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, features: { ...p.features, [feat.key]: 0 }, _dirty: true } : p))} className="text-[7px] text-slate-300 hover:text-rose-400 underline">remover</button>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <input
                                          type="number"
                                          value={typeof val === 'number' && val === 0 ? '' : (typeof val === 'number' ? val : (val === true ? -1 : 0))}
                                          placeholder="0"
                                          onFocus={e => e.target.select()}
                                          onChange={e => {
                                            const raw = e.target.value;
                                            const num = raw === '' ? 0 : parseInt(raw.replace(/^0+(?=\d)/, ''), 10);
                                            setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, features: { ...p.features, [feat.key]: isNaN(num) ? 0 : num }, _dirty: true } : p));
                                          }}
                                          className="w-14 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-1 text-xs font-black text-slate-900 dark:text-white outline-none"
                                        />
                                        <button type="button" onClick={() => setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, features: { ...p.features, [feat.key]: -1 }, _dirty: true } : p))} className="text-[7px] text-brand-400 hover:text-brand-600 underline">∞</button>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <button onClick={() => setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, features: { ...p.features, [feat.key]: !isOn }, _dirty: true } : p))} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isOn ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                                    {isOn ? <Check size={14} /> : <X size={14} />}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Salvar */}
                      {plan._dirty && (
                        <div className="flex justify-end pt-2">
                          <button onClick={() => savePlan(plan)} disabled={saving === plan.id} className="flex items-center gap-2 px-8 py-3.5 bg-brand-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-brand-500/20 disabled:opacity-50 hover:bg-brand-700 transition-all">
                            {saving === plan.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            Salvar Alterações
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: USUÁRIOS                                                        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'users' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <h2 className="font-black text-slate-900 dark:text-white text-lg">Usuários ({users.length})</h2>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={() => setShowDemoUsers(p => !p)}
                className={`px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${showDemoUsers ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-700'}`}
                title="Contas demo (demo+...@finvision.app) ficam ocultas por padrão"
              >
                {showDemoUsers ? '👁 Mostrando demos' : '🚫 Ocultar demos'}
              </button>
              <div className="relative flex-1 sm:w-64">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Buscar por e-mail..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-brand-500" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[28px] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-50 dark:border-slate-800">
                    <th className="text-left p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Usuário</th>
                    <th className="text-left p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest hidden sm:table-cell">Plano</th>
                    <th className="text-left p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest hidden md:table-cell">Status</th>
                    <th className="text-right p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {filteredUsers.map(user => {
                    const sub = user.subscription;
                    const statusColors: Record<string, string> = { active: 'bg-emerald-100 text-emerald-700', trialing: 'bg-blue-100 text-blue-700', admin_granted: 'bg-violet-100 text-violet-700', past_due: 'bg-amber-100 text-amber-700', canceled: 'bg-rose-100 text-rose-700' };
                    return (
                      <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="p-4">
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white text-xs">{user.email}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {user.role === 'admin' && <span className="text-[9px] font-black text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-md">ADMIN</span>}
                              {!user.is_approved && <span className="text-[9px] font-black text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded-md">SUSPENSO</span>}
                            </div>
                          </div>
                        </td>
                        <td className="p-4 hidden sm:table-cell">
                          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{sub?.plan?.name || '—'}</span>
                        </td>
                        <td className="p-4 hidden md:table-cell">
                          {sub?.status ? (
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${statusColors[sub.status] || 'bg-slate-100 text-slate-500'}`}>{sub.status}</span>
                          ) : <span className="text-slate-300 text-xs">sem plano</span>}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => setGrantPlanModal({ user })} className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all" title="Conceder Plano">
                              <Gift size={14} />
                            </button>
                            <button onClick={() => toggleUserRole(user.id, user.role)} disabled={updatingUser === user.id} className="p-2 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-xl transition-all" title={user.role === 'admin' ? 'Revogar Admin' : 'Tornar Admin'}>
                              {updatingUser === user.id ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                            </button>
                            <button onClick={() => toggleUserApproval(user.id, user.is_approved)} disabled={updatingUser === user.id} className={`p-2 rounded-xl transition-all ${user.is_approved ? 'text-slate-400 hover:text-rose-500 hover:bg-rose-50' : 'text-emerald-500 hover:bg-emerald-50'}`} title={user.is_approved ? 'Suspender' : 'Ativar'}>
                              {user.is_approved ? <XCircle size={14} /> : <Check size={14} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredUsers.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-sm">Nenhum usuário encontrado.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: CAMPANHAS                                                       */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'campaigns' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-slate-900 dark:text-white text-lg">Campanhas</h2>
            <button onClick={() => setShowNewCampaign(true)} className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform">
              <Plus size={14} /> Nova Campanha
            </button>
          </div>

          {showNewCampaign && (
            <div className="bg-white dark:bg-slate-900 border-2 border-brand-200 dark:border-brand-900 rounded-[32px] p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-900 dark:text-white">Nova Campanha</h3>
                <button onClick={() => setShowNewCampaign(false)} className="p-2 text-slate-400 hover:text-rose-500 rounded-xl"><X size={18} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Título</label>
                  <input type="text" value={newCampaign.title} onChange={e => setNewCampaign(p => ({ ...p, title: e.target.value }))} placeholder="Ex: Black Friday — 50% OFF" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Tipo</label>
                  <select value={newCampaign.type} onChange={e => setNewCampaign(p => ({ ...p, type: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold outline-none focus:border-brand-500">
                    {Object.entries(campaignTypeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Público-alvo</label>
                  <select value={newCampaign.target_audience} onChange={e => setNewCampaign(p => ({ ...p, target_audience: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold outline-none focus:border-brand-500">
                    <option value="all">Todos os usuários</option>
                    <option value="new_users">Novos usuários</option>
                    <option value="trialing">Em período trial</option>
                    <option value="active">Assinantes ativos</option>
                  </select>
                </div>
                {newCampaign.type === 'discount' && (
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Desconto (%)</label>
                    <input type="number" min={1} max={100} value={newCampaign.discount_percent} onChange={e => setNewCampaign(p => ({ ...p, discount_percent: Number(e.target.value) }))} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold outline-none focus:border-brand-500" />
                  </div>
                )}
                {newCampaign.type === 'trial_extension' && (
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Dias extras de trial</label>
                    <input type="number" min={1} value={newCampaign.trial_days_extension} onChange={e => setNewCampaign(p => ({ ...p, trial_days_extension: Number(e.target.value) }))} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold outline-none focus:border-brand-500" />
                  </div>
                )}
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Data de início</label>
                  <input type="date" value={newCampaign.starts_at} onChange={e => setNewCampaign(p => ({ ...p, starts_at: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Data de fim (opcional)</label>
                  <input type="date" value={newCampaign.ends_at} onChange={e => setNewCampaign(p => ({ ...p, ends_at: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold outline-none focus:border-brand-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Texto do Banner no App (opcional)</label>
                  <input type="text" value={newCampaign.banner_text} onChange={e => setNewCampaign(p => ({ ...p, banner_text: e.target.value }))} placeholder="Ex: 🔥 Black Friday — 50% OFF até domingo!" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold outline-none focus:border-brand-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Descrição interna</label>
                  <input type="text" value={newCampaign.description} onChange={e => setNewCampaign(p => ({ ...p, description: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold outline-none focus:border-brand-500" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowNewCampaign(false)} className="px-6 py-3 border border-slate-200 dark:border-slate-700 text-slate-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all">Cancelar</button>
                <button onClick={createCampaign} disabled={saving === 'campaign'} className="px-8 py-3 bg-brand-600 text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-brand-500/20">
                  {saving === 'campaign' ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />} Criar Campanha
                </button>
              </div>
            </div>
          )}

          {campaigns.length === 0 && !showNewCampaign ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[28px] p-12 text-center shadow-sm">
              <Megaphone size={32} className="text-slate-300 mx-auto mb-4" />
              <p className="font-bold text-slate-400">Nenhuma campanha criada ainda.</p>
              <p className="text-sm text-slate-300 mt-1">Crie campanhas de desconto, trial estendido ou banners de anúncio.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map(c => {
                const isExpired = c.ends_at && new Date(c.ends_at) < new Date();
                return (
                  <div key={c.id} className={`bg-white dark:bg-slate-900 border rounded-[24px] p-5 shadow-sm flex items-center justify-between gap-4 ${isExpired ? 'opacity-50 border-slate-100 dark:border-slate-800' : c.is_active ? 'border-emerald-100 dark:border-emerald-900/30' : 'border-slate-100 dark:border-slate-800'}`}>
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${c.is_active && !isExpired ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-50 text-slate-400'}`}><Megaphone size={18} /></div>
                      <div className="min-w-0">
                        <p className="font-black text-slate-900 dark:text-white text-sm truncate">{c.title}</p>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          <span className="text-[9px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase">{campaignTypeLabel[c.type] || c.type}</span>
                          {c.discount_percent > 0 && <span className="text-[9px] font-black bg-rose-50 text-rose-500 px-2 py-0.5 rounded-full">{c.discount_percent}% OFF</span>}
                          {c.ends_at && <span className={`text-[9px] font-bold flex items-center gap-1 ${isExpired ? 'text-rose-400' : 'text-slate-400'}`}><Calendar size={9} /> até {new Date(c.ends_at).toLocaleDateString('pt-BR')}{isExpired ? ' (expirada)' : ''}</span>}
                          {c.banner_text && <span className="text-[9px] text-slate-400 truncate max-w-[150px]">"{c.banner_text}"</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => toggleCampaign(c.id, c.is_active)} className={`p-2 rounded-xl transition-all ${c.is_active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-50'}`} title={c.is_active ? 'Pausar' : 'Ativar'}>
                        {c.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      </button>
                      <button onClick={() => deleteCampaign(c.id, c.title)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: CUPONS                                                          */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'coupons' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
          <h2 className="font-black text-slate-900 dark:text-white text-lg">Cupons de Desconto</h2>
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[28px] shadow-sm overflow-hidden">
            {coupons.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">Nenhum cupom cadastrado ainda.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-50 dark:border-slate-800">
                      <th className="text-left p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Código</th>
                      <th className="text-left p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest hidden sm:table-cell">Desconto</th>
                      <th className="text-left p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest hidden md:table-cell">Usos</th>
                      <th className="text-left p-4 text-[9px] font-black text-slate-400 uppercase tracking-widest hidden md:table-cell">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {coupons.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4">
                          <p className="font-black text-slate-900 dark:text-white font-mono">{c.code}</p>
                          {c.description && <p className="text-xs text-slate-400 mt-0.5">{c.description}</p>}
                        </td>
                        <td className="p-4 hidden sm:table-cell">
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                            {c.discount_type === 'percent' ? `${c.discount_value}%` : c.discount_type === 'fixed' ? fmt(c.discount_value) : c.discount_type}
                          </span>
                        </td>
                        <td className="p-4 hidden md:table-cell">
                          <span className="text-sm text-slate-500">{c.uses_count || 0}{c.max_uses ? ` / ${c.max_uses}` : ''}</span>
                        </td>
                        <td className="p-4 hidden md:table-cell">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${c.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                            {c.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: INDICAÇÕES                                                      */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'referrals' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <h2 className="font-black text-slate-900 dark:text-white text-lg">Programa de Indicação</h2>
          <ReferralAdminPanel />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: IA & CUSTOS                                                     */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'prompts' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <h2 className="font-black text-slate-900 dark:text-white text-lg">IA & Custos</h2>
          <TokenCalculator usdToBrl={aiCostConfig ? parseFloat(aiCostConfig.usd_to_brl_rate) : 5.85} />

          {aiCostConfig && (
            <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-800 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl flex items-center justify-center text-indigo-500"><Brain size={20} /></div>
                  <div>
                    <h3 className="font-black text-slate-900 dark:text-white">Custos da IA</h3>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">{aiCostConfig.model_name}</p>
                  </div>
                </div>
                <button onClick={async () => {
                  const { error } = await supabase!.from('ai_cost_config').update({ ...aiCostConfig, updated_at: new Date().toISOString() }).eq('id', aiCostConfig.id);
                  if (!error) { toast('Custos salvos!', 'success'); logAdminAction('update_ai_costs', aiCostConfig); }
                  else toast(`Erro: ${error.message}`, 'error');
                }} className="px-5 py-2.5 bg-slate-900 dark:bg-slate-800 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-brand-600 transition-all">
                  <Save size={13} /> Salvar
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Câmbio USD → BRL', field: 'usd_to_brl_rate', step: '0.01' },
                  { label: 'Input 1M tokens (USD)', field: 'input_1m_tokens_usd', step: '0.01' },
                  { label: 'Output 1M tokens (USD)', field: 'output_1m_tokens_usd', step: '0.01' },
                  { label: 'Áudio 1M tokens (USD)', field: 'audio_1m_tokens_usd', step: '0.01' },
                ].map(cfg => (
                  <div key={cfg.field} className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">{cfg.label}</label>
                    <input type="number" step={cfg.step} value={aiCostConfig[cfg.field]} onChange={e => setAiCostConfig({ ...aiCostConfig, [cfg.field]: parseFloat(e.target.value) })} className="bg-transparent font-black text-slate-900 dark:text-white w-full outline-none text-lg" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {prompts.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-black text-slate-700 dark:text-slate-300 text-sm uppercase tracking-widest">Prompts de IA</h3>
              {prompts.map(prompt => (
                <div key={prompt.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[24px] p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-black text-slate-900 dark:text-white">{prompt.name}</p>
                      <p className="text-xs text-slate-400">{prompt.description} — v{prompt.version || 1}</p>
                    </div>
                    <button onClick={() => savePrompt(prompt)} disabled={!prompt._dirty || savingPrompt === prompt.id} className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-40 shadow-md hover:bg-brand-700 transition-all">
                      {savingPrompt === prompt.id ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar
                    </button>
                  </div>
                  <textarea value={prompt.content || ''} onChange={e => setPrompts(prev => prev.map(p => p.id === prompt.id ? { ...p, content: e.target.value, _dirty: true } : p))} rows={8} className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-4 text-xs font-mono text-slate-700 dark:text-slate-300 outline-none focus:border-brand-500 resize-none transition-colors" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: AUDITORIA                                                       */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'audit' && (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-slate-900 dark:text-white text-lg">Log de Auditoria</h2>
            <button onClick={fetchAuditLogs} className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-400 rounded-xl hover:text-brand-600 transition-all shadow-sm"><RefreshCw size={16} /></button>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[28px] shadow-sm overflow-hidden">
            {auditLogs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">Nenhum log registrado.</div>
            ) : (
              <div className="divide-y divide-slate-50 dark:divide-slate-800">
                {auditLogs.map(log => (
                  <div key={log.id} className="flex items-start gap-4 p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <div className="w-8 h-8 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <ShieldCheck size={14} className="text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full font-mono uppercase">{log.action}</span>
                        <span className="text-xs text-slate-400">por <strong className="text-slate-600 dark:text-slate-300">{log.admin?.email || 'Sistema'}</strong></span>
                      </div>
                      {log.details && <p className="text-[11px] text-slate-400 mt-1 font-mono truncate">{JSON.stringify(log.details)}</p>}
                    </div>
                    <span className="text-[10px] text-slate-300 whitespace-nowrap shrink-0">{new Date(log.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: LANDING PAGE (superadmin) — escondida no front, garantida por RLS */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'landing' && canSeeLanding && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <div>
            <h2 className="font-black text-slate-900 dark:text-white text-lg">Landing Page</h2>
            <p className="text-[11px] font-bold text-slate-400 mt-0.5">Oferta, textos, imagens e depoimentos — mudanças aqui aparecem no site sem precisar de deploy.</p>
          </div>
          <LandingSettingsPanel />
        </div>
      )}
    </div>
  );
}
