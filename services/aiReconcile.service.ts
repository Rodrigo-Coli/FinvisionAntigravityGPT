import { supabase } from "../lib/supabase/client";
import { ReconcileItem } from "../types";

function getApiBaseUrl() {
  // Vite: import.meta.env
  // Next: process.env.NEXT_PUBLIC_*
  // fallback: ''
  try {
    // @ts-ignore
    const viteBase = import.meta?.env?.VITE_API_BASE_URL;
    if (viteBase) return String(viteBase);
  } catch {}

  // @ts-ignore
  const nextBase =
    typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_BASE_URL
      ? String(process.env.NEXT_PUBLIC_API_BASE_URL)
      : "";

  return nextBase || "";
}

// Tentativa de detectar erro de "tabela não existe" (quando você ainda não criou products/product_prices)
function isMissingRelation(err: any) {
  const msg = String(err?.message || "");
  const code = String(err?.code || "");
  // Postgres "undefined_table" costuma ser 42P01
  return code === "42P01" || msg.includes("does not exist") || msg.includes("relation");
}

// ✅ deixa erros do Supabase “humanos” (pra não virar só Object no console)
function prettySupabaseError(err: any) {
  if (!err) return "Erro desconhecido.";
  const parts: string[] = [];

  const message =
    err?.message ||
    err?.error_description ||
    err?.details ||
    (typeof err === "string" ? err : "");

  if (message) parts.push(message);
  if (err?.code) parts.push(`code=${err.code}`);
  if (err?.hint) parts.push(`hint=${err.hint}`);
  if (err?.details && err?.details !== message) parts.push(`details=${err.details}`);

  // quando vem como objeto estranho
  if (!parts.length) {
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }

  return parts.join(" | ");
}

