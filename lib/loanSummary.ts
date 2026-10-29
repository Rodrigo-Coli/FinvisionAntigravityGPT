/**
 * Resumo de um empréstimo concedido (modelo Conta Corrente), calculado num lugar
 * só: cartão em Patrimônio, extrato na tela, Excel, PDF e texto do WhatsApp.
 *
 * Juros pro-rata por dia sobre o saldo (simples ou composto, a partir da taxa
 * mensal). Cada pagamento recebido paga primeiro os juros do período e o resto
 * abate o principal. Pagamento no mesmo dia da concessão (entrada) abate o
 * saldo com zero dia de juros — antes o cartão o ignorava.
 *
 * Acréscimo à dívida (ex.: um valor a mais que o devedor passou a dever): soma
 * ao saldo na data dele e passa a correr juros dali em diante.
 */
export interface LoanPayment { id?: string; date: string; amount: number | string }
export interface LoanAddition { id?: string; date: string; amount: number | string; description?: string }

export interface LoanScheduleRow {
  id?: string;
  kind: 'PAYMENT' | 'ADDITION';
  date: string;
  received: number;        // pagamento recebido (0 num acréscimo)
  added: number;           // acréscimo à dívida (0 num pagamento)
  description?: string;
  days: number;
  interestAccrued: number; // juros corridos no período até esta linha
  interest: number;        // juros pagos neste pagamento
  principalPaid: number;
  balance: number;
}

export interface LoanSummary {
  principal: number;
  additionsTotal: number;    // acréscimos à dívida
  totalLent: number;         // principal + acréscimos
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
  additions?: LoanAddition[];
  today: string;
}): LoanSummary {
  const principal = Number(input.principal) || 0;
  const monthlyRate = (Number(input.monthlyRatePct) || 0) / 100;
  const isCompound = !!input.isCompound;
  const dailyRate = isCompound ? Math.pow(1 + monthlyRate, 1 / 30) - 1 : monthlyRate / 30;
  const interestFor = (balance: number, days: number) =>
    isCompound ? balance * (Math.pow(1 + dailyRate, days) - 1) : balance * dailyRate * days;

  const norm = (d: string) => String(d || '').split('T')[0].split(' ')[0];
  const payments = (input.payments || []).map(p => ({ ...p, date: norm(p.date) }));
  const additions = (input.additions || []).map(a => ({ ...a, date: norm(a.date) }));
  // Linha do tempo: no mesmo dia, o acréscimo entra antes do pagamento.
  const events = [
    ...additions.map(a => ({ kind: 'ADDITION' as const, id: a.id, date: a.date, amount: Number(a.amount) || 0, description: a.description })),
    ...payments.map(p => ({ kind: 'PAYMENT' as const, id: p.id, date: p.date, amount: Number(p.amount) || 0, description: undefined }))
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === 'ADDITION' ? -1 : 1));

  let balance = principal;
  let totalInterest = 0;
  let lastDate = input.concessionDate;

  const schedule: LoanScheduleRow[] = events.map(ev => {
    const days = dayDiff(lastDate, ev.date);
    const interest = interestFor(balance, days);
    totalInterest += interest;
    if (ev.date > lastDate) lastDate = ev.date;
    if (ev.kind === 'ADDITION') {
      balance = balance + interest + ev.amount;
      return { id: ev.id, kind: ev.kind, date: ev.date, received: 0, added: r2(ev.amount), description: ev.description, days, interestAccrued: r2(interest), interest: 0, principalPaid: 0, balance: r2(balance) };
    }
    const received = ev.amount;
    const interestPaid = Math.min(interest, received);
    const principalPaid = Math.max(0, received - interestPaid);
    balance = Math.max(0, balance + interest - received);
    return { id: ev.id, kind: ev.kind, date: ev.date, received, added: 0, days, interestAccrued: r2(interest), interest: r2(interestPaid), principalPaid: r2(principalPaid), balance: r2(balance) };
  });

  const daysSinceLast = dayDiff(lastDate, input.today);
  const accruedInterest = interestFor(balance, daysSinceLast);
  const totalReceived = payments.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const additionsTotal = additions.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const totalLent = principal + additionsTotal;
  const principalReturned = schedule.reduce((s, r) => s + r.principalPaid, 0);
  const interestReceived = schedule.reduce((s, r) => s + r.interest, 0);

  return {
    principal,
    additionsTotal: r2(additionsTotal),
    totalLent: r2(totalLent),
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
    progressPct: totalLent > 0 ? Math.min(100, Math.round((principalReturned / totalLent) * 100)) : 0
  };
}
