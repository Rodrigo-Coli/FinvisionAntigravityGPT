/**
 * Data de compra lida de um cupom/print pela IA
 * ---------------------------------------------
 * A IA não sabe que dia é hoje. Quando a imagem não traz o ano (print de
 * notificação: "28 de set."), ela chutava um ano antigo — a compra do Rissul
 * de 28/09/2026 foi gravada em 28/09/2023 e sumiu de todas as telas. Com data
 * no formato brasileiro ela às vezes inverte dia e mês — a compra do Carrefour
 * de 11/08 virou 08/11, no futuro.
 *
 * Esta função recebe a data devolvida e a de hoje (AAAA-MM-DD) e devolve uma
 * data plausível, dizendo se precisou ajustar (a tela avisa o usuário e ele
 * pode corrigir no campo de data antes de lançar).
 *
 * Regras, nesta ordem:
 * - vazia/ilegível → hoje;
 * - no futuro → tenta inverter dia e mês; se não resolver, hoje;
 * - mais de 1 ano no passado → mesmo dia/mês no ano corrente (ou no anterior,
 *   se cair no futuro).
 */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const BR_RE = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const toUTC = (y: number, m: number, d: number): number | null => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  // Rejeita 31/02 etc. (Date.UTC "rola" para o mês seguinte).
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return t;
};

const toISO = (t: number) => new Date(t).toISOString().slice(0, 10);

export function sanitizeReceiptDate(
  raw: string | null | undefined,
  todayISO: string
): { date: string; adjusted: boolean } {
  const [ty, tm, td] = todayISO.split('-').map(Number);
  const today = toUTC(ty, tm, td)!;
  let original: number | null = null;
  let yearAssumed = false;
  const keep = (t: number) => ({ date: toISO(t), adjusted: yearAssumed || t !== original });
  const fallback = { date: todayISO, adjusted: true };

  const s = String(raw || '').trim();
  let y: number, m: number, d: number;
  const iso = s.match(ISO_RE);
  const br = s.match(BR_RE);
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (br) {
    d = Number(br[1]);
    m = Number(br[2]);
    y = br[3] ? Number(br[3].length === 2 ? `20${br[3]}` : br[3]) : ty;
    yearAssumed = !br[3];
  } else {
    return fallback;
  }

  let t = toUTC(y, m, d);
  if (t === null) {
    // Mês > 12 costuma ser dia e mês trocados.
    t = toUTC(y, d, m);
    if (t === null) return fallback;
    original = NaN; // houve troca: sempre conta como ajustada
  } else {
    original = t;
  }

  // Futuro (1 dia de folga por fuso): tenta dia/mês invertidos.
  if (t > today + DAY_MS) {
    const swapped = toUTC(new Date(t).getUTCFullYear(), new Date(t).getUTCDate(), new Date(t).getUTCMonth() + 1);
    if (swapped !== null && swapped <= today + DAY_MS && today - swapped <= 366 * DAY_MS) return keep(swapped);
    return fallback;
  }

  // Mais de um ano atrás: ano chutado. Mesmo dia/mês no ano corrente.
  if (today - t > 366 * DAY_MS) {
    const mm = new Date(t).getUTCMonth() + 1;
    const dd = new Date(t).getUTCDate();
    let fixed = toUTC(ty, mm, dd);
    if (fixed !== null && fixed > today + DAY_MS) fixed = toUTC(ty - 1, mm, dd);
    return fixed !== null ? keep(fixed) : fallback;
  }

  return keep(t);
}
