/**
 * Campo de valor digitado (R$) — texto e número separados.
 *
 * O campo "Valor Parcial a Conciliar" (cupom, modo Parcial) guardava só o
 * NÚMERO e reescrevia o texto a cada tecla: ao digitar "190," o número virava
 * 190, a tela redesenhava "190" e a vírgula sumia no mesmo instante — os
 * centavos nunca entravam (190,96 ficava 190). O texto digitado agora é
 * preservado como está; o número sai dele.
 */

/** Deixa só o que faz sentido num valor: dígitos, uma vírgula e pontos. */
export function sanitizeMoneyTyping(text: string): string {
  const cleaned = String(text || '').replace(/[^0-9,.]/g, '');
  const firstComma = cleaned.indexOf(',');
  if (firstComma === -1) return cleaned;
  // Só uma vírgula (a decimal); o resto some.
  return cleaned.slice(0, firstComma + 1) + cleaned.slice(firstComma + 1).replace(/,/g, '');
}

/**
 * "190,96" → 190.96 · "1.234,56" → 1234.56 · "190.96" → 190.96 (teclado com
 * ponto) · "1.234" → 1234 · "" → 0.
 */
export function parseMoneyInput(text: string): number {
  const t = sanitizeMoneyTyping(text);
  if (!t) return 0;
  let normalized: string;
  if (t.includes(',')) {
    normalized = t.replace(/\./g, '').replace(',', '.');
  } else {
    const dots = t.split('.').length - 1;
    const afterLastDot = t.length - t.lastIndexOf('.') - 1;
    // Um ponto só, com até 2 casas depois: é decimal (teclado que mostra ponto).
    normalized = dots === 1 && afterLastDot <= 2 ? t : t.replace(/\./g, '');
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Número → texto do campo ("190,96"); zero vira campo vazio. */
export function formatMoneyInput(value: number): string {
  if (!value) return '';
  return (Math.round(value * 100) / 100).toFixed(2).replace('.', ',');
}
