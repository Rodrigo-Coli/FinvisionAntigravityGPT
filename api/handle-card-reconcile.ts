
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl) {
  console.error('[API-Card] Erro: SUPABASE_URL não configurada.');
}

if (!supabaseServiceKey || !supabaseServiceKey.startsWith('eyJ')) {
  console.error('[API-Card] Erro: SUPABASE_SERVICE_ROLE_KEY inválida. Deve começar com "eyJ".');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Fix: Full implementation of the credit card statement parsing API handler
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Fix: changed 'card_id' to 'account_id' to match payload from ReconciliationService
  const { import_id, account_id } = req.body;
  if (!import_id) return res.status(400).json({ error: 'import_id is required' });

  try {
    // 1. Fetch Import Record
    const { data: imp, error: impErr } = await supabase
      .from('imports')
      .select('*')
      .eq('id', import_id)
      .single();

    if (impErr || !imp) throw new Error(`Import ${import_id} não encontrado`);

    // 2. Fetch Document Record (Two-step is more robust than naming the FK)
    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .select('*')
      .eq('id', imp.document_id)
      .single();

    if (docErr || !doc) throw new Error('Documento associado não encontrado');

    // 3. Download File
    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from(doc.bucket)
      .download(doc.path);

    if (dlErr || !fileBlob) throw new Error('Falha ao baixar arquivo do storage');

    const buffer = Buffer.from(await fileBlob.arrayBuffer());

    // 4. AI Extraction with Gemini
    const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!geminiKey) throw new Error('Chave do Gemini (GEMINI_API_KEY) não encontrada nas variáveis de ambiente.');

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const model = 'gemini-2.5-flash';

    console.log(`[API-Card] Iniciando Gemini para import ${import_id}`);

    const prompt = `
      Você é um especialista em conciliação bancária. Analise o extrato de cartão de crédito fornecido.
      Extraia todas as transações individuais para uma lista estruturada.
      REGRAS:
      1. Campo 'date' deve ser YYYY-MM-DD.
      2. Campo 'amount' deve ser um número float ABSOLUTO (positivo). O sistema tratará como débito.
      3. Identifique o merchant/descrição da melhor forma possível.
      Retorne APENAS um objeto JSON no formato: { "transactions": [...] }
    `;

    const response = await ai.models.generateContent({
      model,
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { data: buffer.toString('base64'), mimeType: doc.mime_type } }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transactions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  date: { type: Type.STRING },
                  description: { type: Type.STRING },
                  amount: { type: Type.NUMBER },
                  merchant_normalized: { type: Type.STRING },
                  installment_number: { type: Type.NUMBER },
                  installment_total: { type: Type.NUMBER }
                },
                required: ["date", "description", "amount"]
              }
            }
          }
        }
      }
    });

    let rawText = '';
    try {
      rawText = response.response.text();
    } catch (e) {
      console.error('[API-Card] Erro ao extrair texto da resposta:', e);
      throw new Error('Falha ao obter resposta da IA');
    }

    if (!rawText) throw new Error('A IA não retornou nenhum dado.');

    const cleanJson = rawText.replace(/```json|```/g, "").trim();
    const parsedData = JSON.parse(cleanJson);
    const processedTxs = parsedData.transactions || [];

    // 5. Save to Reconcile Queue
    const targetAccountId = account_id || imp.account_id;
    const txsToInsert = processedTxs.map((t: any) => {
      // Fingerprint deduplication
      const fpData = `${t.date}|${Number(t.amount).toFixed(2)}|${t.description.toLowerCase()}|${targetAccountId || ''}`;
      const fingerprint = crypto.createHash('sha256').update(fpData).digest('hex');

      return {
        user_id: imp.user_id,
        import_id: import_id,
        date: t.date,
        description: t.description,
        amount: -Math.abs(t.amount), // Débito negativo
        account_id: targetAccountId,
        status: 'READY_TO_RECONCILE',
        fingerprint: fingerprint,
        metadata: {
          is_card: true,
          merchant_normalized: t.merchant_normalized,
          installment_info: {
            number: t.installment_number,
            total: t.installment_total
          }
        }
      };
    });

    if (txsToInsert.length > 0) {
      const { error: insErr } = await supabase
        .from('imported_transactions')
        .upsert(txsToInsert, { onConflict: 'user_id,fingerprint' });

      if (insErr) throw new Error(`Falha ao inserir transações: ${insErr.message}`);
    }

    // 6. Finalize
    await supabase.from('imports').update({
      status: 'ready',
      notes: `Processado. Extraídas ${txsToInsert.length} transações.`
    }).eq('id', import_id);

    return res.status(200).json({ success: true, count: txsToInsert.length });

  } catch (err: any) {
    console.error('[API-Card] Erro Crítico:', err);

    // Update record with error
    try {
      await supabase.from('imports').update({
        status: 'error',
        notes: `ERROR: ${err.message}`
      }).eq('id', import_id);
    } catch (dbErr) {
      console.error('[API-Card] Falha ao registrar erro no banco:', dbErr);
    }

    return res.status(500).json({ error: err.message });
  }
}
