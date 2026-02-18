
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
        if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada nas variáveis de ambiente.');

        const ai = new GoogleGenAI(geminiKey);
        const modelName = 'gemini-2.5-flash';

        // Configuração do modelo com esquema de resposta se possível, mas mantendo flexível
        const model = ai.getGenerativeModel({
            model: modelName,
            generationConfig: {
                responseMimeType: "application/json"
            }
        });

        const prompt = `
      Você é um especialista em análise de documentos fiscais (Cupons e NF-e) e inteligência de varejo.
      Analise a imagem/PDF e extraia os dados detalhados.
      
      REGRAS DE INTELIGÊNCIA:
      1. MERCHANT: Identifique o nome fantasia (Ex: Carrefour, Extra, Swift).
      2. NORMALIZAÇÃO: Crie um 'normalized_name' padronizado para cada item.
      3. PROMOÇÃO: Identifique se o item está em oferta/promoção ('is_promo').
      4. CATEGORIA: Classifique o item (Mercado, Restaurante, Farmácia, Posto, etc).
      
      Retorne APENAS um objeto JSON válido:
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

        if (!result || !result.response) {
            throw new Error('A IA não retornou um objeto de resposta válido.');
        }

        const response = await result.response;

        // Extração segura do texto
        let rawText = '';
        try {
            // Tentar o método padrão
            rawText = response.text();
        } catch (textErr) {
            console.error('[AI-Labs] Falha ao ler response.text(), tentando candidatos...', textErr);
            // Fallback para candidatos
            const candidate = response.candidates?.[0];
            if (candidate?.content?.parts?.[0]?.text) {
                rawText = candidate.content.parts[0].text;
            }
        }

        if (!rawText) {
            // Verificar motivos de bloqueio se estiver vazio
            const feedback = response.promptFeedback;
            if (feedback?.blockReason) {
                throw new Error(`A IA bloqueou este conteúdo: ${feedback.blockReason}`);
            }
            throw new Error('A IA retornou uma resposta vazia. O documento pode estar ilegível ou ser muito grande.');
        }

        console.log(`[AI-Labs] Resposta recebida. Processando JSON...`);

        // Limpar possíveis markdown code blocks e dar parse
        const cleanJson = rawText.replace(/```json|```/g, "").trim();
        const parsedData = JSON.parse(cleanJson);

        // Validar campos básicos para evitar erros no front
        if (!parsedData.items) parsedData.items = [];
        if (!parsedData.merchant) parsedData.merchant = 'Desconhecido';

        return res.status(200).json(parsedData);

    } catch (err: any) {
        console.error('[AI-Labs] ERRO NO PARSING:', err);
        return res.status(500).json({
            error: err.message,
            details: 'Erro de processamento na IA ou formato inválido.'
        });
    }
}