export const AIReconcileService = {
  async processFinancialDocument(file: File): Promise<ReconcileItem[]> {
    const base64Data = await this.fileToBase64(file);
    const mimeType = file.type || "application/octet-stream";

    // ✅ chama API (server-side) para usar Gemini com segurança
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/parse-financial-document`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base64: base64Data,
        mimeType,
        fileName: file.name,
      }),
    });

    if (!res.ok) {
      let msg = "Erro ao processar documento.";
      try {
        const j = await res.json();
        msg = j?.error || j?.message || msg;
      } catch {}
      throw new Error(msg);
    }

    const data = await res.json();
    return Array.isArray(data) ? (data as ReconcileItem[]) : [];
  },

  // =========================================
  // FLUXO ATUAL (CONCILIAÇÃO) - NÃO MEXE
  // =========================================
  async saveToReconcileQueue(items: ReconcileItem[], accountId: string, accountName: string) {
    if (!supabase) throw new Error("Supabase is not configured");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("No user found");

    const payload = items.map((item) => ({
      user_id: user.id,
      date: item.date,
      description: item.description,
      amount: item.type === "debit" ? -Math.abs(item.amount) : Math.abs(item.amount),
      status: "READY_TO_RECONCILE",
      account_id: accountId,
      account_name: accountName,
      metadata: { ai_processed: true, confidence: item.confidence },
    }));

    const { error } = await supabase.from("imported_transactions").insert(payload);
    if (error) throw new Error(prettySupabaseError(error));

    return true;
  },

  // =========================================
  // AI LABS (DOCUMENTOS + ITENS) - AJUSTADO AO SEU SCHEMA REAL
  // Tabelas reais: ai_documents / ai_document_items
  // Colunas reais:
  //  ai_documents: file_path, merchant_raw, merchant_id, document_date, total_amount, currency, ocr_raw, ocr_structured, confidence, (type/source/status = enums)
  //  ai_document_items: line_index, raw_description, quantity, unit, unit_price, total_price, category_hint, product_id, is_promo, exclude_from_stats, notes
  // =========================================
  async saveToAiLabs(
    items: ReconcileItem[],
    opts: {
      documentName: string; // ex: file.name
      source: string; // ex: 'manual_upload' (PRECISA bater com o enum do DB se for NOT NULL)
      merchantName?: string | null; // vira merchant_raw
      merchantId?: string | null;
      documentDate?: string | null; // 'YYYY-MM-DD'
      currency?: string | null; // opcional
      ocrRaw?: any | null; // opcional: jsonb
      ocrStructured?: any | null; // opcional: jsonb
      confidence?: number | null; // opcional
      type?: string | null; // opcional: se você já tiver enum type
      status?: string | null; // opcional: se você já tiver enum status
    }
  ) {
    if (!supabase) throw new Error("Supabase is not configured");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      const userId = user.id;

      const documentDate =
        (opts.documentDate ? new Date(opts.documentDate) : new Date()).toISOString().slice(0, 10);

      const currency = opts.currency ?? "BRL";

      // total_amount: soma dos débitos/créditos em valor absoluto (pra analytics básico)
      const totalAmount = items.reduce((sum, it) => sum + Math.abs(Number(it.amount ?? 0)), 0);

      // 1) cria o "documento" do AI Labs (ai_documents)
      // IMPORTANTÍSSIMO: type/source/status são USER-DEFINED (enum). Se forem NOT NULL, precisa bater com os valores do enum.
      // Pra não quebrar caso existam defaults no DB, só enviamos se você passar opts.type/opts.status.
      const docInsert: any = {
        user_id: userId,
        file_path: opts.documentName, // aqui pode ser só o nome do arquivo por enquanto
        document_date: documentDate,
        merchant_raw: opts.merchantName ?? null,
        merchant_id: opts.merchantId ?? null,
        total_amount: totalAmount,
        currency,
        ocr_raw: opts.ocrRaw ?? null,
        ocr_structured: opts.ocrStructured ?? null,
        confidence: opts.confidence ?? null,
        // enums abaixo: só manda se você tiver certeza que existem no enum
        ...(opts.type ? { type: opts.type } : {}),
        ...(opts.source ? { source: opts.source } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      };

      const { data: doc, error: docErr } = await supabase
        .from("ai_documents")
        .insert(docInsert)
        .select("id")
        .single();

      if (docErr) throw new Error(prettySupabaseError(docErr));

      // 2) grava itens do documento (ai_document_items)
      // Aqui vamos preencher o essencial: line_index, raw_description, unit_price, total_price, etc.
      // product_id fica null por enquanto (opcional). Se você tiver tabela products e quiser linkar, fazemos best-effort abaixo.
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        const rawDesc = String(item.description ?? "").trim();
        if (!rawDesc) continue;

        const unitPrice = Math.abs(Number(item.amount ?? 0));
        if (!Number.isFinite(unitPrice)) continue;

        // (opcional) tentar vincular product_id se existir tabela products e se você quiser usar isso depois
        let productId: string | null = null;

        try {
          // tenta buscar por nome exato (se você já estiver populando products)
          const normalizedName = rawDesc.toLowerCase();

          const { data: product, error: prodSelErr } = await supabase
            .from("products")
            .select("id")
            .eq("user_id", userId)
            .eq("name", normalizedName)
            .maybeSingle();

          if (prodSelErr) {
            // se não existe tabela products ou RLS, ignoramos
            if (!isMissingRelation(prodSelErr)) {
              // se é outro erro relevante, você pode querer ver no console
              console.warn("products select failed:", prodSelErr);
            }
          } else if (product?.id) {
            productId = product.id;
          } else {
            // tenta criar (best-effort)
            const { data: created, error: prodInsErr } = await supabase
              .from("products")
              .insert({
                user_id: userId,
                name: normalizedName,
                brand: null,
                category: null,
                default_unit: "un",
                barcode: null,
                active: true,
              })
              .select("id")
              .single();

            if (!prodInsErr && created?.id) productId = created.id;
          }
        } catch (e) {
          // nunca deixa isso quebrar o AI Labs
          console.warn("products link skipped:", e);
        }

        const itemInsert: any = {
          user_id: userId,
          document_id: doc.id,
          line_index: i,
          raw_description: rawDesc,
          quantity: 1,
          unit: "un",
          unit_price: unitPrice,
          total_price: unitPrice,
          category_hint: null,
          product_id: productId,
          is_promo: false,
          exclude_from_stats: false,
          notes: null,
        };

        const { error: itemErr } = await supabase.from("ai_document_items").insert(itemInsert);
        if (itemErr) throw new Error(prettySupabaseError(itemErr));

        // (opcional) se você ainda quiser manter product_prices como “data mart” separado,
        // tentamos gravar sem quebrar se a tabela não existir.
        try {
          const { error: priceErr } = await supabase.from("product_prices").insert({
            user_id: userId,
            product_id: productId,
            merchant_id: opts.merchantId ?? null,
            document_id: doc.id,
            document_date: documentDate,
            unit_price: unitPrice,
            total_price: unitPrice,
            quantity: 1,
            is_promo: false,
            exclude_from_stats: false,
          });

          if (priceErr) {
            if (!isMissingRelation(priceErr)) {
              console.warn("product_prices insert failed:", priceErr);
            }
          }
        } catch (e) {
          // ignora
        }
      }

      return { documentId: doc.id };
    } catch (err: any) {
      // ✅ isso aqui garante que você nunca mais vai ver só "Object" e vai saber EXATAMENTE o motivo do 400
      throw new Error(prettySupabaseError(err));
    }
  },

  fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = (error) => reject(error);
    });
  },
};
