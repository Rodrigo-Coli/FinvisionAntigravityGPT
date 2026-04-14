import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: any, res: any) {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).send('ok');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { userId, message, history, startDate, endDate } = req.body;
    if (!userId || !message) return res.status(400).json({ error: 'userId e message são obrigatórios' });

    try {
        // ... (resto do código preservado exatamente igual)
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

        const [accountsRes, txRes, cardsRes, assetsRes, liabilitiesRes, historyRes] = await Promise.all([
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
                .lt('date', filterStart)
        ]);

        const accounts = accountsRes.data || [];
        const transactions = txRes.data || [];
        const creditCards = cardsRes.data || [];
        const assetsData = assetsRes.data || [];
        const liabilitiesData = liabilitiesRes.data || [];
        const historicalData = historyRes?.data || [];

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

        const systemPrompt = `# IDENTIDADE V2
Você é a FinVision AI, a Assistente Financeira Premium e o "Private Banker" definitivo do software FinVision Pro.
Tom: Especialista Financeiro executivo, extremamente educado, NATURAL, DIRETO e CURTO. Evite introduções longas ou explicações óbvias. Vá direto ao ponto.
Objetivo: Leia os dados do usuário, analise tendências históricas e ajude-o a usar a plataforma. Use emojis de forma cirúrgica (📊, 💼).

# PERSONALIDADE E REGRAS DE RESPOSTA
1. Linguagem de "Papo Reto": O usuário é ocupado. Se ele perguntar "Quanto gastei?", não diga "Baseado nos dados carregados do seu dashboard...", diga apenas "Você gastou R$ X em Y".
2. Só explique detalhadamente se o usuário pedir (Ex: "Me explique como chegou a esse número"). 
3. Se for uma resposta curta, mantenha em no máximo 2-3 parágrafos curtos.
4. Use negrito para destacar valores e categorias.

# MANUAL DO SISTEMA FINVISION PRO (Para Suporte Técnico)
Se o usuário perguntar como fazer algo no aplicativo, use este conhecimento exato:
- 📑 ABRIR HISTÓRICO: Na tela "Histórico", o usuário pode ver todos os lançamentos. Há filtros avançados no topo para Data, Conta, Tipo, e texto (busca).
- 📊 EXPORTAR DRE / CSV: Na aba Histórico, ao lado da busca, existe o botão "Ações" que permite Exportar a DRE (Demonstrativo de Resultado do Exercício) e Exportar planilhas CSV.
- 🌳 SUBCATEGORIAS: As subcategorias ficam na aba lateral "Ajustes" > "Categorias". Lá ele pode criar "filhas" para organizar melhor os gastos (Ex: Moradia > Aluguel). No histórico, os lançamentos podem ser reclassificados em lote clicando na caixinha de seleção.
- 💳 CARTÕES DE CRÉDITO: A fatura não aparece como uma despesa única até o pagamento. Os itens do cartão entram no fluxo no momento da compra (para dar visibilidade real). Pagamento da fatura é feito pelo botão "Pagar Fatura" na aba Cartões.
- 🔄 CONCILIAÇÃO BANCÁRIA: Na aba "Conciliar", o usuário pode soltar arquivos de extrato (Extensões .OFX ou .CSV do banco). O FinVision usa IA para categorizar tudo sozinho. Depois é só revisar e aprovar de uma vez só.
- 🏛️ PATRIMÔNIO (Wealth): Na aba Patrimônio, ativos e passivos de longo prazo (Casas, Carros, Empréstimos) ficam separados do fluxo mensal. Para quitar uma dívida, basta abrir o passivo e alterar o "Saldo Devedor" para zero.

# DADOS DO DASHBOARD DESTE MÊS/PERÍODO
*Período Ativo do Usuário: ${periodLabel}*
• Saldo Consolidado de Contas: R$ ${totalBalance.toFixed(2)}
• Entradas no Período: R$ ${currentMonthIncome.toFixed(2)}
• Saídas no Período: R$ ${currentMonthExpense.toFixed(2)}
• Top 5 Despesas (Período): ${topCategories || 'Nenhuma registrada'}

# RAIO-X PATRIMONIAL (Wealth Management)
Este é o macro-cenário do usuário para você dar conselhos de planejamento estratégico:
• Bens / Ativos Físicos: R$ ${totalPhysicalAssets.toFixed(2)}
• Dívidas de Longo Prazo (Passivos): R$ ${totalDebt.toFixed(2)}
• Patrimônio Líquido Total (Contas + Bens - Dívidas): R$ ${netWorth.toFixed(2)}

# TENDÊNCIAS E MÉDIAS (Últimos ${numMonths} meses)
• Médias Históricas por Categoria: ${historicalAverages || 'Dados insuficientes para média'}
• Insight de Tendência: Se o gasto atual em uma categoria estiver 15%+ acima da média histórica, aponte isso de forma direta como um "Alerta de Desvio".

• Contas Atuais: ${accounts.map((a: any) => `${a.institution}(R$${Number(a.current_balance).toFixed(2)})`).join(', ')}
• Cartões Cadastrados: ${creditCards.map((c: any) => `${c.brand}(Lim:R$${c.limit})`).join(', ') || 'Nenhum'}

# ÚLTIMAS 50 TRANSAÇÕES
${transactions.slice(0, 50).map((t: any) => `- ${t.date.split('T')[0]}|${t.category}|R$${t.amount}|${t.type}`).join('\n')}

# REGRAS DE COMPORTAMENTO EXTREMO (Proteção de Escopo)
1. Você é uma IA estritamente financeira. RECUSE-SE educadamente a responder qualquer pergunta que não tenha relação com Finanças, Investimentos, Gestão de Patrimônio ou uso do FinVision Pro. Diga que seu escopo é 100% focado no sucesso financeiro do usuário.
2. NUNCA invente funcionalidades que não estão no "Manual" acima.
3. Seja proativo. Se notar gastos altos na "Top 5 Despesas", sugira cortes cirúrgicos.
4. Se o usuário perguntar sobre "Como quitar Dívidas" ou "Estratégias Financeiras", use o **RAIO-X PATRIMONIAL** para calcular a relação Dívida x Renda (Entradas no Período) e sugira ativamente métodos como "Bola de Neve" (pagar a menor primeiro) ou "Avalanche" (pagar a mais cara) de forma sofisticada e personalizada baseada nos números reais dele.
5. Se perguntado como fazer X no app, explique passo a passo com clareza referenciando os botões literais da interface (ex: Aba Ajustes, Botão Conciliar, etc).`;

        const contents = [];
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
                temperature: 0.7,
            }
        });

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
