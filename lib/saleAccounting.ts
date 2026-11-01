/**
 * Contabilidade da venda de um bem (veículo, imóvel, outros bens).
 *
 * Comissão de venda, dois jeitos:
 *  - SEPARATE ("paga à parte"): você recebe o valor cheio e paga a comissão
 *    em separado. Gera a despesa de comissão e a receita cheia.
 *  - DEDUCTED ("descontada no repasse"): quem intermediou já repassou o valor
 *    líquido (venda − comissão). Não gera despesa de comissão; a receita (à
 *    vista, parte em dinheiro ou parcelas) é o valor líquido.
 *
 * Vendas a receber: entrada e parcelas de venda ainda não recebidas. Somam no
 * patrimônio, porque o bem já saiu, mas o dinheiro ainda não entrou.
 */
export type SaleCommissionMode = 'SEPARATE' | 'DEDUCTED';

export const commissionModeOf = (v: any): SaleCommissionMode =>
  v === 'DEDUCTED' ? 'DEDUCTED' : 'SEPARATE';

const r2 = (v: number) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/** Quanto entra de fato a partir de um valor bruto, conforme o jeito da comissão. */
export function netOfCommission(gross: number, commission: number, mode: SaleCommissionMode): number {
  const g = Number(gross) || 0;
  const c = Number(commission) || 0;
  if (mode !== 'DEDUCTED' || c <= 0) return r2(g);
  return r2(Math.max(0, g - c));
}

/** Despesa de comissão só existe quando ela é paga à parte. */
export const shouldRecordCommissionExpense = (commission: number, mode: SaleCommissionMode) =>
  (Number(commission) || 0) > 0 && mode !== 'DEDUCTED';

export const SALE_RECEIVABLE_TYPES = [
  'vehicle_sale_installment',
  'vehicle_sale_down_payment',
  'other_sale_installment',
  'other_sale_down_payment',
  'real_estate_sale_installment',
  'real_estate_sale_down_payment'
];

export interface SaleReceivableRow {
  amount: number | string;
  is_paid?: boolean | null;
  paid_amount?: number | string | null;
  is_deleted?: boolean | null;
  metadata?: { type?: string; linked_asset_id?: string } | null;
}

/** Valor que falta receber numa linha de entrada/parcela de venda (0 se não for venda). */
export function saleReceivableOpen(row: SaleReceivableRow): number {
  if (!row || row.is_deleted) return 0;
  if (!SALE_RECEIVABLE_TYPES.includes(String(row.metadata?.type || ''))) return 0;
  if (row.is_paid) return 0;
  const open = (Number(row.amount) || 0) - (Number(row.paid_amount) || 0);
  return open > 0.005 ? r2(open) : 0;
}

/** Total de vendas a receber. */
export function saleReceivablesTotal(rows: SaleReceivableRow[]): number {
  return r2((rows || []).reduce((s, r) => s + saleReceivableOpen(r), 0));
}

/** Campos de conta para as linhas geradas pela venda (vazio se nenhuma conta foi escolhida). */
export function saleAccountFields(
  accountId: string | null | undefined,
  accounts: { id: string; institution?: string | null; name?: string | null }[]
): { account_id?: string; account_name?: string | null } {
  if (!accountId) return {};
  const acc = (accounts || []).find(a => a.id === accountId);
  return { account_id: accountId, account_name: acc?.institution || acc?.name || null };
}
