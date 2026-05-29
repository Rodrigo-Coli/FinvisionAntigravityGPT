import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import { 
  BookOpen, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Percent, 
  Activity, 
  Calendar, 
  DollarSign, 
  AlertTriangle, 
  Layers, 
  Hourglass, 
  CheckCircle,
  HelpCircle,
  Info,
  RefreshCw,
  PlusCircle,
  Award
} from 'lucide-react';
import { 
  FinancialEngine, 
  DebtDetails, 
  InvestmentDetails, 
  FinancingSystem 
} from '../lib/financialEngine';

const Studies: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'summary' | 'sust' | 'amortize' | 'runway' | 'opportunity' | 'efficiency' | 'new_projects'>('summary');
  
  // Data State loaded from Supabase
  const [isLoading, setIsLoading] = useState(true);
  const [investmentsTotal, setInvestmentsTotal] = useState(0);
  const [physicalAssetsTotal, setPhysicalAssetsTotal] = useState(0);
  const [liabilitiesList, setLiabilitiesList] = useState<DebtDetails[]>([]);
  const [activeIncome, setActiveIncome] = useState(12000); // Renda Líquida Mensal padrão
  const [rentalIncome, setRentalIncome] = useState(0);     // Aluguéis recebidos padrão
  
  // Interactive Controls state
  const [cdiRate, setCdiRate] = useState(10.75);           // CDI bruto anual (%)
  const [isTaxExempt, setIsTaxExempt] = useState(false);   // Investimento isento de IR?
  
  // Sandbox Amortize state
  const [selectedDebtId, setSelectedDebtId] = useState<string>('');
  const [extraAmortizationVal, setExtraAmortizationVal] = useState(20000);
  
  // New Project state
  const [newProjectValue, setNewProjectValue] = useState(150000);
  const [newProjectMonths, setNewProjectMonths] = useState(120);
  const [newProjectRate, setNewProjectRate] = useState(12.0); // 12% a.a ou taxa adm consórcio
  const [newProjectType, setNewProjectType] = useState<'financing_sac' | 'financing_price' | 'consortium'>('financing_sac');

  useEffect(() => {
    loadSupabaseData();
  }, []);

  const loadSupabaseData = async () => {
    if (!supabase) return;
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Fetch Investment Accounts
      const { data: accountsData } = await supabase
        .from('accounts')
        .select('current_balance')
        .eq('user_id', user.id)
        .eq('type', 'INVESTMENT')
        .eq('is_archived', false);

      const totalInvests = (accountsData || []).reduce((sum: number, acc: any) => sum + Number(acc.current_balance || 0), 0);
      setInvestmentsTotal(totalInvests);

      // 2. Fetch Physical Assets
      const { data: physicalAssetsData } = await supabase
        .from('physical_assets')
        .select('estimated_value')
        .eq('user_id', user.id);

      const totalPhysical = (physicalAssetsData || []).reduce((sum: number, ast: any) => sum + Number(ast.estimated_value || 0), 0);
      setPhysicalAssetsTotal(totalPhysical);

      // 3. Fetch Liabilities (Debts)
      const { data: liabilitiesData } = await supabase
        .from('liabilities')
        .select('*')
        .eq('user_id', user.id);

      const mappedLiabilities: DebtDetails[] = (liabilitiesData || []).map((l: any) => ({
        id: l.id,
        name: l.name || 'Passivo',
        outstandingBalance: Number(l.remaining_balance || 0),
        annualCET: Number(l.interest_rate || 0.08), // default 8% CET if not defined
        remainingMonths: Number(l.installments_remaining || 12),
        financingSystem: (l.type === 'CONSORTIUM' ? 'PRICE' : (l.metadata?.system === 'PRICE' ? 'PRICE' : 'SAC')) as FinancingSystem,
        installmentAmount: Number(l.installment_amount || 0)
      }));

      setLiabilitiesList(mappedLiabilities);
      if (mappedLiabilities.length > 0) {
        setSelectedDebtId(mappedLiabilities[0].id);
      }

      // 4. Estimate incomes based on recent transactions (last 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const { data: transactionsData } = await supabase
        .from('transactions')
        .select('amount, category, description, date')
        .eq('user_id', user.id)
        .eq('type', 'INCOME')
        .eq('is_deleted', false)
        .gte('date', ninetyDaysAgo.toISOString().split('T')[0]);

      if (transactionsData && transactionsData.length > 0) {
        // Estimate salaries/consulting
        const activeCategories = ['salario', 'prestacao', 'receita', 'pro-labore', 'servico', 'pró-labore'];
        const rentCategories = ['aluguel', 'locacao', 'rendimento imobiliario', 'imobiliario'];
        
        let sumActive = 0;
        let sumRent = 0;

        for (const tx of transactionsData) {
          const categoryLower = (tx.category || '').toLowerCase();
          const descLower = (tx.description || '').toLowerCase();
          
          const isRent = rentCategories.some(c => categoryLower.includes(c) || descLower.includes(c));
          const isActive = activeCategories.some(c => categoryLower.includes(c) || descLower.includes(c));

          if (isRent) sumRent += Number(tx.amount || 0);
          else if (isActive) sumActive += Number(tx.amount || 0);
          else sumActive += Number(tx.amount || 0); // fallback regular income
        }

        // Monthly average (divided by 3 months)
        const avgActive = Math.round((sumActive / 3) * 100) / 100;
        const avgRent = Math.round((sumRent / 3) * 100) / 100;

        if (avgActive > 0) setActiveIncome(avgActive);
        if (avgRent > 0) setRentalIncome(avgRent);
      }

    } catch (e) {
      console.error("Erro ao carregar dados do investidor:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // Intermediate helper variables
  const totalLiabilities = liabilitiesList.reduce((sum, d) => sum + d.outstandingBalance, 0);
  const totalMonthlyInstallments = liabilitiesList.reduce((sum, d) => sum + d.installmentAmount, 0);
  const totalAssets = investmentsTotal + physicalAssetsTotal;
  const netMonthlyCashInflow = activeIncome + rentalIncome;

  // Assumed Net Monthly Yield Rate
  const assumedNetMonthlyYield = isTaxExempt 
    ? Math.pow(1 + (cdiRate / 100), 1 / 12) - 1 
    : Math.pow(1 + ((cdiRate * 0.85) / 100), 1 / 12) - 1; // 15% IR avg standard

  // Puxar dados calculados pelo Engine
  const incomeResult = FinancialEngine.calculateIncomeCommitment({
    monthlyNetIncome: netMonthlyCashInflow,
    monthlyDebtPayments: totalMonthlyInstallments
  });

  const leverageResult = FinancialEngine.calculateLeverage({
    totalLiabilities,
    liquidInvestments: investmentsTotal,
    physicalAssetsValue: physicalAssetsTotal
  });

  const coverageResult = FinancialEngine.calculateDebtCoverage({
    liquidInvestments: investmentsTotal,
    assumedNetMonthlyYield,
    monthlyRentalIncome: rentalIncome,
    totalMonthlyDebtPayments: totalMonthlyInstallments
  });

  // Calculate Cash Runway
  const monthlyCostEstimate = Math.max(2000, netMonthlyCashInflow - totalMonthlyInstallments);
  const cashRunwayMonths = monthlyCostEstimate + totalMonthlyInstallments > 0 
    ? investmentsTotal / (totalMonthlyInstallments + monthlyCostEstimate) 
    : 0;

  // Selected Debt details for amortization sandbox
  const selectedDebt = liabilitiesList.find(d => d.id === selectedDebtId);

  // Amortization result
  const amortizeResult = selectedDebt ? FinancialEngine.simulateAmortizeVsInvest({
    debt: selectedDebt,
    investment: {
      grossAnnualYield: cdiRate / 100,
      isTaxExempt
    },
    extraAmortization: extraAmortizationVal
  }) : null;

  // Weighted Average Cost of Debt (WACD)
  const wacd = totalLiabilities > 0 
    ? (liabilitiesList.reduce((sum, d) => sum + (d.outstandingBalance * d.annualCET), 0) / totalLiabilities) * 100 
    : 0;

  const carrySpread = (cdiRate * (isTaxExempt ? 1.0 : 0.85)) - wacd;

  // Prospective New Project calculations
  const calculateNewProjectInstallment = () => {
    const rateMonthly = Math.pow(1 + (newProjectRate / 100), 1 / 12) - 1;
    if (newProjectType === 'financing_sac') {
      const initialAmortization = newProjectValue / newProjectMonths;
      const initialInterest = newProjectValue * rateMonthly;
      return initialAmortization + initialInterest; // First installment is highest under SAC
    } else if (newProjectType === 'financing_price') {
      if (rateMonthly === 0) return newProjectValue / newProjectMonths;
      return (newProjectValue * rateMonthly * Math.pow(1 + rateMonthly, newProjectMonths)) / (Math.pow(1 + rateMonthly, newProjectMonths) - 1);
    } else {
      // Consortium: simple admin fee + fund dilution
      const totalAdminFee = newProjectValue * (newProjectRate / 100);
      return (newProjectValue + totalAdminFee) / newProjectMonths;
    }
  };

  const newProjectInstallment = calculateNewProjectInstallment();
  const prospectiveTotalInstallments = totalMonthlyInstallments + newProjectInstallment;
  const prospectiveIncomeResult = FinancialEngine.calculateIncomeCommitment({
    monthlyNetIncome: netMonthlyCashInflow,
    monthlyDebtPayments: prospectiveTotalInstallments
  });

  const getZoneColor = (zone: 'GREEN' | 'YELLOW' | 'RED') => {
    if (zone === 'GREEN') return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    if (zone === 'YELLOW') return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
  };

  const getZoneLabel = (zone: 'GREEN' | 'YELLOW' | 'RED', type: 'LTV' | 'CR' | 'ICD' | 'RUNWAY') => {
    if (type === 'CR') {
      if (zone === 'GREEN') return 'Saudável (Margem Ampla)';
      if (zone === 'YELLOW') return 'Alerta (Atenção ao Caixa)';
      return 'Crítico (Comprometimento Excessivo)';
    }
    if (type === 'LTV') {
      if (zone === 'GREEN') return 'Conservador (Altíssima Segurança)';
      if (zone === 'YELLOW') return 'Moderado (Acúmulo Saudável)';
      return 'Alavancado (Exposição Elevada)';
    }
    if (type === 'ICD') {
      if (zone === 'GREEN') return 'Autossuficiente (O Patrimônio Paga)';
      if (zone === 'YELLOW') return 'Cobertura Parcial (Mitigado)';
      return 'Vulnerável (Dependência de Salário)';
    }
    // RUNWAY
    if (zone === 'GREEN') return 'Excelente (+12 Meses)';
    if (zone === 'YELLOW') return 'Aceitável (6 a 12 Meses)';
    return 'Vulnerável (< 6 Meses)';
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-10 py-8 space-y-8 animate-in fade-in duration-500 dark:text-white">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white italic tracking-tight flex items-center gap-3">
            <BookOpen className="text-brand-600" size={28} />
            Estudos e Cenários de Investimento
          </h1>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
            Simulador Estratégico 360º de Alavancagem e Eficiência Patrimonial
          </p>
        </div>
        
        {/* Real-time sync / Settings */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button 
            onClick={loadSupabaseData} 
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-100 dark:bg-brand-900/40 dark:border-slate-800 text-slate-500 dark:text-slate-300 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm hover:text-slate-900 active:scale-95 transition-all"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            Sincronizar Dados Supabase
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-60 bg-white dark:bg-brand-950/20 rounded-[40px] border border-slate-100 dark:border-slate-800/40 flex flex-col items-center justify-center">
          <RefreshCw size={48} className="animate-spin text-brand-600 mb-4" />
          <p className="text-[10px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest">Acessando base de ativos e passivos...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* SIDE PANEL: GLOBAL CONTROLS & ASSUMPTIONS */}
          <div className="lg:col-span-1 space-y-6">
            <div className="backdrop-blur-md bg-white border border-slate-100 dark:bg-brand-950/30 dark:border-slate-800 p-6 rounded-[32px] shadow-sm space-y-6">
              <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-50 dark:border-slate-800 pb-3 flex items-center gap-2">
                <Activity size={16} className="text-brand-600" />
                Premissas de Simulação
              </h3>

              {/* Editable Active Net Income */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Renda Líquida Mensal (R$)</label>
                <div className="relative">
                  <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    type="number"
                    value={activeIncome}
                    onChange={e => setActiveIncome(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-slate-50 border-none dark:bg-brand-900/30 rounded-xl text-xs font-black p-3 pl-8 outline-none focus:ring-2 focus:ring-brand-500 text-slate-800 dark:text-white"
                  />
                </div>
                <span className="text-[8px] font-bold text-slate-300 block">Estimada a partir de depósitos em conta.</span>
              </div>

              {/* Editable Rental Income */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Receitas com Aluguéis (R$)</label>
                <div className="relative">
                  <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    type="number"
                    value={rentalIncome}
                    onChange={e => setRentalIncome(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-slate-50 border-none dark:bg-brand-900/30 rounded-xl text-xs font-black p-3 pl-8 outline-none focus:ring-2 focus:ring-brand-500 text-slate-800 dark:text-white"
                  />
                </div>
                <span className="text-[8px] font-bold text-slate-300 block">Média mensal de proventos de imóveis/FIIs.</span>
              </div>

              {/* Investment Yield (CDI/Selic) Slider */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <span>Rendimento Anual CDI</span>
                  <span className="text-brand-600 dark:text-brand-400">{cdiRate.toFixed(2)}%</span>
                </div>
                <input
                  type="range"
                  min="2.0"
                  max="18.0"
                  step="0.25"
                  value={cdiRate}
                  onChange={e => setCdiRate(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 dark:bg-brand-800 rounded-lg appearance-none cursor-pointer accent-brand-600"
                />
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    id="taxExempt"
                    checked={isTaxExempt}
                    onChange={e => setIsTaxExempt(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                  <label htmlFor="taxExempt" className="text-[9px] font-black text-slate-400 uppercase cursor-pointer">
                    LCI / LCA (Isento de IR)
                  </label>
                </div>
              </div>

              {/* Summary Balance Quick View */}
              <div className="pt-4 border-t border-slate-50 dark:border-slate-800 space-y-3 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                <p className="flex justify-between">
                  <span>Investimentos Líquidos:</span>
                  <span className="text-slate-900 dark:text-white font-black">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(investmentsTotal)}</span>
                </p>
                <p className="flex justify-between">
                  <span>Patrimônio Físico:</span>
                  <span className="text-slate-900 dark:text-white font-black">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(physicalAssetsTotal)}</span>
                </p>
                <p className="flex justify-between">
                  <span>Saldo Devedor Total:</span>
                  <span className="text-slate-900 dark:text-white font-black">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalLiabilities)}</span>
                </p>
                <p className="flex justify-between border-t border-slate-50 dark:border-slate-800 pt-2 text-[11px] text-brand-600 dark:text-brand-400">
                  <span>Patrimônio Líquido:</span>
                  <span className="font-black">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAssets - totalLiabilities)}</span>
                </p>
              </div>
            </div>
          </div>

          {/* MAIN PANELS CONTAINER */}
          <div className="lg:col-span-3 space-y-6">
            {/* Nav Tabs */}
            <div className="flex flex-wrap items-center bg-white border border-slate-100 dark:bg-brand-950/20 dark:border-slate-850 p-2 rounded-2xl gap-2 shadow-sm">
              <button 
                onClick={() => setActiveTab('summary')}
                className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${activeTab === 'summary' ? 'bg-brand-900 text-white border-brand-900' : 'bg-transparent text-slate-400 border-transparent hover:bg-slate-50'}`}
              >
                Resumo Geral
              </button>
              <button 
                onClick={() => setActiveTab('sust')}
                className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${activeTab === 'sust' ? 'bg-brand-900 text-white border-brand-900' : 'bg-transparent text-slate-400 border-transparent hover:bg-slate-50'}`}
              >
                Auto-Sustento
              </button>
              <button 
                onClick={() => setActiveTab('amortize')}
                className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${activeTab === 'amortize' ? 'bg-brand-900 text-white border-brand-900' : 'bg-transparent text-slate-400 border-transparent hover:bg-slate-50'}`}
              >
                Amortizar vs Investir
              </button>
              <button 
                onClick={() => setActiveTab('runway')}
                className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${activeTab === 'runway' ? 'bg-brand-900 text-white border-brand-900' : 'bg-transparent text-slate-400 border-transparent hover:bg-slate-50'}`}
              >
                Resiliência
              </button>
              <button 
                onClick={() => setActiveTab('opportunity')}
                className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${activeTab === 'opportunity' ? 'bg-brand-900 text-white border-brand-900' : 'bg-transparent text-slate-400 border-transparent hover:bg-slate-50'}`}
              >
                Spread & Carry
              </button>
              <button 
                onClick={() => setActiveTab('efficiency')}
                className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${activeTab === 'efficiency' ? 'bg-brand-900 text-white border-brand-900' : 'bg-transparent text-slate-400 border-transparent hover:bg-slate-50'}`}
              >
                Tabelas SAC/Price
              </button>
              <button 
                onClick={() => setActiveTab('new_projects')}
                className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${activeTab === 'new_projects' ? 'bg-brand-900 text-white border-brand-900' : 'bg-transparent text-slate-400 border-transparent hover:bg-slate-50'}`}
              >
                Novos Projetos
              </button>
            </div>

            {/* TAB CONTENT: 1. SUMMARY / OVERVIEW */}
            {activeTab === 'summary' && (
              <div className="space-y-6">
                {/* 3 Core KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* KPI 1: Comprometimento de Renda */}
                  <div className={`backdrop-blur-md border rounded-[32px] p-6 shadow-xl transition-all duration-300 ${getZoneColor(incomeResult.zone)}`}>
                    <div className="flex justify-between items-start">
                      <Wallet size={20} />
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full border bg-white/20">RENDA</span>
                    </div>
                    <div className="mt-4">
                      <p className="text-[10px] font-black uppercase tracking-wider opacity-60">Comprometimento de Renda</p>
                      <h4 className="text-3xl font-black mt-1 tracking-tight">{incomeResult.ratio.toFixed(1)}%</h4>
                      <p className="text-[9px] font-bold mt-2 uppercase tracking-wide opacity-80">
                        {getZoneLabel(incomeResult.zone, 'CR')}
                      </p>
                    </div>
                  </div>

                  {/* KPI 2: Alavancagem Patrimonial (APG) */}
                  <div className={`backdrop-blur-md border rounded-[32px] p-6 shadow-xl transition-all duration-300 ${getZoneColor(leverageResult.globalLeverageZone)}`}>
                    <div className="flex justify-between items-start">
                      <Layers size={20} />
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full border bg-white/20">LTV GLOBAL</span>
                    </div>
                    <div className="mt-4">
                      <p className="text-[10px] font-black uppercase tracking-wider opacity-60">Alavancagem Patrimonial Global</p>
                      <h4 className="text-3xl font-black mt-1 tracking-tight">{leverageResult.globalLeverage.toFixed(1)}%</h4>
                      <p className="text-[9px] font-bold mt-2 uppercase tracking-wide opacity-80">
                        {getZoneLabel(leverageResult.globalLeverageZone, 'LTV')}
                      </p>
                    </div>
                  </div>

                  {/* KPI 3: Cobertura de Passivos (ICD) */}
                  <div className={`backdrop-blur-md border rounded-[32px] p-6 shadow-xl transition-all duration-300 ${getZoneColor(coverageResult.zone)}`}>
                    <div className="flex justify-between items-start">
                      <Award size={20} />
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full border bg-white/20">ICD</span>
                    </div>
                    <div className="mt-4">
                      <p className="text-[10px] font-black uppercase tracking-wider opacity-60">Autossuficiência (ICD)</p>
                      <h4 className="text-3xl font-black mt-1 tracking-tight">{coverageResult.ratio.toFixed(1)}%</h4>
                      <p className="text-[9px] font-bold mt-2 uppercase tracking-wide opacity-80">
                        {getZoneLabel(coverageResult.zone, 'ICD')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Dashboard summary report card */}
                <div className="backdrop-blur-md bg-white border border-slate-100 dark:bg-brand-950/30 dark:border-slate-800 p-8 rounded-[32px] shadow-sm space-y-6">
                  <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    Diagnóstico Patrimonial de Alavancagem
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-500 dark:text-slate-300 font-medium">
                    <div className="space-y-4">
                      <p>
                        Sua estrutura de passivos atualmente consome <strong className="text-slate-800 dark:text-white font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalMonthlyInstallments)}</strong> de um total de <strong className="text-slate-800 dark:text-white font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(netMonthlyCashInflow)}</strong> de renda líquida familiar.
                      </p>
                      {incomeResult.ratio > 30 ? (
                        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex gap-3 text-rose-800">
                          <AlertTriangle className="shrink-0" />
                          <p className="text-[10px] font-bold leading-normal uppercase">
                            <strong>Atenção:</strong> Seu comprometimento de renda supera o limite prudencial de 30%. Evite novas dívidas e priorize a amortização das taxas mais altas.
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex gap-3 text-emerald-800">
                          <CheckCircle className="shrink-0" />
                          <p className="text-[10px] font-bold leading-normal uppercase">
                            <strong>Saudável:</strong> O peso mensal das dívidas está sob total controle, mantendo boa parte da sua renda livre para investimentos.
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <p>
                        Holisticamente, você possui <strong className="text-slate-800 dark:text-white font-bold">{(totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0).toFixed(1)}%</strong> do seu patrimônio total alavancado por capital de terceiros. Seu patrimônio líquido consolidado é de <strong className="text-slate-850 dark:text-white font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAssets - totalLiabilities)}</strong>.
                      </p>
                      <p>
                        Sua liquidez em investimentos acumulada de <strong className="text-slate-800 dark:text-white font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(investmentsTotal)}</strong> assegura estabilidade substancial frente ao saldo devedor consolidado.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: 2. AUTO-SUSTENTO (ICD) */}
            {activeTab === 'sust' && (
              <div className="backdrop-blur-md bg-white border border-slate-100 dark:bg-brand-950/30 dark:border-slate-800 p-8 rounded-[32px] shadow-sm space-y-6">
                <div className="flex justify-between items-center border-b border-slate-50 dark:border-slate-800 pb-4">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                      <Award size={18} className="text-brand-600" />
                      Índice de Cobertura de Passivos (ICD)
                    </h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Sustentabilidade passiva da sua carteira</p>
                  </div>
                  <span className={`text-[10px] font-black px-3 py-1.5 rounded-full border ${getZoneColor(coverageResult.zone)}`}>
                    {getZoneLabel(coverageResult.zone, 'ICD')}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500 dark:text-slate-300 font-medium leading-relaxed">
                      O <strong>Índice ICD</strong> mede o grau de blindagem da sua carteira de alavancagem. Ele indica em que percentual as suas parcelas de financiamento ou consórcio se pagam sozinhas através do rendimento líquido projetado dos seus investimentos mais rendas de aluguel.
                    </p>
                    <div className="bg-slate-50 dark:bg-brand-900/20 p-5 rounded-2xl space-y-3 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                      <div className="flex justify-between">
                        <span>Rendimento mensal invest. ({((cdiRate * (isTaxExempt ? 1.0 : 0.85)) / 12).toFixed(3)}%):</span>
                        <span className="text-slate-900 dark:text-white">+{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(investmentsTotal * assumedNetMonthlyYield)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Receitas recorrentes de aluguel:</span>
                        <span className="text-slate-900 dark:text-white">+{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(rentalIncome)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-2 text-[11px] text-brand-600 dark:text-brand-400">
                        <span>Total Renda Passiva Gerada:</span>
                        <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(coverageResult.passiveMonthlyIncome)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Parcelas de Dívida:</span>
                        <span className="text-slate-900 dark:text-white">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalMonthlyInstallments)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Circular/Visual ICD meter */}
                  <div className="flex flex-col items-center justify-center p-6 border border-slate-100 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-brand-950/20">
                    <div className="relative w-40 h-40 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="80" cy="80" r="70" className="stroke-slate-200 dark:stroke-brand-900/20" strokeWidth="12" fill="transparent" />
                        <circle 
                          cx="80" 
                          cy="80" 
                          r="70" 
                          className={coverageResult.zone === 'GREEN' ? 'stroke-emerald-500' : (coverageResult.zone === 'YELLOW' ? 'stroke-amber-500' : 'stroke-rose-500')} 
                          strokeWidth="12" 
                          fill="transparent" 
                          strokeDasharray={440}
                          strokeDashoffset={440 - (440 * Math.min(100, coverageResult.ratio)) / 100}
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center">
                        <span className="text-3xl font-black tracking-tight">{coverageResult.ratio.toFixed(0)}%</span>
                        <span className="text-[8px] font-black uppercase text-slate-400 mt-1">de Cobertura</span>
                      </div>
                    </div>
                    {coverageResult.ratio >= 100 ? (
                      <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full mt-4">
                        Patrimônio 100% Autossuficiente!
                      </p>
                    ) : (
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mt-4 text-center">
                        Necessita de <strong className="text-slate-800 dark:text-white">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.max(0, totalMonthlyInstallments - coverageResult.passiveMonthlyIncome))}</strong> de renda ativa para cobrir parcelas.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: 3. AMORTIZE VS INVEST */}
            {activeTab === 'amortize' && (
              <div className="backdrop-blur-md bg-white border border-slate-100 dark:bg-brand-950/30 dark:border-slate-800 p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <RefreshCw size={18} className="text-brand-600 animate-spin-slow" />
                    Simulador Sandbox: Amortizar vs. Investir
                  </h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Decisão inteligente de alocação de liquidez</p>
                </div>

                {liabilitiesList.length === 0 ? (
                  <div className="py-20 text-center">
                    <AlertTriangle className="text-amber-500 mx-auto mb-3" />
                    <p className="text-xs font-black uppercase text-slate-400">Nenhum passivo cadastrado para simular amortização.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Controls */}
                    <div className="space-y-5">
                      {/* Select target liability */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Escolher o Financiamento/Consórcio</label>
                        <select 
                          value={selectedDebtId}
                          onChange={e => setSelectedDebtId(e.target.value)}
                          className="w-full bg-slate-50 border-none dark:bg-brand-900/30 rounded-xl text-xs font-black p-3 outline-none focus:ring-2 focus:ring-brand-500 text-slate-850 dark:text-white cursor-pointer"
                        >
                          {liabilitiesList.map(d => (
                            <option key={d.id} value={d.id}>
                              {d.name} (Saldo: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(d.outstandingBalance)})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Extra amortisation value slider / input */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          <span>Montante Extra para Amortização (R$)</span>
                          <span className="text-brand-600 dark:text-brand-400">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(extraAmortizationVal)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="2000"
                          max={Math.min(200000, selectedDebt?.outstandingBalance || 100000)}
                          step="1000"
                          value={extraAmortizationVal}
                          onChange={e => setExtraAmortizationVal(Number(e.target.value))}
                          className="w-full h-1.5 bg-slate-100 dark:bg-brand-800 rounded-lg appearance-none cursor-pointer accent-brand-600"
                        />
                        <div className="relative mt-2">
                          <DollarSign size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                          <input
                            type="number"
                            value={extraAmortizationVal}
                            onChange={e => setExtraAmortizationVal(Math.max(0, Math.min(selectedDebt?.outstandingBalance || 900000, Number(e.target.value))))}
                            className="w-40 bg-slate-50 border-none dark:bg-brand-900/30 rounded-xl text-[10px] font-black p-2.5 pl-7 outline-none focus:ring-1 focus:ring-brand-500 text-slate-800 dark:text-white"
                          />
                        </div>
                      </div>

                      {/* Details of chosen contract */}
                      {selectedDebt && (
                        <div className="p-4 bg-slate-50 dark:bg-brand-900/20 rounded-2xl text-[9px] font-black uppercase text-slate-400 tracking-wider space-y-2">
                          <div className="flex justify-between">
                            <span>CET Anual Atual:</span>
                            <span className="text-slate-800 dark:text-white">{(selectedDebt.annualCET * 100).toFixed(2)}% a.a</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Prazo Original Posição:</span>
                            <span className="text-slate-800 dark:text-white">{selectedDebt.remainingMonths} meses</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Sistema de Amortização:</span>
                            <span className="text-slate-800 dark:text-white">{selectedDebt.financingSystem}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Results / Recommendation */}
                    {amortizeResult && (
                      <div className="flex flex-col justify-between p-6 border border-slate-100 dark:border-slate-850 rounded-3xl bg-slate-50/50 dark:bg-brand-950/20">
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Veredito Financeiro Recomendado:</p>
                          <div className="mt-3 flex items-center gap-3">
                            <span className={`text-sm font-black px-4 py-2 rounded-xl border uppercase tracking-widest ${getZoneColor(amortizeResult.zone)}`}>
                              Recomendado: {amortizeResult.winner}
                            </span>
                          </div>

                          <div className="mt-5 space-y-3 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                            <p className="flex justify-between">
                              <span>Redução de Prazo Projetada:</span>
                              <span className="text-slate-800 dark:text-white">De {selectedDebt?.remainingMonths} para {amortizeResult.remainingMonthsAfterAmortization} meses</span>
                            </p>
                            <p className="flex justify-between">
                              <span>Parcelas antecipadas:</span>
                              <span className="text-emerald-600 font-bold">{ (selectedDebt?.remainingMonths || 0) - amortizeResult.remainingMonthsAfterAmortization } meses economizados</span>
                            </p>
                            <p className="flex justify-between">
                              <span>Juros evitados diretamente:</span>
                              <span className="text-emerald-600 font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amortizeResult.directInterestSaved)}</span>
                            </p>
                            <p className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-2 text-[11px]">
                              <span>Vantagem Patrimonial no Prazo:</span>
                              <span className={amortizeResult.wealthDifferenceAtEnd > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.abs(amortizeResult.wealthDifferenceAtEnd))} 
                                {amortizeResult.wealthDifferenceAtEnd > 0 ? ' a mais ao Amortizar' : ' a mais ao Investir'}
                              </span>
                            </p>
                          </div>
                        </div>

                        <p className="text-[8px] font-bold text-slate-400 leading-normal mt-4 uppercase">
                          *A simulação utiliza o Modelo Profissional de Reinvestimento de Fluxo de Caixa no Prazo do Financiamento, considerando o Custo Efetivo Total (CET) versus o ganho composto de CDI líquido com IR regressivo incidente.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: 4. RESILIENCE (CASH RUNWAY) */}
            {activeTab === 'runway' && (
              <div className="backdrop-blur-md bg-white border border-slate-100 dark:bg-brand-950/30 dark:border-slate-800 p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Hourglass size={18} className="text-brand-600" />
                    Métrica de Resiliência: Reserva de Sobrevivência (Runway)
                  </h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Tempo de fôlego dos investimentos contra custos e dívidas</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500 dark:text-slate-300 font-medium leading-relaxed">
                      Caso sua fonte principal de receita (renda de trabalho ativo) seja interrompida hoje por tempo indeterminado, a **Reserva de Sobrevivência** indica por quantos meses sua liquidez financeira atual em investimentos é capaz de pagar todas as parcelas mensais de financiamentos/consórcios e cobrir seu custo de vida mínimo estimado.
                    </p>
                    
                    <div className="p-5 bg-slate-50 dark:bg-brand-900/20 rounded-2xl space-y-2 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                      <div className="flex justify-between">
                        <span>Investimentos em Liquidez:</span>
                        <span className="text-slate-900 dark:text-white">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(investmentsTotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Compromissos de Dívidas / Mês:</span>
                        <span className="text-slate-900 dark:text-white">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalMonthlyInstallments)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Despesas Fixas Mínimas / Mês:</span>
                        <span className="text-slate-900 dark:text-white">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(monthlyCostEstimate)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-2 text-[11px] text-brand-600 dark:text-brand-400">
                        <span>Saída de Caixa Total / Mês:</span>
                        <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalMonthlyInstallments + monthlyCostEstimate)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center p-6 border border-slate-100 dark:border-slate-850 rounded-3xl bg-slate-50/50 dark:bg-brand-950/20">
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Seu Fôlego Estimado</h5>
                    <span className="text-5xl font-black text-brand-600 dark:text-brand-400 tracking-tight">{cashRunwayMonths.toFixed(1)}</span>
                    <span className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-wider mt-2">Meses de Sobrevivência</span>
                    
                    <span className={`text-[9px] font-black px-3 py-1.5 rounded-full border mt-5 uppercase tracking-wide ${
                      cashRunwayMonths >= 12 
                        ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' 
                        : (cashRunwayMonths >= 6 ? 'text-amber-500 bg-amber-500/10 border-amber-500/20' : 'text-rose-500 bg-rose-500/10 border-rose-500/20')
                    }`}>
                      {getZoneLabel(cashRunwayMonths >= 12 ? 'GREEN' : (cashRunwayMonths >= 6 ? 'YELLOW' : 'RED'), 'RUNWAY')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: 5. SPREAD & CARRY (CUSTO DE OPORTUNIDADE) */}
            {activeTab === 'opportunity' && (
              <div className="backdrop-blur-md bg-white border border-slate-100 dark:bg-brand-950/30 dark:border-slate-800 p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Percent size={18} className="text-brand-600" />
                    Custo de Oportunidade Ponderado (Spread de Carry)
                  </h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Dívidas baratas vs. Investimentos rentáveis</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500 dark:text-slate-300 font-medium leading-relaxed">
                      O **Spread de Carry** avalia a eficiência de arbitragem patrimonial de toda a sua carteira. Se a taxa de rendimento líquido de seus investimentos for superior ao **Custo Médio Ponderado da sua Dívida (WACD)**, você possui um *Carry Positivo* (alavancagem agregando valor). Caso contrário, seu *Carry é Negativo* (você perde patrimônio ao manter capital investido em vez de quitar as dívidas).
                    </p>

                    <div className="p-5 bg-slate-50 dark:bg-brand-900/20 rounded-2xl space-y-2 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                      <div className="flex justify-between">
                        <span>Rendimento Ponderado Líquido (Invest.):</span>
                        <span className="text-slate-900 dark:text-white">{(cdiRate * (isTaxExempt ? 1.0 : 0.85)).toFixed(2)}% a.a</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-200 dark:border-slate-850 pb-2">
                        <span>Custo Médio de Dívida (WACD):</span>
                        <span className="text-slate-900 dark:text-white">{wacd.toFixed(2)}% a.a</span>
                      </div>
                      <div className="flex justify-between pt-1 text-[11px] text-brand-600 dark:text-brand-400 font-black">
                        <span>Spread de Carry Patrimonial:</span>
                        <span className={carrySpread >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                          {carrySpread >= 0 ? '+' : ''}{carrySpread.toFixed(2)}% a.a
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 border border-slate-100 dark:border-slate-850 rounded-3xl bg-slate-50/50 dark:bg-brand-950/20 flex flex-col justify-between min-h-[220px]">
                    <div>
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avaliação de Carry</h5>
                      <h3 className={`text-2xl font-black mt-2 tracking-tight ${carrySpread >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {carrySpread >= 0 ? 'Carry Patrimonial Positivo' : 'Carry Patrimonial Negativo'}
                      </h3>
                      <p className="text-[9.5px] text-slate-500 dark:text-slate-400 leading-normal mt-3 uppercase font-medium">
                        {carrySpread >= 0 
                          ? 'Sua alavancagem está bem estruturada. O retorno líquido gerado em investimentos supera o custo médio das suas dívidas. Matematicamente, manter o capital investido é eficiente.'
                          : 'Alerta de desperdício patrimonial. Suas taxas de dívida custam mais do que seus investimentos rendem líquidos. Planners financeiros recomendam quitar os passivos de maior taxa com urgência.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 mt-4 text-[9px] font-black uppercase text-slate-400">
                      <Info size={14} className="text-brand-600" />
                      <span>Custo da dívida baseado no CET anual.</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: 6. EFFICIENCY (SAC vs Price Equity Build-up) */}
            {activeTab === 'efficiency' && (
              <div className="backdrop-blur-md bg-white border border-slate-100 dark:bg-brand-950/30 dark:border-slate-800 p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Layers size={18} className="text-brand-600" />
                    Amortização Inteligente (Eficiência SAC vs. Price)
                  </h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Como suas parcelas constroem patrimônio líquido</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500 dark:text-slate-300 font-medium leading-relaxed">
                      Sempre que paga uma parcela de financiamento, você não está gerando apenas uma despesa. Uma fração da parcela quita o saldo devedor principal, convertendo-se em **Patrimônio Líquido Real (Equity Build-up)**. A outra fração paga os juros contratuais, tarifas e seguros (Custo Financeiro Desperdiçado).
                    </p>
                    
                    <div className="p-5 bg-slate-50 dark:bg-brand-900/20 rounded-2xl space-y-3 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                      <p className="text-slate-900 dark:text-white font-bold mb-1">Cenário SAC (Sistema de Amortização Constante):</p>
                      <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-normal uppercase">
                        A amortização é fixa e os juros caem todo mês. Suas primeiras parcelas são as mais caras, mas a eficiência aumenta constantemente a cada mês que passa.
                      </p>
                      <p className="text-slate-900 dark:text-white font-bold mt-3 mb-1">Cenário Price (Parcelas Constantes):</p>
                      <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-normal uppercase">
                        As parcelas são idênticas. Contudo, nas primeiras parcelas, **quase 80% do valor pago é composto puramente de juros** (baixa eficiência patrimonial). A eficiência real ocorre apenas do meio para o fim do contrato.
                      </p>
                    </div>
                  </div>

                  {/* Active debts breakdown */}
                  <div className="space-y-4">
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Eficiência dos seus Passivos Atuais</h5>
                    
                    {liabilitiesList.length === 0 ? (
                      <p className="text-xs font-black uppercase text-slate-400 text-center py-10">Sem passivos ativos cadastrados.</p>
                    ) : (
                      <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                        {liabilitiesList.map(debt => {
                          const i_d_monthly = Math.pow(1 + debt.annualCET, 1 / 12) - 1;
                          const monthlyInterestCost = debt.outstandingBalance * i_d_monthly;
                          const monthlyPrincipalAmortization = Math.max(0, debt.installmentAmount - monthlyInterestCost);
                          const efficiencyRatio = debt.installmentAmount > 0 
                            ? (monthlyPrincipalAmortization / debt.installmentAmount) * 100 
                            : 0;

                          return (
                            <div key={debt.id} className="p-4 border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/30 dark:bg-brand-900/10 space-y-2">
                              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                <span>{debt.name}</span>
                                <span className={efficiencyRatio >= 50 ? 'text-emerald-500' : 'text-amber-500'}>
                                  Eficiência: {efficiencyRatio.toFixed(0)}%
                                </span>
                              </div>
                              {/* ProgressBar */}
                              <div className="w-full h-2 bg-slate-100 dark:bg-brand-900/50 rounded-full overflow-hidden flex">
                                <div className="h-full bg-emerald-500" style={{ width: `${efficiencyRatio}%` }} title="Patrimônio Realizado" />
                                <div className="h-full bg-rose-500/40" style={{ width: `${100 - efficiencyRatio}%` }} title="Juros/Custos Desperdiçados" />
                              </div>
                              <div className="flex justify-between text-[8px] font-black uppercase text-slate-400 tracking-wider">
                                <span>Principal: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(monthlyPrincipalAmortization)}/mês</span>
                                <span>Juros: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(monthlyInterestCost)}/mês</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: 7. PROSPECTIVE NEW PROJECTS */}
            {activeTab === 'new_projects' && (
              <div className="backdrop-blur-md bg-white border border-slate-100 dark:bg-brand-950/30 dark:border-slate-800 p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <PlusCircle size={18} className="text-brand-600" />
                    Simulador: Capacidade de Novos Projetos (Alavancagem Saudável)
                  </h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Estresse orçamentário antes de assumir novos consórcios/financiamentos</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Inputs */}
                  <div className="space-y-4">
                    {/* Safe limit message */}
                    <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl text-[9.5px] font-black uppercase text-indigo-900 tracking-wide leading-relaxed">
                      Sua margem de segurança recomendada (30% de renda líquida):
                      <br />
                      Margem Máxima de Parcelas: <strong className="text-brand-600 text-sm font-black mt-1 block">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(netMonthlyCashInflow * 0.30)}
                      </strong>
                      Margem Disponível Saudável: <strong className={Math.max(0, (netMonthlyCashInflow * 0.30) - totalMonthlyInstallments) > 0 ? 'text-emerald-600 text-sm font-black block mt-1' : 'text-rose-600 text-sm font-black block mt-1'}>
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.max(0, (netMonthlyCashInflow * 0.30) - totalMonthlyInstallments))}
                      </strong>
                    </div>

                    {/* New Project Value Input */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Valor do Bem/Carta de Crédito (R$)</label>
                      <input
                        type="number"
                        value={newProjectValue}
                        onChange={e => setNewProjectValue(Math.max(0, Number(e.target.value)))}
                        className="w-full bg-slate-50 border-none dark:bg-brand-900/30 rounded-xl text-xs font-black p-3 outline-none focus:ring-2 focus:ring-brand-500 text-slate-800 dark:text-white"
                      />
                    </div>

                    {/* Term select */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Prazo (Meses)</label>
                        <input
                          type="number"
                          value={newProjectMonths}
                          onChange={e => setNewProjectMonths(Math.max(1, Number(e.target.value)))}
                          className="w-full bg-slate-50 border-none dark:bg-brand-900/30 rounded-xl text-xs font-black p-3 outline-none focus:ring-2 focus:ring-brand-500 text-slate-800 dark:text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Taxa Juros/Adm (e.g. 11.5%)</label>
                        <input
                          type="number"
                          value={newProjectRate}
                          onChange={e => setNewProjectRate(Math.max(0, Number(e.target.value)))}
                          className="w-full bg-slate-50 border-none dark:bg-brand-900/30 rounded-xl text-xs font-black p-3 outline-none focus:ring-2 focus:ring-brand-500 text-slate-800 dark:text-white"
                        />
                      </div>
                    </div>

                    {/* Type Choice */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Modalidade do Crédito</label>
                      <div className="grid grid-cols-3 gap-2">
                        <button 
                          onClick={() => setNewProjectType('financing_sac')} 
                          className={`p-3 border rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${newProjectType === 'financing_sac' ? 'bg-brand-900 text-white border-brand-900' : 'bg-slate-50 text-slate-400 border-transparent hover:bg-slate-100'}`}
                        >
                          Financ. SAC
                        </button>
                        <button 
                          onClick={() => setNewProjectType('financing_price')} 
                          className={`p-3 border rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${newProjectType === 'financing_price' ? 'bg-brand-900 text-white border-brand-900' : 'bg-slate-50 text-slate-400 border-transparent hover:bg-slate-100'}`}
                        >
                          Financ. Price
                        </button>
                        <button 
                          onClick={() => setNewProjectType('consortium')} 
                          className={`p-3 border rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${newProjectType === 'consortium' ? 'bg-brand-900 text-white border-brand-900' : 'bg-slate-50 text-slate-400 border-transparent hover:bg-slate-100'}`}
                        >
                          Consórcio
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Results Screen */}
                  <div className="p-6 border border-slate-100 dark:border-slate-850 rounded-3xl bg-slate-50/50 dark:bg-brand-950/20 flex flex-col justify-between min-h-[300px]">
                    <div>
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estresse Orçamentário Projetado</h5>
                      <div className="mt-4 space-y-3 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                        <p className="flex justify-between">
                          <span>Nova Parcela Estimada:</span>
                          <span className="text-slate-800 dark:text-white">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(newProjectInstallment)}</span>
                        </p>
                        <p className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-2 text-[11px] text-slate-900 dark:text-white">
                          <span>Nova Despesa Mensal de Dívida:</span>
                          <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(prospectiveTotalInstallments)}</span>
                        </p>
                        <p className="flex justify-between">
                          <span>Comprometimento Renda Projetado:</span>
                          <span className={prospectiveIncomeResult.ratio > 30 ? 'text-rose-600 font-bold' : (prospectiveIncomeResult.ratio > 20 ? 'text-amber-500 font-bold' : 'text-emerald-500 font-bold')}>
                            {prospectiveIncomeResult.ratio.toFixed(1)}%
                          </span>
                        </p>
                      </div>

                      <div className="mt-6">
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-wide">Status de Risco Orçamentário:</p>
                        <span className={`text-[10px] font-black px-4 py-2 rounded-xl border uppercase tracking-widest inline-block mt-2 ${getZoneColor(prospectiveIncomeResult.zone)}`}>
                          Classificação: {prospectiveIncomeResult.zone === 'RED' ? 'Crítico / Inviável' : (prospectiveIncomeResult.zone === 'YELLOW' ? 'Moderado / Limite' : 'Seguro / Saudável')}
                        </span>
                      </div>
                    </div>

                    <p className="text-[8.5px] font-bold text-slate-400 leading-normal uppercase">
                      {prospectiveIncomeResult.zone === 'RED' 
                        ? 'Alerta crítico. A adição dessa nova parcela comprometerá mais do que 30% da sua renda familiar disponível, elevando drasticamente o risco de insolvência de caixa.'
                        : (prospectiveIncomeResult.zone === 'YELLOW' 
                            ? 'Atenção. O projeto cabe no orçamento, porém você ficará no limite recomendado pelas instituições bancárias. Reduz a capacidade de poupar.'
                            : 'Projeto altamente viável. Seu fluxo de caixa mensal é robusto o suficiente para comportar o novo passivo de forma extremamente tranquila.')}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Studies;
