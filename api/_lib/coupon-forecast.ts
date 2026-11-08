import { createClient } from '@supabase/supabase-js';
import {
  wantsForecast, nextCycle, estimateCoupon, isLikelyCouponCredit, nameTokens, inWindow, addMonthsIso,
  FORECAST_PREFIX, missedCoupons, cycleOf
} from '../../lib/couponForecast.js';
import type { Indexes, Movement } from '../../lib/curveProjection.js';
import { refreshAssetCurve } from './curve-projection.js';

// Juros previstos (servidor).
// Para cada título com "Próximo Pagamento" de juros, mantém UMA receita prevista em
// aberto nas Transações (na conta onde os juros caem) e, quando ela é resolvida:
//  · dada como recebida (Transações, Conciliar, "Recebi" no Patrimônio) → vira o juro
//    de verdade: entra no extrato do investimento (Juros/Cupom recebido) já ligado;
//  · o juro veio por outro caminho (lançado no Extrato do investimento, ou o crédito
//    entrou pelo extrato do banco) → o previsto sai e o crédito do banco é ligado;
// e então cria o próximo. Nada que a pessoa lançou é apagado ou alterado, a não ser
// a ligação do crédito do banco ao investimento (o que antes era feito à mão).

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

const todayStr = () => new Date().toISOString().slice(0, 10);
const day = (s: any) => String(s || '').slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;
const br = (d: string) => d.split('-').reverse().join('/');
const COUPON_OUT_NOTE = 'Juros pagos na conta (saem do valor do título)';

export interface CouponSyncResult { created: number; received: number; linked: number; superseded: number }

async function categoryId(userId: string): Promise<string | null> {
  try {
    const { data } = await supabase.from('categories').select('id, name').eq('user_id', userId);
    const hit = (data || []).find((c: any) => String(c.name || '').trim().toLowerCase() === 'investimentos');
    if (hit) return hit.id;
    const { data: created } = await supabase.from('categories')
      .insert({ user_id: userId, name: 'Investimentos', type: 'INCOME', color: 'bg-indigo-50 text-indigo-600' })
      .select('id').maybeSingle();
    return (created as any)?.id || null;
  } catch { return null; }
}

async function recalc(accountId?: string | null) {
  if (!accountId) return;
  try { await supabase.rpc('recalculate_account_balance', { p_account_id: accountId }); } catch { /* o próximo recálculo acerta */ }
}

/** Registra o juro no extrato do investimento, ligado ao lançamento da conta. */
async function recordCoupon(asset: any, tx: any, amount: number, date: string, note: string) {
  const { data: mv } = await supabase.from('investment_movements').insert({
    user_id: asset.user_id, asset_id: asset.id, movement_type: 'RENDIMENTO_MENSAL', amount, movement_date: date,
    linked_transaction_id: tx.id, is_projected: false, notes: note
  }).select('id').maybeSingle();
  // Título com curva automática: o juro acumulava dentro do valor; pago na conta, sai dele.
  if (asset.metadata?.autoCurve) {
    await supabase.from('investment_movements').insert({
      user_id: asset.user_id, asset_id: asset.id, movement_type: 'AJUSTE_MANUAL', amount: -Math.abs(amount),
      movement_date: date, is_projected: false, notes: COUPON_OUT_NOTE
    });
  }
  return (mv as any)?.id || null;
}

async function loadIndexes(userId: string): Promise<Indexes> {
  let cdiAnnual = 14, ipcaAnnual = 4.5;
  try {
    const { data } = await supabase.from('user_settings').select('market_indexes').eq('user_id', userId).maybeSingle();
    if (Number((data as any)?.market_indexes?.cdi) > 0) cdiAnnual = Number((data as any).market_indexes.cdi);
    if (Number((data as any)?.market_indexes?.ipca) > 0) ipcaAnnual = Number((data as any).market_indexes.ipca);
  } catch { /* padrões */ }
  return { cdiAnnual, ipcaAnnual };
}

