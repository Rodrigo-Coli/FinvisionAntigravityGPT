import { createClient } from '@supabase/supabase-js';
import { isCronAuthorized } from './cron-auth.js';
import {
  planCurve, curveSpecOf, curveFactor, valueDelta, reportAdjustment, CURVE_TYPES, AUTO_NOTE_PREFIX,
  type Indexes, type Movement
} from '../../lib/curveProjection.js';

// Curva automática (servidor).
// · Rotina diária (daily-cron, antes do Radar): para cada título com
//   metadata.autoCurve = true, projeta a curva pela taxa contratada até hoje,
//   fecha os meses que faltam e mantém UMA linha "[curva automática]" do mês.
// · Ações do usuário (rota /api/investment-radar):
//   - bank_value:  o saldo da tela do app do banco. Em título com curva vira
//                  "valor de mercado"; nos demais (fundos, CDB do banco…) vira o
//                  valor atual e a diferença entra como rendimento/ajuste.
//   - report_curve: o valor pela curva do relatório numa data → acerto.
//   - curve_refresh: recalcula agora (um título ou todos).

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

const todayStr = () => new Date().toISOString().slice(0, 10);
const br = (d: string) => d.split('-').reverse().join('/');
const round2 = (n: number) => Math.round(n * 100) / 100;

let cache: { at: number; cdi: Map<string, number>; ipca: Map<string, number> } | null = null;

