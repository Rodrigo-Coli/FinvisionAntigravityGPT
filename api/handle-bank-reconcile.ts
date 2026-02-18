
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl) {
  console.error('[API] Erro: SUPABASE_URL não configurada.');
}

if (!supabaseServiceKey || !supabaseServiceKey.startsWith('eyJ')) {
  console.error('[API] Erro: SUPABASE_SERVICE_ROLE_KEY inválida ou ausente. Ela deve começar com "eyJ". A chave enviada começa com: ' + (supabaseServiceKey ? supabaseServiceKey.substring(0, 10) : 'vazia'));
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: any, res: any) {
  // Configurar headers para permitir CORS em desenvolvimento se necessário
  if (req.method === 'OPTIONS') {
    return res.status(200).send('ok');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const { import_id, account_name, import_source } = req.body;

  if (!import_id) {
    return res.status(400).json({ ok: false, message: 'import_id is required' });
  }

  console.log(`[parse-statement] INICIANDO: ${import_id}`);

  try {
    // 1. FETCH_IMPORT: Buscar dados do import (Sem join)
    console.log(`[parse-statement] STEP: FETCH_IMPORT`);
    const { data: imp, error: impErr } = await supabase
      .from('imports')
      .select('id, user_id, document_id, account_id, type, notes')
      .eq('id', import_id)
      .single();

    if (impErr || !imp) {
      throw new Error(`Import não encontrado no banco: ${impErr?.message || 'Unknown'}`);
    }

    // 2. FETCH_DOC: Buscar dados do documento (Sem join)
    console.log(`[parse-statement] STEP: FETCH_DOC`);
    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .select('id, bucket, path, mime_type')
      .eq('id', imp.document_id)
      .single();

    if (docErr || !doc) {
      throw new Error(`Documento associado não encontrado: ${docErr?.message || 'Unknown'}`);
    }

    // Marcar como processando explicitamente
    await supabase.from('imports').update({ status: 'processing' }).eq('id', import_id);

    // 3. DOWNLOAD_FILE: Baixar do storage
    console.log(`[parse-statement] STEP: DOWNLOAD_FILE (${doc.path})`);
    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from(doc.bucket)
      .download(doc.path);

    if (dlErr || !fileBlob) {
      throw new Error(`Falha no download do arquivo: ${dlErr?.message || 'Empty blob'}`);
    }

    // 4. PREPARE_CONTENT: Converter arquivo para processamento
    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    const isTextFile = ['csv', 'ofx', 'xlsx'].includes(imp.type);

    // 5. GEMINI_CALL: Processamento inteligente
    console.log(`[parse-statement] STEP: GEMINI_CALL (${imp.type})`);
    const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

    if (!geminiKey) {
      throw new Error('Chave do Gemini (GEMINI_API_KEY) não encontrada nas variáveis de ambiente.');
    }

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const model = 'gemini-1.5-flash-latest'; // Usando alias 'latest' para maior compatibilidade

    const prompt = `
      Você é um especialista em conciliação bancária. Analise o extrato/comprovante fornecido.
      Extraia todas as transações individuais para uma lista JSON.
      
      REGRAS:
      1. Campo 'date' deve ser YYYY-MM-DD.
      2. Campo 'amount' deve ser um número float. 
      3. Se for despesa/saída/débito, o 'amount' deve ser NEGATIVO.
      4. Se for receita/entrada/crédito, o 'amount' deve ser POSITIVO.
      5. Descrição deve ser limpa, sem códigos internos se possível.
      6. Contexto: Conta=${account_name || 'Desconhecida'}, Origem=${import_source || 'Desconhecida'}.
      7. REMOVA: Linhas de SALDO, TOTAL, LIMITE, PAGAMENTO MINIMO, IOF, JUROS, ou qualquer linha que não seja uma transação financeira.
      
      Retorne APENAS um objeto JSON no formato:
      {"transactions": [{"date": "YYYY-MM-DD", "description": "texto", "amount": -123.45, "category": "opcional"}]}
    `;

    let contents: any;
    if (isTextFile) {
      const textContent = buffer.toString('utf-8');
      contents = { parts: [{ text: prompt }, { text: `CONTEÚDO DO ARQUIVO:\n${textContent.substring(0, 30000)}` }] };
    } else {
      contents = {
        parts: [
          { text: prompt },
          { inlineData: { data: buffer.toString('base64'), mimeType: doc.mime_type || 'application/pdf' } }
        ]
      };
    }

    const response = await ai.models.generateContent({
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
                  category: { type: Type.STRING }
                },
                required: ["date", "description", "amount"]
              }
            }
          },
          required: ["transactions"]
        }
      }
    });

    // 6. PARSE_JSON: Validar retorno
    console.log(`[parse-statement] STEP: PARSE_JSON`);
    const rawText = response.text || '{"transactions":[]}';
    const parsed = JSON.parse(rawText);
    const transactions = parsed.transactions || [];

    // 7. UPSERT_TXS: Persistir transações (READY_TO_RECONCILE)
    console.log(`[parse-statement] STEP: UPSERT_TXS (${transactions.length} itens)`);
    if (transactions.length > 0) {
      const txsToInsert = transactions
        .filter((t: any) => t.date && typeof t.amount === 'number' && t.amount !== 0)
        .map((t: any) => {
          const cleanDesc = t.description.trim();
          // Fingerprint: date | amount | description | account_id
          const fpData = `${t.date}|${t.amount.toFixed(2)}|${cleanDesc.toLowerCase()}|${imp.account_id || ''}`;
          const fingerprint = crypto.createHash('sha256').update(fpData).digest('hex');

          return {
            user_id: imp.user_id,
            import_id: imp.id,
            date: t.date,
            description: cleanDesc,
            amount: t.amount,
            account_id: imp.account_id,
            account_name: account_name || 'Importado',
            source_document_id: imp.document_id,
            status: 'READY_TO_RECONCILE',
            fingerprint: fingerprint,
            metadata: {
              category_suggested: t.category,
              parsed_at: new Date().toISOString()
            }
          };
        });

      if (txsToInsert.length > 0) {
        const { error: insErr } = await supabase
          .from('imported_transactions')
          .upsert(txsToInsert, { onConflict: 'user_id,fingerprint' });

        if (insErr) {
          throw new Error(`Falha ao inserir transações: ${insErr.message}`);
        }
      }
    }

    // 8. UPDATE_IMPORT_READY: Finalizar
    console.log(`[parse-statement] STEP: UPDATE_IMPORT_READY`);
    await supabase.from('imports').update({
      status: 'ready',
      notes: `${imp.notes || ''} | Extraídas ${transactions.length} transações.`
    }).eq('id', import_id);

    console.log(`[parse-statement] SUCESSO: ${import_id}`);
    return res.status(200).json({ ok: true, count: transactions.length });

  } catch (err: any) {
    console.error('[parse-statement] ERRO CRÍTICO:', err.message);

    // Tentar gravar erro no banco
    try {
      await supabase.from('imports').update({
        status: 'error',
        notes: `ERROR: ${err.message.substring(0, 500)}`
      }).eq('id', import_id);
    } catch (dbErr) {
      console.error('[parse-statement] Falha ao gravar status de erro no banco:', dbErr);
    }

    return res.status(200).json({ // Retornar 200 com ok:false para o front tratar sem travar
      ok: false,
      message: err.message
    });
  }
}
