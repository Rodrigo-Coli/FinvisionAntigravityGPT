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
                .select('amount, type, category, date, description')
                .eq('user_id', userId)
                .gte('date', new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]) // last 45 days
                .order('date', { ascending: false }).limit(200),
            supabase.from('credit_cards').select('brand, limit, statement_closing_day').eq('user_id', userId)
        ]);

        const accounts = accountsRes.data || [];
        const transactions = txRes.data || [];
        const creditCards = cardsRes.data || [];

        const totalBalance = accounts.reduce((s: number, a: any) => s + Number(a.current_balance || 0), 0);

        // Compute current month expenses
        const currentMonthPrefix = new Date().toISOString().substring(0, 7); // YYYY-MM
        let currentMonthIncome = 0;
        let currentMonthExpense = 0;

        const categorySummary: Record<string, number> = {};

        transactions.forEach((t: any) => {
            if (t.date.startsWith(currentMonthPrefix)) {
                if (t.type === 'INCOME') currentMonthIncome += Number(t.amount);
                else {
                    currentMonthExpense += Number(t.amount);
                    categorySummary[t.category] = (categorySummary[t.category] || 0) + Number(t.amount);
                }
            }
        });

        // =====================================
        // 2. BUILD THE PROMPT TEXT
        // =====================================
        const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');
        const ai = new GoogleGenAI({ apiKey: geminiKey });

        const systemPrompt = `Você é o assistente FinVision AI, incorporado no aplicativo FinVision.
Você tem acesso aos dados financeiros ao vivo do usuário para poder responder suas perguntas.

Se o usuário perguntar algo que possa ser respondido usando os dados abaixo, RESPONDA com base neles.
Se ele pedir resumo, use os totais.
Responda de forma direta, clara, como um analista financeiro conversando no WhatsApp usando emojis. Formate com markdown (**negrito** etc).

DADOS AO VIVO DO USUÁRIO:
- Saldo Total nas Contas: R$ ${totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Contas: ${accounts.map((a: any) => `${a.institution} (R$ ${a.current_balance})`).join(', ')}
- Resumo Este Mês (${currentMonthPrefix}):
  - Entradas: R$ ${currentMonthIncome.toLocaleString('pt-BR')}
  - Saídas: R$ ${currentMonthExpense.toLocaleString('pt-BR')}
- Top Categorias de Gasto (Mês atual):
${Object.entries(categorySummary).sort((a, b) => b[1] - a[1]).slice(0, 5).map(c => `  - ${c[0]}: R$ ${c[1].toLocaleString('pt-BR')}`).join('\n')}
- Cartões: ${creditCards.map((c: any) => `${c.brand} (Lim: R$ ${c.limit})`).join(', ')}

ÚLTIMAS TRANSAÇÕES (Amostra para contexto de perguntas específicas):
${transactions.slice(0, 20).map((t: any) => `- ${t.date} | ${t.description} | ${t.category} | R$ ${t.amount} (${t.type})`).join('\n')}

Se a pergunta do usuário requerer análise, leia a lista acima. Se o usuário perguntar algo que não consta no banco, informe que você visualiza apenas os últimos 45 dias de dados cadastrados.`;

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
