import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: any, res: any) {
    if (req.method === 'OPTIONS') return res.status(200).send('ok');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { userId, message, history } = req.body;
    if (!userId || !message) return res.status(400).json({ error: 'userId e message são obrigatórios' });

    try {
        // ===============================
        // 1. GATHER ALL CONTEXTUAL DATA
        // ===============================
        const [accountsRes, txRes, cardsRes] = await Promise.all([
            supabase.from('accounts').select('institution, type, current_balance').eq('user_id', userId),
            supabase.from('transactions')
                .select('amount, type, category, date, description, is_paid')
                .eq('user_id', userId)
                .is('is_deleted', false)
                .gte('date', new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
                .order('date', { ascending: false }).limit(200),
            supabase.from('credit_cards').select('brand, limit, statement_closing_day').eq('user_id', userId)
        ]);

        const accounts = accountsRes.data || [];
        const transactions = txRes.data || [];
        const creditCards = cardsRes.data || [];

        const totalBalance = accounts.reduce((s: number, a: any) => s + Number(a.current_balance || 0), 0);

        // Compute current month expenses safely (local time basis)
        const now = new Date();
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

        // =====================================
        // 2. BUILD THE PROMPT TEXT (Token-Efficient)
        // =====================================
        const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');
        const ai = new GoogleGenAI({ apiKey: geminiKey });

        const systemPrompt = `# IDENTIDADE E TOM
Você é a FinVision AI, a assistente financeira inteligente embarcada no app FinVision.
Responda sempre como um Especialista Financeiro sênior: direto, claro, útil, sem enrolação. Use emojis estrategicamente. Formate com **negrito** e listas para leitura ágil. Não desperdice tokens com saudações excessivas.

# GUIA DO APLICATIVO (Para tirar dúvidas de uso do site)
- CONCILIAÇÃO: Importe OFX/CSV. A IA categoriza automaticamente. Clique em Conciliar para salvar e enviar ao Dashboard.
- PATRIMÔNIO (Bens/Dívidas): Contas de ativos somam, passivos (dívidas) subtraem do Líquido. Para quitar dívida, edite "Saldo Devedor" para R$ 0. Excluir a dívida a remove completamente dos cálculos (Arquivar).
- DASHBOARD: Visão geral. O gráfico "Análise de Período" e Orçamentos ignoram dívidas de longo prazo, focam apenas em lançamentos de Despesa/Receita correntes.
- CONTAS VIRTUAIS/OCULTAS: Usuários podem criar "contas" exclusas do dashboard principal para gerenciar mesadas de terceiros (ex: esposa/filho) sem inflar os ganhos/gastos oficiais.
- GERAL: Tudo pode ser acessado pelo menu lateral. 

# DADOS EM TEMPO REAL DO USUÁRIO
*Data Referência: Mês ${currentMonthPrefix}*
• Saldo Consolidado: R$ ${totalBalance.toFixed(2)}
• Total Entradas (Mês): R$ ${currentMonthIncome.toFixed(2)}
• Total Saídas (Mês): R$ ${currentMonthExpense.toFixed(2)}
• Top Despesas (Mês): ${topCategories || 'Nenhuma registrada'}

• Contas Atuais: ${accounts.map((a: any) => `${a.institution}(R$${Number(a.current_balance).toFixed(2)})`).join(', ')}
• Cartões Cadastrados: ${creditCards.map((c: any) => `${c.brand}(Lim:R$${c.limit})`).join(', ') || 'Nenhum'}

# AMOSTRA DE TRANSAÇÕES (Últimas 20)
(Data | Descrição | Categoria | Valor | Tipo)
${transactions.slice(0, 20).map((t: any) => `- ${t.date.split('T')[0]} | ${t.description} | ${t.category} | R$${t.amount} | ${t.type}`).join('\n')}

# REGRAS DE RESPOSTA
1. Se o usuário perguntar os gastos/receitas do mês, confie CEGAMENTE na métrica "Total Saídas/Entradas (Mês)" listada acima. Não recalcule, apenas reproduza a métrica.
2. Se pedir para explicar uma transação, procure na amostra.
3. Se perguntar como usar o sistema (ex: "como lanço x?", "como apago y?"), ensine usando o GUIA DO APLICATIVO ou seu conhecimento sobre apps financeiros.
4. Respostas super longas são ruins. Seja conciso e vá direto ao ponto.`;

        // We construct the "contents" array representing the conversation history
        const contents = [];

        // Add previous history
        if (history && history.length > 0) {
            history.forEach((msg: any) => {
                // Ensure only 'user' or 'model' roles are passed to Gemini (skip standard 'init' if needed, or map 'assistant' to 'model')
                if (msg.role === 'assistant' || msg.role === 'model') {
                    contents.push({ role: 'model', parts: [{ text: msg.content }] });
                } else if (msg.role === 'user') {
                    contents.push({ role: 'user', parts: [{ text: msg.content }] });
                }
            });
        }

        // Add current message
        contents.push({ role: 'user', parts: [{ text: message }] });

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: {
                systemInstruction: systemPrompt,
                temperature: 0.5,
            }
        });

        const rawText = typeof (response as any).text === 'function' ? (response as any).text() : ((response as any).text || '');

        return res.status(200).json({ reply: rawText });

    } catch (err: any) {
        console.error('[FinVisionChat] Erro:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
