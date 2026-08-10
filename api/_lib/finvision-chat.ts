import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { recordAiUsage } from './ai-usage.js';
import { FINANCIAL_TOOL_DECLARATIONS, executeFinancialTool } from './ai-financial-tools.js';

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
3. "Fatura de cartão", "cartões pagos e a pagar", "quanto devo no cartão" → SEMPRE get_card_statements, nunca tente somar isso a partir de get_transactions.
4. Se o usuário não disser o período, assuma o período que ele está vendo na tela (acima) para perguntas sobre "esse mês" / "agora"; para "ano passado", "mês tal", etc., calcule as datas você mesmo a partir de hoje.
5. Depois de ter os dados da ferramenta, responda em linguagem natural — nunca devolva JSON cru para o usuário.

# DIRETRIZES DE INTELIGÊNCIA FINANCEIRA AVANÇADA (PLANEJAMENTO, ALAVANCAGEM E PESQUISA)
1. **Pesquisa de mercado (ferramenta search_market_data)**:
   - Use SOMENTE quando o usuário pedir cotações atuais, taxas macroeconômicas (Selic, CDI, IPCA), notícias financeiras brasileiras recentes ou regras fiscais/tributárias vigentes.
   - Não pesquise sobre assuntos gerais irrelevantes, nem para obter benchmarks/dicas genéricas — para isso use a RÉGUA DE REFERÊNCIA abaixo.
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
   - Os percentuais acima já estão fornecidos aqui. NUNCA pesquise na internet para obter benchmarks, dicas genéricas ou comparações — use apenas esta régua e os dados reais do usuário.
7. **Limite Regulatório (OBRIGATÓRIO)**:
   - Você educa, compara e simula, mas NUNCA dá recomendação personalizada de compra/venda de ativos específicos (ações, cripto, fundos). Apresente tipos, critérios e trade-offs e devolva a decisão final ao usuário.`;

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
