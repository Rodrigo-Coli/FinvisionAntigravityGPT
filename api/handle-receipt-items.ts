
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import { Buffer } from 'node:buffer';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { base64, mimeType } = req.body;
    if (!base64) return res.status(400).json({ error: 'Arquivo é obrigatório' });

    try {
        const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        const ai = new GoogleGenAI({ apiKey: geminiKey! });
        const model = 'gemini-1.5-flash';

        const prompt = `
      Você é um especialista em análise de documentos fiscais (Cupons e NF-e) e inteligência de varejo.
      Extraia os dados detalhados deste cupom.
      
      REGRAS DE INTELIGÊNCIA:
      1. MERCHANT: Identifique o nome fantasia do estabelecimento.
      2. NORMALIZAÇÃO: Para cada item, crie um 'normalized_name' (Ex: se no cupom está 'COCA LATA 350', normalize para 'Coca-Cola Lata 350ml').
      3. PROMOÇÃO: Identifique se o item parece estar em promoção/oferta e marque 'is_promo'.
      4. CATEGORIA: Classifique o item (Mercado, Restaurante, Farmácia, Posto, etc).
      
      Retorne APENAS um objeto JSON:
      {
        "merchant": "Nome Fantasia",
        "date": "YYYY-MM-DD",
        "total": 123.45,
        "category": "Mercado",
        "items": [
          {
            "description": "Descrição Original",
            "normalized_name": "Nome Padronizado",
            "quantity": 1,
            "unit": "un",
            "unit_price": 25.90,
            "total_price": 25.90,
            "is_promo": false,
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
                                    normalized_name: { type: Type.STRING },
                                    quantity: { type: Type.NUMBER },
                                    unit: { type: Type.STRING },
                                    unit_price: { type: Type.NUMBER },
                                    total_price: { type: Type.NUMBER },
                                    is_promo: { type: Type.BOOLEAN },
                                    category_hint: { type: Type.STRING }
                                },
                                required: ["description", "quantity", "total_price"]
                            }
                        }
                    }
                }
            }
        });

        // Pegar o texto de forma segura (Blindagem contra undefined)
        let rawText = '';
        try {
            const response = result.response;
            rawText = (result as any).text ||
                (response && (response as any).text) ||
                (response && typeof (response as any).text === 'function' ? response.text() : '');
        } catch (e) {
            console.error('[AI-Labs] Erro ao extrair texto da resposta:', e);
        }

        if (!rawText) throw new Error('A IA não retornou nenhum dado. Isso pode ser por filtros de segurança do Google ou o documento é ilegível.');

        const parsedData = JSON.parse(rawText.replace(/```json|```/g, "").trim());

        return res.status(200).json(parsedData);
    } catch (err: any) {
        console.error('[AI-Labs] Erro no parsing:', err);
        return res.status(500).json({ error: err.message });
    }
}
