// Raio-X da Carteira: relatório profundo de investimentos.
//
// Por que é um endpoint próprio e não um turno do chat: um pedido do tipo "analise
// meus investimentos e diga se devo mudar algo" não cabe em uma resposta de chat —
// precisa de estrutura fixa, de todos os ativos de uma vez, e de um resultado que o
// usuário possa guardar e exportar. O chat continua respondendo perguntas pontuais
// pela tool get_portfolio_analysis; aqui é o dossiê.
//
// Divisão de trabalho (a regra que sustenta a qualidade da resposta):
//   · portfolio-metrics.ts calcula TODOS os números (determinístico, testável);
//   · market-indexes.ts garante CDI/Selic/IPCA reais do Banco Central;
//   · a IA só interpreta, prioriza e escreve — ela nunca faz conta.

import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { recordAiUsage } from './ai-usage.js';
import { checkAiActionAllowed } from './ai-usage-limits.js';
import { getMarketIndexes } from './market-indexes.js';
import { buildPortfolioAnalysis, type PortfolioAnalysis } from './portfolio-metrics.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const MODEL = 'gemini-2.5-flash';
// Pesquisa externa é cara e lenta: só os maiores ativos que realmente dependem de
// informação pública (fundo, ação, FII, cripto, previdência) e só com identificador.
const MAX_RESEARCH_TARGETS = 5;

const DEFAULT_SYSTEM_PROMPT = `# IDENTIDADE
Você é o Zyvion Portfolio Advisor, o analista de carteira do app Zyvion. Escreve como um
private banker sênior: direto, específico, sem enrolação e sem entusiasmo vazio.

# REGRA ZERO (A MAIS IMPORTANTE)
Todos os números do bloco DADOS já foram calculados pelo sistema. NUNCA recalcule,
NUNCA estime e NUNCA invente um valor que não esteja lá. Se um dado não existe, diga que
falta cadastrar — não preencha o buraco com suposição.

# TOM E FORMATO
- Markdown, com as seções exatas pedidas abaixo, nessa ordem.
- Valores sempre em reais formatados (R$ 12.345,67) e percentuais com no máximo 2 casas.
- Frases curtas. Zero introdução do tipo "vamos analisar juntos".
- Nunca cite "Gemini", "Google" ou qualquer IA. Você é o Zyvion.

# LIMITE REGULATÓRIO (OBRIGATÓRIO)
Você NÃO é consultor de valores mobiliários registrado na CVM e NÃO dá recomendação
personalizada de compra ou venda de ativo específico. O formato certo não é "compre X"
nem se recusar a analisar: é comparar com número e devolver a decisão ao usuário.
Exemplo do que fazer: "Esse CDB rende 95% do CDI e vence em 14 meses; para prazo e risco
parecidos o mercado tem pago em torno de 105-110% do CDI; sobre os R$ 40.000 aplicados
a diferença vale cerca de R$ 600 por ano — vale comparar com o que sua corretora oferece
antes de renovar."

# ESTRUTURA OBRIGATÓRIA DO RELATÓRIO
## 1. Veredito em uma linha
Uma frase dizendo se a carteira está saudável, aceitável ou exige ação, e por quê.

## 2. Como sua carteira está rendendo
Rentabilidade da carteira, taxa média contratada, comparação com o CDI vigente e o que
isso significa em R$ por ano. Diga explicitamente se está acima, na linha ou abaixo do CDI.

## 3. Ativo por ativo
Uma linha por ativo, cada uma começando por um veredito em negrito entre estes cinco:
**Manter**, **Revisar taxa**, **Reaplicar no vencimento**, **Reduzir exposição**, **Atenção**.
Depois do veredito, a justificativa com o número específico daquele ativo.

## 4. Riscos da carteira
Concentração, cobertura do FGC, liquidez e reserva de emergência. Use os alertas
recebidos, do mais grave para o menos grave, com o valor em jogo de cada um.

## 5. O que fazer nos próximos 30 dias
No máximo 3 ações, ordenadas por impacto em R$. Cada uma concreta e executável pelo
usuário sozinho. Se não houver nada urgente, diga isso em vez de inventar tarefa.

## 6. O que falta cadastrar
Só se houver lacunas. Diga o que falta e o que isso destravaria na próxima análise.

Encerre com a linha exata:
_Análise educacional baseada nos seus próprios dados — não é recomendação de investimento._`;

