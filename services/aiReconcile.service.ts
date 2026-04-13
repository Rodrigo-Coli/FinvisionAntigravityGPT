
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
    const mimeType = file.type.startsWith('image/') ? 'image/jpeg' : (file.type || "application/octet-stream");
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

  async processReceiptItems(files: File | File[]): Promise<any> {
    const fileArray = Array.isArray(files) ? files : [files];
    const encodedFiles = await Promise.all(fileArray.map(async (file) => ({
      base64: await this.fileToBase64(file),
      mimeType: file.type.startsWith('image/') ? 'image/jpeg' : (file.type || "image/jpeg"),
      fileName: file.name
    })));

    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/handle-receipt-items`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: encodedFiles }),
    });

    if (!res.ok) {
      let msg = "Erro ao extrair itens do cupom.";
      try {
        const j = await res.json();
        msg = j?.error || j?.message || msg;
      } catch { }
      throw new Error(msg);
    }
    return await res.json();
  },

  async saveDirectToCard({ cardId, date, description, amount }: { cardId: string; date: string; description: string; amount: number }) {
    if (!supabase) throw new Error("Supabase is not configured");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No user found");

    const { error } = await supabase.from("card_transactions").insert({
      user_id: user.id,
      card_id: cardId,
      date,
      description,
      amount: Math.abs(amount),
      status: "pending",
      is_manual: true,
      source: "ai_labs",
    });
    if (error) throw new Error(prettySupabaseError(error));
    return true;
  },

  async saveToReconcileQueue(items: ReconcileItem[], accountId: string, accountName: string, targetType?: 'account' | 'card') {
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
      metadata: {
        ai_processed: true,
        confidence: item.confidence,
        target_type: targetType,
        original_account_id: accountId,
        original_account_name: accountName,
      },
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
        source: 'manual_upload',
        ocr_structured: {
          ...receipt,
          merchant_category: receipt.merchant_category || 'Mercado'
        }
      })
      .select('id')
      .single();

    if (docErr) throw new Error(prettySupabaseError(docErr));

    for (let i = 0; i < receipt.items.length; i++) {
      const item = receipt.items[i];
      const productName = (item.normalized_name || item.description).toUpperCase().trim();
      const searchName = productName.replace(/[-]/g, ' '); // Troca hífen por espaço para busca flexível

      const { data: product } = await supabase.from('products')
        .select('id')
        .eq('user_id', user.id)
        .or(`name.ilike.${productName},name.ilike.${searchName}`)
        .maybeSingle();

      let productId = product?.id;

      if (!productId) {
        // Tentativa de busca por descrição original se o normalizado não bateu
        const { data: altProd } = await supabase.from('products')
          .select('id')
          .eq('user_id', user.id)
          .ilike('name', item.description)
          .maybeSingle();

        productId = altProd?.id;
      }

      if (!productId) {
        const { data: newProd, error: prodErr } = await supabase.from('products').insert({
          user_id: user.id,
          name: productName,
          default_unit: item.unit || 'un',
          category: item.category_hint
        }).select('id').single();
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
        category_hint: item.category_hint,
        is_promo: item.is_promo || false,
        exclude_from_stats: item.exclude_from_stats || false
      });

      if (productId) {
        await supabase.from('product_prices').insert({
          user_id: user.id,
          product_id: productId,
          document_id: doc.id,
          document_date: receipt.date,
          unit_price: item.unit_price,
          total_price: item.total_price,
          quantity: item.quantity,
          is_promo: item.is_promo || false,
          exclude_from_stats: item.exclude_from_stats || false
        });
      }
    }
    return doc.id;
  },

  async getPriceComparison() {
    if (!supabase) throw new Error("Supabase is not configured");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No user found");

    const { data, error } = await supabase
      .from('products')
      .select(`
        id,
        name,
        category,
        product_prices (
          unit_price,
          document_date,
          is_promo,
          exclude_from_stats,
          ai_documents (
            merchant_raw,
            ocr_structured
          )
        )
      `)
      .eq('user_id', user.id)
      .eq('active', true);

    if (error) throw new Error(prettySupabaseError(error));
    return data || [];
  },

  async getPriceHistory(productId: string) {
    if (!supabase) throw new Error("Supabase is not configured");
    const { data, error } = await supabase
      .from('product_prices')
      .select(`
        unit_price,
        document_date,
        is_promo,
        ai_documents (
            merchant_raw
        )
      `)
      .eq('product_id', productId)
      .order('document_date', { ascending: true });

    if (error) throw new Error(prettySupabaseError(error));
    return data || [];
  },

  fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = (error) => reject(error);
        return;
      }

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          const MAX_DIMENSION = 1600;
          if (width > height && width > MAX_DIMENSION) {
            height *= MAX_DIMENSION / width;
            width = MAX_DIMENSION;
          } else if (height > MAX_DIMENSION) {
            width *= MAX_DIMENSION / height;
            height = MAX_DIMENSION;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve((reader.result as string).split(",")[1]);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          
          // Force jpeg to reduce size significantly
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(compressedDataUrl.split(',')[1]);
        };
        img.onerror = (error) => reject(error);
        img.src = e.target?.result as string;
      };
      reader.onerror = (error) => reject(error);
    });
  },
};
