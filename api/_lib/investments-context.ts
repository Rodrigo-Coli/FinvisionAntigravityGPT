// Monta o bloco de texto "INVESTIMENTOS DETALHADOS" injetado no prompt da IA
// (tanto no chat do app quanto no WhatsApp) para que o assistente consiga responder
// qualquer pergunta sobre investimentos: saldo, vencimento, liquidez (D+), IR estimado
// e a "nota de plano" que o usuário deixou para cada um.
//
// Segue o mesmo padrão já usado nos dois handlers: busca tudo antes da chamada ao
// modelo (sem function calling) e injeta como texto formatado.

import { resolveTaxRegime, taxRateFor, calendarDaysBetween, TAX_REGIME_LABEL } from '../../lib/investmentTax.js';

const INVEST_TYPE_LABEL: Record<string, string> = {
  CDB: 'CDB', LCI_LCA: 'LCI/LCA', TESOURO: 'Tesouro', DEBENTURES: 'Debêntures',
  CRI_CRA: 'CRI/CRA', COE: 'COE', ACOES: 'Ações', FIIS: 'FIIs', FUNDOS: 'Fundos',
  CRIPTO: 'Cripto', PREVIDENCIA: 'Previdência', POUPANCA: 'Poupança', OUTROS: 'Outros'
};

// Regras de IR (renda fixa regressiva, fundos, previdência, renda variável, isentos)
// vêm do mesmo módulo que o app usa, para a IA falar o mesmo número do card.
export async function buildInvestmentsContextSection(supabase: any, userId: string): Promise<string> {
  const { data: assets } = await supabase
    .from('physical_assets')
    .select('id, name, metadata, estimated_value, acquisition_date')
    .eq('user_id', userId)
    .eq('category', 'INVESTMENT');

  const activeAssets = (assets || []).filter((a: any) => a.metadata?.status !== 'RESGATADO');
  if (activeAssets.length === 0) return '';

  const assetIds = activeAssets.map((a: any) => a.id);
  const { data: reminders } = await supabase
    .from('investment_reminders')
    .select('asset_id, note')
    .in('asset_id', assetIds);
  const reminderByAsset = new Map((reminders || []).map((r: any) => [r.asset_id, r.note]));

  let totalGross = 0;
  const lines = activeAssets.map((a: any) => {
    const meta = a.metadata || {};
    const gross = Number(a.estimated_value || 0);
    totalGross += gross;
    const purchase = Number(meta.purchaseValue ?? meta.initialInvestmentAmount ?? gross);
    const typeLabel = INVEST_TYPE_LABEL[meta.investmentType] || meta.investmentType || 'Investimento';
    const regime = resolveTaxRegime(meta);

    let daysHeld = 0;
    if (a.acquisition_date) {
      const today = new Date().toISOString().substring(0, 10);
      daysHeld = calendarDaysBetween(String(a.acquisition_date).substring(0, 10), today);
    }

    let irTexto: string;
    if (regime === 'ISENTO') {
      irTexto = 'isento';
    } else {
      const taxRate = taxRateFor(regime, daysHeld);
      const base = meta.investmentType === 'PREVIDENCIA' && meta.pensionPlanType === 'PGBL' ? 'o valor total resgatado' : 'o lucro';
      irTexto = `${(taxRate * 100).toFixed(1)}% sobre ${base} (${TAX_REGIME_LABEL[regime]}, ${daysHeld} dias desde a aplicação)`;
    }

    const vencimento = meta.vencimentoDate ? meta.vencimentoDate.split('-').reverse().join('/') : 'sem data definida';

    let liquidezTexto: string;
    const liquidityDays = meta.liquidityDays;
    const atMaturity = !!meta.liquidityAtMaturity;
    if (liquidityDays !== undefined && liquidityDays !== null) {
      liquidezTexto = liquidityDays === 0 ? 'liquidez diária (D+0)' : `D+${liquidityDays}`;
      if (atMaturity) liquidezTexto += ' e também disponível no vencimento';
    } else if (atMaturity) {
      liquidezTexto = 'somente disponível no vencimento';
    } else {
      liquidezTexto = 'não informada';
    }

    const note = reminderByAsset.get(a.id);

    return `- "${a.name}" (${typeLabel}) | Saldo bruto: R$ ${gross.toFixed(2)} | Valor aplicado: R$ ${purchase.toFixed(2)} | Vencimento: ${vencimento} | Liquidez: ${liquidezTexto} | IR estimado: ${irTexto}${note ? ` | Nota de plano do usuário: "${note}"` : ''}`;
  });

  return `
# INVESTIMENTOS DETALHADOS (use para responder QUALQUER pergunta sobre investimentos — saldo, vencimento, liquidez/D+, IR estimado, de onde tirar dinheiro para pagar algo, quanto ficará disponível nos próximos N dias etc. Calcule datas comparando "Vencimento"/liquidez de cada item com a data de hoje informada acima)
Total investido (soma dos saldos brutos): R$ ${totalGross.toFixed(2)}
${lines.join('\n')}
`;
}