function buildDataBlock(analysis: PortfolioAnalysis, research: string | null): string {
  const idx = analysis.marketIndexes;
  const sourceLabel = idx.source === 'bcb'
    ? `Banco Central${idx.updatedAt ? `, atualizado em ${new Date(idx.updatedAt).toLocaleDateString('pt-BR')}` : ''}`
    : idx.source === 'user_settings' ? 'configurado pelo usuário em Ajustes' : 'padrão do sistema (não confirmado)';

  const t = analysis.totals;
  const ef = analysis.emergencyFund;
  const lq = analysis.liquidity;

  const positions = analysis.positions.map(p => {
    const bits = [
      `• ${p.name} (${p.type})`,
      `aplicado R$ ${p.appliedValue.toFixed(2)}`,
      `saldo bruto R$ ${p.grossValue.toFixed(2)}`,
      `líquido de IR R$ ${p.netValue.toFixed(2)}`,
      `ganho R$ ${p.gainValue.toFixed(2)} (${p.gainPercent}%)`,
      p.annualizedGainPercent !== null ? `realizado ${p.annualizedGainPercent}% a.a.` : 'sem tempo suficiente para anualizar',
      p.contractedRateLabel ? `taxa contratada ${p.contractedRateLabel} = ${p.contractedAnnualPercent}% a.a.` : 'SEM TAXA CADASTRADA',
      p.vsCdiPercent !== null ? `${p.vsCdiPercent}% do CDI` : null,
      p.realizedVsContractedPP !== null ? `realizado x contratado ${p.realizedVsContractedPP} p.p.` : null,
      p.issuer ? `emissor ${p.issuer}` : null,
      p.broker ? `corretora ${p.broker}` : null,
      p.identifier ? `identificador ${p.identifier}` : null,
      `${p.daysHeld} dias em carteira`,
      p.maturityDate ? `vence em ${p.maturityDate} (${p.daysToMaturity} dias)` : 'sem vencimento',
      `liquidez ${p.liquidityLabel}`,
      p.payoutType === 'MENSAL' ? 'paga cupom mensal na conta (o saldo do ativo NÃO acumula o rendimento, então o realizado subestima o retorno)' : 'rendimento acumulado no ativo',
      `IR ${p.isTaxExempt ? 'isento' : `${p.taxRatePercent}% do lucro = R$ ${p.estimatedTaxValue.toFixed(2)}`}`,
      p.fgcCovered ? 'coberto pelo FGC' : 'SEM cobertura do FGC',
      `${p.grossValue > 0 && t.gross > 0 ? ((p.grossValue / t.gross) * 100).toFixed(2) : '0'}% da carteira`,
      p.flags.length ? `sinais: ${p.flags.join(', ')}` : null,
      p.userNote ? `nota do usuário: "${p.userNote}"` : null,
    ].filter(Boolean);
    return bits.join(' | ');
  }).join('\n');

  const alerts = analysis.alerts.length
    ? analysis.alerts.map(a => `• [${a.severity}] ${a.title} — ${a.detail}${a.valueAtStake ? ` (valor em jogo: R$ ${a.valueAtStake.toFixed(2)})` : ''}`).join('\n')
    : '• Nenhum alerta automático disparado.';

  const maturities = analysis.maturities.next90Days.length
    ? analysis.maturities.next90Days.map(m => `• ${m.name}: vence em ${m.daysToMaturity} dias (${m.date}), R$ ${m.grossValue.toFixed(2)}`).join('\n')
    : '• Nenhum vencimento nos próximos 90 dias.';

  return `# DADOS (já calculados — apenas interprete)

## Índices vigentes
CDI ${idx.cdi}% a.a. | Selic ${idx.selic}% a.a. | IPCA 12m ${idx.ipca}% | IGP-M 12m ${idx.igpm}%
Fonte: ${sourceLabel}.

## Consolidado da carteira
Total aplicado: R$ ${t.applied.toFixed(2)}
Saldo bruto: R$ ${t.gross.toFixed(2)}
Líquido de IR estimado: R$ ${t.net.toFixed(2)} (IR estimado R$ ${t.estimatedTaxValue.toFixed(2)})
Ganho acumulado: R$ ${t.gainValue.toFixed(2)} (${t.gainPercent}%)${t.annualizedGainPercent !== null ? ` — equivalente a ${t.annualizedGainPercent}% a.a.` : ''}
Taxa média contratada ponderada: ${t.weightedAvgContractedAnnualPercent !== null ? `${t.weightedAvgContractedAnnualPercent}% a.a. (${t.portfolioVsCdiPP !== null && t.portfolioVsCdiPP >= 0 ? '+' : ''}${t.portfolioVsCdiPP} p.p. em relação ao CDI)` : 'não calculável — faltam taxas no cadastro'}

## Alocação por classe
${analysis.allocationByType.map(a => `• ${a.type}: R$ ${a.value.toFixed(2)} (${a.percent}%, ${a.positions} ativo(s))`).join('\n') || '• Sem classificação.'}

## Alocação por corretora
${analysis.allocationByBroker.map(a => `• ${a.broker}: R$ ${a.value.toFixed(2)} (${a.percent}%)`).join('\n') || '• Sem corretora vinculada.'}

## Concentração
Maior posição: ${analysis.concentration.largestPositionName || '—'} com ${analysis.concentration.largestPositionPercent}% da carteira
Top 3 posições: ${analysis.concentration.top3Percent}%
Maior classe: ${analysis.concentration.largestTypeName || '—'} com ${analysis.concentration.largestTypePercent}%

## FGC (teto de R$ 250.000 por CPF/instituição e R$ 1.000.000 a cada 4 anos)
Total coberto: R$ ${analysis.fgc.totalCoveredValue.toFixed(2)} | Excedente sem cobertura: R$ ${analysis.fgc.excessValue.toFixed(2)} | Emissores acima do teto: ${analysis.fgc.issuersOverLimit}
${analysis.allocationByIssuer.map(i => `• ${i.issuer}: R$ ${i.value.toFixed(2)} (coberto R$ ${i.fgcCovered.toFixed(2)}, descoberto R$ ${i.fgcExcess.toFixed(2)})`).join('\n') || '• Nenhum ativo elegível ao FGC.'}

## Liquidez
Resgate imediato (D+0): R$ ${lq.immediateValue.toFixed(2)} (${lq.immediatePercent}% da carteira líquida)
Em até 30 dias: R$ ${lq.upTo30DaysValue.toFixed(2)} | Em até 90 dias: R$ ${lq.upTo90DaysValue.toFixed(2)}
Preso até o vencimento: R$ ${lq.onlyAtMaturityValue.toFixed(2)} (${lq.onlyAtMaturityPercent}%)
Saldo em conta corrente/poupança/dinheiro: R$ ${lq.cashInAccountsValue.toFixed(2)}

## Reserva de emergência
Gasto mensal médio (90 dias): R$ ${ef.avgMonthlyExpense.toFixed(2)}
Alvo de 6 meses: R$ ${ef.targetValue.toFixed(2)}
Disponível de imediato (D+0 + caixa): R$ ${ef.availableValue.toFixed(2)}
Cobertura: ${ef.monthsCovered !== null ? `${ef.monthsCovered} meses` : 'não calculável (sem despesas lançadas)'} | Falta: R$ ${ef.gapValue.toFixed(2)}

## Vencimentos nos próximos 90 dias
${maturities}
Prazo médio ponderado até o vencimento: ${analysis.maturities.weightedAvgDaysToMaturity !== null ? `${analysis.maturities.weightedAvgDaysToMaturity} dias` : 'não calculável'}

## Ativos
${positions}

## Alertas automáticos (ordenados por gravidade e valor em jogo)
${alerts}

## Lacunas de cadastro
${analysis.dataGaps.length ? analysis.dataGaps.map(g => `• ${g}`).join('\n') : '• Nenhuma — o cadastro está completo.'}
${research ? `\n## Pesquisa de mercado sobre os produtos do usuário\n(Informação pública, coletada agora. Trate como referência, não como certeza; se contradisser os dados do usuário, prevalecem os dados do usuário.)\n${research}` : ''}`;
}

