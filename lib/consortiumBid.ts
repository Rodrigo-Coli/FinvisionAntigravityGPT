/**
 * Lance de consórcio: como ele abate as parcelas.
 *
 * O lance (livre, pago com dinheiro próprio) abate o saldo devedor de uma de
 * duas formas — quem decide é a administradora:
 * - REDUCE_TERM: reduz o PRAZO. Saem as ÚLTIMAS parcelas, tantas quanto o lance
 *   cobre por inteiro (o que sobrar não abate parcela; vira aviso).
 * - REDUCE_INSTALLMENT: reduz o VALOR. O total das parcelas futuras menos o
 *   lance é dividido igualmente entre elas.
 *
 * Só mexe em parcela FUTURA (depois da data do lance), NÃO paga e SEM
 * pagamento parcial — paga, vencida ou com pagamento parcial fica como está.
 * Dá para informar o número exato da administradora (`overrideRemainingCount`
 * ou `overrideInstallmentAmount`), que vale mais que a estimativa.
 */

export type BidMode = 'REDUCE_TERM' | 'REDUCE_INSTALLMENT';

export interface BidInstallment {
  id: string;
  date: string; // AAAA-MM-DD
  amount: number;
  paidAmount?: number | null;
  isPaid?: boolean | null;
}

export interface BidPlanInput {
  installments: BidInstallment[];
  bidAmount: number;
  bidDate: string; // AAAA-MM-DD
  mode: BidMode;
  /** REDUCE_TERM: quantas parcelas futuras devem SOBRAR (número da administradora). */
  overrideRemainingCount?: number | null;
  /** REDUCE_INSTALLMENT: novo valor da parcela (número da administradora). */
  overrideInstallmentAmount?: number | null;
}

export interface BidPlan {
  /** Parcelas que o lance pode alterar, em ordem de data. */
  eligible: BidInstallment[];
  deleteIds: string[];
  updates: { id: string; amount: number }[];
  /** Parcelas futuras que sobram depois do lance. */
  remainingCount: number;
  /** Valor da parcela depois do lance (no REDUCE_TERM, o de antes). */
  newInstallmentAmount: number;
  /** Quanto do lance abateu parcelas (no REDUCE_TERM pode sobrar). */
  appliedAmount: number;
  warnings: string[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function eligibleBidInstallments(installments: BidInstallment[], bidDate: string): BidInstallment[] {
  return (installments || [])
    .filter(t => !t.isPaid && !(Number(t.paidAmount) > 0) && String(t.date).slice(0, 10) > String(bidDate).slice(0, 10) && Number(t.amount) > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function planConsortiumBid(input: BidPlanInput): BidPlan {
  const bid = round2(Math.max(0, Number(input.bidAmount) || 0));
  const eligible = eligibleBidInstallments(input.installments, input.bidDate);
  const warnings: string[] = [];
  const empty = (msg?: string): BidPlan => {
    if (msg) warnings.push(msg);
    return {
      eligible, deleteIds: [], updates: [], remainingCount: eligible.length,
      newInstallmentAmount: eligible.length ? round2(Number(eligible[0].amount)) : 0, appliedAmount: 0, warnings
    };
  };

  if (bid <= 0) return empty();
  if (eligible.length === 0) return empty('Não há parcelas futuras em aberto para abater.');

  const total = round2(eligible.reduce((s, t) => s + Number(t.amount), 0));

  if (input.mode === 'REDUCE_TERM') {
    let removeCount: number;
    if (input.overrideRemainingCount !== undefined && input.overrideRemainingCount !== null && !Number.isNaN(Number(input.overrideRemainingCount))) {
      const keep = Math.min(eligible.length, Math.max(0, Math.floor(Number(input.overrideRemainingCount))));
      removeCount = eligible.length - keep;
    } else {
      // Tira das últimas para trás, só as que o lance cobre por inteiro.
      removeCount = 0;
      let left = bid;
      for (let i = eligible.length - 1; i >= 0; i--) {
        const amt = Number(eligible[i].amount);
        if (left + 0.005 < amt) break;
        left = round2(left - amt);
        removeCount++;
      }
    }
    const removed = eligible.slice(eligible.length - removeCount);
    const applied = round2(removed.reduce((s, t) => s + Number(t.amount), 0));
    if (removeCount === 0) {
      warnings.push(`O lance de ${fmt(bid)} não cobre uma parcela inteira — nenhuma parcela foi retirada. Se a administradora reduziu o prazo mesmo assim, informe quantas parcelas sobram.`);
    } else if (input.overrideRemainingCount === undefined || input.overrideRemainingCount === null) {
      const leftover = round2(bid - applied);
      if (leftover > 0.009) warnings.push(`Sobram ${fmt(leftover)} do lance que não completam uma parcela.`);
    }
    return {
      eligible,
      deleteIds: removed.map(t => t.id),
      updates: [],
      remainingCount: eligible.length - removeCount,
      newInstallmentAmount: round2(Number(eligible[0].amount)),
      appliedAmount: applied,
      warnings
    };
  }

  // REDUCE_INSTALLMENT
  let newAmount: number;
  if (input.overrideInstallmentAmount !== undefined && input.overrideInstallmentAmount !== null && Number(input.overrideInstallmentAmount) >= 0) {
    newAmount = round2(Number(input.overrideInstallmentAmount));
  } else {
    newAmount = round2(Math.max(0, total - bid) / eligible.length);
  }
  if (newAmount <= 0) {
    warnings.push('O lance quita todas as parcelas futuras.');
    return {
      eligible, deleteIds: eligible.map(t => t.id), updates: [], remainingCount: 0,
      newInstallmentAmount: 0, appliedAmount: total, warnings
    };
  }
  const applied = round2(total - newAmount * eligible.length);
  return {
    eligible,
    deleteIds: [],
    updates: eligible.map(t => ({ id: t.id, amount: newAmount })),
    remainingCount: eligible.length,
    newInstallmentAmount: newAmount,
    appliedAmount: Math.max(0, applied),
    warnings
  };
}
