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
 * Quanto lançar no extrato quando o saldo bruto passa de `oldGross` para `newGross`.
 * Com extrato conciliável, a diferença é medida contra o que o extrato já explica —
 * assim, depois do lançamento, extrato e card mostram o mesmo bruto. Sem extrato
 * conciliável, mantém a regra antiga (saldo novo − saldo anterior).
 */
export function grossChangeToRecord(
  movements: LedgerMovement[],
  oldGross: number,
  newGross: number
): number {
  const implied = ledgerImpliedGross(movements);
  const base = implied ?? oldGross;
  return round2(newGross - base);
}

/**
 * Líquido estimado de um rendimento bruto, usando a alíquota efetiva de IR do ativo.
 */
export function netOfTax(gross: number, effectiveTaxRate: number): number {
  if (!(gross > 0) || !(effectiveTaxRate > 0)) return round2(gross);
  return round2(gross * (1 - effectiveTaxRate));
}
