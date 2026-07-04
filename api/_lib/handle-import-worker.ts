
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { recordAiUsage } from './ai-usage';
import Papa from 'papaparse';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { StatementTemplateHelper } from './statement-template-helper.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { import_id } = req.body;
  if (!import_id) return res.status(400).json({ error: 'import_id is required' });

  try {
    // 1. Verificar estado atual (Reentrância)
    // FIX: Adicionada FK explícita !imports_document_id_fkey para resolver ambiguidade
    const { data: imp, error: impErr } = await supabase
      .from('imports')
      .select('*, documents:documents!imports_document_id_fkey(*)')
      .eq('id', import_id)
      .single();

    if (impErr || !imp) throw new Error('Import não encontrado');

    // Se já estiver pronto, apenas retorna sucesso
    if (imp.status === 'ready') {
      return res.status(200).json({ success: true, status: 'already_ready' });
    }

    // Se estiver processando, retorna o progresso atual (polling amigável)
    if (imp.status === 'processing') {
      return res.status(200).json({ success: true, status: 'still_processing' });
    }

    // Marca como processando no início
    await supabase.from('imports').update({ status: 'processing' }).eq('id', import_id);

    // 2. Download do arquivo
    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from(imp.documents.bucket)
      .download(imp.documents.path);

    if (dlErr || !fileBlob) throw new Error('Falha ao baixar arquivo do storage');

    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    let transactions: any[] = [];

    // 3. Extração (Gemini para Complexos, Papa para CSV/OFX)
    if (imp.type === 'pdf' || imp.type === 'image') {
      transactions = await processWithGemini(buffer, imp.documents.mime_type, imp.notes || '');
    } else if (imp.type === 'csv') {
      transactions = await parseCSV(buffer.toString('utf-8')) as any[];
    } else if (imp.type === 'ofx') {
      transactions = parseOFX(buffer.toString('utf-8')) as any[];
    }

    // 4. Upsert com Fingerprint (Deduplicação)
    if (transactions.length > 0) {
      // Executar verificação inteligente de duplicidades
      const checkedTxs = await StatementTemplateHelper.checkDuplicates(supabase, imp.user_id, transactions, false);

      const txsToInsert = checkedTxs.map((t: any) => {
        const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount).replace(',', '.'));
        const desc = (t.description || '').trim();
        const date = t.date;

        // Fingerprint único: data + valor + descrição + conta
        const fpData = `${date}|${amount.toFixed(2)}|${desc.toLowerCase()}|${imp.account_id || ''}`;
        const fingerprint = crypto.createHash('sha256').update(fpData).digest('hex');

        return {
          user_id: imp.user_id,
          import_id: imp.id,
          date: date,
          description: desc,
          amount: amount,
          account_id: imp.account_id,
          source_document_id: imp.document_id,
          status: 'READY_TO_RECONCILE',
          fingerprint: fingerprint,
          potential_duplicate: t.potential_duplicate || false,
          duplicate_reason: t.duplicate_reason || null,
          metadata: {
            duplicate_tx: t.duplicate_tx || null
          }
        };
      });

      const { error: insErr } = await supabase
        .from('imported_transactions')
        .upsert(txsToInsert, { onConflict: 'user_id,fingerprint' });

      if (insErr) throw insErr;
    }

    // 5. Finalizar
    await supabase.from('imports').update({
      status: 'ready',
      notes: `${imp.notes || ''} | Processadas ${transactions.length} transações.`
    }).eq('id', import_id);

    return res.status(200).json({ success: true, count: transactions.length });

  } catch (err: any) {
    console.error('API Process Error:', err);
    await supabase.from('imports').update({
      status: 'error',
      error_message: err.message
    }).eq('id', import_id);
    return res.status(500).json({ error: err.message });
  }
}

async function parseCSV(content: string): Promise<any[]> {
  return new Promise<any[]>((resolve) => {
    Papa.parse(content, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as string[][];
        if (rows.length === 0) return resolve([]);

        // Localizar cabeçalho ignorando lixo
        let headerIdx = -1;
        for (let i = 0; i < Math.min(rows.length, 20); i++) {
          const rowStr = rows[i].join('|').toLowerCase();
          if (rowStr.includes('data') && (rowStr.includes('valor') || rowStr.includes('lanç'))) {
            headerIdx = i;
            break;
          }
        }

        const dataRows = headerIdx !== -1 ? rows.slice(headerIdx + 1) : rows;
        const header = headerIdx !== -1 ? rows[headerIdx].map(c => c.toLowerCase().trim()) : [];

        // Mapear colunas evitando "documento" como valor
        const dateCol = header.findIndex(c => c.includes('data'));
        const descCol = header.findIndex(c => c.includes('hist') || c.includes('desc'));
        // Prioriza colunas de valor que não contenham "doc"
        let amountCol = header.findIndex(c => (c.includes('valor') || c.includes('lanç')) && !c.includes('doc'));

        const txs: any[] = [];
        dataRows.forEach(row => {
          const rawDate = row[dateCol !== -1 ? dateCol : 0];
          const desc = row[descCol !== -1 ? descCol : 1];
          let val = 0;

          const parseVal = (s: string) => parseFloat((s || '0').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));

          if (amountCol !== -1) {
            val = parseVal(row[amountCol]);
          } else {
            // Fallback: procura última coluna que parece dinheiro
            for (let j = row.length - 1; j >= 0; j--) {
              if (row[j]?.includes(',') && !row[j]?.includes('/')) {
                val = parseVal(row[j]);
                break;
              }
            }
          }

          if (val === 0 || !rawDate) return;

          let isoDate = rawDate;
          const brMatch = rawDate.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (brMatch) isoDate = `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;

          txs.push({ date: isoDate, description: desc, amount: val });
        });
        resolve(txs);
      }
    });
  });
}

async function processWithGemini(buffer: Buffer, mimeType: string, context: string): Promise<any[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-2.5-flash';

  const prompt = `
    Extraia as transações financeiras deste documento (${mimeType}).
    Responda APENAS JSON: { "transactions": [{ "date": "YYYY-MM-DD", "description": "...", "amount": -12.34 }] }
    Regras: Despesas NEGATIVAS, Entradas POSITIVAS.
    Contexto: ${context}
  `;

  const response = await ai.models.generateContent({
    model,
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { data: buffer.toString('base64'), mimeType } }
      ]
    }],
    config: { responseMimeType: "application/json" }
  });
  await recordAiUsage(supabase, 'import_worker', null, response, 'gemini-2.5-flash');

  try {
    let rawText = (response as any).text || ((response as any).response && ((response as any).response as any).text) || ((response as any).response && typeof ((response as any).response as any).text === 'function' && ((response as any).response as any).text()) || '';
    const cleanJson = rawText.replace(/```json|```/g, "").trim();
    const data = JSON.parse(cleanJson || '{}');
    return data.transactions || [];
  } catch { return []; }
}

function parseOFX(content: string): any[] {
  const txs: any[] = [];
  const matches = content.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/g);
  for (const m of matches) {
    const b = m[1];
    const date = b.match(/<DTPOSTED>(\d{8})/)?.[1];
    const amt = b.match(/<TRNAMT>([-]?\d+\.?\d*)/)?.[1];
    const desc = b.match(/<MEMO>(.*)/)?.[1] || b.match(/<NAME>(.*)/)?.[1];
    if (date && amt && desc) {
      txs.push({
        date: `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`,
        description: desc.trim(),
        amount: parseFloat(amt)
      });
    }
  }
  return txs;
}
