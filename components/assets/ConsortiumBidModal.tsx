import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Gavel, AlertTriangle, Undo2 } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { getSessionUser } from '../../lib/session';
import { useToast } from '../../contexts/ToastContext';
import { DateUtils } from '../../lib/dateUtils';
import { DateInput } from '../common/DateInput';
import { sanitizeMoneyTyping, parseMoneyInput } from '../../lib/moneyInput';
import { BidInstallment, BidMode, planConsortiumBid } from '../../lib/consortiumBid';
import { useLedgerOptions, NO_ACCOUNT } from './useLedgerOptions';
import { syncConsortiumBalance } from '../../services/consortiumBalance.service';

/**
 * Registrar lance de consórcio.
 *
 * Grava o lance como despesa paga (sai da conta escolhida) e, conforme a
 * escolha da administradora, retira as últimas parcelas (reduz prazo) ou
 * recalcula o valor das parcelas futuras (reduz valor). Só mexe em parcela
 * futura, não paga e sem pagamento parcial. Parcela retirada é só ocultada
 * (is_deleted), nunca apagada, e o lance guarda o que mudou em
 * `consortiums.metadata.bids` — dá para desfazer o último lance.
 *
 * Lance embutido: parte do lance sai da própria carta de crédito, sem dinheiro
 * do bolso. Vira um lançamento SEM conta, marcado como capitalizado e
 * amortização — não mexe no saldo do banco nem conta como gasto do mês, mas
 * abate o saldo devedor junto com a parte paga por boleto. A carta liberada
 * (crédito líquido) fica = carta − embutido. Embutido só é cobrado quando o
 * lance contempla, por isso ele marca a cota como contemplada.
 */

interface BidConsortium {
  id: string;
  name: string;
  liability_id: string | null;
  metadata: Record<string, any>;
  status?: string;
  credit_letter_value?: number | null;
  contemplated_at?: string | null;
  contemplation_method?: string | null;
}

// Campos que a contemplação por lance grava no consórcio (e o desfazer devolve).
const CONTEMPLATION_META_KEYS = ['bid_amount', 'bid_type', 'embedded_bid_amount', 'net_credit'] as const;

interface ContemplationSnapshot {
  status: string | null;
  contemplated_at: string | null;
  contemplation_method: string | null;
  meta: Record<string, any>;
}

interface BidRecord {
  transaction_id: string;
  /** Lançamentos do lance (boleto e/ou embutido). Lances antigos só têm `transaction_id`. */
  transaction_ids?: string[];
  cash_amount?: number;
  embedded_amount?: number;
  /** Situação do consórcio antes de o lance contemplar (para desfazer). */
  contemplation?: ContemplationSnapshot;
  date: string;
  amount: number;
  mode: BidMode;
  account_id: string | null;
  removed_ids: string[];
  previous_amounts: { id: string; amount: number }[];
  previous_installment_amount: number | null;
  new_installment_amount: number;
  remaining_count: number;
  created_at: string;
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDate = (iso: string) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '';
const NOT_DELETED = 'is_deleted.is.null,is_deleted.eq.false';

// Passivo pela regra de mercado (lib/consortiumBalance): o lance é uma saída
// paga vinculada ao passivo, então a sincronização já o desconta do saldo
// devedor — e desfazer devolve. Aqui só se grava o novo valor da parcela.
async function refreshConsortiumLiability(liabilityId: string, installmentAmount?: number | null) {
  await syncConsortiumBalance(liabilityId);
  if (installmentAmount !== undefined && installmentAmount !== null) {
    const { error } = await supabase!.from('liabilities')
      .update({ installment_amount: installmentAmount, updated_at: new Date().toISOString() })
      .eq('id', liabilityId);
    if (error) throw error;
  }
}

function clearFinanceCaches(userId: string) {
  try {
    localStorage.removeItem(`finvision_cached_raw_txs_${userId}`);
    localStorage.removeItem(`finvision_cached_projections_${userId}`);
    localStorage.removeItem('finvision_cached_home_txs');
    localStorage.removeItem('finvision_cached_summary');
  } catch { /* cache local é opcional */ }
}

const ConsortiumBidModal: React.FC<{
  consortium: BidConsortium;
  onClose: () => void;
  onSaved: () => void;
}> = ({ consortium, onClose, onSaved }) => {
  const { toast } = useToast();
  const ledger = useLedgerOptions(true);
  const [installments, setInstallments] = useState<BidInstallment[] | null>(null);
  const [liabilityAmount, setLiabilityAmount] = useState<number | null>(null);
  const [liabilityBalance, setLiabilityBalance] = useState<number | null>(null);
  const [amountText, setAmountText] = useState('');
  const [embeddedText, setEmbeddedText] = useState('');
  const [contemplatedChoice, setContemplatedChoice] = useState(false);
  const [date, setDate] = useState(DateUtils.formatToISODate());
  const [accountId, setAccountId] = useState('');
  const [mode, setMode] = useState<BidMode>('REDUCE_TERM');
  const [overrideText, setOverrideText] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);

