import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import { recordAiUsage } from './ai-usage.js';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { StatementTemplateHelper } from './statement-template-helper.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function handleBankReconcile(req: any, res: any) {
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

    let transactions: any[] = [];
    let templateLearned: any = null;
    const isTextFile = ['csv', 'xlsx'].includes(imp.type);

    // 1. Tentar parse local com template cache
    if (isTextFile && imp.account_id) {
      const template = await StatementTemplateHelper.getTemplate(supabase, imp.user_id, imp.account_id, false, imp.type);
      if (template) {
        console.log(`[Bank Reconcile] Template encontrado para conta ${imp.account_id}. Iniciando parse local...`);
        transactions = StatementTemplateHelper.tryLocalParse(buffer, imp.type, template);
      }
    }

    // 2. Fallback para Gemini se não houver template ou se falhar/estiver vazio
    if (transactions.length === 0) {
      console.log('[Bank Reconcile] Bypassing/Fallback to Gemini para extração e aprendizado de modelo...');
      const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!geminiKey) throw new Error('Chave do Gemini (GEMINI_API_KEY) não encontrada.');
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      const prompt = `Você é um especialista em conciliação financeira. Analise o documento extrato bancário.
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

REGRAS DE VALOR: despesas/saídas devem ser valores NEGATIVOS. Entradas/receitas devem ser valores POSITIVOS. Ignore saldos e totais.

RETORNE APENAS JSON NO FORMATO:
{
  "transactions": [{"date":"YYYY-MM-DD","description":"texto","amount":-123.45,"category":"categoria opcional"}],
  "template": { ... }
}`;

      let contents = [{ parts: [{ text: prompt }, { inlineData: { data: buffer.toString('base64'), mimeType: doc.mime_type || 'application/pdf' } }] }];
      if (['csv', 'ofx', 'xlsx'].includes(imp.type)) {
        contents = [{ parts: [{ text: prompt }, { text: `CONTEÚDO:\n${buffer.toString('utf-8').substring(0, 30000)}` }] }];
      }

      const fallbackModels = ['gemini-2.5-flash', 'gemini-2.0-flash'];
      let rawText = '';
      for (const currentModel of fallbackModels) {
        try {
          const response = await ai.models.generateContent({
            model: currentModel, contents,
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
                        category: { type: Type.STRING }
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
          await recordAiUsage(supabase, 'bank_reconcile', null, response, 'gemini-2.5-flash');
          rawText = (response as any).text || (response as any).candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (rawText) break;
        } catch (e) { console.error(`Falha no modelo ${currentModel}:`, e); }
      }

      if (!rawText) throw new Error('A IA não retornou dados após tentativas.');
      const parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
      transactions = parsed.transactions || [];
      templateLearned = parsed.template;

      // Se aprendeu um novo template, salvar no banco!
      if (templateLearned && imp.account_id && isTextFile) {
        console.log('[Bank Reconcile] Aprendendo e salvando o novo modelo/template...');
        await StatementTemplateHelper.saveTemplate(supabase, imp.user_id, imp.account_id, false, imp.type, templateLearned);
      }
    }

    const isMobills = import_source === 'smart' || (imp.parse_meta as any)?.is_mobills || imp.notes?.toLowerCase().includes('mobills') || imp.notes?.toLowerCase().includes('smart');

    if (transactions.length > 0) {
      if (isMobills) {
        // Diversos entra direto como pago (sem fila de revisão), mas ainda assim
        // marcamos os possíveis duplicados: cada transação é comparada com o que já
        // existe (mesma data/valor/tipo) e a marca fica no metadata pra aparecer com
        // selo e filtro na tela de Transações. NÃO pulamos nada — só sinalizamos, pra
        // o usuário achar e apagar depois se quiser.
        const flaggedTxs = await StatementTemplateHelper.checkDuplicates(supabase, imp.user_id, transactions, false);
        const accountCache = new Map<string, string>();
        const categoryCache = new Map<string, string>();
        const entries = [];
        for (const t of flaggedTxs) {
          const parsedDate = StatementTemplateHelper.parseDate(t.date) || new Date().toISOString().split('T')[0];
          const parsedAmount = StatementTemplateHelper.parseAmount(t.amount);

          const type = parsedAmount < 0 ? 'EXPENSE' : 'INCOME';
          const accKey = (t.account_name || 'Mobills').toUpperCase();
          let accId = accountCache.get(accKey);
          if (!accId) {
            const { data: exAcc } = await supabase.from('accounts').select('id').ilike('institution', t.account_name || 'Mobills').eq('user_id', imp.user_id).maybeSingle();
            if (exAcc) accId = exAcc.id;
            else { const { data: newAcc } = await supabase.from('accounts').insert({ user_id: imp.user_id, institution: t.account_name || 'Mobills', type: 'CHECKING', initial_balance: 0, current_balance: 0, color: '#0ea5e9' }).select('id').single(); accId = newAcc?.id; }
            if (accId) accountCache.set(accKey, accId);
          }
          const catKey = (t.category_name || t.category || 'Outros').toUpperCase();
          let catId = categoryCache.get(catKey);
          if (!catId) {
            const { data: exCat } = await supabase.from('categories').select('id').ilike('name', t.category_name || t.category || 'Outros').eq('user_id', imp.user_id).maybeSingle();
            if (exCat) catId = exCat.id;
            else { const { data: newCat } = await supabase.from('categories').insert({ user_id: imp.user_id, name: t.category_name || t.category || 'Outros', color: type === 'INCOME' ? '#22c55e' : '#ef4444', icon: 'Tag' }).select('id').single(); catId = newCat?.id; }
            if (catId) categoryCache.set(catKey, catId);
          }
          // paid_amount é OBRIGATÓRIO quando is_paid=true: o trigger de saldo
          // (recalculate_account_balance) soma paid_amount, NÃO amount. Sem isso, a
          // transação entra como paga mas o saldo da conta fica parado (paid_amount NULL
          // vira 0 no COALESCE). Espelha o que o fluxo de confirmação de banco já faz.
          entries.push({ user_id: imp.user_id, date: parsedDate, description: t.description.trim(), amount: Math.abs(parsedAmount), type, account_id: accId || imp.account_id, account_name: t.account_name || accKey, category: t.category_name || t.category || 'Outros', category_id: catId, is_paid: true, paid_amount: Math.abs(parsedAmount), paid_at: parsedDate, metadata: { import_id: imp.id, source: 'mobills_direct_motor', potential_duplicate: t.potential_duplicate || false, duplicate_reason: t.duplicate_reason || null, duplicate_tx: t.duplicate_tx || null } });
        }
        if (entries.length > 0) {
          const { error: insErr } = await supabase.from('transactions').insert(entries);
          if (insErr) {
            console.error('[Bank Reconcile] Erro ao inserir transações mobills:', insErr);
            throw new Error(`Erro ao salvar transações diretas no banco de dados: ${insErr.message}`);
          }
        }
      } else {
        // Verificar duplicidades no banco antes do upsert
        console.log('[Bank Reconcile] Executando verificação inteligente de duplicidades...');
        const checkedTxs = await StatementTemplateHelper.checkDuplicates(supabase, imp.user_id, transactions, false);

        const fingerprintsSeen = new Set<string>();
        const txsToInsert = checkedTxs.map((t: any) => {
          const parsedDate = StatementTemplateHelper.parseDate(t.date) || new Date().toISOString().split('T')[0];
          const parsedAmount = StatementTemplateHelper.parseAmount(t.amount);
          
          const fingerprintBase = `${parsedDate}|${Number(parsedAmount).toFixed(2)}|${t.description.toLowerCase()}|${imp.account_id || ''}`;
          let fingerprint = crypto.createHash('sha256').update(fingerprintBase).digest('hex');
          
          let count = 1;
          while (fingerprintsSeen.has(fingerprint)) {
            fingerprint = crypto.createHash('sha256').update(`${fingerprintBase}|dup-${count}`).digest('hex');
            count++;
          }
          fingerprintsSeen.add(fingerprint);
          
          return {
            user_id: imp.user_id,
            import_id: imp.id,
            date: parsedDate,
            description: t.description.trim(),
            amount: parsedAmount,
            account_id: imp.account_id,
            account_name: account_name || 'Importado',
            source_document_id: imp.document_id,
            status: 'READY_TO_RECONCILE',
            fingerprint,
            potential_duplicate: t.potential_duplicate || false,
            duplicate_reason: t.duplicate_reason || null,
            metadata: {
              category_suggested: t.category,
              duplicate_tx: t.duplicate_tx || null,
              // Carimba a aba de onde a importação saiu. Antes disso a fila decidia a aba
              // olhando se a linha tinha uma conta cadastrada: quem importava um extrato de
              // banco SEM escolher a conta antes caía com account_id nulo e a transação
              // aparecia em "Diversos", mesmo tendo clicado em Banco.
              source_type: 'bank'
            }
          };
        });
        
        const { error: upsertErr } = await supabase.from('imported_transactions').upsert(txsToInsert, { onConflict: 'user_id,fingerprint' });
        if (upsertErr) {
          console.error('[Bank Reconcile] Erro no upsert das transações importadas:', upsertErr);
          throw new Error(`Erro ao salvar transações pendentes no banco de dados: ${upsertErr.message}`);
        }
      }
    }

    await supabase.from('imports').update({ status: 'ready', notes: `${imp.notes || ''} | Extraídas ${transactions.length} transações.` }).eq('id', import_id);
    return res.status(200).json({ ok: true, count: transactions.length });
  } catch (err: any) {
    console.error('[Bank Reconcile] Erro:', err);
    await supabase.from('imports').update({ status: 'error', notes: `ERROR: ${err.message.substring(0, 500)}` }).eq('id', import_id);
    return res.status(200).json({ ok: false, message: err.message });
  }
}
