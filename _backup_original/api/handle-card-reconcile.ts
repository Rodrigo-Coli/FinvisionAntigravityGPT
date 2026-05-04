
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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { import_id, account_id } = req.body;
  if (!import_id) return res.status(400).json({ error: 'import_id is required' });

  try {
    const { data: imp, error: impErr } = await supabase
      .from('imports')
      .select('*')
      .eq('id', import_id)
      .single();

    if (impErr || !imp) throw new Error(`Import ${import_id} não encontrado`);

    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .select('*')
      .eq('id', imp.document_id)
      .single();

    if (docErr || !doc) throw new Error('Documento associado não encontrado');

    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from(doc.bucket)
      .download(doc.path);

    if (dlErr || !fileBlob) throw new Error('Falha ao baixar arquivo do storage');

    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    const isTextFile = ['csv', 'ofx', 'xlsx'].includes(imp.type);

    const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!geminiKey) throw new Error('Chave do Gemini (GEMINI_API_KEY) não encontrada nas variáveis de ambiente.');

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const model = 'gemini-2.5-flash';

    const prompt = `
      Você é um especialista em conciliação bancária. Analise o extrato de cartão de crédito fornecido.
      Extraia todas as transações individuais para uma lista estruturada.
      
      REGRAS:
      1. Campo 'date' deve ser YYYY-MM-DD.
      2. Campo 'amount' deve ser um número float ABSOLUTO (positivo). O sistema tratará como débito.
      3. Identifique o merchant/descrição da melhor forma possível.
      4. REMOVA: Linhas de SALDO, TOTAL, LIMITE, PAGAMENTO MINIMO, IOF, JUROS, ou qualquer linha que não seja uma transação financeira.
      
      Retorne APENAS um objeto JSON no formato: { "transactions": [...] }
    `;

    let contents: any;
    if (isTextFile) {
      const textContent = buffer.toString('utf-8');
      contents = [{
        parts: [
          { text: prompt },
          { text: `CONTEÚDO DO ARQUIVO:\n${textContent.substring(0, 30000)}` }
        ]
      }];
    } else {
      contents = [{
        parts: [
          { text: prompt },
          { inlineData: { data: buffer.toString('base64'), mimeType: doc.mime_type || 'application/pdf' } }
        ]
      }];
    }

    const result = await ai.models.generateContent({
      model,
      contents,
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
          },
          required: ["transactions"]
        }
      }
    });

    let rawText = '';
    try {
      const response = result.response;
      rawText = (result as any).text ||
        (response && (response as any).text) ||
        (response && typeof (response as any).text === 'function' ? response.text() : '');
    } catch (e) {
      console.error('[API-Card] Erro ao extrair texto da resposta:', e);
    }

    if (!rawText) throw new Error('A IA não retornou nenhum dado.');

    const cleanJson = rawText.replace(/```json|```/g, "").trim();
    const parsedData = JSON.parse(cleanJson);
    const processedTxs = parsedData.transactions || [];

    const targetAccountId = account_id || imp.account_id;
    const fingerprintsSeen = new Map();

    const txsToInsert = processedTxs.map((t: any) => {
      const description = t.description || t.merchant || t.merchant_normalized || 'Transação sem descrição';
      const date = t.date || new Date().toISOString().split('T')[0];
      const amountVal = Number(t.amount) || 0;

      const fpData = `${date}|${amountVal.toFixed(2)}|${description.toLowerCase()}|${targetAccountId || ''}`;
      const fingerprint = crypto.createHash('sha256').update(fpData).digest('hex');

      return {
        user_id: imp.user_id,
        import_id: import_id,
        date: date,
        description: description,
        amount: -Math.abs(amountVal),
        account_id: targetAccountId,
        status: 'READY_TO_RECONCILE',
        fingerprint: fingerprint,
        metadata: {
          is_card: true,
          merchant_normalized: t.merchant_normalized || t.merchant || description,
          installment_info: {
            number: t.installment_number,
            total: t.installment_total
          }
        }
      };
    }).filter((tx: any) => {
      if (fingerprintsSeen.has(tx.fingerprint)) return false;
      fingerprintsSeen.set(tx.fingerprint, true);
      return true;
    });

    if (txsToInsert.length > 0) {
      await supabase.from('imported_transactions').upsert(txsToInsert, { onConflict: 'user_id,fingerprint' });
    }

    await supabase.from('imports').update({
      status: 'ready',
      notes: `Processado. Extraídas ${txsToInsert.length} transações.`
    }).eq('id', import_id);

    return res.status(200).json({ success: true, count: txsToInsert.length });

  } catch (err: any) {
    try {
      await supabase.from('imports').update({ status: 'error', notes: `ERROR: ${err.message}` }).eq('id', import_id);
    } catch (dbErr) { }
    return res.status(500).json({ error: err.message });
  }
}