async function loadSeries(): Promise<{ cdi: Map<string, number>; ipca: Map<string, number> }> {
  if (cache && Date.now() - cache.at < 6 * 3600 * 1000) return cache;
  const cdi = new Map<string, number>();
  const ipca = new Map<string, number>();
  const toIso = (dmy: string) => { const [d, m, y] = dmy.split('/'); return `${y}-${m}-${d}`; };
  try {
    const start = new Date(Date.now() - 400 * 86400000);
    const ini = `${String(start.getUTCDate()).padStart(2, '0')}/${String(start.getUTCMonth() + 1).padStart(2, '0')}/${start.getUTCFullYear()}`;
    const r = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=${ini}`);
    if (r.ok) for (const row of (await r.json()) || []) cdi.set(toIso(row.data), Number(String(row.valor).replace(',', '.')));
  } catch { /* sem rede: usa o CDI anual */ }
  try {
    const r = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/24?formato=json');
    if (r.ok) for (const row of (await r.json()) || []) ipca.set(toIso(row.data).slice(0, 7), Number(String(row.valor).replace(',', '.')));
  } catch { /* sem rede: usa o IPCA anual */ }
  cache = { at: Date.now(), cdi, ipca };
  return cache;
}

async function indexesFor(userId: string): Promise<Indexes> {
  const { cdi, ipca } = await loadSeries();
  let cdiAnnual = 14;
  let ipcaAnnual = 4.5;
  try {
    const { data } = await supabase.from('user_settings').select('market_indexes').eq('user_id', userId).maybeSingle();
    if (Number(data?.market_indexes?.cdi) > 0) cdiAnnual = Number(data?.market_indexes?.cdi);
    if (Number(data?.market_indexes?.ipca) > 0) ipcaAnnual = Number(data?.market_indexes?.ipca);
  } catch { /* padrões */ }
  return { cdiDaily: cdi, ipcaMonthly: ipca, cdiAnnual, ipcaAnnual };
}

async function recalcBroker(meta: any) {
  const broker = meta?.brokerAccountId;
  if (broker) {
    try { await supabase.rpc('recalculate_account_balance', { p_account_id: broker }); } catch { /* o próximo recálculo acerta */ }
  }
}

/** Atualiza a curva de um título até hoje. Devolve o valor novo (ou null se não se aplica). */
export async function refreshAssetCurve(asset: any, idx: Indexes, today = todayStr()): Promise<number | null> {
  const meta = asset.metadata || {};
  const spec = curveSpecOf(meta);
  if (!meta.autoCurve || !spec || meta.status === 'RESGATADO') return null;
  const { data: movs } = await supabase
    .from('investment_movements')
    .select('id, movement_type, amount, movement_date, notes')
    .eq('asset_id', asset.id)
    .eq('is_projected', false);
  const plan = planCurve((movs || []) as Movement[], spec, today, idx);
  if (plan.value <= 0) return null;

  if (plan.closedRows.length) {
    await supabase.from('investment_movements').insert(plan.closedRows.map(r => ({
      user_id: asset.user_id, asset_id: asset.id, movement_type: 'RENDIMENTO_ACUMULADO', amount: r.amount, movement_date: r.movement_date, is_projected: false, notes: r.notes
    })));
  }
  if (plan.replaceOpenRowId) {
    // A linha do mês é sempre a mesma: atualiza em vez de apagar e criar.
    await supabase.from('investment_movements')
      .update({ amount: plan.openRow?.amount ?? 0, movement_date: plan.openRow?.movement_date ?? today, notes: plan.openRow?.notes ?? `${AUTO_NOTE_PREFIX} sem variação no mês` })
      .eq('id', plan.replaceOpenRowId);
  } else if (plan.openRow) {
    await supabase.from('investment_movements').insert({
      user_id: asset.user_id, asset_id: asset.id, movement_type: 'RENDIMENTO_ACUMULADO', amount: plan.openRow.amount, movement_date: plan.openRow.movement_date, is_projected: false, notes: plan.openRow.notes
    });
  }
  await supabase.from('physical_assets')
    .update({ estimated_value: plan.value, metadata: { ...meta, curveUpdatedAt: today } })
    .eq('id', asset.id);
  await recalcBroker(meta);
  return plan.value;
}

/** Rotina diária: todos os títulos com curva automática. */
export async function runCurveProjectionCron(req: any, res: any) {
  if (!isCronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { data: assets } = await supabase
      .from('physical_assets')
      .select('id, user_id, name, estimated_value, metadata')
      .eq('category', 'INVESTMENT')
      .eq('is_archived', false)
      .eq('metadata->>autoCurve', 'true');
    const byUser = new Map<string, any[]>();
    for (const a of assets || []) byUser.set(a.user_id, [...(byUser.get(a.user_id) || []), a]);
    let updated = 0;
    const started = Date.now();
    for (const [userId, list] of byUser) {
      if (Date.now() - started > 20_000) break;
      const idx = await indexesFor(userId);
      for (const a of list) {
        try { if ((await refreshAssetCurve(a, idx)) !== null) updated += 1; } catch (err: any) { console.warn('[Curve] falhou em', a.id, err?.message); }
      }
    }
    return res.status(200).json({ success: true, updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

async function loadOwnedAsset(userId: string, assetId: string) {
  const { data } = await supabase
    .from('physical_assets')
    .select('id, user_id, name, estimated_value, metadata')
    .eq('id', assetId)
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

/** Ações da tela (o usuário já foi validado pela rota). */
export async function handleCurveAction(userId: string, body: any): Promise<{ status: number; json: any }> {
  const today = todayStr();

  if (body.action === 'curve_refresh') {
    const idx = await indexesFor(userId);
    let q = supabase.from('physical_assets').select('id, user_id, name, estimated_value, metadata')
      .eq('user_id', userId).eq('category', 'INVESTMENT').eq('is_archived', false).eq('metadata->>autoCurve', 'true');
    if (body.assetId) q = q.eq('id', String(body.assetId));
    const { data } = await q;
    let updated = 0;
    for (const a of data || []) if ((await refreshAssetCurve(a, idx)) !== null) updated += 1;
    return { status: 200, json: { updated } };
  }

  const asset: any = await loadOwnedAsset(userId, String(body.assetId || ''));
  if (!asset) return { status: 404, json: { error: 'Investimento não encontrado.' } };
  const meta = asset.metadata || {};
  const value = Number(body.value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || '')) ? String(body.date) : today;
  if (!(value > 0)) return { status: 400, json: { error: 'Informe um valor maior que zero.' } };

  if (body.action === 'bank_value') {
    const usesCurve = !!meta.autoCurve || (CURVE_TYPES.includes(String(meta.investmentType)) && !!curveSpecOf(meta) && ['CRI_CRA', 'DEBENTURES'].includes(String(meta.investmentType)));
    if (usesCurve) {
      await supabase.from('physical_assets').update({ metadata: { ...meta, marketValue: round2(value), marketValueDate: date } }).eq('id', asset.id);
      return { status: 200, json: { kind: 'market', message: `Valor de mercado de ${br(date)} salvo. O patrimônio continua pela curva.` } };
    }
    const delta = round2(value - Number(asset.estimated_value || 0));
    if (Math.abs(delta) >= 0.01) {
      await supabase.from('investment_movements').insert({
        user_id: userId, asset_id: asset.id,
        movement_type: delta > 0 ? 'RENDIMENTO_ACUMULADO' : 'AJUSTE_MANUAL',
        amount: delta, movement_date: date, is_projected: false,
        notes: delta > 0 ? `Rendimento desde a última atualização (saldo no app do banco em ${br(date)}: ${value.toFixed(2).replace('.', ',')})` : `Queda desde a última atualização (saldo no app do banco em ${br(date)})`
      });
      await supabase.from('physical_assets').update({ estimated_value: round2(value) }).eq('id', asset.id);
      await recalcBroker(meta);
    }
    return { status: 200, json: { kind: 'value', delta, message: delta === 0 ? 'Sem diferença: o valor já estava igual.' : `Valor atualizado; ${delta > 0 ? 'rendimento' : 'queda'} de R$ ${Math.abs(delta).toFixed(2).replace('.', ',')} lançado no extrato.` } };
  }

  if (body.action === 'report_curve') {
    // Valor do extrato do app na data do relatório (projetando pela taxa até lá).
    const spec = curveSpecOf(meta);
    const { data: movs } = await supabase.from('investment_movements')
      .select('movement_type, amount, movement_date, notes').eq('asset_id', asset.id).eq('is_projected', false);
    const upTo = ((movs || []) as Movement[])
      .filter(m => m.movement_date <= date)
      .sort((a, b) => a.movement_date.localeCompare(b.movement_date));
    let appValue = upTo.reduce((s, m) => s + valueDelta(m), 0);
    const last = upTo[upTo.length - 1]?.movement_date;
    if (spec && last && last < date && appValue > 0) appValue *= curveFactor(spec, last, date, await indexesFor(userId));
    const adj = reportAdjustment(round2(appValue), value);
    if (Math.abs(adj) >= 0.01) {
      await supabase.from('investment_movements').insert({
        user_id: userId, asset_id: asset.id, movement_type: 'AJUSTE_MANUAL', amount: adj, movement_date: date, is_projected: false,
        notes: `Acerto pela curva do relatório de ${br(date)} (relatório ${value.toFixed(2).replace('.', ',')})`
      });
    }
    if (meta.autoCurve) {
      await refreshAssetCurve(asset, await indexesFor(userId), today);
    } else {
      await supabase.from('physical_assets').update({ estimated_value: round2(Number(asset.estimated_value || 0) + adj) }).eq('id', asset.id);
      await recalcBroker(meta);
    }
    return { status: 200, json: { adjustment: adj, message: Math.abs(adj) < 0.01 ? 'Bateu certinho com o relatório.' : `Acerto de R$ ${adj.toFixed(2).replace('.', ',')} lançado em ${br(date)}.` } };
  }

  return { status: 400, json: { error: 'Ação desconhecida.' } };
}
