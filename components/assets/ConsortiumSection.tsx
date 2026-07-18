import { DateUtils } from '../../lib/dateUtils';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Loader2, Check, ChevronRight, ChevronLeft,
  Clock, AlertTriangle, TrendingUp, Landmark, Calendar,
  Megaphone, Gift, Building2, Car, DollarSign, Zap,
  BarChart3, RefreshCw, Trash2, Edit2, FileSpreadsheet
} from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { useToast } from '../../contexts/ToastContext';

// ─── Tipos ───────────────────────────────────────────────────────────────────
type ConsortiumStatus = 'WAITING' | 'CONTEMPLATED' | 'CREDIT_USED' | 'SETTLED';

interface Consortium {
  id: string;
  name: string;
  administrator_name: string;
  group_number: string;
  quota_number: string;
  credit_letter_value: number;
  credit_letter_index: string;
  credit_letter_current_value: number | null;
  credit_letter_expiry_date: string | null;
  asset_category: string | null;
  total_months: number;
  months_paid: number;
  start_date: string;
  assembly_day: number | null;
  admin_fee_pct: number;
  reserve_fund_pct: number;
  insurance_monthly_amount: number;
  status: ConsortiumStatus;
  contemplated_at: string | null;
  contemplation_method: string;
  contemplation_assembly: number | null;
  intended_asset_description: string | null;
  intended_asset_value: number | null;
  notes: string | null;
  liability_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

// ─── Cálculos ────────────────────────────────────────────────────────────────
function calcConsortium(c: Consortium) {
  const carta = Number(c.credit_letter_value) || 0;
  const n = Number(c.total_months) || 1;
  const paid = Number(c.months_paid) || 0;
  const remaining = Math.max(0, n - paid);

  const quotaMonthly   = carta / n;
  const adminMonthly   = carta * (Number(c.admin_fee_pct) / 100) / n;
  const frMonthly      = carta * (Number(c.reserve_fund_pct) / 100) / n;
  const insuranceMonthly = Number(c.insurance_monthly_amount) || 0;
  const totalMonthly   = quotaMonthly + adminMonthly + frMonthly + insuranceMonthly;

  const totalPaid      = paid * totalMonthly;
  const totalFuture    = remaining * totalMonthly;
  const grandTotal     = totalPaid + totalFuture;

  const adminCostTotal = carta * (Number(c.admin_fee_pct) / 100);
  const frAccumulated  = paid * frMonthly;

  const creditAccumulated = paid * quotaMonthly;
  const pctDone = carta > 0 ? Math.min(100, (creditAccumulated / carta) * 100) : 0;

  // CET estimado (simplificado): justo de comparação com financiamento
  // Fluxo: -totalMonthly × paid meses, +carta, -totalMonthly × remaining meses
  // Aproximação linear para exibição
  const cetMonthly = carta > 0
    ? ((grandTotal - carta) / carta / n) * 100
    : 0;

  // Dias para próxima assembleia
  const today = new Date();
  let nextAssembly: Date | null = null;
  if (c.assembly_day) {
    nextAssembly = new Date(today.getFullYear(), today.getMonth(), c.assembly_day);
    if (nextAssembly <= today) nextAssembly = new Date(today.getFullYear(), today.getMonth() + 1, c.assembly_day);
  }
  const daysToAssembly = nextAssembly
    ? Math.ceil((nextAssembly.getTime() - today.getTime()) / 86400000)
    : null;

  // Dias para carta expirar (após contemplação)
  let daysToCartaExpiry: number | null = null;
  if (c.credit_letter_expiry_date) {
    const expiry = new Date(c.credit_letter_expiry_date);
    daysToCartaExpiry = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
  }

  return {
    quotaMonthly, adminMonthly, frMonthly, insuranceMonthly, totalMonthly,
    totalPaid, totalFuture, grandTotal, adminCostTotal, frAccumulated,
    creditAccumulated, pctDone, cetMonthly,
    daysToAssembly, nextAssembly, daysToCartaExpiry, remaining
  };
}

// ─── FORMULÁRIO (Wizard 4 passos) ────────────────────────────────────────────
const INITIAL_FORM = {
  name: '',
  administrator_name: '',
  group_number: '',
  quota_number: '',
  credit_letter_value: '',
  credit_letter_index: 'INCC',
  asset_category: 'REAL_ESTATE' as string,
  total_months: '',
  months_paid: '0',
  start_date: DateUtils.formatToISODate(),
  assembly_day: '',
  admin_fee_pct: '',
  reserve_fund_pct: '',
  insurance_monthly_amount: '0',
  status: 'WAITING' as ConsortiumStatus,
  contemplated_at: '',
  contemplation_method: 'LOTTERY',
  bid_amount: '',
  bid_type: 'FREE',
  credit_letter_expiry_date: '',
  intended_asset_description: '',
  intended_asset_value: '',
  notes: ''
};

const ConsortiumWizard: React.FC<{
  onClose: () => void;
  onSaved: () => void;
  editing?: Consortium | null;
}> = ({ onClose, onSaved, editing }) => {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => editing ? {
    ...INITIAL_FORM,
    name: editing.name,
    administrator_name: editing.administrator_name,
    group_number: editing.group_number,
    quota_number: editing.quota_number,
    credit_letter_value: String(editing.credit_letter_value),
    credit_letter_index: editing.credit_letter_index || 'INCC',
    asset_category: editing.asset_category || 'REAL_ESTATE',
    total_months: String(editing.total_months),
    months_paid: String(editing.months_paid),
    start_date: editing.start_date,
    assembly_day: String(editing.assembly_day || ''),
    admin_fee_pct: String(editing.admin_fee_pct),
    reserve_fund_pct: String(editing.reserve_fund_pct),
    insurance_monthly_amount: String(editing.insurance_monthly_amount),
    status: editing.status,
    contemplated_at: editing.contemplated_at || '',
    contemplation_method: editing.contemplation_method,
    credit_letter_expiry_date: editing.credit_letter_expiry_date || '',
    intended_asset_description: editing.intended_asset_description || '',
    intended_asset_value: String(editing.intended_asset_value || ''),
    notes: editing.notes || ''
  } : INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  const set = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }));

  const handleSave = async () => {
    if (!supabase) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Sessão expirada.');
      const uid = session.user.id;

      // ── Cálculo dos valores mensais ──────────────────────────────────────
      const carta     = parseFloat(form.credit_letter_value) || 0;
      const n         = parseInt(form.total_months) || 1;
      const paidN     = parseInt(form.months_paid) || 0;
      const adminPct  = parseFloat(form.admin_fee_pct) || 0;
      const frPct     = parseFloat(form.reserve_fund_pct) || 0;
      const seguro    = parseFloat(form.insurance_monthly_amount) || 0;

      const quotaM    = carta / n;
      const adminM    = carta * (adminPct / 100) / n;
      const frM       = carta * (frPct / 100) / n;
      const totalM    = Math.round((quotaM + adminM + frM + seguro) * 100) / 100;

      const remaining = Math.max(0, carta - paidN * quotaM);

      // ── Payload do consórcio ─────────────────────────────────────────────
      const payload: any = {
        user_id: uid,
        name: form.name.trim(),
        administrator_name: form.administrator_name.trim() || '',
        group_number: form.group_number.trim() || '',
        quota_number: form.quota_number.trim() || '',
        credit_letter_value: carta,
        credit_letter_index: form.credit_letter_index,
        asset_category: form.asset_category || null,
        total_months: n,
        months_paid: paidN,
        start_date: form.start_date,
        assembly_day: form.assembly_day ? parseInt(form.assembly_day) : null,
        admin_fee_pct: adminPct,
        reserve_fund_pct: frPct,
        insurance_monthly_amount: seguro,
        status: form.status,
        contemplated_at: form.contemplated_at || null,
        contemplation_method: form.contemplation_method || 'UNKNOWN',
        credit_letter_expiry_date: form.credit_letter_expiry_date || null,
        intended_asset_description: form.intended_asset_description || null,
        intended_asset_value: form.intended_asset_value ? parseFloat(form.intended_asset_value) : null,
        notes: form.notes || null,
        updated_at: new Date().toISOString()
      };

      let consortiumId = editing?.id || '';

      if (editing) {
        // ── EDIÇÃO ──────────────────────────────────────────────────────────
        const { error } = await supabase.from('consortiums').update(payload).eq('id', editing.id).eq('user_id', uid);
        if (error) throw error;

        // Atualiza a liability vinculada se existir
        if (editing.metadata?.liability_id) {
          await supabase.from('liabilities').update({
            total_amount: carta,
            remaining_balance: remaining,
            installment_amount: totalM,
            installments_remaining: Math.max(0, n - paidN),
            updated_at: new Date().toISOString()
          }).eq('id', editing.metadata.liability_id).eq('user_id', uid);
        }

        toast('Consórcio atualizado!', 'success');
      } else {
        // ── CRIAÇÃO ─────────────────────────────────────────────────────────
        // 1. Cria a liability (aparece em Passivos e nos cálculos financeiros)
        const liabPayload = {
          user_id: uid,
          name: form.name.trim(),
          type: 'CONSORTIUM',
          total_amount: carta,
          remaining_balance: remaining,
          installment_amount: totalM,
          installments_remaining: Math.max(0, n - paidN),
          interest_rate: 0,
          due_day: form.assembly_day || null,
          metadata: {
            consortium_type: form.asset_category,
            admin_fee_pct: adminPct,
            reserve_fund_pct: frPct,
            monthly_breakdown: { quota: quotaM, admin: adminM, fr: frM, insurance: seguro }
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { data: liabData, error: liabErr } = await supabase
          .from('liabilities').insert(liabPayload).select('id').single();
        if (liabErr) throw liabErr;
        const liabilityId = liabData.id;

        // 2. Cria o consórcio com liability_id vinculado
        const { data: consData, error: consErr } = await supabase
          .from('consortiums')
          .insert({ ...payload, liability_id: liabilityId, created_at: new Date().toISOString() })
          .select('id').single();
        if (consErr) throw consErr;
        consortiumId = consData.id;

        // 3. Gera todas as transações mensais (aparece no Histórico/Transações)
        const startDate = new Date(form.start_date + 'T12:00:00');
        const installments: any[] = [];

        for (let i = 0; i < n; i++) {
          const d = new Date(startDate);
          d.setMonth(d.getMonth() + i);
          const dateStr = d.toISOString().split('T')[0];
          const isPaid  = i < paidN;

          installments.push({
            user_id: uid,
            date: dateStr,
            description: `Parcela ${i + 1}/${n} (Consórcio) - ${form.name.trim()}`,
            amount: totalM,
            type: 'EXPENSE',
            category: 'Consórcio',
            subcategory: form.asset_category === 'REAL_ESTATE' ? 'Consórcio Imóvel' : form.asset_category === 'VEHICLE' ? 'Consórcio Veículo' : 'Consórcio',
            is_paid: isPaid,
            paid_amount: isPaid ? totalM : 0,
            paid_at: isPaid ? dateStr : null,
            is_deleted: false,
            is_installment: true,
            installment_number: i + 1,
            installment_total: n,
            liability_id: liabilityId,
            consortium_id: consortiumId,
            metadata: {
              consortium_id: consortiumId,
              installment_number: i + 1,
              installment_total: n,
              components: { quota: quotaM, admin_fee: adminM, reserve_fund: frM, insurance: seguro },
              is_consortium_installment: true,
              auto_generated: true
            }
          });
        }

        // Insere em lotes de 50
        for (let i = 0; i < installments.length; i += 50) {
          const batch = installments.slice(i, i + 50);
          const { error: txErr } = await supabase.from('transactions').insert(batch);
          if (txErr) console.warn('Erro ao inserir lote de transações:', txErr.message);
        }

        toast(`Consórcio cadastrado! ${n} parcelas geradas no histórico.`, 'success');
      }

      onSaved();
    } catch (err: any) {
      toast(`Erro: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const totalSteps = form.status === 'WAITING' ? 3 : 4;

  const inp = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-brand-500 transition-all";
  const label = "block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">
              {editing ? 'Editar Consórcio' : 'Novo Consórcio'}
            </h3>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">Passo {step} de {totalSteps}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50"><X size={18} /></button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-slate-100 shrink-0">
          <div className="h-full bg-brand-500 transition-all duration-300" style={{ width: `${(step / totalSteps) * 100}%` }} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* PASSO 1: Dados do Grupo */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2">Dados do Grupo</p>
              <div>
                <label className={label}>Nome do Consórcio</label>
                <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Consórcio Imóvel 300k" className={inp} />
              </div>
              <div>
                <label className={label}>Administradora</label>
                <input type="text" value={form.administrator_name} onChange={e => set('administrator_name', e.target.value)} placeholder="Ex: Porto Seguro Consórcios" className={inp} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Número do Grupo</label>
                  <input type="text" value={form.group_number} onChange={e => set('group_number', e.target.value)} placeholder="Ex: 0042" className={inp} />
                </div>
                <div>
                  <label className={label}>Número da Cota</label>
                  <input type="text" value={form.quota_number} onChange={e => set('quota_number', e.target.value)} placeholder="Ex: 015" className={inp} />
                </div>
              </div>
              <div>
                <label className={label}>Tipo de bem</label>
                <select value={form.asset_category} onChange={e => set('asset_category', e.target.value)} className={inp}>
                  <option value="REAL_ESTATE">Imóvel</option>
                  <option value="VEHICLE">Veículo</option>
                  <option value="OTHER">Outro</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Valor da Carta de Crédito (R$)</label>
                  <input type="number" step="0.01" value={form.credit_letter_value} onChange={e => set('credit_letter_value', e.target.value)} placeholder="0,00" className={inp} />
                </div>
                <div>
                  <label className={label}>Índice de Reajuste</label>
                  <select value={form.credit_letter_index} onChange={e => set('credit_letter_index', e.target.value)} className={inp}>
                    <option value="INCC">INCC (Imóvel)</option>
                    <option value="IPCA">IPCA</option>
                    <option value="FIPE">FIPE (Veículo)</option>
                    <option value="NONE">Sem reajuste</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* PASSO 2: Taxas e Prazo */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2">Taxas e Prazo</p>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 font-medium">
                💡 As taxas são cobradas sobre o valor da carta de crédito, não sobre o que você deve.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Taxa de Administração Total (%)</label>
                  <input type="number" step="0.01" value={form.admin_fee_pct} onChange={e => set('admin_fee_pct', e.target.value)} placeholder="Ex: 18" className={inp} />
                  <p className="text-[9px] text-slate-400 mt-1">% total sobre o valor da carta</p>
                </div>
                <div>
                  <label className={label}>Fundo de Reserva (%)</label>
                  <input type="number" step="0.01" value={form.reserve_fund_pct} onChange={e => set('reserve_fund_pct', e.target.value)} placeholder="Ex: 2" className={inp} />
                  <p className="text-[9px] text-slate-400 mt-1">Pode ser devolvido ao final</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Seguro Mensal (R$)</label>
                  <input type="number" step="0.01" value={form.insurance_monthly_amount} onChange={e => set('insurance_monthly_amount', e.target.value)} placeholder="0,00" className={inp} />
                </div>
                <div>
                  <label className={label}>Prazo Total (meses)</label>
                  <input type="number" min="1" value={form.total_months} onChange={e => set('total_months', e.target.value)} placeholder="Ex: 120" className={inp} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Parcelas já pagas</label>
                  <input type="number" min="0" value={form.months_paid} onChange={e => set('months_paid', e.target.value)} className={inp} />
                </div>
                <div>
                  <label className={label}>Data de início</label>
                  <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} className={inp} />
                </div>
              </div>
              <div>
                <label className={label}>Dia da Assembleia mensal</label>
                <input type="number" min="1" max="31" value={form.assembly_day} onChange={e => set('assembly_day', e.target.value)} placeholder="Ex: 15 (dia 15 de cada mês)" className={inp} />
              </div>

              {/* Preview do cálculo */}
              {form.credit_letter_value && form.total_months && form.admin_fee_pct && (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prévia da Parcela Mensal</p>
                  {(() => {
                    const carta = parseFloat(form.credit_letter_value) || 0;
                    const n = parseInt(form.total_months) || 1;
                    const quota = carta / n;
                    const admin = carta * (parseFloat(form.admin_fee_pct) / 100) / n;
                    const fr = carta * (parseFloat(form.reserve_fund_pct) / 100) / n;
                    const seg = parseFloat(form.insurance_monthly_amount) || 0;
                    const total = quota + admin + fr + seg;
                    const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
                    return (
                      <div className="space-y-1 text-[11px]">
                        <div className="flex justify-between"><span className="text-slate-500">Fundo comum (amortização):</span><span className="font-bold">{fmt(quota)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Taxa de administração:</span><span className="font-bold text-amber-600">{fmt(admin)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Fundo de reserva:</span><span className="font-bold text-blue-600">{fmt(fr)}</span></div>
                        {seg > 0 && <div className="flex justify-between"><span className="text-slate-500">Seguro:</span><span className="font-bold">{fmt(seg)}</span></div>}
                        <div className="flex justify-between border-t border-slate-200 pt-1 mt-1"><span className="font-black text-slate-900">Total mensal:</span><span className="font-black text-slate-900">{fmt(total)}</span></div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* PASSO 3: Status de contemplação */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2">Status de Contemplação</p>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { value: 'WAITING', label: '⏳ Aguardando Contemplação', desc: 'Ainda não fui contemplado. Pago mensalmente.' },
                  { value: 'CONTEMPLATED', label: '🎉 Contemplado — Carta em mãos', desc: 'Fui contemplado. Tenho a carta mas ainda não usei.' },
                  { value: 'CREDIT_USED', label: '🏠 Bem adquirido — Quitando', desc: 'Já usei a carta e adquiri o bem. Pagando parcelas restantes.' },
                  { value: 'SETTLED', label: '✅ Quitado', desc: 'Todas as parcelas foram pagas.' }
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('status', opt.value)}
                    className={`text-left p-4 rounded-2xl border-2 transition-all ${form.status === opt.value ? 'border-brand-500 bg-brand-50' : 'border-slate-100 bg-white hover:border-slate-200'}`}
                  >
                    <p className={`font-black text-sm ${form.status === opt.value ? 'text-brand-700' : 'text-slate-800'}`}>{opt.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
              <div>
                <label className={label}>Bem pretendido / descritivo (opcional)</label>
                <input type="text" value={form.intended_asset_description} onChange={e => set('intended_asset_description', e.target.value)} placeholder="Ex: Apartamento 3 quartos Florianópolis" className={inp} />
              </div>
            </div>
          )}

          {/* PASSO 4: Dados da Contemplação (apenas se contemplado) */}
          {step === 4 && form.status !== 'WAITING' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-2">Dados da Contemplação</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Data da Contemplação</label>
                  <input type="date" value={form.contemplated_at} onChange={e => set('contemplated_at', e.target.value)} className={inp} />
                </div>
                <div>
                  <label className={label}>Forma de Contemplação</label>
                  <select value={form.contemplation_method} onChange={e => set('contemplation_method', e.target.value)} className={inp}>
                    <option value="LOTTERY">Sorteio</option>
                    <option value="BID">Lance</option>
                    <option value="UNKNOWN">Não sei</option>
                  </select>
                </div>
              </div>
              {form.contemplation_method === 'BID' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={label}>Valor do Lance (R$)</label>
                    <input type="number" step="0.01" value={form.bid_amount} onChange={e => set('bid_amount', e.target.value)} className={inp} />
                  </div>
                  <div>
                    <label className={label}>Tipo de Lance</label>
                    <select value={form.bid_type} onChange={e => set('bid_type', e.target.value)} className={inp}>
                      <option value="FREE">Lance Livre (dinheiro próprio)</option>
                      <option value="BUILT_IN">Lance Embutido (parcelas futuras)</option>
                    </select>
                  </div>
                </div>
              )}
              <div>
                <label className={label}>Prazo para usar a carta (data limite)</label>
                <input type="date" value={form.credit_letter_expiry_date} onChange={e => set('credit_letter_expiry_date', e.target.value)} className={inp} />
                <p className="text-[9px] text-slate-400 mt-1">A carta tem prazo para ser utilizada após a contemplação</p>
              </div>
              <div>
                <label className={label}>Notas</label>
                <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Observações sobre a contemplação" className={inp} />
              </div>
            </div>
          )}
        </div>

        {/* Footer com botões de navegação */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center shrink-0">
          <button
            onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
          >
            <ChevronLeft size={14} /> {step > 1 ? 'Voltar' : 'Cancelar'}
          </button>

          {step < totalSteps ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && !form.name.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-brand-600 text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50 hover:bg-brand-700 transition-all shadow-md shadow-brand-500/20"
            >
              Próximo <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-brand-600 text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50 hover:bg-brand-700 transition-all shadow-md shadow-brand-500/20"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Salvando...' : 'Salvar Consórcio'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── CARD DE CONSÓRCIO ────────────────────────────────────────────────────────
const ConsortiumCard: React.FC<{
  consortium: Consortium;
  onEdit: (c: Consortium) => void;
  onDelete: (c: Consortium) => void;
}> = ({ consortium: c, onEdit, onDelete }) => {
  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const calc = calcConsortium(c);
  const isWaiting      = c.status === 'WAITING';
  const isContemplated = c.status === 'CONTEMPLATED';
  const isUsed         = c.status === 'CREDIT_USED';
  const isSettled      = c.status === 'SETTLED';

  const statusConfig = {
    WAITING:      { bg: 'bg-blue-50', border: 'border-blue-100', label: 'Aguardando', labelColor: 'bg-blue-50 text-blue-600 border-blue-100', icon: '⏳' },
    CONTEMPLATED: { bg: 'bg-amber-50', border: 'border-amber-200', label: 'Contemplado', labelColor: 'bg-amber-50 text-amber-600 border-amber-100', icon: '🎉' },
    CREDIT_USED:  { bg: 'bg-white', border: 'border-slate-100', label: 'Quitando', labelColor: 'bg-emerald-50 text-emerald-600 border-emerald-100', icon: '🏠' },
    SETTLED:      { bg: 'bg-white', border: 'border-slate-100', label: 'Quitado', labelColor: 'bg-slate-100 text-slate-500 border-slate-200', icon: '✅' }
  }[c.status];

  const assetIcon = c.asset_category === 'VEHICLE' ? <Car size={18} /> : <Building2 size={18} />;

  return (
    <div className={`${statusConfig.bg} border-2 ${statusConfig.border} rounded-3xl shadow-sm p-6 space-y-5 flex flex-col`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isWaiting ? 'bg-blue-100 text-blue-600' : isContemplated ? 'bg-amber-100 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
          {assetIcon}
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${statusConfig.labelColor}`}>
            {statusConfig.icon} {statusConfig.label}
          </span>
        </div>
      </div>

      {/* Nome e administradora */}
      <div>
        <h4 className="font-black text-slate-900 text-sm uppercase tracking-tight leading-tight">{c.name}</h4>
        <p className="text-[10px] text-slate-400 font-bold mt-0.5">{c.administrator_name || 'Administradora não informada'}</p>
        <p className="text-[10px] text-slate-400">Grupo {c.group_number} · Cota {c.quota_number}</p>
      </div>

      {/* ── WAITING: Aguardando Contemplação ── */}
      {isWaiting && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-blue-100 p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Carta de Crédito</p>
                <p className="font-black text-slate-900 text-lg">{fmt(c.credit_letter_value)}</p>
                <p className="text-[9px] text-slate-400">Índice: {c.credit_letter_index}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Parcela mensal</p>
                <p className="font-black text-slate-900">{fmt(calc.totalMonthly)}</p>
              </div>
            </div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between"><span className="text-slate-400">Fundo comum:</span><span className="font-bold">{fmt(calc.quotaMonthly)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Taxa de adm.:</span><span className="font-bold text-amber-600">{fmt(calc.adminMonthly)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Fundo reserva:</span><span className="font-bold text-blue-600">{fmt(calc.frMonthly)}</span></div>
            </div>
          </div>

          {/* Progresso */}
          <div>
            <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1.5">
              <span>{c.months_paid} de {c.total_months} parcelas pagas</span>
              <span>{calc.pctDone.toFixed(0)}% da carta acumulado</span>
            </div>
            <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${calc.pctDone}%` }} />
            </div>
          </div>

          {/* Próxima assembleia */}
          {calc.daysToAssembly !== null && (
            <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-bold ${calc.daysToAssembly <= 3 ? 'bg-rose-50 text-rose-600 border border-rose-100' : calc.daysToAssembly <= 7 ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
              <Calendar size={12} />
              Próxima assembleia em <strong>{calc.daysToAssembly} dia{calc.daysToAssembly !== 1 ? 's' : ''}</strong>
              {calc.nextAssembly && ` (dia ${calc.nextAssembly.getDate()}/${(calc.nextAssembly.getMonth()+1).toString().padStart(2,'0')})`}
            </div>
          )}

          {/* CET estimado */}
          <div className="text-[10px] text-slate-400 text-center">
            Custo efetivo estimado: <span className="font-black text-slate-600">{calc.cetMonthly.toFixed(3)}% a.m.</span>
            {' '}· Total pago até agora: <span className="font-black text-slate-600">{fmt(calc.totalPaid)}</span>
          </div>
        </div>
      )}

      {/* ── CONTEMPLATED: Carta em mãos ── */}
      {isContemplated && (
        <div className="space-y-3">
          {/* Countdown crítico da carta */}
          {calc.daysToCartaExpiry !== null && (
            <div className={`p-4 rounded-2xl border-2 text-center ${calc.daysToCartaExpiry <= 7 ? 'bg-rose-50 border-rose-300 animate-pulse' : calc.daysToCartaExpiry <= 30 ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-200'}`}>
              <AlertTriangle size={18} className={`mx-auto mb-1 ${calc.daysToCartaExpiry <= 7 ? 'text-rose-500' : calc.daysToCartaExpiry <= 30 ? 'text-amber-500' : 'text-emerald-500'}`} />
              <p className={`text-[10px] font-black uppercase tracking-widest ${calc.daysToCartaExpiry <= 30 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {calc.daysToCartaExpiry <= 0 ? '🚨 CARTA EXPIRADA!' : `Carta expira em ${calc.daysToCartaExpiry} dias`}
              </p>
              <p className={`text-xl font-black mt-0.5 ${calc.daysToCartaExpiry <= 7 ? 'text-rose-700' : 'text-slate-900'}`}>
                {calc.daysToCartaExpiry > 0 ? `${calc.daysToCartaExpiry} dias` : 'Vencida'}
              </p>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-amber-100 p-4 space-y-2">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Carta de Crédito Disponível</p>
            <p className="font-black text-slate-900 text-2xl">{fmt(c.credit_letter_value)}</p>
            {c.contemplated_at && (
              <p className="text-[10px] text-slate-400">
                Contemplado em {new Date(c.contemplated_at).toLocaleDateString('pt-BR')}
                {' '}por {c.contemplation_method === 'LOTTERY' ? 'sorteio' : c.contemplation_method === 'BID' ? 'lance' : 'método não informado'}
              </p>
            )}
          </div>

          {c.intended_asset_description && (
            <div className="text-[11px] text-slate-500 bg-white rounded-xl border border-slate-100 p-3">
              🎯 Bem pretendido: <strong>{c.intended_asset_description}</strong>
            </div>
          )}

          <div className="text-[10px] text-slate-400">
            Parcelas restantes: <strong className="text-slate-700">{calc.remaining}</strong> ·
            Total ainda a pagar: <strong className="text-slate-700">{fmt(calc.totalFuture)}</strong>
          </div>
        </div>
      )}

      {/* ── CREDIT_USED: Quitando ── */}
      {isUsed && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-2">
            <div className="flex justify-between">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Carta utilizada</p>
                <p className="font-black text-slate-900 text-lg">{fmt(c.credit_letter_value)}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Parcela mensal</p>
                <p className="font-black text-slate-900">{fmt(calc.totalMonthly)}</p>
              </div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1.5">
              <span>{c.months_paid} parcelas pagas</span>
              <span>{calc.pctDone.toFixed(0)}% quitado</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${calc.pctDone}%` }} />
            </div>
          </div>
          <div className="text-[10px] text-slate-400 text-center">
            {calc.remaining} parcelas restantes · {fmt(calc.totalFuture)} a pagar
          </div>
        </div>
      )}

      {/* ── SETTLED: Quitado ── */}
      {isSettled && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
          <Check size={24} className="text-emerald-500 mx-auto mb-2" />
          <p className="font-black text-emerald-700">Consórcio quitado!</p>
          <p className="text-[11px] text-emerald-600 mt-1">Total investido: {fmt(calc.totalPaid)}</p>
          <p className="text-[10px] text-emerald-500">Custo total de administração: {fmt(calc.adminCostTotal)}</p>
        </div>
      )}

      {/* Botões */}
      <div className="flex justify-between items-center pt-2 border-t border-slate-100 mt-auto">
        <button onClick={() => onEdit(c)} className="text-xs font-bold text-slate-400 hover:text-brand-600 uppercase tracking-widest transition-colors">
          <Edit2 size={12} className="inline mr-1" />Editar
        </button>
        <button onClick={() => onDelete(c)} className="text-xs font-bold text-slate-300 hover:text-rose-500 uppercase tracking-widest transition-colors">
          <Trash2 size={12} className="inline mr-1" />Remover
        </button>
      </div>
    </div>
  );
};

