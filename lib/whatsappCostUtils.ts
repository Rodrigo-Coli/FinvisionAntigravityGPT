export interface WhatsappCostConfigRow {
  category: 'utility' | 'marketing' | 'authentication';
  meta_cost_usd: number;
  usd_to_brl_rate: number;
}

// Por decisão de produto: o cálculo de margem SEMPRE usa o custo mais caro
// entre as categorias da tabela oficial da Meta, mesmo quando o envio real é
// feito por um canal mais barato (ex: Evolution API self-hosted) — para
// nunca subestimar custo e corroer a margem do plano sem perceber.
export function getSafetyWhatsappCostPerMessageBRL(rows: WhatsappCostConfigRow[]): number {
  if (!rows || rows.length === 0) return 0;
  return rows.reduce((max, row) => {
    const brl = row.meta_cost_usd * row.usd_to_brl_rate;
    return brl > max ? brl : max;
  }, 0);
}

export function calculateWhatsappMonthlyCostCents(messagesPerMonth: number, rows: WhatsappCostConfigRow[]): number {
  const perMessageBRL = getSafetyWhatsappCostPerMessageBRL(rows);
  return Math.round(messagesPerMonth * perMessageBRL * 100);
}
