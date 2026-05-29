/**
 * Types & Interfaces for the Brazilian Financial Planning Engine
 */

export type FinancingSystem = 'SAC' | 'PRICE';

export interface DebtDetails {
  id: string;
  name: string;
  outstandingBalance: number; // Saldo Devedor Atual (R$)
  annualCET: number;          // Custo Efetivo Total Anual (e.g. 10.5% = 0.105)
  remainingMonths: number;    // Prazo Restante em Meses
  financingSystem: FinancingSystem;
  installmentAmount: number;  // Valor da Parcela Atual
}

export interface InvestmentDetails {
  grossAnnualYield: number;   // Rendimento Bruto Anual (e.g. 10.75% = 0.1075)
  isTaxExempt: boolean;       // LCIs, LCAs, CRIs, CRAs, Poupança = true
}

export interface AmortizationSimulationInput {
  debt: DebtDetails;
  investment: InvestmentDetails;
  extraAmortization: number;  // Valor Adicional para Amortizar (R$)
}

export type ThresholdZone = 'GREEN' | 'YELLOW' | 'RED';

export interface AmortizationResult {
  spreadAnnual: number;
  winner: 'AMORTIZAR' | 'INVESTIR' | 'NEUTRAL';
  zone: ThresholdZone;
  wealthDifferenceAtEnd: number; // Scenario A - Scenario B at Month N (R$)
  remainingMonthsAfterAmortization: number;
  originalTotalInterest: number;
  newTotalInterestAfterAmortization: number;
  directInterestSaved: number;
}

export interface IncomeCommitmentInput {
  monthlyNetIncome: number;     // Renda Líquida Mensal (R$)
  monthlyDebtPayments: number;  // Soma das Parcelas Mensais (R$)
}

export interface IncomeCommitmentResult {
  ratio: number; // %
  zone: ThresholdZone;
  availableCashForSavings: number; // Suggested 20% check (R$)
}

export interface AssetLiabilitiesInput {
  totalLiabilities: number;    // Total de Dívidas (R$)
  liquidInvestments: number;   // Investimentos (R$)
  physicalAssetsValue: number; // Bens Físicos (Imóveis, Carros) (R$)
  specificMortgageBalance?: number;
  specificPropertyValue?: number;
}

export interface LeverageResult {
  globalLeverage: number; // APG (%)
  globalLeverageZone: ThresholdZone;
  traditionalLTV?: number; // LTV (%)
  traditionalLTVZone?: ThresholdZone;
}

export interface DebtCoverageInput {
  liquidInvestments: number;      // Investimentos Líquidos (R$)
  assumedNetMonthlyYield: number; // Net Monthly Yield (e.g., 0.5% = 0.005)
  monthlyRentalIncome: number;    // Aluguéis Recebidos (R$)
  totalMonthlyDebtPayments: number; // Soma das Parcelas (R$)
}

export interface DebtCoverageResult {
  ratio: number; // ICD (%)
  zone: ThresholdZone;
  passiveMonthlyIncome: number; // Yield + Rent (R$)
}

/**
 * CORE FINANCIAL ENGINE CLASS
 */
export class FinancialEngine {

  /**
   * 1. CALCULATOR: Amortizar vs Investir (Cash Flow Reinvestment Model)
   */
  static simulateAmortizeVsInvest(input: AmortizationSimulationInput): AmortizationResult {
    const { debt, investment, extraAmortization } = input;

    // Monthly rates
    const i_d = Math.pow(1 + debt.annualCET, 1 / 12) - 1;
    
    // Regressive IR logic based on financing term
    let irRate = 0.15; // default for long term > 720 days
    if (debt.remainingMonths <= 6) irRate = 0.225;
    else if (debt.remainingMonths <= 12) irRate = 0.20;
    else if (debt.remainingMonths <= 24) irRate = 0.175;

    const netInvestmentAnnual = investment.isTaxExempt 
      ? investment.grossAnnualYield 
      : investment.grossAnnualYield * (1 - irRate);
    
    const i_net = Math.pow(1 + netInvestmentAnnual, 1 / 12) - 1;
    const spreadAnnual = netInvestmentAnnual - debt.annualCET;

    // Simulate Original Debt Payments to find Total Interest
    const originalSchedule = this.generatePaymentSchedule(
      debt.outstandingBalance, 
      i_d, 
      debt.remainingMonths, 
      debt.financingSystem
    );
    const originalTotalInterest = originalSchedule.reduce((sum, p) => sum + p.interest, 0);

    // Simulate Amortized Debt Schedule (Reduction of Term - "Redução de Prazo")
    const newOutstanding = Math.max(0, debt.outstandingBalance - extraAmortization);
    let newSchedule = this.generatePaymentSchedule(
      newOutstanding, 
      i_d, 
      debt.remainingMonths, 
      debt.financingSystem
    );
    
    // Remove trailing months where outstanding balance is zero
    newSchedule = newSchedule.filter(p => p.outstandingBefore > 0.01);
    const remainingMonthsAfterAmortization = newSchedule.length;
    const newTotalInterest = newSchedule.reduce((sum, p) => sum + p.interest, 0);
    const directInterestSaved = originalTotalInterest - newTotalInterest;

    // Multi-Period Wealth Reinvestment Simulation at Month N
    const N = debt.remainingMonths;
    const N_new = remainingMonthsAfterAmortization;

    // Scenario A: Amortize & Reinvest saved installments from N_new + 1 to N
    let wealthAmortize = 0;
    for (let t = N_new; t < N; t++) {
      // In SAC, the original payments decrease. We find the corresponding original installment
      const savedInstallment = originalSchedule[t]?.payment || 0;
      const monthsReinvested = N - 1 - t;
      wealthAmortize += savedInstallment * Math.pow(1 + i_net, monthsReinvested);
    }

    // Scenario B: Invest the extra amortization amount today and let it compound for N months
    const wealthInvest = extraAmortization * Math.pow(1 + i_net, N);

    const wealthDifference = wealthAmortize - wealthInvest;

    // Threshold classification based on Annual Spread
    let zone: ThresholdZone = 'YELLOW';
    let winner: 'AMORTIZAR' | 'INVESTIR' | 'NEUTRAL' = 'NEUTRAL';

    if (spreadAnnual <= -0.02) {
      zone = 'GREEN'; // Highly favors amortization
      winner = 'AMORTIZAR';
    } else if (spreadAnnual > 0.01) {
      zone = 'RED'; // Highly favors investing
      winner = 'INVESTIR';
    } else {
      zone = 'YELLOW'; // Neutral / depends on liquidity
      winner = 'NEUTRAL';
    }

    return {
      spreadAnnual,
      winner,
      zone,
      wealthDifferenceAtEnd: wealthDifference,
      remainingMonthsAfterAmortization,
      originalTotalInterest,
      newTotalInterestAfterAmortization: newTotalInterest,
      directInterestSaved
    };
  }

