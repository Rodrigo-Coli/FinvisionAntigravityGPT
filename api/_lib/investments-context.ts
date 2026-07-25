// Monta o bloco de texto "INVESTIMENTOS DETALHADOS" injetado no prompt da IA
// (tanto no chat do app quanto no WhatsApp) para que o assistente consiga responder
// qualquer pergunta sobre investimentos: saldo, vencimento, liquidez (D+), IR estimado
// e a "nota de plano" que o usuário deixou para cada um.
//
// Segue o mesmo padrão já usado nos dois handlers: busca tudo antes da chamada ao
// modelo (sem function calling) e injeta como texto formatado.

const INVEST_TYPE_LABEL: Record<string, string> = {
  CDB: 'CDB', LCI_LCA: 'LCI/LCA', TESOURO: 'Tesouro', DEBENTURES: 'Debêntures',
  CRI_CRA: 'CRI/CRA', COE: 'COE', ACOES: 'Ações', FIIS: 'FIIs', FUNDOS: 'Fundos',
  CRIPTO: 'Cripto', PREVIDENCIA: 'Previdência', POUPANCA: 'Poupança', OUTROS: 'Outros'
};

// Tabela regressiva padrão de IR para renda fixa (Lei 11.033/2004) — mesma regra
// duplicada em lib/financialEngine.ts (frontend) e pages/Assets.tsx; ver memória
// project_finvision_2026-07-25_investimentos_revisao.md sobre revisão manual se a
// Receita mudar a alíquota.
function regressiveTaxRate(days: number, isExempt: boolean): number {
  if (isExempt) return 0;
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.20;
  if (days <= 720) return 0.175;
  return 0.15;
}

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
    const isVariableIncome = ['ACOES', 'FIIS', 'CRIPTO'].includes(meta.investmentType);
    const isExempt = !!meta.isTaxExempt || ['LCI_LCA', 'CRI_CRA', 'POUPANCA'].includes(meta.investmentType);

    let daysHeld = 0;
    if (a.acquisition_date) {
      daysHeld = Math.max(0, Math.floor((Date.now() - new Date(a.acquisition_date).getTime()) / 86400000));
    }

    let irTexto: string;
    if (isExempt) {
      irTexto = 'isento';
    } else if (isVariableIncome) {
      irTexto = meta.investmentType === 'FIIS' ? '20% sobre o lucro (ganho de capital)' : '15% sobre o lucro (ganho de capital)';
    } else {
      const taxRate = regressiveTaxRate(daysHeld, false);
      irTexto = `${(taxRate * 100).toFixed(1)}% sobre o lucro (tabela regressiva, ${daysHeld} dias desde a aplicação)`;
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
