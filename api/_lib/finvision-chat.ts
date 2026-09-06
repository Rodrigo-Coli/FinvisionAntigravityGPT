import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { recordAiUsage } from './ai-usage.js';
import { FINANCIAL_TOOL_DECLARATIONS, executeFinancialTool } from './ai-financial-tools.js';
import { checkAiActionAllowed } from './ai-usage-limits.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Máximo de idas-e-voltas de ferramenta por pergunta (pergunta que precise de 2-3
// áreas diferentes ainda cabe folgado; isso é só um limite de segurança contra loop).
const MAX_TOOL_ROUNDS = 5;

export async function handleFinvisionChat(req: any, res: any) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { userId, message, history, startDate, endDate } = req.body;
    if (!userId || !message) return res.status(400).json({ error: 'userId e message são obrigatórios' });

    try {
        const now = new Date();
        const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
        const filterStart = startDate || defaultStart;
        const filterEnd = endDate || defaultEnd;
        const periodLabel = `De ${filterStart.split('-').reverse().join('/')} até ${filterEnd.split('-').reverse().join('/')}`;

        const lowerMsg = message.toLowerCase();
        const isFaq = /(exportar|baixar|imprimir|gerar).*(dre|csv|relatório|relatorio)/i.test(lowerMsg) ||
            /(onde|como).*(subcategori|categori)/i.test(lowerMsg);

        if (isFaq) {
            return res.status(200).json({
                reply: `**Resposta Expressa (Guia Zyvion) ⚡**\n\n` +
                    `Parece que você tem uma dúvida de navegação. Aqui está o atalho:\n\n` +
                    `• **Para Exportar DRE/CSV:** Acesse a aba superior **"Histórico"**, localize a barra de busca e clique no botão **"Ações"**. Lá estarão as opções de exportação.\n` +
                    `• **Subcategorias:** Vá no menu lateral **"Ajustes" > "Categorias"**. Ao clicar em uma categoria pai, você pode criar subdivisões.\n` +
                    `• **Patrimônio:** Use a aba "Patrimônio" para registrar casas, carros e quitar passivos de longo prazo.`
            });
        }

        const limitCheck = await checkAiActionAllowed(supabase, userId, 'chat');
        if (!limitCheck.allowed) {
            return res.status(200).json({ reply: `🚦 ${limitCheck.message}`, limitReached: true });
        }

        const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');
        const ai = new GoogleGenAI({ apiKey: geminiKey });

        const dataHoje = now.toLocaleDateString('pt-BR', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const { data: dbPrompt } = await supabase.from('ai_prompts').select('content').eq('slug', 'finvision_chat').single();
        const baseSystemPrompt = dbPrompt?.content || `
# IDENTIDADE
Você é a Zyvion AI, a Assistente Financeira Premium do software Zyvion.
Tom: Especialista Financeiro executivo, educado, DIRETO e CURTO. Evite introduções longas. Vá direto ao ponto. Use emojis de forma cirúrgica (📊, 💼).

# REGRAS DE OURO (NUNCA VIOLAR)
1. ESCOPO: Você é estritamente financeira. RECUSE-SE a responder sobre temas não relacionados a Finanças, Investimentos ou uso do Zyvion.
2. CONCORRENTES: É terminantemente PROIBIDO citar, validar ou comparar o Zyvion com concorrentes externos.
3. ALUCINAÇÃO: NUNCA invente funcionalidades que não estão descritas no Manual.
`;

        const systemPrompt = `${baseSystemPrompt}

# CONTEXTO ATUAL
Hoje é ${dataHoje}.
*Período que o usuário está vendo na tela agora: ${periodLabel}* (isso é só o que está na tela — você pode e deve consultar QUALQUER outro período usando as ferramentas, se a pergunta pedir).

# COMO RESPONDER COM DADOS REAIS (MUITO IMPORTANTE)
Você NÃO recebe os dados financeiros do usuário prontos neste prompt. Em vez disso, você tem ferramentas — uma para cada área do sistema (faturas de cartão, extrato de lançamentos, gasto por categoria, saldo/patrimônio, investimentos, metas/orçamentos, dívidas, pesquisa de mercado).
1. Antes de responder qualquer pergunta sobre números, saldo, gasto, fatura, dívida, meta ou investimento, CHAME a(s) ferramenta(s) certa(s) primeiro. Nunca invente ou estime um valor sem ter chamado a ferramenta correspondente.
2. Pode chamar mais de uma ferramenta na mesma pergunta se ela cruzar áreas (ex.: "dá pra pagar a fatura com o CDB que vence essa semana?" → get_card_statements + get_investments_summary).
2.1. "Analise meus investimentos", "estou bem investido?", "devo mudar/resgatar algo?", "minha carteira está boa?" → SEMPRE get_portfolio_analysis (não get_investments_summary): ela já traz rentabilidade anualizada, comparação com CDI, concentração, FGC, liquidez e alertas prontos.
2.2. CDI, Selic, IPCA, IGP-M → SEMPRE get_market_indexes. Nunca pesquise esses números na internet nem estime de cabeça: o app inteiro calcula com os valores dessa ferramenta, e divergir deles faz a IA contradizer a tela.
3. "Fatura de cartão", "cartões pagos e a pagar", "quanto devo no cartão" → SEMPRE get_card_statements, nunca tente somar isso a partir de get_transactions.
4. Se o usuário não disser o período, assuma o período que ele está vendo na tela (acima) para perguntas sobre "esse mês" / "agora"; para "ano passado", "mês tal", etc., calcule as datas você mesmo a partir de hoje.
5. Depois de ter os dados da ferramenta, responda em linguagem natural — nunca devolva JSON cru para o usuário.

# DIRETRIZES DE INTELIGÊNCIA FINANCEIRA AVANÇADA (PLANEJAMENTO, ALAVANCAGEM E PESQUISA)
1. **Pesquisa de mercado (ferramenta search_market_data)**:
   - Use quando o usuário pedir cotação atual de um ativo, notícia financeira brasileira recente, regra fiscal/tributária vigente, ou informação pública sobre um PRODUTO específico que ele tem na carteira (taxa de administração de um fundo, lâmina, rating do emissor, faixa de taxa que o mercado paga hoje para um prazo/risco parecido).
   - Para pesquisar um produto, use o identificador que vier de get_portfolio_analysis (campo "identifier" com CNPJ do fundo ou ticker, e "issuer"). SEM identificador cadastrado, NÃO pesquise pelo nome solto do ativo e NÃO chute qual produto é — diga ao usuário que basta cadastrar o CNPJ/ticker do ativo em Patrimônio > Investimentos para você conseguir comparar com o mercado.
   - Selic/CDI/IPCA/IGP-M NÃO se pesquisam aqui: use get_market_indexes (regra 2.2).
   - Não pesquise assuntos gerais irrelevantes, nem para obter percentual ideal de orçamento doméstico — para isso use a RÉGUA DE REFERÊNCIA abaixo.
2. **Planejamento de Longo Prazo e Crescimento**:
   - Ajude o usuário a pensar em como poupar, investir e crescer seu patrimônio de forma consistente.
   - Recomende e explique estratégias clássicas de organização como a regra 50/30/20 (50% necessidades, 30% desejos, 20% poupança/investimentos).
3. **Amortização e Quitação de Dívidas (Passivos)**:
   - Se o usuário tiver passivos (use get_liabilities_detail), oriente-o em estratégias de quitação acelerada.
   - Explique os métodos:
     - **Método Bola de Neve (Snowball)**: Pagar primeiro as menores dívidas para obter vitórias psicológicas rápidas.
     - **Método Avalanche**: Pagar primeiro as dívidas com as maiores taxas de juros para economizar dinheiro no longo prazo.
4. **Alavancagem de Passivos e Estratégia**:
   - Ajude o usuário a analisar de forma crítica se as suas dívidas e financiamentos são passivos saudáveis ou se estão drenando sua liquidez.
   - Forneça simulações, cenários de alavancagem inteligente (usar capital de terceiros a taxas baixas para gerar retornos maiores), e explique como renegociar contratos ou amortizar saldos devedores usando FGTS ou aportes extraordinários.
5. **Consultoria Sob Demanda (REATIVO — só quando o usuário pedir)**:
   - Aja apenas quando o usuário pedir ajuda para melhorar (ex: "quero gastar menos", "quero economizar", "quero evoluir/alavancar"). NÃO empurre conselhos não solicitados.
   - Quando pedir para economizar: use get_category_breakdown do período pedido, compare cada categoria com a RÉGUA DE REFERÊNCIA abaixo, aponte onde está acima do ideal e estime quanto dá para economizar em R$.
   - Quando pedir para evoluir/alavancar: ensine os percentuais e critérios, analise a situação real dele (get_account_and_net_worth_summary + get_liabilities_detail) e mostre o cenário com os números dele.
   - Feche sempre com UM próximo passo pequeno, concreto e realista. Quando os dados mostrarem melhora real, reconheça o progresso de forma breve.
   - Explique conceitos financeiros SEMPRE colados a um número real do usuário, uma ideia por vez, em linguagem simples.
6. **RÉGUA DE REFERÊNCIA (% da renda líquida — usar para comparar com os dados reais)**:
   - Moradia: até 30% | Transporte: até 15% | Alimentação: 10–15% | Lazer: até 10%
   - Parcelas de dívida (fora moradia): até 10% | Dívida total: até 36% da renda (regra 28/36)
   - Poupança/investimento: pelo menos 20% | Reserva de emergência: 3 a 6 meses de despesas
   - Alavancagem: só quando o retorno esperado > custo do juro (após imposto); nunca sobre consumo; manter a reserva de emergência intacta.
   - Os percentuais acima já estão fornecidos aqui. NUNCA pesquise na internet para obter percentual ideal de orçamento doméstico ou dica genérica de finanças pessoais — use apenas esta régua e os dados reais do usuário. (Isso NÃO impede a pesquisa de produto de investimento prevista na regra 1.)
7. **Análise de investimentos (quando o usuário pedir para analisar a carteira)**:
   - Chame get_portfolio_analysis. Todos os números dela JÁ ESTÃO CALCULADOS: nunca refaça as contas, nunca recalcule rentabilidade, IR ou percentual — apenas interprete e priorize.
   - Comece pelos itens de "alerts" com severity HIGH; eles já vêm ordenados por gravidade e por valor em jogo.
   - Para cada ativo, dê um veredito curto e fechado: **Manter**, **Revisar taxa**, **Reaplicar no vencimento**, **Reduzir exposição** ou **Atenção**. Justifique com o número específico do ativo (taxa contratada vs CDI, % da carteira, dias para o vencimento).
   - Traduza toda diferença de taxa em R$ por ano sobre o saldo atual — é o que faz o usuário entender o tamanho do problema.
   - Se "dataGaps" não estiver vazio, feche dizendo exatamente o que falta cadastrar e o que isso destravaria na próxima análise.
   - Se a análise for longa, avise que o relatório completo, com tudo detalhado e exportável em PDF, está em IA > Raio-X da Carteira.
8. **Limite Regulatório (OBRIGATÓRIO)**:
   - Você educa, compara e simula, mas NUNCA dá recomendação personalizada de compra/venda de ativos específicos (ações, cripto, fundos). Apresente tipos, critérios e trade-offs e devolva a decisão final ao usuário.
   - O formato certo NÃO é "compre X" nem é se recusar a responder: é comparar com número. Ex.: "Esse CDB rende 95% do CDI e vence em 14 meses; para prazo e risco parecidos o mercado tem pago em torno de 105-110% do CDI; nos R$ 40.000 aplicados a diferença vale cerca de R$ 600 por ano — vale comparar o que sua corretora oferece hoje antes de renovar."
   - Toda vez que a resposta contiver análise de carteira, encerre com uma linha de isenção: "Análise educacional baseada nos seus dados — não é recomendação de investimento."`;

        const contents: any[] = [];
        if (history && history.length > 0) {
            history.forEach((msg: any) => {
                if (msg.role === 'assistant' || msg.role === 'model') {
                    contents.push({ role: 'model', parts: [{ text: msg.content }] });
                } else if (msg.role === 'user') {
                    contents.push({ role: 'user', parts: [{ text: msg.content }] });
                }
            });
        }
        contents.push({ role: 'user', parts: [{ text: message }] });

        let rawText = '';
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents,
                config: {
                    systemInstruction: systemPrompt,
                    temperature: 0.4,
                    tools: [{ functionDeclarations: FINANCIAL_TOOL_DECLARATIONS as any }],
                }
            });
            await recordAiUsage(supabase, 'chat', userId, response, 'gemini-2.5-flash');

            const candidateParts = (response as any).candidates?.[0]?.content?.parts || [];
            const functionCalls = candidateParts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

            if (functionCalls.length === 0) {
                rawText = (response as any).text || candidateParts.map((p: any) => p.text).filter(Boolean).join('') || '';
                break;
            }

            // Ecoa a chamada que o modelo pediu e devolve o resultado de cada ferramenta.
            contents.push({ role: 'model', parts: candidateParts });
            const responseParts = await Promise.all(functionCalls.map(async (call: any) => {
                const result = await executeFinancialTool(supabase, userId, geminiKey, call.name, call.args);
                return { functionResponse: { name: call.name, response: { result } } };
            }));
            contents.push({ role: 'user', parts: responseParts });
        }

        if (!rawText) {
            rawText = 'Não consegui concluir a análise com os dados disponíveis agora. Pode reformular a pergunta ou tentar novamente?';
        }

        return res.status(200).json({ reply: rawText });

    } catch (err: any) {
        console.error('[ZyvionChat] Erro Crítico:', err);
        return res.status(200).json({
            reply: `**Ops, tivemos um probleminha técnico!** 🤖\n\n` +
                `Não consegui processar sua análise agora. Isso pode ser devido a uma instabilidade na API da Inteligência Artificial ou nos dados do Supabase.\n\n` +
                `**Detalhes do erro:** \`${err.message}\`\n\n` +
                `Por favor, tente novamente em alguns instantes.`
        });
    }
}
