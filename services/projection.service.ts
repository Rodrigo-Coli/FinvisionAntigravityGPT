import { Transaction, Liability, RealEstateLiability, CashFlowProjectionItem } from '../types';
import { startOfMonth, addMonths, format, parseISO, isAfter, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const projectionService = {
  /**
   * Calcula o fluxo de caixa projetado para os próximos N meses.
   */
  calculateFutureCashFlow: (
    currentBalance: number,
    transactions: Transaction[],
    liabilities: Liability[],
    realEstateLiabilities: RealEstateLiability[],
    monthsToProject: number = 12
  ): CashFlowProjectionItem[] => {
    const projection: CashFlowProjectionItem[] = [];
    let runningBalance = currentBalance;
    const now = new Date();
    const currentMonthStart = startOfMonth(now);

    for (let i = 0; i < monthsToProject; i++) {
      const projectionDate = addMonths(currentMonthStart, i);
      const year = projectionDate.getFullYear();
      const month = projectionDate.getMonth();
      const dateStr = format(projectionDate, 'yyyy-MM');
      const labelStr = format(projectionDate, 'MMM/yyyy', { locale: ptBR });

      let projectedIncome = 0;
      let projectedExpense = 0;
      let recurringIncome = 0;
      let recurringExpense = 0;
      let liabilityPayments = 0;
      let balloonPayments = 0;

      // 1. Lógica para transações recorrentes e futuras (já registradas com data futura)
      transactions.forEach(t => {
        const tDate = parseISO(t.date);
        
        // Transação fixa no futuro para este mês exato
        if (tDate.getFullYear() === year && tDate.getMonth() === month && !t.is_recurring) {
          if (t.type === 'INCOME') projectedIncome += t.amount;
          else if (t.type === 'EXPENSE' || t.type === 'BILL_PAYMENT') projectedExpense += t.amount;
        }

        // Transação recorrente (simplificado: assume recorrência mensal)
        if (t.is_recurring && t.recurrence_period === 'monthly') {
          // Só projeta se a data original for anterior ou igual ao mês projetado
          if (isBefore(startOfMonth(tDate), addMonths(projectionDate, 1))) {
             if (t.type === 'INCOME') recurringIncome += t.amount;
             else if (t.type === 'EXPENSE' || t.type === 'BILL_PAYMENT') recurringExpense += t.amount;
          }
        }
      });

      // 2. Passivos normais (Empréstimos, Carro, etc)
      liabilities.forEach(l => {
        if (l.installmentAmount && l.installmentsRemaining && l.installmentsRemaining > i) {
          liabilityPayments += l.installmentAmount;
        }
      });

      // 3. Passivos Imobiliários (Financiamentos com Balão e Índice)
      realEstateLiabilities.forEach(rel => {
        if (rel.installmentAmount && rel.installments_count > i) {
          // Cálculo simples de correção (juros compostos mensais sobre a parcela)
          // indexation_rate = % ao ano (ex: 5 = 5%).
          const monthlyRate = Math.pow(1 + (rel.indexation_rate / 100), 1 / 12) - 1;
          const correctedInstallment = rel.installmentAmount * Math.pow(1 + monthlyRate, i);
          
          liabilityPayments += correctedInstallment;
        }

        // Checar se há parcela balão neste mês/ano específico
        rel.balloon_payments.forEach(bp => {
          // O usuário pode definir o mês e ano do balão (ou mês relativo)
          // Assumindo que bp.month e bp.year são absolutos:
          if (bp.month === month + 1 && bp.year === year) {
            balloonPayments += bp.amount;
          }
        });
      });

      const totalIncome = projectedIncome + recurringIncome;
      const totalExpense = projectedExpense + recurringExpense + liabilityPayments + balloonPayments;
      const netCashFlow = totalIncome - totalExpense;
      
      const startingBalance = runningBalance;
      runningBalance += netCashFlow;

      projection.push({
        date: dateStr,
        label: labelStr,
        startingBalance,
        projectedIncome,
        projectedExpense,
        recurringIncome,
        recurringExpense,
        liabilityPayments,
        balloonPayments,
        netCashFlow,
        endingBalance: runningBalance
      });
    }

    return projection;
  }
};
