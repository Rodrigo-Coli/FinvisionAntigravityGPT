
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import { recordAiUsage } from './ai-usage.js';
import { checkAiActionAllowed } from './ai-usage-limits.js';
import { Buffer } from 'node:buffer';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function handleReceiptItems(req: any, res: any) {
    if (req.method === 'OPTIONS') return res.status(200).send('ok');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { base64, mimeType, files, userId } = req.body;
    let inputFiles = [];

    if (files && Array.isArray(files)) {
        inputFiles = files;
    } else if (base64) {
        inputFiles = [{ base64, mimeType: mimeType || 'image/jpeg' }];
    }

    if (inputFiles.length === 0) return res.status(400).json({ error: 'Arquivo(s) obrigatório(s)' });

    try {
        const limitCheck = await checkAiActionAllowed(supabase, userId, 'receipt_items');
        if (!limitCheck.allowed) {
            return res.status(429).json({ error: limitCheck.message, limitReached: true });
        }

        const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');

        const { data: dbPrompt } = await supabase.from('ai_prompts').select('content').eq('slug', 'receipt_scanner').single();
        const prompt = dbPrompt?.content || `
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

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const model = 'gemini-2.5-flash';

        const contents = [{
            parts: [
                { text: prompt },
                ...inputFiles.map((f: any) => ({
                    inlineData: { data: f.base64, mimeType: f.mimeType || 'image/jpeg' }
                }))
            ]
        }];

        // Schema estruturado (mesmo padrão do handle-bank-reconcile.ts) — sem isso o
        // Gemini eventualmente devolve texto fora do formato ou omite "items" em notas
        // fiscais mais ruidosas (DANFE com blocos de ICMS/FCP por item), o que quebrava
        // o parse no servidor ou o .map() no front.
        const response = await ai.models.generateContent({
            model,
            contents,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        merchant: { type: Type.STRING },
                        merchant_category: { type: Type.STRING },
                        date: { type: Type.STRING },
                        currency: { type: Type.STRING },
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
                                    category_hint: { type: Type.STRING },
                                    is_promo: { type: Type.BOOLEAN }
                                },
                                required: ["description", "quantity", "unit_price", "total_price", "category_hint"]
                            }
                        }
                    },
                    required: ["merchant", "date", "total", "items"]
                }
            }
        });
        await recordAiUsage(supabase, 'receipt_items', userId || null, response, 'gemini-2.5-flash');

        if (!response) {
            throw new Error('A IA não retornou nenhuma resposta.');
        }

        // EXTRAÇÃO DE TEXTO SEGURA (MESMA DO RECONCILE)
        let rawText = '';
        try {
            rawText = (response as any).text ||
                ((response as any).response && ((response as any).response as any).text) ||
                ((response as any).response && typeof ((response as any).response as any).text === 'function' && ((response as any).response as any).text()) || '';
        } catch (e) {
            console.error('[AI-Labs] Erro ao extrair texto:', e);
        }

        if (!rawText) throw new Error('IA não retornou conteúdo de texto.');

        const cleanJson = rawText.replace(/```json|```/g, "").trim();
        let parsedData: any;
        try {
            parsedData = JSON.parse(cleanJson);
        } catch (e) {
            console.error('[AI-Labs] Resposta da IA não é um JSON válido:', rawText.slice(0, 500));
            throw new Error('Não foi possível interpretar o cupom. Tente novamente com uma foto mais nítida.');
        }

        // Normalização defensiva: mesmo com responseSchema, nunca confiar cegamente
        // no shape devolvido pelo modelo antes de repassar pro front.
        const items = Array.isArray(parsedData.items) ? parsedData.items : [];
        const normalizedItems = items.map((it: any) => ({
            description: it.description || it.normalized_name || 'Item',
            normalized_name: it.normalized_name || it.description || 'Item',
            quantity: Number(it.quantity) || 1,
            unit: it.unit || 'un',
            unit_price: Number(it.unit_price) || 0,
            total_price: Number(it.total_price) || (Number(it.unit_price) || 0) * (Number(it.quantity) || 1),
            category_hint: it.category_hint || 'Geral',
            is_promo: !!it.is_promo
        }));

        if (normalizedItems.length === 0) {
            throw new Error('Não conseguimos identificar os itens desse cupom. Tente novamente com uma foto mais nítida e completa.');
        }

        const total = Number(parsedData.total) || normalizedItems.reduce((sum: number, it: any) => sum + it.total_price, 0);

        return res.status(200).json({
            merchant: parsedData.merchant || 'Estabelecimento não identificado',
            merchant_category: parsedData.merchant_category || 'Mercado',
            date: parsedData.date || new Date().toISOString().slice(0, 10),
            currency: parsedData.currency || 'BRL',
            total,
            items: normalizedItems
        });

    } catch (err: any) {
        console.error('[AI-Labs] Erro fatal:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
