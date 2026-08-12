import React, { useEffect, useState, useCallback } from 'react';
import { Save, Loader2, Users, Wallet, MessageCircle, Settings2, CheckCircle2, XCircle, Ban, RefreshCw, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { useToast } from '../../contexts/ToastContext';

const money = (cents: number = 0) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

interface ReferralSettingsRow {
  id: number;
  commission_percent: number;
  duration_months: number | null;
  hold_period_days: number;
  tier_step_referrals: number;
  tier_step_percent: number;
  tier_cap_percent: number;
  min_payout_cents: number;
  auto_payout_enabled: boolean;
  max_auto_payout_cents: number;
  admin_notification_phone: string | null;
}

interface WhatsappCostRow { id: string; category: string; meta_cost_usd: number; usd_to_brl_rate: number; }
interface WhatsappInstanceRow { name: string; status: string; }
interface AffiliateRow {
  id: string; user_id: string; affiliate_code: string; is_active: boolean; has_custom_terms: boolean;
  commission_percent_override: number | null;
  duration_months_override: number | null;
  duration_lifetime_override: boolean;
  total_earned_cents: number; total_paid_cents: number; email?: string;
}
interface PayoutRow {
  id: string; affiliate_id: string; amount_cents: number; pix_key: string | null; status: string;
  redemption_type: string; requested_at: string; affiliate_code?: string; email?: string;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase!.auth.getSession();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` };
}

export default function ReferralAdminPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ReferralSettingsRow | null>(null);
  const [whatsappCosts, setWhatsappCosts] = useState<WhatsappCostRow[]>([]);
  const [instances, setInstances] = useState<WhatsappInstanceRow[]>([]);
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [payoutsFilter, setPayoutsFilter] = useState<'requested' | 'approved' | 'paid' | 'rejected'>('requested');
  const [selectedAffIds, setSelectedAffIds] = useState<Set<string>>(new Set());
  const [bulkPercent, setBulkPercent] = useState('');
  const [bulkMonths, setBulkMonths] = useState('');
  const [bulkLifetime, setBulkLifetime] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: settingsData }, { data: costData }, { data: instancesData }, { data: affiliatesData }] = await Promise.all([
        supabase!.from('referral_settings').select('*').eq('id', 1).single(),
        supabase!.from('whatsapp_cost_config').select('*').order('category'),
        supabase!.from('whatsapp_instances').select('*').order('name'),
        supabase!.from('affiliates').select('*').order('total_earned_cents', { ascending: false }),
      ]);
      setSettings(settingsData);
      setWhatsappCosts(costData || []);
      setInstances(instancesData || []);

      const userIds = (affiliatesData || []).map((a: any) => a.user_id);
      let emailMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase!.from('profiles').select('id, email').in('id', userIds);
        emailMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p.email]));
      }
      setAffiliates((affiliatesData || []).map((a: any) => ({ ...a, email: emailMap[a.user_id] })));
    } catch (err: any) {
      toast(err.message || 'Erro ao carregar dados de indicação.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadPayouts = useCallback(async () => {
    const { data } = await supabase!.from('affiliate_payouts')
      .select('*, affiliates(affiliate_code, user_id)')
      .eq('status', payoutsFilter)
      .order('requested_at', { ascending: false });

    const rows = data || [];
    const userIds = rows.map((r: any) => r.affiliates?.user_id).filter(Boolean);
    let emailMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase!.from('profiles').select('id, email').in('id', userIds);
      emailMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p.email]));
    }
    setPayouts(rows.map((r: any) => ({ ...r, affiliate_code: r.affiliates?.affiliate_code, email: emailMap[r.affiliates?.user_id] })));
  }, [payoutsFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadPayouts(); }, [loadPayouts]);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const { error } = await supabase!.from('referral_settings').update({
        commission_percent: settings.commission_percent,
        duration_months: settings.duration_months,
        hold_period_days: settings.hold_period_days,
        tier_step_referrals: settings.tier_step_referrals,
        tier_step_percent: settings.tier_step_percent,
        tier_cap_percent: settings.tier_cap_percent,
        min_payout_cents: settings.min_payout_cents,
        auto_payout_enabled: settings.auto_payout_enabled,
        max_auto_payout_cents: settings.max_auto_payout_cents,
        admin_notification_phone: settings.admin_notification_phone,
        updated_at: new Date().toISOString(),
      }).eq('id', 1);
      if (error) throw error;
      toast('Padrão do programa salvo. Vale para indicações novas a partir de agora.', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveCostRow = async (row: WhatsappCostRow) => {
    const { error } = await supabase!.from('whatsapp_cost_config').update({
      meta_cost_usd: row.meta_cost_usd, usd_to_brl_rate: row.usd_to_brl_rate, updated_at: new Date().toISOString(),
    }).eq('id', row.id);
    if (error) toast(error.message, 'error'); else toast('Custo salvo.', 'success');
  };

  const toggleInstance = async (name: string, currentStatus: string) => {
    const next = currentStatus === 'active' ? 'blocked' : 'active';
    const { error } = await supabase!.from('whatsapp_instances').update({ status: next, updated_at: new Date().toISOString() }).eq('name', name);
    if (error) return toast(error.message, 'error');
    toast(next === 'blocked' ? 'Número marcado como bloqueado — usuários serão realocados.' : 'Número reativado.', 'success');
    load();
  };

  const toggleCustomTerms = async (aff: AffiliateRow) => {
    const { error } = await supabase!.from('affiliates').update({ has_custom_terms: !aff.has_custom_terms, updated_at: new Date().toISOString() }).eq('id', aff.id);
    if (error) return toast(error.message, 'error');
    load();
  };

  const saveAffiliateOverride = async (aff: AffiliateRow, value: number | null) => {
    const { error } = await supabase!.from('affiliates').update({ commission_percent_override: value, updated_at: new Date().toISOString() }).eq('id', aff.id);
    if (error) toast(error.message, 'error'); else toast('Override salvo.', 'success');
  };

  // Duração individual: só é usada se has_custom_terms=true; se o campo de meses
  // ficar vazio (e não for vitalício), a indicação segue o padrão geral do
  // programa automaticamente (ver resolveReferralTerms) — ninguém muda sem eu
  // mexer manualmente aqui.
  const saveAffiliateDuration = async (aff: AffiliateRow, months: number | null, lifetime: boolean) => {
    const { error } = await supabase!.from('affiliates').update({
      duration_months_override: lifetime ? null : months,
      duration_lifetime_override: lifetime,
      updated_at: new Date().toISOString(),
    }).eq('id', aff.id);
    if (error) toast(error.message, 'error'); else { toast('Duração individual salva.', 'success'); load(); }
  };

  const toggleSelectAff = (id: string) => {
    setSelectedAffIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllAffs = () => {
    setSelectedAffIds(prev => prev.size === affiliates.length ? new Set() : new Set(affiliates.map(a => a.id)));
  };

  // Aplica a MESMA regra manual a vários afiliados de uma vez — útil pra ajustar
  // um grupo (ex.: uma campanha específica) sem clicar um por um. Só entra em
  // vigor pras indicações que forem criadas DAQUI PRA FRENTE por esses afiliados;
  // indicações já existentes mantêm os termos que já estavam travados nelas.
  const applyBulkOverride = async () => {
    if (selectedAffIds.size === 0) return;
    if (bulkPercent === '' && bulkMonths === '' && !bulkLifetime) {
      return toast('Preencha ao menos um campo (comissão ou duração) para aplicar em lote.', 'error');
    }
    setBulkSaving(true);
    try {
      const updates: any = { has_custom_terms: true, updated_at: new Date().toISOString() };
      if (bulkPercent !== '') updates.commission_percent_override = Number(bulkPercent);
      if (bulkLifetime) {
        updates.duration_lifetime_override = true;
        updates.duration_months_override = null;
      } else if (bulkMonths !== '') {
        updates.duration_lifetime_override = false;
        updates.duration_months_override = Number(bulkMonths);
      }
      const { error } = await supabase!.from('affiliates').update(updates).in('id', Array.from(selectedAffIds));
      if (error) throw error;
      toast(`Regra manual aplicada a ${selectedAffIds.size} afiliado(s).`, 'success');
      setSelectedAffIds(new Set());
      setBulkPercent(''); setBulkMonths(''); setBulkLifetime(false);
      load();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBulkSaving(false);
    }
  };

  const applyBulkResetToDefault = async () => {
    if (selectedAffIds.size === 0) return;
    setBulkSaving(true);
    try {
      const { error } = await supabase!.from('affiliates').update({
        has_custom_terms: false,
        commission_percent_override: null,
        duration_months_override: null,
        duration_lifetime_override: false,
        updated_at: new Date().toISOString(),
      }).in('id', Array.from(selectedAffIds));
      if (error) throw error;
      toast(`${selectedAffIds.size} afiliado(s) voltaram ao padrão automático.`, 'success');
      setSelectedAffIds(new Set());
      load();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBulkSaving(false);
    }
  };

  const processPayout = async (payoutId: string, action: 'approve' | 'pay' | 'reject') => {
    try {
      const headers = await authHeader();
      const res = await fetch('/api/admin-process-payout', { method: 'POST', headers, body: JSON.stringify({ payoutId, action }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao processar saque.');
      toast(`Saque ${action === 'approve' ? 'aprovado' : action === 'pay' ? 'marcado como pago' : 'rejeitado'}.`, 'success');
      loadPayouts();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  if (loading || !settings) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-brand-600" size={28} /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Padrão global */}
      <section className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-4"><Settings2 size={14} /> Padrão do Programa (afeta só indicações novas)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Comissão base (%)" value={settings.commission_percent} onChange={v => setSettings({ ...settings, commission_percent: v })} />
          <Field label="Duração (meses, vazio=vitalício)" value={settings.duration_months ?? ''} onChange={v => setSettings({ ...settings, duration_months: v === '' ? null : Number(v) })} allowEmpty />
          <Field label="Carência (dias)" value={settings.hold_period_days} onChange={v => setSettings({ ...settings, hold_period_days: v })} />
          <Field label="Saque mínimo (R$)" value={settings.min_payout_cents / 100} onChange={v => setSettings({ ...settings, min_payout_cents: Math.round(v * 100) })} step="0.01" />
          <Field label="Indicações p/ subir de faixa" value={settings.tier_step_referrals} onChange={v => setSettings({ ...settings, tier_step_referrals: v })} />
          <Field label="Aumento por faixa (%)" value={settings.tier_step_percent} onChange={v => setSettings({ ...settings, tier_step_percent: v })} />
          <Field label="Teto de comissão (%)" value={settings.tier_cap_percent} onChange={v => setSettings({ ...settings, tier_cap_percent: v })} />
        </div>
        <button onClick={saveSettings} disabled={saving} className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-brand-700 disabled:opacity-50">
          <Save size={14} /> {saving ? 'Salvando...' : 'Salvar padrão'}
        </button>
      </section>

      {/* Pagamento automático de saque via Pix */}
      <section className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-1"><Wallet size={14} /> Pagamento Automático de Saque (Pix)</h3>
        <p className="text-[10px] text-slate-400 mb-4">
          Vem <strong>desligado</strong> por padrão. Quando ligado: se um pedido de saque ficar 48h sem você aprovar/rejeitar manualmente, o sistema paga sozinho via Pix — mas só até o teto configurado abaixo. Acima do teto, o pedido sempre espera seu clique, não importa quanto tempo passe.
        </p>
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setSettings({ ...settings, auto_payout_enabled: !settings.auto_payout_enabled })}
            className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${settings.auto_payout_enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.auto_payout_enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
            {settings.auto_payout_enabled ? 'Ligado — pode pagar sozinho dentro do teto' : 'Desligado — todo saque espera clique manual'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Teto do pagamento automático (R$)" value={settings.max_auto_payout_cents / 100} onChange={v => setSettings({ ...settings, max_auto_payout_cents: Math.round(v * 100) })} step="0.01" />
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">WhatsApp para avisos (com DDI, ex: 5511999999999)</label>
            <input
              type="text"
              value={settings.admin_notification_phone || ''}
              onChange={e => setSettings({ ...settings, admin_notification_phone: e.target.value })}
              placeholder="5511999999999"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>
        <button onClick={saveSettings} disabled={saving} className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-brand-700 disabled:opacity-50">
          <Save size={14} /> {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </section>

      {/* Custo de WhatsApp */}
      <section className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-1"><MessageCircle size={14} /> Custo de WhatsApp (tabela Meta)</h3>
        <p className="text-[10px] text-slate-400 mb-4">Usado no cálculo de margem dos planos mesmo enviando pela Evolution — sempre o valor mais caro é considerado, pra nunca dar prejuízo escondido.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {whatsappCosts.map(row => (
            <div key={row.id} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 capitalize">{row.category}</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400">US$</span>
                <input type="number" step="0.0001" value={row.meta_cost_usd}
                  onChange={e => setWhatsappCosts(prev => prev.map(r => r.id === row.id ? { ...r, meta_cost_usd: Number(e.target.value) } : r))}
                  className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold" />
              </div>
              <button onClick={() => saveCostRow(row)} className="mt-2 w-full py-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-slate-300 dark:hover:bg-slate-600">Salvar</button>
            </div>
          ))}
        </div>
      </section>

      {/* Instâncias Evolution */}
      <section className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-1"><RefreshCw size={14} /> Números do WhatsApp (rotação)</h3>
        <p className="text-[10px] text-slate-400 mb-4">Cada usuário sempre recebe do mesmo número. Bloqueie aqui um número que caiu — os usuários dele são realocados automaticamente para um número ativo.</p>
        {instances.length === 0 ? (
          <p className="text-xs text-slate-400">Nenhuma instância configurada ainda (variável EVOLUTION_INSTANCES na Vercel).</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {instances.map(inst => (
              <button key={inst.name} onClick={() => toggleInstance(inst.name, inst.status)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border ${inst.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/30' : 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/30 dark:border-rose-900/30'}`}>
                {inst.status === 'active' ? <CheckCircle2 size={13} /> : <Ban size={13} />} {inst.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Fila de saques/resgates */}
      <section className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-4"><Wallet size={14} /> Saques e resgates</h3>
        <div className="flex gap-2 mb-4">
          {(['requested', 'approved', 'paid', 'rejected'] as const).map(f => (
            <button key={f} onClick={() => setPayoutsFilter(f)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${payoutsFilter === f ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>{f}</button>
          ))}
        </div>
        {payouts.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">Nenhum pedido nesse status.</p>
        ) : (
          <div className="space-y-2">
            {payouts.map(p => (
              <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <div>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{p.email || p.affiliate_code} — {money(p.amount_cents)}</p>
                  <p className="text-[10px] text-slate-400">
                    {p.redemption_type === 'subscription_credit' ? '⚠️ Abater na mensalidade (aplicar manualmente no Asaas)' : `Pix: ${p.pix_key}`} · {new Date(p.requested_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                {payoutsFilter !== 'paid' && payoutsFilter !== 'rejected' && (
                  <div className="flex gap-2">
                    {payoutsFilter === 'requested' && (
                      <button onClick={() => processPayout(p.id, 'approve')} className="px-3 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg text-[10px] font-black uppercase">Aprovar</button>
                    )}
                    <button onClick={() => processPayout(p.id, 'pay')} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase">Marcar pago</button>
                    <button onClick={() => processPayout(p.id, 'reject')} className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-[10px] font-black uppercase">Rejeitar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Afiliados */}
      <section className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-4"><Users size={14} /> Afiliados ({affiliates.length})</h3>

        {selectedAffIds.size > 0 && (
          <div className="mb-4 p-4 bg-brand-50 dark:bg-brand-950/20 border border-brand-100 dark:border-brand-900/30 rounded-2xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-brand-700 dark:text-brand-400 mb-3">
              {selectedAffIds.size} selecionado(s) — regra manual só vale pras indicações novas desses afiliados a partir de agora
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Comissão (%)</label>
                <input type="number" value={bulkPercent} onChange={e => setBulkPercent(e.target.value)} placeholder="não alterar"
                  className="w-28 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs" />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Duração (meses)</label>
                <input type="number" value={bulkMonths} onChange={e => setBulkMonths(e.target.value)} placeholder="não alterar" disabled={bulkLifetime}
                  className="w-28 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs disabled:opacity-40" />
              </div>
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 pb-1.5 cursor-pointer">
                <input type="checkbox" checked={bulkLifetime} onChange={e => setBulkLifetime(e.target.checked)} /> vitalício
              </label>
              <button onClick={applyBulkOverride} disabled={bulkSaving} className="px-4 py-2 bg-brand-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-700 disabled:opacity-50">
                Aplicar aos selecionados
              </button>
              <button onClick={applyBulkResetToDefault} disabled={bulkSaving} className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50">
                <RotateCcw size={12} /> Voltar ao padrão
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="py-2 pr-3">
                  <input type="checkbox" checked={affiliates.length > 0 && selectedAffIds.size === affiliates.length} onChange={toggleSelectAllAffs} />
                </th>
                <th className="py-2 pr-3">Usuário</th>
                <th className="py-2 pr-3">Código</th>
                <th className="py-2 pr-3">Ganho total</th>
                <th className="py-2 pr-3">Pago</th>
                <th className="py-2 pr-3">Override manual</th>
                <th className="py-2 pr-3">%</th>
                <th className="py-2 pr-3">Duração (meses)</th>
              </tr>
            </thead>
            <tbody>
              {affiliates.map(aff => (
                <tr key={aff.id} className="border-b border-slate-50 dark:border-slate-800/50">
                  <td className="py-2 pr-3">
                    <input type="checkbox" checked={selectedAffIds.has(aff.id)} onChange={() => toggleSelectAff(aff.id)} />
                  </td>
                  <td className="py-2 pr-3 font-bold text-slate-700 dark:text-slate-300">{aff.email || aff.user_id.slice(0, 8)}</td>
                  <td className="py-2 pr-3 text-slate-500">{aff.affiliate_code}</td>
                  <td className="py-2 pr-3 font-bold">{money(aff.total_earned_cents)}</td>
                  <td className="py-2 pr-3 text-slate-500">{money(aff.total_paid_cents)}</td>
                  <td className="py-2 pr-3">
                    <button onClick={() => toggleCustomTerms(aff)} className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${aff.has_custom_terms ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
                      {aff.has_custom_terms ? 'Manual' : 'Automático'}
                    </button>
                  </td>
                  <td className="py-2 pr-3">
                    {aff.has_custom_terms ? (
                      <input type="number" defaultValue={aff.commission_percent_override ?? ''} placeholder="padrão"
                        onBlur={e => saveAffiliateOverride(aff, e.target.value === '' ? null : Number(e.target.value))}
                        className="w-16 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs" />
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-2 pr-3">
                    {aff.has_custom_terms ? (
                      <div className="flex items-center gap-1.5">
                        <input type="number" defaultValue={aff.duration_lifetime_override ? '' : (aff.duration_months_override ?? '')}
                          placeholder={aff.duration_lifetime_override ? 'vitalício' : 'padrão'}
                          disabled={aff.duration_lifetime_override}
                          onBlur={e => saveAffiliateDuration(aff, e.target.value === '' ? null : Number(e.target.value), aff.duration_lifetime_override)}
                          className="w-16 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs disabled:opacity-40" />
                        <label className="flex items-center gap-1 text-[9px] font-bold text-slate-400 cursor-pointer whitespace-nowrap">
                          <input type="checkbox" checked={aff.duration_lifetime_override}
                            onChange={e => saveAffiliateDuration(aff, aff.duration_months_override, e.target.checked)} />
                          vitalício
                        </label>
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, onChange, allowEmpty, step }: { label: string; value: number | string; onChange: (v: any) => void; allowEmpty?: boolean; step?: string }) {
  return (
    <div>
      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">{label}</label>
      <input
        type="number"
        step={step || '1'}
        value={value}
        onChange={e => onChange(allowEmpty && e.target.value === '' ? '' : Number(e.target.value))}
        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-brand-500"
      />
    </div>
  );
}
