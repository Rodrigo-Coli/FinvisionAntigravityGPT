// @ts-ignore: Deno types
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore: Supabase types
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
// @ts-ignore: Gemini types
import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@^1.39.0";
// @ts-ignore: XLSX
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });

  try {
    const { import_id } = await req.json();
    if (!import_id) throw new Error("import_id is required");

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // 1. Fetch Import Record
    // FIX: Adicionada FK explícita !imports_document_id_fkey para resolver ambiguidade
    const { data: importRec, error: fetchErr } = await supabase
      .from("imports")
      .select("*, documents:documents!imports_document_id_fkey(*)")
      .eq("id", import_id)
      .single();

    if (fetchErr || !importRec) throw new Error("Import record not found");

    const updateStatus = async (status: string, step: string, error?: string) => {
      await supabase
        .from("imports")
        .update({
          status,
          parse_meta: { ...importRec.parse_meta, step },
          error_message: error || null
        })
        .eq("id", import_id);
    };

    await updateStatus("processing", "download");

    // 2. Download File
    const { data: fileData, error: downloadErr } = await supabase.storage
      .from(importRec.documents.bucket)
      .download(importRec.documents.path);

    if (downloadErr || !fileData) throw new Error(`Download failed: ${downloadErr?.message}`);

    // 3. Extract Content
    await updateStatus("processing", "extract");
    let extractedText = "";
    const fileBytes = new Uint8Array(await fileData.arrayBuffer());

    if (importRec.type === "csv") {
      extractedText = new TextDecoder().decode(fileBytes);
    } else if (importRec.type === "xlsx") {
      const workbook = XLSX.read(fileBytes, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      extractedText = XLSX.utils.sheet_to_csv(firstSheet);
    } else if (importRec.type === "pdf" || importRec.type === "image") {
      extractedText = "[MULTIMODAL_INPUT]";
    }

    // 4. Intelligence via Gemini
    await updateStatus("processing", "llm");
    const model = "gemini-2.5-flash";

    const base64File = btoa(String.fromCharCode(...fileBytes));
    const prompt = `
      Você é um especialista em conciliação bancária. Analise o conteúdo fornecido (extrato/comprovante).
      Converta os dados para uma lista estruturada de transações.
      
      REGRAS:
      1. Campo 'date' deve ser YYYY-MM-DD.
      2. Campo 'amount' deve ser um número float. 
      3. Se for despesa/saída/débito, o 'amount' deve ser NEGATIVO.
      4. Se for receita/entrada/crédito, o 'amount' deve ser POSITIVO.
      5. Remova linhas de saldo, totais e metadados de cabeçalho.
      6. Contexto: Fonte=${importRec.source_type}, Conta=${importRec.parse_meta.account_name}.
      
      Retorne APENAS um JSON válido.
    `;

    const contents = [
      {
        parts: [
          { text: prompt },
          extractedText === "[MULTIMODAL_INPUT]"
            ? { inlineData: { data: base64File, mimeType: importRec.documents.mime_type } }
            : { text: `CONTEÚDO DO ARQUIVO:\n${extractedText.substring(0, 10000)}` }
        ]
      }
    ];

    const result = await genAI.models.generateContent({
      model,
      contents,
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
                  confidence: { type: Type.NUMBER }
                },
                required: ["date", "description", "amount"]
              }
            },
            notes: { type: Type.STRING }
          },
          required: ["transactions"]
        }
      }
    });

    const parsedResponse = JSON.parse(result.text || "{}");
    const transactions = parsedResponse.transactions || [];

    // 5. Save Transactions
    await updateStatus("processing", "insert");

    // 🔥 Regra que você definiu:
    // - extrato bancário (source_type = bank) deve virar "PAGO por padrão" quando conciliado
    // Aqui a gente NÃO insere direto em `transactions`, então guardamos essa intenção no metadata.
    const paidDefaultOnReconcile = (String(importRec.source_type || "").toLowerCase() === "bank");

    const nowIso = new Date().toISOString();

    const txsToInsert = await Promise.all(transactions.map(async (t: any) => {
      const normalizedDesc = (t.description || "").trim();
      const fpData = `${t.date}|${Number(t.amount).toFixed(2)}|${normalizedDesc.toLowerCase()}|${importRec.account_id || ''}`;

      const encoder = new TextEncoder();
      const data = encoder.encode(fpData);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const fingerprint = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

      const signedAmount = Number(t.amount || 0);
      const absAmount = Math.abs(signedAmount);

      return {
        user_id: importRec.user_id,
        import_id: importRec.id,
        date: t.date,
        description: normalizedDesc,
        amount: signedAmount,
        account_id: importRec.account_id,
        account_name: importRec.parse_meta.account_name,
        source_document_id: importRec.document_id,
        status: "READY_TO_RECONCILE",
        fingerprint,
        metadata: {
          ai_confidence: t.confidence || 1.0,
          ai_notes: parsedResponse.notes,

          // ✅ Flags para a etapa de conciliação
          source_type: importRec.source_type,
          bank_import_paid_default: paidDefaultOnReconcile,
          paid_at_default: paidDefaultOnReconcile ? nowIso : null,
          paid_amount_default: paidDefaultOnReconcile ? absAmount : null,

          // Útil pra converter depois (quando virar `transactions`)
          signed_amount: signedAmount,
          absolute_amount: absAmount
        }
      };
    }));

    if (txsToInsert.length > 0) {
      // ✅ DEDUPLICAÇÃO LOCAL: Evita erro "ON CONFLICT DO UPDATE command cannot affect row a second time"
      // caso o arquivo contenha transações idênticas que gerem o mesmo fingerprint.
      const uniqueTxs = Array.from(
        txsToInsert.reduce((map, tx) => {
          map.set(tx.fingerprint, tx);
          return map;
        }, new Map()).values()
      );

      const { error: insertErr } = await supabase
        .from("imported_transactions")
        .upsert(uniqueTxs, { onConflict: "user_id,fingerprint" });

      if (insertErr) throw insertErr;
    }

    // 6. Complete
    await supabase
      .from("imports")
      .update({
        status: "ready",
        parse_meta: {
          ...importRec.parse_meta,
          step: "done",
          count: transactions.length,
          notes: parsedResponse.notes
        }
      })
      .eq(import_id);

    return new Response(JSON.stringify({ success: true, count: transactions.length }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
});
