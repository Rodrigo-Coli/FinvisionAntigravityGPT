
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
  const { import_id, account_id, import_source } = req.body;
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

    // 3. Download and Prepare File
    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from(doc.bucket)
      .download(doc.path);

    if (dlErr || !fileBlob) throw new Error('Falha ao baixar arquivo do storage');

    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    const isTextFile = ['csv', 'ofx', 'xlsx'].includes(imp.type);

    // 4. AI Extraction with Gemini
    const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!geminiKey) throw new Error('Chave do Gemini (GEMINI_API_KEY) não encontrada nas variáveis de ambiente.');

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const model = 'gemini-2.5-flash';

    console.log(`[API-Card] Iniciando Gemini para import ${import_id} (Tipo: ${imp.type})`);

    const prompt = `
      Você é um especialista em conciliação de cartões de crédito com foco em mapeamento semântico flexível.
      Analise o documento fornecido (extrato, fatura ou backup).
      
      OBJETIVO: Extrair transações e identificar colunas de forma inteligente.
      
      REGRAS DE INTERPRETAÇÃO (MUITO IMPORTANTE):
      1. DATA: Procure por "Data", "Vencimento", "Dia". (Formato YYYY-MM-DD).
      2. DESCRIÇÃO: Procure por "Descrição", "Histórico", "Detalhe", "Estabelecimento".
      3. VALOR: Procure por "Valor", "Quantia", "Montante". (Manter como positivo).
      4. CARTÃO (Conta): Procure por "Cartão", "Conta", "Origem", "Destino", "Bancos". (Mapear p/ card_name).
      5. CATEGORIA: Procure por "Categoria", "Tipo", "Classificação", "Grupo". (Mapear p/ category_name).
      
      PARCELAMENTO: Se a descrição contiver algo como 'Amazon 2/5' ou '2 de 5', extraia installment_number=2 e installment_total=5.
      
      REGRAS DE OURO:
      - Ignore cabeçalhos, totais de rodapé e saldos acumulados.
      - Se o documento for de um sistema terceiro (ex: Mobills), trate as colunas de "Cartão" e "Categoria" como nomes reais.
      
      Retorne APENAS um objeto JSON no formato:
      {"transactions": [{"date": "YYYY-MM-DD", "description": "texto", "amount": 123.45, "installment_number": 2, "installment_total": 5, "card_name": "Nome do Cartão", "category_name": "Nome da Categoria"}]}
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

    const fallbackModels = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'];
    let result: any = null;
    let rawText = '';
    let lastError: any = null;

    for (let i = 0; i < fallbackModels.length; i++) {
      const currentModel = fallbackModels[i];
      console.log(`[API-Card] Tentando modelo: ${currentModel} (Tentativa ${i + 1}/${fallbackModels.length})`);

      try {
        result = await ai.models.generateContent({
          model: currentModel,
          contents,
          config: {
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
                      merchant_normalized: { type: Type.STRING },
                      installment_number: { type: Type.NUMBER },
                      installment_total: { type: Type.NUMBER },
                      category_name: { type: Type.STRING },
                      card_name: { type: Type.STRING }
                    },
                    required: ["date", "description", "amount"]
                  }
                }
              },
              required: ["transactions"]
            }
          }
        });

        // Pegar o texto de forma segura
        try {
          const response = result.response;
          rawText = result.text ||
            (response && response.text) ||
            (response && typeof response.text === 'function' ? response.text() : '');
        } catch (e) {
          console.error('[API-Card] Erro ao extrair texto da resposta:', e);
        }

        console.log(`[API-Card] Sucesso com ${currentModel}. Resposta bruta da IA length: ${rawText.length}`);

        if (rawText) {
          break; // Sucesso, sai do loop
        } else {
          throw new Error('A IA não retornou nenhum dado nesse request.');
        }

      } catch (error: any) {
        lastError = error;
        const errMsg = error.message || String(error);
        console.error(`[API-Card] Falha ao tentar ${currentModel}:`, errMsg);

        const isQuotaError = errMsg.includes('429') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('exhausted');

        if (isQuotaError && i < fallbackModels.length - 1) {
          console.log(`[API-Card] Limite atingido (429). Chaveando para próximo modelo de Fallback...`);
        } else {
          break; // Não é erro de cota ou é o último modelo
        }
      }
    }

    console.log('[API-Card] Resposta final bruta da IA (primeiros 100 char):', rawText.substring(0, 100));

    if (!rawText) {
      throw new Error(`Falha final na IA após tentar modelo(s). Último erro: ${lastError?.message || 'O documento é ilegível ou a IA não retornou dados.'}`);
    }

    const cleanJson = rawText.replace(/```json|```/g, "").trim();
    let parsedData;
    try {
      parsedData = JSON.parse(cleanJson);
    } catch (e) {
      console.error('[API-Card] Erro ao fazer parse do JSON truncado:', e);
      throw new Error("O arquivo enviado é muito longo e excedeu o limite máximo de leitura da Inteligência Artificial. Por favor, divida o seu PDF em períodos menores (ex: 3 a 5 meses por arquivo).");
    }
    const processedTxs = parsedData.transactions || [];

    // 5. Save Data (Bypass or Reconcile Queue)
    const isMobills = import_source === 'smart' || (imp.parse_meta as any)?.is_mobills || imp.notes?.toLowerCase().includes('mobills') || imp.notes?.toLowerCase().includes('smart');
    const targetAccountId = account_id || imp.account_id;
    const fingerprintsSeen = new Map();

    if (processedTxs.length > 0) {
      if (isMobills) {
        // BYPASS MOTOR: Inserir direto em card_transactions (Faturas) com Auto-Provisão

        const cardCache = new Map<string, string>();
        const categoryCache = new Map<string, string>();

        // Helper: Resolver ou Criar Cartão
        const resolveCardId = async (name: string, userId: string) => {
          if (!name) return targetAccountId;
          const key = name.trim().toUpperCase();
          if (cardCache.has(key)) return cardCache.get(key) as string;

          const { data: existing } = await supabase
            .from('cards')
            .select('id')
            .ilike('name', name)
            .eq('user_id', userId)
            .maybeSingle();

          if (existing) {
            cardCache.set(key, existing.id);
            return existing.id;
          }

          const { data: newCard, error: createErr } = await supabase
            .from('cards')
            .insert({
              user_id: userId,
              name: name,
              brand: 'VISA',
              limit_total: 1000,
              closing_day: 1,
              due_day: 10,
              color: '#6366f1',
              account_id: targetAccountId

            })
            .select('id')
            .single();

          if (createErr) console.error(`[Mobills-Motor] Erro ao criar cartão ${name}:`, createErr);
          const finalId = newCard?.id || targetAccountId;
          if (finalId) cardCache.set(key, finalId);
          return finalId;
        };

        // Helper: Resolver ou Criar Categoria
        const resolveCategoryId = async (name: string, userId: string) => {
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
              color: '#ef4444',
              icon: 'Tag'
            })
            .select('id')
            .single();

          if (createErr) console.error(`[Mobills-Motor] Erro ao criar categoria ${name}:`, createErr);
          if (newCat?.id) categoryCache.set(key, newCat.id);
          return newCat?.id;
        };

        const entriesToInsert = [];
        for (const t of processedTxs) {
          const date = t.date || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
          const amount = Math.abs(Number(t.amount) || 0);
          const resolvedCardId = await resolveCardId(t.card_name || 'Mobills Card', imp.user_id);
          const resolvedCatId = await resolveCategoryId(t.category_name || t.category, imp.user_id);

          entriesToInsert.push({
            user_id: imp.user_id,
            card_id: resolvedCardId,
            used_card_id: resolvedCardId,
            date: date,
            description: t.description || 'Mobills Card Import',
            amount: amount,
            category_id: resolvedCatId,
            source: 'IMPORT',
            status: 'POSTED',
            owner_name: 'Pessoal',
            metadata: {
              import_id: imp.id,
              source: 'mobills_direct_motor',
              original_category: t.category_name,
              installment_info: {
                number: t.installment_number || null,
                total: t.installment_total || null
              }
            }
          });
        }

        const { error: cardErr } = await supabase.from('card_transactions').insert(entriesToInsert);
        if (cardErr) throw new Error(`Falha ao inserir histórico Mobills Card: ${cardErr.message}`);
      } else {
        // PADRÃO: Salvar na fila de conciliação (imported_transactions)
        const txsToInsert = [];

        for (const t of processedTxs) {
          const description = t.description || t.merchant || t.merchant_normalized || 'Transação sem descrição';
          const todaySP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
          const date = t.date || todaySP;
          const amountVal = Number(t.amount) || 0;
          const fpData = `${date}|${amountVal.toFixed(2)}|${description.toLowerCase()}|${targetAccountId || ''}`;
          const fingerprint = crypto.createHash('sha256').update(fpData).digest('hex');

          if (fingerprintsSeen.has(fingerprint)) continue;
          fingerprintsSeen.set(fingerprint, true);

          // Fuzzy Duplicate Check (±3 days, ±R$0.05)
          let isDuplicate = false;
          let dupReason = null;

          const txDateObj = new Date(date);
          const minDate = new Date(txDateObj);
          minDate.setDate(minDate.getDate() - 3);
          const maxDate = new Date(txDateObj);
          maxDate.setDate(maxDate.getDate() + 3);

          const minAmount = Math.abs(amountVal) - 0.05;
          const maxAmount = Math.abs(amountVal) + 0.05;

          // Construir a query dinamicamente
          let query = supabase
            .from('card_transactions')
            .select('id, date, amount, description')
            .eq('user_id', imp.user_id)
            .gte('date', minDate.toISOString().split('T')[0])
            .lte('date', maxDate.toISOString().split('T')[0]);

          if (targetAccountId) {
            query = query.eq('card_id', targetAccountId);
          }

          const { data: possibleDups } = await query;

          if (possibleDups && possibleDups.length > 0) {
            // Filtrar no JS pelo valor absoluto
            const match = possibleDups.find(dup => {
              const absDupAmount = Math.abs(Number(dup.amount));
              return absDupAmount >= minAmount && absDupAmount <= maxAmount;
            });

            if (match) {
              isDuplicate = true;
              dupReason = `Transação similar no cartão: ${match.description} em ${match.date} (R$ ${match.amount})`;
            }
          }

          txsToInsert.push({
            user_id: imp.user_id,
            import_id: import_id,
            date: date,
            description: description,
            amount: -Math.abs(amountVal), // Cartão é sempre negativo na fila por padrao
            account_id: targetAccountId,
            status: 'READY_TO_RECONCILE',
            fingerprint: fingerprint,
            potential_duplicate: isDuplicate,
            duplicate_reason: dupReason,
            metadata: {
              is_card: true,
              merchant_normalized: t.merchant_normalized || t.merchant || description,
              installment_info: {
                number: t.installment_number || null,
                total: t.installment_total || null
              }
            }
          });
        }

        const { error: insErr } = await supabase
          .from('imported_transactions')
          .upsert(txsToInsert, { onConflict: 'user_id,fingerprint' });

        if (insErr) throw new Error(`Falha ao inserir transações: ${insErr.message}`);
      }
    }

    // 6. Finalize
    await supabase.from('imports').update({
      status: 'ready',
      notes: `Processado. Extraídas ${processedTxs.length} transações.`
    }).eq('id', import_id);

    return res.status(200).json({ success: true, count: processedTxs.length });

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
