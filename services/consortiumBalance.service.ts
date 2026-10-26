import { supabase } from '../lib/supabase/client';
import {
  nextConsortiumBalance, consortiumAmortized, unpaidInstallmentsCount, paidInstallmentsCount, BalanceAnchor
} from '../lib/consortiumBalance';

/**
 * Atualiza o saldo devedor dos consórcios pela regra de `lib/consortiumBalance`
 * (saldo de referência − o que foi amortizado desde então), o nº de parcelas
 * restantes e o "parcelas pagas" do cartão.
 *
 * Roda ao abrir Patrimônio/Consórcios/Painel e depois de editar uma parcela —
 * pagamento feito em Transações (que não avisa o passivo) entra na próxima
 * abertura. Idempotente e à prova de falha: nunca lança, nunca derruba a tela.
 */

// Uma sincronização por passivo de cada vez (é "leia e então escreva").
const chains = new Map<string, Promise<void>>();

function serialize(liabilityId: string, task: () => Promise<void>): Promise<void> {
  const previous = chains.get(liabilityId) || Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  chains.set(liabilityId, next);
  next.catch(() => undefined).then(() => { if (chains.get(liabilityId) === next) chains.delete(liabilityId); });
  return next;
}

async function syncOne(liab: { id: string }): Promise<void> {
  if (!supabase) return;
  // Relê o passivo dentro da fila: a leitura de quem chamou pode estar velha.
  const { data: fresh, error: liabErr } = await supabase
    .from('liabilities')
    .select('id, type, remaining_balance, installments_remaining, metadata')
    .eq('id', liab.id)
    .maybeSingle();
  if (liabErr || !fresh || fresh.type !== 'CONSORTIUM') return;

  const { data: txs, error } = await supabase
    .from('transactions')
    .select('type, amount, paid_amount, is_paid, is_deleted, metadata')
    .eq('liability_id', liab.id);
  if (error || !txs) return;
  const live = txs.filter((t: any) => t.is_deleted !== true);

  const amortized = consortiumAmortized(live);
  const anchor: BalanceAnchor | null = fresh.metadata?.balance_anchor || null;
  const next = nextConsortiumBalance(Number(fresh.remaining_balance) || 0, anchor, amortized);
  const remainingCount = unpaidInstallmentsCount(live);

  const sameBalance = Math.abs(next.balance - (Number(fresh.remaining_balance) || 0)) < 0.005;
  const sameAnchor = anchor && Number(anchor.raw) === next.anchor.raw && Number(anchor.amortized) === next.anchor.amortized;
  const sameCount = Number(fresh.installments_remaining) === remainingCount;
  if (!(sameBalance && sameAnchor && sameCount)) {
    await supabase.from('liabilities').update({
      remaining_balance: next.balance,
      installments_remaining: remainingCount,
      metadata: { ...(fresh.metadata || {}), balance_anchor: { ...next.anchor, at: new Date().toISOString() } },
      updated_at: new Date().toISOString()
    }).eq('id', liab.id);
  }

  // "X parcelas pagas" do cartão do consórcio — antes ficava parado no cadastro.
  const paidCount = paidInstallmentsCount(live);
  await supabase.from('consortiums').update({ months_paid: paidCount }).eq('liability_id', liab.id).neq('months_paid', paidCount);
}

/** Sincroniza um passivo de consórcio (não faz nada se não for consórcio). */
export function syncConsortiumBalance(liabilityId: string): Promise<void> {
  if (!liabilityId) return Promise.resolve();
  return serialize(liabilityId, () => syncOne({ id: liabilityId }).catch(err => {
    console.warn('[Consórcio] Falha ao atualizar o saldo devedor:', err);
  }));
}

/** Sincroniza todos os consórcios ativos do usuário. */
export async function syncAllConsortiumBalances(userId: string): Promise<void> {
  try {
    if (!supabase || !userId) return;
    const { data, error } = await supabase
      .from('liabilities')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'CONSORTIUM')
      .eq('is_archived', false);
    if (error || !data?.length) return;
    await Promise.all(data.map((l: any) => syncConsortiumBalance(l.id)));
  } catch (err) {
    console.warn('[Consórcio] Falha ao atualizar os saldos devedores:', err);
  }
}
