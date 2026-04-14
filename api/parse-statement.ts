import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).send('ok');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' });

  const { import_id, account_name, import_source } = req.body;
  if (!import_id) return res.status(400).json({ ok: false, message: 'import_id is required' });

  try {
    const { data: imp, error: impErr } = await supabase.from('imports').select('id, user_id, document_id, account_id, type, notes').eq('id', import_id).single();
    if (impErr || !imp) throw new Error(`Import não encontrado: ${impErr?.message || 'Unknown'}`);

    const { data: doc, error: docErr } = await supabase.from('documents').select('id, bucket, path, mime_type').eq('id', imp.document_id).single();
    if (docErr || !doc) throw new Error(`Documento não encontrado: ${docErr?.message || 'Unknown'}`);

    await supabase.from('imports').update({ status: 'processing' }).eq('id', import_id);

    const { data: fileBlob, error: dlErr } = await supabase.storage.from(doc.bucket).download(doc.path);
    if (dlErr || !fileBlob) throw new Error(`Falha no download: ${dlErr?.message || 'Empty blob'}`);

    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    const isTextFile = ['csv', 'ofx', 'xlsx'].includes(imp.type);

    if (!process.env.GEMINI_API_KEY && !process.env.API_KEY) throw new Error('GEMINI_API_KEY não configurada.');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '' });
    const modelName = 'gemini-1.5-flash';

    const prompt = `Você é um especialista em conciliação bancária. Analise o extrato/comprovante fornecido. Extraia todas as transações individuais para uma lista JSON. REGRAS: 1. Campo 'date' deve ser YYYY-MM-DD. 2. Campo 'amount' deve ser um número float. 3. Se for despesa/saída/débito, o 'amount' deve ser NEGATIVO. 4. Se for receita/entrada/crédito, o 'amount' deve ser POSITIVO. 5. Descrição deve ser limpa. Contexto: Conta=${account_name || 'Desconhecida'}, Origem=${import_source || 'Desconhecida'}. REMOVA: Linhas de SALDO, TOTAL, ETC. Retorne APENAS JSON: {"transactions": [{"date": "YYYY-MM-DD", "description": "texto", "amount": -123.45, "category": "opcional"}]}`;

    let contentsParts: any[];
    if (isTextFile) contentsParts = [{ text: prompt }, { text: `CONTEÚDO DO ARQUIVO:\n${buffer.toString('utf-8').substring(0, 30000)}` }];
    else contentsParts = [{ text: prompt }, { inlineData: { data: buffer.toString('base64'), mimeType: doc.mime_type || 'application/pdf' } }];

    const genModel = ai.getGenerativeModel({ model: modelName });
    const result = await genModel.generateContent({
      contents: [{ parts: contentsParts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { transactions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { date: { type: Type.STRING }, description: { type: Type.STRING }, amount: { type: Type.NUMBER }, category: { type: Type.STRING } }, required: ["date", "description", "amount"] } } },
          required: ["transactions"]
        }
      }
    });

    const parsed = JSON.parse(result.response.text() || '{"transactions":[]}');
    const transactions = parsed.transactions || [];

    if (transactions.length > 0) {
      const txsToInsert = transactions
        .filter((t: any) => t.date && typeof t.amount === 'number' && t.amount !== 0)
        .map((t: any) => {
          const cleanDesc = t.description.trim();
          const fpData = `${t.date}|${t.amount.toFixed(2)}|${cleanDesc.toLowerCase()}|${imp.account_id || ''}`;
          const fingerprint = crypto.createHash('sha256').update(fpData).digest('hex');
          return { user_id: imp.user_id, import_id: imp.id, date: t.date, description: cleanDesc, amount: t.amount, account_id: imp.account_id, account_name: account_name || 'Importado', source_document_id: imp.document_id, status: 'READY_TO_RECONCILE', fingerprint: fingerprint, metadata: { category_suggested: t.category, parsed_at: new Date().toISOString() } };
        });

      if (txsToInsert.length > 0) {
        const { error: insErr } = await supabase.from('imported_transactions').upsert(txsToInsert, { onConflict: 'user_id,fingerprint' });
        if (insErr) throw new Error(`Falha ao inserir transações: ${insErr.message}`);
      }
    }

    await supabase.from('imports').update({ status: 'ready', notes: `${imp.notes || ''} | Extraídas ${transactions.length} transações.` }).eq('id', import_id);
    return res.status(200).json({ ok: true, count: transactions.length });

  } catch (err: any) {
    console.error('[parse-statement] ERRO:', err.message);
    try { await supabase.from('imports').update({ status: 'error', notes: `ERROR: ${err.message.substring(0, 500)}` }).eq('id', import_id); } catch {}
    return res.status(200).json({ ok: false, message: err.message });
  }
}
