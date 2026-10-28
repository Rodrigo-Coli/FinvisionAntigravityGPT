/**
 * Resumo de um empréstimo concedido (modelo Conta Corrente), calculado num lugar
 * só: cartão em Patrimônio, extrato na tela, Excel, PDF e texto do WhatsApp.
 *
 * Juros pro-rata por dia sobre o saldo (simples ou composto, a partir da taxa
 * mensal). Cada pagamento recebido paga primeiro os juros do período e o resto
 * abate o principal. Pagamento no mesmo dia da concessão (entrada) abate o
 * saldo com zero dia de juros — antes o cartão o ignorava.
 */
export interface LoanPayment { id?: string; date: string; amount: number | string }

export interface LoanScheduleRow {
  id?: string;
  date: string;
  received: number;
  days: number;
  interest: number;        // juros pagos neste pagamento
  principalPaid: number;
  balance: number;
}

export interface LoanSummary {
  principal: number;
  monthlyRate: number;
  isCompound: boolean;
  concessionDate: string;
  schedule: LoanScheduleRow[];
  totalReceived: number;     // tudo que foi recebido (juros + principal)
  principalReturned: number;
  interestReceived: number;
  accruedInterest: number;   // juros desde o último pagamento até hoje (em aberto)
  totalInterest: number;     // todos os juros corridos (pagos + em aberto)
  daysSinceLast: number;
  openBalance: number;
  progressPct: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const dayDiff = (from: string, to: string) =>
  Math.max(0, Math.round((new Date(to + 'T12:00:00').getTime() - new Date(from + 'T12:00:00').getTime()) / 86400000));

export function summarizeLoan(input: {
  principal: number;
  monthlyRatePct: number;
  isCompound: boolean;
  concessionDate: string;
  payments: LoanPayment[];
  today: string;
}): LoanSummary {
  const principal = Number(input.principal) || 0;
  const monthlyRate = (Number(input.monthlyRatePct) || 0) / 100;
  const isCompound = !!input.isCompound;
  const dailyRate = isCompound ? Math.pow(1 + monthlyRate, 1 / 30) - 1 : monthlyRate / 30;
  const interestFor = (balance: number, days: number) =>
    isCompound ? balance * (Math.pow(1 + dailyRate, days) - 1) : balance * dailyRate * days;

  const payments = [...(input.payments || [])]
    .map(p => ({ ...p, date: String(p.date || '').split('T')[0] }))
    .sort((a, b) => a.date.localeCompare(b.date));

  let balance = principal;
  let totalInterest = 0;
  let lastDate = input.concessionDate;

  const schedule: LoanScheduleRow[] = payments.map(tx => {
    const days = dayDiff(lastDate, tx.date);
    const interest = interestFor(balance, days);
    totalInterest += interest;
    const received = Number(tx.amount) || 0;
    const interestPaid = Math.min(interest, received);
    const principalPaid = Math.max(0, received - interestPaid);
    balance = Math.max(0, balance + interest - received);
    if (tx.date > lastDate) lastDate = tx.date;
    return { id: tx.id, date: tx.date, received, days, interest: r2(interestPaid), principalPaid: r2(principalPaid), balance: r2(balance) };
  });

  const daysSinceLast = dayDiff(lastDate, input.today);
  const accruedInterest = interestFor(balance, daysSinceLast);
  const totalReceived = payments.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const principalReturned = schedule.reduce((s, r) => s + r.principalPaid, 0);
  const interestReceived = schedule.reduce((s, r) => s + r.interest, 0);

  return {
    principal,
    monthlyRate: Number(input.monthlyRatePct) || 0,
    isCompound,
    concessionDate: input.concessionDate,
    schedule,
    totalReceived: r2(totalReceived),
    principalReturned: r2(principalReturned),
    interestReceived: r2(interestReceived),
    accruedInterest: r2(accruedInterest),
    totalInterest: r2(totalInterest + accruedInterest),
    daysSinceLast,
    openBalance: r2(balance + accruedInterest),
    progressPct: principal > 0 ? Math.min(100, Math.round((principalReturned / principal) * 100)) : 0
  };
}