/**
 * Pesquisa pública sobre os produtos que só uma fonte externa sabe avaliar (fundo,
 * ação, FII, cripto, previdência). Só roda para ativos COM identificador cadastrado —
 * pesquisar pelo nome solto ("meu fundo de ações") traria o produto errado, e um
 * produto errado no relatório é pior do que a ausência da informação.
 */
async function researchProducts(ai: GoogleGenAI, userId: string, analysis: PortfolioAnalysis): Promise<string | null> {
  const targets = analysis.researchTargets
    .filter(t => t.identifier)
    .slice(0, MAX_RESEARCH_TARGETS);
  if (targets.length === 0) return null;

  const list = targets
    .map(t => `- ${t.name} (${t.type}) — identificador: ${t.identifier}${t.issuer ? `, emissor/gestora: ${t.issuer}` : ''}`)
    .join('\n');

  const query = `Para cada ativo brasileiro abaixo, identificado pelo CNPJ ou ticker, traga em no máximo 3 linhas por ativo: nome oficial, taxa de administração e de performance (se for fundo), rentabilidade recente divulgada e principal característica de risco. Se não encontrar dado confiável para algum, escreva "sem dado público confiável" para ele — não invente.\n\n${list}`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: { tools: [{ googleSearch: {} }], temperature: 0.2 },
    });
    await recordAiUsage(supabase, 'ai_tool_search_market_data', userId, response, MODEL);
    const text = (response as any).text
      || (response as any).candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join('')
      || '';
    return text || null;
  } catch (e: any) {
    console.warn('[PortfolioAdvisor] Pesquisa de produtos falhou (seguindo sem ela):', e?.message || e);
    return null;
  }
}

