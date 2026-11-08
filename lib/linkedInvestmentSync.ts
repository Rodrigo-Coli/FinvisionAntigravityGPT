// Transações ↔ extrato do investimento, sempre ligados.
//
// Um juro, aporte, amortização ou resgate registrado pelo Extrato do investimento
// (ou dado como recebido pelos juros previstos) tem duas pontas:
//   · o lançamento da conta (transactions, metadata.investment_movement_id)
//   · a movimentação do investimento (investment_movements, linked_transaction_id)
// Alterar valor/data de um lado altera o outro; excluir um pode excluir o outro.
// O valor do título acompanha pela mesma regra do extrato (valueDelta), e o ajuste
// "Juros pagos na conta" dos títulos com curva automática acompanha o juro.
//
// Quem usa: pages/History.tsx (Transações) e pages/Assets.tsx (Extrato do investimento).

import { valueDelta } from './curveProjection';

export const COUPON_OUT_NOTE = 'Juros pagos na conta (saem do valor do título)';

const round2 = (n: number) => Math.round(n * 100) / 100;
const day = (s: any) => String(s || '').slice(0, 10);
const NEGATIVE_TYPES = ['AMORTIZACAO', 'RESGATE_PARCIAL', 'RESGATE_TOTAL'];

export interface LinkedMovement {
  id: string;
  asset_id: string;
  movement_type: string;
  amount: number;
  movement_date: string;
  linked_transaction_id?: string | null;
}

/** Id da movimentação ligada a um lançamento (ou null). */
export function linkedMovementIdOf(tx: { metadata?: any } | null | undefined): string | null {
  const id = tx?.metadata?.investment_movement_id;
  return id ? String(id) : null;
}

/** Valor com o sinal que o extrato usa para aquele tipo (resgates/amortizações negativos). */
export function signedFor(type: string, amount: number): number {
  const a = Math.abs(Number(amount) || 0);
  return NEGATIVE_TYPES.includes(type) ? -a : a;
}

async function loadMovement(sb: any, id: string): Promise<LinkedMovement | null> {
  const { data } = await sb.from('investment_movements')
    .select('id, asset_id, movement_type, amount, movement_date, linked_transaction_id')
    .eq('id', id).maybeSingle();
  return (data as LinkedMovement) || null;
}

/** O ajuste "Juros pagos na conta" que acompanha um juro (curva automática), se houver. */
async function findCouponCompanion(sb: any, mv: LinkedMovement): Promise<any | null> {
  if (mv.movement_type !== 'RENDIMENTO_MENSAL') return null;
  const { data } = await sb.from('investment_movements')
    .select('id, amount, movement_date, notes, movement_type')
    .eq('asset_id', mv.asset_id).eq('movement_type', 'AJUSTE_MANUAL');
  const target = round2(-Math.abs(Number(mv.amount) || 0));
  return ((data || []) as any[]).find(r =>
    String(r.notes || '').startsWith('Juros pagos na conta') &&
    day(r.movement_date) === day(mv.movement_date) &&
    Math.abs(round2(Number(r.amount)) - target) < 0.005
  ) || null;
}

/** Soma `delta` ao valor do título e recalcula o saldo da corretora. */
async function shiftAssetValue(sb: any, assetId: string, delta: number) {
  if (Math.abs(delta) < 0.005) return;
  const { data: asset } = await sb.from('physical_assets').select('id, estimated_value, metadata').eq('id', assetId).maybeSingle();
  if (!asset) return;
  const next = Math.max(0, round2(Number(asset.estimated_value || 0) + delta));
  await sb.from('physical_assets').update({ estimated_value: next }).eq('id', assetId);
  const broker = asset.metadata?.brokerAccountId;
  if (broker) { try { await sb.rpc('recalculate_account_balance', { p_account_id: broker }); } catch { /* o próximo recálculo acerta */ } }
}

/** Efeito no valor do título de uma movimentação + o ajuste que a acompanha. */
const effect = (type: string, amount: number, companion: number) =>
  valueDelta({ movement_type: type, amount, movement_date: '' }) + companion;

/**
 * Alterou valor e/ou data do lançamento em Transações → altera a movimentação ligada
 * (e o ajuste da curva automática), e o valor do título acompanha.
 * Devolve true quando havia algo ligado e foi atualizado.
 */
