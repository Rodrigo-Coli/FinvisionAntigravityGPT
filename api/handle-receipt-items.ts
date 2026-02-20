import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

// Add Node.js types to satisfy linter without adding @types/node
declare const process: {
    env: {
        VITE_SUPABASE_URL?: string;
        SUPABASE_URL?: string;
        SUPABASE_SERVICE_ROLE_KEY?: string;
        GEMINI_API_KEY?: string;
        API_KEY?: string;
        [key: string]: string | undefined;
    };
};

interface VercelRequest {
    method: string;
    body: any;
    [key: string]: any;
}

interface VercelResponse {
    status: (code: number) => VercelResponse;
    json: (body: any) => void;
    send: (body: any) => void;
    [key: string]: any;
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'OPTIONS') return res.status(200).send('ok');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { base64, mimeType, files } = req.body;
    let inputFiles = [];

    if (files && Array.isArray(files)) {
        inputFiles = files;
    } else if (base64) {
        inputFiles = [{ base64, mimeType: mimeType || 'image/jpeg' }];
    }

    if (inputFiles.length === 0) return res.status(400).json({ error: 'Arquivo(s) obrigatório(s)' });

    try {
        const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');

        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const model = 'gemini-2.0-flash'; // Fixed version name if gemini-2.5-flash was a typo or preview

        const prompt = `
      Você é um especialista em análise de documentos fiscais. Extraia os dados detalhados deste cupom.
      
      RETORNE APENAS UM OBJETO JSON NO FORMATO:
      {
        "merchant": "Nome Fantasia",
        "merchant_category": "Mercado | Restaurante | Farmácia | Loja | Posto | Outros",
        "date": "YYYY-MM-DD",
        "currency": "BRL",
        "total": 0.00,
        "items": [
          {
            "description": "Original",
            "normalized_name": "Nome Padronizado",
            "quantity": 1,
            "unit_price": 0.00,
            "total_price": 0.00,
            "category_hint": "Alimentação",
            "is_promo": false
          }
        ]
      }
    `;

        const contents = [{
            parts: [
                { text: prompt },
                ...inputFiles.map((f: { base64: string; mimeType?: string }) => ({
                    inlineData: { data: f.base64, mimeType: f.mimeType || 'image/jpeg' }
                }))
            ]
        }];

        const response = await ai.models.generateContent({
            model,
            contents,
            generationConfig: {
                responseMimeType: "application/json"
            }
        });

        if (!response) {
            throw new Error('A IA não retornou nenhuma resposta.');
        }

        let rawText = '';
        try {
            rawText = (response as any).text ||
                (response.response && (response.response as any).text) ||
                (response.response && typeof (response.response as any).text === 'function' && (response.response as any).text()) || '';
        } catch (e) {
            console.error('[AI-Labs] Erro ao extrair texto:', e);
        }

        if (!rawText) throw new Error('IA não retornou conteúdo de texto.');

        const cleanJson = rawText.replace(/```json|```/g, "").trim();
        const parsedData = JSON.parse(cleanJson);

        return res.status(200).json(parsedData);

    } catch (err: any) {
        console.error('[AI-Labs] Erro fatal:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
