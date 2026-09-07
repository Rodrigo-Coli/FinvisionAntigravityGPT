
import { supabase } from "../lib/supabase/client";
import { ReconcileItem } from "../types";
import { getSessionUser } from '../lib/session';

function getApiBaseUrl() {
  try {
    // @ts-ignore
    const viteBase = import.meta?.env?.VITE_API_BASE_URL;
    if (viteBase) return String(viteBase);
  } catch { }
  return "";
}

// Limite prático do corpo de uma Serverless Function na Vercel: 4.5MB.
// O JSON enviado é praticamente só base64, então medimos o base64 direto com margem.
const MAX_UPLOAD_BASE64_CHARS = 4_000_000;
// Passos de compressão em ordem: se o primeiro ainda estourar o limite de
// envio (foto de câmera de altíssima resolução), tenta um segundo mais agressivo.
const COMPRESSION_STEPS: Array<[number, number]> = [[1600, 0.8], [1100, 0.6]];

export type EncodedFile = { base64: string; mimeType: string; fileName: string };

// Formatos que o Gemini aceita como inlineData de imagem. HEIC/HEIF entram aqui
// porque a câmera de vários aparelhos salva nesse formato e o navegador não
// consegue decodificá-lo no <canvas> — nesse caso mandamos os bytes originais.
const SUPPORTED_INLINE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf',
]);

// Lê só os primeiros bytes do arquivo, sem materializar o conteúdo todo.
async function readHeaderBytes(file: File, length = 16): Promise<Uint8Array> {
  const slice = file.slice(0, length);
  const anySlice = slice as any;
  if (typeof anySlice.arrayBuffer === 'function') {
    return new Uint8Array(await anySlice.arrayBuffer());
  }
  // Safari antigo não tem Blob.arrayBuffer.
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => resolve(new Uint8Array());
    try { reader.readAsArrayBuffer(slice); } catch { resolve(new Uint8Array()); }
  });
}

const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...Array.from(bytes.slice(from, to)));

// Descobre o tipo real pelos magic bytes. Arquivos escolhidos por provedores do
// Android (Google Fotos/Drive/Documentos) frequentemente chegam com file.type
// vazio, e assumir "image/jpeg" às cegas fazia o Gemini recusar o arquivo.
async function sniffMimeType(file: File): Promise<string> {
  const declaredMime = (file.type || '').toLowerCase();
  if (SUPPORTED_INLINE_MIMES.has(declaredMime)) return declaredMime;

  try {
    const head = await readHeaderBytes(file);
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
    if (head[0] === 0x89 && ascii(head, 1, 4) === 'PNG') return 'image/png';
    if (ascii(head, 0, 4) === '%PDF') return 'application/pdf';
    if (ascii(head, 0, 4) === 'GIF8') return 'image/gif';
    if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') return 'image/webp';
    if (ascii(head, 4, 8) === 'ftyp') {
      const brand = ascii(head, 8, 12);
      if (brand.startsWith('hei') || brand.startsWith('mif') || brand.startsWith('msf')) return 'image/heic';
      if (brand.startsWith('avif') || brand.startsWith('avis')) return 'image/heif';
    }
  } catch { }

  if (declaredMime.startsWith('image/')) return declaredMime;
  return 'image/jpeg';
}

