// Monta o bloco de texto "INVESTIMENTOS DETALHADOS" que a IA recebe quando pergunta
// pela área de investimentos (tool get_investments_summary do chat e do WhatsApp).
//
// Antes este arquivo fazia as próprias contas e mandava só saldo, vencimento, liquidez
// e IR — sem a TAXA CONTRATADA, sem corretora e sem rentabilidade. Sem a taxa, era
// impossível a IA dizer se um CDB estava rendendo bem ou mal; ela só conseguia
// devolver texto genérico. Agora o cálculo todo vem de portfolio-metrics.ts (fonte
// única, determinística, compartilhada com o relatório completo) e aqui só acontece a
// formatação em texto.

import { buildPortfolioAnalysis, type PortfolioAnalysis } from './portfolio-metrics.js';
import { getMarketIndexes, type MarketIndexes } from './market-indexes.js';

const brl = (v: number) => `R$ ${Number(v || 0).toFixed(2)}`;
const dateBR = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : 'sem data definida');

export async function buildInvestmentsContextSection(
  supabase: any,
  userId: string,
  indexes?: MarketIndexes
): Promise<string> {
  const marketIndexes = indexes || (await getMarketIndexes(supabase, userId));
  const analysis = await buildPortfolioAnalysis(supabase, userId, marketIndexes);
  return formatInvestmentsSection(analysis);
}

export function formatInvestmentsSection(analysis: PortfolioAnalysis): string {
  if (analysis.positions.length === 0) return '';

  const { totals, marketIndexes: idx } = analysis;

  const lines = analysis.positions.map(p => {
    const parts = [
      `- "${p.name}" (${p.type})`,
      `Saldo bruto: ${brl(p.grossValue)}`,
      `Valor aplicado: ${brl(p.appliedValue)}`,
      `Ganho: ${brl(p.gainValue)} (${p.gainPercent}%${p.annualizedGainPercent !== null ? ` · ${p.annualizedGainPercent}% a.a. realizado` : ''})`,
    ];

    if (p.contractedRateLabel) {
      parts.push(`Taxa contratada: ${p.contractedRateLabel} ≈ ${p.contractedAnnualPercent}% a.a.${p.vsCdiPercent !== null ? ` (${p.vsCdiPercent}% do CDI)` : ''}`);
    } else if (!p.isVariableIncome) {
      parts.push('Taxa contratada: NÃO CADASTRADA');
    }
    if (p.realizedVsContractedPP !== null) {
      parts.push(`Realizado x contratado: ${p.realizedVsContractedPP > 0 ? '+' : ''}${p.realizedVsContractedPP} p.p.`);
    }
    if (p.issuer) parts.push(`Emissor: ${p.issuer}`);
    if (p.broker) parts.push(`Corretora: ${p.broker}`);
    if (p.identifier) parts.push(`Identificador: ${p.identifier}`);
    parts.push(`Vencimento: ${dateBR(p.maturityDate)}${p.daysToMaturity !== null ? ` (${p.daysToMaturity} dias)` : ''}`);
    parts.push(`Liquidez: ${p.liquidityLabel}`);
    parts.push(`Rendimento: ${p.payoutType === 'MENSAL' ? 'cupom mensal na conta' : 'acumulado no ativo'}`);
    parts.push(`IR estimado: ${p.isTaxExempt ? 'isento' : `${p.taxRatePercent}% sobre o lucro = ${brl(p.estimatedTaxValue)}`}`);
    parts.push(`Líquido hoje: ${brl(p.netValue)}`);
    parts.push(`FGC: ${p.fgcCovered ? 'coberto' : 'sem cobertura do FGC'}`);
    if (p.flags.length > 0) parts.push(`Sinais: ${p.flags.join(', ')}`);
    if (p.userNote) parts.push(`Nota de plano do usuário: "${p.userNote}"`);

    return parts.join(' | ');
  });

  const allocation = analysis.allocationByType
    .map(a => `${a.type} ${a.percent}% (${brl(a.value)})`)
    .join(' · ');

  const topAlerts = analysis.alerts.slice(0, 6)
    .map(a => `- [${a.severity}] ${a.title}: ${a.detail}`)
    .join('\n');

  return `
# INVESTIMENTOS DETALHADOS
(Use para QUALQUER pergunta sobre investimentos. Todos os números abaixo já estão
calculados — NÃO refaça as contas, apenas interprete. Para uma análise de carteira
completa, com concentração, FGC, liquidez e vencimentos, chame get_portfolio_analysis.)

Índices de mercado em uso: CDI ${idx.cdi}% a.a. · Selic ${idx.selic}% a.a. · IPCA ${idx.ipca}% (12m) — fonte: ${idx.source === 'bcb' ? 'Banco Central' : idx.source === 'user_settings' ? 'Ajustes do usuário' : 'padrão do sistema'}.

Total aplicado: ${brl(totals.applied)} | Saldo bruto: ${brl(totals.gross)} | Líquido de IR: ${brl(totals.net)}
Ganho acumulado: ${brl(totals.gainValue)} (${totals.gainPercent}%${totals.annualizedGainPercent !== null ? ` · ${totals.annualizedGainPercent}% a.a.` : ''})
Taxa média contratada da carteira: ${totals.weightedAvgContractedAnnualPercent !== null ? `${totals.weightedAvgContractedAnnualPercent}% a.a. (${totals.portfolioVsCdiPP !== null && totals.portfolioVsCdiPP >= 0 ? '+' : ''}${totals.portfolioVsCdiPP} p.p. vs CDI)` : 'não calculável — faltam taxas no cadastro'}
Alocação: ${allocation || 'não classificada'}
Liquidez imediata (D+0 + caixa): ${brl(analysis.liquidity.immediateValue + analysis.liquidity.cashInAccountsValue)}
${lines.join('\n')}
${topAlerts ? `\nPontos de atenção já detectados pelo sistema:\n${topAlerts}` : ''}
${analysis.dataGaps.length > 0 ? `\nLacunas de cadastro: ${analysis.dataGaps.join(' ')}` : ''}
`;
}
