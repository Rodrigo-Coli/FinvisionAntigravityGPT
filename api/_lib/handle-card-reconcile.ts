import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import { recordAiUsage } from './ai-usage.js';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { StatementTemplateHelper } from './statement-template-helper.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function handleCardReconcile(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { import_id, account_id, import_source } = req.body;
  if (!import_id) return res.status(400).json({ error: 'import_id is required' });

  try {
    const { data: imp, error: impErr } = await supabase.from('imports').select('*').eq('id', import_id).single();
    if (impErr || !imp) throw new Error(`Import ${import_id} não encontrado`);

    const { data: doc, error: docErr } = await supabase.from('documents').select('*').eq('id', imp.document_id).single();
    if (docErr || !doc) throw new Error('Documento associado não encontrado');

    const { data: fileBlob, error: dlErr } = await supabase.storage.from(doc.bucket).download(doc.path);
    if (dlErr || !fileBlob) throw new Error('Falha ao baixar arquivo');
    const buffer = Buffer.from(await fileBlob.arrayBuffer());

    const targetAccountId = account_id || imp.account_id;
    let processedTxs: any[] = [];
    let templateLearned: any = null;
    const isTextFile = ['csv', 'xlsx'].includes(imp.type);

    // 1. Tentar parse local com template cache
    if (isTextFile && targetAccountId) {
      const template = await StatementTemplateHelper.getTemplate(supabase, imp.user_id, targetAccountId, true, imp.type);
      if (template) {
        console.log(`[Card Reconcile] Template encontrado para cartão ${targetAccountId}. Iniciando parse local...`);
        processedTxs = StatementTemplateHelper.tryLocalParse(buffer, imp.type, template);
      }
    }

    // 2. Fallback para Gemini se não houver template ou se falhar/estiver vazio
    if (processedTxs.length === 0) {
      console.log('[Card Reconcile] Bypassing/Fallback to Gemini para extração e aprendizado de modelo...');
      const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada.');
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      const prompt = `Você é um especialista em conciliação de cartões de crédito. Analise o documento extrato de cartão.
Extraia todas as transações individuais para uma lista JSON.
SE for um arquivo de texto estruturado (como CSV ou Excel/XLSX), identifique a estrutura de colunas e retorne-a no campo 'template' no formato:
{
  "file_type": "csv" ou "xlsx",
  "header_row_index": número da linha onde fica o cabeçalho (0-indexed),
  "date_column_index": índice da coluna de data,
  "description_column_index": índice da coluna de descrição,
  "amount_column_index": índice da coluna de valor,
  "date_format": "DD/MM/YYYY" ou "YYYY-MM-DD",
  "decimal_separator": "," ou "."
}

REGRAS: 1. DATA (YYYY-MM-DD). 2. DESCRIÇÃO. 3. VALOR. PARCELAMENTO: Se '2/5', installment_number=2, installment_total=5.

RETORNE APENAS JSON NO FORMATO:
{
  "transactions": [{"date":"YYYY-MM-DD","description":"texto","amount":123.45,"merchant_normalized":"texto","installment_number":2,"installment_total":5,"category_name":"categoria opcional"}],
  "template": { ... }
}`;

      let contents = [{ parts: [{ text: prompt }, { inlineData: { data: buffer.toString('base64'), mimeType: doc.mime_type || 'application/pdf' } }] }];
      if (['csv', 'ofx', 'xlsx'].includes(imp.type)) {
        contents = [{ parts: [{ text: prompt }, { text: `CONTEÚDO:\n${buffer.toString('utf-8').substring(0, 30000)}` }] }];
      }

      const fallbackModels = ['gemini-2.5-flash', 'gemini-2.0-flash'];
      let rawText = '';
      for (const modelName of fallbackModels) {
        try {
          const response = await ai.models.generateContent({
            model: modelName, contents,
            config: {
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
                        installment_number: { type: Type.INTEGER },
                        installment_total: { type: Type.INTEGER },
                        category_name: { type: Type.STRING }
                      },
                      required: ["date", "description", "amount"]
                    }
                  },
                  template: {
                    type: Type.OBJECT,
                    properties: {
                      file_type: { type: Type.STRING },
                      header_row_index: { type: Type.INTEGER },
                      date_column_index: { type: Type.INTEGER },
                      description_column_index: { type: Type.INTEGER },
                      amount_column_index: { type: Type.INTEGER },
                      date_format: { type: Type.STRING },
                      decimal_separator: { type: Type.STRING }
                    }
                  }
                },
                required: ["transactions"]
              }
            }
          });
          await recordAiUsage(supabase, 'card_reconcile', null, response, 'gemini-2.5-flash');
          rawText = (response as any).text || (response as any).candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (rawText) break;
        } catch (e) { console.error(`Falha no modelo ${modelName}:`, e); }
      }

      if (!rawText) throw new Error('A IA não retornou dados.');
      const parsedData = JSON.parse(rawText.replace(/```json|```/g, "").trim());
      processedTxs = parsedData.transactions || [];
      templateLearned = parsedData.template;

      // Se aprendeu um novo template, salvar no banco!
      if (templateLearned && targetAccountId && isTextFile) {
        console.log('[Card Reconcile] Aprendendo e salvando o novo modelo/template...');
        await StatementTemplateHelper.saveTemplate(supabase, imp.user_id, targetAccountId, true, imp.type, templateLearned);
      }
    }

    const isMobills = import_source === 'smart' || (imp.parse_meta as any)?.is_mobills || imp.notes?.toLowerCase().includes('mobills') || imp.notes?.toLowerCase().includes('smart');

    if (processedTxs.length > 0) {
      if (isMobills) {
        const cardCache = new Map<string, string>();
        const categoryCache = new Map<string, string>();
        const entries = [];
        for (const t of processedTxs) {
          const parsedDate = StatementTemplateHelper.parseDate(t.date) || new Date().toISOString().split('T')[0];
          const parsedAmount = StatementTemplateHelper.parseAmount(t.amount);
          
          const cardsKey = (t.card_name || 'Mobills Card').toUpperCase();
          let cardId = cardCache.get(cardsKey);
          if (!cardId) {
            const { data: exCard } = await supabase.from('cards').select('id').ilike('name', t.card_name || 'Mobills Card').eq('user_id', imp.user_id).maybeSingle();
            if (exCard) cardId = exCard.id;
            else { const { data: newCard } = await supabase.from('cards').insert({ user_id: imp.user_id, name: t.card_name || 'Mobills Card', brand: 'VISA', limit_total: 1000, closing_day: 1, due_day: 10, color: '#6366f1', account_id: targetAccountId }).select('id').single(); cardId = newCard?.id; }
            if (cardId) cardCache.set(cardsKey, cardId);
          }
          const catsKey = (t.category_name || t.category || 'Outros').toUpperCase();
          let catsId = categoryCache.get(catsKey);
          if (!catsId) {
            const { data: exCat } = await supabase.from('categories').select('id').ilike('name', t.category_name || t.category || 'Outros').eq('user_id', imp.user_id).maybeSingle();
            if (exCat) catsId = exCat.id;
            else { const { data: newCat } = await supabase.from('categories').insert({ user_id: imp.user_id, name: t.category_name || t.category || 'Outros', color: '#ef4444', icon: 'Tag' }).select('id').single(); catsId = newCat?.id; }
            if (catsId) categoryCache.set(catsKey, catsId);
          }
          entries.push({ user_id: imp.user_id, card_id: cardId || targetAccountId, used_card_id: cardId || targetAccountId, date: parsedDate, description: t.description || 'Mobills Card Import', amount: Math.abs(parsedAmount), category_id: catsId, source: 'IMPORT', status: 'POSTED', owner_name: 'Pessoal', metadata: { import_id: imp.id, source: 'mobills_direct_motor', original_category: t.category_name, installment_info: { number: t.installment_number || null, total: t.installment_total || null } } });
        }
        if (entries.length > 0) {
          const { error: insErr } = await supabase.from('card_transactions').insert(entries);
          if (insErr) {
            console.error('[Card Reconcile] Erro ao inserir transações mobills:', insErr);
            throw new Error(`Erro ao salvar transações diretas no banco de dados: ${insErr.message}`);
          }
        }
      } else {
        // Verificar duplicidades no extrato do cartão antes do upsert
        console.log('[Card Reconcile] Executando verificação inteligente de duplicidades...');
        const checkedTxs = await StatementTemplateHelper.checkDuplicates(supabase, imp.user_id, processedTxs, true);

        const fingerprintsSeen = new Set<string>();
        const txsToInsert = checkedTxs.map((t: any) => {
          const parsedDate = StatementTemplateHelper.parseDate(t.date) || new Date().toISOString().split('T')[0];
          const parsedAmount = StatementTemplateHelper.parseAmount(t.amount);
          
          const fingerprintBase = `${parsedDate}|${Number(parsedAmount).toFixed(2)}|${t.description.toLowerCase()}|${targetAccountId || ''}`;
          let fingerprint = crypto.createHash('sha256').update(fingerprintBase).digest('hex');
          
          let count = 1;
          while (fingerprintsSeen.has(fingerprint)) {
            fingerprint = crypto.createHash('sha256').update(`${fingerprintBase}|dup-${count}`).digest('hex');
            count++;
          }
          fingerprintsSeen.add(fingerprint);
          
          return {
            user_id: imp.user_id,
            import_id,
            date: parsedDate,
            description: t.description,
            amount: -Math.abs(parsedAmount),
            account_id: targetAccountId,
            status: 'READY_TO_RECONCILE',
            fingerprint: fingerprint,
            potential_duplicate: t.potential_duplicate || false,
            duplicate_reason: t.duplicate_reason || null,
            metadata: {
              is_card: true,
              merchant_normalized: t.merchant_normalized || t.description,
              installment_info: { number: t.installment_number || null, total: t.installment_total || null },
              duplicate_tx: t.duplicate_tx || null
            }
          };
        });
        
        const { error: upsertErr } = await supabase.from('imported_transactions').upsert(txsToInsert, { onConflict: 'user_id,fingerprint' });
        if (upsertErr) {
          console.error('[Card Reconcile] Erro no upsert das transações importadas:', upsertErr);
          throw new Error(`Erro ao salvar transações pendentes no banco de dados: ${upsertErr.message}`);
        }
      }
    }

    await supabase.from('imports').update({ status: 'ready', notes: `Processado. Extraídas ${processedTxs.length} transações.` }).eq('id', import_id);
    return res.status(200).json({ success: true, count: processedTxs.length });
  } catch (err: any) {
    console.error('[API-Card-Reconcile] Erro:', err);
    await supabase.from('imports').update({ status: 'error', notes: `ERROR: ${err.message}` }).eq('id', import_id);
    return res.status(500).json({ error: err.message });
  }
}
