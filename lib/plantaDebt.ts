/**
 * Imóvel na planta: quanto ainda é DÍVIDA.
 *
 * O patrimônio contava o imóvel na planta como "valor − saldo da entrega": as
 * parcelas da entrada, intermediárias e da construtora que ainda vão vencer
 * entravam como se já fossem do dono. No Painel, nem o saldo da entrega era
 * descontado. A regra agora: o imóvel entra pelo valor, e tudo o que falta
 * pagar entra em Dívidas — o patrimônio líquido fica no que já foi pago (mais
 * a valorização, se o valor estimado subiu).
 *
 * Dívida do imóvel na planta =
 *   saldo da entrega (só se ainda não há passivo vinculado — se houver, a
 *   dívida já está nele)
 * + parcelas ainda não pagas de entrada / intermediárias / construtora que não
 *   pertencem a um passivo (as que pertencem já contam no saldo dele).
 */

export const PRE_DELIVERY_TX_TYPES = ['DOWN_PAYMENT', 'BALLOON', 'CONSTRUCTOR_INSTALLMENT'];

export interface PlantaTxLike {
  type?: string | null;
  amount?: number | string | null;
  paidAmount?: number | string | null;
  paid_amount?: number | string | null;
  isPaid?: boolean | null;
  is_paid?: boolean | null;
  liability_id?: string | null;
  liabilityId?: string | null;
  is_deleted?: boolean | null;
  metadata?: any;
}

const num = (v: unknown) => Number(v) || 0;

export function plantaRemainingDebt(
  asset: { metadata?: any },
  linkedTxs: PlantaTxLike[],
  hasLinkedLiability: boolean
): { delivery: number; installments: number; total: number } {
  const delivery = hasLinkedLiability ? 0 : Math.max(0, num(asset.metadata?.deliveryBalance));
  const installments = (linkedTxs || [])
    .filter(t => {
      const type = String(t.type || '').toUpperCase();
      const paid = t.isPaid ?? t.is_paid ?? false;
      return type === 'EXPENSE'
        && !paid
        && !t.is_deleted
        && !(t.liability_id || t.liabilityId)
        && PRE_DELIVERY_TX_TYPES.includes(String(t.metadata?.property_tx_type || ''));
    })
    .reduce((sum, t) => sum + Math.max(0, num(t.amount) - num(t.paidAmount ?? t.paid_amount)), 0);
  const round = (v: number) => Math.round(v * 100) / 100;
  return { delivery: round(delivery), installments: round(installments), total: round(delivery + installments) };
}