// ─── SEÇÃO PRINCIPAL ──────────────────────────────────────────────────────────
const ConsortiumSection: React.FC = () => {
  const { toast } = useToast();
  const [consortiums, setConsortiums] = useState<Consortium[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [editing, setEditing] = useState<Consortium | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Consortium | null>(null);

  const fetchConsortiums = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('consortiums')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setConsortiums(data || []);
    } catch (err: any) {
      toast(`Erro ao carregar consórcios: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConsortiums(); }, [fetchConsortiums]);

  const handleDelete = async (c: Consortium) => {
    if (!supabase) return;
    try {
      // Remove transações geradas pelo consórcio (soft delete)
      await supabase.from('transactions')
        .update({ is_deleted: true })
        .eq('consortium_id', c.id)
        .eq('is_paid', false);

      // Remove a liability vinculada (se existir e não tiver histórico de pagamentos reais)
      const liabId = (c as any).liability_id;
      if (liabId) {
        const { data: paidTxs } = await supabase.from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('liability_id', liabId)
          .eq('is_paid', true)
          .eq('is_deleted', false);
        if (!paidTxs || (paidTxs as any).length === 0) {
          await supabase.from('liabilities').delete().eq('id', liabId);
        }
      }

      const { error } = await supabase.from('consortiums').delete().eq('id', c.id);
      if (!error) {
        toast(`Consórcio "${c.name}" e suas parcelas removidos.`, 'success');
        fetchConsortiums();
      } else throw error;
    } catch (err: any) {
      toast(`Erro: ${err.message}`, 'error');
    }
    setConfirmDelete(null);
  };

  const waiting      = consortiums.filter(c => c.status === 'WAITING');
  const contemplated = consortiums.filter(c => c.status === 'CONTEMPLATED');
  const inProgress   = consortiums.filter(c => c.status === 'CREDIT_USED');
  const settled      = consortiums.filter(c => c.status === 'SETTLED');

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Modal de confirmação de exclusão */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white rounded-[28px] p-8 w-full max-w-sm shadow-2xl border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center"><AlertTriangle size={18} /></div>
              <h3 className="font-black text-slate-900">Remover Consórcio?</h3>
            </div>
            <p className="text-sm text-slate-500 mb-6">Remover <strong>"{confirmDelete.name}"</strong>? Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-widest">Cancelar</button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-bold text-xs uppercase tracking-widest hover:bg-rose-500">Remover</button>
            </div>
          </div>
        </div>
      )}

      {/* Wizard de cadastro/edição */}
      {showWizard && (
        <ConsortiumWizard
          editing={editing}
          onClose={() => { setShowWizard(false); setEditing(null); }}
          onSaved={() => { setShowWizard(false); setEditing(null); fetchConsortiums(); }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-slate-900 tracking-tight italic">Consórcios</h3>
          <p className="text-xs text-slate-400 mt-0.5">{consortiums.length} consórcio{consortiums.length !== 1 ? 's' : ''} cadastrado{consortiums.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowWizard(true); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform"
        >
          <Plus size={14} /> Novo Consórcio
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-brand-500" size={28} /></div>
      ) : consortiums.length === 0 ? (
        <div className="py-16 border-2 border-dashed border-slate-100 rounded-[32px] flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-3xl">🤝</div>
          <div>
            <p className="font-black text-slate-400 uppercase tracking-widest text-sm">Nenhum consórcio cadastrado</p>
            <p className="text-xs text-slate-300 mt-1">Adicione seus consórcios de imóvel, veículo ou outros bens.</p>
          </div>
          <button
            onClick={() => { setEditing(null); setShowWizard(true); }}
            className="px-6 py-3 bg-brand-600 text-white rounded-xl font-black text-xs uppercase tracking-widest"
          >
            Cadastrar Primeiro Consórcio
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Seção: Aguardando */}
          {waiting.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-400 rounded-full" /> Aguardando Contemplação ({waiting.length})
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {waiting.map(c => <ConsortiumCard key={c.id} consortium={c} onEdit={e => { setEditing(e); setShowWizard(true); }} onDelete={setConfirmDelete} />)}
              </div>
            </div>
          )}

          {/* Seção: Contemplados */}
          {contemplated.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" /> Contemplados — Use a carta! ({contemplated.length})
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {contemplated.map(c => <ConsortiumCard key={c.id} consortium={c} onEdit={e => { setEditing(e); setShowWizard(true); }} onDelete={setConfirmDelete} />)}
              </div>
            </div>
          )}

          {/* Seção: Em Quitação */}
          {inProgress.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full" /> Bem Adquirido — Quitando ({inProgress.length})
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {inProgress.map(c => <ConsortiumCard key={c.id} consortium={c} onEdit={e => { setEditing(e); setShowWizard(true); }} onDelete={setConfirmDelete} />)}
              </div>
            </div>
          )}

          {/* Seção: Quitados */}
          {settled.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-slate-300 rounded-full" /> Quitados ({settled.length})
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {settled.map(c => <ConsortiumCard key={c.id} consortium={c} onEdit={e => { setEditing(e); setShowWizard(true); }} onDelete={setConfirmDelete} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConsortiumSection;
