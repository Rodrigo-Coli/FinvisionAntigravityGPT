import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    const { data: imp, error: impErr } = await supabase.from('imports').select('id, user_id, document_id, account_id, type, notes, parse_meta').eq('id', import_id).single();
    if (impErr || !imp) throw new Error(`Import não encontrado: ${impErr?.message || 'Unknown'}`);

    const { data: doc, error: docErr } = await supabase.from('documents').select('id, bucket, path, mime_type').eq('id', imp.document_id).single();
    if (docErr || !doc) throw new Error(`Documento associado não encontrado: ${docErr?.message || 'Unknown'}`);

    await supabase.from('imports').update({ status: 'processing' }).eq('id', import_id);

    const { data: fileBlob, error: dlErr } = await supabase.storage.from(doc.bucket).download(doc.path);
    if (dlErr || !fileBlob) throw new Error(`Falha no download: ${dlErr?.message || 'Empty blob'}`);
    const buffer = Buffer.from(await fileBlob.arrayBuffer());

    const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!geminiKey) throw new Error('Chave do Gemini (GEMINI_API_KEY) não encontrada.');
    const ai = new GoogleGenAI({ apiKey: geminiKey });

    const prompt = `Você é um especialista em conciliação financeira com foco em mapeamento semântico flexível. Analise o documento fornecido. OBJETIVO: Extrair transações e identificar colunas de forma inteligente. REGRAS: 1. DATA (YYYY-MM-DD). 2. DESCRIÇÃO. 3. VALOR (entrada + / saída -). 4. CONTA (map p/ account_name). 5. CATEGORIA (map p/ category_name). Ignore totais e saldos. Retorne APENAS JSON: {"transactions": [{"date": "YYYY-MM-DD", "description": "texto", "amount": -123.45, "account_name": "Nome da Conta", "category_name": "Nome da Categoria"}]}`;

    let contents = [{ parts: [{ text: prompt }, { inlineData: { data: buffer.toString('base64'), mimeType: doc.mime_type || 'application/pdf' } }] }];
    if (['csv', 'ofx', 'xlsx'].includes(imp.type)) {
      contents = [{ parts: [{ text: prompt }, { text: `CONTEÚDO DO ARQUIVO:\n${buffer.toString('utf-8').substring(0, 30000)}` }] }];
    }

    const fallbackModels = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'];
    let rawText = '';
    for (const currentModel of fallbackModels) {
      try {
        const genModel = ai.getGenerativeModel({ model: currentModel });
        const result = await genModel.generateContent({
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
                      category: { type: Type.STRING },
                      account_name: { type: Type.STRING },
                      category_name: { type: Type.STRING }
                    },
                    required: ["date", "description", "amount"]
                  }
                }
              },
              required: ["transactions"]
            }
          }
        });
        rawText = result.response.text();
        if (rawText) break;
      } catch (e) { console.error(`Falha no modelo ${currentModel}`); }
    }

    if (!rawText) throw new Error('A IA não retornou dados após tentativas.');
    const parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
    const transactions = parsed.transactions || [];

    const isMobills = import_source === 'smart' || (imp.parse_meta as any)?.is_mobills || imp.notes?.toLowerCase().includes('mobills') || imp.notes?.toLowerCase().includes('smart');

    if (transactions.length > 0) {
      if (isMobills) {
        const accountCache = new Map<string, string>();
        const categoryCache = new Map<string, string>();
        const entries = [];
        for (const t of transactions) {
          if (!t.date || typeof t.amount !== 'number') continue;
          const type = t.amount < 0 ? 'EXPENSE' : 'INCOME';
          const accKey = (t.account_name || 'Mobills').toUpperCase();
          let accId = accountCache.get(accKey);
          if (!accId) {
            const { data: exAcc } = await supabase.from('accounts').select('id').ilike('institution', t.account_name || 'Mobills').eq('user_id', imp.user_id).maybeSingle();
            if (exAcc) accId = exAcc.id;
            else {
              const { data: newAcc } = await supabase.from('accounts').insert({ user_id: imp.user_id, institution: t.account_name || 'Mobills', type: 'CHECKING', initial_balance: 0, current_balance: 0, color: '#0ea5e9' }).select('id').single();
              accId = newAcc?.id;
            }
            if (accId) accountCache.set(accKey, accId);
          }
          const catKey = (t.category_name || t.category || 'Outros').toUpperCase();
          let catId = categoryCache.get(catKey);
          if (!catId) {
            const { data: exCat } = await supabase.from('categories').select('id').ilike('name', t.category_name || t.category || 'Outros').eq('user_id', imp.user_id).maybeSingle();
            if (exCat) catId = exCat.id;
            else {
              const { data: newCat } = await supabase.from('categories').insert({ user_id: imp.user_id, name: t.category_name || t.category || 'Outros', color: type === 'INCOME' ? '#22c55e' : '#ef4444', icon: 'Tag' }).select('id').single();
              catId = newCat?.id;
            }
            if (catId) categoryCache.set(catKey, catId);
          }
          entries.push({ user_id: imp.user_id, date: t.date, description: t.description.trim(), amount: Math.abs(t.amount), type, account_id: accId || imp.account_id, category: t.category_name || t.category || 'Outros', category_id: catId, is_paid: true, paid_at: t.date, metadata: { import_id: imp.id, source: 'mobills_direct_motor' } });
        }
        if (entries.length > 0) await supabase.from('transactions').insert(entries);
      } else {
        const txsToInsert = transactions.map((t: any) => {
          const fingerprint = crypto.createHash('sha256').update(`${t.date}|${t.amount.toFixed(2)}|${t.description.toLowerCase()}|${imp.account_id || ''}`).digest('hex');
          return { user_id: imp.user_id, import_id: imp.id, date: t.date, description: t.description.trim(), amount: t.amount, account_id: imp.account_id, account_name: account_name || 'Importado', source_document_id: imp.document_id, status: 'READY_TO_RECONCILE', fingerprint, metadata: { category_suggested: t.category } };
        });
        await supabase.from('imported_transactions').upsert(txsToInsert, { onConflict: 'user_id,fingerprint' });
      }
    }

    await supabase.from('imports').update({ status: 'ready', notes: `${imp.notes || ''} | Extraídas ${transactions.length} transações.` }).eq('id', import_id);
    return res.status(200).json({ ok: true, count: transactions.length });
  } catch (err: any) {
    await supabase.from('imports').update({ status: 'error', notes: `ERROR: ${err.message.substring(0, 500)}` }).eq('id', import_id);
    return res.status(200).json({ ok: false, message: err.message });
  }
}
