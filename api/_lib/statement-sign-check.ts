import { extractText, getDocumentProxy } from 'unpdf';

// Faturas de bancos brasileiros (ex.: Bradesco) marcam créditos/estornos com o sinal
// de menos DEPOIS do valor ("33,28-"), às vezes caindo em outra linha no texto do PDF.
// A IA (Gemini) não reconhece esse formato de forma consistente — na prática ela pega
// alguns estornos e deixa outros passarem como compra. Esta camada é determinística:
// lê o texto do PDF direto e monta a lista de valores com "menos no final", que depois
// é usada para corrigir o sinal do que a IA retornou.

/**
 * Extrai do PDF os valores que aparecem com sinal de menos ao final ("74,99-"),
 * retornando um mapa "valor absoluto com 2 casas" -> quantidade de ocorrências.
 * Retorna mapa vazio para arquivos não-PDF ou em qualquer falha (fail-safe:
 * nesse caso o resultado da IA fica como está, comportamento igual ao anterior).
 */
export async function extractTrailingMinusAmounts(buffer: Buffer, mimeType: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    if (!(mimeType || '').toLowerCase().includes('pdf')) return map;
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });

    // Valor no formato brasileiro (1.234,56) seguido de "-" (com espaço/quebra de linha
    // opcional). O (?!\d) evita capturar hífens de intervalos numéricos tipo "10-20".
    const re = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*-(?!\d)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      // Linhas de subtotal ("Total para FULANO 74,99-") repetem o valor do estorno
      // e inflariam a contagem — ignoramos qualquer match precedido de "total".
      const before = text.slice(Math.max(0, m.index - 45), m.index);
      if (/total/i.test(before)) continue;
      const key = normalizeAmountKey(m[1]);
      map.set(key, (map.get(key) || 0) + 1);
    }
  } catch (e) {
    console.error('[SignCheck] Falha ao extrair texto do PDF (seguindo sem correção):', e);
  }
  return map;
}

function normalizeAmountKey(v: string | number): string {
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'));
  if (isNaN(n)) return '';
  return Math.abs(n).toFixed(2);
}

/**
 * Corrige em memória o sinal das transações extraídas pela IA usando o mapa de
 * valores com "menos no final" vindos do PDF. Convenção do extrato: compra positiva,
 * estorno/crédito negativo (a inversão para a fila de conciliação acontece depois).
 *
 * 1ª passada: créditos que a IA já detectou consomem suas ocorrências do mapa.
 * 2ª passada: transações positivas cujo valor ainda tem ocorrência sobrando no mapa
 * são viradas para negativo (a IA deixou o estorno passar como compra).
 * Retorna quantas transações foram corrigidas.
 */
export function applyTrailingMinusCorrection(txs: any[], minusAmounts: Map<string, number>): number {
  if (!minusAmounts.size || !Array.isArray(txs) || txs.length === 0) return 0;
  const remaining = new Map(minusAmounts);

  const amountOf = (t: any): number => {
    if (typeof t.amount === 'number') return t.amount;
    const str = String(t.amount ?? '').trim();
    // Mesmo tratamento pt-BR do parseAmount do template helper
    const normalized = str.includes(',') ? str.replace(/\./g, '').replace(',', '.') : str;
    return parseFloat(normalized.replace(/[^\d.-]/g, '')) || 0;
  };

  for (const t of txs) {
    const amt = amountOf(t);
    if (amt < 0) {
      const key = normalizeAmountKey(amt);
      const c = remaining.get(key) || 0;
      if (c > 0) remaining.set(key, c - 1);
    }
  }

  let fixed = 0;
  for (const t of txs) {
    const amt = amountOf(t);
    if (amt > 0) {
      const key = normalizeAmountKey(amt);
      const c = remaining.get(key) || 0;
      if (c > 0) {
        remaining.set(key, c - 1);
        t.amount = -Math.abs(amt);
        fixed++;
        console.log(`[SignCheck] Corrigido para crédito/estorno: ${t.description} (${key})`);
      }
    }
  }
  return fixed;
}
