import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).send('ok');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { import_id, card_id } = req.body;
  if (!import_id) return res.status(400).json({ error: 'import_id is required' });

  try {
    const { data: imp, error: impErr } = await supabase.from('imports').select('*, documents:documents!imports_document_id_fkey(*)').eq('id', import_id).single();
    if (impErr || !imp) throw new Error('Import não encontrado');

    const { data: fileBlob, error: dlErr } = await supabase.storage.from(imp.documents.bucket).download(imp.documents.path);
    if (dlErr || !fileBlob) throw new Error('Falha ao baixar arquivo do storage');
    
    const buffer = Buffer.from(await fileBlob.arrayBuffer());

    if (!process.env.GEMINI_API_KEY && !process.env.API_KEY) throw new Error('GEMINI_API_KEY não configurada.');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '' });
    const modelName = 'gemini-2.5-flash';

    const prompt = `Você é um especialista em conciliação bancária. Analise o extrato de cartão de crédito. Extraia todas as transações individuais para uma lista estruturada. REGRAS: 1. Campo 'date' deve ser YYYY-MM-DD. 2. Campo 'amount' deve ser um número float absoluto. 3. Identifique o merchant e parcelamento se houver. Retorne APENAS um objeto JSON.`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ parts: [{ text: prompt }, { inlineData: { data: buffer.toString('base64'), mimeType: imp.documents.mime_type } }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { transactions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { date: { type: Type.STRING }, description: { type: Type.STRING }, amount: { type: Type.NUMBER }, merchant_normalized: { type: Type.STRING }, installment_number: { type: Type.NUMBER }, installment_total: { type: Type.NUMBER } }, required: ["date", "description", "amount"] } } }
        }
      }
    });

    const parsedData = JSON.parse((response as any).text || (response as any).candidates?.[0]?.content?.parts?.[0]?.text || '{"transactions":[]}');
    const processedTxs = parsedData.transactions || [];

    const txsToInsert = processedTxs.map((t: any) => {
      const fpData = `${t.date}|${t.amount.toFixed(2)}|${t.description.toLowerCase()}|${card_id || ''}`;
      const fingerprint = crypto.createHash('sha256').update(fpData).digest('hex');
      return { user_id: imp.user_id, import_id: import_id, date: t.date, description: t.description, amount: -Math.abs(t.amount), account_id: card_id, status: 'READY_TO_RECONCILE', fingerprint: fingerprint, metadata: { is_card: true, merchant_normalized: t.merchant_normalized, installment_info: { number: t.installment_number, total: t.installment_total } } };
    });

    if (txsToInsert.length > 0) {
      const { error: insErr } = await supabase.from('imported_transactions').upsert(txsToInsert, { onConflict: 'user_id,fingerprint' });
      if (insErr) throw insErr;
    }

    await supabase.from('imports').update({ status: 'ready' }).eq('id', import_id);
    return res.status(200).json({ success: true, count: txsToInsert.length });
  } catch (err: any) {
    console.error('Processing Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
