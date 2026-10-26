/**
 * Saldo devedor do consórcio — regra de mercado.
 *
 * Saldo devedor = o que a administradora diz que falta (carta + taxa de
 * administração + fundo de reserva, corrigidos pelo índice) MENOS o que foi
 * amortizado depois disso (parcelas pagas e lances). NÃO é a soma das parcelas
 * futuras cadastradas: em plano com parcela reduzida até a contemplação, as
 * parcelas lançadas somam bem menos que a dívida (o resto é redistribuído
 * depois de contemplar) — somar parcelas fazia a dívida despencar.
 *
 * Como o app não conhece o índice, guarda uma âncora no passivo
 * (`metadata.balance_anchor`): o saldo de referência e quanto já estava
 * amortizado naquele momento. A cada sincronização o saldo anda só pelo que foi
 * pago (ou desfeito) desde a âncora — chamar duas vezes não desconta duas vezes.
 * Se o saldo foi editado à mão (extrato da administradora), a âncora não bate e
 * o valor digitado vira a nova referência, sem desconto nenhum.
 */

export interface ConsortiumTxLike {
  type?: string | null;
  amount?: number | string | null;
  paid_amount?: number | string | null;
  is_paid?: boolean | null;
  is_deleted?: boolean | null;
  metadata?: any;
}

export interface BalanceAnchor {
  /** Saldo de referência sem o piso de zero (para desfazer pagamento depois de quitar). */
  raw: number;
  /** Total amortizado quando a âncora foi gravada. */
  amortized: number;
  at?: string;
}

const num = (v: unknown) => Number(v) || 0;
export const round2 = (v: number) => Math.round(v * 100) / 100;

const isOutflow = (t: ConsortiumTxLike) => {
  const type = String(t.type || '').toUpperCase();
  return type === 'EXPENSE' || type === 'BILL_PAYMENT';
};

/** Quanto este lançamento amortizou: o valor pago (parcial também), sem o seguro. */
export function amortizedOf(t: ConsortiumTxLike): number {
  if (t.is_deleted || !isOutflow(t)) return 0;
  const amount = num(t.amount);
  const paidAmount = num(t.paid_amount);
  const paid = t.is_paid ? (paidAmount > 0 ? paidAmount : amount) : Math.max(0, paidAmount);
  if (paid <= 0) return 0;
  // Seguro não amortiza a dívida (vem separado na parcela gerada pelo cadastro).
  const insurance = t.is_paid ? Math.max(0, num(t.metadata?.components?.insurance)) : 0;
  return round2(Math.max(0, paid - insurance));
}

export function consortiumAmortized(txs: ConsortiumTxLike[]): number {
  return round2((txs || []).reduce((s, t) => s + amortizedOf(t), 0));
}

/** Parcelas ainda não quitadas (o lance não é parcela). */
export function unpaidInstallmentsCount(txs: ConsortiumTxLike[]): number {
  return (txs || []).filter(t => !t.is_deleted && isOutflow(t) && !t.is_paid && t.metadata?.type !== 'consortium_bid').length;
}

/** Parcelas pagas (para o "X de N parcelas pagas" do cartão). */
export function paidInstallmentsCount(txs: ConsortiumTxLike[]): number {
  return (txs || []).filter(t => !t.is_deleted && isOutflow(t) && t.is_paid && t.metadata?.type !== 'consortium_bid').length;
}

export function nextConsortiumBalance(
  currentBalance: number,
  anchor: BalanceAnchor | null | undefined,
  amortizedNow: number
): { balance: number; anchor: BalanceAnchor; anchoredNow: boolean } {
  const current = round2(num(currentBalance));
  const valid = anchor && Number.isFinite(Number(anchor.raw)) && Number.isFinite(Number(anchor.amortized));
  // Sem âncora, ou saldo mudado à mão desde a última: o saldo atual é a referência.
  if (!valid || Math.abs(round2(Math.max(0, Number(anchor!.raw))) - current) > 0.01) {
    return { balance: current, anchor: { raw: current, amortized: round2(amortizedNow) }, anchoredNow: true };
  }
  const raw = round2(Number(anchor!.raw) - (round2(amortizedNow) - Number(anchor!.amortized)));
  return { balance: round2(Math.max(0, raw)), anchor: { raw, amortized: round2(amortizedNow) }, anchoredNow: false };
}
