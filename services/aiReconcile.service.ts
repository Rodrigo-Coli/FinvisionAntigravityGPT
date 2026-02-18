import { supabase } from "../lib/supabase/client";
import { ReconcileItem } from "../types";

function getApiBaseUrl() {
  try {
    // @ts-ignore
    const viteBase = import.meta?.env?.VITE_API_BASE_URL;
    if (viteBase) return String(viteBase);
  } catch { }

  return "";
}

function isMissingRelation(err: any) {
  const msg = String(err?.message || "");
  const code = String(err?.code || "");
  return code === "42P01" || msg.includes("does not exist") || msg.includes("relation");
}

function prettySupabaseError(err: any) {
  if (!err) return "Erro desconhecido.";
  const parts: string[] = [];
  const message = err?.message || err?.error_description || err?.details || (typeof err === "string" ? err : "");
  if (message) parts.push(message);
  if (err?.code) parts.push(`code=${err.code}`);
  return parts.join(" | ");
}

export const AIReconcileService = {
  async processFinancialDocument(file: File): Promise<ReconcileItem[]> {
    const base64Data = await this.fileToBase64(file);
    const mimeType = file.type || "application/octet-stream";
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/handle-bank-reconcile`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64: base64Data, mimeType, fileName: file.name }),
    });

    if (!res.ok) throw new Error("Erro ao processar documento.");
    const data = await res.json();
    return Array.isArray(data) ? (data as ReconcileItem[]) : [];
  },

  async processReceiptItems(file: File): Promise<any> {
    const base64Data = await this.fileToBase64(file);
    const mimeType = file.type || "application/octet-stream";
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/handle-receipt-items`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64: base64Data, mimeType, fileName: file.name }),
    });

    if (!res.ok) throw new Error("Erro ao extrair itens do cupom.");
    return await res.json();
  },

  async saveToReconcileQueue(items: ReconcileItem[], accountId: string, accountName: string) {
    if (!supabase) throw new Error("Supabase is not configured");
    const { data: { user } } = await supabase.auth.getUser();
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

  async saveReceiptToLabs(receipt: any) {
    if (!supabase) throw new Error("Supabase is not configured");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No user found");

    const { data: doc, error: docErr } = await supabase
      .from('ai_documents')
      .insert({
        user_id: user.id,
        merchant_raw: receipt.merchant,
        document_date: receipt.date,
        total_amount: receipt.total,
        status: 'processed',
        source: 'manual_upload'
      })
      .select('id')
      .single();

    if (docErr) throw new Error(prettySupabaseError(docErr));

    for (let i = 0; i < receipt.items.length; i++) {
      const item = receipt.items[i];
      const { data: product } = await supabase.from('products').select('id').eq('user_id', user.id).ilike('name', item.description).maybeSingle();
      let productId = product?.id;

      if (!productId) {
        const { data: newProd, error: prodErr } = await supabase.from('products').insert({ user_id: user.id, name: item.description, default_unit: item.unit || 'un', category: item.category_hint }).select('id').single();
        if (!prodErr) productId = newProd?.id;
      }

      await supabase.from('ai_document_items').insert({
        user_id: user.id,
        document_id: doc.id,
        line_index: i,
        raw_description: item.description,
        quantity: item.quantity,
        unit: item.unit || 'un',
        unit_price: item.unit_price,
        total_price: item.total_price,
        product_id: productId,
        category_hint: item.category_hint
      });

      if (productId) {
        await supabase.from('product_prices').insert({
          user_id: user.id,
          product_id: productId,
          document_id: doc.id,
          document_date: receipt.date,
          unit_price: item.unit_price,
          total_price: item.total_price,
          quantity: item.quantity
        });
      }
    }
    return doc.id;
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
