
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
      .select('id, user_id, document_id, account_id, type, notes, parse_meta')
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
    const model = 'gemini-2.5-flash';

    const prompt = `
      Você é um especialista em conciliação financeira com foco em mapeamento semântico flexível.
      Analise o documento fornecido (extrato, relatório ou backup).
      
      OBJETIVO: Extrair transações e identificar colunas de forma inteligente.
      
      REGRAS DE INTERPRETAÇÃO (MUITO IMPORTANTE):
      1. DATA: Procure por "Data", "Vencimento", "Movimento", "Dia". (Formato YYYY-MM-DD).
      2. DESCRIÇÃO: Procure por "Descrição", "Histórico", "Detalhe", "Favorecido".
      3. VALOR: Procure por "Valor", "Quantia", "Montante", "Número". (Se for saída, manter negativo).
      4. CONTA: Procure por "Conta", "Banco", "Origem", "Destino", "Bancos". (Mapear p/ account_name).
      5. CATEGORIA: Procure por "Categoria", "Tipo", "Classificação", "Grupo". (Mapear p/ category_name).
      
      REGRAS DE OURO:
      - Ignore cabeçalhos, totais de rodapé e saldos acumulados.
      - Se o documento for de um sistema terceiro (ex: Mobills, Organizze), trate as colunas de "Conta" e "Categoria" como nomes reais que serão criados.
      
      Retorne APENAS um objeto JSON no formato:
      {"transactions": [{"date": "YYYY-MM-DD", "description": "texto", "amount": -123.45, "account_name": "Nome da Conta", "category_name": "Nome da Categoria"}]}
    `;

    let contents: any;
    if (isTextFile) {
      const textContent = buffer.toString('utf-8');
      contents = [{ parts: [{ text: prompt }, { text: `CONTEÚDO DO ARQUIVO:\n${textContent.substring(0, 30000)}` }] }];
    } else {
      contents = [{
        parts: [
          { text: prompt },
          { inlineData: { data: buffer.toString('base64'), mimeType: doc.mime_type || 'application/pdf' } }
        ]
      }];
    }

    const fallbackModels = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'];

    let response: any = null;
    let rawText = '';
    let lastError: any = null;

    for (let i = 0; i < fallbackModels.length; i++) {
      const currentModel = fallbackModels[i];
      console.log(`[API] Tentando modelo: ${currentModel} (Tentativa ${i + 1}/${fallbackModels.length})`);

      try {
        response = await ai.models.generateContent({
          model: currentModel,
          contents,
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 8192,
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

        // 6. PARSE_JSON: Validar retorno
        console.log(`[parse-statement] STEP: PARSE_JSON`);
        // Pegar o texto de forma segura
        try {
          rawText = (response as any).text || (response.response && (response.response as any).text) || (response.response && typeof (response.response as any).text === 'function' && (response.response as any).text()) || '';
        } catch (e) {
          console.error('[API] Erro ao extrair texto:', e);
        }

        console.log(`[API] Sucesso com ${currentModel}. Resposta bruta da IA length: ${rawText.length}`);

        if (rawText) {
          // Deu tudo certo, podemos sair do loop
          break;
        } else {
          throw new Error('A IA não retornou nenhum dado nesse request.');
        }

      } catch (error: any) {
        lastError = error;
        const errMsg = error.message || String(error);
        console.error(`[API] Falha ao tentar ${currentModel}:`, errMsg);

        // Verifica se é erro 429 (Resource Exhausted)
        const isQuotaError = errMsg.includes('429') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('exhausted');

        if (isQuotaError && i < fallbackModels.length - 1) {
          console.log(`[API] Limite atingido (429). Chaveando para próximo modelo de Fallback...`);
          // Segue para a próxima iteração do loop
        } else {
          // Se não for erro de cota, ou se for o último modelo da lista, interrompe tudo
          break;
        }
      }
    }

    if (!rawText) {
      throw new Error(`Falha final na IA após tentar modelo(s). Último erro: ${lastError?.message || 'A IA não retornou nenhum dado.'}`);
    }

    const cleanJson = rawText.replace(/```json|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (e) {
      console.error('[API] Erro ao fazer parse do JSON truncado:', e);
      throw new Error("O arquivo enviado é muito longo e excedeu o limite máximo de leitura da Inteligência Artificial. Por favor, divida o seu PDF em períodos menores (ex: 3 a 5 meses por arquivo).");
    }
    const transactions = parsed.transactions || [];


    // 7. PERSIST_DATA: Salvar no banco (Fila ou Direto no Histórico)
    const isMobills = import_source === 'smart' || (imp.parse_meta as any)?.is_mobills || imp.notes?.toLowerCase().includes('mobills') || imp.notes?.toLowerCase().includes('smart');
    console.log(`[parse-statement] STEP: PERSIST_DATA (Smart Bypass: ${!!isMobills})`);

    if (transactions.length > 0) {
      if (isMobills) {
        // BYPASS MOTOR: Inserir direto em transactions (Histórico) com Auto-Provisão

        const accountCache = new Map<string, string>();
        const categoryCache = new Map<string, string>();

        // Helper: Resolver ou Criar Conta
        const resolveAccountId = async (name: string, userId: string) => {
          if (!name) return imp.account_id;
          const key = name.trim().toUpperCase();
          if (accountCache.has(key)) return accountCache.get(key) as string;

          const { data: existing } = await supabase
            .from('accounts')
            .select('id')
            .ilike('institution', name)
            .eq('user_id', userId)
            .maybeSingle();

          if (existing) {
            accountCache.set(key, existing.id);
            return existing.id;
          }

          const { data: newAcc, error: createErr } = await supabase
            .from('accounts')
            .insert({
              user_id: userId,
              institution: name,
              type: 'CHECKING',
              initial_balance: 0,
              current_balance: 0,
              color: '#0ea5e9'
            })
            .select('id')
            .single();

          if (createErr) console.error(`[Mobills-Motor] Erro ao criar conta ${name}:`, createErr);
          const finalId = newAcc?.id || imp.account_id;
          if (finalId) accountCache.set(key, finalId);
          return finalId;
        };

        // Helper: Resolver ou Criar Categoria
        const resolveCategoryId = async (name: string, userId: string, type: 'INCOME' | 'EXPENSE') => {
          if (!name) return null;
          const key = name.trim().toUpperCase();
          if (categoryCache.has(key)) return categoryCache.get(key);

          const { data: existing } = await supabase
            .from('categories')
            .select('id')
            .ilike('name', name)
            .eq('user_id', userId)
            .maybeSingle();

          if (existing) {
            categoryCache.set(key, existing.id);
            return existing.id;
          }

          const { data: newCat, error: createErr } = await supabase
            .from('categories')
            .insert({
              user_id: userId,
              name: name,
              color: type === 'INCOME' ? '#22c55e' : '#ef4444',
              icon: 'Tag'
            })
            .select('id')
            .single();

          if (createErr) console.error(`[Mobills-Motor] Erro ao criar categoria ${name}:`, createErr);
          if (newCat?.id) categoryCache.set(key, newCat.id);
          return newCat?.id;
        };

        const entriesToInsert = [];
        for (const t of transactions) {
          if (!t.date || typeof t.amount !== 'number' || t.amount === 0) continue;

          const txType = t.amount < 0 ? 'EXPENSE' : 'INCOME';
          const resolvedAccId = await resolveAccountId(t.account_name || 'Mobills', imp.user_id);
          const resolvedCatId = await resolveCategoryId(t.category_name || t.category, imp.user_id, txType);

          entriesToInsert.push({
            user_id: imp.user_id,
            date: t.date,
            description: t.description.trim(),
            amount: Math.abs(t.amount),
            type: txType,
            account_id: resolvedAccId,
            account_name: t.account_name || account_name || 'Mobills Import',
            category: t.category_name || t.category || 'Outros',
            category_id: resolvedCatId,
            is_paid: true,
            paid_at: t.date,
            metadata: {
              import_id: imp.id,
              source: 'mobills_direct_motor',
              original_category: t.category_name
            }
          });
        }

        if (entriesToInsert.length > 0) {
          const { error: histErr } = await supabase.from('transactions').insert(entriesToInsert);
          if (histErr) throw new Error(`Falha ao inserir histórico Mobills: ${histErr.message}`);

          // Recalcular saldos de todas as contas envolvidas
          const uniqueAccountIds = [...new Set(entriesToInsert.map(e => e.account_id))];
          for (const accId of uniqueAccountIds) {
            if (accId) await supabase.rpc('recalculate_account_balance', { p_account_id: accId });
          }
        }
      } else {
        // PADRÃO: Salvar na fila de conciliação (imported_transactions)
        const txsToInsert = [];

        for (const t of transactions) {
          if (!t.date || typeof t.amount !== 'number' || t.amount === 0) continue;

          const cleanDesc = t.description.trim();
          const todaySP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
          const txDate = t.date || todaySP;
          const fpData = `${txDate}|${t.amount.toFixed(2)}|${cleanDesc.toLowerCase()}|${imp.account_id || ''}`;
          const fingerprint = crypto.createHash('sha256').update(fpData).digest('hex');

          // Fuzzy Duplicate Check (±3 days, ±R$0.05)
          let isDuplicate = false;
          let dupReason = null;

          const txDateObj = new Date(txDate);
          const minDate = new Date(txDateObj);
          minDate.setDate(minDate.getDate() - 3);
          const maxDate = new Date(txDateObj);
          maxDate.setDate(maxDate.getDate() + 3);

          const rawAmount = t.amount;
          const txType = rawAmount < 0 ? 'EXPENSE' : 'INCOME';
          const minAmount = Math.abs(rawAmount) - 0.05;
          const maxAmount = Math.abs(rawAmount) + 0.05;

          // Construir a query dinamicamente
          let query = supabase
            .from('transactions')
            .select('id, date, amount, description, type')
            .eq('user_id', imp.user_id)
            .eq('type', txType)
            .gte('date', minDate.toISOString().split('T')[0])
            .lte('date', maxDate.toISOString().split('T')[0]);

          if (imp.account_id) {
            query = query.eq('account_id', imp.account_id);
          }

          const { data: possibleDups } = await query;

          if (possibleDups && possibleDups.length > 0) {
            // Filtrar no JS pelo valor absoluto para evitar problemas de sinal no banco
            const match = possibleDups.find(dup => {
              const absDupAmount = Math.abs(Number(dup.amount));
              return absDupAmount >= minAmount && absDupAmount <= maxAmount;
            });

            if (match) {
              isDuplicate = true;
              dupReason = `Transação similar encontrada: ${match.description} em ${match.date} (R$ ${match.amount})`;
            }
          }

          txsToInsert.push({
            user_id: imp.user_id,
            import_id: imp.id,
            date: txDate,
            description: cleanDesc,
            amount: t.amount,
            account_id: imp.account_id,
            account_name: account_name || 'Importado',
            source_document_id: imp.document_id,
            status: 'READY_TO_RECONCILE',
            fingerprint: fingerprint,
            potential_duplicate: isDuplicate,
            duplicate_reason: dupReason,
            metadata: {
              category_suggested: t.category,
              parsed_at: new Date().toISOString()
            }
          });
        }

        // DEDUPLICAÇÃO LOCAL: Evita erro "ON CONFLICT DO UPDATE command cannot affect row a second time"
        const fingerprintsSeen = new Set();
        const uniqueTxsToInsert = txsToInsert.filter(tx => {
          if (fingerprintsSeen.has(tx.fingerprint)) return false;
          fingerprintsSeen.add(tx.fingerprint);
          return true;
        });

        const { error: insErr } = await supabase
          .from('imported_transactions')
          .upsert(uniqueTxsToInsert, { onConflict: 'user_id,fingerprint' });

        if (insErr) throw new Error(`Falha ao inserir transações: ${insErr.message}`);
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
