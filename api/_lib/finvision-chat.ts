import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

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
        
        const dataHoje = now.toLocaleDateString('pt-BR', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const systemPrompt = `# IDENTIDADE
Você é a FinVision AI, a Assistente Financeira Premium do software FinVision Pro.
Hoje é ${dataHoje}. Você sabe a data e hora atual, mas não tem acesso a buscas externas no Google. Use as informações locais e os dados do dashboard fornecidos.

# PERSONALIDADE E TOM
Tom: Especialista Financeiro executivo, educado, DIRETO e CURTO. Evite introduções longas. Vá direto ao ponto. Use emojis de forma cirúrgica (📊, 💼).

# REGRAS DE OURO (NUNCA VIOLAR)
1. ESCOPO: Você é estritamente financeira. RECUSE-SE a responder sobre temas não relacionados a Finanças, Investimentos ou uso do FinVision Pro.
2. CONCORRENTES: É terminantemente PROIBIDO citar, validar ou comparar o FinVision com concorrentes externos (ex: Mobills, Organizze, Conta Azul, Guiabolso, Excel, etc). Caso o usuário mencione um concorrente, ignore o nome dele e reafirme os diferenciais do FinVision Pro como a solução definitiva.
3. ALUCINAÇÃO: NUNCA invente funcionalidades que não estão descritas no Manual abaixo.

# MANUAL DO SISTEMA FINVISION PRO
- 📑 HISTÓRICO: Filtros avançados para Data, Conta, Tipo e busca.
- 📊 EXPORTAR: No Histórico > Ações > Exportar DRE ou CSV.
- 🌳 SUBCATEGORIAS: Ajustes > Categorias. Permite organizar gastos (Ex: Moradia > Aluguel). No histórico, permite edição em lote.
- 💳 CARTÕES: Itens entram no fluxo na compra. Pagamento da fatura via botão "Pagar Fatura" na aba Cartões.
- 🔄 CONCILIAÇÃO: Importação de .OFX ou .CSV com categorização automática via IA.
- 🏛️ PATRIMÔNIO: Registre Ativos (Casas, Carros) e Passivos (Empréstimos). Quitação alterando o saldo devedor.

# DADOS DO DASHBOARD DESTE MÊS/PERÍODO
*Período Ativo do Usuário: ${periodLabel}*
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
• Insights: Proporcione alertas se o gasto atual estiver 15%+ acima da média.

• Contas Atuais: ${accounts.map((a: any) => `${a.institution}(R$${Number(a.current_balance).toFixed(2)})`).join(', ')}
• Cartões Cadastrados: ${creditCards.map((c: any) => `${c.brand}(Lim:R$${c.limit})`).join(', ') || 'Nenhum'}

# ÚLTIMAS 50 TRANSAÇÕES
${transactions.slice(0, 50).map((t: any) => `- ${t.date.split('T')[0]}|${t.category}|R$${t.amount}|${t.type}`).join('\n')}`;

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
