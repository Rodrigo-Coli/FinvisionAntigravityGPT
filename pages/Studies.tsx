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

export const ensureInvestmentCategoriesAndSubcategories = async (userId: string) => {
  if (!supabase) return;
  try {
    // 1. Handle EXPENSE category
    const { data: expCat } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', userId)
      .eq('name', 'Investimento')
      .eq('type', 'EXPENSE')
      .eq('is_archived', false)
      .maybeSingle();

    let expCatId = expCat?.id;
    if (!expCatId) {
      const { data: newExpCat, error } = await supabase
        .from('categories')
        .insert({
          user_id: userId,
          name: 'Investimento',
          type: 'EXPENSE',
          color: 'bg-brand-50 text-brand-600',
          is_archived: false
        })
        .select('id')
        .single();
      if (!error && newExpCat) {
        expCatId = newExpCat.id;
      }
    }

    if (expCatId) {
      // Ensure "Aplicações" subcategory exists under EXPENSE Investimento
      const { data: sub1 } = await supabase
        .from('subcategories')
        .select('id')
        .eq('user_id', userId)
        .eq('category_id', expCatId)
        .eq('name', 'Aplicações')
        .maybeSingle();

      if (!sub1?.id) {
        await supabase.from('subcategories').insert({
          user_id: userId,
          category_id: expCatId,
          name: 'Aplicações'
        });
      }
    }

    // 2. Handle INCOME category
    const { data: incCat } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', userId)
      .eq('name', 'Investimento')
      .eq('type', 'INCOME')
      .eq('is_archived', false)
      .maybeSingle();

    let incCatId = incCat?.id;
    if (!incCatId) {
      const { data: newIncCat, error } = await supabase
        .from('categories')
        .insert({
          user_id: userId,
          name: 'Investimento',
          type: 'INCOME',
          color: 'bg-brand-50 text-brand-600',
          is_archived: false
        })
        .select('id')
        .single();
      if (!error && newIncCat) {
        incCatId = newIncCat.id;
      }
    }

    if (incCatId) {
      // Ensure "Resgate de Capital", "Juros Recebidos", "Juros Acumulados" exist
      const subcategoriesToEnsure = ['Resgate de Capital', 'Juros Recebidos', 'Juros Acumulados'];
      for (const subName of subcategoriesToEnsure) {
        const { data: sub } = await supabase
          .from('subcategories')
          .select('id')
          .eq('user_id', userId)
          .eq('category_id', incCatId)
          .eq('name', subName)
          .maybeSingle();

        if (!sub?.id) {
          await supabase.from('subcategories').insert({
            user_id: userId,
            category_id: incCatId,
            name: subName
          });
        }
      }
    }
  } catch (err) {
    console.error('Error ensuring investment categories/subcategories:', err);
  }
};

export interface InvestmentProject {
  name: string;
  totalAportado: number;
  totalRecuperado: number;
  saldoRestante: number;
  lucroRecebido: number;
  transactionsCount: number;
  lastTxDate: string;
  progressPercent: number;
  status: 'APORTANDO' | 'RECUPERANDO' | 'RECUPERADO';
}

