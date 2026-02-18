
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
        if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');

        const ai = new GoogleGenAI(geminiKey);
        const modelName = 'gemini-2.5-flash';
        const model = ai.getGenerativeModel({
            model: modelName,
            generationConfig: {
                responseMimeType: "application/json"
            }
        });

        const prompt = `
      Você é um especialista em análise de documentos fiscais (Cupons e NF-e) e inteligência de varejo.
      Extraia os dados detalhados deste cupom.
      
      REGRAS DE INTELIGÊNCIA:
      1. MERCHANT: Identifique o nome fantasia do estabelecimento.
      2. NORMALIZAÇÃO: Para cada item, crie um 'normalized_name' (Ex: se no cupom está 'COCA LATA 350', normalize para 'Coca-Cola Lata 350ml').
      3. PROMOÇÃO: Identifique se o item parece estar em promoção/oferta e marque 'is_promo'.
      4. CATEGORIA: Classifique o item (Mercado, Restaurante, Farmácia, Posto, etc).
      
      Retorne APENAS um objeto JSON no formato:
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

        console.log(`[AI-Labs] Iniciando extração com ${modelName}...`);

        const result = await model.generateContent([
            { text: prompt },
            { inlineData: { data: base64, mimeType: mimeType || 'application/pdf' } }
        ]);

        const response = await result.response;
        if (!response) throw new Error('Resposta da IA veio vazia (undefined).');

        const rawText = response.text();
        if (!rawText) throw new Error('IA retornou resposta sem conteúdo de texto.');

        console.log(`[AI-Labs] Resposta recebida (Tamanho: ${rawText.length})`);
        const parsedData = JSON.parse(rawText.replace(/```json|```/g, "").trim());

        return res.status(200).json(parsedData);
    } catch (err: any) {
        console.error('[AI-Labs] Erro fatal no parsing:', err);
        return res.status(500).json({
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
}