export async function syncMovementFromTransaction(
  sb: any,
  tx: { metadata?: any },
  change: { amount?: number; date?: string }
): Promise<boolean> {
  const id = linkedMovementIdOf(tx);
  if (!sb || !id) return false;
  const mv = await loadMovement(sb, id);
  if (!mv) return false;
  const companion = await findCouponCompanion(sb, mv);
  // Guarda o "antes" (o objeto lido pode ser o mesmo que a atualização altera).
  const oldAmount = Number(mv.amount);
  const oldDate = day(mv.movement_date);
  const compOld = companion ? Number(companion.amount) : 0;

  const newAmount = change.amount !== undefined ? signedFor(mv.movement_type, change.amount) : oldAmount;
  const newDate = change.date ? day(change.date) : oldDate;
  if (Math.abs(newAmount - oldAmount) < 0.005 && newDate === oldDate) return true;

  await sb.from('investment_movements').update({ amount: newAmount, movement_date: newDate }).eq('id', mv.id);
  let compAfter = 0;
  if (companion) {
    compAfter = -Math.abs(newAmount);
    await sb.from('investment_movements').update({ amount: compAfter, movement_date: newDate }).eq('id', companion.id);
  }
  await shiftAssetValue(sb, mv.asset_id, effect(mv.movement_type, newAmount, compAfter) - effect(mv.movement_type, oldAmount, compOld));
  return true;
}

/**
 * Alterou valor e/ou data no Extrato do investimento → altera o lançamento ligado
 * na conta (valor, valor pago e data) e recalcula o saldo; o ajuste da curva e o
 * valor do título acompanham.
 */
export async function syncTransactionFromMovement(
  sb: any,
  before: LinkedMovement,
  change: { amount?: number; movement_date?: string }
): Promise<boolean> {
  if (!sb || !before) return false;
  const companion = await findCouponCompanion(sb, before);
  const newAmount = change.amount !== undefined ? Number(change.amount) : Number(before.amount);
  const newDate = change.movement_date ? day(change.movement_date) : day(before.movement_date);

  const compBefore = companion ? Number(companion.amount) : 0;
  let compAfter = 0;
  if (companion) {
    compAfter = -Math.abs(newAmount);
    await sb.from('investment_movements').update({ amount: compAfter, movement_date: newDate }).eq('id', companion.id);
  }
  await shiftAssetValue(sb, before.asset_id, effect(before.movement_type, newAmount, compAfter) - effect(before.movement_type, Number(before.amount), compBefore));

  const txId = before.linked_transaction_id;
  if (!txId) return false;
  const { data: tx } = await sb.from('transactions').select('id, account_id, is_paid, paid_amount, amount, date, paid_at').eq('id', txId).maybeSingle();
  if (!tx) return false;
  const abs = round2(Math.abs(newAmount));
  const patch: any = { amount: abs, date: newDate };
  if (tx.is_paid) { patch.paid_amount = abs; patch.paid_at = newDate; }
  await sb.from('transactions').update(patch).eq('id', txId);
  if (tx.account_id) { try { await sb.rpc('recalculate_account_balance', { p_account_id: tx.account_id }); } catch { /* idem */ } }
  return true;
}

/** Excluiu o lançamento em Transações → exclui a movimentação ligada (e o ajuste), desfazendo o efeito no título. */
export async function deleteMovementOfTransaction(sb: any, tx: { metadata?: any }): Promise<boolean> {
  const id = linkedMovementIdOf(tx);
  if (!sb || !id) return false;
  const mv = await loadMovement(sb, id);
  if (!mv) return false;
  const companion = await findCouponCompanion(sb, mv);
  const undo = -effect(mv.movement_type, Number(mv.amount), companion ? Number(companion.amount) : 0);
  await sb.from('investment_movements').delete().eq('id', mv.id);
  if (companion) await sb.from('investment_movements').delete().eq('id', companion.id);
  await shiftAssetValue(sb, mv.asset_id, undo);
  return true;
}

/** Excluiu no Extrato do investimento → exclui (lixeira) o lançamento ligado na conta e o ajuste da curva. */
export async function deleteTransactionOfMovement(sb: any, mv: LinkedMovement): Promise<boolean> {
  if (!sb || !mv) return false;
  const companion = await findCouponCompanion(sb, mv);
  const undo = -effect(mv.movement_type, Number(mv.amount), companion ? Number(companion.amount) : 0);
  if (companion) await sb.from('investment_movements').delete().eq('id', companion.id);
  await shiftAssetValue(sb, mv.asset_id, undo);
  if (!mv.linked_transaction_id) return false;
  const { data: tx } = await sb.from('transactions').select('id, account_id').eq('id', mv.linked_transaction_id).maybeSingle();
  if (!tx) return false;
  await sb.from('transactions').update({ is_deleted: true }).eq('id', tx.id);
  if (tx.account_id) { try { await sb.rpc('recalculate_account_balance', { p_account_id: tx.account_id }); } catch { /* idem */ } }
  return true;
}
