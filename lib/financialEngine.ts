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

  /**
   * Parses annual yield rate text and index type into a flat annual percentage rate.
   */
  static parseYieldRate(yieldRateStr: string, indexType: string): number {
    const rawVal = parseFloat((yieldRateStr || '').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
    
    // Default benchmarks
    const BENCHMARK_CDI = 10.4;
    const BENCHMARK_IPCA = 4.0;
    
    const indexUpper = (indexType || '').toUpperCase();
    const rateUpper = (yieldRateStr || '').toUpperCase();
    
    if (rateUpper.includes('CDI') || indexUpper === 'CDI') {
      const percentage = yieldRateStr.includes('%') ? (rawVal / 100) : (rawVal > 2 ? rawVal / 100 : rawVal);
      return (percentage || 1) * BENCHMARK_CDI;
    }
    
    if (rateUpper.includes('IPCA') || indexUpper === 'IPCA') {
      return BENCHMARK_IPCA + rawVal;
    }
    
    return rawVal;
  }

  /**
   * Converts annual rate percentage to monthly decimal rate: ((1 + i_annual/100)^(1/12) - 1).
   */
  static getEquivalentMonthlyRate(annualRatePercent: number): number {
    return Math.pow(1 + annualRatePercent / 100, 1 / 12) - 1;
  }

  /**
   * Returns Brazilian regressive tax rate based on days elapsed.
   */
  static calculateRegressiveTaxRate(days: number, isTaxExempt: boolean): number {
    if (isTaxExempt) return 0;
    if (days <= 180) return 0.225;
    if (days <= 360) return 0.20;
    if (days <= 720) return 0.175;
    return 0.15;
  }

  /**
   * Computes the current gross value, IR tax, and net value for fixed income assets.
   */
  static calculateFixedIncomeYield(
    initialValue: number,
    annualRate: number,
    acquisitionDateStr: string,
    payoutType: 'ACUMULADO' | 'MENSAL',
    isTaxExempt: boolean
  ): {
    monthsElapsed: number;
    daysElapsed: number;
    monthlyRate: number;
    grossValue: number;
    grossYield: number;
    taxRate: number;
    taxAmount: number;
    netValue: number;
  } {
    const today = new Date();
    const acqDate = new Date(acquisitionDateStr);
    
    if (isNaN(acqDate.getTime())) {
      return {
        monthsElapsed: 0,
        daysElapsed: 0,
        monthlyRate: 0,
        grossValue: initialValue,
        grossYield: 0,
        taxRate: 0,
        taxAmount: 0,
        netValue: initialValue
      };
    }
    
    const diffTime = Math.max(0, today.getTime() - acqDate.getTime());
    const daysElapsed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    let monthsElapsed = (today.getFullYear() - acqDate.getFullYear()) * 12 + (today.getMonth() - acqDate.getMonth());
    if (today.getDate() < acqDate.getDate()) {
      monthsElapsed = Math.max(0, monthsElapsed - 1);
    }
    
    const monthlyRate = this.getEquivalentMonthlyRate(annualRate);
    
    let grossValue = initialValue;
    let grossYield = 0;
    
    if (payoutType === 'ACUMULADO') {
      grossValue = initialValue * Math.pow(1 + monthlyRate, monthsElapsed);
      grossYield = Math.max(0, grossValue - initialValue);
    } else {
      grossYield = initialValue * monthlyRate * monthsElapsed;
    }
    
    const taxRate = this.calculateRegressiveTaxRate(daysElapsed, isTaxExempt);
    const taxAmount = Math.round(grossYield * taxRate * 100) / 100;
    
    const netValue = Math.round((grossValue - (payoutType === 'ACUMULADO' ? taxAmount : 0)) * 100) / 100;
    
    return {
      monthsElapsed,
      daysElapsed,
      monthlyRate,
      grossValue: Math.round(grossValue * 100) / 100,
      grossYield: Math.round(grossYield * 100) / 100,
      taxRate,
      taxAmount,
      netValue
    };
  }

  /**
   * Generates a theoretical Price/SAC amortization schedule for a loan.
   */
  static calculateProjectedLoanAmortization(
    principal: number,
    monthlyRatePercent: number,
    installmentsCount: number,
    system: 'SAC' | 'PRICE' | 'CUSTOM'
  ): {
    installmentNumber: number;
    payment: number;
    interest: number;
    amortization: number;
    outstandingBalance: number;
  }[] {
    const schedule = [];
    let currentBalance = principal;
    const i = monthlyRatePercent / 100;
    const n = installmentsCount;
    
    if (system === 'SAC') {
      const fixedAmortization = principal / n;
      for (let k = 1; k <= n; k++) {
        const interest = currentBalance * i;
        const amortization = Math.min(currentBalance, fixedAmortization);
        const payment = amortization + interest;
        currentBalance -= amortization;
        
        schedule.push({
          installmentNumber: k,
          payment: Math.round(payment * 100) / 100,
          interest: Math.round(interest * 100) / 100,
          amortization: Math.round(amortization * 100) / 100,
          outstandingBalance: Math.max(0, Math.round(currentBalance * 100) / 100)
        });
      }
    } else if (system === 'PRICE') {
      const pmt = i === 0
        ? principal / n
        : (principal * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
        
      for (let k = 1; k <= n; k++) {
        const interest = currentBalance * i;
        const amortization = Math.min(currentBalance, pmt - interest);
        const payment = amortization + interest;
        currentBalance -= amortization;
        
        schedule.push({
          installmentNumber: k,
          payment: Math.round(payment * 100) / 100,
          interest: Math.round(interest * 100) / 100,
          amortization: Math.round(amortization * 100) / 100,
          outstandingBalance: Math.max(0, Math.round(currentBalance * 100) / 100)
        });
      }
    }
    return schedule;
  }

  /**
   * Calculates a value compounded by an index rate over a number of months.
   */
  static calculateIndexCompoundedValue(
    baseValue: number,
    monthlyIndexRatePercent: number,
    months: number
  ): number {
    const rate = monthlyIndexRatePercent / 100;
    return baseValue * Math.pow(1 + rate, Math.max(0, months));
  }

  /**
   * Calculates real estate asset performance and health metrics.
   */
  static calculateRealEstateMetrics(input: {
    estimatedValue: number;
    totalInvestedCapital: number; // Down payments + balloons + cartórios + reformas paid
    monthlyGrossRent: number;
    monthlyOperationalExpenses: number; // Condomínio + IPTU + maintenance
    monthlyFinancingInstallment: number; // Parcelas / consortium payments
    outstandingDebt: number; // Remaining balance of financing / consortium
  }): {
    capRateAnnual: number;
    cashOnCashReturn: number;
    ltv: number;
    homeEquityPercent: number;
    netMonthlyCashFlow: number;
  } {
    const {
      estimatedValue,
      totalInvestedCapital,
      monthlyGrossRent,
      monthlyOperationalExpenses,
      monthlyFinancingInstallment,
      outstandingDebt
    } = input;

    // Net Operational Income (NOI) = Gross Rent - Operational Expenses
    const monthlyNOI = Math.max(0, monthlyGrossRent - monthlyOperationalExpenses);
    const annualNOI = monthlyNOI * 12;

    const capRateAnnual = estimatedValue > 0 ? (annualNOI / estimatedValue) * 100 : 0;

    // Cash-on-Cash = (Net Annual Cash Flow) / Total Invested Capital
    // Net Cash Flow = Gross Rent - Operational Expenses - Financing Installment
    const netMonthlyCashFlow = monthlyGrossRent - monthlyOperationalExpenses - monthlyFinancingInstallment;
    const annualNetCashFlow = netMonthlyCashFlow * 12;

    const cashOnCashReturn = totalInvestedCapital > 0 ? (annualNetCashFlow / totalInvestedCapital) * 100 : 0;

    // Loan-to-Value (LTV)
    const ltv = estimatedValue > 0 ? (outstandingDebt / estimatedValue) * 100 : 0;
    const homeEquityPercent = Math.max(0, 100 - ltv);

    return {
      capRateAnnual: Math.round(capRateAnnual * 100) / 100,
      cashOnCashReturn: Math.round(cashOnCashReturn * 100) / 100,
      ltv: Math.round(ltv * 100) / 100,
      homeEquityPercent: Math.round(homeEquityPercent * 100) / 100,
      netMonthlyCashFlow: Math.round(netMonthlyCashFlow * 100) / 100
    };
  }
}
