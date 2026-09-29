// Conta de chegada do extrato de um investimento.
//
// O extrato (investment_movements) só fecha com o card quando a soma das
// movimentações que mexem no valor do título dá o saldo bruto do cadastro:
//   aportes + rendimentos acumulados + ajustes manuais = saldo bruto.
//
// Antes, ao editar o "Saldo Bruto Atual", o rendimento lançado era a diferença
// entre o saldo novo e o saldo ANTERIOR do cadastro. Se o saldo inicial já não
// batia com o aporte (ex.: cadastrou custo 2.076,53 com saldo 2.080,82), essa
// sobra nunca entrava no extrato e o histórico ficava somando outro número.

export interface LedgerMovement {
  movement_type: string;
  amount: number | string;
}

// Resgate e amortização mexem nos aportes de forma proporcional (o resgate reescala
// cada aporte), então com eles no extrato a soma simples deixa de ser confiável.
const BREAKS_RECONCILIATION = new Set(['RESGATE_PARCIAL', 'RESGATE_TOTAL', 'AMORTIZACAO']);

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Saldo bruto que o extrato explica sozinho, ou `null` quando o extrato não dá
 * para conciliar (tem resgate/amortização, ou não tem aporte nenhum).
 */
export function ledgerImpliedGross(movements: LedgerMovement[]): number | null {
  let total = 0;
  let hasAporte = false;
  for (const mv of movements) {
    const amount = Number(mv.amount) || 0;
    if (BREAKS_RECONCILIATION.has(mv.movement_type)) return null;
    if (mv.movement_type === 'APORTE') {
      hasAporte = true;
      total += amount;
    } else if (mv.movement_type === 'RENDIMENTO_ACUMULADO') {
      total += amount;
    } else if (mv.movement_type === 'AJUSTE_MANUAL') {
      total += amount; // já vem com sinal
    }
    // RENDIMENTO_MENSAL saiu do título para a conta: não entra na soma.
  }
  return hasAporte ? round2(total) : null;
}

/**
 * Separa o que lançar no extrato quando o saldo bruto passa de `oldGross` para `newGross`:
 *  · `priorGap`: diferença que JÁ existia entre o extrato e o saldo anterior (ex.: saldo
 *    inicial cadastrado acima do custo). Não aconteceu hoje, então vai numa movimentação
 *    à parte, datada no primeiro aporte — senão inflaria o resultado do dia da edição.
 *  · `change`: o que mudou agora (saldo novo − saldo anterior), datado de hoje.
 * Somando os dois, extrato e card passam a mostrar o mesmo bruto. Sem extrato
 * conciliável, `priorGap` é 0 e vale a regra antiga.
 */
export function splitGrossChange(
  movements: LedgerMovement[],
  oldGross: number,
  newGross: number
): { priorGap: number; change: number } {
  const implied = ledgerImpliedGross(movements);
  return {
    priorGap: implied === null ? 0 : round2(oldGross - implied),
    change: round2(newGross - oldGross),
  };
}

/** Data do primeiro aporte do extrato (AAAA-MM-DD), ou `null`. */
export function firstAporteDate(movements: (LedgerMovement & { movement_date?: string })[]): string | null {
  const dates = movements
    .filter(m => m.movement_type === 'APORTE' && m.movement_date)
    .map(m => String(m.movement_date).substring(0, 10))
    .sort();
  return dates[0] || null;
}

// Tipos que representam resultado (lucro/queda) do investimento. Aporte, resgate e
// amortização são só dinheiro trocando de bolso — não são lucro nem prejuízo.
export type PeriodResult = {
  appreciation: number; // rendimento que ficou no título (valorização)
  depreciation: number;  // quedas / ajustes negativos (valor negativo)
  received: number;      // juros/cupons que caíram na conta
  total: number;
};

/**
 * Resultado bruto de um conjunto de movimentações num período [start, end] (datas
 * AAAA-MM-DD, inclusivas; `null` = sem limite).
 */
export function periodResult(
  movements: (LedgerMovement & { movement_date?: string })[],
  start: string | null,
  end: string | null
): PeriodResult {
  let appreciation = 0;
  let depreciation = 0;
  let received = 0;
  for (const mv of movements) {
    const d = String(mv.movement_date || '').substring(0, 10);
    if (!d) continue;
    if (start && d < start) continue;
    if (end && d > end) continue;
    const amount = Number(mv.amount) || 0;
    if (mv.movement_type === 'RENDIMENTO_ACUMULADO' || mv.movement_type === 'AJUSTE_MANUAL') {
      if (amount >= 0) appreciation += amount;
      else depreciation += amount;
    } else if (mv.movement_type === 'RENDIMENTO_MENSAL') {
      received += Math.abs(amount);
    }
  }
  return {
    appreciation: round2(appreciation),
    depreciation: round2(depreciation),
    received: round2(received),
    total: round2(appreciation + depreciation + received),
  };
}

/**
 * Líquido estimado de um rendimento bruto, usando a alíquota efetiva de IR do ativo.
 */
export function netOfTax(gross: number, effectiveTaxRate: number): number {
  if (!(gross > 0) || !(effectiveTaxRate > 0)) return round2(gross);
  return round2(gross * (1 - effectiveTaxRate));
}

export type ResultPeriodPreset = 'MES' | 'MES_ANTERIOR' | '3M' | '12M' | 'ANO' | 'TUDO' | 'PERSONALIZADO';

const pad2 = (n: number) => String(n).padStart(2, '0');
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1..12

/**
 * Intervalo [start, end] (AAAA-MM-DD, inclusivo) de um período pré-definido, contado a
 * partir de `today` (AAAA-MM-DD). `null` = sem limite.
 */
export function resolveResultPeriod(
  preset: ResultPeriodPreset,
  today: string,
  customStart = '',
  customEnd = ''
): { start: string | null; end: string | null } {
  const [y, m] = today.split('-').map(Number);
  const monthStart = (yy: number, mm: number) => `${yy}-${pad2(mm)}-01`;
  const monthsBack = (n: number) => {
    const total = y * 12 + (m - 1) - n;
    return { yy: Math.floor(total / 12), mm: (total % 12) + 1 };
  };
  switch (preset) {
    case 'MES':
      return { start: monthStart(y, m), end: today };
    case 'MES_ANTERIOR': {
      const { yy, mm } = monthsBack(1);
      return { start: monthStart(yy, mm), end: `${yy}-${pad2(mm)}-${pad2(lastDayOfMonth(yy, mm))}` };
    }
    case '3M': {
      const { yy, mm } = monthsBack(2);
      return { start: monthStart(yy, mm), end: today };
    }
    case '12M': {
      const { yy, mm } = monthsBack(11);
      return { start: monthStart(yy, mm), end: today };
    }
    case 'ANO':
      return { start: `${y}-01-01`, end: today };
    case 'PERSONALIZADO':
      return { start: customStart || null, end: customEnd || null };
    default:
      return { start: null, end: null };
  }
}
