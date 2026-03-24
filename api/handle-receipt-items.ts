
import { GoogleGenAI, Type } from '@google/genai';

export default async function handler(req: any, res: any) {
    if (req.method === 'OPTIONS') return res.status(200).send('ok');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { base64, mimeType, files } = req.body;
    let inputFiles: any[] = [];

    if (files && Array.isArray(files)) {
        inputFiles = files;
    } else if (base64) {
        inputFiles = [{ base64, mimeType: mimeType || 'image/jpeg' }];
    }

    if (inputFiles.length === 0) {
        return res.status(400).json({ error: 'Arquivo(s) obrigatório(s)' });
    }

    try {
        const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');

        const ai = new GoogleGenAI({ apiKey: geminiKey });

        const prompt = `
Você é um especialista em análise de documentos fiscais brasileiros. Extraia os dados detalhados deste cupom fiscal ou nota fiscal.

RETORNE APENAS UM OBJETO JSON VÁLIDO no formato abaixo, sem nenhum texto adicional:
{
  "merchant": "Nome do Estabelecimento",
  "merchant_category": "Mercado",
  "date": "YYYY-MM-DD",
  "currency": "BRL",
  "total": 0.00,
  "items": [
    {
      "description": "Nome Original do Produto",
      "normalized_name": "Nome Padronizado",
      "quantity": 1,
      "unit_price": 0.00,
      "total_price": 0.00,
      "category_hint": "Alimentação",
      "is_promo": false
    }
  ]
}

REGRAS:
- merchant_category deve ser: Mercado, Restaurante, Farmácia, Loja, Posto ou Outros
- date deve estar no formato YYYY-MM-DD (se não encontrar, use a data de hoje)
- total é o valor total da compra
- Inclua TODOS os produtos visíveis no cupom
- is_promo é true apenas se houver indicação explícita de desconto/promoção no item
`;

        const contents = [{
            parts: [
                { text: prompt },
                ...inputFiles.map((f: any) => ({
                    inlineData: { data: f.base64, mimeType: f.mimeType || 'image/jpeg' }
                }))
            ]
        }];

        const responseSchema = {
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
                            unit_price: { type: Type.NUMBER },
                            total_price: { type: Type.NUMBER },
                            category_hint: { type: Type.STRING },
                            is_promo: { type: Type.BOOLEAN }
                        },
                        required: ['description', 'quantity', 'unit_price', 'total_price']
                    }
                }
            },
            required: ['merchant', 'date', 'total', 'items']
        };

        // Fallback de modelos — mesma lógica do handle-bank-reconcile
        const fallbackModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
        let rawText = '';
        let lastError: any = null;

        for (let i = 0; i < fallbackModels.length; i++) {
            const currentModel = fallbackModels[i];
            console.log(`[AI-Labs] Tentando modelo: ${currentModel} (${i + 1}/${fallbackModels.length})`);

            try {
                const response = await ai.models.generateContent({
                    model: currentModel,
                    contents,
                    config: {
                        responseMimeType: 'application/json',
                        maxOutputTokens: 8192,
                        responseSchema
                    }
                });

                // Extração segura do texto (mesmo padrão do handle-bank-reconcile)
                try {
                    rawText = (response as any).text ||
                        ((response as any).response && ((response as any).response as any).text) ||
                        ((response as any).response && typeof ((response as any).response as any).text === 'function' && ((response as any).response as any).text()) || '';
                } catch (e) {
                    console.error('[AI-Labs] Erro ao extrair texto:', e);
                }

                if (rawText) {
                    console.log(`[AI-Labs] Sucesso com ${currentModel}. Tamanho resposta: ${rawText.length}`);
                    break;
                } else {
                    throw new Error('IA não retornou conteúdo.');
                }

            } catch (error: any) {
                lastError = error;
                const errMsg = error.message || String(error);
                console.error(`[AI-Labs] Falha com ${currentModel}:`, errMsg);

                const isQuotaError = errMsg.includes('429') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('exhausted');
                if (isQuotaError && i < fallbackModels.length - 1) {
                    console.log(`[AI-Labs] Quota atingida. Tentando próximo modelo...`);
                } else {
                    break;
                }
            }
        }

        if (!rawText) {
            throw new Error(`Falha na IA. Último erro: ${lastError?.message || 'Sem resposta'}`);
        }

        const cleanJson = rawText.replace(/```json|```/g, '').trim();
        let parsedData: any;
        try {
            parsedData = JSON.parse(cleanJson);
        } catch (e) {
            console.error('[AI-Labs] Falha no parse JSON:', e, 'Raw:', cleanJson.substring(0, 300));
            throw new Error('A IA retornou um formato inválido. Tente com uma imagem mais nítida.');
        }

        if (!parsedData.merchant || !parsedData.items) {
            throw new Error('Não foi possível identificar os dados do cupom. Tente com uma imagem mais nítida.');
        }

        return res.status(200).json(parsedData);

    } catch (err: any) {
        console.error('[AI-Labs] Erro fatal:', err.message);
        return res.status(500).json({ error: err.message || 'Erro interno ao processar cupom.' });
    }
}