  /**
   * Helper to generate exact payment schedules for SAC and Price
   */
  static generatePaymentSchedule(
    principal: number, 
    monthlyRate: number, 
    months: number, 
    system: FinancingSystem
  ): { payment: number; interest: number; amortization: number; outstandingBefore: number }[] {
    const schedule = [];
    let currentOutstanding = principal;

    if (system === 'SAC') {
      const fixedAmortization = principal / months;
      for (let t = 1; t <= months; t++) {
        if (currentOutstanding <= 0) break;
        const interest = currentOutstanding * monthlyRate;
        // Last installment adjust
        const actualAmortization = currentOutstanding < fixedAmortization ? currentOutstanding : fixedAmortization;
        const payment = actualAmortization + interest;
        
        schedule.push({
          payment,
          interest,
          amortization: actualAmortization,
          outstandingBefore: currentOutstanding
        });
        currentOutstanding -= actualAmortization;
      }
    } else {
      // PRICE System
      const pmt = monthlyRate === 0 
        ? principal / months 
        : (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
      
      for (let t = 1; t <= months; t++) {
        if (currentOutstanding <= 0) break;
        const interest = currentOutstanding * monthlyRate;
        const amortization = Math.min(currentOutstanding, pmt - interest);
        const payment = amortization + interest;

        schedule.push({
          payment,
          interest,
          amortization,
          outstandingBefore: currentOutstanding
        });
        currentOutstanding -= amortization;
      }
    }
    return schedule;
  }

  /**
   * 2. CALCULATOR: Comprometimento de Renda (Income Commitment Ratio)
   */
  static calculateIncomeCommitment(input: IncomeCommitmentInput): IncomeCommitmentResult {
    const ratio = input.monthlyNetIncome > 0 
      ? (input.monthlyDebtPayments / input.monthlyNetIncome) * 100 
      : 0;
    
    let zone: ThresholdZone = 'GREEN';
    if (ratio > 30) {
      zone = 'RED';
    } else if (ratio > 20) {
      zone = 'YELLOW';
    }

    const availableCashForSavings = Math.max(0, input.monthlyNetIncome * 0.20);

    return {
      ratio,
      zone,
      availableCashForSavings
    };
  }

  /**
   * 3. CALCULATOR: LTV & Alavancagem Patrimonial Global (APG)
   */
  static calculateLeverage(input: AssetLiabilitiesInput): LeverageResult {
    const totalAssets = input.liquidInvestments + input.physicalAssetsValue;
    const globalLeverage = totalAssets > 0 ? (input.totalLiabilities / totalAssets) * 100 : 0;

    let globalLeverageZone: ThresholdZone = 'GREEN';
    if (globalLeverage > 50) {
      globalLeverageZone = 'RED';
    } else if (globalLeverage > 20) {
      globalLeverageZone = 'YELLOW';
    }

    let traditionalLTV: number | undefined;
    let traditionalLTVZone: ThresholdZone | undefined;

    if (input.specificMortgageBalance !== undefined && input.specificPropertyValue !== undefined && input.specificPropertyValue > 0) {
      traditionalLTV = (input.specificMortgageBalance / input.specificPropertyValue) * 100;
      if (traditionalLTV > 80) {
        traditionalLTVZone = 'RED';
      } else if (traditionalLTV > 50) {
        traditionalLTVZone = 'YELLOW';
      } else {
        traditionalLTVZone = 'GREEN';
      }
    }

    return {
      globalLeverage,
      globalLeverageZone,
      traditionalLTV,
      traditionalLTVZone
    };
  }

  /**
   * 4. CALCULATOR: Índice de Cobertura de Dívida / Passivos (ICD)
   */
  static calculateDebtCoverage(input: DebtCoverageInput): DebtCoverageResult {
    const passiveMonthlyIncome = (input.liquidInvestments * input.assumedNetMonthlyYield) + input.monthlyRentalIncome;
    const ratio = input.totalMonthlyDebtPayments > 0 
      ? (passiveMonthlyIncome / input.totalMonthlyDebtPayments) * 100 
      : 100; // If no debts, coverage is 100%

    let zone: ThresholdZone = 'RED';
    if (ratio >= 100) {
      zone = 'GREEN';
    } else if (ratio >= 20) {
      zone = 'YELLOW';
    }

    return {
      ratio,
      zone,
      passiveMonthlyIncome
    };
  }
}
