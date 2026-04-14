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

    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

    try {
        const [accountsRes, assetsRes, liabilitiesRes, txRes] = await Promise.all([
            supabase.from('accounts').select('institution, type, current_balance, currency').eq('user_id', userId),
            supabase.from('physical_assets').select('name, category, estimated_value').eq('user_id', userId),
            supabase.from('liabilities').select('name, type, total_amount, remaining_balance, interest_rate, installment_amount, installments_remaining').eq('user_id', userId),
            supabase.from('transactions').select('amount, type, category, date').eq('user_id', userId).eq('is_amortization', false).gte('date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]).order('date', { ascending: false }).limit(300)
        ]);

        const accounts = accountsRes.data || [];
        const physicalAssets = assetsRes.data || [];
        const liabilities = liabilitiesRes.data || [];
        const transactions = txRes.data || [];

        const totalFinancial = accounts.reduce((s: number, a: any) => s + Number(a.current_balance || 0), 0);
        const totalPhysical = physicalAssets.reduce((s: number, a: any) => s + Number(a.estimated_value || 0), 0);
        const totalLiabilities = liabilities.reduce((s: number, l: any) => s + Number(l.remaining_balance || 0), 0);
        const totalAssets = totalFinancial + totalPhysical;
        const netWorth = totalAssets - totalLiabilities;

        let totalIncome3m = 0;
        let totalExpense3m = 0;
        transactions.forEach((t: any) => {
            if (t.type === 'INCOME') totalIncome3m += Number(t.amount);
            else if (t.type === 'EXPENSE') totalExpense3m += Number(t.amount);
        });
        const avgMonthlyIncome = Math.round(totalIncome3m / 3);
        const avgMonthlyExpense = Math.round(totalExpense3m / 3);
        const avgMonthlySavings = avgMonthlyIncome - avgMonthlyExpense;

        const monthlyDebtPayments = liabilities.reduce((s: number, l: any) => s + Number(l.installment_amount || 0), 0);
        const debtToIncome = avgMonthlyIncome > 0 ? Math.round((monthlyDebtPayments / avgMonthlyIncome) * 100) : 0;

        const accountsSummary = accounts.map((a: any) =>
            `${a.institution} (${a.type}): R$ ${Number(a.current_balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        ).join('\n- ');

        const liabilitiesSummary = liabilities.map((l: any) => {
            const ir = l.interest_rate ? `juros ${l.interest_rate}% a.a.` : 'sem juros definidos';
            const parcelas = l.installments_remaining ? `${l.installments_remaining} parcelas restantes de R$ ${Number(l.installment_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'sem parcelas configuradas';
            return `${l.name} (${l.type}): Saldo Devedor R$ ${Number(l.remaining_balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, ${ir}, ${parcelas}`;
        }).join('\n- ');

        const physicalSummary = physicalAssets.map((a: any) =>
            `${a.name} (${a.category}): R$ ${Number(a.estimated_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        ).join('\n- ');

        const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');
        const ai = new GoogleGenAI({ apiKey: geminiKey });

        const systemPrompt = `Você é o FinVision Wealth Advisor, o consultor financeiro patrimonial de elite incorporado no aplicativo FinVision. Você tem acesso completo ao patrimônio do usuário.

REGRAS ABSOLUTAS:
- Nunca mencione "Gemini", "Google" ou qualquer AI. Você é o FinVision.
- Seja direto, preciso e use dados reais fornecidos.
- Formate com markdown (# títulos, **negrito**, listas) para leitura fácil.
- Use valores em Reais formatados (R$ 0.000,00).
- Seja como um Private Banker de alto nível: honesto, objetivo, sem enrolação.
- Separe seu relatório em seções claras.`;

        const userPrompt = `Analise o patrimônio financeiro completo do usuário e forneça um diagnóstico patrimonial completo:

## DADOS FINANCEIROS DO USUÁRIO

**CONTAS E INVESTIMENTOS (Total: R$ ${totalFinancial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}):**
- ${accountsSummary || 'Nenhuma conta cadastrada'}

**BENS FÍSICOS (Total: R$ ${totalPhysical.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}):**
- ${physicalSummary || 'Nenhum bem físico cadastrado'}

**DÍVIDAS E PASSIVOS (Total: R$ ${totalLiabilities.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}):**
- ${liabilitiesSummary || 'Nenhum passivo cadastrado'}

**FLUXO DE CAIXA (Média 3 meses):**
- Renda Mensal Média: R$ ${avgMonthlyIncome.toLocaleString('pt-BR')}
- Gastos Mensais Médios: R$ ${avgMonthlyExpense.toLocaleString('pt-BR')}
- Poupança Mensal: R$ ${avgMonthlySavings.toLocaleString('pt-BR')}
- Comprometimento com Dívidas: ${debtToIncome}% da renda

**RESUMO PATRIMONIAL:**
- Patrimônio Bruto (Ativos): R$ ${totalAssets.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- Total de Dívidas: R$ ${totalLiabilities.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
- **Patrimônio Líquido Real: R$ ${netWorth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}**

---

Com base nesses dados, forneça um Diagnóstico Patrimonial completo com:

1. **🏦 Score de Saúde Financeira** (nota de 0-100, com justificativa)
2. **📊 Análise de Dívidas vs Investimentos** (Comparar: taxa das dívidas vs taxa de retorno de mercado atual, Selic ~10,75% a.a. Deve amortizar ou investir?)
3. **⚠️ Alertas e Riscos** (pontos de atenção imediata)
4. **🎯 Plano de Ação (3 prioridades)** (o que fazer AGORA, em 6 e em 12 meses)
5. **💡 Oportunidades Identificadas** (incluindo: vale vender consórcio no mercado secundário? Vale antecipar parcelas? Comprar imóvel para renda?)`;

        const genModel = ai.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: systemPrompt,
        });

        const result = await genModel.generateContent({
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: {
                temperature: 0.7,
            }
        });

        const rawText = result.response.text();
        if (!rawText) throw new Error('FinVision AI não retornou análise.');

        return res.status(200).json({
            analysis: rawText,
            metadata: {
                netWorth,
                totalAssets,
                totalLiabilities,
                avgMonthlySavings,
                debtToIncome,
                generatedAt: new Date().toISOString()
            }
        });

    } catch (err: any) {
        console.error('[WealthAdvisor] Erro:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
