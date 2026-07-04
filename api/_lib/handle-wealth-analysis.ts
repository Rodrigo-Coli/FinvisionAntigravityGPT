import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { recordAiUsage } from './ai-usage.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function handleWealthAnalysis(req: any, res: any) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

    try {
        const [accountsRes, assetsRes, liabilitiesRes, txRes] = await Promise.all([
            supabase.from('accounts').select('institution, type, current_balance, currency').eq('user_id', userId),
            supabase.from('physical_assets').select('id, name, category, estimated_value').eq('user_id', userId),
            supabase.from('liabilities').select('id, name, type, total_amount, remaining_balance, interest_rate, installment_amount, installments_remaining, metadata').eq('user_id', userId),
            supabase.from('transactions').select('amount, type, category, date, description, is_amortization, liability_id, is_paid, metadata').eq('user_id', userId).eq('is_deleted', false).gte('date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]).order('date', { ascending: false }).limit(400)
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

        let totalIncome3m = 0, totalExpense3m = 0;
        const todayStr = new Date().toISOString().split('T')[0];

        // Filter standard past transactions for historical average cash flow
        transactions.forEach((t: any) => {
            const tDateStr = t.date ? t.date.split('T')[0] : '';
            if (tDateStr <= todayStr && !t.is_amortization) {
                if (t.type === 'INCOME') totalIncome3m += Number(t.amount);
                else if (t.type === 'EXPENSE') totalExpense3m += Number(t.amount);
            }
        });
        const avgMonthlyIncome = Math.round(totalIncome3m / 3);
        const avgMonthlyExpense = Math.round(totalExpense3m / 3);
        const avgMonthlySavings = avgMonthlyIncome - avgMonthlyExpense;
        const monthlyDebtPayments = liabilities.reduce((s: number, l: any) => s + Number(l.installment_amount || 0), 0);
        const debtToIncome = avgMonthlyIncome > 0 ? Math.round((monthlyDebtPayments / avgMonthlyIncome) * 100) : 0;

        const accountsSummary = accounts.map((a: any) => `${a.institution} (${a.type}): R$ ${Number(a.current_balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`).join('\n- ');
        
        // Detailed liabilities summary including down payments and balloons extracted from both metadata and real transactions
        const liabilitiesSummary = liabilities.map((l: any) => {
            const ir = l.interest_rate ? `juros ${l.interest_rate}% a.a.` : 'sem juros definidos';
            const propertyStatus = l.metadata?.propertyType ? `[Status Imóvel: ${l.metadata.propertyType}]` : '';
            const parcelas = l.installments_remaining 
                ? `${l.installments_remaining} parcelas de R$ ${Number(l.installment_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                : 'sem parcelas mensais configuradas';
            
            // Extract balloons and down payments linked to this liability
            const linkedTxs = transactions.filter(t => t.liability_id === l.id);
            const atos = linkedTxs.filter(t => t.metadata?.type === 'DOWN_PAYMENT' || (t.description || '').toUpperCase().includes('ATO'));
            const baloes = linkedTxs.filter(t => t.metadata?.type === 'INTERMEDIARY' || (t.description || '').toUpperCase().includes('INTERMEDIÁRIA') || (t.description || '').toUpperCase().includes('BALÃO'));
            
            const atosSummary = atos.length > 0 
                ? `\n    └─ Entrada/Atos: ${atos.map(a => `${a.description.split(' - ')[0]}: R$ ${Number(a.amount).toLocaleString('pt-BR')} (${a.is_paid ? 'PAGO' : 'PENDENTE'})`).join(', ')}`
                : '';
            const baloesSummary = baloes.length > 0 
                ? `\n    └─ Balões/Intermediárias: ${baloes.map(b => `${b.description.split(' - ')[0]}: R$ ${Number(b.amount).toLocaleString('pt-BR')} (${b.is_paid ? 'PAGO' : 'PENDENTE'})`).join(', ')}`
                : '';
            
            return `${l.name} (${l.type}) ${propertyStatus}: Saldo Devedor R$ ${Number(l.remaining_balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, ${ir}, ${parcelas}${atosSummary}${baloesSummary}`;
        }).join('\n- ');

        const physicalSummary = physicalAssets.map((a: any) => `${a.name} (${a.category}): R$ ${Number(a.estimated_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`).join('\n- ');

        const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');
        const ai = new GoogleGenAI({ apiKey: geminiKey });

        const systemPrompt = `Você é o FinVision Wealth Advisor, o consultor financeiro patrimonial de elite incorporado no aplicativo FinVision. Você tem acesso completo ao patrimônio do usuário.\n\nREGRAS ABSOLUTAS:\n- Nunca mencione "Gemini", "Google" ou qualquer AI. Você é o FinVision.\n- Seja direto, preciso e use dados reais fornecidos.\n- Formate com markdown (# títulos, **negrito**, listas) para leitura fácil.\n- Use valores em Reais formatados (R$ 0.000,00).\n- Seja como um Private Banker de alto nível: honesto, objetivo, sem enrolação.\n- Separe seu relatório em seções claras.`;

        const userPrompt = `Analise o patrimônio financeiro completo do usuário e forneça um diagnóstico patrimonial completo:\n\n## DADOS FINANCEIROS DO USUÁRIO\n\n**CONTAS E INVESTIMENTOS (Total: R$ ${totalFinancial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}):**\n- ${accountsSummary || 'Nenhuma conta cadastrada'}\n\n**BENS FÍSICOS (Total: R$ ${totalPhysical.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}):**\n- ${physicalSummary || 'Nenhum bem físico cadastrado'}\n\n**DÍVIDAS E PASSIVOS (Total: R$ ${totalLiabilities.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}):**\n- ${liabilitiesSummary || 'Nenhum passivo cadastrado'}\n\n**FLUXO DE CAIXA (Média 3 meses):**\n- Renda Mensal Média: R$ ${avgMonthlyIncome.toLocaleString('pt-BR')}\n- Gastos Mensais Médios: R$ ${avgMonthlyExpense.toLocaleString('pt-BR')}\n- Poupança Mensal: R$ ${avgMonthlySavings.toLocaleString('pt-BR')}\n- Comprometimento com Dívidas: ${debtToIncome}% da renda\n\n**RESUMO PATRIMONIAL:**\n- Patrimônio Bruto (Ativos): R$ ${totalAssets.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n- Total de Dívidas: R$ ${totalLiabilities.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n- **Patrimônio Líquido Real: R$ ${netWorth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}**\n\nCom base nesses dados, forneça:\n1. 🏦 Score de Saúde Financeira (0-100)\n2. 📊 Análise de Dívidas vs Investimentos (comente especificamente sobre a viabilidade de aportes e a sustentabilidade das parcelas de obras de imóveis Na Planta e consórcios comparado às suas sobras de caixa)\n3. ⚠️ Alertas e Riscos (atente para atos ou balões pendentes nos imóveis Na Planta)\n4. 🎯 Plano de Ação (3 prioridades)\n5. 💡 Oportunidades Identificadas`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: userPrompt }] }],
            config: { systemInstruction: systemPrompt, temperature: 0.7 }
        });
        await recordAiUsage(supabase, 'wealth_analysis', userId, response, 'gemini-2.5-flash');

        const rawText = (response as any).text || (response as any).candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!rawText) throw new Error('FinVision AI não retornou análise.');

        return res.status(200).json({ analysis: rawText, metadata: { netWorth, totalAssets, totalLiabilities, avgMonthlySavings, debtToIncome, generatedAt: new Date().toISOString() } });
    } catch (err: any) {
        console.error('[WealthAdvisor] Erro:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
