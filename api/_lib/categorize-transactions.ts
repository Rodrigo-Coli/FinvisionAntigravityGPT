import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { recordAiUsage } from './ai-usage.js';
import { checkAiActionAllowed } from './ai-usage-limits.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function handleCategorizeTransactions(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' });

  try {
    const { descriptions, categories, userId } = req.body;
    if (!descriptions || !Array.isArray(descriptions) || descriptions.length === 0) {
      return res.status(400).json({ ok: false, message: 'Need an array of transaction descriptions' });
    }
    if (!categories || !Array.isArray(categories)) {
      return res.status(400).json({ ok: false, message: 'Need an array of available categories' });
    }

    const limitCheck = await checkAiActionAllowed(supabase, userId, 'categorize');
    if (!limitCheck.allowed) {
      return res.status(429).json({ ok: false, message: limitCheck.message, limitReached: true });
    }

    const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!geminiKey) throw new Error('Chave do Gemini (GEMINI_API_KEY) não encontrada.');

    const ai = new GoogleGenAI({ apiKey: geminiKey });

    const prompt = `Você é um analista financeiro especializado em categorizar extratos bancários brasileiros.
Vou te passar uma lista de "descrições cruas" (nomes que vêm no extrato do banco/cartão).
E também a lista das "categorias disponíveis" que o usuário tem criadas no sistema.

Sua missão é deduzir qual é a melhor Categoria e Subcategoria para cada transação e retornar EXATAMENTE um JSON.
Se você não reconhecer o nome do estabelecimento na descrição crua, utilize a sua ferramenta de busca (Google Search) na internet para descobrir qual é a empresa ou tipo de negócio associado àquele nome e, em seguida, encaixe na melhor categoria do usuário.

CATEGORIAS DISPONÍVEIS:
${JSON.stringify(categories.map((c: any) => c.category_name + " > " + c.name), null, 2)}

DESCRIÇÕES PARA ANALISAR:
${JSON.stringify(descriptions, null, 2)}

Importante:
1. Responda APENAS com a string JSON pura (um array), sem nenhum texto antes ou depois, e sem marcações markdown como \`\`\`json ou \`\`\`.
2. A 'category' e 'subcategory' devem existir exatamente nestes nomes caso você as escolha.
3. O formato de cada item deve ser exatamente: {"description": "...", "category": "...", "subcategory": "..."}
`;

    // A API do Gemini não permite combinar `tools` (Google Search) com
    // `responseMimeType`/`responseSchema` na mesma chamada (erro 400
    // INVALID_ARGUMENT: "Tool use with a response mime type: 'application/json'
    // is unsupported"). Como precisamos do Google Search para reconhecer
    // estabelecimentos desconhecidos, pedimos o JSON só via instrução no
    // prompt e fazemos o parsing de forma tolerante abaixo.
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.2,
        tools: [{ googleSearch: {} }]
      }
    });
    await recordAiUsage(supabase, 'categorize', userId || null, response, 'gemini-2.5-flash');

    let text = (response as any).text || (response as any).candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    text = text.trim();
    // Remove cercas de markdown (```json ... ``` ou ``` ... ```) caso o modelo as inclua.
    text = text.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim();
    // Isola o array JSON caso venha com texto extra ao redor.
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      text = text.slice(firstBracket, lastBracket + 1);
    }

    let parsed: any[];
    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      console.error('[API Categorizacao] Falha ao interpretar JSON da IA:', text);
      throw new Error('A IA retornou uma resposta em formato inesperado. Tente novamente.');
    }

    return res.status(200).json({ ok: true, data: parsed });

  } catch (error: any) {
    console.error('[API Categorizacao] Erro fatal:', error);
    return res.status(500).json({ ok: false, message: error.message });
  }
}
