/**
 * Motor de cronograma de parcelas de passivo/financiamento (Patrimônio).
 *
 * REGRA DA ÂNCORA — o "Valor Parcela" informado no passivo é a 1ª parcela REAL do contrato:
 * é o número que o usuário vê no boleto, no card do imóvel e no próprio passivo. O
 * cronograma NASCE dela:
 *   - SAC:   parcela 1 = valor informado; amortização constante = parcela 1 − juros do
 *            1º mês; as seguintes DECRESCEM a partir dela.
 *   - Price: todas iguais ao valor informado.
 *   - Sem juros: todas iguais ao valor informado.
 *
 * Sem valor informado, cai no cálculo teórico pelo saldo devedor:
 *   - SAC + juros: amortização constante (saldo/n) + juros sobre o saldo restante.
 *   - Price + juros: fórmula Price.
 *   - Sem juros: base linear (saldo / nº parcelas).
 *
 * A correção (reajuste) é aplicada por cima, acumulada por período, a partir da 2ª
 * parcela — a 1ª é a âncora e não pode vir corrigida, senão nunca bate com o valor
 * informado nem com o que aparece no card do ativo.
 */
export const computeInstallmentAmount = (
  index1: number,
  principal: number,
  n: number,
  ratePct: number,
  reajPct: number,
  isSAC: boolean,
  firstInstallment: number = 0
): number => {
  if (n <= 0 || principal <= 0) return 0;
  const rate = ratePct / 100;
  const reaj = reajPct / 100;
  const anchored = firstInstallment > 0;
  let parcela: number;
  if (rate <= 0) {
    parcela = anchored ? firstInstallment : principal / n; // sem juros → iguais antes da correção
  } else if (isSAC) {
    // Amortização constante. Ancorada: amort = 1ª parcela − juros do 1º mês.
    // Se a parcela informada não cobre nem os juros, o dado é incoerente → usa saldo/n.
    const amortFromFirst = firstInstallment - principal * rate;
    const baseAmort = (anchored && amortFromFirst > 0) ? amortFromFirst : principal / n;
    const outstandingStart = Math.max(0, principal - baseAmort * (index1 - 1)); // saldo no início do período
    parcela = baseAmort + outstandingStart * rate; // SAC decrescente
  } else {
    parcela = anchored
      ? firstInstallment
      : principal * (rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1); // Price fixo
  }
  return Math.round(Math.max(0, parcela) * Math.pow(1 + reaj, index1 - 1) * 100) / 100;
};

/**
 * Data de vencimento da parcela, presa ao último dia do mês quando o dia informado não
 * existe naquele mês (ex.: vencimento dia 29 em fevereiro de ano não bissexto). Sem isso
 * o JS "transbordava" e a parcela caía em 01/03, quebrando a sequência do cronograma.
 */
export const buildInstallmentDate = (
  baseYear: number,
  baseMonth: number,
  monthOffset: number,
  dueDay: number
): Date => {
  const month = baseMonth + monthOffset;
  const lastDayOfMonth = new Date(baseYear, month + 1, 0).getDate();
  return new Date(baseYear, month, Math.min(Math.max(1, dueDay), lastDayOfMonth));
};