export async function handleInvestmentAnalysis(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, withMarketResearch } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

  try {
    const limitCheck = await checkAiActionAllowed(supabase, userId, 'investment_analysis');
    if (!limitCheck.allowed) {
      return res.status(429).json({ error: limitCheck.message, limitReached: true });
    }

    const indexes = await getMarketIndexes(supabase, userId);
    const analysis = await buildPortfolioAnalysis(supabase, userId, indexes);

    if (analysis.positions.length === 0) {
      return res.status(200).json({
        analysis: `## Nenhum investimento cadastrado\n\nPara o Raio-X funcionar, cadastre suas aplicações em **Patrimônio > Investimentos**. Quanto mais completo o cadastro (taxa contratada, emissor, vencimento e liquidez), mais fundo o relatório consegue ir.`,
        metrics: null,
        indexes,
      });
    }

    const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');
    const ai = new GoogleGenAI({ apiKey: geminiKey });

    const research = withMarketResearch === false ? null : await researchProducts(ai, userId, analysis);

    const { data: dbPrompt } = await supabase
      .from('ai_prompts').select('content').eq('slug', 'investment_analysis').maybeSingle();
    const systemPrompt = dbPrompt?.content || DEFAULT_SYSTEM_PROMPT;

    const hoje = new Date().toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' });
    const userPrompt = `Hoje é ${hoje}. Gere o relatório completo da carteira deste usuário seguindo exatamente a estrutura definida.\n\n${buildDataBlock(analysis, research)}`;

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: { systemInstruction: systemPrompt, temperature: 0.35 },
    });
    await recordAiUsage(supabase, 'investment_analysis', userId, response, MODEL);

    const rawText = (response as any).text
      || (response as any).candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join('')
      || '';
    if (!rawText) throw new Error('A análise voltou vazia. Tente novamente em alguns instantes.');

    return res.status(200).json({
      analysis: rawText,
      indexes,
      researched: !!research,
      // O front desenha os cartões a partir daqui, com os MESMOS números que a IA leu —
      // se o texto e o cartão divergirem, o cartão é a verdade.
      metrics: {
        totalApplied: analysis.totals.applied,
        totalGross: analysis.totals.gross,
        totalNet: analysis.totals.net,
        gainValue: analysis.totals.gainValue,
        gainPercent: analysis.totals.gainPercent,
        annualizedGainPercent: analysis.totals.annualizedGainPercent,
        weightedAvgContractedAnnualPercent: analysis.totals.weightedAvgContractedAnnualPercent,
        portfolioVsCdiPP: analysis.totals.portfolioVsCdiPP,
        cdi: indexes.cdi,
        positionsCount: analysis.positions.length,
        highSeverityAlerts: analysis.alerts.filter(a => a.severity === 'HIGH').length,
        emergencyMonthsCovered: analysis.emergencyFund.monthsCovered,
        largestPositionPercent: analysis.concentration.largestPositionPercent,
        fgcExcessValue: analysis.fgc.excessValue,
        alerts: analysis.alerts.slice(0, 8),
        dataGaps: analysis.dataGaps,
        generatedAt: analysis.generatedAt,
      },
    });
  } catch (err: any) {
    console.error('[PortfolioAdvisor] Erro:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Erro ao gerar a análise da carteira.' });
  }
}