/** Sincroniza os juros previstos de um título. */
export async function syncAssetCoupons(asset: any, idx: Indexes, today = todayStr()): Promise<CouponSyncResult> {
  const out: CouponSyncResult = { created: 0, received: 0, linked: 0, superseded: 0 };
  const meta = asset.metadata || {};
  if (!wantsForecast(meta)) return out;

  const { data: movData } = await supabase.from('investment_movements')
    .select('id, movement_type, amount, movement_date, notes, linked_transaction_id')
    .eq('asset_id', asset.id);
  const movements = (movData || []) as (Movement & { linked_transaction_id?: string | null })[];
  const coupons = movements.filter(m => m.movement_type === 'RENDIMENTO_MENSAL');

  const { data: fData } = await supabase.from('transactions')
    .select('id, date, amount, paid_amount, paid_at, is_paid, is_deleted, account_id, description, metadata')
    .eq('user_id', asset.user_id)
    .eq('metadata->>expected_coupon_asset_id', asset.id);
  const forecasts = (fData || []) as any[];

  // Conta onde os juros caem: a escolhida no cadastro, senão a do último juro, senão a corretora.
  const lastCoupon = [...coupons].sort((a, b) => b.movement_date.localeCompare(a.movement_date))[0];
  let payout: string | null = meta.couponAccountId || null;
  if (!payout && lastCoupon?.linked_transaction_id) {
    const { data: lt } = await supabase.from('transactions').select('account_id').eq('id', lastCoupon.linked_transaction_id).maybeSingle();
    payout = (lt as any)?.account_id || null;
  }
  payout = payout || meta.brokerAccountId || null;

  let changedValue = false;
  const open = forecasts.filter(f => !f.is_deleted && f.metadata?.expected_coupon_state === 'open');

  for (const f of open) {
    const cycle = day(f.metadata?.expected_coupon_cycle || f.date);
    const paidAmt = Math.abs(Number(f.paid_amount) || 0);

    // 1. Dado como recebido (inteiro ou parcial) em qualquer tela.
    if (f.is_paid || paidAmt > 0.005) {
      const amount = round2(paidAmt || Math.abs(Number(f.amount) || 0));
      const date = day(f.paid_at || f.date);
      const mvId = await recordCoupon(asset, f, amount, date, 'Juros recebidos (previsto dado como recebido)');
      await supabase.from('transactions').update({
        amount, is_paid: true, paid_amount: amount, paid_at: f.paid_at || date,
        description: String(f.description || '').replace(`${FORECAST_PREFIX} - `, 'Juros recebidos - ').replace(' (estimado)', ''),
        metadata: { ...(f.metadata || {}), expected_coupon_state: 'received', linked_asset_id: asset.id, investment_movement_id: mvId, type: 'investment_rendimento_mensal' }
      }).eq('id', f.id);
      await recalc(f.account_id);
      out.received += 1; changedValue = true;
      coupons.push({ movement_type: 'RENDIMENTO_MENSAL', amount, movement_date: date });
      // Sobra de pagamento parcial com "gerar diferença" (mesmo ciclo): o juro já foi recebido.
      for (const other of open) {
        if (other.id !== f.id && !other.is_paid && day(other.metadata?.expected_coupon_cycle || other.date) === cycle) {
          await supabase.from('transactions').update({ is_deleted: true, metadata: { ...(other.metadata || {}), expected_coupon_state: 'superseded' } }).eq('id', other.id);
          other.is_paid = true;
        }
      }
      f.metadata = { ...(f.metadata || {}), expected_coupon_state: 'received' };
      continue;
    }

    // 2. O juro entrou pelo Extrato do investimento (lançado à mão).
    const manual = coupons.find(m => inWindow(cycle, m.movement_date) && m.linked_transaction_id !== f.id);
    if (manual) {
      await supabase.from('transactions').update({ is_deleted: true, metadata: { ...(f.metadata || {}), expected_coupon_state: 'superseded', superseded_by_movement: manual.id || null } }).eq('id', f.id);
      f.metadata = { ...(f.metadata || {}), expected_coupon_state: 'superseded' };
      out.superseded += 1;
      continue;
    }

    // 3. O crédito chegou pelo extrato do banco (Conciliar/importação) na conta dos juros.
    const acc = f.account_id || payout;
    if (acc) {
      const { data: credits } = await supabase.from('transactions')
        .select('id, date, amount, paid_amount, description, type, is_paid, metadata')
        .eq('account_id', acc).eq('is_deleted', false).eq('is_paid', true).eq('type', 'INCOME')
        .gte('date', addMonthsIso(cycle, -1)).lte('date', `${addMonthsIso(cycle, 1)} 23:59:59`);
      const tokens = nameTokens(asset.name, meta.issuer, meta.radarIssuer);
      const estimate = Math.abs(Number(f.amount) || 0);
      const hit = ((credits || []) as any[])
        .filter(c => c.id !== f.id && isLikelyCouponCredit(c, { cycle, estimate, tokens }))
        .sort((a, b) => Math.abs(Number(a.amount) - estimate) - Math.abs(Number(b.amount) - estimate))[0];
      if (hit) {
        const amount = round2(Math.abs(Number(hit.paid_amount || hit.amount)));
        const date = day(hit.date);
        const mvId = await recordCoupon(asset, hit, amount, date, 'Juros recebidos (ligado pelo extrato do banco)');
        await supabase.from('transactions').update({
          metadata: { ...(hit.metadata || {}), linked_asset_id: asset.id, investment_movement_id: mvId, type: 'investment_rendimento_mensal', matched_expected_coupon: f.id }
        }).eq('id', hit.id);
        await supabase.from('transactions').update({ is_deleted: true, metadata: { ...(f.metadata || {}), expected_coupon_state: 'superseded', superseded_by_transaction: hit.id } }).eq('id', f.id);
        f.metadata = { ...(f.metadata || {}), expected_coupon_state: 'superseded' };
        coupons.push({ movement_type: 'RENDIMENTO_MENSAL', amount, movement_date: date });
        out.linked += 1; changedValue = true;
        continue;
      }
    }
  }

  // Juros já resolvidos contam como pagos para o cronograma andar; os em aberto
  // (inclusive os atrasados, que continuam aparecendo como "não recebidos") também
  // contam como já previstos, para o próximo pagamento ser previsto sem esperar.
  const cycleOfF = (f: any) => day(f.metadata?.expected_coupon_cycle || f.date);
  const doneCycles = forecasts
    .filter(f => ['received', 'superseded', 'dismissed'].includes(f.metadata?.expected_coupon_state))
    .map(cycleOfF);
  const stillOpen = open.filter(f => f.metadata?.expected_coupon_state === 'open');
  const covered = [...coupons.map(m => m.movement_date), ...doneCycles, ...stillOpen.map(cycleOfF)];
  const futureOpen = stillOpen.filter(f => cycleOfF(f) >= today).sort((x, y) => cycleOfF(x).localeCompare(cycleOfF(y)));

  if (futureOpen.length) {
    // Já há o próximo previsto: só acompanha se a pessoa mudou a data no cadastro.
    const f = futureOpen[futureOpen.length - 1];
    const userDate = day(meta.couponNextDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(userDate) && userDate >= today && cycleOfF(f) !== userDate && !f.is_paid
        && !forecasts.some(o => o.id !== f.id && cycleOfF(o) === userDate)) {
      await supabase.from('transactions').update({ date: userDate, metadata: { ...(f.metadata || {}), expected_coupon_cycle: userDate } }).eq('id', f.id);
    }
  } else {
    const cycle = nextCycle(meta, covered, today);
    if (cycle && cycle !== day(meta.couponNextDate)) {
      // O card de "Próximo juros em" acompanha o cronograma (a data cadastrada nunca é apagada).
      await supabase.from('physical_assets').update({ metadata: { ...meta, couponNextDate: cycle } }).eq('id', asset.id);
      asset.metadata = { ...meta, couponNextDate: cycle };
    }
    if (cycle && payout) {
      // Previsto desta data apagado/dispensado pela pessoa: não recria.
      const dismissed = forecasts.some(f => cycleOfF(f) === cycle);
      const estimate = dismissed ? null : estimateCoupon(movements, meta, cycle, idx);
      if (estimate) {
        const { data: accRow } = await supabase.from('accounts').select('institution, name').eq('id', payout).maybeSingle();
        await supabase.from('transactions').insert({
          user_id: asset.user_id,
          description: `${FORECAST_PREFIX} - ${asset.name} (estimado)`,
          amount: estimate,
          date: cycle,
          type: 'INCOME',
          category: 'Investimentos',
          subcategory: 'Juros Recebidos',
          category_id: await categoryId(asset.user_id),
          is_paid: false,
          paid_amount: 0,
          account_id: payout,
          account_name: (accRow as any)?.institution || (accRow as any)?.name || null,
          notes: `Valor estimado (pelo último juro recebido ou pela taxa). Quando cair, dê como recebido com o valor exato (em Transações ou em Patrimônio › Juros previstos). Previsto para ${br(cycle)}.`,
          metadata: { expected_coupon_asset_id: asset.id, expected_coupon_cycle: cycle, expected_coupon_state: 'open', estimated_amount: estimate }
        });
        out.created += 1;
      }
    }
  }

  if (changedValue && meta.autoCurve) {
    try { await refreshAssetCurve(asset, idx, today); } catch { /* a rotina diária acerta */ }
  }
  return out;
}

