import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { recordAiUsage } from './ai-usage.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        threeMonthsAgo.setDate(1);
        const historyStart = threeMonthsAgo.toISOString().split('T')[0];

        const lowerMsg = message.toLowerCase();
        const isFaq = /(exportar|baixar|imprimir|gerar).*(dre|csv|relatório|relatorio)/i.test(lowerMsg) ||
            /(onde|como).*(subcategori|categori)/i.test(lowerMsg);

        if (isFaq) {
            return res.status(200).json({
                reply: `**Resposta Expressa (Guia FinVision) ⚡**\n\n` +
                    `Parece que você tem uma dúvida de navegação. Aqui está o atalho:\n\n` +
                    `• **Para Exportar DRE/CSV:** Acesse a aba superior **"Histórico"**, localize a barra de busca e clique no botão **"Ações"**. Lá estarão as opções de exportação.\n` +
                    `• **Subcategorias:** Vá no menu lateral **"Ajustes" > "Categorias"**. Ao clicar em uma categoria pai, você pode criar subdivisões.\n` +
                    `• **Patrimônio:** Use a aba "Patrimônio" para registrar casas, carros e quitar passivos de longo prazo.`
            });
        }

        const [accountsRes, txRes, cardsRes, assetsRes, liabilitiesRes, historyRes, budgetsRes, goalsRes] = await Promise.all([
            supabase.from('accounts').select('institution, type, current_balance').eq('user_id', userId).eq('is_archived', false),
            supabase.from('transactions')
                .select('amount, type, category, date, description')
                .eq('user_id', userId)
                .is('is_deleted', false)
                .is('is_amortization', false)
                .neq('type', 'ADJUSTMENT')
                .gte('date', filterStart)
                .lte('date', filterEnd)
                .order('date', { ascending: false })
                .limit(200),
            supabase.from('credit_cards').select('brand, limit').eq('user_id', userId),
            supabase.from('physical_assets').select('estimated_value').eq('user_id', userId),
            supabase.from('liabilities').select('remaining_balance, total_amount, type').eq('user_id', userId),
            supabase.from('transactions')
                .select('amount, type, category, date')
                .eq('user_id', userId)
                .is('is_deleted', false)
                .is('is_amortization', false)
                .neq('type', 'ADJUSTMENT')
                .gte('date', historyStart)
                .lt('date', filterStart),
            supabase.from('budgets').select('*').eq('user_id', userId).eq('is_active', true),
            supabase.from('goals').select('*').eq('user_id', userId).order('created_at', { ascending: false })
        ]);

        const accounts = accountsRes.data || [];
        const transactions = txRes.data || [];
        const creditCards = cardsRes.data || [];
        const assetsData = assetsRes.data || [];
        const liabilitiesData = liabilitiesRes.data || [];
        const historicalData = historyRes?.data || [];
        const budgets = budgetsRes.data || [];
        const goals = goalsRes.data || [];

        const totalBalance = accounts.reduce((s: number, a: any) => s + Number(a.current_balance || 0), 0);
        const totalPhysicalAssets = assetsData.reduce((s: number, l: any) => s + Number(l.estimated_value || 0), 0);
        const totalDebt = liabilitiesData.reduce((s: number, l: any) => s + Number(l.remaining_balance || 0), 0);
        const netWorth = totalBalance + totalPhysicalAssets - totalDebt;

        const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        let currentMonthIncome = 0;
        let currentMonthExpense = 0;
        const categorySummary: Record<string, number> = {};

        transactions.forEach((t: any) => {
            if (t.date && t.date.startsWith(currentMonthPrefix)) {
                const amt = Math.abs(Number(t.amount) || 0);
                if (t.type === 'INCOME') {
                    currentMonthIncome += amt;
                } else if (t.type === 'EXPENSE') {
                    currentMonthExpense += amt;
                    categorySummary[t.category] = (categorySummary[t.category] || 0) + amt;
                }
            }
        });

        const topCategories = Object.entries(categorySummary)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([cat, val]) => `${cat}: R$${val.toFixed(2)}`)
            .join(' | ');

        const periodLabel = `De ${filterStart.split('-').reverse().join('/')} até ${filterEnd.split('-').reverse().join('/')}`;

        const histTxs = historicalData.filter((t: any) => t.type === 'EXPENSE') || [];
        const histCategoryTotals: Record<string, number> = {};
        const monthsCaptured = new Set();
        histTxs.forEach((t: any) => {
            const m = t.date.substring(0, 7);
            monthsCaptured.add(m);
            histCategoryTotals[t.category] = (histCategoryTotals[t.category] || 0) + Math.abs(t.amount);
        });
        const numMonths = monthsCaptured.size || 1;
        const historicalAverages = Object.entries(histCategoryTotals)
            .map(([cat, total]) => `${cat}: R$${(total / numMonths).toFixed(2)}/mês`)
            .slice(0, 10).join(' | ');

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
Você é a FinVision AI, a Assistente Financeira Premium do software FinVision Pro.
Tom: Especialista Financeiro executivo, educado, DIRETO e CURTO. Evite introduções longas. Vá direto ao ponto. Use emojis de forma cirúrgica (📊, 💼).

# REGRAS DE OURO (NUNCA VIOLAR)
1. ESCOPO: Você é estritamente financeira. RECUSE-SE a responder sobre temas não relacionados a Finanças, Investimentos ou uso do FinVision Pro.
2. CONCORRENTES: É terminantemente PROIBIDO citar, validar ou comparar o FinVision com concorrentes externos.
3. ALUCINAÇÃO: NUNCA invente funcionalidades que não estão descritas no Manual.
`;

        const systemPrompt = `${baseSystemPrompt}

