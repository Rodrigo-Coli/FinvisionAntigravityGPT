import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import { Check, X, Save, Loader2, Shield, Settings, Tag, Users, ChevronDown, ChevronRight, Plus, Trash2, Copy } from 'lucide-react';

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

export default function AdminPlans() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'plans' | 'coupons' | 'users'>('plans');
  const [coupons, setCoupons] = useState<any[]>([]);
  const [newCoupon, setNewCoupon] = useState({ code: '', discount_type: 'percent', discount_value: 0, max_uses: '', plan_override_slug: '' });
  const [savingCoupon, setSavingCoupon] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => { fetchPlans(); fetchCoupons(); }, []);

  const fetchPlans = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('plans').select('*').order('sort_order');
    if (data) setPlans(data.map(p => ({ ...p, _dirty: false })));
    setLoading(false);
  };

  const fetchCoupons = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('coupons').select('*, plans(name)').order('created_at', { ascending: false });
    if (data) setCoupons(data);
  };

  const update = (planId: string, field: string, value: any) =>
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, [field]: value, _dirty: true } : p));

  const toggleFeature = (planId: string, featureKey: string) =>
    setPlans(prev => prev.map(p => {
      if (p.id !== planId) return p;
      return { ...p, features: { ...p.features, [featureKey]: !p.features?.[featureKey] }, _dirty: true };
    }));

  const savePlan = async (plan: any) => {
    if (!supabase) return;
    setSaving(plan.id);
    const { error } = await supabase.from('plans').update({
      name: plan.name,
      price_cents: plan.price_cents,
      price_cents_semiannual: plan.price_cents_semiannual,
      price_cents_annual: plan.price_cents_annual,
      discount_semiannual_percent: plan.discount_semiannual_percent,
      discount_annual_percent: plan.discount_annual_percent,
      ai_scans_limit: plan.ai_scans_limit,
      trial_days: plan.trial_days,
      features: plan.features,
      is_active: plan.is_active,
      updated_at: new Date().toISOString(),
    }).eq('id', plan.id);
    if (!error) setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, _dirty: false } : p));
    else alert('Erro: ' + error.message);
    setSaving(null);
  };

  const saveCoupon = async () => {
    if (!supabase || !newCoupon.code.trim()) return;
    setSavingCoupon(true);
    const plan = plans.find(p => p.slug === newCoupon.plan_override_slug);
    const { error } = await supabase.from('coupons').insert({
      code: newCoupon.code.toUpperCase().trim(),
      discount_type: newCoupon.discount_type,
      discount_value: newCoupon.discount_value,
      max_uses: newCoupon.max_uses ? parseInt(newCoupon.max_uses as any) : null,
      plan_override_id: plan?.id || null,
      is_active: true,
    });
    if (!error) {
      setNewCoupon({ code: '', discount_type: 'percent', discount_value: 0, max_uses: '', plan_override_slug: '' });
      fetchCoupons();
    } else alert('Erro: ' + error.message);
    setSavingCoupon(false);
  };

  const deactivateCoupon = async (id: string) => {
    if (!supabase) return;
    await supabase.from('coupons').update({ is_active: false }).eq('id', id);
    fetchCoupons();
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1500);
  };

  const fmt = (cents: number) => cents === 0 ? 'Grátis' : `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="animate-spin text-brand-500" size={32} /></div>;

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-10 py-8 space-y-8">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white"><Shield size={22} /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Painel Admin</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gestão de Planos · Cupons · Usuários</p>
        </div>
      </div>

      <div className="flex gap-1 p-1.5 bg-slate-50 border border-slate-100 rounded-2xl w-fit">
        {[{ id: 'plans', label: 'Planos', icon: <Settings size={14} /> }, { id: 'coupons', label: 'Cupons', icon: <Tag size={14} /> }, { id: 'users', label: 'Usuários', icon: <Users size={14} /> }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === tab.id ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'plans' && (
        <div className="space-y-4">
          {plans.map(plan => {
            const isExpanded = expandedPlan === plan.id;
            return (
              <div key={plan.id} className={`bg-white rounded-[28px] border shadow-sm overflow-hidden transition-all ${plan._dirty ? 'border-brand-200' : 'border-slate-100'}`}>
                <div className="p-6 flex flex-wrap items-center gap-4">
                  <button onClick={() => setExpandedPlan(isExpanded ? null : plan.id)} className="flex items-center gap-4 min-w-[180px]">
                    <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white text-xs font-bold uppercase">{plan.slug[0]}</div>
                    <div>
                      <h3 className="font-bold text-slate-900">{plan.name}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {plan.ai_scans_limit === -1 ? 'IA Ilimitada' : plan.ai_scans_limit === 0 ? 'Sem IA' : `${plan.ai_scans_limit} scans/mês`}
                      </p>
                    </div>
                  </button>

                  {/* Pricing grid */}
                  <div className="flex flex-wrap gap-3 flex-1">
                    {[
                      { label: 'Mensal (R¢)', field: 'price_cents' },
                      { label: 'Semestral (R¢)', field: 'price_cents_semiannual' },
                      { label: 'Anual (R¢)', field: 'price_cents_annual' },
                      { label: '% off Semestral', field: 'discount_semiannual_percent' },
                      { label: '% off Anual', field: 'discount_annual_percent' },
                      { label: 'IA scans (-1=∞)', field: 'ai_scans_limit' },
                      { label: 'Trial dias', field: 'trial_days' },
                    ].map(f => (
                      <div key={f.field} className="space-y-0.5">
                        <label className="text-[9px] font-bold text-slate-300 uppercase tracking-widest ml-1">{f.label}</label>
                        <input type="number" value={plan[f.field] ?? 0}
                          onChange={e => update(plan.id, f.field, parseFloat(e.target.value) || 0)}
                          className="w-28 h-9 bg-slate-50 rounded-xl px-3 text-sm font-bold text-slate-900 border-none focus:ring-2 focus:ring-brand-400"
                        />
                      </div>
                    ))}
                    {/* Preview */}
                    {plan.price_cents > 0 && (
                      <div className="space-y-0.5">
                        <label className="text-[9px] font-bold text-slate-300 uppercase tracking-widest ml-1">Preview</label>
                        <div className="h-9 flex flex-col justify-center px-2 text-[10px] font-bold text-slate-500">
                          <span>{fmt(plan.price_cents)}/mês</span>
                          <span className="text-emerald-600">{fmt(plan.price_cents_semiannual || 0)}/6m</span>
                          <span className="text-emerald-700">{fmt(plan.price_cents_annual || 0)}/12m</span>
                        </div>
                      </div>
                    )}
                    {/* Active toggle */}
                    <div className="flex items-center gap-2 mt-5">
                      <label className="text-[10px] font-bold text-slate-400">Ativo</label>
                      <button onClick={() => update(plan.id, 'is_active', !plan.is_active)}
                        className={`w-10 h-5 rounded-full transition-all ${plan.is_active ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full shadow transition-all mx-0.5 ${plan.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {plan._dirty && (
                      <button onClick={() => savePlan(plan)} disabled={saving === plan.id}
                        className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-brand-700 transition-all">
                        {saving === plan.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Salvar
                      </button>
                    )}
                    <button onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}
                      className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-all">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-50 p-6 space-y-6">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Funcionalidades — novas features adicionadas ao catálogo aparecem aqui automaticamente</p>
                    {featureGroups.map(group => (
                      <div key={group} className="space-y-3">
                        <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest border-b border-slate-50 pb-1">{group}</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                          {FEATURE_CATALOG.filter(f => f.group === group).map(feat => {
                            const enabled = !!plan.features?.[feat.key];
                            return (
                              <button key={feat.key} onClick={() => toggleFeature(plan.id, feat.key)}
                                className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${enabled ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-200'}`}>
                                <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${enabled ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                                  {enabled ? <Check size={12} /> : <X size={12} />}
                                </div>
                                <span className="text-[11px] font-bold leading-tight">{feat.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'coupons' && (
        <div className="space-y-6">
          <div className="bg-white rounded-[28px] border border-slate-100 p-8 space-y-6">
            <h3 className="font-bold text-slate-900 text-lg">Gerar Cupom</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {[{ ph: 'PROMO20', field: 'code', label: 'Código' },].map(f => (
                <div key={f.field} className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{f.label}</label>
                  <input type="text" placeholder={f.ph} value={(newCoupon as any)[f.field]}
                    onChange={e => setNewCoupon(p => ({ ...p, [f.field]: e.target.value.toUpperCase() }))}
                    className="w-full h-11 bg-slate-50 rounded-xl px-4 font-bold text-slate-900 text-sm border-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
              ))}
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Tipo</label>
                <select value={newCoupon.discount_type} onChange={e => setNewCoupon(p => ({ ...p, discount_type: e.target.value }))}
                  className="w-full h-11 bg-slate-50 rounded-xl px-4 font-bold text-slate-900 text-sm border-none">
                  <option value="percent">% Desconto</option>
                  <option value="fixed">R$ Fixo</option>
                  <option value="free_months">Meses Grátis</option>
                  <option value="free_plan">Plano Grátis</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Valor</label>
                <input type="number" placeholder="20" value={newCoupon.discount_value || ''}
                  onChange={e => setNewCoupon(p => ({ ...p, discount_value: parseFloat(e.target.value) || 0 }))}
                  className="w-full h-11 bg-slate-50 rounded-xl px-4 font-bold text-slate-900 text-sm border-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Plano (override)</label>
                <select value={newCoupon.plan_override_slug} onChange={e => setNewCoupon(p => ({ ...p, plan_override_slug: e.target.value }))}
                  className="w-full h-11 bg-slate-50 rounded-xl px-4 font-bold text-slate-900 text-sm border-none">
                  <option value="">Nenhum</option>
                  {plans.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Usos máx.</label>
                <input type="number" placeholder="Ilimitado" value={newCoupon.max_uses}
                  onChange={e => setNewCoupon(p => ({ ...p, max_uses: e.target.value }))}
                  className="w-full h-11 bg-slate-50 rounded-xl px-4 font-bold text-slate-900 text-sm border-none"
                />
              </div>
            </div>
            <button onClick={saveCoupon} disabled={savingCoupon || !newCoupon.code.trim()}
              className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-brand-600 transition-all disabled:opacity-40">
              {savingCoupon ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Criar Cupom
            </button>
          </div>

          <div className="bg-white rounded-[28px] border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cupons Ativos</div>
            <div className="divide-y divide-slate-50">
              {coupons.filter(c => c.is_active).map(coupon => (
                <div key={coupon.id} className="p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <button onClick={() => copyCode(coupon.code)}
                      className="flex items-center gap-2 bg-slate-900 text-white px-3 py-1.5 rounded-lg font-bold text-sm hover:bg-brand-600 transition-all">
                      {copiedCode === coupon.code ? <Check size={12} /> : <Copy size={12} />}
                      {coupon.code}
                    </button>
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {coupon.discount_type === 'percent' ? `${coupon.discount_value}% off` :
                         coupon.discount_type === 'fixed' ? `R$${coupon.discount_value} off` :
                         coupon.discount_type === 'free_months' ? `${coupon.discount_value} meses grátis` :
                         `Plano ${coupon.plans?.name || 'especial'} grátis`}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {coupon.uses_count} usos{coupon.max_uses ? ` / ${coupon.max_uses}` : ' (ilimitado)'}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => deactivateCoupon(coupon.id)}
                    className="w-8 h-8 rounded-lg bg-rose-50 text-rose-400 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-all">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {coupons.filter(c => c.is_active).length === 0 && (
                <div className="p-10 text-center text-slate-300 font-bold uppercase text-xs tracking-widest">Nenhum cupom ativo</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="py-20 border-2 border-dashed border-slate-100 rounded-[40px] flex flex-col items-center justify-center text-slate-300 gap-4">
          <Users size={48} />
          <p className="font-bold uppercase tracking-widest text-xs">Gestão de Usuários</p>
          <p className="text-[10px] text-slate-400 font-medium">Em breve: ver assinaturas, conceder planos, ver uso de IA por usuário.</p>
        </div>
      )}
    </div>
  );
}