  const bids: BidRecord[] = Array.isArray(consortium.metadata?.bids) ? consortium.metadata.bids : [];
  const lastBid = bids.length ? bids[bids.length - 1] : null;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase || !consortium.liability_id) { setInstallments([]); return; }
      await syncConsortiumBalance(consortium.liability_id);
      const [txRes, liabRes] = await Promise.all([
        supabase.from('transactions')
          .select('id, date, amount, is_paid, paid_amount, metadata')
          .eq('liability_id', consortium.liability_id)
          .or(NOT_DELETED)
          .order('date', { ascending: true }),
        supabase.from('liabilities').select('installment_amount, remaining_balance').eq('id', consortium.liability_id).maybeSingle()
      ]);
      if (!alive) return;
      if (txRes.error) {
        toast(`Erro ao carregar parcelas: ${txRes.error.message}`, 'error');
        setInstallments([]);
        return;
      }
      setInstallments((txRes.data || [])
        // Lance anterior não é parcela.
        .filter((t: any) => t.metadata?.type !== 'consortium_bid')
        .map((t: any) => ({ id: t.id, date: String(t.date).slice(0, 10), amount: Number(t.amount) || 0, isPaid: !!t.is_paid, paidAmount: Number(t.paid_amount) || 0 })));
      setLiabilityAmount(liabRes.data ? Number(liabRes.data.installment_amount) || null : null);
      setLiabilityBalance(liabRes.data ? Number(liabRes.data.remaining_balance) || 0 : null);
    })();
    return () => { alive = false; };
  }, [consortium.liability_id]);

  const cashAmount = parseMoneyInput(amountText);
  const embeddedAmount = parseMoneyInput(embeddedText);
  const bidAmount = Math.round((cashAmount + embeddedAmount) * 100) / 100;
  const isWaiting = !consortium.status || consortium.status === 'WAITING';
  // Embutido só é cobrado quando o lance contempla.
  const contemplates = isWaiting && (contemplatedChoice || embeddedAmount > 0);
  const carta = Number(consortium.credit_letter_value) || 0;
  const netCredit = Math.max(0, Math.round((carta - embeddedAmount) * 100) / 100);
  const embeddedPct = carta > 0 ? (embeddedAmount / carta) * 100 : 0;
  const override = overrideText.trim()
    ? (mode === 'REDUCE_TERM' ? parseInt(overrideText.replace(/\D/g, ''), 10) : parseMoneyInput(overrideText))
    : null;

  const plan = useMemo(() => {
    if (!installments) return null;
    return planConsortiumBid({
      installments,
      bidAmount,
      bidDate: date,
      mode,
      overrideRemainingCount: mode === 'REDUCE_TERM' && override !== null && !Number.isNaN(override) ? override : null,
      overrideInstallmentAmount: mode === 'REDUCE_INSTALLMENT' && override !== null && override > 0 ? override : null
    });
  }, [installments, bidAmount, date, mode, override]);

  const futureTotal = plan ? plan.eligible.reduce((s, t) => s + t.amount, 0) : 0;
  const removedSet = new Set(plan?.deleteIds || []);
  const lastKept = plan ? plan.eligible.filter(t => !removedSet.has(t.id)).slice(-1)[0] : undefined;
  const changes = plan ? plan.deleteIds.length + plan.updates.length : 0;

  const handleSave = async () => {
    if (!supabase || !plan || saving || !consortium.liability_id) return;
    if (bidAmount <= 0) { toast('Informe o valor do lance.', 'warning'); return; }
    if (!date) { toast('Informe a data do lance.', 'warning'); return; }
    if (cashAmount > 0 && !accountId && ledger.accounts.length > 0) { toast('Escolha a conta de onde saiu o boleto (ou "Sem conta").', 'warning'); return; }
    if (mode === 'REDUCE_INSTALLMENT' && overrideText.trim() && !(override && override > 0)) {
      toast('Novo valor da parcela inválido.', 'warning'); return;
    }
    setSaving(true);
    const bidTxIds: string[] = [];
    let removedIds: string[] = [];
    let previousAmounts: { id: string; amount: number }[] = [];
    let metadataSaved = false;
    try {
      const user = await getSessionUser(supabase);
      if (!user) throw new Error('Sessão expirada.');
      const accId = accountId && accountId !== NO_ACCOUNT ? accountId : null;
      const nowIso = new Date().toISOString();
      const newAmount = plan.updates.length ? plan.newInstallmentAmount : undefined;
      // Fixa o saldo atual como referência ANTES do lance existir — assim o
      // lance entra como amortização (ver lib/consortiumBalance).
      await syncConsortiumBalance(consortium.liability_id);

      // 1. O lance, vinculado ao passivo (entra no extrato do consórcio).
      const bidMeta = {
        type: 'consortium_bid',
        consortium_id: consortium.id,
        bid_mode: mode,
        removed_installments: plan.deleteIds.length,
        new_installment_amount: newAmount ?? null
      };
      if (cashAmount > 0) {
        // Parte do bolso (boleto): despesa paga, sai da conta escolhida.
        const { data, error } = await supabase.from('transactions').insert({
          user_id: user.id,
          account_id: accId,
          account_name: accId ? ledger.accountName(accId) : null,
          description: `Lance - ${consortium.name}`,
          amount: cashAmount,
          date,
          type: 'EXPENSE',
          category: 'Consórcio',
          subcategory: 'Lance',
          is_paid: true,
          paid_amount: cashAmount,
          paid_at: date,
          is_deleted: false,
          liability_id: consortium.liability_id,
          consortium_id: consortium.id,
          metadata: { ...bidMeta, bid_part: 'CASH' }
        }).select('id').single();
        if (error) throw error;
        bidTxIds.push(data.id);
      }
      if (embeddedAmount > 0) {
        // Parte embutida (da própria carta): sem conta, capitalizada e
        // amortização — fora dos gastos do mês e do saldo do banco, mas abate
        // o saldo devedor.
        const { data, error } = await supabase.from('transactions').insert({
          user_id: user.id,
          account_id: null,
          account_name: null,
          description: `Lance embutido - ${consortium.name}`,
          amount: embeddedAmount,
          date,
          type: 'EXPENSE',
          category: 'Consórcio',
          subcategory: 'Lance embutido',
          is_paid: true,
          paid_amount: embeddedAmount,
          paid_at: date,
          is_deleted: false,
          is_amortization: true,
          liability_id: consortium.liability_id,
          consortium_id: consortium.id,
          metadata: { ...bidMeta, bid_part: 'EMBEDDED', isCapitalized: true }
        }).select('id').single();
        if (error) throw error;
        bidTxIds.push(data.id);
      }

      // 2. As parcelas. `is_paid = false` de novo aqui: se alguma foi paga
      // depois da prévia, ela não é tocada. Guarda só as que mudaram de fato.
      if (plan.deleteIds.length) {
        const { data, error } = await supabase.from('transactions')
          .update({ is_deleted: true })
          .in('id', plan.deleteIds).eq('is_paid', false).eq('user_id', user.id)
          .select('id');
        if (error) throw error;
        removedIds = (data || []).map((r: any) => r.id);
      }
      if (plan.updates.length) {
        const { data, error } = await supabase.from('transactions')
          .update({ amount: plan.newInstallmentAmount })
          .in('id', plan.updates.map(u => u.id)).eq('is_paid', false).eq('user_id', user.id)
          .select('id');
        if (error) throw error;
        const changed = new Set((data || []).map((r: any) => r.id));
        previousAmounts = plan.eligible.filter(t => changed.has(t.id)).map(t => ({ id: t.id, amount: t.amount }));
      }

      // 3. Histórico do lance (para desfazer) e, por último, o passivo.
      const snapshot: ContemplationSnapshot | undefined = contemplates ? {
        status: consortium.status ?? null,
        contemplated_at: consortium.contemplated_at ?? null,
        contemplation_method: consortium.contemplation_method ?? null,
        meta: Object.fromEntries(CONTEMPLATION_META_KEYS.filter(k => k in (consortium.metadata || {})).map(k => [k, consortium.metadata[k]]))
      } : undefined;
      const record: BidRecord = {
        transaction_id: bidTxIds[0],
        transaction_ids: bidTxIds,
        cash_amount: cashAmount,
        embedded_amount: embeddedAmount,
        ...(snapshot ? { contemplation: snapshot } : {}),
        date,
        amount: bidAmount,
        mode,
        account_id: accId,
        removed_ids: removedIds,
        previous_amounts: previousAmounts,
        previous_installment_amount: liabilityAmount,
        new_installment_amount: plan.newInstallmentAmount,
        remaining_count: plan.remainingCount,
        created_at: nowIso
      };
      const { error: metaErr } = await supabase.from('consortiums')
        .update({
          metadata: {
            ...(consortium.metadata || {}),
            bids: [...bids, record],
            ...(contemplates ? {
              bid_amount: bidAmount,
              bid_type: embeddedAmount > 0 ? (cashAmount > 0 ? 'MIXED' : 'EMBEDDED') : 'FREE',
              embedded_bid_amount: embeddedAmount,
              net_credit: netCredit
            } : {})
          },
          ...(contemplates ? { status: 'CONTEMPLATED', contemplated_at: date, contemplation_method: 'BID' } : {}),
          updated_at: nowIso
        })
        .eq('id', consortium.id);
      if (metaErr) throw metaErr;
      metadataSaved = true;
      await refreshConsortiumLiability(consortium.liability_id, newAmount);

      if (accId) {
        try { await supabase.rpc('recalculate_account_balance', { p_account_id: accId }); } catch { /* o gatilho do banco também recalcula */ }
      }
      clearFinanceCaches(user.id);
      toast((removedIds.length
        ? `Lance registrado: ${removedIds.length} parcela(s) retirada(s).`
        : previousAmounts.length
          ? `Lance registrado: parcelas passam a ${fmt(plan.newInstallmentAmount)}.`
          : 'Lance registrado. Nenhuma parcela mudou.')
        + (contemplates ? ' Cota marcada como contemplada.' : ''), 'success');
      onSaved();
    } catch (err: any) {
      // Falhou no meio: desfaz o que já tinha sido gravado, na ordem inversa —
      // não fica lance pago sem abatimento nem parcela mexida sem lance.
      try {
        if (metadataSaved) {
          await supabase.from('consortiums').update({
            metadata: consortium.metadata || {},
            ...(contemplates ? {
              status: consortium.status ?? 'WAITING',
              contemplated_at: consortium.contemplated_at ?? null,
              contemplation_method: consortium.contemplation_method ?? 'UNKNOWN'
            } : {})
          }).eq('id', consortium.id);
        }
        const byAmount = new Map<number, string[]>();
        previousAmounts.forEach(p => byAmount.set(p.amount, [...(byAmount.get(p.amount) || []), p.id]));
        for (const [amount, ids] of byAmount) {
          await supabase.from('transactions').update({ amount }).in('id', ids).eq('is_paid', false);
        }
        if (removedIds.length) {
          await supabase.from('transactions').update({ is_deleted: false }).in('id', removedIds).eq('is_paid', false);
        }
        if (bidTxIds.length) {
          await supabase.from('transactions').update({ is_deleted: true }).in('id', bidTxIds);
        }
        if (consortium.liability_id) await syncConsortiumBalance(consortium.liability_id);
      } catch { /* segue o erro original */ }
      toast(`Erro ao registrar lance: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = async () => {
    if (!supabase || !lastBid || saving || !consortium.liability_id) return;
    setSaving(true);
    try {
      const user = await getSessionUser(supabase);
      if (!user) throw new Error('Sessão expirada.');
      const nowIso = new Date().toISOString();
      if (lastBid.removed_ids?.length) {
        const { error } = await supabase.from('transactions')
          .update({ is_deleted: false })
          .in('id', lastBid.removed_ids).eq('is_paid', false).eq('user_id', user.id);
        if (error) throw error;
      }
      // Volta cada parcela ao valor de antes (agrupado por valor). Parcela já
      // paga depois do lance fica como está.
      const byAmount = new Map<number, string[]>();
      (lastBid.previous_amounts || []).forEach(p => byAmount.set(p.amount, [...(byAmount.get(p.amount) || []), p.id]));
      for (const [amount, ids] of byAmount) {
        const { error } = await supabase.from('transactions')
          .update({ amount })
          .in('id', ids).eq('is_paid', false).eq('user_id', user.id);
        if (error) throw error;
      }
      const lastIds = lastBid.transaction_ids?.length ? lastBid.transaction_ids : [lastBid.transaction_id];
      const { error: bidErr } = await supabase.from('transactions')
        .update({ is_deleted: true })
        .in('id', lastIds).eq('user_id', user.id);
      if (bidErr) throw bidErr;

      await refreshConsortiumLiability(
        consortium.liability_id,
        lastBid.mode === 'REDUCE_INSTALLMENT' ? lastBid.previous_installment_amount : undefined
      );
      const restoredMeta: Record<string, any> = { ...(consortium.metadata || {}), bids: bids.slice(0, -1) };
      const snap = lastBid.contemplation;
      if (snap) {
        // A cota volta para a situação de antes do lance que a contemplou.
        CONTEMPLATION_META_KEYS.forEach(k => {
          if (snap.meta && k in snap.meta) restoredMeta[k] = snap.meta[k];
          else delete restoredMeta[k];
        });
      }
      const { error: consErr } = await supabase.from('consortiums')
        .update({
          metadata: restoredMeta,
          ...(snap ? {
            status: snap.status || 'WAITING',
            contemplated_at: snap.contemplated_at,
            contemplation_method: snap.contemplation_method || 'UNKNOWN'
          } : {}),
          updated_at: nowIso
        })
        .eq('id', consortium.id);
      if (consErr) throw consErr;
      if (lastBid.account_id) {
        try { await supabase.rpc('recalculate_account_balance', { p_account_id: lastBid.account_id }); } catch { /* o gatilho do banco também recalcula */ }
      }
      clearFinanceCaches(user.id);
      toast('Lance desfeito: parcelas voltaram como estavam.', 'success');
      onSaved();
    } catch (err: any) {
      toast(`Erro ao desfazer lance: ${err.message}`, 'error');
    } finally {
      setSaving(false);
      setConfirmUndo(false);
    }
  };

  const inp = 'w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-brand-500 transition-all';
  const label = 'block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className="bg-white rounded-[28px] w-full max-w-lg shadow-2xl border border-slate-100 max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center"><Gavel size={18} /></div>
            <div>
              <h3 className="font-black text-slate-900">Registrar lance</h3>
              <p className="text-[11px] text-slate-400">{consortium.name}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} className="p-2 text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {!consortium.liability_id ? (
            <p className="text-sm text-slate-500">Este consórcio não tem parcelas vinculadas — não dá para recalcular automaticamente.</p>
          ) : installments === null ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-brand-500" size={24} /></div>
          ) : (
            <>
              {lastBid && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-500 space-y-2">
                  <p>
                    Último lance: <strong className="text-slate-700">{fmt(lastBid.amount)}</strong>
                    {(lastBid.embedded_amount || 0) > 0 && <> ({fmt(lastBid.embedded_amount || 0)} embutido)</>} em {fmtDate(lastBid.date)} —{' '}
                    {lastBid.mode === 'REDUCE_TERM'
                      ? `${lastBid.removed_ids?.length || 0} parcela(s) retirada(s)`
                      : `parcelas para ${fmt(lastBid.new_installment_amount)}`}
                  </p>
                  {confirmUndo ? (
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-rose-600">Desfazer este lance?</span>
                      <button onClick={handleUndo} disabled={saving} className="px-3 py-1 rounded-lg bg-rose-600 text-white font-bold">Sim, desfazer</button>
                      <button onClick={() => setConfirmUndo(false)} disabled={saving} className="px-3 py-1 rounded-lg border border-slate-200 font-bold">Não</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmUndo(true)} disabled={saving} className="flex items-center gap-1 font-bold text-slate-500 hover:text-rose-600">
                      <Undo2 size={12} /> Desfazer último lance
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Pago do bolso / boleto (R$)</label>
                  <input className={inp} inputMode="decimal" placeholder="0,00" value={amountText} onChange={e => setAmountText(sanitizeMoneyTyping(e.target.value))} />
                </div>
                <div>
                  <label className={label}>Lance embutido (R$)</label>
                  <input className={inp} inputMode="decimal" placeholder="0,00" value={embeddedText} onChange={e => setEmbeddedText(sanitizeMoneyTyping(e.target.value))} />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 -mt-2">
                Embutido = parte do lance que sai da própria carta de crédito (sem dinheiro do bolso). Deixe em branco se não usou.
                {bidAmount > 0 && <> Lance total: <strong className="text-slate-600">{fmt(bidAmount)}</strong>.</>}
              </p>

              <div>
                <label className={label}>Data do lance</label>
                <DateInput className={inp} value={date} onChange={e => setDate(e.target.value)} />
              </div>

              {cashAmount > 0 && <div>
                <label className={label}>Conta que pagou o boleto</label>
                <select className={inp} value={accountId} onChange={e => setAccountId(e.target.value)}>
                  <option value="">Selecione a conta…</option>
                  {ledger.accounts.map(a => <option key={a.id} value={a.id}>{a.institution}</option>)}
                  <option value={NO_ACCOUNT}>Sem conta (não mexe no saldo)</option>
                </select>
              </div>}

              {isWaiting && (
                <label className={`flex items-start gap-3 p-3 rounded-xl border-2 ${contemplates ? 'border-emerald-300 bg-emerald-50' : 'border-slate-100'} ${embeddedAmount > 0 ? '' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={contemplates}
                    disabled={embeddedAmount > 0}
                    onChange={e => setContemplatedChoice(e.target.checked)}
                  />
                  <span>
                    <span className="block text-xs font-black text-slate-900">Este lance contemplou a cota</span>
                    <span className="block text-[10px] text-slate-500 leading-snug">
                      {embeddedAmount > 0
                        ? 'Lance embutido só é cobrado quando contempla — a cota passa para Contemplado.'
                        : 'Marque se o lance foi vencedor: a cota passa para Contemplado por lance, nesta data.'}
                    </span>
                  </span>
                </label>
              )}

              <div>
                <label className={label}>O que a administradora fez com o lance?</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: 'REDUCE_TERM', title: 'Reduzir prazo', desc: 'Saem as últimas parcelas; o valor da parcela continua.' },
                    { value: 'REDUCE_INSTALLMENT', title: 'Reduzir parcela', desc: 'O prazo continua; as parcelas futuras ficam menores.' }
                  ] as { value: BidMode; title: string; desc: string }[]).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setMode(opt.value); setOverrideText(''); }}
                      className={`text-left p-3 rounded-xl border-2 transition-all ${mode === opt.value ? 'border-brand-500 bg-brand-50' : 'border-slate-100 hover:border-slate-200'}`}
                    >
                      <p className="text-xs font-black text-slate-900">{opt.title}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={label}>
                  {mode === 'REDUCE_TERM' ? 'Parcelas que sobram (opcional)' : 'Novo valor da parcela (opcional)'}
                </label>
                <input
                  className={inp}
                  inputMode={mode === 'REDUCE_TERM' ? 'numeric' : 'decimal'}
                  placeholder={mode === 'REDUCE_TERM' ? 'Ex.: 42' : 'Ex.: 1.234,56'}
                  value={overrideText}
                  onChange={e => setOverrideText(mode === 'REDUCE_TERM' ? e.target.value.replace(/\D/g, '') : sanitizeMoneyTyping(e.target.value))}
                />
                <p className="text-[10px] text-slate-400 mt-1">Se a administradora informou o número exato, use-o aqui — ele vale mais que a estimativa.</p>
              </div>

              {plan && (
                <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-100 space-y-2 text-[11px] text-slate-600">
                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Prévia</p>
                  <p>
                    Parcelas futuras em aberto: <strong>{plan.eligible.length}</strong> ({fmt(futureTotal)})
                    {plan.eligible.length > 0 && <> — de {fmtDate(plan.eligible[0].date)} a {fmtDate(plan.eligible[plan.eligible.length - 1].date)}</>}
                  </p>
                  {bidAmount > 0 && mode === 'REDUCE_TERM' && (
                    <p>
                      Saem <strong>{plan.deleteIds.length}</strong> parcela(s) do fim. Ficam <strong>{plan.remainingCount}</strong>
                      {lastKept && <>, a última em <strong>{fmtDate(lastKept.date)}</strong></>}.
                    </p>
                  )}
                  {bidAmount > 0 && mode === 'REDUCE_INSTALLMENT' && plan.updates.length > 0 && (
                    <p>
                      As <strong>{plan.updates.length}</strong> parcelas futuras passam a <strong>{fmt(plan.newInstallmentAmount)}</strong>.
                    </p>
                  )}
                  {bidAmount > 0 && liabilityBalance !== null && (
                    <p>
                      Saldo devedor: <strong>{fmt(liabilityBalance)}</strong> → <strong>{fmt(Math.max(0, liabilityBalance - bidAmount))}</strong>
                    </p>
                  )}
                  {embeddedAmount > 0 && carta > 0 && (
                    <p>
                      Crédito líquido: <strong>{fmt(carta)}</strong> − <strong>{fmt(embeddedAmount)}</strong> embutido = <strong>{fmt(netCredit)}</strong>
                      {' '}({embeddedPct.toFixed(1).replace('.', ',')}% da carta embutido)
                    </p>
                  )}
                  {embeddedPct > 30 && (
                    <p className="text-[10px] text-slate-500">Acima de 30% da carta — confira se é o limite do seu grupo.</p>
                  )}
                  {liabilityBalance !== null && futureTotal > 0 && liabilityBalance - futureTotal > 1 && (
                    <p className="text-[10px] text-slate-500">
                      As parcelas cadastradas somam menos que o saldo devedor — a estimativa pode não bater com a administradora. Se ela informou o número exato, preencha o campo acima.
                    </p>
                  )}
                  <p className="text-[10px] text-slate-400">Parcelas pagas, vencidas até a data do lance ou com pagamento parcial não mudam.</p>
                  {plan.warnings.map((w, i) => (
                    <p key={i} className="flex items-start gap-1.5 text-amber-700 font-bold"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{w}</p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-3 p-6 pt-4 border-t border-slate-100">
          <button onClick={onClose} disabled={saving} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-widest">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || !plan || !consortium.liability_id || bidAmount <= 0}
            className="flex-1 py-3 rounded-xl bg-brand-600 text-white font-bold text-xs uppercase tracking-widest hover:bg-brand-500 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {changes > 0 ? 'Registrar e recalcular' : 'Registrar lance'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConsortiumBidModal;