# CONTEXTO ATUAL
Hoje é ${dataHoje}.
*Período Ativo do Usuário: ${periodLabel}*

# DADOS DO DASHBOARD
• Saldo Consolidado: R$ ${totalBalance.toFixed(2)}
• Entradas: R$ ${currentMonthIncome.toFixed(2)}
• Saídas: R$ ${currentMonthExpense.toFixed(2)}
• Top 5 Despesas: ${topCategories || 'Nenhuma registrada'}

# RAIO-X PATRIMONIAL
• Bens/Ativos: R$ ${totalPhysicalAssets.toFixed(2)}
• Dívidas (Passivos): R$ ${totalDebt.toFixed(2)}
• Patrimônio Líquido: R$ ${netWorth.toFixed(2)}

# TENDÊNCIAS (Médias dos últimos ${numMonths} meses)
• Médias por Categoria: ${historicalAverages || 'Dados insuficientes'}

• Contas Atuais: ${accounts.map((a: any) => `${a.institution}(R$${Number(a.current_balance).toFixed(2)})`).join(', ')}
• Cartões Cadastrados: ${creditCards.map((c: any) => `${c.brand}(Lim:R$${c.limit})`).join(', ') || 'Nenhum'}

# ÚLTIMAS 50 TRANSAÇÕES
${transactions.slice(0, 50).map((t: any) => `- ${t.date.split('T')[0]}|${t.category}|R$${t.amount}|${t.type}`).join('\n')}

# ORÇAMENTOS ATIVOS (BUDGETS)
${budgets.length > 0 ? budgets.map((b: any) => `- Categoria: ${b.category} | Limite: R$ ${Number(b.amount).toFixed(2)} | Período: ${b.period || 'mensal'}`).join('\n') : 'Nenhum orçamento ativo configurado.'}

# METAS FINANCEIRAS (GOALS)
${goals.length > 0 ? goals.map((g: any) => `- Meta: "${g.name}" | Alvo: R$ ${Number(g.target_amount).toFixed(2)} | Atual: R$ ${Number(g.current_amount).toFixed(2)} | Prazo: ${g.deadline || 'sem prazo'} | Status: ${g.is_completed ? 'Concluída' : 'Em andamento'}`).join('\n') : 'Nenhuma meta financeira configurada.'}

# DIRETRIZES DE INTELIGÊNCIA FINANCEIRA AVANÇADA (PLANEJAMENTO, ALAVANCAGEM E PESQUISA)
1. **Consulta à Internet (Google Search Grounding)**:
   - Você tem acesso à pesquisa na internet em tempo real.
   - Use esta ferramenta sempre que o usuário pedir cotações atuais, taxas de juros macroeconômicas (taxa Selic, CDI, inflação/IPCA), notícias financeiras brasileiras recentes ou regras fiscais/tributárias vigentes.
   - Restrinja o uso de buscas na web a assuntos puramente macroeconômicos e de mercado financeiro relevante (Selic, CDI, IPCA, cotação do dólar/euro/ações, inflação, regras fiscais). Não faça buscas sobre assuntos gerais irrelevantes.
2. **Planejamento de Longo Prazo e Crescimento**:
   - Ajude o usuário a pensar em como poupar, investir e crescer seu patrimônio de forma consistente.
   - Recomende e explique estratégias clássicas de organização como a regra 50/30/20 (50% necessidades, 30% desejos, 20% poupança/investimentos).
3. **Amortização e Quitação de Dívidas (Passivos)**:
   - Se o usuário tiver passivos (liabilities) ou dívidas relatadas, oriente-o em estratégias de quitação acelerada.
   - Explique os métodos:
     - **Método Bola de Neve (Snowball)**: Pagar primeiro as menores dívidas para obter vitórias psicológicas rápidas.
     - **Método Avalanche**: Pagar primeiro as dívidas com as maiores taxas de juros para economizar dinheiro no longo prazo.
4. **Alavancagem de Passivos e Estratégia**:
   - Ajude o usuário a analisar de forma crítica se as suas dívidas e financiamentos são passivos saudáveis ou se estão drenando sua liquidez.
   - Forneça simulações, cenários de alavancagem inteligente (usar capital de terceiros a taxas baixas para gerar retornos maiores), e explique como renegociar contratos ou amortizar saldos devedores usando FGTS ou aportes extraordinários.`;

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

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            config: {
                systemInstruction: systemPrompt,
                temperature: 0.4,
                tools: [{ googleSearch: {} }] // Ativação nativa da pesquisa Google
            }
        });
        await recordAiUsage(supabase, 'chat', userId, response, 'gemini-2.5-flash');

        const rawText = (response as any).text || (response as any).candidates?.[0]?.content?.parts?.[0]?.text || '';

        return res.status(200).json({ reply: rawText });

    } catch (err: any) {
        console.error('[FinVisionChat] Erro Crítico:', err);
        return res.status(200).json({ 
            reply: `**Ops, tivemos um probleminha técnico!** 🤖\n\n` +
                   `Não consegui processar sua análise agora. Isso pode ser devido a uma instabilidade na API da Inteligência Artificial ou nos dados do Supabase.\n\n` +
                   `**Detalhes do erro:** \`${err.message}\`\n\n` +
                   `Por favor, tente novamente em alguns instantes.`
        });
    }
}