// A Vercel corta o request antes de chegar no handler quando o corpo estoura o
// limite, e a resposta vem em HTML — o front só conseguia mostrar um erro
// genérico. Barramos antes de enviar, com uma mensagem acionável.
function assertPayloadWithinLimit(base64Parts: string[]) {
  const total = base64Parts.reduce((sum, part) => sum + part.length, 0);
  if (total > MAX_UPLOAD_BASE64_CHARS) {
    const mb = (total / 1_048_576).toFixed(1);
    throw new Error(`Os arquivos selecionados somam cerca de ${mb}MB, acima do limite de envio. Envie menos cupons por vez ou use fotos de menor resolução.`);
  }
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
    const { base64: base64Data, mimeType } = await this.encodeFileForAI(file);
    assertPayloadWithinLimit([base64Data]);
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

  async processReceiptItems(files: File | File[], userId?: string): Promise<any> {
    const fileArray = Array.isArray(files) ? files : [files];
    // Um arquivo por vez, de propósito: com Promise.all o navegador decodificava
    // todas as fotos ao mesmo tempo e o pico de memória multiplicava pelo número
    // de cupons — o suficiente para o Android matar a aba antes do envio.
    // O mime vai junto do encoder: forçar "image/jpeg" para qualquer imagem fazia
    // o Gemini recusar arquivos que caíram no fallback sem recompressão (HEIC/PNG).
    const encodedFiles: EncodedFile[] = [];
    for (const file of fileArray) {
      encodedFiles.push(await this.encodeFileForAI(file));
    }
    assertPayloadWithinLimit(encodedFiles.map((f) => f.base64));

    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/handle-receipt-items`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: encodedFiles, userId }),
    });

    if (!res.ok) {
      // 413 (payload) e 502/504 (timeout) voltam como HTML da própria Vercel,
      // sem JSON — sem essas mensagens o usuário ficava sem saber o que houve.
      let msg = res.status === 413
        ? "Os arquivos são grandes demais para envio. Envie menos cupons por vez ou use fotos de menor resolução."
        : res.status === 504 || res.status === 502
          ? "A leitura do cupom demorou demais e foi interrompida. Tente enviar um cupom por vez."
          : `Erro ao extrair itens do cupom (HTTP ${res.status}).`;
      let limitReached = false;
      try {
        const j = await res.json();
        msg = j?.error || j?.message || msg;
        limitReached = !!j?.limitReached;
      } catch { }
      const err: any = new Error(msg);
      err.status = res.status;
      err.limitReached = limitReached;
      throw err;
    }
    return await res.json();
  },

  async saveDirectToCard({ cardId, date, description, amount, categoryId, subcategory }: { cardId: string; date: string; description: string; amount: number; categoryId?: string; subcategory?: string }) {
    if (!supabase) throw new Error("Supabase is not configured");
    const user = await getSessionUser(supabase);
    if (!user) throw new Error("No user found");

    // Mesmo formato usado pelo lançamento manual de cartão (CreditCardsSection.tsx):
    // category_id (FK) + subcategory (texto), sem coluna "category" solta. Um campo
    // "category" extra no insert (adicionado numa versão anterior) provavelmente
    // não existe em card_transactions e derrubava o insert inteiro silenciosamente.
    const { error } = await supabase.from("card_transactions").insert({
      user_id: user.id,
      card_id: cardId,
      date,
      description,
      amount: Math.abs(amount),
      status: "pending",
      is_manual: true,
      source: "ai_labs",
      category_id: categoryId || null,
      subcategory: subcategory || null,
    });
    if (error) throw new Error(prettySupabaseError(error));
    return true;
  },

  async saveToReconcileQueue(items: ReconcileItem[], accountId: string, accountName: string, targetType?: 'account' | 'card') {
    if (!supabase) throw new Error("Supabase is not configured");
    const user = await getSessionUser(supabase);
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
    const user = await getSessionUser(supabase);
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

      // .ilike() em vez de .or() com string crua: nomes de produto com vírgula ou
      // parênteses (comuns em OCR de cupom) quebram a sintaxe do filtro .or() do
      // PostgREST silenciosamente (o erro não era verificado), fazendo duplicar o
      // produto em vez de reconhecer o existente.
      let { data: product } = await supabase.from('products')
        .select('id')
        .eq('user_id', user.id)
        .ilike('name', productName)
        .maybeSingle();

      if (!product && searchName !== productName) {
        const { data: altBySearchName } = await supabase.from('products')
          .select('id')
          .eq('user_id', user.id)
          .ilike('name', searchName)
          .maybeSingle();
        product = altBySearchName;
      }

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
    const user = await getSessionUser(supabase);
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

  // Lê o arquivo como data URL. Rejeita SEMPRE com um Error de verdade: antes
  // repassávamos o ProgressEvent/Event do DOM direto para o reject, então o
  // `err.message` chegava vazio no front e o usuário só via o texto genérico
  // "Erro ao processar cupons.", sem nenhuma pista do que falhou.
  readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string' || result.indexOf(',') === -1) {
          reject(new Error(`Não foi possível ler "${file.name}". O arquivo parece estar vazio ou corrompido.`));
          return;
        }
        resolve(result);
      };
      reader.onerror = () => {
        const detail = reader.error?.name ? ` (${reader.error.name})` : '';
        reject(new Error(`Não foi possível ler "${file.name}"${detail}. Se a foto veio do Google Fotos/Drive, baixe para o aparelho e tente novamente.`));
      };
      reader.onabort = () => reject(new Error(`A leitura de "${file.name}" foi interrompida. Tente selecionar o arquivo novamente.`));
      try {
        reader.readAsDataURL(file);
      } catch (e: any) {
        reject(new Error(`Não foi possível abrir "${file.name}": ${e?.message || 'arquivo inacessível'}.`));
      }
    });
  },

  async readFileAsBase64(file: File): Promise<string> {
    const dataUrl = await this.readFileAsDataUrl(file);
    return dataUrl.split(',')[1] || '';
  },

  // Desenha a fonte já decodificada num canvas reduzido e devolve o JPEG.
  // Retorna null (em vez de lançar) quando o canvas não coopera — em celular
  // `toDataURL` pode estourar memória ou devolver "data:," silenciosamente.
  drawToJpegBase64(source: CanvasImageSource, srcWidth: number, srcHeight: number, maxDimension: number, quality: number): string | null {
    try {
      if (!srcWidth || !srcHeight) return null;
      let width = srcWidth;
      let height = srcHeight;
      if (width > height && width > maxDimension) {
        height *= maxDimension / width;
        width = maxDimension;
      } else if (height > maxDimension) {
        width *= maxDimension / height;
        height = maxDimension;
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const base64 = dataUrl.split(',')[1];
      return base64 || null;
    } catch (e) {
      // Antes esse throw acontecia dentro de img.onload, escapava da Promise e
      // ela nunca resolvia — o spinner ficava girando para sempre.
      console.warn('[AI-Labs] Canvas falhou ao exportar a imagem:', e);
      return null;
    }
  },

  // Decodifica via createImageBitmap, que trabalha direto no Blob e fora da
  // thread principal. É o caminho mais leve em memória: o antigo (FileReader
  // -> data URL -> <img>) mantinha os bytes, uma string base64 ~1,37x maior e
  // o bitmap ao mesmo tempo, e uma foto de câmera de celular (12–50MP) chegava
  // a derrubar a aba antes de qualquer requisição sair.
  async compressViaImageBitmap(file: File, maxDimension: number, quality: number): Promise<string | null> {
    if (typeof createImageBitmap !== 'function') return null;
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(file);
      return this.drawToJpegBase64(bitmap, bitmap.width, bitmap.height, maxDimension, quality);
    } catch (e) {
      console.warn('[AI-Labs] createImageBitmap falhou:', e);
      return null;
    } finally {
      bitmap?.close?.();
    }
  },

  // Caminho antigo, agora só como reserva. Usa object URL em vez de data URL
  // (sem a string base64 gigante na memória) e o <img> descobre o formato pelo
  // conteúdo, então funciona mesmo com file.type vazio — comum em arquivos
  // escolhidos pelos provedores do Android (Google Fotos/Drive/Documentos).
  compressViaImageElement(file: File, maxDimension: number, quality: number): Promise<string | null> {
    return new Promise((resolve) => {
      let objectUrl = '';
      try {
        objectUrl = URL.createObjectURL(file);
      } catch {
        resolve(null);
        return;
      }

      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        try { URL.revokeObjectURL(objectUrl); } catch { }
        resolve(value);
      };

      const img = new Image();
      img.onload = () => finish(this.drawToJpegBase64(img, img.width, img.height, maxDimension, quality));
      img.onerror = () => finish(null);
      try {
        img.src = objectUrl;
      } catch {
        finish(null);
      }
    });
  },

  async encodeFileForAI(file: File): Promise<EncodedFile> {
    const mimeType = await sniffMimeType(file);

    if (!mimeType.startsWith('image/')) {
      const base64 = await this.readFileAsBase64(file);
      if (!base64) throw new Error(`O arquivo "${file.name}" está vazio.`);
      return { base64, mimeType, fileName: file.name };
    }

    // Duas tentativas: se a primeira ainda passar do limite de envio (foto de
    // altíssima resolução), reduz mais em vez de falhar no meio do caminho.
    for (const [maxDimension, quality] of COMPRESSION_STEPS) {
      const viaBitmap = await this.compressViaImageBitmap(file, maxDimension, quality);
      const base64 = viaBitmap ?? await this.compressViaImageElement(file, maxDimension, quality);
      if (base64 && base64.length <= MAX_UPLOAD_BASE64_CHARS) {
        return { base64, mimeType: 'image/jpeg', fileName: file.name };
      }
      if (!base64) break; // o navegador não decodifica esse formato: vai de original
    }

    // Nenhuma decodificação funcionou (HEIC em navegador sem suporte, por
    // exemplo). Manda os bytes originais: o Gemini aceita png/webp/heic/heif.
    const original = await this.readFileAsBase64(file);
    if (!original) throw new Error(`O arquivo "${file.name}" está vazio.`);
    return { base64: original, mimeType, fileName: file.name };
  },

  async fileToBase64(file: File): Promise<string> {
    const { base64 } = await this.encodeFileForAI(file);
    return base64;
  },
};