/** Todos os títulos de uma pessoa (ou de todas, na rotina diária). */
export async function syncCouponForecasts(userId?: string, today = todayStr()): Promise<CouponSyncResult> {
  const total: CouponSyncResult = { created: 0, received: 0, linked: 0, superseded: 0 };
  let q = supabase.from('physical_assets').select('id, user_id, name, estimated_value, metadata')
    .eq('category', 'INVESTMENT').eq('is_archived', false);
  if (userId) q = q.eq('user_id', userId);
  const { data } = await q;
  const assets = ((data || []) as any[]).filter(a => wantsForecast(a.metadata));
  const idxByUser = new Map<string, Indexes>();
  const started = Date.now();
  for (const a of assets) {
    if (Date.now() - started > 15_000) break;
    try {
      if (!idxByUser.has(a.user_id)) idxByUser.set(a.user_id, await loadIndexes(a.user_id));
      const r = await syncAssetCoupons(a, idxByUser.get(a.user_id)!, today);
      total.created += r.created; total.received += r.received; total.linked += r.linked; total.superseded += r.superseded;
    } catch (err: any) {
      console.warn('[Juros previstos] falhou em', a.id, err?.message);
    }
  }
  return total;
}

async function sendWhatsApp(number: string, text: string) {
  const base = process.env.EVOLUTION_API_URL;
  if (!base || !process.env.EVOLUTION_API_KEY || !process.env.EVOLUTION_INSTANCE) return;
  try {
    await fetch(`${base.replace(/\/$/, '')}/message/sendText/${process.env.EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_API_KEY as string },
      body: JSON.stringify({ number, text, options: { delay: 1200, presence: 'composing' }, textMessage: { text } })
    });
  } catch (err) {
    console.error('[Juros previstos] WhatsApp falhou:', err);
  }
}

/**
 * Alerta de juros não recebidos: avisa UMA vez por juro (WhatsApp), só quando o
 * previsto passou da data e não caiu. Fica marcado em metadata.missed_notified_at.
 */
export async function notifyMissedCoupons(today = todayStr()): Promise<number> {
  const { data } = await supabase.from('transactions')
    .select('id, user_id, date, amount, account_name, description, metadata')
    .eq('is_deleted', false).eq('is_paid', false)
    .eq('metadata->>expected_coupon_state', 'open');
  const pending = missedCoupons((data || []) as any[], today).filter((f: any) => !f.metadata?.missed_notified_at);
  const byUser = new Map<string, any[]>();
  for (const f of pending) byUser.set(f.user_id, [...(byUser.get(f.user_id) || []), f]);
  let sent = 0;
  for (const [userId, items] of byUser) {
    const { data: st } = await supabase.from('user_settings').select('whatsapp_enabled, whatsapp_number').eq('user_id', userId).maybeSingle();
    if ((st as any)?.whatsapp_enabled && (st as any)?.whatsapp_number) {
      let msg = `*Zyvion* ⚠️ *Juros não recebidos*\n`;
      for (const f of items) {
        const name = String(f.description || '').replace(`${FORECAST_PREFIX} - `, '').replace(' (estimado)', '');
        msg += `• *${name}*: previsto para ${br(cycleOf(f))} (cerca de R$ ${Number(f.amount).toFixed(2).replace('.', ',')})${f.account_name ? ` em ${f.account_name}` : ''}, e não caiu.\n`;
      }
      msg += `\nConfirme com o banco se foi adiado, suspenso ou pago em outra conta. Se já caiu, dê como recebido em Patrimônio › Juros previstos.`;
      await sendWhatsApp((st as any).whatsapp_number, msg);
      sent += 1;
    }
    for (const f of items) {
      await supabase.from('transactions').update({ metadata: { ...(f.metadata || {}), missed_notified_at: new Date().toISOString() } }).eq('id', f.id);
    }
  }
  return sent;
}

/** "Não vai ser pago" / "já resolvi": tira o previsto sem lançar nada. */
export async function dismissForecast(userId: string, body: any): Promise<{ status: number; json: any }> {
  const { data: f } = await supabase.from('transactions').select('id, user_id, is_deleted, is_paid, metadata')
    .eq('id', String(body.transactionId || '')).eq('user_id', userId).maybeSingle();
  const row: any = f;
  if (!row || row.is_deleted || row.is_paid || row.metadata?.expected_coupon_state !== 'open') {
    return { status: 404, json: { error: 'Juro previsto não encontrado.' } };
  }
  await supabase.from('transactions').update({ is_deleted: true, metadata: { ...(row.metadata || {}), expected_coupon_state: 'dismissed', dismissed_at: new Date().toISOString() } }).eq('id', row.id);
  return { status: 200, json: { message: 'Juro previsto dispensado. Ele não volta a aparecer.' } };
}

/** Previstos em aberto de uma pessoa (para a tela). */
export async function listOpenForecasts(userId: string) {
  const { data } = await supabase.from('transactions')
    .select('id, date, amount, account_id, account_name, description, metadata')
    .eq('user_id', userId).eq('is_deleted', false).eq('is_paid', false)
    .eq('metadata->>expected_coupon_state', 'open');
  return ((data || []) as any[]).sort((a, b) => day(a.date).localeCompare(day(b.date)));
}

/** "Recebi": dá baixa no previsto com o valor e a data reais. */
export async function receiveForecast(userId: string, body: any): Promise<{ status: number; json: any }> {
  const { data: f } = await supabase.from('transactions')
    .select('id, user_id, date, amount, paid_amount, paid_at, is_paid, is_deleted, account_id, description, metadata')
    .eq('id', String(body.transactionId || '')).eq('user_id', userId).maybeSingle();
  const row: any = f;
  if (!row || row.is_deleted || row.metadata?.expected_coupon_state !== 'open') {
    return { status: 404, json: { error: 'Juro previsto não encontrado (pode já ter sido recebido).' } };
  }
  const value = round2(Number(body.value));
  if (!(value > 0)) return { status: 400, json: { error: 'Informe o valor que caiu na conta.' } };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || '')) ? String(body.date) : todayStr();
  const accountId = String(body.accountId || row.account_id || '') || null;
  const { data: accRow } = accountId
    ? await supabase.from('accounts').select('institution, name, user_id').eq('id', accountId).maybeSingle()
    : { data: null } as any;
  if (accountId && (!accRow || ((accRow as any).user_id && (accRow as any).user_id !== userId))) return { status: 404, json: { error: 'Conta não encontrada.' } };

  await supabase.from('transactions').update({
    amount: value, date, is_paid: true, paid_amount: value, paid_at: date,
    account_id: accountId, account_name: (accRow as any)?.institution || (accRow as any)?.name || null
  }).eq('id', row.id);
  if (row.account_id && row.account_id !== accountId) await recalc(row.account_id);
  await recalc(accountId);

  const { data: asset } = await supabase.from('physical_assets').select('id, user_id, name, estimated_value, metadata')
    .eq('id', String(row.metadata?.expected_coupon_asset_id || '')).eq('user_id', userId).maybeSingle();
  if (asset) await syncAssetCoupons(asset, await loadIndexes(userId), todayStr());
  return { status: 200, json: { message: `Juros de R$ ${value.toFixed(2).replace('.', ',')} recebidos em ${br(date)} e ligados ao investimento.` } };
}

/** Ações da tela (o usuário já foi validado pela rota). */
export async function handleCouponAction(userId: string, body: any): Promise<{ status: number; json: any }> {
  if (body.action === 'coupon_sync') {
    const r = await syncCouponForecasts(userId);
    return { status: 200, json: { ...r, forecasts: await listOpenForecasts(userId) } };
  }
  if (body.action === 'coupon_receive') return receiveForecast(userId, body);
  if (body.action === 'coupon_dismiss') return dismissForecast(userId, body);
  return { status: 400, json: { error: 'Ação desconhecida.' } };
}

/** Rotina diária. */
export async function runCouponForecastCron(_req: any, res: any) {
  try {
    const r = await syncCouponForecasts();
    let missedAlerts = 0;
    try { missedAlerts = await notifyMissedCoupons(); } catch (err: any) { console.warn('[Juros previstos] alerta falhou:', err?.message); }
    return res.status(200).json({ success: true, ...r, missedAlerts });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