const Studies: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'summary' | 'monthly_projection' | 'sust' | 'amortize' | 'runway' | 'opportunity' | 'efficiency' | 'new_projects'>('summary');
  
  // Data State loaded from Supabase
  const [isLoading, setIsLoading] = useState(true);
  const [investmentsTotal, setInvestmentsTotal] = useState(0);
  const [physicalAssetsTotal, setPhysicalAssetsTotal] = useState(0);
  const [liabilitiesList, setLiabilitiesList] = useState<DebtDetails[]>([]);
  const [activeIncome, setActiveIncome] = useState(12000); // Renda Líquida Mensal padrão
  const [rentalIncome, setRentalIncome] = useState(0);     // Aluguéis recebidos padrão
  const [investmentPayout, setInvestmentPayout] = useState(0); // Rendimentos que caem na conta padrão
  const [accumulatedInterest, setAccumulatedInterest] = useState(0); // Rendimentos acumulados na aplicação padrão
  const [projectionDuration, setProjectionDuration] = useState(60); // Prazo de simulação padrão (meses)
  const [safeCommitmentLimit, setSafeCommitmentLimit] = useState(30); // Limite estratégico de comprometimento orçamentário (%)
  const [investmentProjects, setInvestmentProjects] = useState<InvestmentProject[]>([]);
  
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

      // Auto-provision dynamic investment categories & subcategories
      await ensureInvestmentCategoriesAndSubcategories(user.id);

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

      // 4. Estimar receitas baseadas nas transações do mês calendário atual (evitando inflar com parcelas futuras agendadas)
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      const { data: transactionsData } = await supabase
        .from('transactions')
        .select('amount, category, subcategory, description, date')
        .eq('user_id', user.id)
        .eq('type', 'INCOME')
        .eq('is_deleted', false)
        .gte('date', startOfMonth.toISOString().split('T')[0])
        .lte('date', endOfMonth.toISOString().split('T')[0]);

      let currentMonthTransactions = transactionsData || [];
      if (currentMonthTransactions.length === 0) {
        // Fallback: carregar os últimos 30 dias de receitas
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { data: fallbackData } = await supabase
          .from('transactions')
          .select('amount, category, subcategory, description, date')
          .eq('user_id', user.id)
          .eq('type', 'INCOME')
          .eq('is_deleted', false)
          .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
          .lte('date', today.toISOString().split('T')[0]);
        currentMonthTransactions = fallbackData || [];
      }

      if (currentMonthTransactions.length > 0) {
        // Estimar salários/consultoria, aluguéis e juros recebidos
        const activeCategories = ['salario', 'prestacao', 'receita', 'pro-labore', 'servico', 'pró-labore', 'mensal'];
        const rentCategories = ['aluguel', 'locacao', 'rendimento imobiliario', 'imobiliario'];
        const interestCategories = ['juros', 'dividendo', 'provento', 'rendimento financeiro', 'rendimento de aplicação', 'rendimento', 'rentabilidade'];
        
        let sumActive = 0;
        let sumRent = 0;
        let sumInterest = 0;
        let sumAccumulatedInterest = 0;

        for (const tx of currentMonthTransactions) {
          const categoryLower = (tx.category || '').toLowerCase();
          const subcategoryLower = (tx.subcategory || '').toLowerCase();
          const descLower = (tx.description || '').toLowerCase();
          
          // A. IGNORAR Ajustes de Saldo, Saldos Iniciais, Correções e Reconciliações (não contam como renda real)
          const isAdjustment = [
            'ajuste', 'saldo', 'correção', 'inicial', 'sincronização', 'fechamento', 'reconcile'
          ].some(c => categoryLower.includes(c) || subcategoryLower.includes(c) || descLower.includes(c));
          if (isAdjustment) continue;

          // B. IGNORAR Resgates e Transferências de Capital de Investimento Principal (não contam como renda real)
          const isResgate = [
            'resgate de capital', 'resgate', 'aplicações', 'aplicacoes', 'aplicação', 'aplicacao', 'investir', 'compra de ativo', 'venda de ativo'
          ].some(c => descLower.includes(c) || subcategoryLower.includes(c));
          if (isResgate) continue;

          // C. CLASSIFICAR como Aluguel
          const isRent = rentCategories.some(c => categoryLower.includes(c) || subcategoryLower.includes(c) || descLower.includes(c));
          if (isRent) {
            sumRent += Number(tx.amount || 0);
            continue;
          }

          // D. CLASSIFICAR Categoria Investimento
          if (categoryLower === 'investimento') {
            // Verificar se são juros que caem de fato na conta (Juros Recebidos / Dividendos)
            const isInterestPayout = [
              'juros recebidos', 'juros recebido', 'dividendo', 'provento', 'rendimento recebido', 
              'caiu na conta', 'cai na conta', 'juros s/ativo', 'juros s/ ativo', 'rentabilidade'
            ].some(c => subcategoryLower.includes(c) || descLower.includes(c)) || 
            (interestCategories.some(c => subcategoryLower.includes(c) || descLower.includes(c)) && 
             !['acumulado', 'reinvestido', 'acumulados', 'vencimento'].some(c => subcategoryLower.includes(c) || descLower.includes(c)));

            // Verificar se são juros acumulados (não caem na conta, apenas acompanhamento)
            const isInterestAccumulated = [
              'juros acumulados', 'juros acumulado', 'acumulado', 'acumulados', 'reinvestido', 
              'reinvestidos', 'no final', 'vencimento', 'rendimento acumulado'
            ].some(c => subcategoryLower.includes(c) || descLower.includes(c));

            if (isInterestPayout) {
              sumInterest += Number(tx.amount || 0);
            } else if (isInterestAccumulated) {
              sumAccumulatedInterest += Number(tx.amount || 0);
            } else {
              // Por padrão, se for uma receita sob Investimento que não seja Explicitamente Payout ou Acumulado, tratar como acumulado
              sumAccumulatedInterest += Number(tx.amount || 0);
            }
            continue;
          }

          // E. CLASSIFICAR Outras Receitas
          const isInterest = interestCategories.some(c => categoryLower.includes(c) || subcategoryLower.includes(c) || descLower.includes(c));
          const isActive = activeCategories.some(c => categoryLower.includes(c) || subcategoryLower.includes(c) || descLower.includes(c));

          if (isInterest) {
            const isAccumulated = ['acumulado', 'reinvestido', 'acumulados', 'vencimento'].some(c => subcategoryLower.includes(c) || descLower.includes(c));
            if (isAccumulated) {
              sumAccumulatedInterest += Number(tx.amount || 0);
            } else {
              sumInterest += Number(tx.amount || 0);
            }
          } else if (isActive) {
            sumActive += Number(tx.amount || 0);
          } else {
            // Fallback regular active income
            sumActive += Number(tx.amount || 0);
          }
        }

        if (sumActive > 0) setActiveIncome(sumActive);
        else setActiveIncome(0);

        setRentalIncome(sumRent);
        setInvestmentPayout(sumInterest);
        setAccumulatedInterest(sumAccumulatedInterest);
      }

      // 5. Fetch all historical transactions for the Investment Project Tracker
      const { data: historyData } = await supabase
        .from('transactions')
        .select('id, amount, category, subcategory, description, date, type')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .or('category.ilike.investimento,subcategory.ilike.%aplicações%,subcategory.ilike.%aplicacoes%,subcategory.ilike.%resgate%,subcategory.ilike.%juros%,description.ilike.%q3%,description.ilike.%lion%')
        .order('date', { ascending: true });

      const rawHistory = historyData || [];
      const projectsMap: { [key: string]: { aportado: number; recuperado: number; lucro: number; count: number; lastDate: string } } = {};

      const getProjectName = (desc: string, subcat: string): string => {
        const d = desc.trim().toLowerCase();
        if (d.includes('q3')) return 'Q3';
        if (d.includes('lion')) return 'Lion';
        
        // Clean description to get a base project name
        let clean = desc.split(/[-–—,]/)[0].trim();
        clean = clean.replace(/\d+\/\d+/g, '')
                     .replace(/\b(parc|parcela|ap|aporte|resgate|retorno|lucro|juros|compra|venda|pgto|pagamento|investimento|aplicação|aplicacao)\b/gi, '')
                     .trim();
        
        if (!clean || clean.length < 2) {
          return subcat || desc || 'Outro Investimento';
        }
        return clean;
      };

      for (const tx of rawHistory) {
        const amount = Number(tx.amount || 0);
        const desc = tx.description || '';
        const subcat = tx.subcategory || '';
        const type = tx.type || 'EXPENSE';
        const date = tx.date || '';

        const projName = getProjectName(desc, subcat);

        if (!projectsMap[projName]) {
          projectsMap[projName] = { aportado: 0, recuperado: 0, lucro: 0, count: 0, lastDate: date };
        }

        const proj = projectsMap[projName];
        proj.count++;
        if (date > proj.lastDate) proj.lastDate = date;

        const subcatLower = subcat.toLowerCase();
        const descLower = desc.toLowerCase();

        // Check if the transaction represents an outflow (Contribution / Aporte)
        const isAporte = type === 'EXPENSE' || subcatLower.includes('aplicações') || subcatLower.includes('aplicacoes');
        // Check if it represents principal return (Resgate)
        const isResgate = type === 'INCOME' && (subcatLower.includes('resgate') || descLower.includes('resgate'));
        // Check if it represents profit (Lucro / Juros)
        const isLucro = type === 'INCOME' && (subcatLower.includes('juros recebidos') || subcatLower.includes('lucro') || descLower.includes('lucro') || descLower.includes('juros recebido'));

        if (isAporte) {
          proj.aportado += amount;
        } else if (isResgate) {
          proj.recuperado += amount;
        } else if (isLucro) {
          proj.lucro += amount;
        } else if (type === 'INCOME') {
          // Fallback logic if subcategory isn't explicitly set yet
          const isFuzzyLucro = ['lucro', 'rendimento', 'juros', 'ganho', 'retorno'].some(k => descLower.includes(k));
          if (isFuzzyLucro) {
            proj.lucro += amount;
          } else {
            const remainingToRecover = Math.max(0, proj.aportado - proj.recuperado);
            if (amount <= remainingToRecover) {
              proj.recuperado += amount;
            } else {
              proj.recuperado += remainingToRecover;
              proj.lucro += (amount - remainingToRecover);
            }
          }
        }
      }

      const mappedProjects: InvestmentProject[] = Object.entries(projectsMap)
        .map(([name, data]) => {
          const progressPercent = data.aportado > 0 
            ? Math.min(100, (data.recuperado / data.aportado) * 100) 
            : 0;

          let status: 'APORTANDO' | 'RECUPERANDO' | 'RECUPERADO' = 'APORTANDO';
          if (data.aportado > 0) {
            if (data.recuperado >= data.aportado) {
              status = 'RECUPERADO';
            } else if (data.recuperado > 0) {
              status = 'RECUPERANDO';
            }
          }

          return {
            name,
            totalAportado: data.aportado,
            totalRecuperado: data.recuperado,
            saldoRestante: Math.max(0, data.aportado - data.recuperado),
            lucroRecebido: data.lucro,
            transactionsCount: data.count,
            lastTxDate: data.lastDate,
            progressPercent,
            status
          };
        })
        .filter(p => p.totalAportado > 0 || p.totalRecuperado > 0);

      setInvestmentProjects(mappedProjects);

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
  const netMonthlyCashInflow = activeIncome + rentalIncome + investmentPayout;

  // Assumed Net Monthly Yield Rate
  const assumedNetMonthlyYield = isTaxExempt 
    ? Math.pow(1 + (cdiRate / 100), 1 / 12) - 1 
    : Math.pow(1 + ((cdiRate * 0.85) / 100), 1 / 12) - 1; // 15% IR avg standard

  // Dynamic zone calculator based on strategic target limit
  const getDynamicZone = (ratio: number, limit: number): 'GREEN' | 'YELLOW' | 'RED' => {
    if (ratio > limit) return 'RED';
    if (ratio > limit * 0.66) return 'YELLOW'; // yellow zone is from 2/3 of limit up to the limit
    return 'GREEN';
  };

  // Puxar dados calculados pelo Engine e ajustar zonas dinamicamente
  const incomeResult = React.useMemo(() => {
    const ratio = netMonthlyCashInflow > 0 
      ? (totalMonthlyInstallments / netMonthlyCashInflow) * 100 
      : 0;
    const zone = getDynamicZone(ratio, safeCommitmentLimit);
    return {
      ratio,
      zone,
      availableCashForSavings: Math.max(0, netMonthlyCashInflow * 0.20)
    };
  }, [netMonthlyCashInflow, totalMonthlyInstallments, safeCommitmentLimit]);

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
  const cashRunwayMonths = (totalMonthlyInstallments + monthlyCostEstimate) > 0 
    ? investmentsTotal / (totalMonthlyInstallments + monthlyCostEstimate) 
    : 0;

  const monthlyProjectionData = React.useMemo(() => {
    const today = new Date();
    const result = [];

    for (let monthOffset = 1; monthOffset <= projectionDuration; monthOffset++) {
      const projDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
      const label = projDate.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');

      // Sum installments for active liabilities this month
      const activeInstallments = liabilitiesList.reduce((sum, d) => {
        if (d.remainingMonths >= monthOffset) {
          return sum + d.installmentAmount;
        }
        return sum;
      }, 0);

      // Projected remaining outstanding balance
      const projectedOutstandingBalance = liabilitiesList.reduce((sum, d) => {
        if (d.remainingMonths >= monthOffset) {
          // linear amortization estimate
          const remainingPct = (d.remainingMonths - monthOffset) / d.remainingMonths;
          return sum + (d.outstandingBalance * remainingPct);
        }
        return sum;
      }, 0);

      const totalRevenue = activeIncome + rentalIncome + investmentPayout;
      const commitmentRatio = totalRevenue > 0 ? (activeInstallments / totalRevenue) * 100 : 0;
      const debtToIncomeRatio = totalRevenue > 0 ? projectedOutstandingBalance / totalRevenue : 0;
      const freeInvest = Math.max(0, totalRevenue - activeInstallments);

      result.push({
        label,
        totalRevenue,
        activeInstallments,
        commitmentRatio,
        projectedOutstandingBalance,
        debtToIncomeRatio,
        freeInvest
      });
    }

    return result;
  }, [liabilitiesList, activeIncome, rentalIncome, investmentPayout, projectionDuration]);

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
  const prospectiveIncomeResult = React.useMemo(() => {
    const ratio = netMonthlyCashInflow > 0 
      ? (prospectiveTotalInstallments / netMonthlyCashInflow) * 100 
      : 0;
    const zone = getDynamicZone(ratio, safeCommitmentLimit);
    return {
      ratio,
      zone
    };
  }, [netMonthlyCashInflow, prospectiveTotalInstallments, safeCommitmentLimit]);

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
        
        {/* Sincronizado em tempo real status */}
        <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-350 bg-slate-50 dark:bg-brand-900/20 px-4 py-2.5 rounded-xl border border-slate-100/50 dark:border-slate-800/40 uppercase tracking-widest shadow-sm">
          <CheckCircle size={14} className="text-emerald-500" />
          <span>Sincronizado em tempo real</span>
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

              {/* Editable Investment Monthly Payout */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Juros Recebidos / Dividendos (R$)</label>
                <div className="relative">
                  <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    type="number"
                    value={investmentPayout}
                    onChange={e => setInvestmentPayout(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-slate-50 border-none dark:bg-brand-900/30 rounded-xl text-xs font-black p-3 pl-8 outline-none focus:ring-2 focus:ring-brand-500 text-slate-800 dark:text-white"
                  />
                </div>
                <span className="text-[8px] font-bold text-slate-300 block">Juros/dividendos mensais resgatados que aumentam sua capacidade de pagamento.</span>
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

              {/* Strategic Commitment Limit Slider */}
              <div className="space-y-2 pt-4 border-t border-slate-50 dark:border-slate-800">
                <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <span>Meta de Comprometimento</span>
                  <span className="text-brand-600 dark:text-brand-400">{safeCommitmentLimit}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="80"
                  step="5"
                  value={safeCommitmentLimit}
                  onChange={e => setSafeCommitmentLimit(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 dark:bg-brand-800 rounded-lg appearance-none cursor-pointer accent-brand-600"
                />
                
                {/* Dynamic Leverage Profile Explanation */}
                <div className="p-3 bg-slate-50 dark:bg-brand-900/10 rounded-xl space-y-1 shadow-inner">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Estratégia de Alavancagem:</span>
                  <span className="text-[10px] font-black uppercase text-brand-600 dark:text-brand-400 block">
                    {safeCommitmentLimit <= 30 ? '🛡️ Conservador' : 
                     safeCommitmentLimit <= 45 ? '⚖️ Moderado' : 
                     safeCommitmentLimit <= 60 ? '🔥 Agressivo' : 
                     '⚡ Especulativo'}
                  </span>
                  <p className="text-[8px] font-bold text-slate-500 dark:text-slate-400 leading-normal uppercase">
                    {safeCommitmentLimit <= 30 ? 'Alta margem de segurança. Foco em preservação de capital e proteção contra oscilações de renda ativa.' : 
                     safeCommitmentLimit <= 45 ? 'Uso planejado de alavancagem para aceleração patrimonial de forma controlada e sustentável.' : 
                     safeCommitmentLimit <= 60 ? 'Exposição de caixa relevante. Exige reservas financeiras expressivas ou renda passiva (ICD) para proteção.' : 
                     'Risco alto de insolvência. Comprometimento excessivo que esmaga a liquidez livre mensal.'}
                  </p>
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
                onClick={() => setActiveTab('monthly_projection')}
                className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${activeTab === 'monthly_projection' ? 'bg-brand-900 text-white border-brand-900' : 'bg-transparent text-slate-400 border-transparent hover:bg-slate-50'}`}
              >
                Capacidade Mensal
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
                  {/* KPI 1: Alavancagem Orçamentária Mensal */}
                  <div className={`backdrop-blur-md border rounded-[32px] p-6 shadow-xl transition-all duration-300 ${getZoneColor(incomeResult.zone)}`}>
                    <div className="flex justify-between items-start">
                      <Wallet size={20} />
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full border bg-white/20">FLUXO MENSAL</span>
                    </div>
                    <div className="mt-4">
                      <p className="text-[10px] font-black uppercase tracking-wider opacity-60">Alavancagem Orçamentária (% Renda)</p>
                      <h4 className="text-3xl font-black mt-1 tracking-tight">{incomeResult.ratio.toFixed(1)}%</h4>
                      <p className="text-[9px] font-bold mt-2 uppercase tracking-wide opacity-80">
                        {getZoneLabel(incomeResult.zone, 'CR')}
                      </p>
                    </div>
                  </div>

                  {/* KPI 2: Alavancagem Patrimonial Global */}
                  <div className={`backdrop-blur-md border rounded-[32px] p-6 shadow-xl transition-all duration-300 ${getZoneColor(leverageResult.globalLeverageZone)}`}>
                    <div className="flex justify-between items-start">
                      <Layers size={20} />
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full border bg-white/20">BALANÇO GLOBAL</span>
                    </div>
                    <div className="mt-4">
                      <p className="text-[10px] font-black uppercase tracking-wider opacity-60">Alavancagem Patrimonial Global</p>
                      <h4 className="text-3xl font-black mt-1 tracking-tight">{leverageResult.globalLeverage.toFixed(1)}%</h4>
                      <p className="text-[9px] font-bold mt-2 uppercase tracking-wide opacity-80">
                        {getZoneLabel(leverageResult.globalLeverageZone, 'LTV')}
                      </p>
                    </div>
                  </div>

                  {/* KPI 3: Autossuficiência (ICD) */}
                  <div className={`backdrop-blur-md border rounded-[32px] p-6 shadow-xl transition-all duration-300 ${getZoneColor(coverageResult.zone)}`}>
                    <div className="flex justify-between items-start">
                      <Award size={20} />
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full border bg-white/20">ICD</span>
                    </div>
                    <div className="mt-4">
                      <p className="text-[10px] font-black uppercase tracking-wider opacity-60">Autossuficiência de Dívidas (ICD)</p>
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
                    Diagnóstico de Alavancagem e Estrutura de Capitais
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs text-slate-500 dark:text-slate-300 font-medium">
                    <div className="space-y-4">
                      <h5 className="text-[10px] font-black uppercase text-brand-600 tracking-wider">1. Alavancagem Orçamentária (Fluxo Mensal)</h5>
                      <p>
                        Mede o quanto das suas receitas líquidas mensais é utilizado para o pagamento das parcelas de suas dívidas (utilização de caixa mês a mês). Atualmente, suas parcelas de <strong className="text-slate-800 dark:text-white font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalMonthlyInstallments)}</strong> consomem <strong className="text-slate-800 dark:text-white font-bold">{incomeResult.ratio.toFixed(1)}%</strong> da sua receita total recorrente de <strong className="text-slate-800 dark:text-white font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(netMonthlyCashInflow)}</strong>.
                      </p>
                      {incomeResult.ratio > safeCommitmentLimit ? (
                        <div className="p-4 bg-rose-50/50 border border-rose-100 rounded-2xl flex gap-3 text-rose-800">
                          <AlertTriangle className="shrink-0" size={16} />
                          <p className="text-[9px] font-bold leading-normal uppercase">
                            <strong>Atenção:</strong> Seu fluxo mensal ultrapassa a sua meta estratégica de {safeCommitmentLimit}% de comprometimento de receita. Evite novas parcelas imediatas.
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl flex gap-3 text-emerald-800">
                          <CheckCircle className="shrink-0" size={16} />
                          <p className="text-[9px] font-bold leading-normal uppercase">
                            <strong>Fluxo Saudável:</strong> O peso das parcelas mensais está sob controle da meta estratégica de {safeCommitmentLimit}%, mantendo mais de {100 - safeCommitmentLimit}% da sua receita livre para custos de vida e aportes.
                          </p>
                        </div>
                      )}
                    </div>
 
                    <div className="space-y-4">
                      <h5 className="text-[10px] font-black uppercase text-brand-600 tracking-wider">2. Alavancagem Patrimonial Global (Balanço LTV)</h5>
                      <p>
                        Mede a relação entre seu passivo total consolidado e seus ativos totais (Investimentos + Bens Físicos), indicando quanto de seu patrimônio de longo prazo está atrelado a terceiros. 
                      </p>
                      <p>
                        Seu saldo devedor total de <strong className="text-slate-800 dark:text-white font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalLiabilities)}</strong> representa <strong className="text-slate-800 dark:text-white font-bold">{(totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0).toFixed(1)}%</strong> do seu patrimônio total de <strong className="text-slate-800 dark:text-white font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAssets)}</strong>. Seu patrimônio líquido consolidado (limpo de dívidas) é de <strong className="text-slate-850 dark:text-white font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAssets - totalLiabilities)}</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: 2. CAPACIDADE MENSAL (FLUXO MÊS A MÊS) */}
            {activeTab === 'monthly_projection' && (
              <div className="backdrop-blur-md bg-white border border-slate-100 dark:bg-brand-950/30 dark:border-slate-800 p-8 rounded-[32px] shadow-sm space-y-8 animate-in fade-in duration-300">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Calendar size={18} className="text-brand-600" />
                    Simulador e Projeção de Capacidade Mensal Mês a Mês
                  </h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    Cronograma detalhado de liberação de caixa e amortização passiva de longo prazo
                  </p>
                </div>

                {/* Timeline Stats Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="p-5 border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-brand-900/10">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Receita Total Recorrente</span>
                    <span className="text-lg font-black text-slate-800 dark:text-white block mt-1">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(netMonthlyCashInflow)}
                    </span>
                  </div>
                  <div className="p-5 border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-brand-900/10">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Total de Parcelas Atuais</span>
                    <span className="text-lg font-black text-rose-500 block mt-1">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalMonthlyInstallments)}
                    </span>
                  </div>
                  <div className="p-5 border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-brand-900/10">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Comprometimento Real</span>
                    <span className={`text-lg font-black block mt-1 ${incomeResult.ratio > safeCommitmentLimit ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {incomeResult.ratio.toFixed(1)}%
                    </span>
                  </div>
                  <div className="p-5 border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-brand-900/10">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Sobra de Caixa Livre</span>
                    <span className="text-lg font-black text-brand-600 dark:text-brand-400 block mt-1">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.max(0, netMonthlyCashInflow - totalMonthlyInstallments))}
                    </span>
                  </div>
                </div>

                {/* Projection settings card */}
                <div className="p-6 border border-slate-100 dark:border-slate-800 rounded-3xl bg-slate-50/30 dark:bg-brand-900/5 space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Prazo de Projeção Temporal</span>
                      <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mt-1">Simule sua capacidade pelo tempo que você desejar (1 a 360 meses)</p>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <input 
                        type="range"
                        min="1"
                        max="360"
                        step="1"
                        value={projectionDuration}
                        onChange={e => setProjectionDuration(Number(e.target.value))}
                        className="w-full sm:w-48 h-1.5 bg-slate-200 dark:bg-brand-800 rounded-lg appearance-none cursor-pointer accent-brand-600"
                      />
                      <input 
                        type="number"
                        min="1"
                        max="360"
                        value={projectionDuration}
                        onChange={e => setProjectionDuration(Math.max(1, Math.min(360, Number(e.target.value))))}
                        className="w-16 bg-white dark:bg-brand-900 border border-slate-200 dark:border-slate-700 text-xs font-black p-1.5 text-center rounded-lg text-brand-600"
                      />
                      <span className="text-[10px] font-black text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 px-2 py-1 rounded-lg uppercase tracking-wider shrink-0">Meses</span>
                    </div>
                  </div>

                  {/* Informative Insight Alert */}
                  {liabilitiesList.length > 0 && (
                    <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100/30 dark:border-emerald-900/30 rounded-2xl text-[9px] font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-wider leading-relaxed flex items-center gap-2 shadow-sm">
                      <span>💡</span>
                      <p>
                        <strong>Insight de Quitação de Passivos:</strong>
                        {(() => {
                          const sortedByFinish = [...liabilitiesList].sort((a, b) => a.remainingMonths - b.remainingMonths);
                          const firstToFinish = sortedByFinish[0];
                          if (firstToFinish && firstToFinish.remainingMonths <= projectionDuration) {
                            return ` A dívida "${firstToFinish.name}" será totalmente quitada em ${firstToFinish.remainingMonths} meses, liberando automaticamente ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(firstToFinish.installmentAmount)} mensais adicionais no seu orçamento!`;
                          }
                          return " Acompanhe a linha do tempo abaixo para planejar a folga de fluxo de caixa conforme os financiamentos forem sendo quitados.";
                        })()}
                      </p>
                    </div>
                  )}
                </div>

                {/* Table Timeline */}
                <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-3xl bg-slate-50/30 dark:bg-brand-950/10">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100/70 dark:bg-brand-900/40 border-b border-slate-150/50 dark:border-slate-850 text-[9px] font-black uppercase text-slate-400 tracking-widest">
                        <th className="p-4 pl-6">Mês/Ano</th>
                        <th className="p-4">Receita Mensal</th>
                        <th className="p-4">Parcelas Totais</th>
                        <th className="p-4">Comprometimento</th>
                        <th className="p-4">Saldo Devedor Restante</th>
                        <th className="p-4">Dívida / Receita</th>
                        <th className="p-4">Caixa Livre (Aportes)</th>
                        <th className="p-4 pr-6">Status de Risco</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-xs font-semibold text-slate-700 dark:text-slate-350">
                      {monthlyProjectionData.map((month, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/40 dark:hover:bg-brand-900/10 transition-colors">
                          <td className="p-4 pl-6 font-bold text-slate-900 dark:text-white uppercase">{month.label}</td>
                          <td className="p-4 font-bold text-slate-800 dark:text-slate-200">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(month.totalRevenue)}</td>
                          <td className="p-4 font-bold text-slate-800 dark:text-slate-200">
                            {month.activeInstallments > 0 ? (
                              <span className="text-red-500 font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(month.activeInstallments)}</span>
                            ) : (
                              <span className="text-emerald-500 font-bold">R$ 0,00</span>
                            )}
                          </td>
                          <td className="p-4">
                            <span className={month.commitmentRatio > safeCommitmentLimit ? 'text-rose-600 font-black' : (month.commitmentRatio > safeCommitmentLimit * 0.66 ? 'text-amber-500 font-black' : 'text-emerald-500 font-black')}>
                              {month.commitmentRatio.toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-4 font-bold text-slate-800 dark:text-slate-200">
                            {month.projectedOutstandingBalance > 0 ? (
                              new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(month.projectedOutstandingBalance)
                            ) : (
                              <span className="text-emerald-500 font-bold">Quitado</span>
                            )}
                          </td>
                          <td className="p-4 font-bold text-slate-800 dark:text-slate-200">
                            {month.projectedOutstandingBalance > 0 ? (
                              <span className={month.debtToIncomeRatio > 12 ? 'text-rose-500 font-black' : (month.debtToIncomeRatio > 4 ? 'text-amber-500 font-black' : 'text-emerald-500 font-black')}>
                                {month.debtToIncomeRatio.toFixed(1)}x
                              </span>
                            ) : (
                              <span className="text-emerald-500 font-bold">0.0x</span>
                            )}
                          </td>
                          <td className="p-4 font-bold text-slate-850 dark:text-slate-100">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(month.freeInvest)}
                          </td>
                          <td className="p-4 pr-6">
                            <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border ${
                              month.commitmentRatio > safeCommitmentLimit 
                                ? 'text-rose-500 bg-rose-500/10 border-rose-500/20' 
                                : (month.commitmentRatio > safeCommitmentLimit * 0.66 
                                    ? 'text-amber-500 bg-amber-500/10 border-amber-500/20' 
                                    : 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20')
                            }`}>
                              {month.commitmentRatio > safeCommitmentLimit ? 'Inviável' : (month.commitmentRatio > safeCommitmentLimit * 0.66 ? 'Limite' : 'Excelente')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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

                {/* Separação de Investimentos explicativa */}
                <div className="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-4">
                  <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Como seus Juros e Rendimentos são Classificados</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[10px] uppercase font-black tracking-wider text-slate-400">
                    <div className="p-5 bg-slate-50 dark:bg-brand-900/20 border border-slate-100 dark:border-slate-800 rounded-2xl space-y-2">
                      <span className="text-emerald-500 block text-xs">Juros Recebidos / Dividendos (Caem na Conta)</span>
                      <p className="text-[9px] font-medium text-slate-500 normal-case leading-relaxed">
                        São os juros ou proventos pagos periodicamente (ex: cupons de renda fixa, dividendos de ações ou fundos imobiliários) que de fato caem na sua conta corrente. Eles aumentam a sua receita líquida mensal disponível e a sua capacidade de pagamento orçamentária.
                      </p>
                      <div className="pt-2 border-t border-slate-200/50 flex justify-between items-center text-slate-900 dark:text-white">
                        <span>Valor Mensal Estimado:</span>
                        <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(investmentPayout)}</span>
                      </div>
                    </div>
                    <div className="p-5 bg-slate-50 dark:bg-brand-900/20 border border-slate-100 dark:border-slate-800 rounded-2xl space-y-2">
                      <span className="text-brand-500 block text-xs">Juros Acumulados / Reinvestidos (Apenas Acompanhamento)</span>
                      <p className="text-[9px] font-medium text-slate-500 normal-case leading-relaxed">
                        São os rendimentos obtidos por juros compostos automáticos (ex: CDI acumulado de liquidez diária, títulos prefixados com resgate no vencimento). Estes juros não caem de fato mensalmente na conta corrente e continuam crescendo no saldo total de investimentos. **Eles não contam como receita e nem aumentam a capacidade mensal de pagamento, servindo apenas para acompanhamento patrimonial.**
                      </p>
                      <div className="pt-2 border-t border-slate-250 dark:border-slate-800 flex flex-col gap-1.5 text-slate-900 dark:text-white">
                        <div className="flex justify-between items-center">
                          <span>Estimativa Teórica (CDI Líquido):</span>
                          <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(investmentsTotal * assumedNetMonthlyYield)}</span>
                        </div>
                        <div className="flex justify-between items-center text-[9.5px] text-slate-400 dark:text-slate-500">
                          <span>Lançamentos Acumulados Reais (Mês Atual):</span>
                          <span className="font-bold text-slate-600 dark:text-slate-400">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(accumulatedInterest)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Acompanhamento de Projetos de Investimento (Capital a Recuperar) */}
                <div className="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-4">
                  <div>
                    <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">📊 Acompanhamento de Projetos de Investimento (Capital a Recuperar)</h4>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Veja quanto falta recuperar de seus aportes originais antes de começar a lançar como lucro real</p>
                  </div>

                  {investmentProjects.length === 0 ? (
                    <div className="p-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl text-center bg-slate-50/20">
                      <Wallet className="text-slate-350 dark:text-slate-600 mx-auto mb-2" size={24} />
                      <p className="text-[10px] font-black uppercase text-slate-400">Nenhum projeto de investimento histórico detectado.</p>
                      <p className="text-[9px] font-medium text-slate-400 leading-normal max-w-md mx-auto mt-1">
                        Use a categoria &quot;Investimento&quot; e lance suas aplicações com a subcategoria &quot;Aplicações&quot; ou inclua o nome do projeto (ex: &quot;Q3&quot;, &quot;Lion&quot;) nas descrições para acompanhá-lo aqui.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {investmentProjects.map((project, idx) => {
                        const statusColors = {
                          APORTANDO: 'text-amber-550 bg-amber-500/10 border-amber-500/20',
                          RECUPERANDO: 'text-brand-500 bg-brand-500/10 border-brand-500/20',
                          RECUPERADO: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
                        };

                        const statusLabels = {
                          APORTANDO: 'Aportando Principal',
                          RECUPERANDO: 'Recuperando Principal',
                          RECUPERADO: '100% Recuperado! ✨'
                        };

                        return (
                          <div key={idx} className="p-6 border border-slate-100 dark:border-slate-850 rounded-[32px] bg-slate-50/50 dark:bg-brand-950/20 space-y-4 hover:shadow-md transition-shadow relative overflow-hidden">
                            {/* Glassmorphic border or subtle decorative gradient */}
                            <div className="absolute top-0 left-0 w-2 h-full bg-brand-500" />
                            
                            <div className="flex justify-between items-start pl-2">
                              <div>
                                <h5 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{project.name}</h5>
                                <span className="text-[8px] font-bold text-slate-400 uppercase block mt-0.5">
                                  Último fluxo: {new Date(project.lastTxDate).toLocaleDateString('pt-BR')} • {project.transactionsCount} lançamentos
                                </span>
                              </div>
                              <span className={`text-[8px] font-black px-2.5 py-1 rounded-lg border uppercase tracking-wider ${statusColors[project.status]}`}>
                                {statusLabels[project.status]}
                              </span>
                            </div>

                            {/* Metrics display */}
                            <div className="grid grid-cols-2 gap-4 pl-2 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                              <div className="p-3 bg-white dark:bg-brand-900/10 rounded-2xl border border-slate-100/50 dark:border-slate-800/30">
                                <span>Capital Aportado:</span>
                                <span className="text-slate-800 dark:text-white text-xs block mt-1">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(project.totalAportado)}
                                </span>
                              </div>
                              <div className="p-3 bg-white dark:bg-brand-900/10 rounded-2xl border border-slate-100/50 dark:border-slate-800/30">
                                <span>Capital Recuperado:</span>
                                <span className="text-blue-500 text-xs block mt-1">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(project.totalRecuperado)}
                                </span>
                              </div>
                              <div className="p-3 bg-white dark:bg-brand-900/10 rounded-2xl border border-slate-100/50 dark:border-slate-800/30">
                                <span>Saldo a Recuperar:</span>
                                <span className={`text-xs block mt-1 ${project.saldoRestante > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(project.saldoRestante)}
                                </span>
                              </div>
                              <div className="p-3 bg-white dark:bg-brand-900/10 rounded-2xl border border-slate-100/50 dark:border-slate-800/30">
                                <span>Lucro Payout Recebido:</span>
                                <span className="text-emerald-600 text-xs block mt-1">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(project.lucroRecebido)}
                                </span>
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="space-y-1.5 pl-2">
                              <div className="flex justify-between text-[8px] font-black uppercase text-slate-400 tracking-wider">
                                <span>Recuperação do principal:</span>
                                <span className="text-slate-900 dark:text-white">{project.progressPercent.toFixed(0)}%</span>
                              </div>
                              <div className="w-full h-2 bg-slate-100 dark:bg-brand-900/50 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full transition-all duration-500 ${project.status === 'RECUPERADO' ? 'bg-emerald-500' : 'bg-brand-500'}`} 
                                  style={{ width: `${project.progressPercent}%` }} 
                                />
                              </div>
                            </div>

                            {/* Interactive helper advice box */}
                            <div className={`p-3 rounded-2xl text-[9px] uppercase font-black tracking-wide leading-normal ${
                              project.status === 'RECUPERADO' 
                                ? 'bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100/20 text-emerald-700 dark:text-emerald-400' 
                                : 'bg-brand-50/40 dark:bg-brand-900/5 border border-brand-100/10 text-brand-700 dark:text-brand-400'
                            }`}>
                              {project.status === 'RECUPERADO' ? (
                                <span>🎉 Capital Inicial 100% Recuperado! Lance qualquer novo pagamento deste projeto como **Receita → Juros Recebidos** para contar como lucro líquido real.</span>
                              ) : (
                                <span>👉 Restam {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(project.saldoRestante)} para recuperar seu principal. Lance os próximos recebimentos como **Receita → Resgate de Capital**.</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Guia de Lançamento de Investimento */}
                <div className="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-4">
                  <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">🛠️ Guia do Investidor: Como Lançar Aportes, Resgates e Lucros (Ex: Q3, Lion, Carro)</h4>
                  <div className="p-6 bg-slate-50 dark:bg-brand-900/20 border border-slate-100 dark:border-slate-800 rounded-3xl space-y-4 text-xs font-medium text-slate-600 dark:text-slate-350 leading-relaxed">
                    <p>
                      Para que o FinVision calcule sua capacidade mensal de forma precisa e sem inflar seus números com retornos de capital (que são neutros), siga esta estratégia padrão de lançamento:
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-[10px] uppercase font-black tracking-wider text-slate-400">
                      <div className="p-4 bg-white dark:bg-brand-950/40 border border-slate-100 dark:border-slate-850 rounded-xl space-y-2">
                        <span className="text-amber-500 block text-xs">1. O Aporte Inicial (Aplicações)</span>
                        <p className="text-[9px] font-medium text-slate-500 dark:text-slate-400 normal-case leading-relaxed">
                          Quando você aplica um dinheiro (ex: compra o carro para revenda ou empresta o capital da Lion): lance como <strong>DESPESA</strong> sob a categoria <strong>"Investimento"</strong> e subcategoria <strong>"Aplicações"</strong> (ou como uma Transferência).
                        </p>
                        <span className="text-slate-400 dark:text-slate-500 block text-[8px] mt-2">✓ NÃO AFETA CUSTO DE VIDA MÍNIMO</span>
                      </div>

                      <div className="p-4 bg-white dark:bg-brand-950/40 border border-slate-100 dark:border-slate-850 rounded-xl space-y-2">
                        <span className="text-blue-500 block text-xs">2. O Retorno do Principal (Resgates)</span>
                        <p className="text-[9px] font-medium text-slate-500 dark:text-slate-400 normal-case leading-relaxed">
                          Quando o dinheiro volta para você, <strong>até o limite do valor que você aportou originalmente</strong>: lance sob a subcategoria <strong>"Resgate de Capital"</strong> (ou como Transferência). O FinVision ignorará este valor nos cálculos de renda mensal, pois é apenas a devolução do seu próprio dinheiro.
                        </p>
                        <span className="text-slate-400 dark:text-slate-500 block text-[8px] mt-2">✓ EXCLUÍDO DO FLUXO RECORRENTE</span>
                      </div>

                      <div className="p-4 bg-white dark:bg-brand-950/40 border border-slate-100 dark:border-slate-850 rounded-xl space-y-2">
                        <span className="text-emerald-500 block text-xs">3. O Rendimento Real (Lucros)</span>
                        <p className="text-[9px] font-medium text-slate-500 dark:text-slate-400 normal-case leading-relaxed">
                          Tudo que você receber <strong>além do seu capital original</strong> é o lucro real (juros/spread): lance como <strong>RECEITA</strong> sob a categoria <strong>"Investimento"</strong> e subcategoria <strong>"Juros Recebidos"</strong>. O sistema somará este valor no cálculo de receitas mensais e na sua alavancagem!
                        </p>
                        <span className="text-emerald-500 block text-[8px] mt-2">★ SOMA NA CAPACIDADE ORÇAMENTÁRIA</span>
                      </div>
                    </div>

                    <div className="p-3 bg-brand-50/50 dark:bg-brand-950/20 border border-brand-100/20 rounded-xl text-[9px] uppercase font-black tracking-wide text-brand-600 dark:text-brand-400">
                      💡 **Exemplo Prático (Q3 / Lion):** Se você aportou R$ 10.000 e recebeu R$ 12.000 de volta: lance R$ 10.000 como "Resgate de Capital" (neutro) e R$ 2.000 como "Juros Recebidos" (lucro real que aumenta sua capacidade mensal de novos aportes).
                    </div>
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
                    <div className="p-4 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100/30 dark:border-indigo-900/30 rounded-2xl text-[9.5px] font-black uppercase text-indigo-900 dark:text-indigo-300 tracking-wide leading-relaxed">
                      Sua margem estratégica ({safeCommitmentLimit}% de renda líquida):
                      <br />
                      Margem Máxima de Parcelas: <strong className="text-brand-600 dark:text-brand-400 text-sm font-black mt-1 block">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(netMonthlyCashInflow * (safeCommitmentLimit / 100))}
                      </strong>
                      Margem Disponível Saudável: <strong className={Math.max(0, (netMonthlyCashInflow * (safeCommitmentLimit / 100)) - totalMonthlyInstallments) > 0 ? 'text-emerald-600 text-sm font-black block mt-1' : 'text-rose-600 text-sm font-black block mt-1'}>
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.max(0, (netMonthlyCashInflow * (safeCommitmentLimit / 100)) - totalMonthlyInstallments))}
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
                          <span className={prospectiveIncomeResult.ratio > safeCommitmentLimit ? 'text-rose-600 font-bold' : (prospectiveIncomeResult.ratio > safeCommitmentLimit * 0.66 ? 'text-amber-500 font-bold' : 'text-emerald-500 font-bold')}>
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
                        ? `Alerta crítico. A adição dessa nova parcela comprometerá mais do que ${safeCommitmentLimit}% da sua renda familiar disponível, elevando drasticamente o risco de insolvência de caixa.`
                        : (prospectiveIncomeResult.zone === 'YELLOW' 
                            ? `Atenção. O projeto cabe no orçamento, porém você ficará no limite recomendado de comprometimento estratégico (${safeCommitmentLimit}%). Reduz a capacidade de poupar.`
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
