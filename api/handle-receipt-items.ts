
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import { Buffer } from 'node:buffer';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { base64, mimeType, user_id } = req.body;
    if (!base64) return res.status(400).json({ error: 'Arquivo é obrigatório' });

    try {
        const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        const ai = new GoogleGenAI({ apiKey: geminiKey! });
        const model = 'gemini-2.5-flash';

        const prompt = `
      Você é um especialista em análise de documentos fiscais (Cupons e NF-e).
      Extraia os dados detalhados deste cupom.
      
      REGRAS:
      1. Identifique o nome do estabelecimento (merchant).
      2. Extraia a data do documento (YYYY-MM-DD).
      3. Extraia todos os itens da compra com quantidade, unidade (un, kg, etc), preço unitário e total.
      4. Identifique o valor total bruto do cupom.
      
      Retorne APENAS um objeto JSON no formato:
      {
        "merchant": "Nome do Local",
        "date": "YYYY-MM-DD",
        "total": 123.45,
        "items": [
          {
            "description": "Arroz 5kg",
            "quantity": 1,
            "unit": "un",
            "unit_price": 25.90,
            "total_price": 25.90,
            "category_hint": "Alimentação"
          }
        ]
      }
    `;

        const result = await ai.models.generateContent({
            model,
            contents: [{
                parts: [
                    { text: prompt },
                    { inlineData: { data: base64, mimeType: mimeType || 'application/pdf' } }
                ]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        merchant: { type: Type.STRING },
                        date: { type: Type.STRING },
                        total: { type: Type.NUMBER },
                        items: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    description: { type: Type.STRING },
                                    quantity: { type: Type.NUMBER },
                                    unit: { type: Type.STRING },
                                    unit_price: { type: Type.NUMBER },
                                    total_price: { type: Type.NUMBER },
                                    category_hint: { type: Type.STRING }
                                },
                                required: ["description", "quantity", "total_price"]
                            }
                        }
                    }
                }
            }
        });

        const response = result.response;
        const rawText = response.text();
        const parsedData = JSON.parse(rawText.replace(/```json|```/g, "").trim());

        return res.status(200).json(parsedData);
    } catch (err: any) {
        console.error('[AI-Labs] Erro no parsing:', err);
        return res.status(500).json({ error: err.message });
    }
}
