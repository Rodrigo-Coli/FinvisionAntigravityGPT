import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, Check, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { authHeaders } from '../../lib/apiClient';
import { useToast } from '../../contexts/ToastContext';
import { FieldLabel } from '../common/HelpTip';
import { DateInput } from '../common/DateInput';
import { missedCoupons, MISSED_GRACE_DAYS } from '../../lib/couponForecast';

// Juros previstos (Patrimônio › Investimentos).
// Lista as receitas previstas de juros/cupom (criadas pelo servidor a partir de
// "Frequência dos Juros" + "Próximo Pagamento" do título) e deixa dar como recebido
// com o valor exato. Regras em lib/couponForecast.ts e api/_lib/coupon-forecast.ts.
// Some quando não há nenhum previsto.

interface Forecast {
  id: string;
  date: string;
  amount: number;
  account_id: string | null;
  account_name: string | null;
  description: string | null;
  metadata: Record<string, any> | null;
}

const brl = (n: number) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const brDate = (s: string) => String(s || '').slice(0, 10).split('-').reverse().join('/');
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const parseMoney = (s: string) => {
  const t = String(s || '').trim().replace(/\s|R\$/g, '');
  const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t);
  return Number.isFinite(n) ? n : NaN;
};

export default function CouponForecastPanel({ onAssetsChanged }: { onAssetsChanged?: () => void }) {
  const { toast } = useToast();
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ value: '', date: todayIso(), accountId: '' });
  const [saving, setSaving] = useState(false);

  const call = async (body: any) => {
    const resp = await fetch('/api/investment-radar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(body)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Falha ao atualizar.');
    return data;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await call({ action: 'coupon_sync' });
      setForecasts(Array.isArray(data.forecasts) ? data.forecasts : []);
      if ((data.received || 0) + (data.linked || 0) > 0) onAssetsChanged?.();
    } catch {
      // Sem servidor (ex.: sem internet): a tela continua igual, sem o quadro.
      setForecasts([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!supabase || forecasts.length === 0 || accounts.length) return;
    (async () => {
      try {
        const { data } = await supabase.from('accounts').select('id, name, institution').order('name');
        setAccounts((data || []).map((a: any) => ({ id: a.id, label: a.institution || a.name || 'Conta' })));
      } catch { /* o select mostra só a conta prevista */ }
    })();
  }, [forecasts.length, accounts.length]);

  const startReceive = (f: Forecast) => {
    setEditing(f.id);
    setForm({
      value: Number(f.amount || 0).toFixed(2).replace('.', ','),
      date: String(f.date).slice(0, 10) <= todayIso() ? String(f.date).slice(0, 10) : todayIso(),
      accountId: f.account_id || ''
    });
  };

  const confirmReceive = async (f: Forecast) => {
    const value = parseMoney(form.value);
    if (!(value > 0)) { toast('Informe o valor que caiu na conta.', 'warning'); return; }
    setSaving(true);
    try {
      const data = await call({ action: 'coupon_receive', transactionId: f.id, value, date: form.date, accountId: form.accountId || f.account_id });
      toast(data.message || 'Juros recebidos.', 'success');
      setEditing(null);
      await load();
      onAssetsChanged?.();
    } catch (e: any) {
      toast(e?.message || 'Não foi possível registrar agora.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const dismiss = async (f: Forecast) => {
    if (!window.confirm('Dispensar este juro previsto? Use quando o banco confirmar que ele não será pago (ou se o título não paga juros nessa data). Ele some de Transações e não volta.')) return;
    setSaving(true);
    try {
      const data = await call({ action: 'coupon_dismiss', transactionId: f.id });
      toast(data.message || 'Dispensado.', 'success');
      await load();
    } catch (e: any) {
      toast(e?.message || 'Não foi possível dispensar agora.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading || forecasts.length === 0) return null;

  const missed = missedCoupons(forecasts, todayIso());
  const missedIds = new Set(missed.map(f => f.id));
  const upcoming = forecasts.filter(f => !missedIds.has(f.id));
  const total = upcoming.reduce((s, f) => s + Number(f.amount || 0), 0);

  const renderList = (list: Forecast[], isMissed: boolean) => (
    <>
          {list.map(f => {
            const late = String(f.date).slice(0, 10) < todayIso();
            const name = String(f.description || '').replace(/^Juros previstos - /, '').replace(/ \(estimado\)$/, '');
            return (
              <div key={f.id} className={`border rounded-xl p-3 ${isMissed ? 'border-rose-200 bg-rose-50/60' : 'border-slate-100'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{name}</p>
                    <p className="text-[11px] text-slate-500">
                      {late ? <span className="text-amber-600 font-bold">Era para {brDate(f.date)}</span> : <>Previsto para {brDate(f.date)}</>}
                      {' · '}{brl(f.amount)} estimado{f.account_name ? ` · cai em ${f.account_name}` : ''}
                    </p>
                  </div>
                  {editing !== f.id && (
                    <div className="flex gap-2">
                      {isMissed && (
                        <button type="button" disabled={saving} onClick={() => dismiss(f)}
                          className="px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-700 text-[11px] font-bold">
                          Dispensar
                        </button>
                      )}
                      <button type="button" onClick={() => startReceive(f)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-black flex items-center gap-1">
                        <Check size={12} /> Recebi
                      </button>
                    </div>
                  )}
                </div>
                {editing === f.id && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <FieldLabel label="Valor que caiu" help="O valor exato que entrou na conta (veja no extrato do banco). Pode ser diferente do estimado." />
                      <input inputMode="decimal" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" aria-label="Valor que caiu" />
                    </div>
                    <div>
                      <FieldLabel label="Data" help="O dia em que o dinheiro entrou na conta." />
                      <DateInput value={form.date} onChange={(e: any) => setForm({ ...form, date: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                    </div>
                    <div>
                      <FieldLabel label="Conta" help="Onde os juros caíram. O app soma no saldo desta conta." />
                      <select value={form.accountId} onChange={e => setForm({ ...form, accountId: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" aria-label="Conta">
                        {f.account_id && !accounts.some(a => a.id === f.account_id) && <option value={f.account_id}>{f.account_name || 'Conta prevista'}</option>}
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-3 flex gap-2 justify-end">
                      <button type="button" onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 flex items-center gap-1">
                        <X size={12} /> Cancelar
                      </button>
                      <button type="button" disabled={saving} onClick={() => confirmReceive(f)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-black flex items-center gap-1 disabled:opacity-60">
                        {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Confirmar recebimento
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
    </>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm" data-testid="coupon-forecast-panel">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 text-left">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarClock size={18} className="text-indigo-600 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-black text-slate-900">Juros previstos</h3>
            <p className="text-[11px] text-slate-500 font-medium">
              {missed.length > 0 && <span className="text-rose-600 font-bold">{missed.length} não recebido{missed.length > 1 ? 's' : ''} · </span>}
              {upcoming.length} pagamento{upcoming.length === 1 ? '' : 's'} a receber · {brl(total)} estimado{upcoming.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Cada juro previsto já está em <b>Transações</b> como receita em aberto, na conta onde ele cai. Quando o dinheiro cair, toque em <b>Recebi</b> e coloque o valor exato.
            Também pode dar baixa em Transações. Se o crédito vier pelo extrato do banco, ou se você lançar no Extrato do investimento, o app reconhece e tira o previsto, sem duplicar.
          </p>
          {missed.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 space-y-2" data-testid="missed-coupons">
              <p className="text-xs font-black text-rose-700 flex items-center gap-1.5"><AlertTriangle size={14} /> Juros não recebidos</p>
              <p className="text-[11px] text-rose-700/90 leading-relaxed">
                A data passou há mais de {MISSED_GRACE_DAYS} dias e o dinheiro não caiu. Pergunte ao banco ou à gerente se o pagamento foi adiado, suspenso ou caiu em outra conta. Se já caiu, toque em <b>Recebi</b>. Se o banco confirmou que não vai ser pago, toque em <b>Dispensar</b>. Este aviso só aparece quando um juro não chega.
              </p>
              {renderList(missed, true)}
            </div>
          )}
          {renderList(upcoming, false)}
        </div>
      )}
    </div>
  );
}
