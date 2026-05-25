import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Schema, Type } from '@google/genai';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function handleCategorizeTransactions(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' });

  try {
    const { descriptions, categories } = req.body;
    if (!descriptions || !Array.isArray(descriptions) || descriptions.length === 0) {
      return res.status(400).json({ ok: false, message: 'Need an array of transaction descriptions' });
    }
    if (!categories || !Array.isArray(categories)) {
      return res.status(400).json({ ok: false, message: 'Need an array of available categories' });
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
1. Responda apenas com a string JSON. Sem marcações markdown como \`\`\`.
2. A 'category' e 'subcategory' devem existir exatamente nestes nomes caso você as escolha.
`;

    const schema: Schema = {
      type: Type.ARRAY,
      description: "List of mapped transactions",
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING, description: "The exact raw description string from the input array." },
          category: { type: Type.STRING, description: "The matching category name from the available options (e.g. Transporte). Leave empty if unknown." },
          subcategory: { type: Type.STRING, description: "The matching subcategory name from the available options (e.g. Combustível). Leave empty if unknown." }
        },
        required: ["description", "category", "subcategory"]
      }
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.2,
        tools: [{ googleSearch: {} }]
      }
    });

    const text = (response as any).text || (response as any).candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const parsed = JSON.parse(text);

    return res.status(200).json({ ok: true, data: parsed });

  } catch (error: any) {
    console.error('[API Categorizacao] Erro fatal:', error);
    return res.status(500).json({ ok: false, message: error.message });
  }
}
