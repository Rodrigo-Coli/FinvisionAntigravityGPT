import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { resolveTabParam } from '../lib/urlTabState';
import {
  Plus,
  Home as HomeIcon,
  Car,
  Bike,
  Truck,
  Tags,
  TrendingUp,
  Briefcase,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  PieChart,
  Wallet,
  Building2,
  ArrowUpRight,
  Target,
  MoreHorizontal,
  LayoutGrid,
  Search,
  Zap,
  Box,
  Gem,
  Watch,
  Palette,
  Award,
  Landmark,
  X,
  ArrowDownRight,
  HelpCircle,
  Loader2,
  Trash2,
  Pencil,
  Archive,
  DollarSign,
  AlertTriangle,
  History,
  Check,
  Percent,
  Calendar,
  Layers,
  ArrowRightLeft,
  Sparkles,
  FileSpreadsheet,
  Printer,
  HandCoins,
  SlidersHorizontal
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PhysicalAsset, InvestmentBroker, Liability, Transaction } from '../types';
import { supabase } from '../lib/supabase/client';
import { RealEstateWizardModal } from '../components/assets/RealEstateWizardModal';
import { RealEstateDetailModal } from '../components/assets/RealEstateDetailModal';
import { syncRentalTransactions as sharedSyncRentalTransactions, syncCondoIptuTransactions, PayerOption } from '../components/assets/realEstatePropertySync';
import ConsortiumSection from '../components/assets/ConsortiumSection';
import { DateUtils } from '../lib/dateUtils';
import { FinancialEngine } from '../lib/financialEngine';
import { computeInstallmentAmount, buildInstallmentDate } from '../lib/amortization';
import { useToast } from '../contexts/ToastContext';

// Trava global para impedir que o sincronizador automático rode em paralelo
// (múltiplos carregamentos concorrentes geravam lançamentos duplicados, ex.: "Aquisição Ativo").
let autoSyncInFlight = false;

// Trava global para impedir que o salvamento de ativo rode em paralelo (duplo-clique,
// múltiplos disparos do form, etc.) — sem isso, funções como syncRentalTransactions
// leem "o que já existe" antes da gravação anterior terminar e geram parcelas em dobro.
let saveAssetInFlight = false;

type AssetView = 'overview' | 'realestate' | 'vehicles' | 'physical' | 'investments' | 'loans' | 'liabilities' | 'consortiums';
const ASSET_VIEWS: AssetView[] = ['overview', 'realestate', 'vehicles', 'physical', 'investments', 'loans', 'liabilities', 'consortiums'];

const Assets: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView: AssetView = resolveTabParam(searchParams.get('view'), ASSET_VIEWS, 'overview');
  const setActiveView = (view: AssetView) => {
    setSearchParams(view === 'overview' ? {} : { view }, { replace: true });
  };
  const [allAccounts, setAllAccounts] = useState<any[]>([]);
  const [collapsedBrokers, setCollapsedBrokers] = useState<Record<string, boolean>>({});
  const [showResgateModal, setShowResgateModal] = useState(false);
  const [selectedAssetForResgate, setSelectedAssetForResgate] = useState<any | null>(null);
  const [resgateForm, setResgateForm] = useState({
    type: 'TOTAL' as 'TOTAL' | 'PARCIAL',
    amount: '',
    destinationAccountId: ''
  });
  const [showAllDetails, setShowAllDetails] = useState(false);
  const [inccRate, setInccRate] = useState<number | null>(null);
  const [loadingIncc, setLoadingIncc] = useState<boolean>(false);

  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [visibleCards, setVisibleCards] = useState(() => {
    const saved = localStorage.getItem('finvision_assets_visible_cards');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      fluxo: true,
      patrimonio: true,
      imobiliario: true,
      veiculos: true,
      outros: true,
      financeiro: true,
      emprestimos: true,
      dividas: true,
      detalheImobiliario: true,
      detalheBensFisicos: true,
      detalheFinanceiro: true,
      detalheEmprestimos: true,
      detalheDividas: true,
      detalhePlanejamento: true,
    };
  });

  const handleToggleCardVisibility = (key: string) => {
    setVisibleCards((prev: any) => {
      const updated = { ...prev, [key]: !prev[key] };
      localStorage.setItem('finvision_assets_visible_cards', JSON.stringify(updated));
      return updated;
    });
  };

  // Category Selector and Real Estate detail states
  const [savingAssetUi, setSavingAssetUi] = useState(false);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);
  const [showCategorySelector, setShowCategorySelector] = useState(false);
  const [selectedRealEstateForDetail, setSelectedRealEstateForDetail] = useState<PhysicalAsset | null>(null);
  const [showRealEstateDetailModal, setShowRealEstateDetailModal] = useState(false);

  // Card Period Filtering
  const [cardPeriod, setCardPeriod] = useState<'CONTRACT' | 'CURRENT_MONTH' | 'PREVIOUS_MONTH' | 'CURRENT_YEAR' | 'CUSTOM'>('CONTRACT');
  const [cardStartDate, setCardStartDate] = useState(() => {
    const d = new Date();
    const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
    return DateUtils.formatToISODate(firstDay);
  });
  const [cardEndDate, setCardEndDate] = useState(() => {
    return DateUtils.formatToISODate(new Date());
  });

  // Core Data States with Synchronous Cache Initializers (Safe Fallbacks)
  const [physicalAssets, setPhysicalAssets] = useState<PhysicalAsset[]>(() => {
    try {
      const cachedProfile = localStorage.getItem('finvision_cached_profile');
      if (cachedProfile) {
        const userId = JSON.parse(cachedProfile).id;
        const cached = localStorage.getItem(`finvision_cached_physical_assets_${userId}`);
        if (cached) {
          return JSON.parse(cached).map((p: any) => ({
            id: p.id,
            name: p.name || 'Ativo sem nome',
            category: p.category || 'OTHER',
            estimatedValue: Number(p.estimatedValue ?? p.estimated_value ?? 0),
            acquisitionDate: p.acquisitionDate || p.acquisition_date || '',
            description: p.description || '',
            is_archived: !!(p.is_archived || p.isArchived),
            metadata: p.metadata || {}
          }));
        }
      }
    } catch (e) {}
    return [];
  });
  const [brokers, setBrokers] = useState<InvestmentBroker[]>(() => {
    try {
      const cached = localStorage.getItem('finvision_cached_accounts');
      if (cached) {
        const accs = JSON.parse(cached);
        return accs.filter((a: any) => a.type === 'INVESTMENT').map((a: any) => {
          const meta = a.metadata || {};
          const balanceVal = Number(a.current_balance ?? a.balance ?? 0);
          return {
            id: a.id,
            name: a.institution || a.name || 'Corretora',
            balance: balanceVal,
            initial_balance: Number(a.initial_balance || 0),
            allocation: [
              { type: meta.productType || 'Investimentos', percentage: 100, value: balanceVal, color: 'bg-brand-500' }
            ],
            metadata: meta
          };
        });
      }
    } catch (e) {}
    return [];
  });
  const [liabilities, setLiabilities] = useState<Liability[]>(() => {
    try {
      const cachedProfile = localStorage.getItem('finvision_cached_profile');
      if (cachedProfile) {
        const userId = JSON.parse(cachedProfile).id;
        const cached = localStorage.getItem(`finvision_cached_liabilities_${userId}`);
        if (cached) {
          return JSON.parse(cached).map((l: any) => ({
            id: l.id,
            name: l.name || 'Dívida sem nome',
            type: l.type || 'OTHER',
            totalAmount: Number(l.totalAmount ?? l.total_amount ?? 0),
            remainingBalance: Number(l.remainingBalance ?? l.remaining_balance ?? 0),
            interestRate: l.interestRate ?? l.interest_rate ?? undefined,
            linkedAssetId: l.linkedAssetId ?? l.linked_asset_id ?? undefined,
            installmentAmount: l.installmentAmount ?? l.installment_amount ?? undefined,
            installmentsRemaining: l.installmentsRemaining ?? l.installments_remaining ?? undefined,
            dueDay: l.dueDay ?? l.due_day ?? undefined,
            metadata: l.metadata || {},
            is_archived: !!(l.is_archived || l.isArchived)
          }));
        }
      }
    } catch (e) {}
    return [];
  });
  const [transactions, setTransactions] = useState<any[]>(() => {
    try {
      const cachedProfile = localStorage.getItem('finvision_cached_profile');
      if (cachedProfile) {
        const userId = JSON.parse(cachedProfile).id;
        const cached = localStorage.getItem(`finvision_cached_raw_txs_${userId}`);
        if (cached) {
          return JSON.parse(cached).map((t: any) => ({
            id: t.id,
            description: t.description || '', // Safe fallback
            amount: Number(t.amount ?? 0),
            date: t.date || '',
            type: t.type || 'EXPENSE',
            accountId: t.account_id || t.accountId || '',
            accountName: t.account_name || t.accountName || '',
            category: t.category || 'Outros',
            subcategory: t.subcategory || '',
            metadata: t.metadata || {},
            isPaid: t.is_paid !== undefined ? t.is_paid : (t.isPaid !== undefined ? t.isPaid : false),
            liability_id: t.liability_id,
            is_recurring: !!t.is_recurring,
            installment_number: t.installment_number,
            installment_total: t.installment_total
          }));
        }
      }
    } catch (e) {}
    return [];
  });
  const [isLoading, setIsLoading] = useState(() => {
    try {
      const cachedProfile = localStorage.getItem('finvision_cached_profile');
      if (cachedProfile) {
        const userId = JSON.parse(cachedProfile).id;
        return !localStorage.getItem(`finvision_cached_physical_assets_${userId}`);
      }
    } catch (e) {}
    return true;
  });

  // Exclusions for Sustainability Analysis
  const [excludedAssetIds, setExcludedAssetIds] = useState<string[]>([]);
  const [excludedConsortiumIds, setExcludedConsortiumIds] = useState<string[]>([]);
  const [excludedOtherAssetIds, setExcludedOtherAssetIds] = useState<string[]>([]);
  const [excludedOtherLiabilityIds, setExcludedOtherLiabilityIds] = useState<string[]>([]);
  const [excludedBrokerIds, setExcludedBrokerIds] = useState<string[]>([]);
  const [showAnalysisSettings, setShowAnalysisSettings] = useState(false);
  const [estimatedYieldRate, setEstimatedYieldRate] = useState<number>(0.8);

  // Active subtabs
  const [activeSubTab, setActiveSubTab] = useState<'portfolio' | 'simulator'>('portfolio');

  // Liquidity and Maturity filters for investments
  const [liquidityFilter, setLiquidityFilter] = useState<string>('ALL');
  const [maturityFilter, setMaturityFilter] = useState<string>('ALL');

  // Modals & Wizards States
  const [showModal, setShowModal] = useState(false);
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [showWizardModal, setShowWizardModal] = useState(false);
  const [showLiabilityModal, setShowLiabilityModal] = useState(false);
  // Marcado pelo usuário na edição de um passivo: força regerar as parcelas futuras mesmo
  // que nenhum campo tenha mudado (serve para consertar cronogramas gerados por versões
  // antigas do cálculo, sem precisar apagar e recadastrar a dívida).
  const [forceRegenSchedule, setForceRegenSchedule] = useState(false);
  const [showRealEstateManageModal, setShowRealEstateManageModal] = useState(false);
  const [selectedAssetForExtrato, setSelectedAssetForExtrato] = useState<PhysicalAsset | null>(null);
  const [selectedLiabilityForExtrato, setSelectedLiabilityForExtrato] = useState<Liability | null>(null);
  const [liabilityExtratoTxs, setLiabilityExtratoTxs] = useState<any[]>([]);
  const [liabilityExtratoLoading, setLiabilityExtratoLoading] = useState(false);
  const [showExtratoModal, setShowExtratoModal] = useState(false);
  const [isAddingExtratoTx, setIsAddingExtratoTx] = useState(false);
  const [isAddingLiabilityTx, setIsAddingLiabilityTx] = useState(false);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [showArchivedPhysical, setShowArchivedPhysical] = useState(false);
  const [showArchivedRealEstate, setShowArchivedRealEstate] = useState(false);
  const [showArchivedVehicles, setShowArchivedVehicles] = useState(false);
  const [showArchivedLiabilities, setShowArchivedLiabilities] = useState(false);
  const [expandedAssetIR, setExpandedAssetIR] = useState<Record<string, boolean>>({});
  const toggleExpandIR = (assetId: string) => {
    setExpandedAssetIR(prev => ({ ...prev, [assetId]: !prev[assetId] }));
  };


  const [suggestedNames, setSuggestedNames] = useState<string[]>(() => {
    const saved = localStorage.getItem('finvision_other_asset_suggestions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return ['Joias', 'Relógio de Luxo', 'Obra de Arte', 'Consórcio', 'Equipamento', 'Colecionável'];
  });

  // Modal de registro de pagamento (modelo Conta Corrente)
  const [loanPaymentModal, setLoanPaymentModal] = useState<{
    loan: any;
    amount: string;
    date: string;
    accountId: string;
    isSubmitting: boolean;
  } | null>(null);

  // Form States
  const [editingAsset, setEditingAsset] = useState<PhysicalAsset | null>(null);
  const [loanFormData, setLoanFormData] = useState({
    id: '',
    name: '',
    loanDebtor: '',
    loanPrincipal: '',
    loanInterestRate: '',
    loanFixedValue: '',
    loanDueDate: '',
    loanInterestType: 'SIMPLE' as 'SIMPLE' | 'COMPOUND',
    acquisitionDate: DateUtils.formatToISODate(),
    description: '',
    status: 'ATIVO'
  });

  const [formData, setFormData] = useState({
    name: '',
    category: 'REAL_ESTATE' as 'REAL_ESTATE' | 'VEHICLE' | 'OTHER' | 'INVESTMENT',
    estimatedValue: '',
    acquisitionDate: '',
    description: '',
    // Advanced fields stored inside metadata
    purpose: 'uso' as 'uso' | 'investimento',
    purchaseValue: '',
    fipeValue: '',
    brokerFee: '',
    isSold: false,
    soldValue: '',
    // Pre-construction / planta
    propertyStage: 'PRONTO' as 'PLANTA' | 'PRONTO',
    indexType: 'INCC',
    balloons: [] as { month: number; year: number; amount: number }[],
    constructorIndexType: 'INCC' as 'INCC' | 'IPCA' | 'IGP-M' | 'FIXED',
    constructorIndexRate: '0.0',
    // Rental info
    isRented: false,
    rentalIncome: '',
    discountType: 'VALUE' as 'PERCENT' | 'VALUE',
    discountValue: '',
    condoFee: '',
    iptuFee: '',
    inquilinoPaysCondo: false,
    inquilinoPaysIPTU: false,
    condoPayer: 'PROPRIETARIO' as PayerOption,
    condoNextDate: DateUtils.formatToISODate(),
    iptuPayer: 'PROPRIETARIO' as PayerOption,
    iptuNextDate: DateUtils.formatToISODate(),
    iptuFrequency: 'monthly' as 'monthly' | 'yearly',
    rentalType: 'anual' as 'anual' | 'short_stay',
    rentalDate: DateUtils.formatToISODate(),
    // Loan assets
    isLoan: false,
    loanType: 'INSTALLMENTS' as 'INSTALLMENTS' | 'OPEN_BALANCE',
    loanPrincipal: '',
    loanInterestType: 'SIMPLE' as 'SIMPLE' | 'COMPOUND',
    loanInterestRate: '',
    loanFixedValue: '',
    loanDueDate: '',
    loanDebtor: '',
    loanInstallmentsCount: '',
    // Financing / Consortium details for edit transition
    deliveryPaymentMethod: 'A_VISTA' as 'A_VISTA' | 'FINANCIAMENTO' | 'CONSORCIO' | 'A_DEFINIR',
    deliveryBalance: '',
    selectedConsortiumId: '',
    consortiumAllocationRatio: '100',
    financingOriginalTotal: '',
    financingInstallment: '',
    financingInstallmentsCount: '',
    financingDueDay: '10',
    financingName: '',
    // Vehicle-specific fields
    vehicleType: 'CAR' as 'CAR' | 'MOTORCYCLE' | 'TRUCK' | 'OTHER',
    licensePlate: '',
    renavam: '',
    yearModel: '',
    mileage: '',
    transferFee: '',
    vehiclePurposeType: 'RENTAL' as 'RENTAL' | 'FLIP',
    ipvaFee: '',
    seguroFee: '',
    licenciamentoFee: '',
    maintenanceMonthlyEstimated: '',
    rentalPlatformFee: '',
    targetSaleValue: '',
    preparationBudget: '',
    saleCommission: '',
    salePaymentMethod: 'A_VISTA' as 'A_VISTA' | 'PARCELADO' | 'PERMUTA' | 'HIBRIDO',
    permutaVeiculoValor: '',
    permutaVeiculoNome: '',
    permutaImovelValor: '',
    permutaImovelNome: '',
    permutaOutrosValor: '',
    permutaOutrosNome: '',
    saleDate: DateUtils.formatToISODate(),
    saleCashAmount: '',
    ipvaPaymentMethod: 'PARCELADO' as 'A_VISTA' | 'PARCELADO',
    ipvaInstallmentsCount: '5',
    seguroPaymentMethod: 'PARCELADO' as 'A_VISTA' | 'RECORRENTE' | 'PARCELADO',
    seguroInstallmentsCount: '10',
    permutaItems: [] as { type: 'VEHICLE' | 'REAL_ESTATE' | 'OTHER'; name: string; value: string }[],
    // Investment-specific fields
    investmentType: 'CDB',
    interestType: 'CDI',
    yieldRate: '',
    payoutType: 'ACUMULADO' as 'ACUMULADO' | 'MENSAL',
    brokerAccountId: '',
    vencimentoDate: '',
    investmentLiquidity: 'No Vencimento',
    status: 'ATIVO' as 'ATIVO' | 'RESGATADO',
    isTaxExempt: false,
    iconKey: '',
    brandModel: '',
    serialNumber: '',
    custodyLocation: '',
    insurancePolicy: '',
    certificateLink: '',
    depreciationRate: '',
    isDepreciable: false,
  });

  const [selectedLiabilityForManage, setSelectedLiabilityForManage] = useState<any | null>(null);
  const [realEstateManageForm, setRealEstateManageForm] = useState({
    propertyType: 'PLANTA' as 'PLANTA' | 'PRONTO',
    rentalIncome: '',
    operationalExpenses: '',
    deliveryDate: '',
    installmentAmount: '',
    inquilinoPaysCondo: false,
    inquilinoPaysIPTU: false,
    isRented: false,
    condoFee: '',
    iptuFee: '',
    // Add fields for final balance payment
    deliveryPaymentMethod: 'FINANCIAMENTO' as 'FINANCIAMENTO' | 'A_VISTA' | 'CONSORCIO' | 'A_DEFINIR',
    deliveryBalance: '',
    selectedConsortiumId: '',
    financingInstallment: '',
    financingInstallmentsCount: '',
    financingDueDay: '10',
    rentalType: 'anual' as 'anual' | 'short_stay',
    financingName: '',
    financingOriginalTotal: '',
    rentalDate: DateUtils.formatToISODate()
  });

  const [editingLiability, setEditingLiability] = useState<any | null>(null);
  const [liabilityFormData, setLiabilityFormData] = useState({
    name: '',
    type: 'PERSONAL_LOAN' as any,
    totalAmount: '',
    remainingBalance: '',
    interestRate: '',
    installmentAmount: '',
    installmentsRemaining: '',
    dueDay: '',
    linkedAssetId: '',
    indexationRate: '',
    amortizationType: 'SAC' as 'SAC' | 'PRICE',
    indexType: 'FIXED' as 'INCC' | 'IPCA' | 'IGP-M' | 'FIXED',
    firstInstallmentDate: '',
    balloonMonth: '',
    balloonYear: '',
    balloonAmount: '',
    balloons: [] as { month: number; year: number; amount: number }[],
    propertyType: 'PLANTA' as 'PLANTA' | 'PRONTO',
    hasHistoricalPayments: false,
    historicalCalculationType: 'calculated' as 'calculated' | 'direct',
    historicalInstallmentsPaid: '',
    historicalInstallmentValue: '',
    historicalPaidAmount: ''
  });

  // Modal new transaction local form
  const [newTxForm, setNewTxForm] = useState({
    description: '',
    amount: '',
    type: 'EXPENSE' as 'INCOME' | 'EXPENSE',
    date: DateUtils.formatToISODate(),
    isHistorical: false,
    category: 'Outros',
    subcategory: '',
    isCapitalized: false
  });

  // INCC Fetcher
  useEffect(() => {
    const fetchINCC = async () => {
      setLoadingIncc(true);
      try {
        const res = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.10815/dados/ultimos/1?formato=json');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0 && data[0].valor) {
            const val = parseFloat(data[0].valor);
            if (!isNaN(val)) {
              setInccRate(val);
            }
          }
        }
      } catch (err) {
        console.error('Erro ao buscar INCC da API do BCB:', err);
      } finally {
        setLoadingIncc(false);
      }
    };
    fetchINCC();
  }, []);

  // Fetch all core data
  const fetchData = async () => {
    if (!supabase) return;
    
    // Obter o ID do usuário de forma rápida e offline-safe
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setIsLoading(false);
      return;
    }
    const userId = user.id;

    // --- 1. TENTAR CARREGAMENTO INSTANTÂNEO VIA CACHE LOCAL ---
    let hasCache = false;
    try {
      const cachedPhys = localStorage.getItem(`finvision_cached_physical_assets_${userId}`);
      const cachedLiabs = localStorage.getItem(`finvision_cached_liabilities_${userId}`);
      const cachedTxs = localStorage.getItem(`finvision_cached_raw_txs_${userId}`);
      const cachedAccounts = localStorage.getItem(`finvision_cached_accounts`);

      if (cachedPhys) {
        const parsedPhys = JSON.parse(cachedPhys);
        setPhysicalAssets(parsedPhys);
        setSelectedRealEstateForDetail(prev => {
          if (!prev) return null;
          return parsedPhys.find((p: any) => p.id === prev.id) || prev;
        });
        hasCache = true;
      }
      if (cachedLiabs) {
        setLiabilities(JSON.parse(cachedLiabs));
        hasCache = true;
      }
      if (cachedTxs) {
        setTransactions(JSON.parse(cachedTxs).map((t: any) => ({
          id: t.id,
          description: t.description,
          amount: Number(t.amount),
          date: t.date,
          type: t.type,
          accountId: t.account_id || t.accountId,
          accountName: t.account_name || t.accountName,
          category: t.category,
          subcategory: t.subcategory,
          metadata: t.metadata || {},
          isPaid: t.is_paid !== undefined ? t.is_paid : t.isPaid,
          liability_id: t.liability_id,
          is_recurring: t.is_recurring,
          installment_number: t.installment_number,
          installment_total: t.installment_total
        })));
        hasCache = true;
      }
      if (cachedAccounts) {
        const accs = JSON.parse(cachedAccounts);
        setAllAccounts(accs);
        const brokerList = accs.filter((a: any) => a.type === 'INVESTMENT').map((a: any) => {
          const meta = a.metadata || {};
          return {
            id: a.id,
            name: a.institution || a.name,
            balance: Number(a.current_balance || a.balance),
            initial_balance: Number(a.initial_balance || 0),
            allocation: [
              { type: meta.productType || 'Investimentos', percentage: 100, value: Number(a.current_balance || a.balance), color: 'bg-brand-500' }
            ],
            metadata: meta
          };
        });
        setBrokers(brokerList as any);
      }
    } catch (cacheErr) {
      console.warn("Assets: Falha ao ler cache inicial", cacheErr);
    }

    // Se não tiver cache, exibe o loader completo
    if (!hasCache) {
      setIsLoading(true);
    }

    // Se estiver offline, finaliza aqui de forma segura com os dados locais
    if (!navigator.onLine) {
      setIsLoading(false);
      return;
    }

    // --- 2. BUSCA ONLINE ATUALIZADA EM PARALELO (SILENT REFRESH) ---
    try {
      const [physRes, accsRes, liabsRes, budgetsRes, goalsRes] = await Promise.all([
        supabase
          .from('physical_assets')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: true }),
        supabase
          .from('accounts')
          .select('*')
          .eq('user_id', userId)
          .eq('is_archived', false),
        supabase
          .from('liabilities')
          .select('*')
          .eq('user_id', userId),
        supabase
          .from('budgets')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true),
        supabase
          .from('goals')
          .select('*')
          .eq('user_id', userId)
      ]);

      if (physRes.error) throw physRes.error;
      if (accsRes.error) throw accsRes.error;
      if (liabsRes.error) throw liabsRes.error;

      if (budgetsRes.data) setBudgets(budgetsRes.data);
      if (goalsRes.data) setGoals(goalsRes.data);

      const phys = physRes.data || [];
      const accs = accsRes.data || [];
      const liabs = liabsRes.data || [];
      
      setAllAccounts(accs);

      // Mapeamento e atualização atômica de estados (Mapeamento Seguro)
      const mappedPhys = phys.map((p: any) => ({
        id: p.id,
        name: p.name || 'Ativo sem nome',
        category: p.category || 'OTHER',
        estimatedValue: Number(p.estimated_value ?? 0),
        acquisitionDate: p.acquisition_date || '',
        description: p.description || '',
        is_archived: !!p.is_archived,
        metadata: p.metadata || {}
      }));
      setPhysicalAssets(mappedPhys);
      setSelectedRealEstateForDetail(prev => {
        if (!prev) return null;
        return mappedPhys.find((p: any) => p.id === prev.id) || prev;
      });

      const brokerList = accs.filter((a: any) => a.type === 'INVESTMENT').map((a: any) => {
        const meta = a.metadata || {};
        const balanceVal = Number(a.current_balance ?? a.balance ?? 0);
        return {
          id: a.id,
          name: a.institution || a.name || 'Corretora',
          balance: balanceVal,
          initial_balance: Number(a.initial_balance || 0),
          allocation: [
            { type: meta.productType || 'Investimentos', percentage: 100, value: balanceVal, color: 'bg-brand-500' }
          ],
          metadata: meta
        };
      });
      setBrokers(brokerList as any);

      const mappedLiabs = liabs.map((l: any) => ({
        id: l.id,
        name: l.name || 'Dívida sem nome',
        type: l.type || 'OTHER',
        totalAmount: Number(l.total_amount ?? 0),
        remainingBalance: Number(l.remaining_balance ?? 0),
        interestRate: l.interest_rate ? Number(l.interest_rate) : undefined,
        linkedAssetId: l.linked_asset_id,
        installmentAmount: l.installment_amount ? Number(l.installment_amount) : undefined,
        installmentsRemaining: l.installments_remaining ? Number(l.installments_remaining) : undefined,
        dueDay: l.due_day ? Number(l.due_day) : undefined,
        metadata: l.metadata || {},
        is_archived: !!l.is_archived,
        createdAt: l.created_at
      }));
      setLiabilities(mappedLiabs);

      // Busca os primeiros 3 blocos de transações (0 a 2999) em paralelo para reduzir drasticamente a latência de RTT da rede
      let allTxs: any[] = [];
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const oneYearAgoStr = DateUtils.formatToISODate(oneYearAgo);

      const [res1, res2, res3] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .eq('user_id', userId)
          .eq('is_deleted', false)
          .or(`date.gte.${oneYearAgoStr},metadata->>linked_asset_id.not.is.null,category.eq.Rendimentos,category.eq.Investimentos`)
          .range(0, 999),
        supabase
          .from('transactions')
          .select('*')
          .eq('user_id', userId)
          .eq('is_deleted', false)
          .or(`date.gte.${oneYearAgoStr},metadata->>linked_asset_id.not.is.null,category.eq.Rendimentos,category.eq.Investimentos`)
          .range(1000, 1999),
        supabase
          .from('transactions')
          .select('*')
          .eq('user_id', userId)
          .eq('is_deleted', false)
          .or(`date.gte.${oneYearAgoStr},metadata->>linked_asset_id.not.is.null,category.eq.Rendimentos,category.eq.Investimentos`)
          .range(2000, 2999)
      ]);

      if (res1.error) throw res1.error;
      if (res2.error) throw res2.error;
      if (res3.error) throw res3.error;

      const chunk1 = res1.data || [];
      const chunk2 = res2.data || [];
      const chunk3 = res3.data || [];

      allTxs = [...chunk1, ...chunk2, ...chunk3];

      // Se o terceiro bloco veio completo (1000 registros), significa que pode haver mais registros acima de 3000
      if (chunk3.length === 1000) {
        let hasMoreTxs = true;
        let txOffset = 3000;
        while (hasMoreTxs) {
          const { data: chunk, error: txErr } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', userId)
            .eq('is_deleted', false)
            .or(`date.gte.${oneYearAgoStr},metadata->>linked_asset_id.not.is.null,category.eq.Rendimentos,category.eq.Investimentos`)
            .range(txOffset, txOffset + 999);

          if (txErr) throw txErr;

          if (chunk && chunk.length > 0) {
            allTxs = [...allTxs, ...chunk];
            if (chunk.length < 1000) {
              hasMoreTxs = false;
            } else {
              txOffset += 1000;
            }
          } else {
            hasMoreTxs = false;
          }
        }
      }

      const mappedTxs = allTxs.map((t: any) => ({
        id: t.id,
        description: t.description || '',
        amount: Number(t.amount ?? 0),
        date: t.date || '',
        type: t.type || 'EXPENSE',
        accountId: t.account_id,
        accountName: t.account_name,
        category: t.category || 'Outros',
        subcategory: t.subcategory || '',
        metadata: t.metadata || {},
        isPaid: !!t.is_paid,
        liability_id: t.liability_id,
        is_recurring: !!t.is_recurring,
        installment_number: t.installment_number,
        installment_total: t.installment_total
      }));
      setTransactions(mappedTxs);

      // Proactively run automatic transaction creation check
      setTimeout(() => {
        runAutoTransactionSync(userId, mappedPhys, mappedLiabs, mappedTxs);
      }, 100);

      // Atualizar cache local
      try {
        localStorage.setItem(`finvision_cached_physical_assets_${userId}`, JSON.stringify(mappedPhys));
        localStorage.setItem(`finvision_cached_liabilities_${userId}`, JSON.stringify(mappedLiabs));
        localStorage.setItem(`finvision_cached_raw_txs_${userId}`, JSON.stringify(allTxs));
        localStorage.setItem(`finvision_cached_accounts`, JSON.stringify(accs));
      } catch (cacheErr) {
        console.warn("Assets: Falha ao escrever no cache", cacheErr);
      }
    } catch (e: any) {
      console.error('Assets: Error fetching online data', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Busca extrato completo quando liability é selecionada (direto do banco, sem limitação de paginação)
  useEffect(() => {
    if (selectedLiabilityForExtrato?.id) {
      fetchLiabilityExtratoTxs(selectedLiabilityForExtrato.id);
    } else {
      setLiabilityExtratoTxs([]);
    }
  }, [selectedLiabilityForExtrato?.id]);

  // Filter out archived
  const activePhysicalAssets = useMemo(() => physicalAssets.filter(p => !p.is_archived), [physicalAssets]);
  const displayOtherPhysicalAssets = useMemo(() => {
    return physicalAssets.filter(p => {
      const isOther = p.category === 'OTHER' && !p.metadata?.isLoan;
      if (!isOther) return false;
      return showArchivedPhysical ? true : !p.is_archived;
    });
  }, [physicalAssets, showArchivedPhysical]);
  const activeLiabilities = useMemo(() => liabilities.filter(l => !l.is_archived), [liabilities]);

  const enrichedPhysicalAssets = useMemo(() => {
    return activePhysicalAssets.map(p => {
      if (p.category === 'INVESTMENT') {
        const meta = p.metadata || {};
        const purchase = Number(meta.purchaseValue) || Number(meta.initialInvestmentAmount) || Number(p.estimatedValue) || 0;
        const isVariableIncome = ['ACOES', 'FIIS', 'CRIPTO'].includes(meta.investmentType);
        
        if (isVariableIncome) {
          const grossValue = Number(p.estimatedValue || 0);
          const grossYield = grossValue - purchase;
          const isExempt = !!meta.isTaxExempt || ['LCI_LCA', 'CRI_CRA', 'POUPANCA'].includes(meta.investmentType);
          
          let taxRate = 0;
          if (!isExempt) {
            if (meta.investmentType === 'FIIS') taxRate = 0.20;
            else if (['ACOES', 'CRIPTO'].includes(meta.investmentType)) taxRate = 0.15;
          }
          
          const taxAmount = !isExempt && grossYield > 0 ? Math.round(grossYield * taxRate * 100) / 100 : 0;
          const netValue = Math.round((grossValue - taxAmount) * 100) / 100;
          
          return {
            ...p,
            estimatedValue: grossValue,
            netValue: netValue,
            grossYield: grossYield,
            taxRate: taxRate,
            taxAmount: taxAmount,
            daysElapsed: 0,
            monthsElapsed: 0,
            parsedAnnualRate: 0
          };
        } else {
          const acqDate = p.acquisitionDate || DateUtils.formatToISODate();
          const parsedAnnualRate = FinancialEngine.parseYieldRate(meta.yieldRate || '', meta.interestType || 'PRE');
          const isExempt = !!meta.isTaxExempt || ['LCI_LCA', 'CRI_CRA', 'POUPANCA'].includes(meta.investmentType);

          // calculateFixedIncomeYield projeta o valor "na curva" (o que o contrato prometeria).
          // Usamos essa projeção só para saber há quantos dias o título está em carteira
          // (define a alíquota regressiva de IR) — o saldo bruto exibido continua sendo
          // o que o usuário informa/atualiza manualmente (marcação a mercado), nunca a projeção.
          const calcs = FinancialEngine.calculateFixedIncomeYield(
            purchase,
            parsedAnnualRate,
            acqDate,
            meta.payoutType === 'MENSAL' ? 'MENSAL' : 'ACUMULADO',
            isExempt
          );

          const grossValue = Number(p.estimatedValue || 0);
          const grossYield = Math.max(0, grossValue - purchase);
          const taxRate = FinancialEngine.calculateRegressiveTaxRate(calcs.daysElapsed, isExempt);
          const taxAmount = Math.round(grossYield * taxRate * 100) / 100;
          const netValue = Math.round((grossValue - taxAmount) * 100) / 100;

          return {
            ...p,
            estimatedValue: grossValue,
            netValue,
            grossYield,
            taxRate,
            taxAmount,
            daysElapsed: calcs.daysElapsed,
            monthsElapsed: calcs.monthsElapsed,
            parsedAnnualRate,
            curveProjectedValue: calcs.grossValue
          };
        }
      }
      return {
        ...p,
        netValue: p.estimatedValue,
        grossYield: 0,
        taxRate: 0,
        taxAmount: 0,
        daysElapsed: 0,
        monthsElapsed: 0,
        parsedAnnualRate: 0
      };
    });
  }, [activePhysicalAssets]);

  const dynamicBrokers = useMemo(() => {
    return brokers.map(b => {
      const brokerInvestments = enrichedPhysicalAssets.filter(
        p => p.category === 'INVESTMENT' && p.metadata?.brokerAccountId === b.id && p.metadata?.status !== 'RESGATADO'
      );
      const totalInvested = brokerInvestments.reduce((sum, inv) => sum + (inv.netValue || 0), 0);
      const cash = Number(b.initial_balance || 0);
      return {
        ...b,
        balance: cash + totalInvested
      };
    });
  }, [brokers, enrichedPhysicalAssets]);

  // Pre-computes and maps all transactions to their respective physical assets in O(N) linear time.
  const linkedTransactionsMap = useMemo(() => {
    // Palavras genéricas que NUNCA devem ser usadas para casar por descrição,
    // pois aparecem em lançamentos de muitos eventos diferentes (ex.: "Recebimento de
    // Empréstimo/Financiamento - Piazza do Bosque" casaria com um empréstimo chamado "Empréstimo Lion").
    const GENERIC_MATCH_WORDS = new Set([
      'emprestimo', 'empréstimo', 'financiamento', 'recebimento', 'pagamento',
      'parcela', 'aluguel', 'rendimento', 'investimento', 'aquisicao', 'aquisição',
      'desembolso', 'fatura', 'conta', 'outros', 'transferencia', 'transferência'
    ]);

    const assetMatches = activePhysicalAssets.map(p => {
      // Empréstimos concedidos só casam por vínculo explícito (linked_asset_id):
      // o nome costuma começar com "Empréstimo", que é genérico demais para casar por descrição.
      if (p.metadata?.isLoan) {
        return { id: p.id, cleanName: '', firstWord: '' };
      }

      const assetName = p.name.toLowerCase();
      const cleanName = assetName
        .replace(/apartamento|casa|carro|veículo|jeep|honda|audi|toyota/g, '')
        .trim();
      const firstWord = cleanName.length > 2 ? cleanName.split(/\s+/)[0] : '';
      const safeFirstWord = firstWord && firstWord.length > 3 && !GENERIC_MATCH_WORDS.has(firstWord) ? firstWord : '';
      return {
        id: p.id,
        cleanName: GENERIC_MATCH_WORDS.has(cleanName) ? '' : cleanName,
        firstWord: safeFirstWord
      };
    });

    const txsByAsset = new Map<string, any[]>();
    activePhysicalAssets.forEach(p => txsByAsset.set(p.id, []));

    transactions.forEach(t => {
      const explicitId = t.metadata?.linked_asset_id;
      if (explicitId && txsByAsset.has(explicitId)) {
        txsByAsset.get(explicitId)!.push(t);
        return;
      }

      if (t.liability_id) {
        const linkedLiab = activeLiabilities.find(l => l.id === t.liability_id);
        if (linkedLiab && linkedLiab.linkedAssetId && txsByAsset.has(linkedLiab.linkedAssetId)) {
          txsByAsset.get(linkedLiab.linkedAssetId)!.push(t);
          return;
        }
      }

      const descLower = t.description ? t.description.toLowerCase() : '';
      for (let i = 0; i < assetMatches.length; i++) {
        const match = assetMatches[i];
        if (match.cleanName.length > 2) {
          if (descLower.includes(match.cleanName)) {
            if (match.cleanName === 'piazza' && descLower.includes('piazzaria')) continue;
            txsByAsset.get(match.id)!.push(t);
            return;
          }
          if (match.firstWord && descLower.includes(match.firstWord)) {
            if (match.firstWord === 'piazza' && descLower.includes('piazzaria')) continue;
            txsByAsset.get(match.id)!.push(t);
            return;
          }
        }
      }
    });

    return txsByAsset;
  }, [activePhysicalAssets, activeLiabilities, transactions]);

  // Sustainability Panel calculations
  const sustainabilitySummary = useMemo(() => {
    const activePhysImob = activePhysicalAssets.filter(p => p.category === 'REAL_ESTATE' && !excludedAssetIds.includes(p.id));
    
    // Regular liabilities monthly payments
    const mortgageLiabs = activeLiabilities.filter(l => {
      if (l.type !== 'MORTGAGE' && !l.metadata?.isRealEstate) return false;
      if (l.linkedAssetId && excludedAssetIds.includes(l.linkedAssetId)) return false;
      return true;
    });

    const consortiumLiabs = activeLiabilities.filter(l => l.type === 'CONSORTIUM' && !excludedConsortiumIds.includes(l.id));
    const otherLiabs = activeLiabilities.filter(l => l.type !== 'CONSORTIUM' && l.type !== 'MORTGAGE' && !l.metadata?.isRealEstate && !excludedOtherLiabilityIds.includes(l.id));

    const totalMortgageInstallments = mortgageLiabs.reduce((acc, curr) => acc + (curr.installmentAmount || 0), 0);
    const totalConsortiumInstallments = consortiumLiabs.reduce((acc, curr) => acc + (curr.installmentAmount || 0), 0);
    const totalOtherInstallments = otherLiabs.reduce((acc, curr) => acc + (curr.installmentAmount || 0), 0);

    // Rental inflows: Sum of monthly rents configured across ALL physical assets
    const realEstateRents = activePhysicalAssets.filter(p => p.category === 'REAL_ESTATE' && !excludedAssetIds.includes(p.id)).reduce((acc, curr) => {
      const meta = curr.metadata || {};
      return acc + (meta.isRented ? (Number(meta.rentalIncome) || 0) : 0);
    }, 0);

    const vehicleRents = activePhysicalAssets.filter(p => p.category === 'VEHICLE' && !excludedAssetIds.includes(p.id)).reduce((acc, curr) => {
      const meta = curr.metadata || {};
      const isRented = meta.purpose === 'investimento' && meta.vehiclePurposeType === 'RENTAL';
      return acc + (isRented ? (Number(meta.rentalIncome) || 0) : 0);
    }, 0);

    const otherRents = activePhysicalAssets.filter(p => p.category === 'OTHER' && !excludedAssetIds.includes(p.id)).reduce((acc, curr) => {
      const meta = curr.metadata || {};
      const isRented = meta.purpose === 'investimento' && meta.isRented;
      return acc + (isRented ? (Number(meta.rentalIncome) || 0) : 0);
    }, 0);

    const totalRents = realEstateRents + vehicleRents + otherRents;

    // Operating expenses (Condo + IPTU if paid by owner)
    const totalOperatingCosts = activePhysicalAssets.filter(p => p.category === 'REAL_ESTATE' && !excludedAssetIds.includes(p.id)).reduce((acc, curr) => {
      const meta = curr.metadata || {};
      let cost = 0;
      if (!meta.inquilinoPaysCondo && meta.condoFee) cost += Number(meta.condoFee);
      if (!meta.inquilinoPaysIPTU && meta.iptuFee) cost += Number(meta.iptuFee);
      return acc + cost;
    }, 0);

    // Vehicle recurring expenses
    const vehicleRecurringExpenses = activePhysicalAssets.filter(p => p.category === 'VEHICLE' && !excludedAssetIds.includes(p.id)).reduce((sum, p) => {
      const meta = p.metadata || {};
      const ipva = Number(meta.ipvaFee) || 0;
      const seguro = Number(meta.seguroFee) || 0;
      const lic = Number(meta.licenciamentoFee) || 0;
      const maint = Number(meta.maintenanceMonthlyEstimated) || 0;

      let ipvaMonthly = 0;
      if (ipva > 0) {
        if (meta.ipvaPaymentMethod === 'A_VISTA') {
          ipvaMonthly = ipva / 12;
        } else {
          ipvaMonthly = ipva / (Number(meta.ipvaInstallmentsCount) || 5);
        }
      }

      let seguroMonthly = 0;
      if (seguro > 0) {
        if (meta.seguroPaymentMethod === 'A_VISTA') {
          seguroMonthly = seguro / 12;
        } else if (meta.seguroPaymentMethod === 'RECORRENTE') {
          seguroMonthly = seguro;
        } else {
          seguroMonthly = seguro / (Number(meta.seguroInstallmentsCount) || 10);
        }
      }

      const licMonthly = lic / 12;

      return sum + ipvaMonthly + seguroMonthly + licMonthly + maint;
    }, 0);

    // Investment yield calculation
    const activeFinancial = dynamicBrokers.filter(b => !excludedBrokerIds.includes(b.id));
    const totalInvestedBalance = activeFinancial.reduce((acc, curr) => acc + curr.balance, 0);
    const estimatedMonthlyYield = totalInvestedBalance * (estimatedYieldRate / 100);

    // Off-plan construction installments
    const plantaAssets = activePhysicalAssets.filter(p => p.category === 'REAL_ESTATE' && p.metadata?.propertyStage === 'PLANTA' && !excludedAssetIds.includes(p.id));
    const plantaInstallments = plantaAssets.reduce((sum, p) => {
      const meta = p.metadata || {};
      const assetTxs = linkedTransactionsMap.get(p.id) || [];
      const nextUnpaidInstallment = assetTxs
        .filter(t => t.metadata?.property_tx_type === 'CONSTRUCTOR_INSTALLMENT' && !t.isPaid)
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      
      let constructorInstallment = 0;
      if (nextUnpaidInstallment) {
        constructorInstallment = nextUnpaidInstallment.amount;
      } else {
        const constrAmt = Number(meta.constructorAmount) || 0;
        const constrN = Number(meta.constructorInstallmentsCount) || 1;
        constructorInstallment = constrAmt > 0 && constrN > 0 ? (constrAmt / constrN) : 0;
      }

      const linkedLiab = activeLiabilities.find(l => l.linkedAssetId === p.id);
      const allocationRatio = meta.consortiumAllocationRatio !== undefined ? (Number(meta.consortiumAllocationRatio) / 100) : 1;
      const financingInstallment = linkedLiab 
        ? (Number(linkedLiab.installmentAmount) * allocationRatio) 
        : (Number(meta.financingInstallment) || 0);

      return sum + constructorInstallment + financingInstallment;
    }, 0);

    const currentMonthStr = new Date().toISOString().substring(0, 7);
    const realizedYield = transactions.filter(t => 
      t.type === 'INCOME' && 
      t.is_paid !== false && 
      t.date.substring(0, 7) === currentMonthStr &&
      t.subcategory !== 'Resgate' &&
      t.metadata?.type !== 'investment_redemption_total' &&
      t.metadata?.type !== 'investment_redemption_partial' &&
      (t.category === 'Rendimentos' || t.category === 'Investimentos' || t.metadata?.type === 'investment_yield')
    ).reduce((sum, t) => sum + t.amount, 0);

    const totalInflow = totalRents + estimatedMonthlyYield;
    const realizedInflow = totalRents + realizedYield;
    const totalOutflow = totalMortgageInstallments + totalOperatingCosts + totalConsortiumInstallments + totalOtherInstallments + vehicleRecurringExpenses + plantaInstallments;
    const netFlow = totalInflow - totalOutflow;
    const selfSustainabilityPercent = totalOutflow > 0 ? Math.round((totalInflow / totalOutflow) * 100) : 100;
    const realizedSelfSustainabilityPercent = totalOutflow > 0 ? Math.round((realizedInflow / totalOutflow) * 100) : 100;

    return {
      totalRents,
      realEstateRents,
      estimatedMonthlyYield,
      totalInflow,
      totalMortgageInstallments,
      totalOperatingCosts,
      totalConsortiumInstallments,
      totalOtherInstallments,
      vehicleRecurringExpenses,
      plantaInstallments,
      totalOutflow,
      netFlow,
      selfSustainabilityPercent,
      realizedSelfSustainabilityPercent,
      totalInvestedBalance
    };
  }, [activePhysicalAssets, activeLiabilities, dynamicBrokers, excludedAssetIds, excludedConsortiumIds, excludedOtherAssetIds, excludedOtherLiabilityIds, excludedBrokerIds, estimatedYieldRate, linkedTransactionsMap, transactions]);

  // Asset helpers
  const getAssetLinkedTransactions = (assetId: string) => {
    return linkedTransactionsMap.get(assetId) || [];
  };

  const getAssetFinancialHistory = (asset: PhysicalAsset) => {
    const txs = getAssetLinkedTransactions(asset.id);
    const inTxs = txs.filter(t => t.type === 'INCOME');
    const outTxs = txs.filter(t => t.type === 'EXPENSE' || t.type === 'BILL_PAYMENT');

    const totalExtraExpenses = outTxs.reduce((acc, curr) => acc + curr.amount, 0);
    const totalIncome = inTxs.reduce((acc, curr) => acc + curr.amount, 0);

    return {
      txs,
      totalExtraExpenses,
      totalIncome
    };
  };

  // Liability helpers
  const getLiabilityLinkedTransactions = (liabilityId: string) => {
    return transactions.filter(t => t.liability_id === liabilityId);
  };

  // Busca TODAS as transações de uma liability direto do banco (sem limitação de paginação do state)
  const fetchLiabilityExtratoTxs = async (liabilityId: string) => {
    if (!supabase) return;
    setLiabilityExtratoLoading(true);
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('liability_id', liabilityId)
        .eq('is_deleted', false)
        .order('date', { ascending: true });
      if (!error && data) setLiabilityExtratoTxs(data);
    } catch (e) {
      console.warn('fetchLiabilityExtratoTxs error:', e);
    } finally {
      setLiabilityExtratoLoading(false);
    }
  };

  const getLiabilityFinancialHistory = (liability: Liability) => {
    const txs = getLiabilityLinkedTransactions(liability.id);
    const inTxs = txs.filter(t => t.type === 'INCOME');
    const outTxs = txs.filter(t => t.type === 'EXPENSE' || t.type === 'BILL_PAYMENT');

    const totalPaid = outTxs.reduce((acc, curr) => acc + curr.amount, 0);
    const totalRefunded = inTxs.reduce((acc, curr) => acc + curr.amount, 0);

    return {
      txs,
      totalPaid,
      totalRefunded
    };
  };

  const getFilteredInvestments = (investments: PhysicalAsset[]) => {
    return investments.filter(inv => {
      const meta = inv.metadata || {};
      
      // 1. Liquidity Filter
      if (liquidityFilter !== 'ALL') {
        const liq = meta.investmentLiquidity || '';
        if (liquidityFilter === 'DIARIA' && liq !== 'Diária') return false;
        if (liquidityFilter === 'D+1' && liq !== 'D+1') return false;
        if (liquidityFilter === 'D+30' && liq !== 'D+30') return false;
        if (liquidityFilter === 'VENCIMENTO' && liq !== 'No Vencimento') return false;
      }

      // 2. Maturity Filter
      if (maturityFilter !== 'ALL') {
        const vDateStr = meta.vencimentoDate || '';
        if (maturityFilter === 'SEM_DATA') {
          if (vDateStr) return false;
        } else {
          if (!vDateStr) return false;
          const today = new Date();
          today.setHours(0,0,0,0);
          const venc = new Date(vDateStr);
          venc.setHours(0,0,0,0);
          const diffTime = venc.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (maturityFilter === 'VENCIDOS' && diffDays >= 0) return false;
          if (maturityFilter === 'CURTO_PRAZO' && (diffDays < 0 || diffDays > 180)) return false;
          if (maturityFilter === 'LONGO_PRAZO' && (diffDays <= 180)) return false;
        }
      }

      return true;
    });
  };

  const calculateIRProvisions = (inv: PhysicalAsset) => {
    const meta = inv.metadata || {};
    const acqDateStr = inv.acquisitionDate || '';
    if (!acqDateStr || meta.isTaxExempt) {
      return { days: 0, rate: 0, tax: 0, netValue: Number(inv.estimatedValue || 0) };
    }

    const acqDate = new Date(acqDateStr);
    acqDate.setHours(0,0,0,0);
    const today = new Date();
    today.setHours(0,0,0,0);
    const diffTime = today.getTime() - acqDate.getTime();
    const days = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    let rate = 0.225; // 22.5%
    if (days > 720) {
      rate = 0.15; // 15%
    } else if (days > 360) {
      rate = 0.175; // 17.5%
    } else if (days > 180) {
      rate = 0.20; // 20%
    }

    const grossVal = Number(inv.estimatedValue || 0);
    const purchaseVal = Number(meta.purchaseValue) || Number(meta.initialInvestmentAmount) || grossVal;
    const profit = Math.max(0, grossVal - purchaseVal);
    const tax = profit * rate;
    const netValue = grossVal - tax;

    return { days, rate: rate * 100, tax, netValue };
  };

  const getInvestmentSubcategoryBreakdown = () => {
    const currentMonthStr = new Date().toISOString().substring(0, 7);
    const investmentTxs = transactions.filter(t => {
      const isCurrentMonth = t.date && t.date.substring(0, 7) === currentMonthStr;
      if (!isCurrentMonth) return false;
      const cat = (t.category || '').toLowerCase();
      return cat.includes('investimento') || cat.includes('empréstimo');
    });

    const categoriesMap: Record<string, { label: string; amount: number; color: string; tooltip: string }> = {
      'Aplicações / Aportes': {
        label: 'Aplicações / Aportes',
        amount: 0,
        color: 'bg-indigo-500',
        tooltip: 'Aportes destinados a novos títulos ou compra de cotas.'
      },
      'Rendimentos Mensais': {
        label: 'Rendimentos Mensais (Liquidez)',
        amount: 0,
        color: 'bg-emerald-500',
        tooltip: 'Dividendos, Juros sobre Capital Próprio ou cupons creditados diretamente no caixa.'
      },
      'Rendimentos Acumulados': {
        label: 'Rendimentos Acumulados',
        amount: 0,
        color: 'bg-teal-500',
        tooltip: 'Juros compostos ou ganhos de capital reinvestidos diretamente no próprio ativo.'
      },
      'Resgates Antecipados': {
        label: 'Resgates Antecipados',
        amount: 0,
        color: 'bg-amber-500',
        tooltip: 'Resgates ou retiradas parciais antes da data original de vencimento do título.'
      },
      'Resgates no Vencimento': {
        label: 'Resgates no Vencimento',
        amount: 0,
        color: 'bg-sky-500',
        tooltip: 'Resgates ou retiradas totais efetuados na data final de vencimento do título.'
      },
      'Imposto de Renda Retido': {
        label: 'Imposto de Renda Retido',
        amount: 0,
        color: 'bg-rose-500',
        tooltip: 'Dedução de Imposto de Renda (IR) retido na fonte incidente sobre os rendimentos.'
      },
      'Outros Débitos / Perdas': {
        label: 'Outros Débitos / Perdas',
        amount: 0,
        color: 'bg-slate-400',
        tooltip: 'Ajustes negativos de marcação a mercado, taxas ou perdas em renda variável.'
      }
    };

    investmentTxs.forEach(t => {
      const sub = (t.subcategory || '').toLowerCase();
      const type = t.type;
      const amt = Number(t.amount || 0);

      if (sub.includes('aporte') || sub.includes('aplica') || (type === 'EXPENSE' && !sub.includes('imposto') && !sub.includes('ir') && !sub.includes('taxa'))) {
        categoriesMap['Aplicações / Aportes'].amount += amt;
      } else if (sub.includes('mensal') || sub.includes('liquidez') || sub.includes('dividend') || sub.includes('cupom') || sub.includes('juros de capital')) {
        categoriesMap['Rendimentos Mensais'].amount += amt;
      } else if (sub.includes('acumulado') || sub.includes('reinvest')) {
        categoriesMap['Rendimentos Acumulados'].amount += amt;
      } else if (sub.includes('antecip')) {
        categoriesMap['Resgates Antecipados'].amount += amt;
      } else if (sub.includes('venciment') || sub.includes('resgate total')) {
        categoriesMap['Resgates no Vencimento'].amount += amt;
      } else if (sub.includes('imposto') || sub.includes('ir') || sub.includes('irrf') || sub.includes('tributo')) {
        categoriesMap['Imposto de Renda Retido'].amount += amt;
      } else {
        categoriesMap['Outros Débitos / Perdas'].amount += amt;
      }
    });

    const list = Object.values(categoriesMap).filter(c => c.amount > 0);
    const total = list.reduce((sum, item) => sum + item.amount, 0);

    const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date()).toUpperCase();

    return { list, total, monthLabel };
  };

  const getOrCreateCategory = async (userId: string, name: string, type: 'INCOME' | 'EXPENSE', color: string) => {
    if (!supabase) return null;
    const { data } = await supabase.from('categories')
      .select('id')
      .eq('user_id', userId)
      .eq('name', name)
      .eq('type', type)
      .maybeSingle();
    if (data) return data.id;
    const { data: newCat } = await supabase.from('categories').insert({
      user_id: userId,
      name,
      type,
      color
    }).select('id').maybeSingle();
    return newCat?.id || null;
  };

  const runAutoTransactionSync = async (userId: string, assets: any[], liabs: any[], txs: any[]) => {
    if (!supabase) return;
    // Impede execuções concorrentes (evita duplicação de lançamentos automáticos).
    if (autoSyncInFlight) return;
    autoSyncInFlight = true;
    try {
    // Busca todas as transações (incluindo deletadas) para auditar corretamente e evitar duplicar/recriar deletadas
    const { data: allLinkedTxs, error: linkedErr } = await supabase
      .from('transactions')
      .select('id, metadata, liability_id, is_deleted')
      .eq('user_id', userId);

    if (linkedErr) {
      console.error('Assets: Erro ao buscar transações vinculadas para sincronização', linkedErr);
      return;
    }
    const linkedTxs = allLinkedTxs || [];

    // 1. Asset Purchase Transactions
    for (const asset of assets) {
      if (asset.category === 'INVESTMENT' || asset.metadata?.isLoan || asset.is_archived) continue;
      // Imóveis NÃO geram lançamento de "Aquisição Ativo": a compra de um bem não é uma despesa
      // (é conversão de caixa em patrimônio). O valor já é contabilizado pelo registro do ativo
      // e pelo "Investimento Inicial" no balanço do imóvel. Isso também elimina a duplicação.
      if (asset.category === 'REAL_ESTATE') continue;
      const amount = Number(asset.metadata?.purchaseValue) || asset.estimatedValue;
      if (amount <= 0) continue;
      
      const hasPurchaseTx = linkedTxs.some((t: any) => 
        t.metadata?.linked_asset_id === asset.id && 
        t.metadata?.type === 'asset_purchase'
      );
      
      if (!hasPurchaseTx) {
        let catName = 'Outros';
        let catColor = 'bg-slate-50 text-slate-600';
        if (asset.category === 'REAL_ESTATE') {
          catName = 'Habitação';
          catColor = 'bg-emerald-50 text-emerald-600';
        } else if (asset.category === 'VEHICLE') {
          catName = 'Transporte';
          catColor = 'bg-blue-50 text-blue-600';
        }
        
        const catId = await getOrCreateCategory(userId, catName, 'EXPENSE', catColor);
        const dateStr = asset.acquisitionDate || DateUtils.formatToISODate();
        
        await supabase.from('transactions').insert([{
          user_id: userId,
          description: `Aquisição Ativo - ${asset.name}`,
          amount,
          date: dateStr,
          type: 'EXPENSE',
          category: catName,
          category_id: catId,
          is_paid: true,
          paid_amount: amount,
          paid_at: dateStr,
          metadata: {
            linked_asset_id: asset.id,
            type: 'asset_purchase',
            isCapitalized: true
          }
        }]);
      }
    }

    // 2. Liability Inflow Transactions
    for (const liab of liabs) {
      if (liab.is_archived || liab.totalAmount <= 0) continue;
      // Financiamento imobiliário (MORTGAGE) NÃO gera entrada de caixa: o banco paga o vendedor
      // diretamente, o dinheiro não passa pela conta do usuário. Evita inflar o caixa.
      // Consórcio (CONSORTIUM) também não: ao entrar no consórcio nenhum dinheiro é recebido —
      // só na contemplação (sorteio/lance) é que se recebe a carta de crédito, que nem é dinheiro
      // em conta. Tratar como entrada de caixa aqui infla receita e patrimônio líquido na hora
      // do cadastro, mesmo sem ter sido contemplado ainda.
      if (liab.type === 'MORTGAGE' || liab.type === 'CONSORTIUM') continue;

      const hasInflowTx = linkedTxs.some((t: any) =>
        (t.liability_id === liab.id || t.metadata?.liability_id === liab.id) &&
        t.metadata?.type === 'liability_inflow'
      );
      
      if (!hasInflowTx) {
        const catName = 'Empréstimos/Investimentos';
        const catColor = 'bg-brand-50 text-brand-600';
        const catId = await getOrCreateCategory(userId, catName, 'INCOME', catColor);
        
        let dateStr = DateUtils.formatToISODate();
        if (liab.createdAt) {
          const sep = liab.createdAt.includes('T') ? 'T' : ' ';
          dateStr = liab.createdAt.split(sep)[0];
        }
        
        await supabase.from('transactions').insert([{
          user_id: userId,
          description: `Recebimento de Empréstimo/Financiamento - ${liab.name}`,
          amount: liab.totalAmount,
          date: dateStr,
          type: 'INCOME',
          category: catName,
          category_id: catId,
          is_paid: true,
          paid_amount: liab.totalAmount,
          paid_at: dateStr,
          liability_id: liab.id,
          metadata: {
            liability_id: liab.id,
            type: 'liability_inflow',
            isCapitalized: true,
            linked_asset_id: liab.linkedAssetId || undefined
          }
        }]);
      }
    }

    // 3. Loan Asset Disbursements
    for (const asset of assets) {
      if (!asset.metadata?.isLoan || asset.is_archived) continue;
      const principal = Number(asset.metadata?.loanPrincipal) || 0;
      if (principal <= 0) continue;
      
      const hasDisbTx = linkedTxs.some((t: any) => 
        t.metadata?.linked_asset_id === asset.id && 
        t.metadata?.type === 'loan_disbursement'
      );
      
      if (!hasDisbTx) {
        const catName = 'Empréstimos/Investimentos';
        const catColor = 'bg-brand-50 text-brand-600';
        const catId = await getOrCreateCategory(userId, catName, 'EXPENSE', catColor);
        const dateStr = asset.acquisitionDate || DateUtils.formatToISODate();
        
        await supabase.from('transactions').insert([{
          user_id: userId,
          description: `Desembolso Empréstimo Concedido - ${asset.name}`,
          amount: principal,
          date: dateStr,
          type: 'EXPENSE',
          category_id: catId,
          category: catName,
          is_paid: true,
          paid_amount: principal,
          paid_at: dateStr,
          metadata: {
            linked_asset_id: asset.id,
            type: 'loan_disbursement',
            isCapitalized: true
          }
        }]);
      }
      
      // Gera as parcelas a receber (só no modelo Parcelado Fixo).
      // Conta Corrente (OPEN_BALANCE) NÃO gera parcelas: o saldo devedor é dinâmico —
      // juros pro-rata (simples ou composto) acumulam sobre o saldo e cada baixa
      // recalcula, via extrato (calcOpenBalance / handleGeneratePDF).
      const installmentsCount = Number(asset.metadata?.loanInstallmentsCount) || 0;
      const fixedInterestMonthly = Number(asset.metadata?.loanFixedValue) || 0;
      const loanRatePct = Number(asset.metadata?.loanInterestRate) || 0;
      const loanInterestType = asset.metadata?.loanInterestType || 'SIMPLE';
      const isOpenBalanceLoan = asset.metadata?.loanType === 'OPEN_BALANCE';
      const loanPrincipalForCalc = Number(asset.metadata?.loanPrincipal) || 0;
      const dueDate = Number(asset.metadata?.loanDueDate) || 10;

      // Valor da parcela: antes SÓ gerava se "Juros Fixo Mensal (R$)" fosse preenchido —
      // empréstimos com taxa em % (o caso comum) nunca ganhavam parcelas, silenciosamente.
      // E mesmo com juros fixo, a parcela era só o juros, sem devolver o principal.
      let monthlyValue = 0;
      if (!isOpenBalanceLoan && installmentsCount > 0 && loanPrincipalForCalc > 0) {
        const i = loanRatePct / 100;
        const n = installmentsCount;
        if (fixedInterestMonthly > 0) {
          // Juros fixo em R$: devolução do principal + juros fixo por mês
          monthlyValue = loanPrincipalForCalc / n + fixedInterestMonthly;
        } else if (i > 0) {
          monthlyValue = loanInterestType === 'COMPOUND'
            // Compostos: parcela fixa pela Tabela Price (quita principal + juros compostos)
            ? loanPrincipalForCalc * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1)
            // Simples: devolução do principal + juros simples sobre o principal original
            : loanPrincipalForCalc / n + loanPrincipalForCalc * i;
        } else {
          monthlyValue = loanPrincipalForCalc / n; // sem juros
        }
        monthlyValue = Math.round(monthlyValue * 100) / 100;
      }

      if (installmentsCount > 0 && monthlyValue > 0) {
        const hasInstallments = linkedTxs.some((t: any) => 
          t.metadata?.linked_asset_id === asset.id && 
          t.metadata?.type === 'loan_installment_provision'
        );
        
        if (!hasInstallments) {
          const catName = 'Empréstimos/Investimentos';
          const catColor = 'bg-brand-50 text-brand-600';
          const catId = await getOrCreateCategory(userId, catName, 'INCOME', catColor);
          const today = new Date();
          const futureTxs = [];
          
          for (let i = 1; i <= installmentsCount; i++) {
            // buildInstallmentDate prende o vencimento ao último dia do mês quando o dia
            // não existe (ex.: dia 31 em fevereiro), evitando que a parcela escorregue pro
            // mês seguinte. monthOffset = i mantém a 1ª parcela no mês que vem, como antes.
            const txDate = buildInstallmentDate(today.getFullYear(), today.getMonth(), i, dueDate);
            futureTxs.push({
              user_id: userId,
              description: `Recebimento Parcela ${i}/${installmentsCount} - ${asset.name}`,
              amount: monthlyValue,
              // formatToISODate respeita o fuso do aparelho; toISOString convertia pra UTC
              // e podia voltar a parcela um dia num fuso negativo (Brasil).
              date: DateUtils.formatToISODate(txDate),
              type: 'INCOME',
              category: catName,
              category_id: catId,
              is_paid: false,
              is_installment: true,
              installment_number: i,
              installment_total: installmentsCount,
              metadata: {
                auto_generated: true,
                installment_number: i,
                linked_asset_id: asset.id,
                type: 'loan_installment_provision'
              }
            });
          }
          await supabase.from('transactions').insert(futureTxs);
        }
      }
    }
    } finally {
      autoSyncInFlight = false;
    }
  };

  // Sync Rental Income Transactions: Activates/Deactivates starting from today forward
  // Wrapper fino sobre o motor compartilhado (components/assets/realEstatePropertySync.ts)
  // — mesma lógica usada por "Detalhes & Evolução", pra nunca mais divergir entre telas.
  const syncRentalTransactions = async (
    assetId: string,
    isRented: boolean,
    rentalIncome: number,
    assetName: string,
    userId: string,
    rentalType: 'anual' | 'short_stay' = 'anual',
    rentalDate: string = DateUtils.formatToISODate(),
    discountType: 'PERCENT' | 'VALUE' = 'VALUE',
    discountValue: number = 0
  ) => {
    await sharedSyncRentalTransactions({
      assetId,
      userId,
      assetName,
      isRented,
      rentalIncome,
      rentalType,
      rentalDate,
      discountType,
      discountValue
    });
  };

  const syncCondoIptuForAsset = async (params: {
    assetId: string;
    userId: string;
    assetName: string;
    propertyStage: 'PLANTA' | 'PRONTO';
    isRented: boolean;
    rentalType: 'anual' | 'short_stay';
    condoPayer: PayerOption;
    condoFee: number;
    condoNextDate: string;
    iptuPayer: PayerOption;
    iptuFee: number;
    iptuNextDate: string;
    iptuFrequency: 'monthly' | 'yearly';
  }) => {
    // Mesma regra usada em "Detalhes & Evolução": reembolso/inquilino direto só
    // valem no modelo de locação anual; fora disso o proprietário arca direto.
    const effCondoPayer: PayerOption = (params.isRented && params.rentalType === 'anual') ? params.condoPayer : 'PROPRIETARIO';
    const effIptuPayer: PayerOption = (params.isRented && params.rentalType === 'anual') ? params.iptuPayer : 'PROPRIETARIO';
    await syncCondoIptuTransactions({
      assetId: params.assetId,
      userId: params.userId,
      assetName: params.assetName,
      propertyStage: params.propertyStage,
      condoPayer: effCondoPayer,
      condoFee: params.condoFee,
      condoNextDate: params.condoNextDate,
      iptuPayer: effIptuPayer,
      iptuFee: params.iptuFee,
      iptuNextDate: params.iptuNextDate,
      iptuFrequency: params.iptuFrequency
    });
  };

  const syncVehicleTransactions = async (
    vehicleId: string,
    isNew: boolean,
    userId: string,
    formValues: typeof formData
  ) => {
    if (!supabase) return;
    try {
      const todayStr = DateUtils.formatToISODate();
      const categoryName = 'Ativos Físicos';
      let catId = '';
      
      // Buscar ou criar categoria "Ativos Físicos"
      const { data: existingCat } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', userId)
        .eq('name', categoryName)
        .maybeSingle();

      if (existingCat) {
        catId = existingCat.id;
      } else {
        const { data: c } = await supabase
          .from('categories')
          .insert({ user_id: userId, name: categoryName, type: 'EXPENSE', color: 'bg-indigo-50 text-indigo-600' })
          .select('id')
          .maybeSingle();
        if (c) catId = c.id;
      }

      // 1. Custo de Transferência (Apenas no cadastro inicial)
      const transFee = parseFloat(formValues.transferFee) || 0;
      if (isNew && transFee > 0) {
        await supabase.from('transactions').insert([{
          user_id: userId,
          description: `${formValues.name} - Taxa de Transferência/Doc`,
          amount: transFee,
          date: todayStr,
          type: 'EXPENSE',
          category: categoryName,
          subcategory: 'Transferência/Doc',
          category_id: catId || null,
          is_paid: true,
          paid_amount: transFee,
          paid_at: todayStr,
          metadata: { linked_asset_id: vehicleId, type: 'vehicle_transfer' }
        }]);
      }

      // 2. Limpar provisões futuras não pagas de IPVA, Seguro, Licenciamento, Aluguel e parcelas da venda para recalcular
      const { data: oldProvisions } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('is_paid', false)
        .eq('is_deleted', false)
        .eq('metadata->>linked_asset_id', vehicleId)
        .in('metadata->>type', ['vehicle_ipva', 'vehicle_seguro', 'vehicle_licenciamento', 'vehicle_rental_income', 'vehicle_sale_installment']);

      if (oldProvisions && oldProvisions.length > 0) {
        await supabase.from('transactions').delete().in('id', oldProvisions.map((p: any) => p.id));
      }

      // Se o veículo foi vendido, não geramos novas provisões de IPVA/Seguro/Aluguel futuros!
      if (formValues.isSold) {
        const soldAmount = parseFloat(formValues.soldValue) || 0;
        const comission = parseFloat(formValues.saleCommission || (formValues as any).saleComission) || 0;
        const saleDateStr = formValues.saleDate || todayStr;

        // Registrar comissão de venda (se houver)
        if (comission > 0) {
          await supabase.from('transactions').insert([{
            user_id: userId,
            description: `${formValues.name} - Comissão de Venda`,
            amount: comission,
            date: saleDateStr,
            type: 'EXPENSE',
            category: categoryName,
            subcategory: 'Comissão',
            category_id: catId || null,
            is_paid: true,
            paid_amount: comission,
            paid_at: saleDateStr,
            metadata: { linked_asset_id: vehicleId, type: 'vehicle_sale_comission' }
          }]);
        }

        // Registrar recebimento da venda
        let revenueCatId = '';
        const { data: revCat } = await supabase
          .from('categories')
          .select('id')
          .eq('user_id', userId)
          .eq('name', 'Venda de Ativos')
          .maybeSingle();
        if (revCat) {
          revenueCatId = revCat.id;
        } else {
          const { data: newCat } = await supabase
            .from('categories')
            .insert({ user_id: userId, name: 'Venda de Ativos', type: 'INCOME', color: 'bg-emerald-50 text-emerald-600' })
            .select('id')
            .maybeSingle();
          if (newCat) revenueCatId = newCat.id;
        }

        if (formValues.salePaymentMethod === 'A_VISTA' || formValues.salePaymentMethod === 'HIBRIDO') {
          // Valor à vista
          let cashVal = soldAmount;
          if (formValues.salePaymentMethod === 'HIBRIDO') {
            cashVal = parseFloat(formValues.saleCashAmount) || 0;
          }

          if (cashVal > 0) {
            await supabase.from('transactions').insert([{
              user_id: userId,
              description: formValues.salePaymentMethod === 'HIBRIDO'
                ? `${formValues.name} - Receita Venda de Veículo (Parte Dinheiro)`
                : `${formValues.name} - Receita Venda de Veículo (À Vista)`,
              amount: cashVal,
              date: saleDateStr,
              type: 'INCOME',
              category: 'Venda de Ativos',
              subcategory: 'Venda de Veículo',
              category_id: revenueCatId || null,
              is_paid: true,
              paid_amount: cashVal,
              paid_at: saleDateStr,
              metadata: { linked_asset_id: vehicleId, type: 'vehicle_sale_revenue' }
            }]);
          }
        } 
        else if (formValues.salePaymentMethod === 'PARCELADO') {
          const parcelas = 10; // 10 parcelas mensais padrão
          const valorParcela = soldAmount / parcelas;
          const newSaleInstallments = [];
          
          for (let i = 0; i < parcelas; i++) {
            const futureDate = new Date();
            futureDate.setMonth(futureDate.getMonth() + i);
            const futureDateStr = DateUtils.formatToISODate(futureDate);

            newSaleInstallments.push({
              user_id: userId,
              description: `${formValues.name} - Receita Parcelada Venda (${i+1}/${parcelas})`,
              amount: valorParcela,
              date: futureDateStr,
              type: 'INCOME',
              category: 'Venda de Ativos',
              subcategory: 'Venda de Veículo',
              category_id: revenueCatId || null,
              is_paid: false,
              metadata: { linked_asset_id: vehicleId, type: 'vehicle_sale_installment', installment: i+1 }
            });
          }
          if (newSaleInstallments.length > 0) {
            await supabase.from('transactions').insert(newSaleInstallments);
          }
        }

        // Criar bens de permuta automaticamente com vínculo de origem
        if (Array.isArray(formValues.permutaItems)) {
          const assetsToInsert = formValues.permutaItems
            .filter((item: any) => item.name && (parseFloat(item.value) || 0) > 0)
            .map((item: any) => ({
              user_id: userId,
              name: item.name,
              category: item.type,
              estimated_value: parseFloat(item.value) || 0,
              acquisition_date: saleDateStr,
              description: `Recebido em permuta na venda de ${formValues.name}`,
              metadata: {
                ...(item.type === 'REAL_ESTATE' ? { propertyStage: 'PRONTO', purpose: 'uso' } : { purpose: 'uso' }),
                permuta_origem_asset_id: vehicleId,
                permuta_original_value: parseFloat(item.value) || 0
              }
            }));
          if (assetsToInsert.length > 0) {
            await supabase.from('physical_assets').insert(assetsToInsert);
          }
        } else {
          // Fallback para campos antigos
          // Veículo
          const pVeicVal = parseFloat(formValues.permutaVeiculoValor) || 0;
          if (pVeicVal > 0 && formValues.permutaVeiculoNome) {
            await supabase.from('physical_assets').insert([{
              user_id: userId,
              name: formValues.permutaVeiculoNome,
              category: 'VEHICLE',
              estimated_value: pVeicVal,
              acquisition_date: saleDateStr,
              description: `Recebido em permuta na venda de ${formValues.name}`,
              metadata: { 
                purpose: 'uso',
                permuta_origem_asset_id: vehicleId,
                permuta_original_value: pVeicVal
              }
            }]);
          }
          // Imóvel
          const pImovVal = parseFloat(formValues.permutaImovelValor) || 0;
          if (pImovVal > 0 && formValues.permutaImovelNome) {
            await supabase.from('physical_assets').insert([{
              user_id: userId,
              name: formValues.permutaImovelNome,
              category: 'REAL_ESTATE',
              estimated_value: pImovVal,
              acquisition_date: saleDateStr,
              description: `Recebido em permuta na venda de ${formValues.name}`,
              metadata: { 
                propertyStage: 'PRONTO', 
                purpose: 'uso',
                permuta_origem_asset_id: vehicleId,
                permuta_original_value: pImovVal
              }
            }]);
          }
          // Outros bens
          const pOutrVal = parseFloat(formValues.permutaOutrosValor) || 0;
          if (pOutrVal > 0 && formValues.permutaOutrosNome) {
            await supabase.from('physical_assets').insert([{
              user_id: userId,
              name: formValues.permutaOutrosNome,
              category: 'OTHER',
              estimated_value: pOutrVal,
              acquisition_date: todayStr,
              description: `Recebido em permuta na venda de ${formValues.name}`,
              metadata: { 
                purpose: 'uso',
                permuta_origem_asset_id: vehicleId,
                permuta_original_value: pOutrVal
              }
            }]);
          }
        }

        // Se arquivamos/vendemos, encerramos as provisões normais
        return;
      }

      // Se NÃO está vendido, gerar provisões recorrentes se houver valores
      const ipva = parseFloat(formValues.ipvaFee) || 0;
      const seguro = parseFloat(formValues.seguroFee) || 0;
      const licenciamento = parseFloat(formValues.licenciamentoFee) || 0;

      // 3. Provisões de IPVA
      if (ipva > 0) {
        const isIPVACash = formValues.ipvaPaymentMethod === 'A_VISTA';
        const parcelasIPVA = isIPVACash ? 1 : (parseInt(formValues.ipvaInstallmentsCount, 10) || 5);
        const valorIPVA = ipva / parcelasIPVA;
        const newIpvaTxs = [];
        for (let i = 0; i < parcelasIPVA; i++) {
          const futureDate = new Date();
          futureDate.setMonth(futureDate.getMonth() + i);
          const futureDateStr = DateUtils.formatToISODate(futureDate);

          newIpvaTxs.push({
            user_id: userId,
            description: parcelasIPVA === 1
              ? `IPVA (À Vista) - ${formValues.name}`
              : `IPVA (${i+1}/${parcelasIPVA}) - ${formValues.name}`,
            amount: valorIPVA,
            date: futureDateStr,
            type: 'EXPENSE',
            category: categoryName,
            subcategory: 'IPVA',
            category_id: catId || null,
            is_paid: false,
            metadata: { linked_asset_id: vehicleId, type: 'vehicle_ipva' }
          });
        }
        await supabase.from('transactions').insert(newIpvaTxs);
      }

      // 4. Provisões de Seguro
      if (seguro > 0) {
        let parcelasSeguro = 10;
        let valorSeguro = seguro / 10;
        let isRecorrente = false;

        if (formValues.seguroPaymentMethod === 'A_VISTA') {
          parcelasSeguro = 1;
          valorSeguro = seguro;
        } else if (formValues.seguroPaymentMethod === 'RECORRENTE') {
          parcelasSeguro = 12; // Provisão de 12 meses futuros
          valorSeguro = seguro;
          isRecorrente = true;
        } else {
          parcelasSeguro = parseInt(formValues.seguroInstallmentsCount, 10) || 10;
          valorSeguro = seguro / parcelasSeguro;
        }

        const newSeguroTxs = [];
        for (let i = 0; i < parcelasSeguro; i++) {
          const futureDate = new Date();
          futureDate.setMonth(futureDate.getMonth() + i);
          const futureDateStr = DateUtils.formatToISODate(futureDate);

          newSeguroTxs.push({
            user_id: userId,
            description: formValues.seguroPaymentMethod === 'A_VISTA'
              ? `Seguro Veicular (À Vista) - ${formValues.name}`
              : isRecorrente
              ? `Seguro Veicular (Mensal) - ${formValues.name}`
              : `Seguro Veicular (${i+1}/${parcelasSeguro}) - ${formValues.name}`,
            amount: valorSeguro,
            date: futureDateStr,
            type: 'EXPENSE',
            category: categoryName,
            subcategory: 'Seguro',
            category_id: catId || null,
            is_paid: false,
            metadata: { linked_asset_id: vehicleId, type: 'vehicle_seguro' }
          });
        }
        await supabase.from('transactions').insert(newSeguroTxs);
      }

      // 5. Provisão de Licenciamento Anual (Uma vez por ano)
      if (licenciamento > 0) {
        const futureDate = new Date();
        futureDate.setMonth(futureDate.getMonth() + 3); // Vence daqui a 3 meses por exemplo
        const futureDateStr = DateUtils.formatToISODate(futureDate);

        await supabase.from('transactions').insert([{
          user_id: userId,
          description: `Licenciamento Anual - ${formValues.name}`,
          amount: licenciamento,
          date: futureDateStr,
          type: 'EXPENSE',
          category: categoryName,
          subcategory: 'Licenciamento',
          category_id: catId || null,
          is_paid: false,
          metadata: { linked_asset_id: vehicleId, type: 'vehicle_licenciamento' }
        }]);
      }

      // 6. Provisões de Aluguel (Se for investimento locação)
      const aluguel = parseFloat(formValues.rentalIncome) || 0;
      if (formValues.purpose === 'investimento' && formValues.vehiclePurposeType === 'RENTAL' && aluguel > 0) {
        const platFee = parseFloat(formValues.rentalPlatformFee) || 0;
        const aluguelLiquido = Math.max(0, aluguel - platFee);
        
        // Utiliza categoria de locação existente; cria se ainda não existir para nunca deixar category_id nulo
        const rentalCatId = await getOrCreateCategory(userId, 'Receita Operacional Imobiliária', 'INCOME', 'bg-emerald-50 text-emerald-600') || '';

        const newRentTxs = [];
        for (let i = 0; i < 24; i++) { // Provisão de 24 meses
          const futureDate = new Date();
          futureDate.setMonth(futureDate.getMonth() + i);
          const futureDateStr = DateUtils.formatToISODate(futureDate);

          newRentTxs.push({
            user_id: userId,
            description: `Receita Aluguel - ${formValues.name}`,
            amount: aluguelLiquido,
            date: futureDateStr,
            type: 'INCOME',
            category: 'Receita Operacional Imobiliária',
            subcategory: 'Aluguel Veículo',
            category_id: rentalCatId || null,
            is_paid: false,
            metadata: { linked_asset_id: vehicleId, type: 'vehicle_rental_income' }
          });
        }
        await supabase.from('transactions').insert(newRentTxs);
      }
    } catch (e) {
      console.error('Error syncing vehicle transactions:', e);
    }
  };

  const syncOtherAssetTransactions = async (
    otherId: string,
    isNew: boolean,
    userId: string,
    formValues: typeof formData
  ) => {
    if (!supabase) return;
    try {
      const todayStr = DateUtils.formatToISODate();
      const categoryName = 'Patrimônio';
      let catId = '';
      
      // Buscar ou criar categoria "Patrimônio"
      const { data: existingCat } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', userId)
        .eq('name', categoryName)
        .maybeSingle();

      if (existingCat) {
        catId = existingCat.id;
      } else {
        const { data: c } = await supabase
          .from('categories')
          .insert({ user_id: userId, name: categoryName, type: 'EXPENSE', color: 'bg-slate-50 text-slate-600' })
          .select('id')
          .maybeSingle();
        if (c) catId = c.id;
      }

      // Limpar provisões futuras não pagas de Aluguel/Rendimento e parcelas da venda para recalcular
      const { data: oldProvisions } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('is_paid', false)
        .eq('is_deleted', false)
        .eq('metadata->>linked_asset_id', otherId)
        .in('metadata->>type', ['other_rental_income', 'other_sale_installment']);

      if (oldProvisions && oldProvisions.length > 0) {
        await supabase.from('transactions').delete().in('id', oldProvisions.map((p: any) => p.id));
      }

      // Se o bem foi vendido, não geramos rendimentos futuros
      if (formValues.isSold) {
        const soldAmount = parseFloat(formValues.soldValue) || 0;
        const comission = parseFloat(formValues.saleCommission || (formValues as any).saleComission) || 0;
        const saleDateStr = formValues.saleDate || todayStr;

        // Registrar comissão de venda (se houver)
        if (comission > 0) {
          await supabase.from('transactions').insert([{
            user_id: userId,
            description: `${formValues.name} - Comissão de Venda`,
            amount: comission,
            date: saleDateStr,
            type: 'EXPENSE',
            category: categoryName,
            subcategory: 'Comissão',
            category_id: catId || null,
            is_paid: true,
            paid_amount: comission,
            paid_at: saleDateStr,
            metadata: { linked_asset_id: otherId, type: 'other_sale_comission' }
          }]);
        }

        // Registrar recebimento da venda
        let revenueCatId = '';
        const { data: revCat } = await supabase
          .from('categories')
          .select('id')
          .eq('user_id', userId)
          .eq('name', 'Venda de Ativos')
          .maybeSingle();
        if (revCat) {
          revenueCatId = revCat.id;
        } else {
          const { data: newCat } = await supabase
            .from('categories')
            .insert({ user_id: userId, name: 'Venda de Ativos', type: 'INCOME', color: 'bg-emerald-50 text-emerald-600' })
            .select('id')
            .maybeSingle();
          if (newCat) revenueCatId = newCat.id;
        }

        if (formValues.salePaymentMethod === 'A_VISTA' || formValues.salePaymentMethod === 'HIBRIDO') {
          // Valor à vista
          let cashVal = soldAmount;
          if (formValues.salePaymentMethod === 'HIBRIDO') {
            cashVal = parseFloat(formValues.saleCashAmount) || 0;
          }

          if (cashVal > 0) {
            await supabase.from('transactions').insert([{
              user_id: userId,
              description: formValues.salePaymentMethod === 'HIBRIDO'
                ? `${formValues.name} - Receita Venda de Ativo (Parte Dinheiro)`
                : `${formValues.name} - Receita Venda de Ativo (À Vista)`,
              amount: cashVal,
              date: saleDateStr,
              type: 'INCOME',
              category: 'Venda de Ativos',
              subcategory: 'Venda de Outros Bens',
              category_id: revenueCatId || null,
              is_paid: true,
              paid_amount: cashVal,
              paid_at: saleDateStr,
              metadata: { linked_asset_id: otherId, type: 'other_sale_revenue' }
            }]);
          }
        } 
        else if (formValues.salePaymentMethod === 'PARCELADO') {
          const parcelas = 10; // 10 parcelas mensais padrão
          const valorParcela = soldAmount / parcelas;
          const newSaleInstallments = [];
          
          for (let i = 0; i < parcelas; i++) {
            const futureDate = new Date();
            futureDate.setMonth(futureDate.getMonth() + i);
            const futureDateStr = DateUtils.formatToISODate(futureDate);

            newSaleInstallments.push({
              user_id: userId,
              description: `${formValues.name} - Receita Parcelada Venda (${i+1}/${parcelas})`,
              amount: valorParcela,
              date: futureDateStr,
              type: 'INCOME',
              category: 'Venda de Ativos',
              subcategory: 'Venda de Outros Bens',
              category_id: revenueCatId || null,
              is_paid: false,
              metadata: { linked_asset_id: otherId, type: 'other_sale_installment', installment: i+1 }
            });
          }
          if (newSaleInstallments.length > 0) {
            await supabase.from('transactions').insert(newSaleInstallments);
          }
        }

        // Criar bens de permuta automaticamente com vínculo de origem
        if (Array.isArray(formValues.permutaItems)) {
          const assetsToInsert = formValues.permutaItems
            .filter((item: any) => item.name && (parseFloat(item.value) || 0) > 0)
            .map((item: any) => ({
              user_id: userId,
              name: item.name,
              category: item.type,
              estimated_value: parseFloat(item.value) || 0,
              acquisition_date: saleDateStr,
              description: `Recebido em permuta na venda de ${formValues.name}`,
              metadata: {
                ...(item.type === 'REAL_ESTATE' ? { propertyStage: 'PRONTO', purpose: 'uso' } : { purpose: 'uso' }),
                permuta_origem_asset_id: otherId,
                permuta_original_value: parseFloat(item.value) || 0
              }
            }));
          if (assetsToInsert.length > 0) {
            await supabase.from('physical_assets').insert(assetsToInsert);
          }
        }

        // Se arquivamos/vendemos, encerramos as provisões normais
        return;
      }

      // Provisões de Rendimento (Se for investimento locação / rendimento periódico)
      const rendimento = parseFloat(formValues.rentalIncome) || 0;
      if (formValues.purpose === 'investimento' && formValues.vehiclePurposeType === 'RENTAL' && rendimento > 0 && formValues.isRented) {
        const platFee = parseFloat(formValues.rentalPlatformFee) || 0;
        const rendimentoLiquido = Math.max(0, rendimento - platFee);
        
        let rentalCatId = '';
        const { data: rentCat } = await supabase
          .from('categories')
          .select('id')
          .eq('user_id', userId)
          .eq('name', 'Rendimento de Bens Físicos')
          .maybeSingle();

        if (rentCat) {
          rentalCatId = rentCat.id;
        } else {
          const { data: newCat } = await supabase
            .from('categories')
            .insert({ user_id: userId, name: 'Rendimento de Bens Físicos', type: 'INCOME', color: 'bg-emerald-50 text-emerald-600' })
            .select('id')
            .maybeSingle();
          if (newCat) rentalCatId = newCat.id;
        }

        const newRentTxs = [];
        for (let i = 0; i < 24; i++) { // Provisão de 24 meses
          const futureDate = new Date();
          futureDate.setMonth(futureDate.getMonth() + i);
          const futureDateStr = DateUtils.formatToISODate(futureDate);

          newRentTxs.push({
            user_id: userId,
            description: `Rendimento Mensal - ${formValues.name}`,
            amount: rendimentoLiquido,
            date: futureDateStr,
            type: 'INCOME',
            category: 'Rendimento de Bens Físicos',
            subcategory: 'Rendimento',
            category_id: rentalCatId || null,
            is_paid: false,
            metadata: { linked_asset_id: otherId, type: 'other_rental_income' }
          });
        }
        await supabase.from('transactions').insert(newRentTxs);
      }
    } catch (e) {
      console.error('Error syncing other asset transactions:', e);
    }
  };

  // Safe Property status toggle
  const togglePropertyTypeDirectly = async (asset: PhysicalAsset) => {
    if (!supabase) return;
    const meta = asset.metadata || {};
    const newStage = meta.propertyStage === 'PLANTA' ? 'PRONTO' : 'PLANTA';
    
    // Requirement 3: Switch from PLANTA to PRONTO sets isRented to false (disabled) by default.
    const updatedMeta = {
      ...meta,
      propertyStage: newStage,
      isRented: false // Deactivated by default on toggle!
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (user) {
        await syncRentalTransactions(
          asset.id,
          false, // Deactivated aluguel
          0,
          asset.name,
          user.id,
          meta.rentalType || 'anual',
          meta.rentalDate || DateUtils.formatToISODate()
        );

        // Vira PRONTO com financiamento/consórcio já configurado no cadastro (PLANTA)?
        // Sincroniza o passivo agora — antes disso, esse cenário só era sincronizado
        // se o usuário passasse pelo formulário completo de edição, e o toggle rápido
        // (este botão) deixava o financiamento "fantasma": só no metadata, sem passivo
        // nem parcelas em Transações.
        if (newStage === 'PRONTO' && meta.deliveryPaymentMethod) {
          const { data: existingLiabs } = await supabase
            .from('liabilities')
            .select('*')
            .eq('linked_asset_id', asset.id);
          const linkedLiab = (existingLiabs || [])[0] || null;

          if (meta.deliveryPaymentMethod === 'FINANCIAMENTO') {
            const instCount = parseInt(meta.financingInstallmentsCount, 10) || 240;
            const instAmount = parseFloat(meta.financingInstallment) || 0;
            const originalTotal = parseFloat(meta.financingOriginalTotal) || parseFloat(meta.deliveryBalance) || 0;
            const dueDayVal = parseInt(meta.financingDueDay, 10) || 10;
            const finName = meta.financingName || `Financiamento: ${asset.name}`;

            if (linkedLiab && linkedLiab.type === 'MORTGAGE') {
              await supabase.from('liabilities').update({
                name: finName,
                total_amount: originalTotal,
                remaining_balance: parseFloat(meta.deliveryBalance) || originalTotal,
                installment_amount: instAmount,
                installments_remaining: instCount,
                due_day: dueDayVal,
                metadata: { ...linkedLiab.metadata, propertyType: 'PRONTO', isRealEstate: true }
              }).eq('id', linkedLiab.id);
            } else {
              if (linkedLiab) {
                await supabase.from('liabilities').update({ linked_asset_id: null }).eq('id', linkedLiab.id);
              }
              await supabase.from('liabilities').insert([{
                user_id: user.id,
                name: finName,
                type: 'MORTGAGE',
                total_amount: originalTotal,
                remaining_balance: parseFloat(meta.deliveryBalance) || originalTotal,
                installment_amount: instAmount,
                installments_remaining: instCount,
                due_day: dueDayVal,
                linked_asset_id: asset.id,
                metadata: { propertyType: 'PRONTO', isRealEstate: true }
              }]);
            }

            if (instAmount <= 0) {
              toast('Financiamento vinculado, mas sem valor de parcela definido — abra "Editar" e informe o valor para gerar as cobranças.', 'warning');
            }
          } else if (meta.deliveryPaymentMethod === 'CONSORCIO' && meta.selectedConsortiumId) {
            if (linkedLiab && linkedLiab.id !== meta.selectedConsortiumId) {
              await supabase.from('liabilities').update({ linked_asset_id: null }).eq('id', linkedLiab.id);
            }
            await supabase.from('liabilities').update({
              linked_asset_id: asset.id,
              metadata: { propertyType: 'PRONTO', isRealEstate: true }
            }).eq('id', meta.selectedConsortiumId);
          }
        }
      }

      const { error } = await supabase
        .from('physical_assets')
        .update({ metadata: updatedMeta })
        .eq('id', asset.id);

      if (error) throw error;
      fetchData();
    } catch (err: any) {
      toast(`Erro ao atualizar status: ${err.message}`, 'error');
    }
  };

  const handleRedeemInvestment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !selectedAssetForResgate) return;
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    try {
      const asset = selectedAssetForResgate;
      const isTotal = resgateForm.type === 'TOTAL';
      const amountToRedeem = isTotal 
        ? (asset.netValue || Number(asset.estimatedValue || 0)) 
        : (parseFloat(resgateForm.amount) || 0);

      if (amountToRedeem <= 0) {
        toast('Por favor, informe um valor de resgate maior que zero.', 'warning');
        return;
      }

      const currentEstimated = Number(asset.estimatedValue || 0);
      if (amountToRedeem > currentEstimated) {
        toast('O valor de resgate não pode ser maior do que o Saldo Bruto Atual.', 'warning');
        return;
      }

      const targetAccountId = resgateForm.destinationAccountId;
      const todayStr = DateUtils.formatToISODate();

      // 1. Atualizar o Ativo Físico
      if (isTotal || amountToRedeem === currentEstimated) {
        // Resgate Total: Marcar como RESGATADO e zerar o estimated_value
        const { error: assetErr } = await supabase
          .from('physical_assets')
          .update({
            estimated_value: 0,
            metadata: {
              ...(asset.metadata || {}),
              status: 'RESGATADO',
              resgateDate: todayStr,
              resgateAmount: amountToRedeem
            }
          })
          .eq('id', asset.id);
        
        if (assetErr) throw assetErr;
      } else {
        // Resgate Parcial: Reduzir estimated_value e purchaseValue proporcionalmente
        const newEstimatedValue = Math.max(0, currentEstimated - amountToRedeem);
        const oldPurchase = Number(asset.metadata?.purchaseValue || asset.metadata?.initialInvestmentAmount || currentEstimated);
        const newPurchaseValue = Math.max(0, oldPurchase * (newEstimatedValue / currentEstimated));

        const { error: assetErr } = await supabase
          .from('physical_assets')
          .update({
            estimated_value: newEstimatedValue,
            metadata: {
              ...(asset.metadata || {}),
              purchaseValue: newPurchaseValue,
              initialInvestmentAmount: newPurchaseValue
            }
          })
          .eq('id', asset.id);

        if (assetErr) throw assetErr;
      }

      // 2. Se houver conta destino, somar o dinheiro ao caixa livre (initial_balance)
      if (targetAccountId) {
        const { data: accRes, error: accGetErr } = await supabase
          .from('accounts')
          .select('initial_balance, current_balance')
          .eq('id', targetAccountId)
          .single();

        if (accGetErr) throw accGetErr;

        const currentInitial = Number(accRes?.initial_balance || 0);
        const newInitial = currentInitial + amountToRedeem;

        const { error: accUpdErr } = await supabase
          .from('accounts')
          .update({ initial_balance: newInitial })
          .eq('id', targetAccountId);

        if (accUpdErr) throw accUpdErr;
      }

      // 3. Criar Transação de Receita
      let catId = null;
      const { data: catRes } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', 'Investimentos')
        .maybeSingle();

      if (catRes) {
        catId = catRes.id;
      } else {
        const { data: newCat } = await supabase
          .from('categories')
          .insert({
            user_id: user.id,
            name: 'Investimentos',
            type: 'INCOME',
            color: 'bg-indigo-50 text-indigo-600'
          })
          .select('id')
          .maybeSingle();
        if (newCat) catId = newCat.id;
      }

      const desc = isTotal 
        ? `Resgate Total Investimento - ${asset.name}` 
        : `Resgate Parcial Investimento - ${asset.name}`;

      const { error: txErr } = await supabase.from('transactions').insert([{
        user_id: user.id,
        description: desc,
        amount: amountToRedeem,
        date: todayStr,
        type: 'TRANSFER',
        category: 'Investimentos',
        subcategory: 'Resgate',
        category_id: catId,
        is_paid: true,
        paid_amount: amountToRedeem,
        paid_at: todayStr,
        account_id: targetAccountId || null,
        account_name: targetAccountId ? (allAccounts.find(a => a.id === targetAccountId)?.institution || allAccounts.find(a => a.id === targetAccountId)?.name || null) : null,
        metadata: {
          linked_asset_id: asset.id,
          type: isTotal ? 'investment_redemption_total' : 'investment_redemption_partial',
          redeemed_amount: amountToRedeem,
          isCapitalized: true
        }
      }]);

      if (txErr) throw txErr;

      // 4. Sincronizar o saldo consolidado (current_balance) para as contas envolvidas
      const originAccountId = asset.metadata?.brokerAccountId;
      
      const syncBroker = async (brokerId: string) => {
        if (!brokerId) return;
        const [allInvestsRes, brokerAccRes] = await Promise.all([
          supabase
            .from('physical_assets')
            .select('estimated_value, metadata')
            .eq('user_id', user.id)
            .eq('category', 'INVESTMENT')
            .eq('is_archived', false),
          supabase
            .from('accounts')
            .select('initial_balance')
            .eq('id', brokerId)
            .eq('user_id', user.id)
            .maybeSingle()
        ]);

        const brokerCash = Number(brokerAccRes.data?.initial_balance || 0);
        const investedTotal = (allInvestsRes.data || [])
          .filter((inv: any) =>
            inv.metadata?.brokerAccountId === brokerId &&
            inv.metadata?.status !== 'RESGATADO'
          )
          .reduce((sum: number, inv: any) => sum + Number(inv.estimated_value || 0), 0);

        await supabase
          .from('accounts')
          .update({ current_balance: brokerCash + investedTotal })
          .eq('id', brokerId)
          .eq('user_id', user.id);
      };

      await syncBroker(originAccountId);
      if (targetAccountId && targetAccountId !== originAccountId) {
        await syncBroker(targetAccountId);
      }

      setShowResgateModal(false);
      setSelectedAssetForResgate(null);
      setResgateForm({ type: 'TOTAL', amount: '', destinationAccountId: '' });
      fetchData();
      toast('Resgate processado com sucesso!', 'success');
    } catch (err: any) {
      toast(`Erro ao resgatar investimento: ${err.message}`, 'error');
    }
  };

  // Trava contra salvamento concorrente (duplo-clique, duplo-submit do form) — ver
  // saveAssetInFlight acima. A lógica original fica intacta em handleSaveAssetInner;
  // este wrapper só garante que ela nunca rode duas vezes ao mesmo tempo.
  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveAssetInFlight) return;
    saveAssetInFlight = true;
    if (isMountedRef.current) setSavingAssetUi(true);
    try {
      await handleSaveAssetInner(e);
    } finally {
      saveAssetInFlight = false;
      if (isMountedRef.current) setSavingAssetUi(false);
    }
  };

  const handleSaveAssetInner = async (e: React.FormEvent) => {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    try {
      if (formData.isSold) {
        const soldVal = parseFloat(formData.soldValue) || 0;
        if (soldVal <= 0) {
          toast('Por favor, informe um valor de venda maior que zero.', 'warning');
          return;
        }

        if (formData.salePaymentMethod === 'HIBRIDO') {
          const cashVal = parseFloat(formData.saleCashAmount) || 0;
          const permutaTotal = (formData.permutaItems || []).reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
          if (Math.abs(soldVal - (cashVal + permutaTotal)) > 0.01) {
            toast(`Inconsistência de valores na venda: O valor de venda (R$ ${soldVal.toLocaleString('pt-BR')}) deve ser igual à soma do valor em dinheiro (R$ ${cashVal.toLocaleString('pt-BR')}) + permutas (R$ ${permutaTotal.toLocaleString('pt-BR')}).`, 'warning');
            return;
          }
        } else if (formData.salePaymentMethod === 'PERMUTA') {
          const permutaTotal = (formData.permutaItems || []).reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
          if (Math.abs(soldVal - permutaTotal) > 0.01) {
            toast(`Inconsistência de valores na venda: O valor de venda (R$ ${soldVal.toLocaleString('pt-BR')}) deve ser igual à soma dos bens em permuta (R$ ${permutaTotal.toLocaleString('pt-BR')}).`, 'warning');
            return;
          }
        }
      }

      const isRealEstate = formData.category === 'REAL_ESTATE';
      
      const value = isRealEstate && editingAsset 
        ? editingAsset.estimatedValue 
        : (formData.isLoan
            ? (parseFloat(formData.loanPrincipal) || 0)
            : (parseFloat(formData.estimatedValue) || 0));
        
      const purchaseVal = isRealEstate && editingAsset 
        ? (parseFloat(editingAsset.metadata?.purchaseValue) || 0)
        : (formData.isLoan
            ? (parseFloat(formData.loanPrincipal) || 0)
            : (parseFloat(formData.purchaseValue) || 0));
        
      const acqDate = isRealEstate && editingAsset
        ? editingAsset.acquisitionDate
        : (formData.acquisitionDate || null);

      const fipeVal = parseFloat(formData.fipeValue) || 0;
      const brokerFeeVal = parseFloat(formData.brokerFee) || 0;
      const soldVal = parseFloat(formData.soldValue) || 0;
      
      // If real estate, isRented should only be true if purpose is investimento
      const finalIsRented = isRealEstate && formData.purpose === 'uso' ? false : formData.isRented;
      const rentVal = isRealEstate && formData.purpose === 'uso' ? 0 : (parseFloat(formData.rentalIncome) || 0);

      // Loans
      const loanPrincipalVal = parseFloat(formData.loanPrincipal) || 0;
      const loanInterestRateVal = parseFloat(formData.loanInterestRate) || 0;
      const loanFixedValueVal = parseFloat(formData.loanFixedValue) || 0;

      // Base metadata from form
      const metadata: Record<string, any> = {
        purpose: formData.purpose,
        purchaseValue: purchaseVal,
        fipeValue: fipeVal,
        brokerFee: brokerFeeVal,
        isSold: formData.isSold,
        soldValue: soldVal,
        // Pre-construction
        propertyStage: isRealEstate ? formData.propertyStage : undefined,
        indexType: formData.indexType,
        balloons: formData.balloons,
        constructorIndexType: isRealEstate && formData.propertyStage === 'PLANTA' ? formData.constructorIndexType : undefined,
        constructorIndexRate: isRealEstate && formData.propertyStage === 'PLANTA' ? (parseFloat(formData.constructorIndexRate) || 0) : undefined,
        // Rental
        isRented: finalIsRented,
        rentalIncome: rentVal,
        rentalType: formData.rentalType,
        rentalDate: formData.rentalDate,
        discountType: isRealEstate ? formData.discountType : undefined,
        discountValue: isRealEstate ? (parseFloat(formData.discountValue) || 0) : undefined,
        // Condomínio / IPTU
        condoFee: isRealEstate ? (parseFloat(formData.condoFee) || 0) : undefined,
        iptuFee: isRealEstate ? (parseFloat(formData.iptuFee) || 0) : undefined,
        condoPayer: isRealEstate ? formData.condoPayer : undefined,
        iptuPayer: isRealEstate ? formData.iptuPayer : undefined,
        condoNextDate: isRealEstate ? formData.condoNextDate : undefined,
        iptuNextDate: isRealEstate ? formData.iptuNextDate : undefined,
        iptuFrequency: isRealEstate ? formData.iptuFrequency : undefined,
        inquilinoPaysCondo: isRealEstate ? formData.condoPayer === 'INQUILINO_DIRETO' : undefined,
        inquilinoPaysIPTU: isRealEstate ? formData.iptuPayer === 'INQUILINO_DIRETO' : undefined,
        // Loan details
        isLoan: formData.isLoan,
        loanType: formData.isLoan ? (formData.loanType || 'INSTALLMENTS') : undefined,
        loanPrincipal: loanPrincipalVal,
        loanInterestType: formData.loanInterestType,
        loanInterestRate: loanInterestRateVal,
        loanFixedValue: loanFixedValueVal,
        loanDueDate: formData.loanDueDate,
        loanDebtor: formData.loanDebtor,
        loanInstallmentsCount: (formData.isLoan && formData.loanType !== 'OPEN_BALANCE') ? (parseInt(formData.loanInstallmentsCount, 10) || 12) : undefined,
        // Financing / Consortium details
        deliveryPaymentMethod: isRealEstate ? formData.deliveryPaymentMethod : undefined,
        deliveryBalance: isRealEstate ? (parseFloat(formData.deliveryBalance) || 0) : undefined,
        selectedConsortiumId: (isRealEstate || formData.category === 'VEHICLE') ? (formData.selectedConsortiumId || undefined) : undefined,
        consortiumAllocationRatio: (isRealEstate || formData.category === 'VEHICLE') && formData.selectedConsortiumId ? (parseFloat(formData.consortiumAllocationRatio) || 100) : undefined,
        financingInstallment: isRealEstate ? (parseFloat(formData.financingInstallment) || 0) : undefined,
        financingInstallmentsCount: isRealEstate ? (parseInt(formData.financingInstallmentsCount, 10) || 0) : undefined,
        financingDueDay: isRealEstate ? formData.financingDueDay : undefined,
        financingName: isRealEstate ? formData.financingName : undefined,
        financingOriginalTotal: isRealEstate ? (parseFloat(formData.financingOriginalTotal) || 0) : undefined,
        // Vehicle details
        vehicleType: formData.category === 'VEHICLE' ? formData.vehicleType : undefined,
        licensePlate: formData.category === 'VEHICLE' ? formData.licensePlate : undefined,
        renavam: formData.category === 'VEHICLE' ? formData.renavam : undefined,
        yearModel: formData.category === 'VEHICLE' ? formData.yearModel : undefined,
        mileage: formData.category === 'VEHICLE' ? (parseFloat(formData.mileage) || 0) : undefined,
        transferFee: formData.category === 'VEHICLE' ? (parseFloat(formData.transferFee) || 0) : undefined,
        vehiclePurposeType: (formData.category === 'VEHICLE' || formData.category === 'OTHER') && formData.purpose === 'investimento' ? formData.vehiclePurposeType : undefined,
        ipvaFee: formData.category === 'VEHICLE' ? (parseFloat(formData.ipvaFee) || 0) : undefined,
        ipvaPaymentMethod: formData.category === 'VEHICLE' ? formData.ipvaPaymentMethod : undefined,
        ipvaInstallmentsCount: formData.category === 'VEHICLE' ? (parseInt(formData.ipvaInstallmentsCount, 10) || 5) : undefined,
        seguroFee: formData.category === 'VEHICLE' ? (parseFloat(formData.seguroFee) || 0) : undefined,
        seguroPaymentMethod: formData.category === 'VEHICLE' ? formData.seguroPaymentMethod : undefined,
        seguroInstallmentsCount: formData.category === 'VEHICLE' ? (parseInt(formData.seguroInstallmentsCount, 10) || 10) : undefined,
        licenciamentoFee: formData.category === 'VEHICLE' ? (parseFloat(formData.licenciamentoFee) || 0) : undefined,
        maintenanceMonthlyEstimated: (formData.category === 'VEHICLE' || formData.category === 'OTHER') ? (parseFloat(formData.maintenanceMonthlyEstimated) || 0) : undefined,
        rentalPlatformFee: (formData.category === 'VEHICLE' || formData.category === 'OTHER') && formData.purpose === 'investimento' ? (parseFloat(formData.rentalPlatformFee) || 0) : undefined,
        targetSaleValue: (formData.category === 'VEHICLE' || formData.category === 'OTHER') && formData.purpose === 'investimento' ? (parseFloat(formData.targetSaleValue) || 0) : undefined,
        preparationBudget: (formData.category === 'VEHICLE' || formData.category === 'OTHER') && formData.purpose === 'investimento' ? (parseFloat(formData.preparationBudget) || 0) : undefined,
        saleCommission: formData.isSold ? (parseFloat(formData.saleCommission) || 0) : undefined,
        saleComission: formData.isSold ? (parseFloat(formData.saleCommission) || 0) : undefined, // legacy compatibility
        salePaymentMethod: formData.isSold ? formData.salePaymentMethod : undefined,
        permutaVeiculoValor: formData.isSold ? (parseFloat(formData.permutaVeiculoValor) || 0) : undefined,
        permutaVeiculoNome: formData.isSold ? formData.permutaVeiculoNome : undefined,
        permutaImovelValor: formData.isSold ? (parseFloat(formData.permutaImovelValor) || 0) : undefined,
        permutaImovelNome: formData.isSold ? formData.permutaImovelNome : undefined,
        permutaOutrosValor: formData.isSold ? (parseFloat(formData.permutaOutrosValor) || 0) : undefined,
        permutaOutrosNome: formData.isSold ? formData.permutaOutrosNome : undefined,
        permutaItems: formData.isSold ? formData.permutaItems : undefined,
        saleDate: formData.isSold ? formData.saleDate : undefined,
        saleCashAmount: formData.isSold ? (parseFloat(formData.saleCashAmount) || 0) : undefined,
        // Advanced OTHER technical and custody fields
        brandModel: formData.category === 'OTHER' ? formData.brandModel : undefined,
        serialNumber: formData.category === 'OTHER' ? formData.serialNumber : undefined,
        custodyLocation: formData.category === 'OTHER' ? formData.custodyLocation : undefined,
        insurancePolicy: formData.category === 'OTHER' ? formData.insurancePolicy : undefined,
        certificateLink: formData.category === 'OTHER' ? formData.certificateLink : undefined,
        depreciationRate: formData.category === 'OTHER' && formData.purpose === 'uso' ? (parseFloat(formData.depreciationRate) || 0) : undefined,
        isDepreciable: formData.category === 'OTHER' && formData.purpose === 'uso' ? !!formData.isDepreciable : undefined,
        iconKey: formData.category === 'OTHER' ? formData.iconKey : undefined,
        // Investment-specific fields
        investmentType: formData.category === 'INVESTMENT' ? formData.investmentType : undefined,
        interestType: formData.category === 'INVESTMENT' ? formData.interestType : undefined,
        yieldRate: formData.category === 'INVESTMENT' ? formData.yieldRate : undefined,
        payoutType: formData.category === 'INVESTMENT' ? formData.payoutType : undefined,
        brokerAccountId: formData.category === 'INVESTMENT' ? formData.brokerAccountId : undefined,
        vencimentoDate: formData.category === 'INVESTMENT' ? formData.vencimentoDate : undefined,
        investmentLiquidity: formData.category === 'INVESTMENT' ? formData.investmentLiquidity : undefined,
        status: formData.category === 'INVESTMENT' ? (formData.status || 'ATIVO') : undefined,
      };

      // Preserve existing real estate evolution details if editing — condo/IPTU/
      // discount NÃO entram mais aqui: agora são editados em "Editar" (acima) e
      // não devem ser sobrescritos pelo valor antigo.
      if (isRealEstate && editingAsset) {
        const oldMeta = editingAsset.metadata || {};
        metadata.historicalPaidAmount = oldMeta.historicalPaidAmount;
        metadata.historicalRentReceived = oldMeta.historicalRentReceived;
        metadata.valuationHistory = oldMeta.valuationHistory;
        metadata.shortStayBookings = oldMeta.shortStayBookings;
        metadata.despesasCartorarias = oldMeta.despesasCartorarias;
        metadata.mobiliarios = oldMeta.mobiliarios;
        // Preserve constructor details
        metadata.constructorAmount = oldMeta.constructorAmount;
        metadata.constructorStartDate = oldMeta.constructorStartDate;
        metadata.constructorInstallmentsCount = oldMeta.constructorInstallmentsCount;
      }

      let assetId = '';

      if (editingAsset) {
        const isInvestmentRedemptionTransition = 
          formData.category === 'INVESTMENT' && 
          formData.status === 'RESGATADO' && 
          editingAsset.metadata?.status !== 'RESGATADO';

        const finalEstimatedValue = isInvestmentRedemptionTransition ? 0 : value;

        if (isInvestmentRedemptionTransition) {
          const targetAccountId = formData.brokerAccountId;
          if (targetAccountId) {
            const { data: accRes } = await supabase
              .from('accounts')
              .select('initial_balance')
              .eq('id', targetAccountId)
              .single();
            
            if (accRes) {
              const currentInitial = Number(accRes.initial_balance || 0);
              await supabase
                .from('accounts')
                .update({ initial_balance: currentInitial + value })
                .eq('id', targetAccountId);
            }
          }

          let catId = null;
          const { data: catRes } = await supabase
            .from('categories')
            .select('id')
            .eq('user_id', user.id)
            .eq('name', 'Investimentos')
            .maybeSingle();

          if (catRes) {
            catId = catRes.id;
          } else {
            const { data: newCat } = await supabase
              .from('categories')
              .insert({
                user_id: user.id,
                name: 'Investimentos',
                type: 'INCOME',
                color: 'bg-indigo-50 text-indigo-600'
              })
              .select('id')
              .maybeSingle();
            if (newCat) catId = newCat.id;
          }

          const todayStr = DateUtils.formatToISODate();
          await supabase.from('transactions').insert([{
            user_id: user.id,
            description: `Resgate Total Investimento - ${formData.name}`,
            amount: value,
            date: todayStr,
            type: 'TRANSFER',
            category: 'Investimentos',
            subcategory: 'Resgate',
            category_id: catId,
            is_paid: true,
            paid_amount: value,
            paid_at: todayStr,
            account_id: targetAccountId || null,
            account_name: targetAccountId ? (brokers.find(b => b.id === targetAccountId)?.name || null) : null,
            metadata: {
              linked_asset_id: editingAsset.id,
              type: 'investment_redemption_total',
              redeemed_amount: value,
              isCapitalized: true
            }
          }]);
        }

        // UPDATE existing asset
        const { error } = await supabase
          .from('physical_assets')
          .update({
            name: formData.name,
            category: formData.category,
            estimated_value: finalEstimatedValue,
            acquisition_date: acqDate,
            description: formData.description,
            metadata,
            is_archived: formData.isSold
          })
          .eq('id', editingAsset.id);

        if (error) throw error;
        assetId = editingAsset.id;

        // Auto-generate yield transaction on value increases for investments
        if (formData.category === 'INVESTMENT') {
          const oldValue = Number(editingAsset.estimatedValue) || 0;
          const newValue = value;
          const delta = newValue - oldValue;

          if (delta > 0) {
            const isAcumulado = formData.payoutType === 'ACUMULADO';
            const subcat = isAcumulado ? 'Rendimentos Acumulados' : 'Rendimentos Mensais';
            
            let catId = null;
            const { data: catRes } = await supabase
              .from('categories')
              .select('id')
              .eq('user_id', user.id)
              .eq('name', 'Investimentos')
              .maybeSingle();
            
            if (catRes) {
              catId = catRes.id;
            } else {
              const { data: newCat } = await supabase
                .from('categories')
                .insert({
                  user_id: user.id,
                  name: 'Investimentos',
                  type: 'INCOME',
                  color: 'bg-indigo-50 text-indigo-600'
                })
                .select('id')
                .maybeSingle();
              if (newCat) catId = newCat.id;
            }

            const todayStr = DateUtils.formatToISODate();
            await supabase.from('transactions').insert([{
              user_id: user.id,
              description: `Rendimento automático - ${formData.name}`,
              amount: delta,
              date: todayStr,
              type: 'INCOME',
              category: 'Investimentos',
              subcategory: subcat,
              category_id: catId,
              is_paid: true,
              paid_amount: delta,
              paid_at: todayStr,
              account_id: isAcumulado ? null : (formData.brokerAccountId || null),
              account_name: isAcumulado ? null : (brokers.find(b => b.id === formData.brokerAccountId)?.name || null),
              metadata: {
                linked_asset_id: editingAsset.id,
                type: 'investment_yield',
                payout_type: formData.payoutType
              }
            }]);
          }
        }

        if (isRealEstate) {
          if (formData.propertyStage === 'PLANTA') {
            const oldMeta = editingAsset.metadata || {};
            const newRate = parseFloat(formData.constructorIndexRate) || 0;
            const oldRate = oldMeta.constructorIndexRate !== undefined ? parseFloat(oldMeta.constructorIndexRate) : null;
            const oldIndex = oldMeta.constructorIndexType || null;

            const rateChanged = oldRate !== newRate || oldIndex !== formData.constructorIndexType;

            if (rateChanged) {
              const { data: txsToRecalc } = await supabase
                .from('transactions')
                .select('*')
                .eq('user_id', user.id)
                .eq('is_paid', false)
                .eq('is_deleted', false)
                .eq('metadata->>linked_asset_id', editingAsset.id);

              if (txsToRecalc && txsToRecalc.length > 0) {
                const acquisitionDateStr = editingAsset.acquisitionDate || DateUtils.formatToISODate();
                const ratePercent = newRate / 100;

                const getMonthsDifferenceLocal = (d1: string, d2: string) => {
                  const parts1 = d1.split('-');
                  const parts2 = d2.split('-');
                  if (parts1.length !== 3 || parts2.length !== 3) return 0;
                  const year1 = parseInt(parts1[0], 10);
                  const month1 = parseInt(parts1[1], 10);
                  const year2 = parseInt(parts2[0], 10);
                  const month2 = parseInt(parts2[1], 10);
                  return Math.max(0, (year2 - year1) * 12 + (month2 - month1));
                };

                for (const tx of txsToRecalc) {
                  const txType = tx.metadata?.property_tx_type;
                  if (txType === 'DOWN_PAYMENT' || txType === 'BALLOON' || txType === 'CONSTRUCTOR_INSTALLMENT') {
                    const originalAmount = tx.metadata?.original_amount !== undefined ? parseFloat(tx.metadata.original_amount) : tx.amount;
                    const t = getMonthsDifferenceLocal(acquisitionDateStr, tx.date);
                    const correctedAmount = originalAmount * Math.pow(1 + ratePercent, t);

                    await supabase
                      .from('transactions')
                      .update({
                        amount: correctedAmount,
                        metadata: {
                          ...(tx.metadata || {}),
                          original_amount: originalAmount
                        }
                      })
                      .eq('id', tx.id);
                  }
                }
              }
            }
          }

          if (!formData.isSold) {
            await syncRentalTransactions(
              editingAsset.id,
              finalIsRented,
              rentVal,
              formData.name,
              user.id,
              formData.rentalType,
              formData.rentalDate,
              formData.discountType,
              parseFloat(formData.discountValue) || 0
            );
            await syncCondoIptuForAsset({
              assetId: editingAsset.id,
              userId: user.id,
              assetName: formData.name,
              propertyStage: formData.propertyStage,
              isRented: finalIsRented,
              rentalType: formData.rentalType,
              condoPayer: formData.condoPayer,
              condoFee: parseFloat(formData.condoFee) || 0,
              condoNextDate: formData.condoNextDate,
              iptuPayer: formData.iptuPayer,
              iptuFee: parseFloat(formData.iptuFee) || 0,
              iptuNextDate: formData.iptuNextDate,
              iptuFrequency: formData.iptuFrequency
            });
          }
        }
        if (formData.category === 'VEHICLE') {
          await syncVehicleTransactions(editingAsset.id, false, user.id, formData);
        }
        if (formData.category === 'OTHER') {
          await syncOtherAssetTransactions(editingAsset.id, false, user.id, formData);
        }

        // Se este ativo físico vendido for uma permuta de origem, atualizar o bem principal de origem
        if (formData.isSold && !editingAsset.metadata?.isSold && editingAsset.metadata?.permuta_origem_asset_id) {
          const origId = editingAsset.metadata.permuta_origem_asset_id;
          const origVal = parseFloat(editingAsset.metadata.permuta_original_value) || 0;
          const diff = soldVal - origVal;
          
          if (diff !== 0) {
            const { data: origAsset } = await supabase
              .from('physical_assets')
              .select('*')
              .eq('id', origId)
              .maybeSingle();
              
            if (origAsset) {
              const origMeta = { ...(origAsset.metadata || {}) };
              if (origAsset.category === 'REAL_ESTATE') {
                origMeta.saleValue = (parseFloat(origMeta.saleValue) || 0) + diff;
              } else {
                origMeta.soldValue = (parseFloat(origMeta.soldValue) || 0) + diff;
              }
              
              await supabase
                .from('physical_assets')
                .update({ metadata: origMeta })
                .eq('id', origId);
                
              // Atualizar transação de receita de venda do ativo de origem
              const { data: origTxs } = await supabase
                .from('transactions')
                .select('id, amount, account_id')
                .eq('is_deleted', false)
                .eq('metadata->>linked_asset_id', origId)
                .in('metadata->>type', ['real_estate_sale_revenue', 'vehicle_sale_revenue', 'other_sale_revenue']);
                
              if (origTxs && origTxs.length > 0) {
                for (const tx of origTxs) {
                  const newAmt = tx.amount + diff;
                  await supabase
                    .from('transactions')
                    .update({ amount: newAmt, paid_amount: newAmt })
                    .eq('id', tx.id);
                    
                  if (tx.account_id) {
                    await supabase.rpc('recalculate_account_balance', { p_account_id: tx.account_id });
                  }
                }
              }
            }
          }
        }
      } else {
        const isNewInvestmentRedemption = 
          formData.category === 'INVESTMENT' && 
          formData.status === 'RESGATADO';

        const finalEstimatedValue = isNewInvestmentRedemption ? 0 : value;

        if (isNewInvestmentRedemption && value > 0) {
          const targetAccountId = formData.brokerAccountId;
          if (targetAccountId) {
            const { data: accRes } = await supabase
              .from('accounts')
              .select('initial_balance')
              .eq('id', targetAccountId)
              .single();
            
            if (accRes) {
              const currentInitial = Number(accRes.initial_balance || 0);
              await supabase
                .from('accounts')
                .update({ initial_balance: currentInitial + value })
                .eq('id', targetAccountId);
            }
          }
        }

        // INSERT new asset
        const { data: newAsset, error } = await supabase
          .from('physical_assets')
          .insert([{
            user_id: user.id,
            name: formData.name,
            category: formData.category,
            estimated_value: finalEstimatedValue,
            acquisition_date: acqDate,
            description: formData.description,
            metadata,
            is_archived: formData.isSold
          }])
          .select()
          .single();

        if (error) throw error;
        if (newAsset) assetId = newAsset.id;

        if (isNewInvestmentRedemption && newAsset && value > 0) {
          let catId = null;
          const { data: catRes } = await supabase
            .from('categories')
            .select('id')
            .eq('user_id', user.id)
            .eq('name', 'Investimentos')
            .maybeSingle();

          if (catRes) {
            catId = catRes.id;
          } else {
            const { data: newCat } = await supabase
              .from('categories')
              .insert({
                user_id: user.id,
                name: 'Investimentos',
                type: 'INCOME',
                color: 'bg-indigo-50 text-indigo-600'
              })
              .select('id')
              .maybeSingle();
            if (newCat) catId = newCat.id;
          }

          const todayStr = DateUtils.formatToISODate();
          await supabase.from('transactions').insert([{
            user_id: user.id,
            description: `Resgate Total Investimento - ${formData.name}`,
            amount: value,
            date: todayStr,
            type: 'TRANSFER',
            category: 'Investimentos',
            subcategory: 'Resgate',
            category_id: catId,
            is_paid: true,
            paid_amount: value,
            paid_at: todayStr,
            account_id: formData.brokerAccountId || null,
            account_name: formData.brokerAccountId ? (brokers.find(b => b.id === formData.brokerAccountId)?.name || null) : null,
            metadata: {
              linked_asset_id: newAsset.id,
              type: 'investment_redemption_total',
              redeemed_amount: value,
              isCapitalized: true
            }
          }]);
        }

        if (isRealEstate && newAsset && !formData.isSold) {
          await syncRentalTransactions(
            newAsset.id,
            finalIsRented,
            rentVal,
            formData.name,
            user.id,
            formData.rentalType,
            formData.rentalDate,
            formData.discountType,
            parseFloat(formData.discountValue) || 0
          );
          await syncCondoIptuForAsset({
            assetId: newAsset.id,
            userId: user.id,
            assetName: formData.name,
            propertyStage: formData.propertyStage,
            isRented: finalIsRented,
            rentalType: formData.rentalType,
            condoPayer: formData.condoPayer,
            condoFee: parseFloat(formData.condoFee) || 0,
            condoNextDate: formData.condoNextDate,
            iptuPayer: formData.iptuPayer,
            iptuFee: parseFloat(formData.iptuFee) || 0,
            iptuNextDate: formData.iptuNextDate,
            iptuFrequency: formData.iptuFrequency
          });
        }

        if (formData.category === 'VEHICLE' && newAsset) {
          await syncVehicleTransactions(newAsset.id, true, user.id, formData);
        }
        if (formData.category === 'OTHER' && newAsset) {
          await syncOtherAssetTransactions(newAsset.id, true, user.id, formData);
        }

        // Auto-provision initial disbursement transaction for Loan assets
        if (formData.isLoan && newAsset && loanPrincipalVal > 0) {
          const catName = 'Empréstimos/Investimentos';
          let catId = '';
          const { data: existingCat } = await supabase.from('categories')
            .select('id').eq('user_id', user.id).eq('name', catName).single();
          if (existingCat) {
            catId = existingCat.id;
          } else {
            const { data: c } = await supabase.from('categories').insert({
              user_id: user.id,
              name: catName,
              type: 'EXPENSE',
              color: 'bg-brand-50 text-brand-600'
            }).select('id').single();
            if (c) catId = c.id;
          }

          // Initial Cash Outflow transaction (Not historical)
          const todayStr = DateUtils.formatToISODate();
          await supabase.from('transactions').insert([{
            user_id: user.id,
            description: `Desembolso Empréstimo Concedido - ${formData.name}`,
            amount: loanPrincipalVal,
            date: todayStr,
            type: 'EXPENSE',
            category_id: catId || null,
            is_paid: true,
            paid_amount: loanPrincipalVal,
            paid_at: todayStr,
            metadata: {
              linked_asset_id: newAsset.id,
              type: 'loan_disbursement'
            }
          }]);
        }
      }

      // Sync direct financing / consortium liabilities for Real Estate (Pronto stage)
      if (isRealEstate && formData.propertyStage === 'PRONTO' && assetId) {
        const balance = parseFloat(formData.deliveryBalance) || 0;
        const linkedLiab = activeLiabilities.find(l => l.linkedAssetId === assetId);

        if (formData.deliveryPaymentMethod === 'A_VISTA') {
          if (linkedLiab) {
            await supabase.from('liabilities').update({ is_archived: true, linked_asset_id: null }).eq('id', linkedLiab.id);
          }
        } 
        else if (formData.deliveryPaymentMethod === 'A_DEFINIR') {
          if (linkedLiab) {
            await supabase.from('liabilities').update({ linked_asset_id: null }).eq('id', linkedLiab.id);
          }
        }
        else if (formData.deliveryPaymentMethod === 'FINANCIAMENTO') {
          const instCount = parseInt(formData.financingInstallmentsCount, 10) || 240;
          const instAmount = parseFloat(formData.financingInstallment) || 0;
          const originalTotal = parseFloat(formData.financingOriginalTotal) || balance;
          const dueDayVal = parseInt(formData.financingDueDay, 10) || 10;
          const finName = formData.financingName || `Financiamento: ${formData.name}`;

          if (linkedLiab && linkedLiab.type === 'MORTGAGE') {
            await supabase.from('liabilities').update({
              name: finName,
              total_amount: originalTotal,
              remaining_balance: balance,
              installment_amount: instAmount,
              installments_remaining: instCount,
              due_day: dueDayVal,
              metadata: {
                ...linkedLiab.metadata,
                propertyType: 'PRONTO',
                isRealEstate: true
              }
            }).eq('id', linkedLiab.id);
          } else {
            // Unlink if type was different
            if (linkedLiab) {
              await supabase.from('liabilities').update({ linked_asset_id: null }).eq('id', linkedLiab.id);
            }
            await supabase.from('liabilities').insert([{
              user_id: user.id,
              name: finName,
              type: 'MORTGAGE',
              total_amount: originalTotal,
              remaining_balance: balance,
              installment_amount: instAmount,
              installments_remaining: instCount,
              due_day: dueDayVal,
              linked_asset_id: assetId,
              metadata: {
                propertyType: 'PRONTO',
                isRealEstate: true
              }
            }]);
          }
        }
        else if (formData.deliveryPaymentMethod === 'CONSORCIO') {
          if (formData.selectedConsortiumId) {
            // Unlink previous if different
            if (linkedLiab && linkedLiab.id !== formData.selectedConsortiumId) {
              await supabase.from('liabilities').update({ linked_asset_id: null }).eq('id', linkedLiab.id);
            }
            await supabase.from('liabilities').update({
              linked_asset_id: assetId,
              metadata: {
                propertyType: 'PRONTO',
                isRealEstate: true
              }
            }).eq('id', formData.selectedConsortiumId);
          } else if (linkedLiab) {
            await supabase.from('liabilities').update({ linked_asset_id: null }).eq('id', linkedLiab.id);
          }
        }
      }

      // Vincula/desvincula consórcio existente a um Veículo (mesma lógica usada para
      // Imóvel acima, só sem os ramos de Financiamento/À Vista — o veículo já tem seus
      // próprios campos de IPVA/seguro/financiamento separados).
      if (formData.category === 'VEHICLE' && assetId) {
        const linkedVehicleLiab = activeLiabilities.find(l => l.linkedAssetId === assetId);
        if (formData.selectedConsortiumId) {
          if (linkedVehicleLiab && linkedVehicleLiab.id !== formData.selectedConsortiumId) {
            await supabase.from('liabilities').update({ linked_asset_id: null }).eq('id', linkedVehicleLiab.id);
          }
          const targetConsortiumLiab = activeLiabilities.find(l => l.id === formData.selectedConsortiumId);
          await supabase.from('liabilities').update({
            linked_asset_id: assetId,
            metadata: { ...(targetConsortiumLiab?.metadata || {}), isVehicle: true }
          }).eq('id', formData.selectedConsortiumId);
        } else if (linkedVehicleLiab) {
          await supabase.from('liabilities').update({ linked_asset_id: null }).eq('id', linkedVehicleLiab.id);
        }
      }

      // Automated sale transaction for REAL_ESTATE
      if (isRealEstate && formData.isSold && (!editingAsset || !editingAsset.metadata?.isSold)) {
        const soldAmount = parseFloat(formData.soldValue) || 0;
        const comission = parseFloat(formData.saleCommission || (formData as any).saleComission) || 0;
        const saleDateStr = formData.saleDate || DateUtils.formatToISODate();

        // 1. Excluir provisões futuras não pagas vinculadas ao imóvel
        const { data: oldProvisions } = await supabase
          .from('transactions')
          .select('id, metadata')
          .eq('user_id', user.id)
          .eq('is_paid', false);

        if (oldProvisions && oldProvisions.length > 0) {
          const idsToDelete = oldProvisions
            .filter((t: any) => 
              t.metadata?.linked_asset_id === assetId &&
              (t.metadata?.type === 'rental_income' ||
               t.metadata?.type === 'condo_provision' ||
               t.metadata?.type === 'condo_expense' ||
               t.metadata?.type === 'condo_revenue' ||
               t.metadata?.type === 'iptu_provision' ||
               t.metadata?.type === 'iptu_expense' ||
               t.metadata?.type === 'iptu_revenue' ||
               t.metadata?.type === 'short_stay_booking')
            )
            .map((p: any) => p.id);
          
          if (idsToDelete.length > 0) {
            await supabase.from('transactions').delete().in('id', idsToDelete);
          }
        }

        // 2. Comissão de venda (se houver)
        if (comission > 0) {
          let catId = null;
          const { data: catRes } = await supabase
            .from('categories')
            .select('id')
            .eq('user_id', user.id)
            .eq('name', 'Ativos Imobiliários')
            .maybeSingle();
          if (catRes) catId = catRes.id;

          await supabase.from('transactions').insert([{
            user_id: user.id,
            description: `Comissão de Venda - ${formData.name}`,
            amount: comission,
            date: saleDateStr,
            type: 'EXPENSE',
            category: 'Ativos Imobiliários',
            subcategory: 'Comissão',
            category_id: catId,
            is_paid: true,
            paid_amount: comission,
            paid_at: saleDateStr,
            metadata: { linked_asset_id: assetId, type: 'real_estate_sale_comission' }
          }]);
        }

        // 3. Receita da venda
        let revenueCatId = null;
        const { data: revCat } = await supabase
          .from('categories')
          .select('id')
          .eq('user_id', user.id)
          .eq('name', 'Outras Receitas')
          .maybeSingle();
        if (revCat) {
          revenueCatId = revCat.id;
        } else {
          const { data: newCat } = await supabase
            .from('categories')
            .insert({
              user_id: user.id,
              name: 'Outras Receitas',
              type: 'INCOME',
              color: 'bg-emerald-50 text-emerald-600'
            })
            .select('id')
            .maybeSingle();
          if (newCat) revenueCatId = newCat.id;
        }

        if (formData.salePaymentMethod === 'A_VISTA' || formData.salePaymentMethod === 'HIBRIDO') {
          let cashVal = soldAmount;
          if (formData.salePaymentMethod === 'HIBRIDO') {
            cashVal = parseFloat(formData.saleCashAmount) || 0;
          }

          if (cashVal > 0) {
            await supabase.from('transactions').insert([{
              user_id: user.id,
              description: formData.salePaymentMethod === 'HIBRIDO'
                ? `Receita Venda de Imóvel (Parte Dinheiro) - ${formData.name}`
                : `Receita Venda de Imóvel (À Vista) - ${formData.name}`,
              amount: cashVal,
              date: saleDateStr,
              type: 'INCOME',
              category: 'Outras Receitas',
              subcategory: 'Venda de Ativo',
              category_id: revenueCatId,
              is_paid: true,
              paid_amount: cashVal,
              paid_at: saleDateStr,
              metadata: { linked_asset_id: assetId, type: 'real_estate_sale_revenue' }
            }]);
          }
        } 
        else if (formData.salePaymentMethod === 'PARCELADO') {
          const parcelas = 10;
          const valorParcela = soldAmount / parcelas;
          const newSaleInstallments = [];
          
          for (let i = 0; i < parcelas; i++) {
            const futureDate = new Date(saleDateStr + 'T00:00:00');
            futureDate.setMonth(futureDate.getMonth() + i);
            const futureDateStr = DateUtils.formatToISODate(futureDate);

            newSaleInstallments.push({
              user_id: user.id,
              description: `Receita Parcelada Venda (${i+1}/${parcelas}) - ${formData.name}`,
              amount: valorParcela,
              date: futureDateStr,
              type: 'INCOME',
              category: 'Outras Receitas',
              subcategory: 'Venda de Ativo',
              category_id: revenueCatId,
              is_paid: false,
              metadata: { linked_asset_id: assetId, type: 'real_estate_sale_installment', installment: i+1 }
            });
          }
          if (newSaleInstallments.length > 0) {
            await supabase.from('transactions').insert(newSaleInstallments);
          }
        }

        // 4. Criar bens de permuta automaticamente
        if (Array.isArray(formData.permutaItems) && formData.permutaItems.length > 0) {
          const assetsToInsert = formData.permutaItems
            .filter((item: any) => item.name && (parseFloat(item.value) || 0) > 0)
            .map((item: any) => ({
              user_id: user.id,
              name: item.name,
              category: item.type,
              estimated_value: parseFloat(item.value) || 0,
              acquisition_date: saleDateStr,
              description: `Recebido em permuta na venda de ${formData.name}`,
              metadata: item.type === 'REAL_ESTATE' ? { propertyStage: 'PRONTO', purpose: 'uso' } : { purpose: 'uso' }
            }));
          if (assetsToInsert.length > 0) {
            await supabase.from('physical_assets').insert(assetsToInsert);
          }
        }
      }

      // --- BROKER BALANCE SYNC ---
      // current_balance = initial_balance (caixa livre) + soma de investimentos ativos
      // Assim o caixa ajustado manualmente em Contas é preservado.
      if (formData.category === 'INVESTMENT' && formData.brokerAccountId) {
        try {
          const [allInvestsRes, brokerAccRes] = await Promise.all([
            supabase
              .from('physical_assets')
              .select('estimated_value, metadata')
              .eq('user_id', user.id)
              .eq('category', 'INVESTMENT')
              .eq('is_archived', false),
            supabase
              .from('accounts')
              .select('initial_balance')
              .eq('id', formData.brokerAccountId)
              .eq('user_id', user.id)
              .maybeSingle()
          ]);

          const brokerCash = Number(brokerAccRes.data?.initial_balance || 0);
          const investedTotal = (allInvestsRes.data || [])
            .filter((inv: any) =>
              inv.metadata?.brokerAccountId === formData.brokerAccountId &&
              inv.metadata?.status !== 'RESGATADO'
            )
            .reduce((sum: number, inv: any) => sum + Number(inv.estimated_value || 0), 0);

          await supabase
            .from('accounts')
            .update({ current_balance: brokerCash + investedTotal })
            .eq('id', formData.brokerAccountId)
            .eq('user_id', user.id);
        } catch (syncErr) {
          console.warn('[Assets] Broker balance sync failed (non-critical):', syncErr);
        }
      }

      // Sync da corretora anterior se o investimento mudou de corretora
      if (formData.category === 'INVESTMENT' && editingAsset) {
        const oldBrokerId = editingAsset.metadata?.brokerAccountId;
        if (oldBrokerId && oldBrokerId !== formData.brokerAccountId) {
          try {
            const [oldInvestsRes, oldAccRes] = await Promise.all([
              supabase
                .from('physical_assets')
                .select('estimated_value, metadata')
                .eq('user_id', user.id)
                .eq('category', 'INVESTMENT')
                .eq('is_archived', false),
              supabase
                .from('accounts')
                .select('initial_balance')
                .eq('id', oldBrokerId)
                .eq('user_id', user.id)
                .maybeSingle()
            ]);

            const oldCash = Number(oldAccRes.data?.initial_balance || 0);
            const oldInvestedTotal = (oldInvestsRes.data || [])
              .filter((inv: any) =>
                inv.metadata?.brokerAccountId === oldBrokerId &&
                inv.metadata?.status !== 'RESGATADO'
              )
              .reduce((sum: number, inv: any) => sum + Number(inv.estimated_value || 0), 0);

            await supabase
              .from('accounts')
              .update({ current_balance: oldCash + oldInvestedTotal })
              .eq('id', oldBrokerId)
              .eq('user_id', user.id);
          } catch (syncErr) {
            console.warn('[Assets] Old broker balance sync failed (non-critical):', syncErr);
          }
        }
      }

      setShowModal(false);
      setEditingAsset(null);
      resetAssetForm();
      fetchData();
      toast('Ativo salvo com sucesso!', 'success');
    } catch (err: any) {
      toast(`Erro ao salvar ativo: ${err.message}`, 'error');
    }
  };

  const resetAssetForm = () => {
    setFormData({
      name: '',
      category: 'REAL_ESTATE',
      estimatedValue: '',
      acquisitionDate: '',
      description: '',
      purpose: 'uso',
      purchaseValue: '',
      fipeValue: '',
      brokerFee: '',
      isSold: false,
      soldValue: '',
      propertyStage: 'PRONTO',
      indexType: 'INCC',
      balloons: [],
      constructorIndexType: 'INCC',
      constructorIndexRate: '0.0',
      isRented: false,
      rentalIncome: '',
      discountType: 'VALUE',
      discountValue: '',
      condoFee: '',
      iptuFee: '',
      inquilinoPaysCondo: false,
      inquilinoPaysIPTU: false,
      condoPayer: 'PROPRIETARIO',
      condoNextDate: DateUtils.formatToISODate(),
      iptuPayer: 'PROPRIETARIO',
      iptuNextDate: DateUtils.formatToISODate(),
      iptuFrequency: 'monthly',
      rentalType: 'anual',
      rentalDate: DateUtils.formatToISODate(),
      isLoan: false,
      loanType: 'INSTALLMENTS' as 'INSTALLMENTS' | 'OPEN_BALANCE',
      loanPrincipal: '',
      loanInterestType: 'SIMPLE',
      loanInterestRate: '',
      loanFixedValue: '',
      loanDueDate: '',
      loanDebtor: '',
      loanInstallmentsCount: '',
      deliveryPaymentMethod: 'A_VISTA',
      deliveryBalance: '',
      selectedConsortiumId: '',
      consortiumAllocationRatio: '100',
      financingOriginalTotal: '',
      financingInstallment: '',
      financingInstallmentsCount: '',
      financingDueDay: '10',
      financingName: '',
      // Vehicle-specific fields
      vehicleType: 'CAR',
      licensePlate: '',
      renavam: '',
      yearModel: '',
      mileage: '',
      transferFee: '',
      vehiclePurposeType: 'RENTAL',
      ipvaFee: '',
      ipvaPaymentMethod: 'PARCELADO',
      ipvaInstallmentsCount: '5',
      seguroFee: '',
      seguroPaymentMethod: 'PARCELADO',
      seguroInstallmentsCount: '10',
      licenciamentoFee: '',
      maintenanceMonthlyEstimated: '',
      rentalPlatformFee: '',
      targetSaleValue: '',
      preparationBudget: '',
      saleCommission: '',
      salePaymentMethod: 'A_VISTA',
      permutaVeiculoValor: '',
      permutaVeiculoNome: '',
      permutaImovelValor: '',
      permutaImovelNome: '',
      permutaOutrosValor: '',
      permutaOutrosNome: '',
      permutaItems: [],
      saleDate: DateUtils.formatToISODate(),
      saleCashAmount: '',
      // Investment-specific fields
      investmentType: 'CDB',
      interestType: 'CDI',
      yieldRate: '',
      payoutType: 'ACUMULADO',
      brokerAccountId: '',
      vencimentoDate: '',
      investmentLiquidity: 'No Vencimento',
      status: 'ATIVO',
      isTaxExempt: false,
      iconKey: '',
      brandModel: '',
      serialNumber: '',
      custodyLocation: '',
      insurancePolicy: '',
      certificateLink: '',
      depreciationRate: '',
      isDepreciable: false,
    });
  };

  const handleNewAssetClick = () => {
    if (activeView === 'overview') {
      setShowCategorySelector(true);
    } else if (activeView === 'realestate') {
      setShowWizardModal(true);
    } else if (activeView === 'vehicles') {
      resetAssetForm();
      setEditingAsset(null);
      setFormData(prev => ({ ...prev, category: 'VEHICLE', purpose: 'uso' }));
      setShowModal(true);
    } else if (activeView === 'physical') {
      resetAssetForm();
      setEditingAsset(null);
      setFormData(prev => ({ ...prev, category: 'OTHER', purpose: 'uso', isLoan: false }));
      setShowModal(true);
    } else if (activeView === 'investments') {
      resetAssetForm();
      setEditingAsset(null);
      setFormData(prev => ({ ...prev, category: 'INVESTMENT', purpose: 'investimento' }));
      setShowModal(true);
    } else if (activeView === 'loans') {
      resetAssetForm();
      setEditingAsset(null);
      setFormData(prev => ({ ...prev, isLoan: true, category: 'OTHER' }));
      setShowModal(true);
    } else if (activeView === 'liabilities') {
      setLiabilityFormData({
        name: '',
        type: 'PERSONAL_LOAN',
        totalAmount: '',
        remainingBalance: '',
        interestRate: '',
        installmentAmount: '',
        installmentsRemaining: '',
        dueDay: '10',
        linkedAssetId: '',
        indexationRate: '',
        amortizationType: 'SAC',
        indexType: 'FIXED',
        firstInstallmentDate: '',
        balloonMonth: '',
        balloonYear: '',
        balloonAmount: '',
        balloons: [],
        propertyType: 'PLANTA',
        hasHistoricalPayments: false,
        historicalCalculationType: 'calculated',
        historicalInstallmentsPaid: '',
        historicalInstallmentValue: '',
        historicalPaidAmount: ''
      });
      setEditingLiability(null);
      setShowLiabilityModal(true);
    }
  };

  const openEditAsset = (asset: PhysicalAsset) => {
    const meta = asset.metadata || {};


    setEditingAsset(asset);
    const linkedLiab = activeLiabilities.find(l => l.linkedAssetId === asset.id);
    let devPayMethod: 'A_VISTA' | 'FINANCIAMENTO' | 'CONSORCIO' | 'A_DEFINIR' = 'A_VISTA';
    let selConsortiumId = '';
    let consAllocRatio = '100';
    let finOrigTotal = '';
    let finInst = '';
    let finInstCount = '';
    let finDueDay = '10';
    let finName = `Financiamento: ${asset.name}`;
    let devBal = meta.deliveryBalance ? String(meta.deliveryBalance) : '';

    if (linkedLiab) {
      if (linkedLiab.type === 'MORTGAGE') {
        devPayMethod = 'FINANCIAMENTO';
        finName = linkedLiab.name;
        finOrigTotal = String(linkedLiab.totalAmount || '');
        devBal = String(linkedLiab.remainingBalance || '');
        finInst = String(linkedLiab.installmentAmount || '');
        finInstCount = String(linkedLiab.installmentsRemaining || '');
        finDueDay = String(linkedLiab.dueDay || '10');
      } else if (linkedLiab.type === 'CONSORTIUM') {
        devPayMethod = 'CONSORCIO';
        selConsortiumId = linkedLiab.id;
        consAllocRatio = String(meta.consortiumAllocationRatio || 100);
      }
    } else if (meta.selectedConsortiumId) {
      devPayMethod = 'CONSORCIO';
      selConsortiumId = meta.selectedConsortiumId;
      consAllocRatio = String(meta.consortiumAllocationRatio || 100);
    } else if (meta.financingType === 'A_DEFINIR' || meta.deliveryPaymentMethod === 'A_DEFINIR') {
      devPayMethod = 'A_DEFINIR';
      devBal = meta.deliveryBalance ? String(meta.deliveryBalance) : '';
    }

    setFormData({
      name: asset.name,
      category: asset.category,
      estimatedValue: String(asset.estimatedValue),
      acquisitionDate: asset.acquisitionDate || '',
      description: asset.description || '',
      purpose: meta.purpose || 'uso',
      purchaseValue: meta.purchaseValue ? String(meta.purchaseValue) : '',
      fipeValue: meta.fipeValue ? String(meta.fipeValue) : '',
      brokerFee: meta.brokerFee ? String(meta.brokerFee) : '',
      isSold: !!meta.isSold,
      soldValue: meta.soldValue ? String(meta.soldValue) : '',
      propertyStage: meta.propertyStage || 'PRONTO',
      indexType: meta.indexType || 'INCC',
      balloons: meta.balloons || [],
      constructorIndexType: meta.constructorIndexType || 'INCC',
      constructorIndexRate: meta.constructorIndexRate !== undefined ? String(meta.constructorIndexRate) : '0.0',
      isRented: !!meta.isRented,
      rentalIncome: meta.rentalIncome ? String(meta.rentalIncome) : '',
      discountType: meta.discountType || 'VALUE',
      discountValue: meta.discountValue ? String(meta.discountValue) : '',
      condoFee: meta.condoFee ? String(meta.condoFee) : '',
      iptuFee: meta.iptuFee ? String(meta.iptuFee) : '',
      inquilinoPaysCondo: !!meta.inquilinoPaysCondo,
      inquilinoPaysIPTU: !!meta.inquilinoPaysIPTU,
      condoPayer: meta.condoPayer || (meta.inquilinoPaysCondo ? 'INQUILINO_DIRETO' : 'PROPRIETARIO'),
      condoNextDate: meta.condoNextDate || DateUtils.formatToISODate(),
      iptuPayer: meta.iptuPayer || (meta.inquilinoPaysIPTU ? 'INQUILINO_DIRETO' : 'PROPRIETARIO'),
      iptuNextDate: meta.iptuNextDate || DateUtils.formatToISODate(),
      iptuFrequency: meta.iptuFrequency || 'monthly',
      rentalType: meta.rentalType || 'anual',
      rentalDate: meta.rentalDate || DateUtils.formatToISODate(),
      isLoan: !!meta.isLoan,
      loanType: (meta.loanType || 'INSTALLMENTS') as 'INSTALLMENTS' | 'OPEN_BALANCE',
      loanPrincipal: meta.loanPrincipal ? String(meta.loanPrincipal) : '',
      loanInterestType: meta.loanInterestType || 'SIMPLE',
      loanInterestRate: meta.loanInterestRate ? String(meta.loanInterestRate) : '',
      loanFixedValue: meta.loanFixedValue ? String(meta.loanFixedValue) : '',
      loanDueDate: meta.loanDueDate || '',
      loanDebtor: meta.loanDebtor || '',
      loanInstallmentsCount: meta.loanInstallmentsCount ? String(meta.loanInstallmentsCount) : '',
      deliveryPaymentMethod: devPayMethod,
      deliveryBalance: devBal,
      selectedConsortiumId: selConsortiumId,
      consortiumAllocationRatio: consAllocRatio,
      financingOriginalTotal: finOrigTotal,
      financingInstallment: finInst,
      financingInstallmentsCount: finInstCount,
      financingDueDay: finDueDay,
      financingName: finName,
      // Vehicle-specific fields
      vehicleType: meta.vehicleType || 'CAR',
      licensePlate: meta.licensePlate || '',
      renavam: meta.renavam || '',
      yearModel: meta.yearModel || '',
      mileage: meta.mileage ? String(meta.mileage) : '',
      transferFee: meta.transferFee ? String(meta.transferFee) : '',
      vehiclePurposeType: meta.vehiclePurposeType || 'RENTAL',
      ipvaFee: meta.ipvaFee ? String(meta.ipvaFee) : '',
      ipvaPaymentMethod: meta.ipvaPaymentMethod || 'PARCELADO',
      ipvaInstallmentsCount: meta.ipvaInstallmentsCount ? String(meta.ipvaInstallmentsCount) : '5',
      seguroFee: meta.seguroFee ? String(meta.seguroFee) : '',
      seguroPaymentMethod: meta.seguroPaymentMethod || 'PARCELADO',
      seguroInstallmentsCount: meta.seguroInstallmentsCount ? String(meta.seguroInstallmentsCount) : '10',
      licenciamentoFee: meta.licenciamentoFee ? String(meta.licenciamentoFee) : '',
      maintenanceMonthlyEstimated: meta.maintenanceMonthlyEstimated ? String(meta.maintenanceMonthlyEstimated) : '',
      rentalPlatformFee: meta.rentalPlatformFee ? String(meta.rentalPlatformFee) : '',
      targetSaleValue: meta.targetSaleValue ? String(meta.targetSaleValue) : '',
      preparationBudget: meta.preparationBudget ? String(meta.preparationBudget) : '',
      saleCommission: meta.saleCommission ? String(meta.saleCommission) : (meta.saleComission ? String(meta.saleComission) : ''),
      salePaymentMethod: meta.salePaymentMethod || 'A_VISTA',
      permutaVeiculoValor: meta.permutaVeiculoValor ? String(meta.permutaVeiculoValor) : '',
      permutaVeiculoNome: meta.permutaVeiculoNome || '',
      permutaImovelValor: meta.permutaImovelValor ? String(meta.permutaImovelValor) : '',
      permutaImovelNome: meta.permutaImovelNome || '',
      permutaOutrosValor: meta.permutaOutrosValor ? String(meta.permutaOutrosValor) : '',
      permutaOutrosNome: meta.permutaOutrosNome || '',
      permutaItems: meta.permutaItems || (
        (meta.permutaVeiculoValor || meta.permutaImovelValor || meta.permutaOutrosValor) ? [
          ...(meta.permutaVeiculoNome || meta.permutaVeiculoValor ? [{ type: 'VEHICLE' as const, name: meta.permutaVeiculoNome || '', value: String(meta.permutaVeiculoValor || '') }] : []),
          ...(meta.permutaImovelNome || meta.permutaImovelValor ? [{ type: 'REAL_ESTATE' as const, name: meta.permutaImovelNome || '', value: String(meta.permutaImovelValor || '') }] : []),
          ...(meta.permutaOutrosNome || meta.permutaOutrosValor ? [{ type: 'OTHER' as const, name: meta.permutaOutrosNome || '', value: String(meta.permutaOutrosValor || '') }] : []),
        ] : []
      ),
      saleDate: meta.saleDate || DateUtils.formatToISODate(),
      saleCashAmount: meta.saleCashAmount !== undefined ? String(meta.saleCashAmount) : '',
      // Investment-specific fields
      investmentType: meta.investmentType || 'CDB',
      interestType: meta.interestType || 'CDI',
      yieldRate: meta.yieldRate || '',
      payoutType: meta.payoutType || 'ACUMULADO',
      brokerAccountId: meta.brokerAccountId || '',
      vencimentoDate: meta.vencimentoDate || '',
      investmentLiquidity: meta.investmentLiquidity || 'No Vencimento',
      status: meta.status || 'ATIVO',
      isTaxExempt: !!meta.isTaxExempt,
      iconKey: meta.iconKey || '',
      brandModel: meta.brandModel || '',
      serialNumber: meta.serialNumber || '',
      custodyLocation: meta.custodyLocation || '',
      insurancePolicy: meta.insurancePolicy || '',
      certificateLink: meta.certificateLink || '',
      depreciationRate: meta.depreciationRate ? String(meta.depreciationRate) : '',
      isDepreciable: !!meta.isDepreciable,
    });
    setShowModal(true);
  };

  const handleArchiveAsset = async (asset: PhysicalAsset) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('physical_assets')
        .update({ is_archived: true })
        .eq('id', asset.id);

      if (error) throw error;
      fetchData();
    } catch (err: any) {
      toast(`Erro ao arquivar: ${err.message}`, 'error');
    }
  };

  const handleUnarchiveAsset = async (asset: PhysicalAsset) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('physical_assets')
        .update({ is_archived: false })
        .eq('id', asset.id);

      if (error) throw error;
      fetchData();
    } catch (err: any) {
      toast(`Erro ao restaurar: ${err.message}`, 'error');
    }
  };

  const handleDeleteAsset = async (asset: PhysicalAsset) => {
    if (!supabase) return;
    if (!window.confirm(`Atenção: Excluir o bem "${asset.name}" removerá o ativo e TODOS os lançamentos automáticos vinculados a ele (aluguéis, condomínio, IPTU, parcelas etc.). Lançamentos pagos manualmente serão mantidos para histórico. Deseja continuar?`)) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      // 1. Remove transações AUTO-GERADAS e não pagas vinculadas a este ativo (evita dados fantasma)
      //    Mantém apenas as que foram pagas manualmente (histórico real de fluxo de caixa)
      const { error: txErr } = await supabase
        .from('transactions')
        .update({ is_deleted: true })
        .eq('metadata->>linked_asset_id', asset.id)
        .or('metadata->>auto_generated.eq.true,is_paid.eq.false');
      if (txErr) console.warn('[Assets] Falha ao limpar transações vinculadas:', txErr.message);

      // 2. Remove o ativo físico
      const { error } = await supabase
        .from('physical_assets')
        .delete()
        .eq('id', asset.id);

      if (error) throw error;

      // 3. Limpa caches locais para o item não reaparecer como fantasma
      try {
        if (userId) {
          localStorage.removeItem(`finvision_cached_raw_txs_${userId}`);
          localStorage.removeItem(`finvision_cached_projections_${userId}`);
        }
        localStorage.removeItem('finvision_cached_home_txs');
        localStorage.removeItem('finvision_cached_summary');
      } catch (e) {}

      // Sync broker balance if this was an investment linked to a broker
      // current_balance = initial_balance (caixa livre) + soma restante de investimentos
      if (asset.category === 'INVESTMENT' && asset.metadata?.brokerAccountId && userId) {
        try {
          const [remainingRes, brokerAccRes] = await Promise.all([
            supabase
              .from('physical_assets')
              .select('estimated_value, metadata')
              .eq('user_id', userId)
              .eq('category', 'INVESTMENT')
              .eq('is_archived', false)
              .neq('id', asset.id),
            supabase
              .from('accounts')
              .select('initial_balance')
              .eq('id', asset.metadata.brokerAccountId)
              .eq('user_id', userId)
              .maybeSingle()
          ]);

          const brokerCash = Number(brokerAccRes.data?.initial_balance || 0);
          const remainingInvested = (remainingRes.data || [])
            .filter((inv: any) =>
              inv.metadata?.brokerAccountId === asset.metadata.brokerAccountId &&
              inv.metadata?.status !== 'RESGATADO'
            )
            .reduce((sum: number, inv: any) => sum + Number(inv.estimated_value || 0), 0);

          await supabase
            .from('accounts')
            .update({ current_balance: brokerCash + remainingInvested })
            .eq('id', asset.metadata.brokerAccountId)
            .eq('user_id', userId);
        } catch (syncErr) {
          console.warn('[Assets] Broker balance sync on delete failed (non-critical):', syncErr);
        }
      }

      fetchData();
    } catch (err: any) {
      toast(`Erro ao excluir: ${err.message}`, 'error');
    }
  };

  const exportExtratoToExcel = (asset: PhysicalAsset) => {
    const txs = getAssetLinkedTransactions(asset.id);
    const rows = txs.map((t, idx) => ({
      '#': idx + 1,
      'Descrição': t.description,
      'Valor (R$)': t.amount,
      'Data': DateUtils.formatDisplayDate(t.date),
      'Categoria': t.category,
      'Subcategoria': t.subcategory || '-',
      'Situação': t.isPaid ? 'Pago' : 'Pendente'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Extrato');
    
    const info = getAssetFinancialHistory(asset);
    XLSX.utils.sheet_add_aoa(ws, [
      [`Extrato do Ativo: ${asset.name}`],
      [`Categoria: ${asset.category === 'VEHICLE' ? 'Veículo' : 'Outro Bem'}`],
      [`Valor Estimado: R$ ${asset.estimatedValue.toLocaleString('pt-BR')}`],
      [`Total Receitas: R$ ${info.totalIncome.toLocaleString('pt-BR')}`],
      [`Total Gastos Extras: R$ ${info.totalExtraExpenses.toLocaleString('pt-BR')}`],
      [`Saldo Consolidado: R$ ${(info.totalIncome - info.totalExtraExpenses).toLocaleString('pt-BR')}`],
      []
    ], { origin: 'A1' });

    XLSX.writeFile(wb, `extrato_${asset.name.replace(/\s+/g, '_').toLowerCase()}.xlsx`);
  };

  const exportLiabilityExtratoToExcel = (liability: Liability) => {
    const txs = getLiabilityLinkedTransactions(liability.id);
    const rows = txs.map((t, idx) => ({
      '#': idx + 1,
      'Descrição': t.description,
      'Valor (R$)': t.amount,
      'Data': DateUtils.formatDisplayDate(t.date),
      'Categoria': t.category,
      'Situação': t.is_paid ? 'Pago' : 'Pendente',
      'Amortização': t.is_amortization ? 'Sim' : 'Não'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Extrato Passivo');

    const info = getLiabilityFinancialHistory(liability);
    XLSX.utils.sheet_add_aoa(ws, [
      [`Extrato do Passivo: ${liability.name}`],
      [`Tipo: ${liability.type}`],
      [`Original Total: R$ ${liability.totalAmount.toLocaleString('pt-BR')}`],
      [`Saldo Devedor Atual: R$ ${liability.remainingBalance.toLocaleString('pt-BR')}`],
      [`Total Pago: R$ ${info.totalPaid.toLocaleString('pt-BR')}`],
      []
    ], { origin: 'A1' });

    XLSX.writeFile(wb, `extrato_passivo_${liability.name.replace(/\s+/g, '_').toLowerCase()}.xlsx`);
  };

  const handleArchiveAssetFromExtrato = (asset: PhysicalAsset) => {
    setShowExtratoModal(false);
    openEditAsset(asset);
    setFormData(prev => ({ ...prev, isSold: true }));
    toast('Marcar como Vendido selecionado. Preencha os detalhes da venda no formulário e clique em Salvar Alterações.', 'info');
  };

  // Real estate manage modal
  const openManageRealEstateForAsset = (asset: PhysicalAsset, liability?: any) => {
    const meta = asset.metadata || {};
    if (liability) {
      setSelectedLiabilityForManage(liability);
      setRealEstateManageForm({
        propertyType: meta.propertyStage || 'PRONTO',
        rentalIncome: meta.rentalIncome ? String(meta.rentalIncome) : '',
        operationalExpenses: liability.metadata?.operationalExpenses ? String(liability.metadata.operationalExpenses) : '',
        deliveryDate: liability.metadata?.deliveryDate || '',
        installmentAmount: liability.installmentAmount ? String(liability.installmentAmount) : '',
        inquilinoPaysCondo: !!meta.inquilinoPaysCondo,
        inquilinoPaysIPTU: !!meta.inquilinoPaysIPTU,
        isRented: !!meta.isRented,
        condoFee: meta.condoFee ? String(meta.condoFee) : '',
        iptuFee: meta.iptuFee ? String(meta.iptuFee) : '',
        deliveryPaymentMethod: meta.deliveryPaymentMethod || 'FINANCIAMENTO',
        deliveryBalance: meta.deliveryBalance ? String(meta.deliveryBalance) : '',
        selectedConsortiumId: meta.selectedConsortiumId || '',
        financingInstallment: meta.financingInstallment ? String(meta.financingInstallment) : '',
        financingInstallmentsCount: meta.financingInstallmentsCount ? String(meta.financingInstallmentsCount) : '',
        financingDueDay: meta.financingDueDay || '10',
        rentalType: meta.rentalType || 'anual',
        financingName: liability.name || `Financiamento: ${asset.name}`,
        financingOriginalTotal: liability.totalAmount ? String(liability.totalAmount) : '',
        rentalDate: meta.rentalDate || DateUtils.formatToISODate()
      });
    } else {
      setSelectedLiabilityForManage({
        id: 'new-temp',
        linkedAssetId: asset.id,
        name: `Custos/Rendimentos: ${asset.name}`,
        type: 'MORTGAGE',
        totalAmount: 0,
        remainingBalance: 0,
        installmentAmount: 0,
        metadata: {
          propertyType: meta.propertyStage || 'PRONTO',
          isRealEstate: true
        }
      });
      setRealEstateManageForm({
        propertyType: meta.propertyStage || 'PRONTO',
        rentalIncome: meta.rentalIncome ? String(meta.rentalIncome) : '',
        operationalExpenses: '',
        deliveryDate: '',
        installmentAmount: '',
        inquilinoPaysCondo: !!meta.inquilinoPaysCondo,
        inquilinoPaysIPTU: !!meta.inquilinoPaysIPTU,
        isRented: !!meta.isRented,
        condoFee: meta.condoFee ? String(meta.condoFee) : '',
        iptuFee: meta.iptuFee ? String(meta.iptuFee) : '',
        deliveryPaymentMethod: meta.deliveryPaymentMethod || 'FINANCIAMENTO',
        deliveryBalance: meta.deliveryBalance ? String(meta.deliveryBalance) : '',
        selectedConsortiumId: meta.selectedConsortiumId || '',
        financingInstallment: meta.financingInstallment ? String(meta.financingInstallment) : '',
        financingInstallmentsCount: meta.financingInstallmentsCount ? String(meta.financingInstallmentsCount) : '',
        financingDueDay: meta.financingDueDay || '10',
        rentalType: meta.rentalType || 'anual',
        financingName: `Financiamento: ${asset.name}`,
        financingOriginalTotal: '',
        rentalDate: meta.rentalDate || DateUtils.formatToISODate()
      });
    }
    setShowRealEstateManageModal(true);
  };

  const saveRealEstateManage = async () => {
    if (!supabase || !selectedLiabilityForManage) return;
    try {
      const rentVal = parseFloat(realEstateManageForm.rentalIncome) || 0;
      const instVal = parseFloat(realEstateManageForm.installmentAmount) || 0;
      const condoVal = parseFloat(realEstateManageForm.condoFee) || 0;
      const iptuVal = parseFloat(realEstateManageForm.iptuFee) || 0;

      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Usuário não autenticado");

      // Update physical asset metadata
      const asset = physicalAssets.find(p => p.id === selectedLiabilityForManage.linkedAssetId);
      if (asset) {
        const updatedAssetMeta = {
          ...(asset.metadata || {}),
          propertyStage: realEstateManageForm.propertyType,
          isRented: realEstateManageForm.isRented,
          rentalIncome: rentVal,
          condoFee: condoVal,
          iptuFee: iptuVal,
          inquilinoPaysCondo: realEstateManageForm.inquilinoPaysCondo,
          inquilinoPaysIPTU: realEstateManageForm.inquilinoPaysIPTU,
          rentalType: realEstateManageForm.rentalType,
          rentalDate: realEstateManageForm.rentalDate
        };

        await syncRentalTransactions(
          asset.id,
          realEstateManageForm.isRented,
          rentVal,
          asset.name,
          user.id,
          realEstateManageForm.rentalType,
          realEstateManageForm.rentalDate
        );

        await supabase
          .from('physical_assets')
          .update({ metadata: updatedAssetMeta })
          .eq('id', asset.id);
      }

      const wasPlanta = asset?.metadata?.propertyStage === 'PLANTA';
      const isTransitioningToPronto = wasPlanta && realEstateManageForm.propertyType === 'PRONTO';

      if (isTransitioningToPronto && asset) {
        const balance = parseFloat(realEstateManageForm.deliveryBalance) || 0;
        
        if (realEstateManageForm.deliveryPaymentMethod === 'A_VISTA') {
          if (balance > 0) {
            const todayStr = DateUtils.formatToISODate();
            const habitacaoCatId = await getOrCreateCategory(user.id, 'Habitação', 'EXPENSE', 'bg-emerald-50 text-emerald-600');
            await supabase.from('transactions').insert([{
              user_id: user.id,
              description: `Quitação Saldo Chaves - ${asset.name}`,
              amount: balance,
              date: todayStr,
              type: 'EXPENSE',
              category: 'Habitação',
              category_id: habitacaoCatId,
              is_paid: true,
              paid_amount: balance,
              paid_at: todayStr,
              metadata: {
                linked_asset_id: asset.id,
                type: 'delivery_quitacao',
                isCapitalized: true
              }
            }]);
          }
          if (selectedLiabilityForManage.id !== 'new-temp') {
            await supabase.from('liabilities').update({ is_archived: true }).eq('id', selectedLiabilityForManage.id);
          }
        } 
        else if (realEstateManageForm.deliveryPaymentMethod === 'A_DEFINIR') {
          if (selectedLiabilityForManage.id !== 'new-temp') {
            await supabase.from('liabilities').update({ linked_asset_id: null }).eq('id', selectedLiabilityForManage.id);
          }
        }
        else if (realEstateManageForm.deliveryPaymentMethod === 'FINANCIAMENTO') {
          const instCount = parseInt(realEstateManageForm.financingInstallmentsCount, 10) || 240;
          const instAmount = parseFloat(realEstateManageForm.financingInstallment) || instVal;
          const originalTotal = parseFloat(realEstateManageForm.financingOriginalTotal) || balance;
          const dueDayVal = parseInt(realEstateManageForm.financingDueDay, 10) || 25;
          const finName = realEstateManageForm.financingName || `Financiamento: ${asset.name}`;

          if (selectedLiabilityForManage.id !== 'new-temp') {
            await supabase.from('liabilities').update({
              name: finName,
              type: 'MORTGAGE',
              total_amount: originalTotal,
              remaining_balance: balance,
              installment_amount: instAmount,
              installments_remaining: instCount,
              due_day: dueDayVal,
              metadata: {
                ...selectedLiabilityForManage.metadata,
                propertyType: 'PRONTO',
                isRealEstate: true
              }
            }).eq('id', selectedLiabilityForManage.id);
          } else {
            await supabase.from('liabilities').insert([{
              user_id: user.id,
              name: finName,
              type: 'MORTGAGE',
              total_amount: originalTotal,
              remaining_balance: balance,
              installment_amount: instAmount,
              installments_remaining: instCount,
              due_day: dueDayVal,
              linked_asset_id: asset.id,
              metadata: {
                propertyType: 'PRONTO',
                isRealEstate: true
              }
            }]);
          }
        }
        else if (realEstateManageForm.deliveryPaymentMethod === 'CONSORCIO') {
          if (realEstateManageForm.selectedConsortiumId) {
            await supabase.from('liabilities').update({
              linked_asset_id: asset.id,
              metadata: {
                propertyType: 'PRONTO',
                isRealEstate: true
              }
            }).eq('id', realEstateManageForm.selectedConsortiumId);
          }
          if (selectedLiabilityForManage.id !== 'new-temp' && selectedLiabilityForManage.id !== realEstateManageForm.selectedConsortiumId) {
            await supabase.from('liabilities').update({ is_archived: true }).eq('id', selectedLiabilityForManage.id);
          }
        }
      } else {
        const updatedMetadata = {
          ...(selectedLiabilityForManage.metadata || {}),
          propertyType: realEstateManageForm.propertyType,
          rentalIncome: rentVal,
          operationalExpenses: (realEstateManageForm.inquilinoPaysCondo ? 0 : condoVal) + (realEstateManageForm.inquilinoPaysIPTU ? 0 : iptuVal),
          deliveryDate: realEstateManageForm.deliveryDate
        };

        if (selectedLiabilityForManage.id === 'new-temp') {
          const { error } = await supabase.from('liabilities').insert([{
            user_id: user.id,
            name: selectedLiabilityForManage.name,
            type: 'MORTGAGE',
            total_amount: 0,
            remaining_balance: 0,
            installment_amount: instVal,
            linked_asset_id: selectedLiabilityForManage.linkedAssetId,
            metadata: {
              ...updatedMetadata,
              isRealEstate: true
            }
          }]);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('liabilities').update({
            installment_amount: instVal,
            metadata: updatedMetadata
          }).eq('id', selectedLiabilityForManage.id);
          if (error) throw error;
        }
      }

      setShowRealEstateManageModal(false);
      setSelectedLiabilityForManage(null);
      fetchData();
    } catch (err: any) {
      toast(`Erro ao salvar os ajustes: ${err.message}`, 'error');
    }
  };

  const syncHistoricalTransaction = async (liabilityId: string, name: string, hasHistory: boolean, paidAmount: number, userId: string) => {
    if (!supabase) return;

    try {
      const { data: existingTxs } = await supabase
        .from('transactions')
        .select('id')
        .eq('liability_id', liabilityId)
        .eq('metadata->>type', 'liability_historical_payment');

      const existingTx = existingTxs && existingTxs.length > 0 ? existingTxs[0] : null;

      if (hasHistory && paidAmount > 0) {
        const categoryName = 'Financiamento/Dívida';
        const { data: existingCat } = await supabase
          .from('categories')
          .select('id')
          .eq('user_id', userId)
          .eq('name', categoryName)
          .single();

        let catId = existingCat?.id || null;
        if (!existingCat) {
          const { data: c } = await supabase
            .from('categories')
            .insert({
              user_id: userId,
              name: categoryName,
              type: 'EXPENSE',
              color: 'bg-rose-50 text-rose-600'
            })
            .select('id')
            .single();
          if (c) catId = c.id;
        }

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const txDate = DateUtils.formatToISODate(yesterday);

        const txData = {
          user_id: userId,
          description: `Pagamentos Anteriores (Histórico) - ${name}`,
          amount: paidAmount,
          date: txDate,
          type: 'EXPENSE',
          category: categoryName,
          category_id: catId,
          is_paid: true,
          paid_amount: paidAmount,
          paid_at: txDate,
          liability_id: liabilityId,
          metadata: {
            is_historical: true,
            type: 'liability_historical_payment'
          }
        };

        if (existingTx) {
          await supabase
            .from('transactions')
            .update(txData)
            .eq('id', existingTx.id);
        } else {
          await supabase
            .from('transactions')
            .insert([txData]);
        }
      } else {
        if (existingTx) {
          await supabase
            .from('transactions')
            .delete()
            .eq('id', existingTx.id);
        }
      }
    } catch (err) {
      console.error("Error syncing historical transaction:", err);
    }
  };

  // Save regular liability form
  const handleSaveLiability = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    try {
      const installmentAmt = parseFloat(liabilityFormData.installmentAmount) || 0;
      const installmentsLeft = parseInt(liabilityFormData.installmentsRemaining, 10) || 0;
      const dueDay = parseInt(liabilityFormData.dueDay, 10) || 1;
      const totalAmt = parseFloat(liabilityFormData.totalAmount) || 0;
      const remainingBal = parseFloat(liabilityFormData.remainingBalance) || 0;

      if (totalAmt < 0 || remainingBal < 0 || installmentAmt < 0 || installmentsLeft < 0) {
        toast("Valores monetários e parcelas não podem ser negativos.", 'warning');
        return;
      }

      if (dueDay < 1 || dueDay > 31) {
        toast("O dia de vencimento deve estar entre 1 e 31.", 'warning');
        return;
      }

      if (editingLiability) {
        const { error } = await supabase.from('liabilities').update({
          name: liabilityFormData.name,
          type: liabilityFormData.type,
          total_amount: parseFloat(liabilityFormData.totalAmount) || 0,
          remaining_balance: parseFloat(liabilityFormData.remainingBalance) || 0,
          interest_rate: liabilityFormData.interestRate ? parseFloat(liabilityFormData.interestRate) : null,
          linked_asset_id: liabilityFormData.linkedAssetId || null,
          installment_amount: installmentAmt,
          installments_remaining: installmentsLeft,
          due_day: dueDay,
          metadata: {
            ...editingLiability.metadata,
            indexationRate: parseFloat(liabilityFormData.indexationRate) || 0,
            amortizationType: liabilityFormData.amortizationType,
            indexType: liabilityFormData.indexType,
            firstInstallmentDate: liabilityFormData.firstInstallmentDate || undefined,
            balloons: liabilityFormData.balloons,
            propertyType: liabilityFormData.type === 'MORTGAGE' ? (liabilityFormData.propertyType || 'PLANTA') : undefined,
            isRealEstate: liabilityFormData.type === 'MORTGAGE' ? true : undefined,
            historicalCalculationType: liabilityFormData.hasHistoricalPayments ? liabilityFormData.historicalCalculationType : undefined,
            historicalInstallmentsPaid: liabilityFormData.hasHistoricalPayments && liabilityFormData.historicalCalculationType === 'calculated' ? (parseInt(liabilityFormData.historicalInstallmentsPaid, 10) || undefined) : undefined,
            historicalInstallmentValue: liabilityFormData.hasHistoricalPayments && liabilityFormData.historicalCalculationType === 'calculated' ? (parseFloat(liabilityFormData.historicalInstallmentValue) || undefined) : undefined,
            historicalPaidAmount: liabilityFormData.hasHistoricalPayments ? (parseFloat(liabilityFormData.historicalPaidAmount) || undefined) : undefined
          }
        }).eq('id', editingLiability.id);
        if (error) throw error;

        // Sync historical transaction
        const hasHistory = liabilityFormData.hasHistoricalPayments;
        const paidAmount = parseFloat(liabilityFormData.historicalPaidAmount) || 0;
        await syncHistoricalTransaction(editingLiability.id, liabilityFormData.name, hasHistory, paidAmount, user.id);

        // Auto-sync names in transactions
        if (editingLiability.name !== liabilityFormData.name) {
          const { data: relatedTxs } = await supabase
            .from('transactions')
            .select('id, description')
            .eq('liability_id', editingLiability.id);

          if (relatedTxs) {
            for (const tx of relatedTxs) {
              const oldDesc = tx.description || '';
              if (oldDesc.includes(editingLiability.name)) {
                const newDesc = oldDesc.split(editingLiability.name).join(liabilityFormData.name);
                await supabase
                  .from('transactions')
                  .update({ description: newDesc })
                  .eq('id', tx.id);
              }
            }
          }
        }

        // #2 Regeneração de parcelas ao editar (opcional e só nas FUTURAS não pagas).
        // Regra "só daqui pra frente": nunca mexe em parcelas pagas ou com data passada.
        const oldInstallmentAmt = Number(editingLiability.installmentAmount) || 0;
        const oldInstallmentsLeft = Number(editingLiability.installmentsRemaining) || 0;
        const oldDueDay = Number(editingLiability.dueDay) || 0;
        const oldRemainingBal = Number(editingLiability.remainingBalance) || 0;
        const oldRatePct = Number(editingLiability.interestRate) || 0;
        const oldReajPct = Number(editingLiability.metadata?.indexationRate) || 0;
        const oldAmortType = editingLiability.metadata?.amortizationType || 'SAC';
        // Qualquer campo que entra no cálculo da parcela conta como mudança de cronograma —
        // antes só valor/quantidade/vencimento contavam, e mexer na taxa de juros, no
        // reajuste, no saldo devedor ou no tipo de amortização deixava as parcelas antigas
        // (calculadas com os números velhos) para trás.
        const scheduleChanged =
          forceRegenSchedule ||
          Math.abs(oldInstallmentAmt - installmentAmt) > 0.001 ||
          oldInstallmentsLeft !== installmentsLeft ||
          oldDueDay !== dueDay ||
          Math.abs(oldRemainingBal - remainingBal) > 0.001 ||
          Math.abs(oldRatePct - (parseFloat(liabilityFormData.interestRate) || 0)) > 0.0001 ||
          Math.abs(oldReajPct - (parseFloat(liabilityFormData.indexationRate) || 0)) > 0.0001 ||
          oldAmortType !== liabilityFormData.amortizationType;

        if (scheduleChanged && installmentAmt > 0 && installmentsLeft > 0) {
          // Se o usuário pediu explicitamente pelo checkbox, não precisa perguntar de novo.
          const confirmRegen = forceRegenSchedule || window.confirm(
            'Você alterou dados que definem as parcelas (valor, quantidade, vencimento, saldo, juros ou tipo de amortização).\n\n' +
            'Deseja REGERAR as parcelas FUTURAS ainda não pagas com os novos valores?\n' +
            '(As parcelas já pagas e as de datas passadas são mantidas.)'
          );
          if (confirmRegen) {
            const todayStr = DateUtils.formatToISODate();
            // Apaga apenas parcelas futuras, não pagas, geradas automaticamente para este passivo.
            const { data: futureParcels } = await supabase
              .from('transactions')
              .select('id')
              .eq('liability_id', editingLiability.id)
              .eq('is_paid', false)
              .gte('date', todayStr)
              .eq('metadata->>auto_generated', 'true');
            if (futureParcels && futureParcels.length > 0) {
              await supabase.from('transactions').delete().in('id', futureParcels.map((t: any) => t.id));
            }

            // Recria o cronograma futuro (mesma lógica SAC/Price da criação).
            // Financiamento de imóvel vinculado usa a MESMA categoria/rótulo do
            // assistente de Ativo Imobiliário — antes ficava com nome diferente
            // ("Financiamento/Dívida") dependendo de qual tela criou a dívida.
            const isLinkedRealEstateFinancing = liabilityFormData.type === 'MORTGAGE' && !!liabilityFormData.linkedAssetId;
            const categoryName = isLinkedRealEstateFinancing ? 'Ativos Imobiliários' : 'Financiamento/Dívida';
            let regenCatId: string | null = null;
            const { data: regenCat } = await supabase.from('categories')
              .select('id').eq('user_id', user.id).eq('name', categoryName).maybeSingle();
            if (regenCat) {
              regenCatId = regenCat.id;
            } else {
              const { data: c } = await supabase.from('categories').insert({
                user_id: user.id, name: categoryName, type: 'EXPENSE',
                color: isLinkedRealEstateFinancing ? 'bg-brand-50 text-brand-600' : 'bg-rose-50 text-rose-600'
              }).select('id').maybeSingle();
              if (c) regenCatId = c.id;
            }

            const today = new Date();
            const regenTxs: any[] = [];
            // Sem trava artificial: consórcios/financiamentos longos podem ter até
            // 420+ parcelas (ex.: consórcio de imóvel), e a trava de 120 fazia o
            // passivo perder parcelas silenciosamente.
            const MAX_REGEN = installmentsLeft;
            const regenPrincipal = remainingBal > 0 ? remainingBal : totalAmt;
            const regenRatePct = parseFloat(liabilityFormData.interestRate) || 0;
            const regenReajPct = parseFloat(liabilityFormData.indexationRate) || 0;
            const regenIsSAC = liabilityFormData.amortizationType === 'SAC';
            const regenNoDetails = regenRatePct <= 0 && regenReajPct <= 0;
            // Se o dia de vencimento deste mês ainda não passou, a 1ª parcela cai neste
            // mês; senão, cai no mês seguinte (antes pulava sempre pro mês seguinte).
            const regenFirstMonthOffset = dueDay > today.getDate() ? 0 : 1;
            for (let i = 1; i <= MAX_REGEN; i++) {
              const txDate = buildInstallmentDate(today.getFullYear(), today.getMonth(), regenFirstMonthOffset + (i - 1), dueDay);
              const parcelaAmt = regenNoDetails
                ? (installmentAmt > 0 ? installmentAmt : Math.round((regenPrincipal / installmentsLeft) * 100) / 100)
                : computeInstallmentAmount(i, regenPrincipal, installmentsLeft, regenRatePct, regenReajPct, regenIsSAC, installmentAmt);
              regenTxs.push({
                user_id: user.id,
                description: isLinkedRealEstateFinancing
                  ? `Parcela Financiamento ${i}/${installmentsLeft} (${liabilityFormData.amortizationType}) - ${liabilityFormData.name}`
                  : `Parcela ${i}/${installmentsLeft} - ${liabilityFormData.name}`,
                amount: parcelaAmt,
                // toISOString() converte pro fuso UTC e podia jogar a parcela pro dia
                // anterior/seguinte; formatToISODate respeita o fuso do aparelho.
                date: DateUtils.formatToISODate(txDate),
                type: 'EXPENSE',
                category: categoryName,
                subcategory: isLinkedRealEstateFinancing ? 'Financiamento' : undefined,
                category_id: regenCatId || null,
                is_paid: false,
                is_recurring: true,
                is_installment: true,
                installment_number: i,
                installment_total: installmentsLeft,
                installment_group_id: editingLiability.id,
                liability_id: editingLiability.id,
                is_amortization: isLinkedRealEstateFinancing || undefined,
                metadata: {
                  auto_generated: true,
                  installment_number: i,
                  installment_group_id: editingLiability.id,
                  linked_asset_id: liabilityFormData.linkedAssetId || undefined,
                  property_tx_type: isLinkedRealEstateFinancing ? 'FINANCING' : undefined,
                  liability_id: isLinkedRealEstateFinancing ? editingLiability.id : undefined
                }
              });
            }
            if (regenTxs.length > 0) {
              await supabase.from('transactions').insert(regenTxs);
            }
          }
        }
      } else {
        const { data: newLiab, error } = await supabase.from('liabilities').insert([{
          user_id: user.id,
          name: liabilityFormData.name,
          type: liabilityFormData.type,
          total_amount: parseFloat(liabilityFormData.totalAmount) || 0,
          remaining_balance: parseFloat(liabilityFormData.remainingBalance) || 0,
          interest_rate: liabilityFormData.interestRate ? parseFloat(liabilityFormData.interestRate) : null,
          installment_amount: installmentAmt,
          installments_remaining: installmentsLeft,
          due_day: dueDay,
          linked_asset_id: liabilityFormData.linkedAssetId || null,
          metadata: {
            indexationRate: parseFloat(liabilityFormData.indexationRate) || 0,
            amortizationType: liabilityFormData.amortizationType,
            indexType: liabilityFormData.indexType,
            firstInstallmentDate: liabilityFormData.firstInstallmentDate || undefined,
            balloons: liabilityFormData.balloons,
            propertyType: liabilityFormData.type === 'MORTGAGE' ? (liabilityFormData.propertyType || 'PLANTA') : undefined,
            isRealEstate: liabilityFormData.type === 'MORTGAGE' ? true : undefined,
            historicalCalculationType: liabilityFormData.hasHistoricalPayments ? liabilityFormData.historicalCalculationType : undefined,
            historicalInstallmentsPaid: liabilityFormData.hasHistoricalPayments && liabilityFormData.historicalCalculationType === 'calculated' ? (parseInt(liabilityFormData.historicalInstallmentsPaid, 10) || undefined) : undefined,
            historicalInstallmentValue: liabilityFormData.hasHistoricalPayments && liabilityFormData.historicalCalculationType === 'calculated' ? (parseFloat(liabilityFormData.historicalInstallmentValue) || undefined) : undefined,
            historicalPaidAmount: liabilityFormData.hasHistoricalPayments ? (parseFloat(liabilityFormData.historicalPaidAmount) || undefined) : undefined
          }
        }]).select();

        if (error) throw error;

        if (newLiab && newLiab.length > 0) {
          const liabilityId = newLiab[0].id;
          const hasHistory = liabilityFormData.hasHistoricalPayments;
          const paidAmount = parseFloat(liabilityFormData.historicalPaidAmount) || 0;
          await syncHistoricalTransaction(liabilityId, liabilityFormData.name, hasHistory, paidAmount, user.id);

          // Auto-generate future pending cash flow transactions
          if (installmentAmt > 0 && installmentsLeft > 0) {
            const today = new Date();
            // Financiamento de imóvel vinculado usa a MESMA categoria/rótulo do
            // assistente de Ativo Imobiliário — antes ficava com nome diferente
            // ("Financiamento/Dívida") dependendo de qual tela criou a dívida.
            const isLinkedRealEstateFinancing = liabilityFormData.type === 'MORTGAGE' && !!liabilityFormData.linkedAssetId;
            const categoryName = isLinkedRealEstateFinancing ? 'Ativos Imobiliários' : 'Financiamento/Dívida';

            const { data: existingCat } = await supabase.from('categories')
              .select('id').eq('user_id', user.id).eq('name', categoryName).single();

            let catId = '';
            if (!existingCat) {
              const { data: c } = await supabase.from('categories').insert({
                user_id: user.id,
                name: categoryName,
                type: 'EXPENSE',
                color: isLinkedRealEstateFinancing ? 'bg-brand-50 text-brand-600' : 'bg-rose-50 text-rose-600'
              }).select('id').single();
              if (c) catId = c.id;
            } else {
              catId = existingCat.id;
            }

            const futureTransactions = [];
            // Sem trava artificial: consórcios/financiamentos longos podem ter até
            // 420+ parcelas (ex.: consórcio de imóvel), e a trava de 120 fazia o
            // passivo perder parcelas silenciosamente.
            const MAX_GENERATE = installmentsLeft;
            // Base = saldo devedor (o que falta). Parcelas seguem amortização + correção; linear só se tudo zerado.
            const principalForSchedule = remainingBal > 0 ? remainingBal : totalAmt;
            const scheduleRatePct = parseFloat(liabilityFormData.interestRate) || 0;
            const scheduleReajPct = parseFloat(liabilityFormData.indexationRate) || 0;
            const isSAC = liabilityFormData.amortizationType === 'SAC';
            const noDetails = scheduleRatePct <= 0 && scheduleReajPct <= 0;
            // Se o dia de vencimento deste mês ainda não passou, a 1ª parcela cai neste
            // mês; senão, cai no mês seguinte (antes pulava sempre pro mês seguinte, e uma
            // dívida cadastrada antes do vencimento do mês "sumia" até o mês seguinte).
            const firstMonthOffset = dueDay > today.getDate() ? 0 : 1;
            for (let i = 1; i <= MAX_GENERATE; i++) {
              const txDate = buildInstallmentDate(today.getFullYear(), today.getMonth(), firstMonthOffset + (i - 1), dueDay);
              // Se não há juros nem reajuste, usa o valor informado (linear). Senão, calcula pelos
              // detalhes ANCORADO no valor da parcela informado (ver computeInstallmentAmount).
              const parcelaAmt = noDetails
                ? (installmentAmt > 0 ? installmentAmt : Math.round((principalForSchedule / installmentsLeft) * 100) / 100)
                : computeInstallmentAmount(i, principalForSchedule, installmentsLeft, scheduleRatePct, scheduleReajPct, isSAC, installmentAmt);
              futureTransactions.push({
                user_id: user.id,
                description: isLinkedRealEstateFinancing
                  ? `Parcela Financiamento ${i}/${installmentsLeft} (${liabilityFormData.amortizationType}) - ${liabilityFormData.name}`
                  : `Parcela ${i}/${installmentsLeft} - ${liabilityFormData.name}`,
                amount: parcelaAmt,
                // toISOString() converte pro fuso UTC e podia jogar a parcela pro dia
                // anterior/seguinte; formatToISODate respeita o fuso do aparelho.
                date: DateUtils.formatToISODate(txDate),
                type: 'EXPENSE',
                category: categoryName,
                subcategory: isLinkedRealEstateFinancing ? 'Financiamento' : undefined,
                category_id: catId || null,
                is_paid: false,
                is_recurring: true,
                is_installment: true,
                installment_number: i,
                installment_total: installmentsLeft,
                installment_group_id: liabilityId,
                liability_id: liabilityId,
                is_amortization: isLinkedRealEstateFinancing || undefined,
                metadata: {
                  auto_generated: true,
                  installment_number: i,
                  installment_group_id: liabilityId,
                  linked_asset_id: liabilityFormData.linkedAssetId || undefined,
                  property_tx_type: isLinkedRealEstateFinancing ? 'FINANCING' : undefined,
                  liability_id: isLinkedRealEstateFinancing ? liabilityId : undefined
                }
              });
            }

            await supabase.from('transactions').insert(futureTransactions);
          }
        }
      }

      setShowLiabilityModal(false);
      setEditingLiability(null);
      setForceRegenSchedule(false);
      setLiabilityFormData({
        name: '',
        type: 'PERSONAL_LOAN',
        totalAmount: '',
        remainingBalance: '',
        interestRate: '',
        installmentAmount: '',
        installmentsRemaining: '',
        dueDay: '',
        linkedAssetId: '',
        indexationRate: '',
        amortizationType: 'SAC',
        indexType: 'FIXED',
        firstInstallmentDate: '',
        balloonMonth: '',
        balloonYear: '',
        balloonAmount: '',
        balloons: [],
        propertyType: 'PLANTA',
        hasHistoricalPayments: false,
        historicalCalculationType: 'calculated',
        historicalInstallmentsPaid: '',
        historicalInstallmentValue: '',
        historicalPaidAmount: ''
      });
      fetchData();
    } catch (err: any) {
      toast(`Erro ao salvar passivo: ${err.message}`, 'error');
    }
  };

  const openEditLiability = (liability: any) => {
    setEditingLiability(liability);
    const hasHistory = !!(liability.metadata?.historicalPaidAmount && parseFloat(liability.metadata.historicalPaidAmount) > 0);
    setLiabilityFormData({
      name: liability.name,
      type: liability.type,
      totalAmount: String(liability.totalAmount),
      remainingBalance: String(liability.remainingBalance),
      interestRate: liability.interestRate ? String(liability.interestRate) : '',
      installmentAmount: liability.installmentAmount ? String(liability.installmentAmount) : '',
      installmentsRemaining: liability.installmentsRemaining ? String(liability.installmentsRemaining) : '',
      dueDay: liability.dueDay ? String(liability.dueDay) : '',
      linkedAssetId: liability.linkedAssetId || '',
      indexationRate: liability.metadata?.indexationRate ? String(liability.metadata.indexationRate) : '',
      amortizationType: liability.metadata?.amortizationType || 'SAC',
      indexType: liability.metadata?.indexType || liability.metadata?.indexationType || 'FIXED',
      firstInstallmentDate: liability.metadata?.firstInstallmentDate || '',
      balloonMonth: '',
      balloonYear: '',
      balloonAmount: '',
      balloons: liability.metadata?.balloons || [],
      propertyType: liability.metadata?.propertyType || 'PLANTA',
      hasHistoricalPayments: hasHistory,
      historicalCalculationType: liability.metadata?.historicalCalculationType || 'calculated',
      historicalInstallmentsPaid: liability.metadata?.historicalInstallmentsPaid ? String(liability.metadata.historicalInstallmentsPaid) : '',
      historicalInstallmentValue: liability.metadata?.historicalInstallmentValue ? String(liability.metadata.historicalInstallmentValue) : '',
      historicalPaidAmount: liability.metadata?.historicalPaidAmount ? String(liability.metadata.historicalPaidAmount) : ''
    });
    setForceRegenSchedule(false);
    setShowLiabilityModal(true);
  };

  const handleDeleteLiability = async (id: string) => {
    if (!supabase) return;
    if (!window.confirm("Certeza que deseja excluir permanentemente este passivo? ATENÇÃO: Isso apagará também todo o histórico de pagamentos e transações vinculadas a este passivo! Para manter o histórico, considere Arquivar o passivo em vez de excluí-lo.")) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      // 1. Apaga TODAS as transações vinculadas a este passivo (parcelas, pagamentos)
      const { error: txErr } = await supabase.from('transactions').delete().eq('liability_id', id);
      if (txErr) console.warn('[Assets] Falha ao apagar transações do passivo:', txErr.message);

      // 1b. Apaga também lançamentos que só têm o vínculo no metadata (ex.: recebimentos antigos
      // de empréstimo/financiamento criados sem preencher a coluna liability_id). Sem isso eles
      // ficavam órfãos no banco após a exclusão do passivo.
      const { error: txMetaErr } = await supabase.from('transactions').delete().eq('metadata->>liability_id', id);
      if (txMetaErr) console.warn('[Assets] Falha ao apagar transações órfãs do passivo (metadata):', txMetaErr.message);

      // 2. Se houver consórcio vinculado, apaga também
      await supabase.from('consortiums').delete().eq('liability_id', id);

      // 3. Apaga o passivo
      const { error } = await supabase.from('liabilities').delete().eq('id', id);
      if (error) throw error;

      // 4. Limpa caches locais (evita dados fantasma)
      try {
        if (userId) localStorage.removeItem(`finvision_cached_raw_txs_${userId}`);
        localStorage.removeItem('finvision_cached_home_txs');
        localStorage.removeItem('finvision_cached_summary');
      } catch (e) {}

      fetchData();
    } catch (err: any) {
      toast(`Erro ao excluir passivo: ${err.message}`, 'error');
    }
  };

  const handleArchiveLiability = async (liability: Liability) => {
    if (!supabase) return;
    const actionText = liability.remainingBalance === 0 ? "arquivar" : "quitar e arquivar";
    if (!window.confirm(`Deseja realmente ${actionText} este passivo? Ele será removido da lista ativa, e todas as parcelas futuras PENDENTES (não pagas) associadas a ele serão excluídas para não afetar suas projeções. Os pagamentos históricos já realizados serão mantidos.`)) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      const { error: liabError } = await supabase
        .from('liabilities')
        .update({ is_archived: true })
        .eq('id', liability.id);
      if (liabError) throw liabError;

      const { error: txError } = await supabase
        .from('transactions')
        .delete()
        .eq('liability_id', liability.id)
        .eq('is_paid', false);
      if (txError) throw txError;

      // Limpa caches locais (evita dados fantasma nas projeções/resumo)
      try {
        if (userId) {
          localStorage.removeItem(`finvision_cached_raw_txs_${userId}`);
          localStorage.removeItem(`finvision_cached_projections_${userId}`);
        }
        localStorage.removeItem('finvision_cached_home_txs');
        localStorage.removeItem('finvision_cached_summary');
      } catch (e) {}

      fetchData();
    } catch (err: any) {
      toast(`Erro ao arquivar passivo: ${err.message}`, 'error');
    }
  };

  const handleUnarchiveLiability = async (liability: Liability) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('liabilities')
        .update({ is_archived: false })
        .eq('id', liability.id);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      toast(`Erro ao desarquivar passivo: ${err.message}`, 'error');
    }
  };

  const handleSaveLiabilityTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !selectedLiabilityForExtrato) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const amt = parseFloat(newTxForm.amount) || 0;
      if (amt <= 0) {
        toast("Preencha um valor válido.", 'warning');
        return;
      }

      let catId = '';
      const categoryName = newTxForm.category || 'Financiamento/Dívida';
      const { data: catRes } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', categoryName)
        .single();
      if (catRes) {
        catId = catRes.id;
      } else {
        const { data: newCat } = await supabase
          .from('categories')
          .insert({
            user_id: user.id,
            name: categoryName,
            type: 'EXPENSE',
            color: 'bg-rose-50 text-rose-600'
          })
          .select('id')
          .single();
        if (newCat) catId = newCat.id;
      }

      // Check if there is an unpaid pre-existing transaction for this liability
      const { data: unpaidTx } = await supabase
        .from('transactions')
        .select('*')
        .eq('liability_id', selectedLiabilityForExtrato.id)
        .eq('is_paid', false)
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (unpaidTx) {
        // Update the pre-existing unpaid transaction to is_paid = true
        const { error: txError } = await supabase
          .from('transactions')
          .update({
            is_paid: true,
            amount: amt,
            paid_amount: amt,
            paid_at: newTxForm.date,
            date: newTxForm.date,
            description: newTxForm.description,
            metadata: {
              ...(unpaidTx.metadata || {}),
              is_historical: newTxForm.isHistorical,
              auto_generated: false
            }
          })
          .eq('id', unpaidTx.id);

        if (txError) throw txError;
      } else {
        // Fallback: If no unpaid transaction exists, insert a new one
        const newTx = {
          user_id: user.id,
          description: newTxForm.description,
          amount: amt,
          date: newTxForm.date,
          type: 'EXPENSE',
          category: categoryName,
          category_id: catId || null,
          is_paid: true,
          is_installment: false,
          liability_id: selectedLiabilityForExtrato.id,
          is_amortization: true,
          metadata: {
            is_historical: newTxForm.isHistorical,
            auto_generated: false,
            linked_asset_id: selectedLiabilityForExtrato.linkedAssetId || undefined
          }
        };
        const { error: txError } = await supabase.from('transactions').insert([newTx]);
        if (txError) throw txError;
      }

      const currentRemaining = selectedLiabilityForExtrato.remainingBalance;
      const newRemaining = Math.max(0, currentRemaining - amt);

      const currentInstallments = selectedLiabilityForExtrato.installmentsRemaining;
      const newInstallments = currentInstallments && currentInstallments > 0 ? currentInstallments - 1 : currentInstallments;

      const { error: liabError } = await supabase
        .from('liabilities')
        .update({
          remaining_balance: newRemaining,
          installments_remaining: newInstallments
        })
        .eq('id', selectedLiabilityForExtrato.id);
      if (liabError) throw liabError;

      setIsAddingLiabilityTx(false);
      
      setSelectedLiabilityForExtrato(prev => prev ? {
        ...prev,
        remainingBalance: newRemaining,
        installmentsRemaining: newInstallments
      } : null);

      fetchData();
    } catch (err: any) {
      toast(`Erro ao lançar pagamento: ${err.message}`, 'error');
    }
  };

  const handleDeleteLiabilityTransaction = async (txId: string, amount: number) => {
    if (!supabase || !selectedLiabilityForExtrato) return;
    if (!window.confirm("Deseja realmente excluir este pagamento? O saldo devedor do passivo será reajustado (somado) com o valor deste pagamento.")) return;
    try {
      // Fetch the transaction before deleting/updating
      const { data: txToDelete } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', txId)
        .single();

      if (txToDelete && (txToDelete.is_installment || txToDelete.installment_number || txToDelete.metadata?.auto_generated)) {
        // If it was part of a schedule, revert it to is_paid = false and clear paid fields
        const { error: txError } = await supabase
          .from('transactions')
          .update({
            is_paid: false,
            paid_amount: null,
            paid_at: null,
            metadata: {
              ...(txToDelete.metadata || {}),
              auto_generated: true
            }
          })
          .eq('id', txId);
        if (txError) throw txError;
      } else {
        // Otherwise, completely delete the custom amortization transaction
        const { error: txError } = await supabase.from('transactions').delete().eq('id', txId);
        if (txError) throw txError;
      }

      const currentRemaining = selectedLiabilityForExtrato.remainingBalance;
      const newRemaining = currentRemaining + amount;

      const currentInstallments = selectedLiabilityForExtrato.installmentsRemaining;
      const newInstallments = currentInstallments !== null && currentInstallments !== undefined ? currentInstallments + 1 : currentInstallments;

      const { error: liabError } = await supabase
        .from('liabilities')
        .update({
          remaining_balance: newRemaining,
          installments_remaining: newInstallments
        })
        .eq('id', selectedLiabilityForExtrato.id);
      if (liabError) throw liabError;

      setSelectedLiabilityForExtrato(prev => prev ? {
        ...prev,
        remainingBalance: newRemaining,
        installmentsRemaining: newInstallments
      } : null);

      // Limpa caches locais (evita dados fantasma nas projeções/resumo)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (userId) {
          localStorage.removeItem(`finvision_cached_raw_txs_${userId}`);
          localStorage.removeItem(`finvision_cached_projections_${userId}`);
        }
        localStorage.removeItem('finvision_cached_home_txs');
        localStorage.removeItem('finvision_cached_summary');
      } catch (e) {}

      fetchData();
    } catch (err: any) {
      toast(`Erro ao excluir pagamento: ${err.message}`, 'error');
    }
  };

  // Save Local Card Extrato Transaction
  const handleSaveCardTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !selectedAssetForExtrato) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const amt = parseFloat(newTxForm.amount) || 0;
      if (amt <= 0) {
        toast("Preencha um valor válido.", 'warning');
        return;
      }

      // Ensure Category exists or get its id
      let catId = '';
      const { data: catRes } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', newTxForm.category)
        .single();
      if (catRes) {
        catId = catRes.id;
      } else {
        const { data: newCat } = await supabase
          .from('categories')
          .insert({
            user_id: user.id,
            name: newTxForm.category,
            type: newTxForm.type,
            color: 'bg-brand-50 text-brand-600'
          })
          .select('id')
          .single();
        if (newCat) catId = newCat.id;
      }

      // Construct metadata referencing the asset and historical status
      const metadata: Record<string, any> = {
        linked_asset_id: selectedAssetForExtrato.id,
        is_historical: newTxForm.isHistorical
      };

      if (newTxForm.type === 'INCOME') {
        metadata.type = 'short_stay_income';
      }

      // Save Transaction
      const { error } = await supabase
        .from('transactions')
        .insert([{
          user_id: user.id,
          description: newTxForm.description,
          amount: amt,
          date: newTxForm.date,
          type: newTxForm.type,
          category: newTxForm.category,
          category_id: catId || null,
          is_paid: true,
          paid_amount: amt,
          paid_at: newTxForm.date,
          metadata
        }]);

      if (error) throw error;

      // Reset transaction form and reload data
      setIsAddingExtratoTx(false);
      setNewTxForm({
        description: '',
        amount: '',
        type: 'EXPENSE',
        date: DateUtils.formatToISODate(),
        isHistorical: false,
        category: 'Outros',
        subcategory: '',
        isCapitalized: false
      });
      
      // Update selected asset representation locally to reflect the new transaction
      fetchData();
    } catch (err: any) {
      toast(`Erro ao adicionar lançamento: ${err.message}`, 'error');
    }
  };

  // Delete Card Transaction from Extrato
  const handleDeleteCardTransaction = async (txId: string) => {
    if (!supabase) return;
    if (!window.confirm("Certeza que deseja remover este lançamento?")) return;
    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', txId);

      if (error) throw error;
      fetchData();
    } catch (err: any) {
      toast(`Erro ao deletar lançamento: ${err.message}`, 'error');
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const InfoTooltip: React.FC<{ content: string }> = ({ content }) => {
    return (
      <div className="group relative inline-block ml-1 cursor-help align-middle select-none">
        <HelpCircle size={12} className="text-slate-400 group-hover:text-brand-500 transition-colors" />
        <div className="absolute z-[100] bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 bg-slate-950 text-xs text-slate-200 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 border border-slate-800 text-center leading-normal normal-case font-medium">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-950" />
        </div>
      </div>
    );
  };

  const TrendValue: React.FC<{
    value: number;
    percent?: number;
    suffix?: string;
  }> = ({ value, percent, suffix = '' }) => {
    const isPositive = value >= 0;
    return (
      <span className={`font-black flex items-center gap-0.5 ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
        {isPositive ? '+' : ''}
        {formatCurrency(value)}
        {percent !== undefined && (
          <span className="text-xs font-bold">({isPositive ? '+' : ''}{percent.toFixed(1)}%{suffix})</span>
        )}
        {isPositive ? (
          <ArrowUpRight size={12} className="text-emerald-600 inline shrink-0" aria-hidden="true" />
        ) : (
          <ArrowDownRight size={12} className="text-rose-600 inline shrink-0" aria-hidden="true" />
        )}
      </span>
    );
  };

  // Totals calculations
  const totalPhysical = enrichedPhysicalAssets
    .filter(p => p.category !== 'INVESTMENT' && !p.metadata?.isLoan)
    .reduce((acc, curr) => {
      if (curr.category === 'REAL_ESTATE' && curr.metadata?.propertyStage === 'PLANTA') {
        const meta = curr.metadata || {};
        return acc + curr.estimatedValue - (Number(meta.deliveryBalance) || 0);
      }
      return acc + curr.estimatedValue;
    }, 0);
  
  const totalFinancial = dynamicBrokers.reduce((acc, curr) => acc + curr.balance, 0);
  const totalLiabilities = activeLiabilities.reduce((acc, curr) => acc + curr.remainingBalance, 0);

  const totalLoans = enrichedPhysicalAssets
    .filter(p => p.metadata?.isLoan)
    .reduce((sum, loan) => {
      const meta = loan.metadata || {};
      const principal = Number(meta.loanPrincipal) || 0;
      const txs = linkedTransactionsMap.get(loan.id) || [];
      const returned = txs.filter(t => t.type === 'INCOME').reduce((s, t) => s + Number(t.amount || 0), 0);
      const outstanding = Math.max(0, principal - returned);
      return sum + outstanding;
    }, 0);

  const totalAssets = totalPhysical + totalFinancial + totalLoans;
  const totalNetWorth = totalAssets - totalLiabilities;

  // Helper to dynamically match a single transaction to a physical asset
  const isTransactionLinkedToAsset = (t: any, p: PhysicalAsset) => {
    const linkedTxs = linkedTransactionsMap.get(p.id) || [];
    return linkedTxs.some(lt => lt.id === t.id);
  };

  // Helper to dynamically match transactions to a physical asset using metadata or clean name substring matching
  const getAssetTransactions = (p: PhysicalAsset) => {
    return linkedTransactionsMap.get(p.id) || [];
  };

  // Complete, deep executive financial KPIs unifications (excluding archived items)
  const overviewData = useMemo(() => {
    const activePhys = enrichedPhysicalAssets;
    const activeLiab = activeLiabilities;

    // Helper to dynamically link a liability to an asset with name substring fallback
    const isLiabilityLinkedToAsset = (l: Liability, p: PhysicalAsset) => {
      return l.linkedAssetId === p.id;
    };

    // 1. INVESTIMENTO IMOBILIÁRIO SUMS
    const plantaAssets = activePhys.filter(p => p.category === 'REAL_ESTATE' && p.metadata?.propertyStage === 'PLANTA');
    const prontoAssets = activePhys.filter(p => p.category === 'REAL_ESTATE' && p.metadata?.propertyStage !== 'PLANTA');

    const plantaValue = plantaAssets.reduce((sum, p) => sum + p.estimatedValue, 0);
    const plantaLiabs = activeLiab.filter(l => plantaAssets.some(p => isLiabilityLinkedToAsset(l, p)));
    const plantaInstallments = plantaAssets.reduce((sum, p) => {
      const meta = p.metadata || {};
      const assetTxs = linkedTransactionsMap.get(p.id) || [];
      const nextUnpaidInstallment = assetTxs
        .filter(t => t.metadata?.property_tx_type === 'CONSTRUCTOR_INSTALLMENT' && !t.isPaid)
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      
      let constructorInstallment = 0;
      if (nextUnpaidInstallment) {
        constructorInstallment = nextUnpaidInstallment.amount;
      } else {
        const constrAmt = Number(meta.constructorAmount) || 0;
        const constrN = Number(meta.constructorInstallmentsCount) || 1;
        constructorInstallment = constrAmt > 0 && constrN > 0 ? (constrAmt / constrN) : 0;
      }

      const linkedLiab = activeLiab.find(l => l.linkedAssetId === p.id);
      const allocationRatio = meta.consortiumAllocationRatio !== undefined ? (Number(meta.consortiumAllocationRatio) / 100) : 1;
      const financingInstallment = linkedLiab 
        ? (Number(linkedLiab.installmentAmount) * allocationRatio) 
        : (Number(meta.financingInstallment) || 0);

      return sum + constructorInstallment + financingInstallment;
    }, 0);
    
    // Sum of amortized amount from liability total - remaining balance
    const plantaLiabAmortized = plantaLiabs.reduce((sum, l) => sum + (l.totalAmount - l.remainingBalance), 0);
    
    // Fetch all transactions linked to planta assets via map
    const plantaTxs = plantaAssets.flatMap(p => linkedTransactionsMap.get(p.id) || []);

    // Sum of explicit transaction payments
    const plantaTxAmortized = plantaTxs.filter(t => 
      t.type === 'EXPENSE' && 
      t.isPaid && 
      !t.description.toLowerCase().includes('condomínio') && 
      !t.description.toLowerCase().includes('condominio') && 
      !t.description.toLowerCase().includes('iptu')
    ).reduce((sum, t) => sum + (t.paidAmount || t.amount), 0);
    const plantaHistoricalPaid = plantaAssets.reduce((sum, p) => sum + (Number(p.metadata?.historicalPaidAmount) || 0), 0);
    const plantaAmortizationPaid = plantaHistoricalPaid + (plantaLiabAmortized > 0 ? plantaLiabAmortized : plantaTxAmortized);

    const plantaPaidTotal = plantaAmortizationPaid;
    const plantaDeliveryBalance = plantaAssets.reduce((sum, p) => sum + (Number(p.metadata?.deliveryBalance) || 0), 0);
    const plantaRemainingToPay = plantaValue - plantaPaidTotal;

    const plantaAdditionalExpenses = plantaTxs.filter(t => 
      t.type === 'EXPENSE' && 
      !t.is_recurring && 
      t.metadata?.type !== 'delivery_quitacao'
    ).reduce((sum, t) => sum + t.amount, 0);

    const prontoValue = prontoAssets.reduce((sum, p) => sum + p.estimatedValue, 0);
    const rentedProntoAssets = prontoAssets.filter(p => p.metadata?.isRented);
    const totalRentedValue = rentedProntoAssets.reduce((sum, p) => sum + p.estimatedValue, 0);
    const totalAnnualizedNetRent = rentedProntoAssets.reduce((sum, p) => {
      const meta = p.metadata || {};
      const monthlyNet = (Number(meta.rentalIncome) || 0) 
        - (meta.inquilinoPaysCondo ? 0 : (Number(meta.condoFee) || 0)) 
        - (meta.inquilinoPaysIPTU ? 0 : (Number(meta.iptuFee) || 0));
      return sum + (monthlyNet * 12);
    }, 0);
    const prontoCapRate = totalRentedValue > 0 ? (totalAnnualizedNetRent / totalRentedValue) * 100 : 0;

    const prontoLiabs = activeLiab.filter(l => prontoAssets.some(p => isLiabilityLinkedToAsset(l, p)));
    const prontoInstallments = prontoLiabs.reduce((sum, l) => sum + (l.installmentAmount || 0), 0);
    const prontoContracted = prontoLiabs.reduce((sum, l) => sum + l.totalAmount, 0);
    
    const prontoOperatingCosts = prontoAssets.reduce((sum, p) => {
      const meta = p.metadata || {};
      let cost = 0;
      if (!meta.inquilinoPaysCondo && meta.condoFee) cost += Number(meta.condoFee);
      if (!meta.inquilinoPaysIPTU && meta.iptuFee) cost += Number(meta.iptuFee);
      return sum + cost;
    }, 0);

    // Sum of amortized amount from ready liabilities: total_amount - remaining_balance
    const prontoLiabAmortized = prontoLiabs.reduce((sum, l) => sum + (l.totalAmount - l.remainingBalance), 0);

    // Fetch all transactions linked to pronto assets via map
    const prontoTxs = prontoAssets.flatMap(p => linkedTransactionsMap.get(p.id) || []);

    // Fallback transaction-based payments
    const prontoTxAmortized = prontoTxs.filter(t => 
      t.type === 'EXPENSE' && 
      t.isPaid && 
      !t.description.toLowerCase().includes('condomínio') && 
      !t.description.toLowerCase().includes('condominio') && 
      !t.description.toLowerCase().includes('iptu')
    ).reduce((sum, t) => sum + (t.paidAmount || t.amount), 0);
    const prontoHistoricalPaid = prontoAssets.reduce((sum, p) => sum + (Number(p.metadata?.historicalPaidAmount) || 0), 0);
    const prontoAmortizationPaid = prontoHistoricalPaid + (prontoLiabAmortized > 0 ? prontoLiabAmortized : prontoTxAmortized);

    const prontoRemainingToPay = prontoLiabs.reduce((sum, l) => sum + l.remainingBalance, 0);

    // Total rents matching description or linked metadata
    const prontoReceived = prontoTxs.filter(t => 
      t.type === 'INCOME' && 
      t.isPaid
    ).reduce((sum, t) => sum + (t.paidAmount || t.amount), 0);

    // Net value if sold after paying off remaining financing debt: estimatedValue - remainingBalance
    const prontoNetFlow = prontoValue - prontoRemainingToPay;

    // Monthly net flow for the current month: rent inflows minus monthly mortgage installment, condo, and IPTU
    const currentMonthStr = DateUtils.formatToISODate(new Date()).substring(0, 7);
    const prontoCurrentMonthIncome = prontoTxs.filter(t => 
      t.type === 'INCOME' && 
      t.isPaid && 
      t.date.substring(0, 7) === currentMonthStr
    ).reduce((sum, t) => sum + (t.paidAmount || t.amount), 0);

    const prontoCurrentMonthExpenses = prontoTxs.filter(t => 
      t.type === 'EXPENSE' && 
      t.isPaid && 
      t.date.substring(0, 7) === currentMonthStr
    ).reduce((sum, t) => sum + (t.paidAmount || t.amount), 0);
    const prontoExpectedExpenses = prontoInstallments + prontoOperatingCosts;
    const prontoOutflowActualOrExpected = prontoCurrentMonthExpenses > 0 ? prontoCurrentMonthExpenses : prontoExpectedExpenses;

    // As requested: If the actual rent of the current month is zero/not cleared, the flow must show negative
    const prontoMonthlyNetFlow = prontoCurrentMonthIncome - prontoOutflowActualOrExpected;

    // 2. BENS FÍSICOS SUMS (Uso vs Investimento, excluding REAL_ESTATE)
    const physicalUso = activePhys.filter(p => p.category !== 'REAL_ESTATE' && p.metadata?.purpose === 'uso');
    const physicalInv = activePhys.filter(p => p.category !== 'REAL_ESTATE' && p.metadata?.purpose === 'investimento');
    const veiculoValue = activePhys.filter(p => p.category === 'VEHICLE').reduce((sum, p) => sum + p.estimatedValue, 0);
    const outroFisicoValue = activePhys.filter(p => p.category === 'OTHER').reduce((sum, p) => sum + p.estimatedValue, 0);

    const usoAcquisitionTotal = physicalUso.reduce((sum, p) => sum + (Number(p.metadata?.purchaseValue) || 0), 0);
    const usoCurrentValueTotal = physicalUso.reduce((sum, p) => sum + p.estimatedValue, 0);
    const usoAgioDesagio = usoCurrentValueTotal - usoAcquisitionTotal;
    const usoAgioDesagioPercent = usoAcquisitionTotal > 0 ? (usoAgioDesagio / usoAcquisitionTotal) * 100 : 0;

    const invAcquisitionTotal = physicalInv.reduce((sum, p) => sum + (Number(p.metadata?.purchaseValue) || 0), 0);
    const invEstimatedValue = physicalInv.reduce((sum, p) => sum + p.estimatedValue, 0);
    const invBrokerFees = physicalInv.reduce((sum, p) => sum + (Number(p.metadata?.brokerFee) || 0), 0);
    
    // Fetch all transactions linked to physical investment assets via map
    const physicalInvTxs = physicalInv.flatMap(p => linkedTransactionsMap.get(p.id) || []);

    const invExtraExpenses = physicalInvTxs.filter(t => 
      t.type === 'EXPENSE'
    ).reduce((sum, t) => sum + t.amount, 0);

    const invNetProfit = invEstimatedValue - (invAcquisitionTotal + invBrokerFees + invExtraExpenses);
    const invProfitPercent = (invAcquisitionTotal + invBrokerFees + invExtraExpenses) > 0 
      ? (invNetProfit / (invAcquisitionTotal + invBrokerFees + invExtraExpenses)) * 100 
      : 0;

    // 3. INVESTIMENTOS FINANCEIROS
    const totalFinancialFunds = totalFinancial;
    
    const activeInvests = enrichedPhysicalAssets.filter(
      p => p.category === 'INVESTMENT' && p.metadata?.status !== 'RESGATADO'
    );
    
    const financialAllocation: { type: string, balance: number }[] = [];
    
    // 1. Add individual investments grouped by investmentType
    activeInvests.forEach(inv => {
      let type = inv.metadata?.investmentType || 'Outros';
      // Format investment type to readable name
      if (type === 'CDB') type = 'CDB / Renda Fixa';
      else if (type === 'LCI_LCA') type = 'LCI / LCA';
      else if (type === 'CRI_CRA') type = 'CRI / CRA';
      else if (type === 'Acoes') type = 'Ações';
      else if (type === 'FIIs') type = 'FIIs (Fundos Imob.)';
      else if (type === 'Tesouro') type = 'Tesouro Direto';
      else if (type === 'COE') type = 'COE';
      else if (type === 'DEBENTURES') type = 'Debêntures';
      else if (type === 'FUNDS') type = 'Fundos de Invest.';
      
      financialAllocation.push({ type, balance: inv.estimatedValue });
    });
    
    // 2. Add broker cash balances
    dynamicBrokers.forEach(b => {
      const cash = Number(b.initial_balance) || 0;
      if (cash > 0) {
        financialAllocation.push({ type: 'Saldo em Caixa', balance: cash });
      }
    });
    
    const allocationGrouped = financialAllocation.reduce((acc: any, curr) => {
      acc[curr.type] = (acc[curr.type] || 0) + curr.balance;
      return acc;
    }, {});

    const allocationList = Object.keys(allocationGrouped).map(type => ({
      type,
      balance: allocationGrouped[type],
      percentage: totalFinancialFunds > 0 ? Math.round((allocationGrouped[type] / totalFinancialFunds) * 100) : 0
    })).sort((a,b) => b.balance - a.balance);

    // Yield transactions (categories Rendimentos/Investimentos or metadata type), excluding Resgates
    const yieldTxs = transactions.filter(t => 
      t.type === 'INCOME' && 
      t.subcategory !== 'Resgate' &&
      t.metadata?.type !== 'investment_redemption_total' &&
      t.metadata?.type !== 'investment_redemption_partial' &&
      (t.category === 'Rendimentos' || t.category === 'Investimentos' || t.metadata?.type === 'investment_yield')
    );

    const transactionCurrentMonthYield = yieldTxs.filter(t => 
      t.date.substring(0, 7) === currentMonthStr
    ).reduce((sum, t) => sum + t.amount, 0);

    const activeInvestments = enrichedPhysicalAssets.filter(
      p => p.category === 'INVESTMENT' && p.metadata?.status !== 'RESGATADO'
    );

    const investmentsEstimatedMonthlyYield = activeInvestments.reduce((sum, inv) => {
      const rate = inv.parsedAnnualRate || 0;
      const value = inv.estimatedValue || 0;
      const monthlyRate = Math.pow(1 + rate / 100, 1 / 12) - 1;
      return sum + (value * monthlyRate);
    }, 0);

    const currentMonthYield = transactionCurrentMonthYield;

    const uniqueMonths = Array.from(new Set(yieldTxs.map(t => t.date.substring(0, 7))));
    const transactionAverageYield = uniqueMonths.length > 0 
      ? yieldTxs.reduce((sum, t) => sum + t.amount, 0) / uniqueMonths.length 
      : 0;
    const averageMonthlyYield = transactionAverageYield;

    // 4. PASSIVOS E DÍVIDAS (Consórcios vs Financiamentos)
    const consortiums = activeLiab.filter(l => l.type === 'CONSORTIUM');
    const financings = activeLiab.filter(l => l.type !== 'CONSORTIUM');

    const consInstallments = consortiums.reduce((sum, l) => sum + (l.installmentAmount || 0), 0);
    const consContracted = consortiums.reduce((sum, l) => sum + l.totalAmount, 0);
    const consPaid = consortiums.reduce((sum, l) => sum + (l.totalAmount - l.remainingBalance), 0);
    const consRemaining = consortiums.reduce((sum, l) => sum + l.remainingBalance, 0);
    const consLances = consortiums.reduce((sum, l) => sum + (Number(l.metadata?.lanceValue) || 0), 0);
    const consUtilized = consortiums.filter(l => l.linkedAssetId).reduce((sum, l) => sum + l.remainingBalance, 0);
    const consToContemplate = consortiums.filter(l => !l.linkedAssetId).reduce((sum, l) => sum + l.remainingBalance, 0);

    const finInstallments = financings.reduce((sum, l) => sum + (l.installmentAmount || 0), 0);
    const finContracted = financings.reduce((sum, l) => sum + l.totalAmount, 0);
    const finPaid = financings.reduce((sum, l) => sum + (l.totalAmount - l.remainingBalance), 0);
    const finRemaining = financings.reduce((sum, l) => sum + l.remainingBalance, 0);

    // 5. EMPRÉSTIMOS CONCEDIDOS
    const activeLoans = activePhys.filter(p => p.metadata?.isLoan);
    const loansPrincipal = activeLoans.reduce((sum, p) => sum + (Number(p.metadata?.loanPrincipal) || 0), 0);
    const loansReceived = activeLoans.reduce((sum, p) => {
      const txs = linkedTransactionsMap.get(p.id) || [];
      return sum + txs.filter(t => t.type === 'INCOME').reduce((s, t) => s + Number(t.amount || 0), 0);
    }, 0);
    const loansOutstanding = Math.max(0, loansPrincipal - loansReceived);
    const loansExpectedReceipts = activeLoans.reduce((sum, p) => sum + (Number(p.metadata?.loanFixedValue) || 0), 0);

    // 6. ORÇAMENTOS E METAS (PLANEJAMENTO)
    const totalBudgeted = budgets.reduce((sum, b) => sum + Number(b.monthly_limit || 0), 0);
    const planningMonthStr = DateUtils.formatToISODate(new Date()).substring(0, 7);
    const budgetSpentMap: Record<string, number> = {};
    transactions.filter(t => 
      t.type === 'EXPENSE' && 
      !t.metadata?.is_amortization && 
      t.date.substring(0, 7) === planningMonthStr
    ).forEach(t => {
      const cat = t.category || 'Outros';
      const matchingBudget = budgets.find(b => b.category === cat);
      if (matchingBudget) {
        budgetSpentMap[cat] = (budgetSpentMap[cat] || 0) + t.amount;
      }
    });
    const totalSpentInBudgets = Object.values(budgetSpentMap).reduce((sum, v) => sum + v, 0);

    const completedGoalsCount = goals.filter(g => g.is_completed).length;
    const goalsSavedAmount = goals.reduce((sum, g) => sum + Number(g.current_amount || 0), 0);
    const goalsTargetAmount = goals.reduce((sum, g) => sum + Number(g.target_amount || 0), 0);

    return {
      plantaValue,
      plantaInstallments,
      plantaPaid: plantaAmortizationPaid,
      plantaPaidTotal,
      plantaRemainingToPay,
      plantaDeliveryBalance,
      plantaAdditionalExpenses,
      prontoValue,
      prontoInstallments,
      prontoOperatingCosts,
      prontoPaid: prontoAmortizationPaid,
      prontoRemainingToPay,
      prontoReceived,
      prontoNetFlow,
      prontoMonthlyNetFlow,
      prontoContracted,
      prontoOutflowActualOrExpected,
      usoAcquisitionTotal,
      usoCurrentValueTotal,
      usoAgioDesagio,
      usoAgioDesagioPercent,
      invAcquisitionTotal,
      invEstimatedValue,
      invBrokerFees,
      invExtraExpenses,
      invNetProfit,
      invProfitPercent,
      totalFinancialFunds,
      allocationList,
      currentMonthYield,
      transactionCurrentMonthYield,
      investmentsEstimatedMonthlyYield,
      averageMonthlyYield,
      consInstallments,
      consContracted,
      consPaid,
      consRemaining,
      consLances,
      consUtilized,
      consToContemplate,
      finInstallments,
      finContracted,
      finPaid,
      finRemaining,
      veiculoValue,
      outroFisicoValue,
      prontoCapRate,
      loansPrincipal,
      loansReceived,
      loansOutstanding,
      loansExpectedReceipts,
      totalBudgeted,
      totalSpentInBudgets,
      goalsCount: goals.length,
      completedGoalsCount,
      goalsSavedAmount,
      goalsTargetAmount
    };
  }, [activePhysicalAssets, activeLiabilities, dynamicBrokers, transactions, totalFinancial, linkedTransactionsMap, enrichedPhysicalAssets, budgets, goals]);

  const visibleOverviewCount = [
    visibleCards.fluxo,
    visibleCards.patrimonio,
    visibleCards.imobiliario,
    visibleCards.veiculos,
    visibleCards.outros,
    visibleCards.financeiro,
    visibleCards.emprestimos,
    visibleCards.dividas
  ].filter(Boolean).length;

  const visibleDetailedCount = [
    visibleCards.detalheImobiliario,
    visibleCards.detalheBensFisicos,
    visibleCards.detalheFinanceiro,
    visibleCards.detalheEmprestimos,
    visibleCards.detalheDividas,
    visibleCards.detalhePlanejamento
  ].filter(Boolean).length;

  const getGridClass = (count: number) => {
    switch (count) {
      case 1:
        return 'grid grid-cols-1 gap-4';
      case 2:
        return 'grid grid-cols-2 gap-4';
      case 3:
        return 'grid grid-cols-2 md:grid-cols-3 gap-4';
      case 4:
        return 'grid grid-cols-2 md:grid-cols-4 gap-4';
      case 5:
        return 'grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4';
      case 6:
        return 'grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4';
      case 7:
        return 'grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4';
      case 8:
      default:
        return 'grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4';
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <div className="w-10 h-10 border-2 border-slate-200 border-t-brand-600 rounded-full animate-spin" />
        <p className="text-slate-400 font-medium tracking-widest text-xs uppercase">Carregando Patrimônio Líquido...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-10 pt-8 pb-36 space-y-8 animate-in fade-in duration-500">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Patrimônio Líquido</h1>
          <p className="text-sm text-slate-400 font-medium">Bens físicos, investimentos inteligentes e passivos consolidados.</p>
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          {activeView === 'overview' && (
            <button
              onClick={() => setShowCustomizeModal(true)}
              className="flex items-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-all hover:scale-105 active:scale-95"
            >
              <SlidersHorizontal size={18} /> Personalizar Painel
            </button>
          )}
          <button
            onClick={handleNewAssetClick}
            className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform active:scale-95"
          >
            <Plus size={18} /> Novo Ativo
          </button>
        </div>
      </div>

      {/* NAVIGATION TABS - mobile only; no menu lateral tem submenu equivalente no desktop */}
      <div className="hidden gap-2 p-1.5 bg-slate-50 border border-slate-100 rounded-2xl w-full max-w-full overflow-x-auto scrollbar-hide">
        {[
          { id: 'overview', label: 'Visão Geral', icon: <LayoutGrid size={16} /> },
          { id: 'realestate', label: 'Ativos Imobiliários', icon: <Building2 size={16} /> },
          { id: 'vehicles', label: 'Veículos', icon: <Car size={16} /> },
          { id: 'investments', label: 'Investimentos', icon: <TrendingUp size={16} /> },
          { id: 'loans', label: 'Empréstimos Concedidos', icon: <HandCoins size={16} /> },
          { id: 'consortiums', label: 'Consórcios', icon: <Layers size={16} /> },
          { id: 'liabilities', label: 'Passivos (Dívidas)', icon: <Landmark size={16} /> },
          { id: 'physical', label: 'Outros Ativos Físicos', icon: <Box size={16} /> }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 ${activeView === tab.id ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTENT AREA */}
      <div className="animate-in fade-in duration-700">
        
        {/* OVERVIEW VIEW */}
        {activeView === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* COMPACT TOTALS GRID (8 Cards) */}
            {visibleOverviewCount > 0 && (
              <div className={getGridClass(visibleOverviewCount)}>
                {/* Fluxo Mensal */}
                {visibleCards.fluxo && (
                  <div
                    className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-4 shadow-md flex flex-col justify-between min-h-[110px] relative overflow-hidden group col-span-2 md:col-span-1 text-left w-full"
                  >
                    <div className="absolute -right-4 -bottom-4 w-12 h-12 bg-white/5 rounded-full pointer-events-none" />
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-400">Fluxo Mensal</span>
                      <Zap size={14} className="text-brand-400" />
                    </div>
                    <div className="mt-1 space-y-0.5">
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Rec.:</span>
                        <span className="font-bold text-emerald-400 whitespace-nowrap">{formatCurrency(sustainabilitySummary.totalInflow)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Desp.:</span>
                        <span className="font-bold text-rose-400 whitespace-nowrap">{formatCurrency(sustainabilitySummary.totalOutflow)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Auto:</span>
                        <span className="font-bold text-brand-400 whitespace-nowrap">{sustainabilitySummary.selfSustainabilityPercent}%</span>
                      </div>
                      <div className="flex justify-between items-baseline border-t border-slate-800 pt-1 mt-0.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Saldo</span>
                        <span className={`text-sm font-black tracking-tight italic whitespace-nowrap ${sustainabilitySummary.netFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {sustainabilitySummary.netFlow >= 0 ? '+' : ''}{formatCurrency(sustainabilitySummary.netFlow)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Patrimônio Líquido */}
                {visibleCards.patrimonio && (
                  <div
                    className="bg-white border border-brand-200 rounded-2xl p-4 shadow-md flex flex-col justify-between min-h-[110px] text-left w-full relative overflow-hidden"
                  >
                    <div className="flex justify-between items-start gap-1">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-500">Patrimônio Real</span>
                        <span className="text-[8px] font-black text-brand-600 uppercase tracking-widest bg-brand-50 px-1.5 py-0.5 rounded w-max">Consolidado</span>
                      </div>
                      <TrendingUp size={14} className="text-emerald-500 shrink-0" />
                    </div>
                    <div className="mt-2">
                      <h4 className="text-base font-black text-slate-900 tracking-tight italic whitespace-nowrap">
                        {formatCurrency(totalNetWorth)}
                      </h4>
                      <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-0.5">
                        Líquido <ArrowUpRight size={10} className="inline shrink-0" />
                      </span>
                    </div>
                  </div>
                )}

                {/* Investimento Imobiliário */}
                {visibleCards.imobiliario && (
                  <button
                    onClick={() => setActiveView('realestate')}
                    className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col justify-between min-h-[110px] hover:scale-[1.02] transition-all text-left w-full focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-xs sm:text-[11px] font-black uppercase tracking-wider text-slate-500">Imobiliário</span>
                      <Building2 size={14} className="text-brand-500" />
                    </div>
                    <div className="mt-2">
                      <h4 className="text-base font-black text-slate-900 tracking-tight italic whitespace-nowrap">
                        {formatCurrency(overviewData.plantaValue + overviewData.prontoValue)}
                      </h4>
                      <span className="text-xs sm:text-[11px] font-bold text-slate-500 uppercase tracking-widest">Planta + Pronto</span>
                    </div>
                  </button>
                )}
                
                {/* Veículos */}
                {visibleCards.veiculos && (
                  <button
                    onClick={() => setActiveView('vehicles')}
                    className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col justify-between min-h-[110px] hover:scale-[1.02] transition-all text-left w-full focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-xs sm:text-[11px] font-black uppercase tracking-wider text-slate-500">Veículos</span>
                      <Car size={14} className="text-brand-500" />
                    </div>
                    <div className="mt-2">
                      <h4 className="text-base font-black text-slate-900 tracking-tight italic whitespace-nowrap">
                        {formatCurrency(overviewData.veiculoValue)}
                      </h4>
                      <span className="text-xs sm:text-[11px] font-bold text-slate-500 uppercase tracking-widest">FIPE / Estimado</span>
                    </div>
                  </button>
                )}
                
                {/* Outros Bens Físicos */}
                {visibleCards.outros && (
                  <button
                    onClick={() => setActiveView('physical')}
                    className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col justify-between min-h-[110px] hover:scale-[1.02] transition-all text-left w-full focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-xs sm:text-[11px] font-black uppercase tracking-wider text-slate-500">Outros Bens</span>
                      <Box size={14} className="text-brand-500" />
                    </div>
                    <div className="mt-2">
                      <h4 className="text-base font-black text-slate-900 tracking-tight italic whitespace-nowrap">
                        {formatCurrency(overviewData.outroFisicoValue)}
                      </h4>
                      <span className="text-xs sm:text-[11px] font-bold text-slate-500 uppercase tracking-widest">Outros Físicos</span>
                    </div>
                  </button>
                )}
                
                {/* Investimentos Financeiros */}
                {visibleCards.financeiro && (
                  <button
                    onClick={() => setActiveView('investments')}
                    className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col justify-between min-h-[110px] hover:scale-[1.02] transition-all text-left w-full focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-xs sm:text-[11px] font-black uppercase tracking-wider text-slate-500">Financeiro</span>
                      <PieChart size={14} className="text-brand-500" />
                    </div>
                    <div className="mt-2">
                      <h4 className="text-base font-black text-brand-600 tracking-tight italic whitespace-nowrap">
                        {formatCurrency(overviewData.totalFinancialFunds)}
                      </h4>
                      <span className="text-xs sm:text-[11px] font-bold text-brand-500 uppercase tracking-widest">Corretoras</span>
                    </div>
                  </button>
                )}
                
                {/* Empréstimos Concedidos */}
                {visibleCards.emprestimos && (
                  <button
                    onClick={() => setActiveView('loans')}
                    className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col justify-between min-h-[110px] hover:scale-[1.02] transition-all text-left w-full focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-xs sm:text-[11px] font-black uppercase tracking-wider text-slate-500">Empréstimos</span>
                      <HandCoins size={14} className="text-brand-500" />
                    </div>
                    <div className="mt-2">
                      <h4 className="text-base font-black text-slate-900 tracking-tight italic whitespace-nowrap">
                        {formatCurrency(totalLoans)}
                      </h4>
                      <span className="text-xs sm:text-[11px] font-bold text-slate-500 uppercase tracking-widest">A Receber</span>
                    </div>
                  </button>
                )}
                
                {/* Passivos e Dívidas */}
                {visibleCards.dividas && (
                  <button
                    onClick={() => setActiveView('liabilities')}
                    className="bg-red-50/30 border border-red-100/50 rounded-2xl p-4 shadow-sm flex flex-col justify-between min-h-[110px] hover:scale-[1.02] transition-all text-left w-full focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-xs sm:text-[11px] font-black uppercase tracking-wider text-red-500">Dívidas</span>
                      <Landmark size={14} className="text-red-500" />
                    </div>
                    <div className="mt-2">
                      <h4 className="text-base font-black text-red-600 tracking-tight italic whitespace-nowrap">
                        {formatCurrency(totalLiabilities)}
                      </h4>
                      <span className="text-xs sm:text-[11px] font-bold text-red-400 uppercase tracking-widest">Saldo Devedor</span>
                    </div>
                  </button>
                )}
              </div>
            )}

            {/* 4 DETAILED ANALYTICS SECTIONS (2x2 Grid) */}
            {visibleDetailedCount > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Bloco A: Investimento Imobiliário */}
              {visibleCards.detalheImobiliario && (
                <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                  <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                        <Building2 size={18} />
                      </div>
                      Investimento Imobiliário (Planta vs Entregue)
                    </h3>
                    <button
                      onClick={() => setShowWizardModal(true)}
                      className="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-600 rounded-lg text-xs font-black uppercase tracking-wider transition-colors"
                    >
                      + Novo Imóvel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Planta Stage */}
                    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3.5">
                      <p className="text-xs sm:text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between items-center">
                        <span><span aria-hidden="true" className="mr-1">🏗️</span>Na Planta / Em Obras</span>
                        <button
                          onClick={() => setActiveView('realestate')}
                          className="text-xs text-brand-600 hover:underline font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        >
                          Ver Detalhes →
                        </button>
                      </p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium">Valor Total dos Ativos:</span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.plantaValue)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium">Parcela Mensal:</span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.plantaInstallments)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium">Amortizado/Pago:</span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.plantaPaidTotal)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium">Restante a Pagar:</span>
                          <span className="font-bold text-brand-600">{formatCurrency(overviewData.plantaRemainingToPay)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium flex items-center">
                            Saldo Devedor na Entrega
                            <InfoTooltip content="Valor estimado a ser quitado/financiado no momento da entrega das chaves do imóvel na planta." />
                          </span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.plantaDeliveryBalance)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Pronto Stage */}
                    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3.5">
                      <p className="text-xs sm:text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between items-center">
                        <span><span aria-hidden="true" className="mr-1">🏢</span>Pronto / Entregue</span>
                        <button
                          onClick={() => setActiveView('realestate')}
                          className="text-xs text-brand-600 hover:underline font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        >
                          Ver Detalhes →
                        </button>
                      </p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium">Valor Total dos Ativos:</span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.prontoValue)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium">Prestação Financiamento:</span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.prontoInstallments)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium">Saldo Devedor Restante:</span>
                          <span className="font-bold text-red-500">{formatCurrency(overviewData.prontoRemainingToPay)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium">IPTU e Condomínio Mensal:</span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.prontoOperatingCosts)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium">Aluguéis Recebidos:</span>
                          <span className="font-bold text-emerald-600">{formatCurrency(overviewData.prontoReceived)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium flex items-center">
                            Cap Rate Estimado (Líquido)
                            <InfoTooltip content="Média do retorno líquido anualizado sobre o valor total do imóvel (Aluguel líquido anual / Valor de mercado)." />
                          </span>
                          <span className="font-bold text-emerald-600">{(overviewData as any).prontoCapRate?.toFixed(2)}% a.a.</span>
                        </div>
                        <div className="flex justify-between text-xs border-t border-slate-200 pt-1.5 mt-1">
                          <span className="text-slate-600 font-bold">Mensal Líquido (Mês Atual):</span>
                          <TrendValue value={overviewData.prontoMonthlyNetFlow} />
                        </div>
                        <div className="flex justify-between text-xs border-t border-slate-200 pt-1.5 mt-1">
                          <span className="text-slate-600 font-bold flex items-center">
                            Valor Líquido Imobiliário (Valor − Dívida)
                            <InfoTooltip content="Equidade líquida estimada se vendesse os imóveis hoje pelo valor de mercado e liquidasse os financiamentos. Não desconta impostos ou taxas imobiliárias." />
                          </span>
                          <TrendValue value={overviewData.prontoNetFlow} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Bloco B: Bens Físicos e Veículos */}
              {visibleCards.detalheBensFisicos && (
                <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                  <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                        <Box size={18} />
                      </div>
                      Bens Físicos e Veículos (Uso vs Investimento)
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          resetAssetForm();
                          setEditingAsset(null);
                          setFormData(prev => ({ ...prev, category: 'VEHICLE', purpose: 'uso' }));
                          setShowModal(true);
                        }}
                        className="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-600 rounded-lg text-xs font-black uppercase tracking-wider transition-colors"
                      >
                        + Novo Veículo
                      </button>
                      <button
                        onClick={() => {
                          resetAssetForm();
                          setEditingAsset(null);
                          setFormData(prev => ({ ...prev, category: 'OTHER', purpose: 'uso', isLoan: false }));
                          setShowModal(true);
                        }}
                        className="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-600 rounded-lg text-xs font-black uppercase tracking-wider transition-colors"
                      >
                        + Outro Bem
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Para Uso */}
                    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3.5">
                      <p className="text-xs sm:text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between items-center">
                        <span><span aria-hidden="true" className="mr-1">🚗</span>Bens de Uso Pessoal</span>
                        <button
                          onClick={() => setActiveView('vehicles')}
                          className="text-xs text-brand-600 hover:underline font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        >
                          Ver Detalhes →
                        </button>
                      </p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium">Custo de Aquisição:</span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.usoAcquisitionTotal)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium flex items-center">
                            Valor FIPE / Mercado
                            <InfoTooltip content="Valor de mercado estimado para veículos (tabela FIPE) e outros bens pessoais de uso." />
                          </span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.usoCurrentValueTotal)}</span>
                        </div>
                        <div className="flex justify-between text-xs border-t border-slate-200 pt-1.5 mt-1">
                          <span className="text-slate-600 font-bold flex items-center">
                            Ganho ou Perda vs. Compra
                            <InfoTooltip content="Diferença entre o valor de mercado atual e o custo histórico de aquisição." />
                          </span>
                          <TrendValue value={overviewData.usoAgioDesagio} percent={overviewData.usoAgioDesagioPercent} />
                        </div>
                      </div>
                    </div>

                    {/* Para Investimento */}
                    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3.5">
                      <p className="text-xs sm:text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between items-center">
                        <span><span aria-hidden="true" className="mr-1">📈</span>Bens de Investimento</span>
                        <button
                          onClick={() => setActiveView('physical')}
                          className="text-xs text-brand-600 hover:underline font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        >
                          Ver Detalhes →
                        </button>
                      </p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium">Custo de Aquisição:</span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.invAcquisitionTotal)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium">Custos e Reformas:</span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.invExtraExpenses)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium">Comissão Garagem/Corretor:</span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.invBrokerFees)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium">Valor Estimado Atual:</span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.invEstimatedValue)}</span>
                        </div>
                        <div className="flex justify-between text-xs border-t border-slate-200 pt-1.5 mt-1">
                          <span className="text-slate-600 font-bold flex items-center">
                            Lucro Líquido Est. (ROI)
                            <InfoTooltip content="Retorno sobre o Investimento (ROI) estimado, considerando preço atual de mercado menos custos de aquisição, reformas e comissões." />
                          </span>
                          <TrendValue value={overviewData.invNetProfit} percent={overviewData.invProfitPercent} suffix=" ROI" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Bloco C: Investimentos Financeiros */}
              {visibleCards.detalheFinanceiro && (
                <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                  <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                        <TrendingUp size={18} />
                      </div>
                      Investimentos Financeiros
                    </h3>
                    <button
                      onClick={() => {
                        resetAssetForm();
                        setEditingAsset(null);
                        setFormData(prev => ({ ...prev, category: 'INVESTMENT', purpose: 'investimento' }));
                        setShowModal(true);
                      }}
                      className="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-600 rounded-lg text-xs font-black uppercase tracking-wider transition-colors"
                    >
                      + Novo Investimento
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Allocation */}
                    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3">
                      <p className="text-xs sm:text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between items-center">
                        <span><span aria-hidden="true" className="mr-1">📊</span>Alocação por Classe</span>
                        <button
                          onClick={() => setActiveView('investments')}
                          className="text-xs text-brand-600 hover:underline font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        >
                          Ver Detalhes →
                        </button>
                      </p>
                      <div className="space-y-3.5 pr-1">
                        {overviewData.allocationList.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">Sem investimentos cadastrados.</p>
                        ) : (
                          <>
                            <div className="space-y-3">
                              {overviewData.allocationList.slice(0, 5).map((item, idx) => (
                                <div key={item.type} className="space-y-1">
                                  <div className="flex justify-between text-xs">
                                    <span className="text-slate-600 font-medium truncate max-w-[140px]">{item.type}</span>
                                    <span className="font-bold text-slate-900">
                                      {formatCurrency(item.balance)} <span className="text-xs font-medium text-slate-400">({item.percentage}%)</span>
                                    </span>
                                  </div>
                                  <div 
                                    className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden"
                                    role="progressbar"
                                    aria-valuenow={item.percentage}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-label={`Alocação da classe ${item.type}`}
                                  >
                                    <div 
                                      className="bg-brand-500 h-full rounded-full transition-all duration-500" 
                                      style={{ width: `${item.percentage}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                            {overviewData.allocationList.length > 5 && (
                              <div className="pt-1.5 text-center border-t border-slate-100 mt-2">
                                <button
                                  onClick={() => setActiveView('investments')}
                                  className="text-xs text-brand-600 hover:underline font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                >
                                  + {overviewData.allocationList.length - 5} outras classes (Ver Tudo →)
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Monthly Yield comparison */}
                    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3">
                      <p className="text-xs sm:text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between items-center">
                        <span><span aria-hidden="true" className="mr-1">💵</span>Rendimentos da Carteira</span>
                        <button
                          onClick={() => setActiveView('investments')}
                          className="text-xs text-brand-600 hover:underline font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        >
                          Ver Detalhes →
                        </button>
                      </p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium">Recebido no Mês:</span>
                          <span className="font-black text-emerald-600">{formatCurrency(overviewData.currentMonthYield)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium">Média Histórica Mensal:</span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.averageMonthlyYield)}</span>
                        </div>
                        <div className="flex justify-between text-xs border-t border-slate-200 pt-1.5 mt-1">
                          <span className="text-slate-600 font-bold flex items-center">
                            Autossuficiência (Projetada vs. Realizada)
                            <InfoTooltip content="Percentual de cobertura das despesas patrimoniais (parcelas de consórcios, financiamentos, condomínios, IPVA/IPTU) pelas receitas de aluguéis e investimentos." />
                          </span>
                          <span className="font-black text-slate-900">
                            {sustainabilitySummary.selfSustainabilityPercent}% <span className="text-slate-400 font-medium text-[10px]">({sustainabilitySummary.realizedSelfSustainabilityPercent}% Realiz.)</span>
                          </span>
                        </div>
                        <div className="p-3 bg-brand-50 rounded-xl mt-2">
                          <p className="text-xs text-brand-600 leading-relaxed font-medium">
                            Sua carteira gera aproximadamente <span className="font-bold text-brand-700">{formatCurrency(sustainabilitySummary.estimatedMonthlyYield)}</span> de dividendos implícitos por mês baseado em taxa média mensal de {estimatedYieldRate}%.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Bloco D: Empréstimos Concedidos */}
              {visibleCards.detalheEmprestimos && (
                <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                  <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <HandCoins size={18} />
                      </div>
                      Empréstimos Concedidos (Crédito Privado)
                    </h3>
                    <button
                      onClick={() => {
                        resetAssetForm();
                        setEditingAsset(null);
                        setFormData(prev => ({ ...prev, isLoan: true, category: 'OTHER' }));
                        setShowModal(true);
                      }}
                      className="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-600 rounded-lg text-xs font-black uppercase tracking-wider transition-colors"
                    >
                      + Novo Empréstimo
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Lista de Empréstimos */}
                    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3">
                      <p className="text-xs sm:text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between items-center">
                        <span><span aria-hidden="true" className="mr-1">🤝</span>Devedores / Contratos</span>
                        <button
                          onClick={() => setActiveView('loans')}
                          className="text-xs text-brand-600 hover:underline font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        >
                          Ver Detalhes →
                        </button>
                      </p>
                      <div className="space-y-3.5 pr-1">
                        {activePhysicalAssets.filter(p => p.metadata?.isLoan).length === 0 ? (
                          <p className="text-xs text-slate-400 italic">Sem empréstimos ativos.</p>
                        ) : (
                          <div className="space-y-3">
                            {activePhysicalAssets.filter(p => p.metadata?.isLoan).slice(0, 4).map((loan) => {
                              const meta = loan.metadata || {};
                              const principal = Number(meta.loanPrincipal) || 0;
                              const txs = getAssetTransactions(loan);
                              const returned = txs.filter(t => t.type === 'INCOME').reduce((s, t) => s + Number(t.amount || 0), 0);
                              const outstanding = Math.max(0, principal - returned);
                              const progressPercent = principal > 0 ? Math.round((returned / principal) * 100) : 0;
                              return (
                                <div key={loan.id} className="space-y-1">
                                  <div className="flex justify-between text-xs">
                                    <span className="text-slate-600 font-medium truncate max-w-[135px]">{loan.name}</span>
                                    <span className="font-bold text-slate-900">
                                      {formatCurrency(outstanding)} <span className="text-xs font-medium text-slate-400">({progressPercent}%)</span>
                                    </span>
                                  </div>
                                  <div 
                                    className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden"
                                    role="progressbar"
                                    aria-valuenow={Math.min(progressPercent, 100)}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-label={`Progresso do empréstimo ${loan.name}`}
                                  >
                                    <div 
                                      className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                                      style={{ width: `${Math.min(progressPercent, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Resumo consolidado */}
                    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3.5">
                      <p className="text-xs sm:text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between items-center">
                        <span><span aria-hidden="true" className="mr-1">💰</span>Resumo Consolidado</span>
                        <button
                          onClick={() => setActiveView('loans')}
                          className="text-xs text-brand-600 hover:underline font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        >
                          Ver Detalhes →
                        </button>
                      </p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium">Total Concedido:</span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.loansPrincipal)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium">Amortizado / Recebido:</span>
                          <span className="font-bold text-emerald-600">{formatCurrency(overviewData.loansReceived)}</span>
                        </div>
                        <div className="flex justify-between text-xs border-t border-slate-200 pt-1.5 mt-1">
                          <span className="text-slate-600 font-bold flex items-center">
                            Saldo Devedor Restante
                            <InfoTooltip content="Valor total pendente a ser recebido dos devedores." />
                          </span>
                          <span className="font-black text-slate-900">{formatCurrency(overviewData.loansOutstanding)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 font-medium flex items-center">
                            Parcela Mensal Estimada
                            <InfoTooltip content="Soma das parcelas mensais que se espera receber dos empréstimos ativos." />
                          </span>
                          <span className="font-bold text-emerald-600">{formatCurrency(overviewData.loansExpectedReceipts)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Bloco E: Passivos e Dívidas */}
              {visibleCards.detalheDividas && (
                <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6 lg:col-span-2">
                  <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                        <Landmark size={18} />
                      </div>
                      Passivos e Dívidas (Financiamentos vs Consórcios)
                    </h3>
                    <button
                      onClick={() => {
                        setLiabilityFormData({
                          name: '',
                          type: 'PERSONAL_LOAN',
                          totalAmount: '',
                          remainingBalance: '',
                          interestRate: '',
                          installmentAmount: '',
                          installmentsRemaining: '',
                          dueDay: '',
                          linkedAssetId: '',
                          indexationRate: '',
                          amortizationType: 'SAC',
                          indexType: 'FIXED',
                          firstInstallmentDate: '',
                          balloonMonth: '',
                          balloonYear: '',
                          balloonAmount: '',
                          balloons: [],
                          propertyType: 'PLANTA',
                          hasHistoricalPayments: false,
                          historicalCalculationType: 'calculated',
                          historicalInstallmentsPaid: '',
                          historicalInstallmentValue: '',
                          historicalPaidAmount: ''
                        });
                        setEditingLiability(null);
                        setShowLiabilityModal(true);
                      }}
                      className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-black uppercase tracking-wider transition-colors"
                    >
                      + Nova Dívida
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Consórcios */}
                    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3.5">
                      <p className="text-xs sm:text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between items-center">
                        <span><span aria-hidden="true" className="mr-1">💳</span>Consórcios Ativos</span>
                        <button
                          onClick={() => setActiveView('consortiums')}
                          className="text-xs text-brand-600 hover:underline font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        >
                          Gerenciar →
                        </button>
                      </p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 font-medium flex items-center">
                            Parcelas Mensais
                            <InfoTooltip content="Soma das parcelas mensais devidas para todos os consórcios ativos." />
                          </span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.consInstallments)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 font-medium">Total Contratado (Cartas):</span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.consContracted)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 font-medium flex items-center">
                            Total Pago
                            <InfoTooltip content="Valor total amortizado/pago das parcelas até o momento." />
                          </span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.consPaid)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 font-medium flex items-center">
                            Lances Dados (Tentativas)
                            <InfoTooltip content="Total ofertado em lances nas assembleias para tentar a contemplação das cartas." />
                          </span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.consLances)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 font-medium flex items-center">
                            Créditos em Uso (Obras/Bens)
                            <InfoTooltip content="Cartas de consórcio já contempladas que estão atreladas a algum bem físico ou projeto em andamento." />
                          </span>
                          <span className="font-bold text-slate-950">{formatCurrency(overviewData.consUtilized)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 font-medium flex items-center">
                            Créditos Disponíveis
                            <InfoTooltip content="Cartas de consórcio que já foram contempladas mas cujo saldo ainda não foi utilizado para aquisição de bens." />
                          </span>
                          <span className="font-bold text-brand-600">{formatCurrency(overviewData.consToContemplate)}</span>
                        </div>
                        <div className="flex justify-between text-xs border-t border-slate-200 pt-1.5 mt-1">
                          <span className="text-slate-600 font-bold flex items-center">
                            Saldo Devedor Restante
                            <InfoTooltip content="Saldo que resta pagar das parcelas vincendas até a quitação dos grupos." />
                          </span>
                          <span className="font-black text-red-600">{formatCurrency(overviewData.consRemaining)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Financiamentos */}
                    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3.5">
                      <p className="text-xs sm:text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between items-center">
                        <span><span aria-hidden="true" className="mr-1">🏛️</span>Outros Financiamentos e Dívidas</span>
                        <button
                          onClick={() => setActiveView('liabilities')}
                          className="text-xs text-brand-600 hover:underline font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        >
                          Ver Detalhes →
                        </button>
                      </p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 font-medium flex items-center">
                            Prestações Mensais
                            <InfoTooltip content="Soma das parcelas mensais de todos os financiamentos ativos (imobiliários, veículos, etc.)." />
                          </span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.finInstallments)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 font-medium">Total Financiado (Contrato):</span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.finContracted)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 font-medium flex items-center">
                            Total Amortizado (Pago)
                            <InfoTooltip content="Valor principal do financiamento já pago até o momento." />
                          </span>
                          <span className="font-bold text-slate-900">{formatCurrency(overviewData.finPaid)}</span>
                        </div>
                        <div className="flex justify-between text-xs border-t border-slate-200 pt-1.5 mt-1">
                          <span className="text-slate-600 font-bold flex items-center">
                            Saldo Devedor Restante
                            <InfoTooltip content="Saldo restante para quitação dos contratos de financiamento." />
                          </span>
                          <span className="font-black text-red-600">{formatCurrency(overviewData.finRemaining)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Bloco F: Planejamento Financeiro */}
              {visibleCards.detalhePlanejamento && (
                <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6 lg:col-span-2">
                  <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                        <Target size={18} />
                      </div>
                      Planejamento Financeiro (Orçamentos vs Metas)
                    </h3>
                    <button
                      onClick={() => navigate('/planning')}
                      className="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-600 rounded-lg text-xs font-black uppercase tracking-wider transition-colors"
                    >
                      Ver Planejamento
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Orçamentos Mensais */}
                    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3.5">
                      <p className="text-xs sm:text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between items-center">
                        <span><span aria-hidden="true" className="mr-1">📊</span>Controle de Orçamento</span>
                        <button
                          onClick={() => navigate('/planning?tab=budget')}
                          className="text-xs text-brand-600 hover:underline font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        >
                          Ver Orçamentos →
                        </button>
                      </p>
                      <div className="space-y-3">
                        {overviewData.totalBudgeted > 0 ? (
                          (() => {
                            const percent = Math.min(100, Math.round((overviewData.totalSpentInBudgets / overviewData.totalBudgeted) * 100));
                            let barColor = 'bg-brand-500';
                            let textColor = 'text-brand-600';
                            if (percent >= 100) {
                              barColor = 'bg-rose-500';
                              textColor = 'text-rose-600';
                            } else if (percent >= 80) {
                              barColor = 'bg-amber-500';
                              textColor = 'text-amber-600';
                            }
                            return (
                              <div className="space-y-1.5">
                                <div className="flex justify-between text-xs">
                                  <span className="text-slate-600 font-medium">Consumo do Limite</span>
                                  <span className={`font-black ${textColor}`}>{percent}%</span>
                                </div>
                                <div 
                                  className="w-full bg-slate-200 h-2 rounded-full overflow-hidden"
                                  role="progressbar"
                                  aria-valuenow={percent}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-label="Progresso do consumo do orçamento mensal"
                                >
                                  <div 
                                    className={`${barColor} h-full rounded-full transition-all duration-500`}
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <p className="text-xs text-slate-400 font-medium italic">Nenhum orçamento mensal configurado.</p>
                        )}
                        
                        <div className="space-y-2 pt-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500 font-medium">Total Orçado:</span>
                            <span className="font-bold text-slate-900">{formatCurrency(overviewData.totalBudgeted)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500 font-medium">Gasto no Mês:</span>
                            <span className="font-bold text-slate-900">{formatCurrency(overviewData.totalSpentInBudgets)}</span>
                          </div>
                          <div className="flex justify-between text-xs border-t border-slate-200 pt-1.5 mt-1">
                            <span className="text-slate-600 font-bold">Saldo Disponível:</span>
                            <span className={`font-black ${overviewData.totalBudgeted - overviewData.totalSpentInBudgets >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {formatCurrency(overviewData.totalBudgeted - overviewData.totalSpentInBudgets)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Metas Financeiras */}
                    <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3.5">
                      <p className="text-xs sm:text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between items-center">
                        <span><span aria-hidden="true" className="mr-1">🎯</span>Metas e Sonhos</span>
                        <button
                          onClick={() => navigate('/planning?tab=goals')}
                          className="text-xs text-brand-600 hover:underline font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        >
                          Ver Metas →
                        </button>
                      </p>
                      <div className="space-y-3">
                        {overviewData.goalsTargetAmount > 0 ? (
                          (() => {
                            const percent = Math.min(100, Math.round((overviewData.goalsSavedAmount / overviewData.goalsTargetAmount) * 100));
                            return (
                              <div className="space-y-1.5">
                                <div className="flex justify-between text-xs">
                                  <span className="text-slate-600 font-medium">Progresso de Poupança</span>
                                  <span className="font-black text-brand-600">{percent}%</span>
                                </div>
                                <div 
                                  className="w-full bg-slate-200 h-2 rounded-full overflow-hidden"
                                  role="progressbar"
                                  aria-valuenow={percent}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-label="Progresso geral de poupança para metas"
                                >
                                  <div 
                                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <p className="text-xs text-slate-400 font-medium italic">Nenhuma meta financeira cadastrada.</p>
                        )}

                        <div className="space-y-2 pt-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500 font-medium">Total Guardado:</span>
                            <span className="font-bold text-emerald-600">{formatCurrency(overviewData.goalsSavedAmount)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500 font-medium">Valor Alvo Total:</span>
                            <span className="font-bold text-slate-900">{formatCurrency(overviewData.goalsTargetAmount)}</span>
                          </div>
                          <div className="flex justify-between text-xs border-t border-slate-200 pt-1.5 mt-1">
                            <span className="text-slate-600 font-bold">Metas Concluídas:</span>
                            <span className="font-black text-slate-900">
                              {overviewData.completedGoalsCount} de {overviewData.goalsCount}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}
          </div>
        )}

        {/* REAL ESTATE VIEW */}
        {activeView === 'realestate' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight italic flex items-center gap-2">
                <Building2 size={20} className="text-slate-500" />
                Seus Ativos Imobiliários
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500/20"
                    checked={showArchivedRealEstate}
                    onChange={(e) => setShowArchivedRealEstate(e.target.checked)}
                  />
                  Exibir arquivados
                </label>
                <button
                  onClick={() => setShowWizardModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-brand-200 text-brand-600 rounded-xl text-xs font-bold shadow-sm hover:bg-brand-50 hover:scale-105 transition-transform active:scale-95"
                >
                  <Building2 size={16} /> Aquisição Imobiliária
                </button>
              </div>
            </div>

            <div className="space-y-8">
              {/* Filter Bar for Real Estate Card Metrics */}
              <div className="bg-slate-50 p-4 rounded-[25px] border border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Acompanhamento de Caixa:</span>
                  <div className="flex overflow-x-auto scrollbar-hide bg-slate-200/50 p-0.5 rounded-lg border w-full sm:w-auto max-w-[calc(100vw-48px)] sm:max-w-none">
                    <button onClick={() => setCardPeriod('CONTRACT')} className={`px-3 py-1 rounded text-xs font-black uppercase tracking-wider transition-all flex-shrink-0 ${cardPeriod === 'CONTRACT' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Contrato</button>
                    <button onClick={() => setCardPeriod('CURRENT_MONTH')} className={`px-3 py-1 rounded text-xs font-black uppercase tracking-wider transition-all flex-shrink-0 ${cardPeriod === 'CURRENT_MONTH' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Mês Atual</button>
                    <button onClick={() => setCardPeriod('PREVIOUS_MONTH')} className={`px-3 py-1 rounded text-xs font-black uppercase tracking-wider transition-all flex-shrink-0 ${cardPeriod === 'PREVIOUS_MONTH' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Mês Anterior</button>
                    <button onClick={() => setCardPeriod('CURRENT_YEAR')} className={`px-3 py-1 rounded text-xs font-black uppercase tracking-wider transition-all flex-shrink-0 ${cardPeriod === 'CURRENT_YEAR' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Anual</button>
                    <button onClick={() => setCardPeriod('CUSTOM')} className={`px-3 py-1 rounded text-xs font-black uppercase tracking-wider transition-all flex-shrink-0 ${cardPeriod === 'CUSTOM' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Personalizado</button>
                  </div>
                </div>
                
                {cardPeriod === 'CUSTOM' && (
                  <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                    <input type="date" className="h-8 px-2 bg-white border border-slate-200 rounded-lg text-xs font-bold" value={cardStartDate} onChange={e => setCardStartDate(e.target.value)} />
                    <span className="text-slate-400 text-xs">até</span>
                    <input type="date" className="h-8 px-2 bg-white border border-slate-200 rounded-lg text-xs font-bold" value={cardEndDate} onChange={e => setCardEndDate(e.target.value)} />
                  </div>
                )}
              </div>

              {/* Real Estate Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {physicalAssets.filter(p => p.category === 'REAL_ESTATE' && (showArchivedRealEstate ? true : !p.is_archived)).map(asset => {
                  const meta = asset.metadata || {};
                  const linkedLiab = activeLiabilities.find(l => l.linkedAssetId === asset.id);
                  const propertyStage = meta.propertyStage || 'PRONTO';
                  const isRented = !!meta.isRented;
                  const rentalType = meta.rentalType || 'anual';

                  // Sum short stay rents in current month dynamically
                  const currentMonthStr = DateUtils.formatToISODate(new Date()).substring(0, 7);
                  const assetTxs = getAssetTransactions(asset);
                  const shortStayRentsThisMonth = assetTxs.filter((t: Transaction) => 
                    t.isPaid &&
                    t.type === 'INCOME' && 
                    (t.metadata?.type === 'rental_income' || t.metadata?.type === 'short_stay_income' || t.metadata?.type === 'short_stay_booking') &&
                    t.date.substring(0, 7) === currentMonthStr
                  ).reduce((sum: number, tx: Transaction) => sum + tx.amount, 0);

                  // Cálculos específicos para "Na Planta"
                  const unpaidObra = assetTxs
                    .filter((t: Transaction) => !t.isPaid && (t.metadata?.property_tx_type === 'DOWN_PAYMENT' || t.metadata?.property_tx_type === 'BALLOON' || t.metadata?.property_tx_type === 'CONSTRUCTOR_INSTALLMENT'))
                    .reduce((sum: number, t: Transaction) => sum + t.amount, 0);

                  const paidObra = (Number(meta.historicalPaidAmount) || 0) + assetTxs
                    .filter((t: Transaction) => t.isPaid && (t.metadata?.property_tx_type === 'DOWN_PAYMENT' || t.metadata?.property_tx_type === 'BALLOON' || t.metadata?.property_tx_type === 'CONSTRUCTOR_INSTALLMENT'))
                    .reduce((sum: number, t: Transaction) => sum + t.amount, 0);

                  // Constructor installment for current period or fallback
                  const activePeriodConstructorTxs = assetTxs.filter((t: Transaction) => {
                    if (t.metadata?.property_tx_type !== 'CONSTRUCTOR_INSTALLMENT') return false;
                    const cleanDateStr = t.date.substring(0, 10);
                    const cleanMonthStr = t.date.substring(0, 7);
                    const cleanYearStr = t.date.substring(0, 4);

                    const nowLocal = new Date();
                    const currentMonthStrLocal = DateUtils.formatToISODate(nowLocal).substring(0, 7);
                    const previousMonthDateLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth() - 1, 1);
                    const previousMonthStrLocal = DateUtils.formatToISODate(previousMonthDateLocal).substring(0, 7);
                    const currentYearStrLocal = DateUtils.formatToISODate(nowLocal).substring(0, 4);

                    if (cardPeriod === 'CURRENT_MONTH') return cleanMonthStr === currentMonthStrLocal;
                    if (cardPeriod === 'PREVIOUS_MONTH') return cleanMonthStr === previousMonthStrLocal;
                    if (cardPeriod === 'CURRENT_YEAR') return cleanYearStr === currentYearStrLocal;
                    if (cardPeriod === 'CUSTOM') return cleanDateStr >= cardStartDate && cleanDateStr <= cardEndDate;
                    return false;
                  });

                  let currentConstructorInstallmentValue = 0;
                  if (cardPeriod !== 'CONTRACT' && activePeriodConstructorTxs.length > 0) {
                    currentConstructorInstallmentValue = activePeriodConstructorTxs[0].amount;
                  } else {
                    const nextUnpaidInstallment = assetTxs
                      .filter((t: Transaction) => t.metadata?.property_tx_type === 'CONSTRUCTOR_INSTALLMENT' && !t.isPaid)
                      .sort((a, b) => a.date.localeCompare(b.date))[0];
                    if (nextUnpaidInstallment) {
                      currentConstructorInstallmentValue = nextUnpaidInstallment.amount;
                    } else {
                      const constrAmt = Number(meta.constructorAmount) || 0;
                      const constrN = Number(meta.constructorInstallmentsCount) || 1;
                      currentConstructorInstallmentValue = constrAmt / constrN;
                    }
                  }

                  // Balloon for current period
                  const activePeriodBalloonTxs = assetTxs.filter((t: Transaction) => {
                    if (t.metadata?.property_tx_type !== 'BALLOON') return false;
                    const cleanDateStr = t.date.substring(0, 10);
                    const cleanMonthStr = t.date.substring(0, 7);
                    const cleanYearStr = t.date.substring(0, 4);

                    const nowLocal = new Date();
                    const currentMonthStrLocal = DateUtils.formatToISODate(nowLocal).substring(0, 7);
                    const previousMonthDateLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth() - 1, 1);
                    const previousMonthStrLocal = DateUtils.formatToISODate(previousMonthDateLocal).substring(0, 7);
                    const currentYearStrLocal = DateUtils.formatToISODate(nowLocal).substring(0, 4);

                    if (cardPeriod === 'CURRENT_MONTH') return cleanMonthStr === currentMonthStrLocal;
                    if (cardPeriod === 'PREVIOUS_MONTH') return cleanMonthStr === previousMonthStrLocal;
                    if (cardPeriod === 'CURRENT_YEAR') return cleanYearStr === currentYearStrLocal;
                    if (cardPeriod === 'CUSTOM') return cleanDateStr >= cardStartDate && cleanDateStr <= cardEndDate;
                    return false;
                  });
                  const currentBalloonValue = activePeriodBalloonTxs.reduce((sum, t) => sum + t.amount, 0);

                  let rental = 0;
                  let installment = 0;
                  let displayCondoIptu = 0;
                  let reimbursement = 0;
                  let netPropertyFlow = 0;
                  let totalMonthlyCost = 0;

                  if (cardPeriod === 'CONTRACT') {
                    rental = rentalType === 'short_stay' ? shortStayRentsThisMonth : (Number(meta.rentalIncome) || 0);
                    const condo = Number(meta.condoFee) || 0;
                    const iptu = Number(meta.iptuFee) || 0;
                    displayCondoIptu = condo + iptu;
                    
                    const allocationRatio = meta.consortiumAllocationRatio !== undefined ? (Number(meta.consortiumAllocationRatio) / 100) : 1;
                    installment = linkedLiab ? (Number(linkedLiab.installmentAmount) * allocationRatio) : 0;

                    const actualCondoCost = meta.inquilinoPaysCondo ? 0 : condo;
                    const actualIptuCost = meta.inquilinoPaysIPTU ? 0 : iptu;
                    totalMonthlyCost = installment + actualCondoCost + actualIptuCost;

                    const condoReimbursement = meta.condoPayer === 'PROPRIETARIO_REEMBOLSO' ? condo : 0;
                    const iptuReimbursement = meta.iptuPayer === 'PROPRIETARIO_REEMBOLSO' ? iptu : 0;
                    reimbursement = condoReimbursement + iptuReimbursement;

                    netPropertyFlow = isRented ? (rental + reimbursement) - totalMonthlyCost : -totalMonthlyCost;
                  } else {
                    // Filter paid transactions in selected period
                    const now = new Date();
                    const currentMonthStr = DateUtils.formatToISODate(now).substring(0, 7);
                    const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    const previousMonthStr = DateUtils.formatToISODate(previousMonthDate).substring(0, 7);
                    const currentYearStr = DateUtils.formatToISODate(now).substring(0, 4);

                    const periodTxs = assetTxs.filter((t: Transaction) => {
                      if (!t.isPaid) return false;
                      const cleanDateStr = t.date.substring(0, 10);
                      const cleanMonthStr = t.date.substring(0, 7);
                      const cleanYearStr = t.date.substring(0, 4);

                      if (cardPeriod === 'CURRENT_MONTH') {
                        return cleanMonthStr === currentMonthStr;
                      }
                      if (cardPeriod === 'PREVIOUS_MONTH') {
                        return cleanMonthStr === previousMonthStr;
                      }
                      if (cardPeriod === 'CURRENT_YEAR') {
                        return cleanYearStr === currentYearStr;
                      }
                      if (cardPeriod === 'CUSTOM') {
                        return cleanDateStr >= cardStartDate && cleanDateStr <= cardEndDate;
                      }
                      return true;
                    });

                    rental = periodTxs
                      .filter((t: Transaction) => t.type === 'INCOME' && t.metadata?.type !== 'condo_revenue' && t.metadata?.type !== 'iptu_revenue' && (t.metadata?.type === 'rental_income' || t.metadata?.type === 'short_stay_booking' || t.subcategory?.toLowerCase() === 'aluguel regular' || t.subcategory?.toLowerCase() === 'short stay' || t.description.toLowerCase().includes('aluguel') || t.description.toLowerCase().includes('reserva')))
                      .reduce((sum: number, t: Transaction) => sum + t.amount, 0);

                    reimbursement = periodTxs
                      .filter((t: Transaction) => t.type === 'INCOME' && (t.metadata?.type === 'condo_revenue' || t.metadata?.type === 'iptu_revenue' || t.description.toLowerCase().includes('reembolso condomínio') || t.description.toLowerCase().includes('reembolso iptu') || t.description.toLowerCase().includes('reembolso condo')))
                      .reduce((sum: number, t: Transaction) => sum + t.amount, 0);

                    installment = periodTxs
                      .filter((t: Transaction) => t.type === 'EXPENSE' && (t.metadata?.type === 'consortium_installment' || t.liability_id || t.subcategory?.toLowerCase() === 'financiamento' || t.description.toLowerCase().includes('financiamento') || t.description.toLowerCase().includes('prestação') || t.description.toLowerCase().includes('consórcio')))
                      .reduce((sum: number, t: Transaction) => {
                        const isConsortiumTx = t.metadata?.type === 'consortium_installment' || t.liability_id || t.description.toLowerCase().includes('consórcio');
                        const ratio = isConsortiumTx ? ((parseFloat(meta.consortiumAllocationRatio) || 100) / 100) : 1;
                        return sum + (t.amount * ratio);
                      }, 0);

                    displayCondoIptu = periodTxs
                      .filter((t: Transaction) => t.type === 'EXPENSE' && (t.subcategory?.toLowerCase() === 'condomínio' || t.subcategory?.toLowerCase() === 'condominio' || t.subcategory?.toLowerCase() === 'iptu' || t.description.toLowerCase().includes('condomínio') || t.description.toLowerCase().includes('condominio') || t.description.toLowerCase().includes('iptu')))
                      .reduce((sum: number, t: Transaction) => sum + t.amount, 0);

                    totalMonthlyCost = installment + displayCondoIptu;
                    netPropertyFlow = rental + reimbursement - installment - displayCondoIptu;
                  }

                  return (
                    <div 
                      key={asset.id} 
                      onClick={() => {
                        setSelectedRealEstateForDetail(asset);
                        setShowRealEstateDetailModal(true);
                      }}
                      className={`bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-xl transition-all duration-500 flex flex-col justify-between cursor-pointer text-left ${asset.is_archived ? 'opacity-65' : ''}`}
                    >
                      <div className="p-6 sm:p-8 space-y-5 sm:space-y-6">
                        <div className="flex justify-between items-start">
                          <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-slate-900/10">
                            <HomeIcon size={22} />
                          </div>
                          <div className="flex flex-wrap gap-1.5 justify-end">
                            {asset.is_archived && (
                              <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-amber-100">Arquivado</span>
                            )}
                            {propertyStage === 'PLANTA' ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); togglePropertyTypeDirectly(asset); }}
                                className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-amber-100 transition-colors"
                              >
                                Na Planta 🛠️
                              </button>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); togglePropertyTypeDirectly(asset); }}
                                className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-100 transition-colors"
                              >
                                Pronto / Entregue 🏢
                              </button>
                            )}
                            {meta.purpose === 'investimento' ? (
                              <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-100">Investimento</span>
                            ) : (
                              <span className="px-3 py-1 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-100">Uso Próprio</span>
                            )}
                          </div>
                        </div>

                        <div>
                          <h4 className="font-black text-slate-900 text-lg sm:text-xl tracking-tight leading-tight italic break-words">{asset.name}</h4>
                          <div className="flex justify-between items-center mt-3 border-b border-slate-50 pb-2">
                            <p className="text-xs text-slate-400 font-black uppercase tracking-widest">Avaliação Atual:</p>
                            <p className="text-sm font-black text-slate-900">{formatCurrency(asset.estimatedValue)}</p>
                          </div>
                        </div>

                        {/* Pre-construction specs */}
                        {propertyStage === 'PLANTA' ? (
                          <div className="space-y-2.5 pt-2 text-xs sm:text-[11px] text-slate-500">
                            <div className="flex justify-between">
                              <span className="text-slate-600 font-medium">Valor devido Obra:</span>
                              <span className="font-bold text-rose-500">{formatCurrency(unpaidObra)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600 font-medium">Valor pago obra:</span>
                              <span className="font-bold text-emerald-600">{formatCurrency(paidObra)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600 font-medium">Parcela Mensal Obra:</span>
                              <span className="font-bold text-slate-800">{formatCurrency(currentConstructorInstallmentValue)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600 font-medium">Intermediária (Balão) Atual:</span>
                              <span className="font-bold text-slate-800">{formatCurrency(currentBalloonValue)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600 font-medium">Índice Correção:</span>
                              <span className="font-bold text-brand-600">{meta.constructorIndexType || 'INCC'}</span>
                            </div>
                            <div className="flex justify-between border-t border-dashed border-slate-100 pt-2 font-bold text-slate-600">
                              <span>% de correção atual:</span>
                              <span className="text-brand-600">{meta.constructorIndexRate !== undefined ? `${meta.constructorIndexRate}% a.m.` : '0.0% a.m.'}</span>
                            </div>
                            <div className="flex justify-between border-t border-dashed border-slate-100 pt-2 font-semibold text-slate-600">
                              <span>Saldo a Financiar (Entrega):</span>
                              <span className="font-bold text-slate-800">{formatCurrency(Number(meta.deliveryBalance) || 0)}</span>
                            </div>
                            {(Number(meta.financingInstallment) > 0) && (
                              <div className="flex justify-between font-semibold text-slate-600">
                                <span>Parcela a Financiar (Est.):</span>
                                <span className="font-bold text-slate-800">{formatCurrency(Number(meta.financingInstallment) || 0)}</span>
                              </div>
                            )}
                            {/* Barra de Progresso Obra */}
                            {(() => {
                              const obraProgress = (paidObra + unpaidObra) > 0 ? Math.round((paidObra / (paidObra + unpaidObra)) * 100) : 0;
                              return (
                                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                                  <div className="flex justify-between text-xs font-black uppercase text-slate-400">
                                    <span>Progresso da Obra / Aporte:</span>
                                    <span className="font-bold text-emerald-600">{obraProgress}% pago</span>
                                  </div>
                                  <div 
                                    className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden"
                                    role="progressbar"
                                    aria-valuenow={obraProgress}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-label="Progresso de pagamento da obra"
                                  >
                                    <div 
                                      className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                                      style={{ width: `${obraProgress}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <div className="space-y-2.5 pt-2 text-xs sm:text-[11px] text-slate-500">
                            <div className="flex justify-between">
                              <span className="text-slate-600 font-medium">Aluguel Líquido:</span>
                              <span className="font-bold text-emerald-600">
                                {cardPeriod === 'CONTRACT' && !isRented 
                                  ? 'Não Alugado' 
                                  : formatCurrency(rental)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600 font-medium">Parcela Financiamento:</span>
                              <span className="font-bold text-slate-700">{formatCurrency(installment)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-600 font-medium">Condomínio + IPTU (Despesa):</span>
                              <span className="font-bold text-slate-700">{formatCurrency(displayCondoIptu)}</span>
                            </div>
                            {(cardPeriod !== 'CONTRACT' || meta.condoPayer === 'PROPRIETARIO_REEMBOLSO' || meta.iptuPayer === 'PROPRIETARIO_REEMBOLSO') && (
                              <div className="flex justify-between">
                                <span className="text-slate-600 font-medium">Reembolso (Condo/IPTU):</span>
                                <span className="font-bold text-emerald-600">+{formatCurrency(reimbursement)}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-xs border-t border-dashed border-slate-100 pt-2 font-bold">
                              <span className="text-slate-700">Saldo Caixa Líquido:</span>
                              <span className={netPropertyFlow >= 0 ? 'text-emerald-600' : 'text-rose-500'}>
                                {netPropertyFlow >= 0 ? '+' : ''}{formatCurrency(netPropertyFlow)}
                                {cardPeriod === 'CONTRACT' ? '/mês' : ''}
                              </span>
                            </div>

                            {/* Métricas de Performance (Cap Rate, Cash-on-Cash) */}
                            {(() => {
                              const totalInvestedCapital = Number(meta.totalInvestedCapital) || paidObra || (asset.estimatedValue - (linkedLiab ? linkedLiab.remainingBalance : 0));
                              const realEstateMetrics = FinancialEngine.calculateRealEstateMetrics({
                                estimatedValue: asset.estimatedValue,
                                totalInvestedCapital: totalInvestedCapital,
                                monthlyGrossRent: Number(meta.rentalIncome) || 0,
                                monthlyOperationalExpenses: (Number(meta.condoFee) || 0) + (Number(meta.iptuFee) || 0),
                                monthlyFinancingInstallment: linkedLiab ? Number(linkedLiab.installmentAmount) : 0,
                                outstandingDebt: linkedLiab ? linkedLiab.remainingBalance : 0
                              });

                              return (
                                <>
                                  {meta.purpose === 'investimento' && (
                                    <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-dashed border-slate-100 text-xs text-slate-500">
                                      <div className="bg-slate-50 p-2 rounded-xl border border-slate-100/50">
                                        <span className="block text-[10px] text-slate-400 font-black uppercase tracking-wider">Cap Rate Anual</span>
                                        <span className="font-bold text-slate-800">{realEstateMetrics.capRateAnnual.toFixed(2)}%</span>
                                      </div>
                                      <div className="bg-slate-50/50 p-2 rounded-xl border border-slate-100/50">
                                        <span className="block text-[10px] text-slate-400 font-black uppercase tracking-wider">Cash-on-Cash</span>
                                        <span className="font-bold text-slate-800">{realEstateMetrics.cashOnCashReturn.toFixed(2)}%</span>
                                      </div>
                                    </div>
                                  )}
                                  {linkedLiab && (
                                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                                      <div className="flex justify-between text-xs font-black uppercase text-slate-400">
                                        <span>Financiamento LTV / Equity:</span>
                                        <span className="font-bold text-slate-800">{realEstateMetrics.ltv.toFixed(0)}% LTV / {realEstateMetrics.homeEquityPercent.toFixed(0)}% Equity</span>
                                      </div>
                                      <div 
                                        className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden flex"
                                        role="progressbar"
                                        aria-valuenow={realEstateMetrics.homeEquityPercent}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-label="Proporção de LTV e Home Equity"
                                      >
                                        <div className="bg-red-400 h-full" style={{ width: `${realEstateMetrics.ltv}%` }} />
                                        <div className="bg-emerald-500 h-full" style={{ width: `${realEstateMetrics.homeEquityPercent}%` }} />
                                      </div>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}

                        {/* Sustainability metrics property health */}
                        {propertyStage === 'PRONTO' && meta.purpose === 'investimento' && (
                          <div className="p-3 bg-slate-50 rounded-xl space-y-2 border border-slate-100">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saúde Financeira do Ativo</p>
                            {(() => {
                              const progressVal = Math.min(
                                cardPeriod === 'CONTRACT'
                                  ? (isRented && totalMonthlyCost > 0 ? Math.round((rental / totalMonthlyCost) * 100) : 0)
                                  : ((installment + displayCondoIptu) > 0 ? Math.round((rental / (installment + displayCondoIptu)) * 100) : (rental > 0 ? 100 : 0)), 
                                100
                              );
                              return (
                                <>
                                  <div 
                                    className="w-full bg-slate-200 h-2 rounded-full overflow-hidden flex"
                                    role="progressbar"
                                    aria-valuenow={progressVal}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-label="Saúde financeira (Autossuficiência) do Ativo"
                                  >
                                    <div
                                      className={`h-full ${netPropertyFlow >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                      style={{ width: `${progressVal}%` }}
                                    />
                                  </div>
                                </>
                              );
                            })()}
                            <p className="text-xs font-semibold text-slate-500">
                              {netPropertyFlow >= 0 
                                ? '🟢 Imóvel 100% autossuficiente (Se paga e sobra caixa)' 
                                : '🔴 Imóvel deficitário (Consome capital de outras fontes)'}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Card controls and actions */}
                      <div className="px-6 sm:px-8 py-4 sm:py-5 bg-slate-50 border-t border-slate-100 flex flex-wrap justify-between items-center gap-2 sm:gap-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRealEstateForDetail(asset);
                            setShowRealEstateDetailModal(true);
                          }}
                          className="flex items-center gap-1 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-brand-600 transition-colors"
                        >
                          <History size={12} /> Detalhes &amp; Evolução
                        </button>
                        <div className="flex gap-2 items-center">
                          {!asset.is_archived && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openEditAsset(asset); }}
                              className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-brand-600"
                            >
                              Editar
                            </button>
                          )}
                          {asset.is_archived ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleUnarchiveAsset(asset); }}
                              className="text-xs font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700"
                            >
                              Desarquivar
                            </button>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleArchiveAsset(asset); }}
                              className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-amber-600"
                            >
                              Arquivar
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteAsset(asset); }}
                            className="text-slate-300 hover:text-rose-600 transition-colors"
                            aria-label={`Excluir ativo imobiliário ${asset.name}`}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* VEHICLES VIEW */}
        {activeView === 'vehicles' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight italic flex items-center gap-2">
                <Car size={20} className="text-slate-500" />
                Seus Veículos
              </h3>
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500/20"
                  checked={showArchivedVehicles}
                  onChange={(e) => setShowArchivedVehicles(e.target.checked)}
                />
                Exibir arquivados e vendidos
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {physicalAssets.filter(p => p.category === 'VEHICLE' && (showArchivedVehicles ? true : !p.is_archived)).map(asset => {
                const meta = asset.metadata || {};
                const value = asset.estimatedValue;
                const purchase = Number(meta.purchaseValue) || value;
                const fipe = Number(meta.fipeValue) || value;

                // Dynamic Vehicle Icon
                const VehicleIcon = meta.vehicleType === 'MOTORCYCLE' ? Bike : meta.vehicleType === 'TRUCK' ? Truck : Car;

                // Margem de ágio / deságio (Apenas faz sentido para Investimento ou FLIP)
                const diffVal = value - purchase;
                const percentVal = purchase > 0 ? (diffVal / purchase) * 100 : 0;
                
                // FIPE analysis (Calcula com base na FIPE vs Aquisição ou Valor Estimado)
                const isDepreciatingFast = purchase > 0 && fipe < purchase * 0.85;

                // Depreciação em R$
                const depreciacaoValor = purchase - fipe;

                return (
                  <div key={asset.id} className={`bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-xl transition-all duration-500 flex flex-col justify-between ${asset.is_archived || meta.isSold ? 'opacity-65' : ''}`}>
                    <div className="p-6 sm:p-8 space-y-5 sm:space-y-6">
                      <div className="flex justify-between items-start">
                        <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-slate-900/10">
                          <VehicleIcon size={22} />
                        </div>
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          {meta.isSold && (
                            <span className="px-3 py-1 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-rose-100">Vendido</span>
                          )}
                          {asset.is_archived && !meta.isSold && (
                            <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-amber-100">Arquivado</span>
                          )}
                          {meta.purpose === 'investimento' ? (
                            <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-100">Investimento</span>
                          ) : (
                            <span className="px-3 py-1 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-100">Uso Pessoal</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-black text-slate-900 text-lg sm:text-xl tracking-tight leading-tight italic break-words">{asset.name}</h4>
                        {(meta.yearModel || meta.licensePlate) && (
                           <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-medium">
                             {meta.yearModel && <span>Ano: {meta.yearModel}</span>}
                             {meta.yearModel && meta.licensePlate && <span>•</span>}
                             {meta.licensePlate && <span className="uppercase">{meta.licensePlate}</span>}
                           </div>
                        )}
                        <div className="flex justify-between items-center mt-3 border-b border-slate-50 pb-2">
                          <p className="text-xs text-slate-400 font-black uppercase tracking-widest">{meta.isSold ? 'Valor de Venda:' : 'Avaliação Atual:'}</p>
                          <p className="text-sm font-black text-slate-900">{formatCurrency(meta.isSold ? Number(meta.soldValue) || value : value)}</p>
                        </div>
                      </div>

                      {/* Calculations specs */}
                      <div className="space-y-2.5 text-xs sm:text-[11px] text-slate-500">
                        <div className="flex justify-between">
                          <span>Valor Aquisição:</span>
                          <span className="font-bold text-slate-800">{formatCurrency(purchase)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Valor Tabela FIPE:</span>
                          <span className="font-bold text-slate-800">{formatCurrency(fipe)}</span>
                        </div>
                        
                        {meta.purpose === 'investimento' && (
                          <div className="flex justify-between">
                            <span>Margem Ágio/Deságio:</span>
                            <span className={`font-bold ${diffVal >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                              {diffVal >= 0 ? '+' : ''}{formatCurrency(diffVal)} ({percentVal.toFixed(1)}%)
                            </span>
                          </div>
                        )}
                        
                        {meta.purpose === 'uso' && (
                           <div className="flex justify-between border-t border-slate-100 pt-2 text-slate-600">
                             <span>Depreciação Estimada:</span>
                             <span className={`font-bold ${depreciacaoValor > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                               {depreciacaoValor > 0 ? `-${formatCurrency(depreciacaoValor)}` : `+${formatCurrency(Math.abs(depreciacaoValor))}`}
                             </span>
                           </div>
                        )}
                      </div>

                      {/* Yield alerts based on FIPE */}
                      {meta.purpose === 'uso' && (
                        <div className="p-3 bg-slate-50 rounded-xl space-y-1 border border-slate-100 text-xs">
                          {isDepreciatingFast ? (
                            <p className="text-rose-500 font-semibold flex items-center gap-1"><AlertTriangle size={10} /> Alta desvalorização frente à FIPE.</p>
                          ) : depreciacaoValor <= 0 ? (
                            <p className="text-emerald-600 font-semibold flex items-center gap-1"><Check size={10} /> Valorizado acima da FIPE.</p>
                          ) : (
                            <p className="text-slate-500 font-semibold">Desvalorização natural observada.</p>
                          )}
                          <p className="text-[10px] text-slate-400 font-medium leading-tight mt-1">Comparativo entre FIPE atual e preço de aquisição.</p>
                        </div>
                      )}
                    </div>

                    {/* Actions bar */}
                    <div className="px-6 sm:px-8 py-4 sm:py-5 bg-slate-50 border-t border-slate-100 flex flex-wrap justify-between items-center gap-3">
                      <button
                        onClick={() => {
                          setSelectedAssetForExtrato(asset);
                          setShowExtratoModal(true);
                        }}
                        className="flex items-center gap-1 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-brand-600 transition-colors"
                      >
                        <History size={12} /> Extrato &amp; Ajustes
                      </button>
                      <div className="flex gap-3 items-center">
                        {!asset.is_archived && (
                          <button onClick={() => openEditAsset(asset)} className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-brand-600">Editar</button>
                        )}
                        {asset.is_archived ? (
                          <button onClick={() => handleUnarchiveAsset(asset)} className="text-xs font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700">Desarquivar</button>
                        ) : (
                          <button onClick={() => handleArchiveAsset(asset)} className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-amber-600">Arquivar</button>
                        )}
                        {!meta.isSold && !asset.is_archived && (
                          <button onClick={() => handleArchiveAssetFromExtrato(asset)} className="text-xs font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2 py-1 rounded">Vender</button>
                        )}
                        <button
                          onClick={() => handleDeleteAsset(asset)}
                          className="text-slate-300 hover:text-rose-600 transition-colors"
                          aria-label={`Excluir veículo ${asset.name}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              <button
                onClick={() => {
                  resetAssetForm();
                  setEditingAsset(null);
                  setFormData(prev => ({ ...prev, category: 'VEHICLE', purpose: 'uso' }));
                  setShowModal(true);
                }}
                className="rounded-[32px] border-2 border-dashed border-slate-200 p-8 flex flex-col items-center justify-center gap-4 text-slate-400 hover:border-brand-500 hover:text-brand-600 hover:bg-slate-50 transition-all h-full"
              >
                <Plus size={36} />
                <span className="font-bold text-slate-600">Novo Veículo</span>
              </button>
            </div>
          </div>
        )}

        {/* OTHER PHYSICAL ASSETS VIEW */}
        {activeView === 'physical' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Box size={20} className="text-slate-500" />
                Outros Ativos Físicos
              </h3>
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500/20"
                  checked={showArchivedPhysical}
                  onChange={(e) => setShowArchivedPhysical(e.target.checked)}
                />
                Exibir bens arquivados e vendidos
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
              {displayOtherPhysicalAssets.map(asset => {
                const meta = asset.metadata || {};
                const purchase = Number(meta.purchaseValue) || asset.estimatedValue;

                // Calcular depreciação linear automática se configurado
                let value = asset.estimatedValue;
                if (meta.purpose === 'uso' && meta.isDepreciable && Number(meta.depreciationRate) > 0 && asset.acquisitionDate) {
                  try {
                    const acqDate = new Date(asset.acquisitionDate);
                    const now = new Date();
                    const elapsedMonths = Math.max(0, (now.getFullYear() - acqDate.getFullYear()) * 12 + now.getMonth() - acqDate.getMonth());
                    const yearlyRate = parseFloat(meta.depreciationRate) / 100;
                    const monthlyRate = yearlyRate / 12;
                    const totalDepreciationPercent = Math.min(1, elapsedMonths * monthlyRate);
                    value = Math.max(0, purchase * (1 - totalDepreciationPercent));
                  } catch (e) {
                    console.warn('Error calculating depreciation:', e);
                  }
                }

                // Margem de ágio / deságio
                const diffVal = value - purchase;
                const percentVal = purchase > 0 ? (diffVal / purchase) * 100 : 0;

                // Dynamic icon based on iconKey or name fallback
                const getOtherAssetIcon = (iconKey?: string, name?: string) => {
                  if (iconKey === 'Gem') return <Gem size={20} />;
                  if (iconKey === 'Watch') return <Watch size={20} />;
                  if (iconKey === 'Palette') return <Palette size={20} />;
                  if (iconKey === 'Award') return <Award size={20} />;
                  if (iconKey === 'Box') return <Box size={20} />;

                  const normalizedName = (name || '').toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "");

                  if (normalizedName.includes('joia') || normalizedName.includes('ouro') || normalizedName.includes('prata') || normalizedName.includes('diamante') || normalizedName.includes('gema') || normalizedName.includes('esmeralda') || normalizedName.includes('anel') || normalizedName.includes('colar') || normalizedName.includes('brinco')) {
                    return <Gem size={20} />;
                  }
                  if (normalizedName.includes('relogio') || normalizedName.includes('rolex') || normalizedName.includes('omega') || normalizedName.includes('patek') || normalizedName.includes('tissot') || normalizedName.includes('tag heuer')) {
                    return <Watch size={20} />;
                  }
                  if (normalizedName.includes('arte') || normalizedName.includes('quadro') || normalizedName.includes('pintura') || normalizedName.includes('escultura') || normalizedName.includes('tela') || normalizedName.includes('obra')) {
                    return <Palette size={20} />;
                  }
                  if (normalizedName.includes('consorcio')) {
                    return <Award size={20} />;
                  }
                  return <Box size={20} />;
                };

                return (
                  <div key={asset.id} className={`bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-xl transition-all duration-500 flex flex-col justify-between ${asset.is_archived || meta.isSold ? 'opacity-65' : ''}`}>
                    <div className="p-5 sm:p-6 lg:p-8 space-y-5 sm:space-y-6">
                      <div className="flex justify-between items-start">
                        <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg shadow-slate-900/10">
                          {getOtherAssetIcon(meta.iconKey, asset.name)}
                        </div>
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          {meta.isSold && (
                            <span className="px-3 py-1 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-rose-100">Vendido</span>
                          )}
                          {asset.is_archived && !meta.isSold && (
                            <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-amber-100">Arquivado</span>
                          )}
                          {meta.purpose === 'investimento' ? (
                            <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-100">Investimento</span>
                          ) : (
                            <span className="px-3 py-1 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-100">Uso Pessoal</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-bold text-slate-900 text-lg sm:text-xl tracking-tight leading-tight break-words">{asset.name}</h4>
                        <div className="flex justify-between items-center mt-3 border-b border-slate-50 pb-2">
                          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">{meta.isSold ? 'Valor de Venda:' : 'Avaliação Atual:'}</p>
                          <p className="text-sm font-black text-slate-900">{formatCurrency(meta.isSold ? Number(meta.soldValue) || value : value)}</p>
                        </div>
                      </div>

                      {/* Calculations specs */}
                      <div className="space-y-2.5 text-xs sm:text-[11px] text-slate-600">
                        <div className="flex justify-between">
                          <span>Valor Aquisição:</span>
                          <span className="font-bold text-slate-800">{formatCurrency(purchase)}</span>
                        </div>
                        {meta.brandModel && (
                          <div className="flex justify-between">
                            <span>Marca / Modelo:</span>
                            <span className="font-semibold text-slate-700">{meta.brandModel}</span>
                          </div>
                        )}
                        {meta.serialNumber && (
                          <div className="flex justify-between">
                            <span>Nº Série / Registro:</span>
                            <span className="font-medium text-slate-700">{meta.serialNumber}</span>
                          </div>
                        )}
                        {meta.custodyLocation && (
                          <div className="flex justify-between">
                            <span>Custódia:</span>
                            <span className="font-medium text-slate-700">{meta.custodyLocation}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>{meta.purpose === 'investimento' ? 'Margem Ágio/Deságio:' : (diffVal < 0 ? 'Depreciação Acumulada:' : 'Variação de Valor:')}</span>
                          <span className={`font-bold ${diffVal >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {diffVal >= 0 ? '+' : ''}{formatCurrency(diffVal)} ({percentVal.toFixed(1)}%)
                          </span>
                        </div>

                        {meta.purpose === 'investimento' && meta.vehiclePurposeType === 'RENTAL' && meta.isRented && (
                          <div className="border-t border-slate-100 pt-2.5 space-y-1">
                            <div className="flex justify-between text-emerald-700 font-bold">
                              <span>Rend. Líquido Mensal:</span>
                              <span>{formatCurrency(Number(meta.rentalIncome || 0) - Number(meta.rentalPlatformFee || 0) - Number(meta.maintenanceMonthlyEstimated || 0))}</span>
                            </div>
                            <div className="flex justify-between text-[11px] text-slate-500">
                              <span>Rendimento Bruto:</span>
                              <span>{formatCurrency(Number(meta.rentalIncome || 0))}</span>
                            </div>
                            {(Number(meta.rentalPlatformFee || 0) > 0 || Number(meta.maintenanceMonthlyEstimated || 0) > 0) && (
                              <div className="flex justify-between text-[10px] text-slate-400">
                                <span>Custos (Plat. + Guarda):</span>
                                <span>-{formatCurrency(Number(meta.rentalPlatformFee || 0) + Number(meta.maintenanceMonthlyEstimated || 0))}</span>
                              </div>
                            )}
                            {value > 0 && (
                              <div className="flex justify-between text-[11px] text-brand-600 font-semibold pt-0.5">
                                <span>Cap Rate Estimado:</span>
                                <span>{(((Number(meta.rentalIncome || 0) - Number(meta.rentalPlatformFee || 0) - Number(meta.maintenanceMonthlyEstimated || 0)) * 12) / value * 100).toFixed(2)}% a.a.</span>
                              </div>
                            )}
                          </div>
                        )}

                        {meta.purpose === 'investimento' && meta.vehiclePurposeType === 'FLIP' && (
                          <div className="border-t border-slate-100 pt-2.5 space-y-1">
                            <div className="flex justify-between text-indigo-700 font-bold">
                              <span>Preço Venda Alvo:</span>
                              <span>{formatCurrency(Number(meta.targetSaleValue || 0))}</span>
                            </div>
                            <div className="flex justify-between text-[11px] text-slate-500">
                              <span>Orçamento Preparação:</span>
                              <span>{formatCurrency(Number(meta.preparationBudget || 0))}</span>
                            </div>
                            {Number(meta.targetSaleValue || 0) > 0 && (
                              <div className="flex justify-between text-[11px] text-brand-600 font-semibold pt-0.5">
                                <span>ROI Líquido Projetado:</span>
                                <span>
                                  {(() => {
                                    const targetSale = Number(meta.targetSaleValue) || 0;
                                    const prepBudget = Number(meta.preparationBudget) || 0;
                                    const totalInvested = purchase + prepBudget;
                                    const commVal = Number(meta.saleCommission) || 0;
                                    const grossProfit = targetSale - totalInvested;
                                    const taxCapitalGain = grossProfit > 0 ? grossProfit * 0.15 : 0;
                                    const netProfit = grossProfit - commVal - taxCapitalGain;
                                    const roiNet = totalInvested > 0 ? (netProfit / totalInvested) * 100 : 0;
                                    return `${roiNet.toFixed(1)}%`;
                                  })()}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions bar */}
                    <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap justify-between items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedAssetForExtrato(asset);
                          setShowExtratoModal(true);
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition-all min-h-[36px]"
                        aria-label={`Visualizar extrato e lançamentos de ${asset.name}`}
                      >
                        <History size={14} /> Extrato & Ajustes
                      </button>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEditAsset(asset)}
                          className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition-all min-h-[36px] flex items-center justify-center"
                          aria-label={`Editar ativo ${asset.name}`}
                        >
                          Editar
                        </button>
                        {asset.is_archived ? (
                          <button
                            onClick={() => handleUnarchiveAsset(asset)}
                            className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-all min-h-[36px] flex items-center justify-center"
                            aria-label={`Desarquivar ativo ${asset.name}`}
                          >
                            Desarquivar
                          </button>
                        ) : (
                          <button
                            onClick={() => handleArchiveAsset(asset)}
                            className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded-lg transition-all min-h-[36px] flex items-center justify-center"
                            aria-label={`Arquivar ativo ${asset.name}`}
                          >
                            Arquivar
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteAsset(asset)}
                          className="px-2 py-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all min-h-[36px] flex items-center justify-center"
                          aria-label={`Excluir ativo ${asset.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              <button
                onClick={() => {
                  resetAssetForm();
                  setEditingAsset(null);
                  setFormData(prev => ({ ...prev, category: 'OTHER', purpose: 'uso', isLoan: false }));
                  setShowModal(true);
                }}
                className="rounded-[32px] border-2 border-dashed border-slate-200 p-8 flex flex-col items-center justify-center gap-4 text-slate-400 hover:border-brand-500 hover:text-brand-600 hover:bg-slate-50 transition-all h-full"
              >
                <Plus size={36} />
                <span className="font-bold text-slate-600">Novo Ativo Físico</span>
              </button>
            </div>
          </div>
        )}

        {/* LOANS VIEW */}
        {activeView === 'loans' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            
            {/* LENT LOANS (EMPRÉSTIMOS CONCEDIDOS) SECTION */}
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-900 tracking-tight italic flex items-center gap-2">
                  <ArrowRightLeft size={20} className="text-slate-500" />
                  Empréstimos Concedidos (Contas a Receber)
                </h3>
                <button
                  onClick={() => {
                    resetAssetForm();
                    setEditingAsset(null);
                    setFormData(prev => ({ ...prev, isLoan: true, category: 'OTHER' }));
                    setShowModal(true);
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-sm hover:bg-slate-800 transition-colors"
                >
                  <Plus size={12} /> Novo Empréstimo
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {activePhysicalAssets.filter(p => p.metadata?.isLoan).map(loan => {
                  const meta = loan.metadata || {};
                  const principal = Number(meta.loanPrincipal) || 0;
                  const rate = Number(meta.loanInterestRate) || 0;
                  const fixedVal = Number(meta.loanFixedValue) || 0;
                  const isOpenBalance = meta.loanType === 'OPEN_BALANCE';

                  // ── Gera extrato completo em HTML e abre para impressão / PDF ──
                  const handleGeneratePDF = () => {
                    // Só pagamentos efetivamente recebidos (isPaid) entram no extrato —
                    // parcelas provisionadas ainda não pagas não abatem o saldo.
                    const payments = getAssetLinkedTransactions(loan.id)
                      .filter((t: any) => t.type === 'INCOME' && t.isPaid)
                      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

                    const monthlyRate = rate / 100;
                    const dailyRate = meta.loanInterestType === 'COMPOUND'
                      ? Math.pow(1 + monthlyRate, 1 / 30) - 1
                      : monthlyRate / 30;

                    const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
                    const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');

                    // Constrói as linhas da tabela de evolução
                    type Row = { date: string; days: number; interest: number; payment: number; balance: number; label: string };
                    const rows: Row[] = [];
                    const startDate = meta.acquisitionDate || loan.acquisitionDate || DateUtils.formatToISODate();
                    let balance = principal;
                    let lastDate = startDate;
                    rows.push({ date: startDate, days: 0, interest: 0, payment: 0, balance: principal, label: 'Concessão do empréstimo' });

                    for (const pmt of payments) {
                      const pmtDate = pmt.date?.split('T')[0] || pmt.date;
                      const msA = new Date(lastDate + 'T12:00:00').getTime();
                      const msB = new Date(pmtDate + 'T12:00:00').getTime();
                      const days = Math.max(0, Math.round((msB - msA) / 86400000));
                      const interest = meta.loanInterestType === 'COMPOUND'
                        ? balance * (Math.pow(1 + dailyRate, days) - 1)
                        : balance * dailyRate * days;
                      balance = Math.max(0, balance + interest - Number(pmt.amount));
                      rows.push({ date: pmtDate, days, interest, payment: Number(pmt.amount), balance, label: 'Pagamento recebido' });
                      lastDate = pmtDate;
                    }

                    // Linha de hoje
                    const today = DateUtils.formatToISODate();
                    if (today !== lastDate) {
                      const msA = new Date(lastDate + 'T12:00:00').getTime();
                      const msB = new Date(today + 'T12:00:00').getTime();
                      const days = Math.max(0, Math.round((msB - msA) / 86400000));
                      const interest = meta.loanInterestType === 'COMPOUND'
                        ? balance * (Math.pow(1 + dailyRate, days) - 1)
                        : balance * dailyRate * days;
                      balance += interest;
                      rows.push({ date: today, days, interest, payment: 0, balance: Math.max(0, balance), label: 'Saldo em aberto hoje' });
                    }

                    const totalPaid = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
                    const totalInterest = rows.slice(1).reduce((s, r) => s + r.interest, 0);
                    const currentBalance = rows[rows.length - 1]?.balance ?? 0;
                    const pctPaid = principal > 0 ? Math.min(100, (totalPaid / (principal + totalInterest)) * 100) : 0;
                    const refNum = `ZY-${loan.id.slice(0, 8).toUpperCase()}`;

                    const rowsHTML = rows.map((r, i) => {
                      const isFirst = i === 0;
                      const isLast = i === rows.length - 1;
                      const bg = isLast ? '#fefce8' : isFirst ? '#f0fdf4' : i % 2 === 0 ? '#ffffff' : '#f8fafc';
                      const balanceColor = isLast ? '#d97706' : '#1e293b';
                      return `
                        <tr style="background:${bg};">
                          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:${isLast?700:400};color:${isLast?'#92400e':'#334155'}">${fmtDate(r.date)}</td>
                          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b">${r.days > 0 ? r.days + 'd' : '—'}</td>
                          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:${r.interest > 0 ? '#b45309' : '#94a3b8'}">${r.interest > 0 ? fmt(r.interest) : '—'}</td>
                          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:${r.payment > 0 ? '#16a34a' : '#94a3b8'};font-weight:${r.payment > 0 ? 700 : 400}">${r.payment > 0 ? fmt(r.payment) : '—'}</td>
                          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:${balanceColor}">${fmt(r.balance)}</td>
                          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#94a3b8;font-size:10px">${r.label}</td>
                        </tr>
                      `;
                    }).join('');

                    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Extrato de Empréstimo — ${loan.name}</title>
<style>
  @page { margin: 18mm 20mm; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 12px; line-height: 1.6; background: white; }
  @media screen { body { max-width: 900px; margin: 0 auto; padding: 32px; } }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 20px; border-bottom: 3px solid #1e293b; margin-bottom: 28px; }
  .logo { display: flex; align-items: center; gap: 10px; }
  .logo-box { width: 44px; height: 44px; background: #1e293b; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 900; font-style: italic; font-size: 18px; line-height:1; }
  .logo-text { font-size: 20px; font-weight: 900; color: #1e293b; }
  .logo-sub { font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; }
  .doc-info { text-align: right; }
  .doc-title { font-size: 18px; font-weight: 900; color: #1e293b; text-transform: uppercase; letter-spacing: 0.05em; }
  .doc-ref { font-size: 10px; color: #94a3b8; margin-top: 4px; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; color: #94a3b8; margin-bottom: 10px; border-left: 3px solid #6366f1; padding-left: 8px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .info-item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
  .info-label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #94a3b8; }
  .info-value { font-size: 14px; font-weight: 700; color: #1e293b; margin-top: 2px; }
  .balance-box { background: #fffbeb; border: 2px solid #fbbf24; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px; }
  .balance-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; color: #92400e; }
  .balance-value { font-size: 36px; font-weight: 900; color: #78350f; margin-top: 6px; }
  .balance-date { font-size: 11px; color: #b45309; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead th { background: #1e293b; color: white; padding: 10px 12px; text-align: left; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; }
  thead th:not(:first-child) { text-align: right; }
  thead th:last-child { text-align: left; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .summary-item { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
  .summary-label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; }
  .summary-value { font-size: 15px; font-weight: 900; margin-top: 4px; }
  .progress-bar { height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; margin-top: 8px; }
  .progress-fill { height: 100%; background: #22c55e; border-radius: 4px; }
  .footer { border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px; display: flex; justify-content: space-between; align-items: center; }
  .footer-left { font-size: 10px; color: #94a3b8; }
  .footer-right { font-size: 10px; color: #94a3b8; text-align: right; }
  .badge { display: inline-block; background: #f0fdf4; border: 1px solid #86efac; color: #16a34a; border-radius: 20px; padding: 2px 10px; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
  <!-- BOTÃO IMPRIMIR (visível só na tela) -->
  <div class="no-print" style="margin-bottom:24px;display:flex;gap:12px;align-items:center;">
    <button onclick="window.print()" style="background:#1e293b;color:white;border:none;padding:12px 28px;border-radius:10px;font-weight:900;font-size:13px;cursor:pointer;text-transform:uppercase;letter-spacing:0.08em;">
      ⬇ Salvar / Imprimir PDF
    </button>
    <span style="font-size:12px;color:#94a3b8;">Selecione "Salvar como PDF" na janela de impressão</span>
  </div>

  <!-- CABEÇALHO -->
  <div class="header">
    <div class="logo">
      <img src="/logo-icon.png" alt="Zyvion" style="width:44px;height:44px;object-fit:contain;" />
      <div>
        <div class="logo-text">Zyvion</div>
        <div class="logo-sub">Gestão Financeira Inteligente</div>
      </div>
    </div>
    <div class="doc-info">
      <div class="doc-title">Extrato de Empréstimo</div>
      <div class="doc-ref">Ref.: ${refNum}</div>
      <div class="doc-ref">Emitido em: ${fmtDate(today)}</div>
    </div>
  </div>

  <!-- DADOS DO EMPRÉSTIMO -->
  <div class="section">
    <div class="section-title">Dados do Empréstimo</div>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Identificação</div>
        <div class="info-value">${loan.name}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Devedor</div>
        <div class="info-value">${meta.loanDebtor || 'Não informado'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Valor Principal</div>
        <div class="info-value">${fmt(principal)}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Data de Concessão</div>
        <div class="info-value">${fmtDate(startDate)}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Taxa de Juros</div>
        <div class="info-value">${rate > 0 ? rate + '% a.m.' : fmt(fixedVal) + ' fixo/mês'} (${meta.loanInterestType === 'COMPOUND' ? 'Compostos' : 'Simples'})</div>
      </div>
      <div class="info-item">
        <div class="info-label">Modelo</div>
        <div class="info-value">${isOpenBalance ? 'Conta Corrente — Amortizável' : 'Parcelado Fixo'}</div>
      </div>
    </div>
  </div>

  <!-- SALDO ATUAL -->
  <div class="balance-box">
    <div class="balance-label">⚡ Valor em Aberto em ${fmtDate(today)}</div>
    <div class="balance-value">${fmt(currentBalance)}</div>
    <div class="balance-date">Juros calculados pro-rata até hoje (${meta.loanInterestType === 'COMPOUND' ? 'taxa diária composta' : 'taxa diária simples'})</div>
  </div>

  <!-- RESUMO FINANCEIRO -->
  <div class="section">
    <div class="section-title">Resumo Financeiro</div>
    <div class="summary-grid">
      <div class="summary-item">
        <div class="summary-label">Principal</div>
        <div class="summary-value" style="color:#1e293b">${fmt(principal)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Juros Acumulados</div>
        <div class="summary-value" style="color:#b45309">${fmt(totalInterest)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Total Recebido</div>
        <div class="summary-value" style="color:#16a34a">${fmt(totalPaid)}</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pctPaid.toFixed(1)}%"></div></div>
        <div style="font-size:9px;color:#94a3b8;margin-top:4px">${pctPaid.toFixed(1)}% quitado</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Saldo Devedor</div>
        <div class="summary-value" style="color:${currentBalance > 0 ? '#d97706' : '#16a34a'}">${fmt(currentBalance)}</div>
        ${currentBalance < 0.01 ? '<div class="badge">Quitado</div>' : ''}
      </div>
    </div>
  </div>

  <!-- TABELA DE EVOLUÇÃO -->
  <div class="section">
    <div class="section-title">Evolução Detalhada — Período a Período</div>
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th style="text-align:center">Dias</th>
          <th style="text-align:right">Juros do período</th>
          <th style="text-align:right">Pagamento</th>
          <th style="text-align:right">Saldo</th>
          <th>Evento</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHTML}
      </tbody>
    </table>
    <div style="font-size:10px;color:#94a3b8;font-style:italic;">
      * Os juros de cada período são calculados sobre o saldo devedor do início do período, pela taxa diária ${meta.loanInterestType === 'COMPOUND' ? 'composta' : 'simples'} equivalente a ${rate}% a.m.
      ${isOpenBalance ? 'Os pagamentos reduzem diretamente o saldo devedor a partir da data em que foram realizados.' : ''}
    </div>
  </div>

  <!-- RODAPÉ -->
  <div class="footer">
    <div class="footer-left">
      <strong>Zyvion</strong> — Documento gerado automaticamente<br>
      Este extrato é apenas informativo e não constitui título executivo.
    </div>
    <div class="footer-right">
      Ref.: ${refNum}<br>
      Emissão: ${fmtDate(today)}
    </div>
  </div>

  <script>
    // Auto-print ao abrir (comentar se quiser ver antes)
    // window.onload = () => setTimeout(() => window.print(), 500);
  </script>
</body>
</html>`;

                    const win = window.open('', '_blank');
                    if (win) {
                      win.document.write(html);
                      win.document.close();
                    }
                  };

                  // Pagamentos vinculados a este empréstimo (via linkedTransactionsMap).
                  // Só conta o que foi EFETIVAMENTE RECEBIDO (isPaid): as parcelas
                  // provisionadas (a receber, ainda não pagas) não podem abater o saldo
                  // devedor nem aparecer no histórico de pagamentos.
                  const loanPayments = getAssetLinkedTransactions(loan.id)
                    .filter((t: any) => t.type === 'INCOME' && t.isPaid)
                    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

                  // Cálculo de saldo para modelo Conta Corrente
                  const calcOpenBalance = () => {
                    if (!isOpenBalance || principal <= 0 || rate <= 0) return null;
                    const monthlyRate = rate / 100;
                    const dailyRate = meta.loanInterestType === 'COMPOUND'
                      ? Math.pow(1 + monthlyRate, 1 / 30) - 1
                      : monthlyRate / 30;

                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    let balance = principal;
                    let lastDate = new Date(meta.acquisitionDate || loan.acquisitionDate || DateUtils.formatToISODate());
                    lastDate.setHours(0, 0, 0, 0);
                    let totalInterest = 0;
                    let totalPaid = 0;

                    // Aplica juros + abate pagamentos cronologicamente
                    for (const pmt of loanPayments) {
                      const pmtDate = new Date(pmt.date);
                      pmtDate.setHours(0, 0, 0, 0);
                      if (pmtDate <= lastDate) continue;
                      const days = Math.max(0, Math.round((pmtDate.getTime() - lastDate.getTime()) / 86400000));
                      const interest = meta.loanInterestType === 'COMPOUND'
                        ? balance * (Math.pow(1 + dailyRate, days) - 1)
                        : balance * dailyRate * days;
                      balance += interest;
                      totalInterest += interest;
                      const pmtAmt = Number(pmt.amount) || 0;
                      balance = Math.max(0, balance - pmtAmt);
                      totalPaid += pmtAmt;
                      lastDate = pmtDate;
                    }

                    // Juros até hoje
                    const daysToday = Math.max(0, Math.round((today.getTime() - lastDate.getTime()) / 86400000));
                    const interestToday = meta.loanInterestType === 'COMPOUND'
                      ? balance * (Math.pow(1 + dailyRate, daysToday) - 1)
                      : balance * dailyRate * daysToday;
                    balance += interestToday;
                    totalInterest += interestToday;

                    return { balance: Math.max(0, balance), totalInterest, totalPaid };
                  };

                  const openBalanceInfo = calcOpenBalance();
                  // "Devolvido" = soma dos pagamentos RECEBIDOS (loanPayments já filtra
                  // isPaid). Antes usava todas as receitas vinculadas — as parcelas
                  // provisionadas (não pagas) contavam como devolvidas e o empréstimo
                  // aparecia como quitado assim que as parcelas eram geradas.
                  const returned = loanPayments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
                  const currentBalance = isOpenBalance && openBalanceInfo
                    ? openBalanceInfo.balance
                    : Math.max(0, principal - returned);
                  const progressPercent = principal > 0 ? Math.min(100, Math.round((returned / principal) * 100)) : 0;
                  const isQuitado = currentBalance < 0.01 && principal > 0;

                  return (
                    <div key={loan.id} className={`bg-white rounded-3xl border shadow-sm p-6 space-y-5 flex flex-col justify-between ${isOpenBalance ? 'border-emerald-100' : 'border-slate-100'}`}>
                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isOpenBalance ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-900'}`}>
                            <ArrowRightLeft size={20} />
                          </div>
                          <div className="flex items-center gap-2">
                            {isOpenBalance && (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-emerald-100">Conta Corrente</span>
                            )}
                            {isQuitado ? (
                              <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-blue-100">Quitado</span>
                            ) : (
                              <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-emerald-100">Ativo</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-base uppercase tracking-tight">{loan.name}</h4>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">Devedor: {meta.loanDebtor || 'Não Informado'}</p>
                        </div>

                        {/* MODELO CONTA CORRENTE: saldo calculado com juros diários */}
                        {isOpenBalance && openBalanceInfo ? (
                          <div className="space-y-3">
                            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
                              <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Valor em Aberto Hoje</p>
                              <p className="text-2xl font-black text-emerald-700">{formatCurrency(openBalanceInfo.balance)}</p>
                              <p className="text-[10px] text-emerald-400 mt-1">Atualizado com juros até {new Date().toLocaleDateString('pt-BR')}</p>
                            </div>
                            <div className="text-[11px] text-slate-500 space-y-1.5">
                              <div className="flex justify-between">
                                <span>Principal original:</span>
                                <span className="font-bold text-slate-700">{formatCurrency(principal)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Total de juros acumulados:</span>
                                <span className="font-bold text-amber-600">{formatCurrency(openBalanceInfo.totalInterest)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Total já recebido:</span>
                                <span className="font-bold text-emerald-600">{formatCurrency(openBalanceInfo.totalPaid)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Taxa:</span>
                                <span className="font-bold text-slate-700">{rate}% a.m. ({meta.loanInterestType === 'COMPOUND' ? 'Compostos' : 'Simples'})</span>
                              </div>
                            </div>
                            {loanPayments.length > 0 && (
                              <div className="border-t border-slate-50 pt-3">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Histórico de Pagamentos</p>
                                <div className="space-y-1.5 max-h-24 overflow-y-auto">
                                  {loanPayments.map((p: any, i: number) => (
                                    <div key={i} className="flex justify-between text-[10px]">
                                      <span className="text-slate-400">{DateUtils.formatDisplayDate(p.date)}</span>
                                      <span className="font-bold text-emerald-600">+{formatCurrency(Number(p.amount))}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* MODELO PARCELADO FIXO: exibição original */
                          <>
                            <div className="space-y-2 pt-2">
                              <div className="flex justify-between text-xs font-black uppercase text-slate-400">
                                <span>Retorno do Principal</span>
                                <span>{progressPercent}% ({formatCurrency(returned)})</span>
                              </div>
                              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.min(progressPercent, 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Retorno do principal do empréstimo ${loan.name}`}>
                                <div className="bg-emerald-500 h-full transition-all" style={{ width: `${Math.min(progressPercent, 100)}%` }} />
                              </div>
                            </div>
                            <div className="pt-2 text-[11px] text-slate-500 space-y-2">
                              <div className="flex justify-between">
                                <span>Valor Principal:</span>
                                <span className="font-bold text-slate-800">{formatCurrency(principal)}</span>
                              </div>
                              <div className="flex justify-between font-semibold text-amber-600">
                                <span>Saldo Devedor Atual:</span>
                                <span>{formatCurrency(currentBalance)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Taxa de Juros:</span>
                                <span className="font-bold text-slate-800">
                                  {meta.loanInterestType === 'COMPOUND' ? 'Compostos' : 'Simples'}: {rate > 0 ? `${rate}% a.m.` : formatCurrency(fixedVal)}
                                </span>
                              </div>
                              {meta.loanDueDate && (
                                <div className="flex justify-between">
                                  <span>Data Recebimento:</span>
                                  <span className="font-bold text-slate-800">Todo dia {meta.loanDueDate}</span>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Botões de ação */}
                      <div className="border-t border-slate-50 pt-4 space-y-2">
                        {isOpenBalance && !isQuitado && (
                          <button
                            onClick={() => setLoanPaymentModal({
                              loan,
                              amount: '',
                              date: DateUtils.formatToISODate(),
                              accountId: allAccounts[0]?.id || '',
                              isSubmitting: false
                            })}
                            className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                          >
                            <Plus size={12} /> Registrar Pagamento
                          </button>
                        )}

                        {/* PDF e WhatsApp — disponível para empréstimos Conta Corrente */}
                        {isOpenBalance && (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={handleGeneratePDF}
                              className="py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-colors flex items-center justify-center gap-1.5"
                              title="Gerar extrato PDF completo com evolução de pagamentos"
                            >
                              <FileSpreadsheet size={12} /> Extrato PDF
                            </button>
                            <button
                              onClick={() => {
                                // Calcula saldo atual para a mensagem do WhatsApp
                                const pmts = getAssetLinkedTransactions(loan.id).filter((t: any) => t.type === 'INCOME');
                                const totalPaid = pmts.reduce((s: number, p: any) => s + Number(p.amount), 0);
                                const fmtW = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
                                const msg = encodeURIComponent(
                                  `🔔 *Zyvion — Extrato de Empréstimo*\n\n` +
                                  `Olá, ${meta.loanDebtor || 'prezado(a)'}!\n\n` +
                                  `Segue o resumo do seu empréstimo:\n` +
                                  `📋 *${loan.name}*\n` +
                                  `💰 Principal: ${fmtW(principal)}\n` +
                                  `📈 Taxa: ${rate}% a.m. (${meta.loanInterestType === 'COMPOUND' ? 'Compostos' : 'Simples'})\n` +
                                  `✅ Total pago: ${fmtW(totalPaid)}\n` +
                                  `📅 Atualizado em: ${new Date().toLocaleDateString('pt-BR')}\n\n` +
                                  `_Extrato gerado pelo Zyvion_`
                                );
                                window.open(`https://wa.me/?text=${msg}`, '_blank');
                              }}
                              className="py-2.5 bg-[#25D366] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#128C7E] transition-colors flex items-center justify-center gap-1.5"
                              title="Enviar resumo por WhatsApp"
                            >
                              <HandCoins size={12} /> WhatsApp
                            </button>
                          </div>
                        )}

                        <div className="flex justify-between items-center">
                          {!isOpenBalance && (
                            <button
                              onClick={() => { setSelectedAssetForExtrato(loan); setShowExtratoModal(true); }}
                              className="text-xs font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800 hover:underline"
                            >
                              Lançar Recebimentos
                            </button>
                          )}
                          {isOpenBalance && (
                            <button
                              onClick={() => { setSelectedAssetForExtrato(loan); setShowExtratoModal(true); }}
                              className="text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-indigo-600 hover:underline"
                            >
                              Ver Extrato
                            </button>
                          )}
                          <div className="flex gap-2 ml-auto">
                            <button onClick={() => openEditAsset(loan)} className="text-xs font-bold text-slate-600 hover:text-brand-600 uppercase tracking-widest">Editar</button>
                            <button onClick={() => handleDeleteAsset(loan)} className="text-xs font-bold text-slate-600 hover:text-rose-600 uppercase tracking-widest">Remover</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {activePhysicalAssets.filter(p => p.metadata?.isLoan).length === 0 && (
                  <div className="col-span-full py-12 border-2 border-dashed border-slate-100 rounded-[32px] flex flex-col items-center justify-center text-slate-300">
                    <ArrowRightLeft size={36} />
                    <p className="mt-4 font-black uppercase tracking-widest text-xs">Nenhum empréstimo cadastrado</p>
                    <p className="text-xs text-slate-400 mt-2 font-medium italic">Registre os valores emprestados para calcular os retornos de juros.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* INVESTMENTS VIEW */}
        {activeView === 'investments' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* BANK INVESTMENTS (BROKERS) SECTION */}
            <div className="space-y-6 pt-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-900 tracking-tight italic flex items-center gap-2">
                  <TrendingUp size={20} className="text-slate-500" />
                  Sua Carteira de Investimentos Financeiros
                </h3>
                <button
                  onClick={() => {
                    resetAssetForm();
                    setEditingAsset(null);
                    setFormData(prev => ({ ...prev, category: 'INVESTMENT', purpose: 'investimento' }));
                    setShowModal(true);
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-sm hover:bg-indigo-700 transition-colors"
                >
                  <Plus size={12} /> Novo Investimento
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {dynamicBrokers.map(broker => {
                  const brokerInvestments = enrichedPhysicalAssets.filter(
                    p => p.category === 'INVESTMENT' && p.metadata?.brokerAccountId === broker.id && p.metadata?.status !== 'RESGATADO'
                  );
                  const totalInvested = brokerInvestments.reduce((sum, inv) => sum + Number(inv.netValue || 0), 0);
                  const isCollapsed = !!collapsedBrokers[broker.id];

                  return (
                    <div key={broker.id} className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                      {/* Broker Header */}
                      <div 
                        className="p-8 space-y-4 cursor-pointer hover:bg-slate-50/50 transition-colors select-none"
                        onClick={() => setCollapsedBrokers(prev => ({ ...prev, [broker.id]: !prev[broker.id] }))}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                              <TrendingUp size={20} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-black text-slate-900 text-base uppercase tracking-tight">{broker.name}</h4>
                                {isCollapsed ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronUp size={14} className="text-slate-400" />}
                              </div>
                              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{brokerInvestments.length} ativo{brokerInvestments.length !== 1 ? 's' : ''} vinculado{brokerInvestments.length !== 1 ? 's' : ''}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-emerald-600">{formatCurrency(broker.balance)}</p>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Saldo Total</p>
                          </div>
                        </div>

                        {totalInvested > 0 && !isCollapsed && (
                          <div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-xl border border-indigo-100 animate-in fade-in duration-200">
                            <Check size={13} className="text-indigo-500 shrink-0" />
                            <span className="text-xs font-semibold text-indigo-700">
                              {formatCurrency(totalInvested)} em ativos líquidos (pós-impostos)
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Individual Investments List */}
                      {!isCollapsed && brokerInvestments.length > 0 && (
                        <div className="border-t border-slate-50 divide-y divide-slate-50 animate-in fade-in duration-300">
                          {brokerInvestments.map(inv => {
                            const invMeta = inv.metadata || {};
                            const investTypeLabel: Record<string, string> = {
                              'CDB': 'CDB', 'LCI_LCA': 'LCI/LCA', 'TESOURO': 'Tesouro',
                              'DEBENTURES': 'Debêntures', 'CRI_CRA': 'CRI/CRA', 'COE': 'COE',
                              'ACOES': 'Ações', 'FIIS': 'FIIs', 'FUNDOS': 'Fundos',
                              'CRIPTO': 'Cripto', 'PREVIDENCIA': 'Previdência', 'POUPANCA': 'Poupança', 'OUTROS': 'Outros'
                            };
                            const isAcumulado = invMeta.payoutType === 'ACUMULADO';
                            const isExpanded = !!expandedAssetIR[inv.id];
                            const purchase = Number(invMeta.purchaseValue) || Number(invMeta.initialInvestmentAmount) || Number(inv.estimatedValue || 0);
                            const profit = inv.grossYield !== undefined ? inv.grossYield : (Number(inv.estimatedValue || 0) - purchase);
                            const isExempt = !!invMeta.isTaxExempt || ['LCI_LCA', 'CRI_CRA', 'POUPANCA'].includes(invMeta.investmentType);
                            const taxAmt = inv.taxAmount || 0;
                            const taxRatePercent = (inv.taxRate || 0) * 100;
                            const days = inv.daysElapsed || 0;
                            const netVal = inv.netValue || Number(inv.estimatedValue || 0);

                            return (
                              <div key={inv.id} className="px-8 py-4 flex flex-col hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => toggleExpandIR(inv.id)}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                                    <div className="min-w-0 text-left">
                                      <p className="text-xs font-bold text-slate-800 truncate">{inv.name}</p>
                                      <p className="text-xs text-slate-400 font-medium">
                                        {investTypeLabel[invMeta.investmentType] || invMeta.investmentType || 'Investimento'}
                                        {invMeta.yieldRate ? ` · ${invMeta.yieldRate}` : ''}
                                        {' · '}
                                        <span className={isAcumulado ? 'text-indigo-500' : 'text-emerald-500'}>
                                          {isAcumulado ? '🔒 Acumulado' : '💰 Mensal'}
                                        </span>
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 shrink-0">
                                    <div className="text-right">
                                      <p className="text-xs font-black text-slate-900">{formatCurrency(Number(inv.estimatedValue || 0))}</p>
                                      {isExpanded ? (
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-0.5 justify-end mt-0.5">Ocultar IR <ChevronUp size={8} /></span>
                                      ) : (
                                        <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest flex items-center gap-0.5 justify-end mt-0.5">Detalhar IR <ChevronDown size={8} /></span>
                                      )}
                                    </div>
                                    <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        onClick={() => {
                                          setSelectedAssetForResgate(inv);
                                          setResgateForm({
                                            type: 'TOTAL',
                                            amount: '',
                                            destinationAccountId: inv.metadata?.brokerAccountId || ''
                                          });
                                          setShowResgateModal(true);
                                        }}
                                        className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition-colors flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-widest"
                                        title="Resgatar Ativo"
                                      >
                                        <HandCoins size={11} />
                                        <span className="hidden sm:inline">Resgatar</span>
                                      </button>
                                      <button
                                        onClick={() => openEditAsset(inv)}
                                        className="p-1 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-widest"
                                        title="Editar Ativo"
                                      >
                                        <Pencil size={11} />
                                        <span className="hidden sm:inline">Editar</span>
                                      </button>
                                      <button
                                        onClick={() => handleDeleteAsset(inv)}
                                        className="p-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded transition-colors flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-widest"
                                        title="Excluir Ativo"
                                      >
                                        <Trash2 size={11} />
                                        <span className="hidden sm:inline">Excluir</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                {isExpanded && (
                                  <div className="mt-3 px-6 py-4 bg-slate-50 rounded-2xl space-y-1.5 text-xs text-slate-500 font-semibold border border-slate-100/50 text-left animate-in slide-in-from-top-1 duration-200" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex justify-between">
                                      <span>Valor Bruto (Atual):</span>
                                      <span className="font-bold text-slate-700">{formatCurrency(Number(inv.estimatedValue || 0))}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Valor Aplicado (Custo):</span>
                                      <span className="font-bold text-slate-700">{formatCurrency(purchase)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Rendimento Bruto:</span>
                                      <span className={`font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                        {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
                                      </span>
                                    </div>
                                    {!isExempt && (
                                      <>
                                        {['ACOES', 'FIIS', 'CRIPTO'].includes(invMeta.investmentType) ? (
                                          <div className="flex justify-between text-indigo-600">
                                            <span>Regime de Tributação (Ganho de Capital):</span>
                                            <span className="font-bold">{invMeta.investmentType === 'FIIS' ? '20% (FIIs)' : '15% (Ações/Cripto)'}</span>
                                          </div>
                                        ) : (
                                          <div className="flex justify-between">
                                            <span>Prazo de Custódia:</span>
                                            <span className="font-bold text-slate-700">{days} dias (Alíquota de {taxRatePercent}%)</span>
                                          </div>
                                        )}
                                        {profit > 0 && (
                                          <div className="flex justify-between text-rose-600 font-bold">
                                            <span>Imposto de Renda Estimado:</span>
                                            <span className="font-black">
                                              - {formatCurrency(taxAmt)} 
                                              <span className="text-[10px] font-normal text-slate-400 ml-1">
                                                ({invMeta.investmentType === 'FIIS' ? '20% sobre lucro' : ['ACOES', 'CRIPTO'].includes(invMeta.investmentType) ? '15% sobre lucro' : `${taxRatePercent}% sobre lucro`})
                                              </span>
                                            </span>
                                          </div>
                                        )}
                                      </>
                                    )}
                                    {isExempt && (
                                      <div className="flex justify-between text-emerald-600 font-bold">
                                        <span>Imposto de Renda:</span>
                                        <span className="font-black">Isento de IR</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between border-t border-slate-200/60 pt-1.5 mt-1 text-slate-700 font-bold">
                                      <span>Valor Líquido de Resgate:</span>
                                      <span className="text-emerald-600 font-black">{formatCurrency(netVal)}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Add investment to this broker shortcut */}
                      {!isCollapsed && (
                        <div className="px-8 py-4 border-t border-slate-50">
                          <button
                            onClick={() => {
                              resetAssetForm();
                              setEditingAsset(null);
                              setFormData(prev => ({ ...prev, category: 'INVESTMENT', purpose: 'investimento', brokerAccountId: broker.id }));
                              setShowModal(true);
                            }}
                            className="text-xs font-bold text-indigo-500 hover:text-indigo-700 uppercase tracking-widest flex items-center gap-1"
                          >
                            <Plus size={10} /> Adicionar Ativo a {broker.name}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Card for investments without a broker */}
                {(() => {
                  const activeBrokerIds = new Set(brokers.map(b => b.id));
                  const unboundInvestments = enrichedPhysicalAssets.filter(
                    p => p.category === 'INVESTMENT' && (!p.metadata?.brokerAccountId || !activeBrokerIds.has(p.metadata.brokerAccountId)) && p.metadata?.status !== 'RESGATADO'
                  );
                  if (unboundInvestments.length === 0 && brokers.length > 0) return null;
                  const isCollapsed = !!collapsedBrokers.unbound;

                  return (
                    <div className="bg-white rounded-[32px] border border-dashed border-slate-200 shadow-sm overflow-hidden flex flex-col">
                      <div 
                        className="p-8 space-y-4 cursor-pointer hover:bg-slate-50/50 transition-colors select-none"
                        onClick={() => setCollapsedBrokers(prev => ({ ...prev, unbound: !prev.unbound }))}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center">
                              <TrendingUp size={20} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-black text-slate-600 text-base uppercase tracking-tight">Sem Corretora (Caixa Livre)</h4>
                                {isCollapsed ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronUp size={14} className="text-slate-400" />}
                              </div>
                              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{unboundInvestments.length} ativo{unboundInvestments.length !== 1 ? 's' : ''}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {!isCollapsed && unboundInvestments.length > 0 && (
                        <div className="border-t border-slate-50 divide-y divide-slate-50 animate-in fade-in duration-300">
                          {unboundInvestments.map(inv => {
                            const invMeta = inv.metadata || {};
                            const investTypeLabel: Record<string, string> = {
                              'CDB': 'CDB', 'LCI_LCA': 'LCI/LCA', 'TESOURO': 'Tesouro',
                              'DEBENTURES': 'Debêntures', 'CRI_CRA': 'CRI/CRA', 'COE': 'COE',
                              'ACOES': 'Ações', 'FIIS': 'FIIs', 'FUNDOS': 'Fundos',
                              'CRIPTO': 'Cripto', 'PREVIDENCIA': 'Previdência', 'POUPANCA': 'Poupança', 'OUTROS': 'Outros'
                            };
                            const isAcumulado = invMeta.payoutType === 'ACUMULADO';
                            const isExpanded = !!expandedAssetIR[inv.id];
                            const purchase = Number(invMeta.purchaseValue) || Number(invMeta.initialInvestmentAmount) || Number(inv.estimatedValue || 0);
                            const profit = inv.grossYield !== undefined ? inv.grossYield : (Number(inv.estimatedValue || 0) - purchase);
                            const isExempt = !!invMeta.isTaxExempt || ['LCI_LCA', 'CRI_CRA', 'POUPANCA'].includes(invMeta.investmentType);
                            const taxAmt = inv.taxAmount || 0;
                            const taxRatePercent = (inv.taxRate || 0) * 100;
                            const days = inv.daysElapsed || 0;
                            const netVal = inv.netValue || Number(inv.estimatedValue || 0);

                            return (
                              <div key={inv.id} className="px-8 py-4 flex flex-col hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => toggleExpandIR(inv.id)}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                                    <div className="min-w-0 text-left">
                                      <p className="text-xs font-bold text-slate-800 truncate">{inv.name}</p>
                                      <p className="text-xs text-slate-400 font-medium">
                                        {investTypeLabel[invMeta.investmentType] || invMeta.investmentType || 'Investimento'}
                                        {invMeta.yieldRate ? ` · ${invMeta.yieldRate}` : ''}
                                        {' · '}
                                        <span className={isAcumulado ? 'text-indigo-500' : 'text-emerald-500'}>
                                          {isAcumulado ? '🔒 Acumulado' : '💰 Mensal'}
                                        </span>
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 shrink-0">
                                    <div className="text-right">
                                      <p className="text-xs font-black text-slate-900">{formatCurrency(Number(inv.estimatedValue || 0))}</p>
                                      {isExpanded ? (
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-0.5 justify-end mt-0.5">Ocultar IR <ChevronUp size={8} /></span>
                                      ) : (
                                        <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest flex items-center gap-0.5 justify-end mt-0.5">Detalhar IR <ChevronDown size={8} /></span>
                                      )}
                                    </div>
                                    <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        onClick={() => {
                                          setSelectedAssetForResgate(inv);
                                          setResgateForm({
                                            type: 'TOTAL',
                                            amount: '',
                                            destinationAccountId: ''
                                          });
                                          setShowResgateModal(true);
                                        }}
                                        className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition-colors flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-widest"
                                        title="Resgatar Ativo"
                                      >
                                        <HandCoins size={11} />
                                        <span className="hidden sm:inline">Resgatar</span>
                                      </button>
                                      <button onClick={() => openEditAsset(inv)} className="p-1 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-widest"><Pencil size={11} /><span className="hidden sm:inline">Editar</span></button>
                                      <button onClick={() => handleDeleteAsset(inv)} className="p-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded transition-colors flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-widest"><Trash2 size={11} /><span className="hidden sm:inline">Excluir</span></button>
                                    </div>
                                  </div>
                                </div>

                                {isExpanded && (
                                  <div className="mt-3 px-6 py-4 bg-slate-50 rounded-2xl space-y-1.5 text-xs text-slate-500 font-semibold border border-slate-100/50 text-left animate-in slide-in-from-top-1 duration-200" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex justify-between">
                                      <span>Valor Bruto (Atual):</span>
                                      <span className="font-bold text-slate-700">{formatCurrency(Number(inv.estimatedValue || 0))}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Valor Aplicado (Custo):</span>
                                      <span className="font-bold text-slate-700">{formatCurrency(purchase)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Rendimento Bruto:</span>
                                      <span className={`font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                        {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
                                      </span>
                                    </div>
                                    {!isExempt && (
                                      <>
                                        {['ACOES', 'FIIS', 'CRIPTO'].includes(invMeta.investmentType) ? (
                                          <div className="flex justify-between text-indigo-600">
                                            <span>Regime de Tributação (Ganho de Capital):</span>
                                            <span className="font-bold">{invMeta.investmentType === 'FIIS' ? '20% (FIIs)' : '15% (Ações/Cripto)'}</span>
                                          </div>
                                        ) : (
                                          <div className="flex justify-between">
                                            <span>Prazo de Custódia:</span>
                                            <span className="font-bold text-slate-700">{days} dias (Alíquota de {taxRatePercent}%)</span>
                                          </div>
                                        )}
                                        {profit > 0 && (
                                          <div className="flex justify-between text-rose-600 font-bold">
                                            <span>Imposto de Renda Estimado:</span>
                                            <span className="font-black">
                                              - {formatCurrency(taxAmt)} 
                                              <span className="text-[10px] font-normal text-slate-400 ml-1">
                                                ({invMeta.investmentType === 'FIIS' ? '20% sobre lucro' : ['ACOES', 'CRIPTO'].includes(invMeta.investmentType) ? '15% sobre lucro' : `${taxRatePercent}% sobre lucro`})
                                              </span>
                                            </span>
                                          </div>
                                        )}
                                      </>
                                    )}
                                    {isExempt && (
                                      <div className="flex justify-between text-emerald-600 font-bold">
                                        <span>Imposto de Renda:</span>
                                        <span className="font-black">Isento de IR</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between border-t border-slate-200/60 pt-1.5 mt-1 text-slate-700 font-bold">
                                      <span>Valor Líquido de Resgate:</span>
                                      <span className="text-emerald-600 font-black">{formatCurrency(netVal)}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      
                      {!isCollapsed && (
                        <div className="px-8 py-4 border-t border-slate-50">
                          <button
                            onClick={() => {
                              resetAssetForm();
                              setEditingAsset(null);
                              setFormData(prev => ({ ...prev, category: 'INVESTMENT', purpose: 'investimento', brokerAccountId: '' }));
                              setShowModal(true);
                            }}
                            className="text-xs font-bold text-slate-400 hover:text-indigo-600 uppercase tracking-widest flex items-center gap-1"
                          >
                            <Plus size={10} /> Adicionar Investimento Avulso
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* CONSORTIUMS VIEW */}
        {activeView === 'consortiums' && (
          <ConsortiumSection />
        )}

        {/* LIABILITIES VIEW */}
        {activeView === 'liabilities' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight italic flex items-center gap-2">
                <Landmark size={20} className="text-slate-500" />
                Sua Carteira de Passivos e Financiamentos
              </h3>
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500/20"
                  checked={showArchivedLiabilities}
                  onChange={(e) => setShowArchivedLiabilities(e.target.checked)}
                />
                Exibir passivos arquivados
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {liabilities.filter(l => showArchivedLiabilities ? true : !l.is_archived).map(liability => {
                const paidAmount = Math.max(0, liability.totalAmount - liability.remainingBalance);
                const amortizationPercent = liability.totalAmount > 0 
                  ? Math.min(100, Math.max(0, Math.round((paidAmount / liability.totalAmount) * 100))) 
                  : 0;
                const linkedAsset = liability.linkedAssetId 
                  ? physicalAssets.find(p => p.id === liability.linkedAssetId) 
                  : null;
                const ltvPercent = (linkedAsset && linkedAsset.estimatedValue > 0) 
                  ? Math.round((liability.remainingBalance / linkedAsset.estimatedValue) * 100) 
                  : null;

                return (
                  <div key={liability.id} className={`bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-xl transition-all duration-500 flex flex-col justify-between ${liability.is_archived ? 'opacity-65' : ''}`}>
                    <div className="p-8 space-y-6">
                      <div className="flex justify-between items-start">
                        <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center shadow-lg shadow-red-100/50">
                          <Landmark size={22} />
                        </div>
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          {liability.is_archived && (
                            <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-amber-100">Arquivado</span>
                          )}
                          {liability.remainingBalance === 0 ? (
                            <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-emerald-100">Quitada</span>
                          ) : (
                            <span className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-red-100">Dívida Ativa</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-black text-slate-900 text-lg tracking-tight leading-tight italic uppercase">{liability.name}</h4>
                        <div className="flex justify-between items-center mt-3 border-b border-slate-50 pb-2">
                          <p className="text-xs text-slate-400 font-black uppercase tracking-widest">Saldo Devedor Atual:</p>
                          <p className={`text-sm font-black ${liability.remainingBalance === 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(liability.remainingBalance)}</p>
                        </div>
                      </div>

                      <div className="space-y-4 text-[11px] text-slate-500">
                        {liability.installmentAmount ? (
                          <div className="flex justify-between">
                            <span>Prestação Mensal:</span>
                            <span className="font-bold text-slate-800">
                              {formatCurrency(liability.installmentAmount)}
                              {liability.installmentsRemaining && ` (${liability.installmentsRemaining}x restante)`}
                            </span>
                          </div>
                        ) : (
                          <div className="flex justify-between">
                            <span>Prestação Mensal:</span>
                            <span className="font-bold text-slate-400 italic">Não definida</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold">
                          <span>Original Total:</span>
                          <span className="text-slate-700">{formatCurrency(liability.totalAmount)}</span>
                        </div>

                        {/* Amortization Progress Bar */}
                        <div className="space-y-1.5 pt-3 border-t border-slate-50">
                          <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
                            <span>Progresso da Dívida:</span>
                            <span className={`${liability.remainingBalance === 0 ? 'text-emerald-600' : 'text-red-500'} font-extrabold`}>{amortizationPercent}% quitado</span>
                          </div>
                          <div 
                            className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden"
                            role="progressbar"
                            aria-valuenow={amortizationPercent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`Progresso de amortização da dívida ${liability.name}`}
                          >
                            <div 
                              className={`${liability.remainingBalance === 0 ? 'bg-emerald-500' : 'bg-red-500'} h-full rounded-full transition-all duration-500`} 
                              style={{ width: `${amortizationPercent}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-slate-400 font-medium italic">
                            <span>Pago: {formatCurrency(paidAmount)}</span>
                            <span>Total: {formatCurrency(liability.totalAmount)}</span>
                          </div>
                        </div>

                        {/* Linked Asset & LTV Indicator */}
                        {linkedAsset && (
                          <div className="bg-slate-50 rounded-2xl p-3.5 space-y-2 border border-slate-100">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-400 font-bold uppercase tracking-wider">Bem Vinculado:</span>
                              <span className="font-extrabold text-slate-700 truncate max-w-[120px]" title={linkedAsset.name}>
                                {linkedAsset.name}
                              </span>
                            </div>
                            {ltvPercent !== null && (
                              <div className="flex justify-between items-center text-xs border-t border-slate-200/60 pt-1.5">
                                <span className="text-slate-400 font-bold uppercase tracking-wider">Índice LTV:</span>
                                <span className={`font-black px-1.5 py-0.5 rounded-md text-xs ${
                                  ltvPercent > 80 
                                    ? 'bg-red-50 text-red-600 border border-red-100' 
                                    : ltvPercent > 50 
                                      ? 'bg-amber-50 text-amber-600 border border-amber-100' 
                                      : 'bg-green-50 text-green-600 border border-green-100'
                                }`}>
                                  {ltvPercent}% (Dívida/Bem)
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-wrap justify-between items-center gap-3">
                      <button 
                        onClick={() => setSelectedLiabilityForExtrato(liability)} 
                        className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-600 hover:text-brand-600 transition-colors"
                        aria-label={`Ver extrato e lançamentos de ${liability.name}`}
                      >
                        <History size={12} />
                        Extrato &amp; Lançar
                      </button>
                      <div className="flex gap-3 items-center">
                        {!liability.is_archived && (
                          <button 
                            onClick={() => openEditLiability(liability)} 
                            className="text-xs font-black uppercase tracking-wider text-slate-500 hover:text-brand-600 transition-colors"
                            aria-label={`Ajustar passivo ${liability.name}`}
                          >
                            Ajustar
                          </button>
                        )}
                        {liability.is_archived ? (
                          <button 
                            onClick={() => handleUnarchiveLiability(liability)} 
                            className="text-xs font-black uppercase tracking-wider text-emerald-600 hover:text-emerald-700 transition-colors"
                            aria-label={`Desarquivar passivo ${liability.name}`}
                          >
                            Desarquivar
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleArchiveLiability(liability)} 
                            className="text-xs font-black uppercase tracking-wider text-slate-500 hover:text-amber-600 transition-colors"
                            aria-label={`Arquivar passivo ${liability.name}`}
                          >
                            Arquivar
                          </button>
                        )}
                        <button 
                          onClick={() => handleDeleteLiability(liability.id)} 
                          className="text-slate-400 hover:text-rose-600 transition-colors"
                          aria-label={`Excluir passivo ${liability.name}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              <button
                onClick={() => {
                  setLiabilityFormData({
                    name: '',
                    type: 'PERSONAL_LOAN',
                    totalAmount: '',
                    remainingBalance: '',
                    interestRate: '',
                    installmentAmount: '',
                    installmentsRemaining: '',
                    dueDay: '10',
                    linkedAssetId: '',
                    indexationRate: '',
                    amortizationType: 'SAC',
                    indexType: 'FIXED',
                    firstInstallmentDate: '',
                    balloonMonth: '',
                    balloonYear: '',
                    balloonAmount: '',
                    balloons: [],
                    propertyType: 'PLANTA',
                    hasHistoricalPayments: false,
                    historicalCalculationType: 'calculated',
                    historicalInstallmentsPaid: '',
                    historicalInstallmentValue: '',
                    historicalPaidAmount: ''
                  });
                  setEditingLiability(null);
                  setShowLiabilityModal(true);
                }}
                className="rounded-[32px] border-2 border-dashed border-red-100 p-8 flex flex-col items-center justify-center gap-4 text-red-300 hover:border-red-300 hover:text-red-500 hover:bg-red-50/30 transition-all min-h-[250px]"
              >
                <Plus size={32} />
                <span className="font-bold text-red-400">Novo Passivo / Dívida</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: NEW PHYSICAL ASSET OVERHAUL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-black text-slate-900 uppercase tracking-tight">
                {formData.isLoan 
                  ? (editingAsset ? 'Editar Empréstimo Concedido' : 'Novo Empréstimo Concedido') 
                  : (editingAsset ? 'Editar Ativo Físico' : 'Novo Ativo Físico')}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-50">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveAsset} className="flex flex-col max-h-[80vh] overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                <div>
                  <label htmlFor="asset-name-field" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {formData.isLoan ? 'Identificação do Empréstimo (ex: Empréstimo João)' : 'Identificação do Bem'}
                  </label>
                  <input
                    id="asset-name-field"
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                    placeholder={formData.isLoan ? 'Ex: Empréstimo João' : 'Ex: Jeep Compass'}
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                {formData.category === 'OTHER' && (
                  <div className="space-y-4 pt-1 animate-in fade-in">
                    <div>
                      <label htmlFor="other-icon-selector" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Ícone do Ativo</label>
                      <select
                        id="other-icon-selector"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                        value={formData.iconKey || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, iconKey: e.target.value }))}
                      >
                        <option value="">Detecção Automática (baseada no nome)</option>
                        <option value="Box">📦 Geral (Caixa)</option>
                        <option value="Gem">💎 Joias, Metais & Pedras Preciosas</option>
                        <option value="Watch">⌚ Relógios & Acessórios de Luxo</option>
                        <option value="Palette">🎨 Obras de Arte, Quadros & Esculturas</option>
                        <option value="Award">🏆 Consórcios & Prêmios</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Sugestões de Nome (Clique para selecionar, 'X' para remover)</label>
                      <div className="flex flex-wrap gap-2 items-center">
                        {suggestedNames.map((sugName, index) => (
                          <span
                            key={index}
                            onClick={() => setFormData(prev => ({ ...prev, name: sugName }))}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer hover:bg-slate-100 hover:border-slate-300 transition-all active:scale-95"
                          >
                            {sugName}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const newSuggestions = suggestedNames.filter((_, i) => i !== index);
                                setSuggestedNames(newSuggestions);
                                localStorage.setItem('finvision_other_asset_suggestions', JSON.stringify(newSuggestions));
                              }}
                              className="text-slate-400 hover:text-rose-500 rounded-full hover:bg-slate-200 p-1 transition-colors"
                              aria-label={`Remover sugestão ${sugName}`}
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const newName = prompt('Digite a nova sugestão de ativo físico:');
                            if (newName && newName.trim()) {
                              const updated = [...suggestedNames, newName.trim()];
                              setSuggestedNames(updated);
                              localStorage.setItem('finvision_other_asset_suggestions', JSON.stringify(updated));
                            }
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 border border-dashed border-slate-300 text-slate-400 hover:text-brand-600 hover:border-brand-500 text-xs font-bold rounded-xl transition-all"
                          aria-label="Nova sugestão de nome de ativo"
                        >
                          <Plus size={12} /> Novo
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              {/* Category & Value - Hide for Real Estate edit, edit in Evolution card instead */}
              {(!editingAsset || editingAsset.category !== 'REAL_ESTATE') && !formData.isLoan && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Categoria</label>
                    <select
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                    >
                      <option value="REAL_ESTATE">Imóvel</option>
                      <option value="VEHICLE">Veículo</option>
                      <option value="INVESTMENT">Investimento Financeiro</option>
                      <option value="OTHER">Outros Bens</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                      {formData.category === 'INVESTMENT' ? 'Saldo Bruto Atual (R$)' : 'Valor Estimado Atual (R$)'}
                    </label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                      placeholder="0.00"
                      value={formData.estimatedValue}
                      onChange={(e) => setFormData({ ...formData, estimatedValue: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {/* Acquisition Date & Purchase Value - Hide for Real Estate edit */}
              {(!editingAsset || editingAsset.category !== 'REAL_ESTATE') && !formData.isLoan && (
                <div className="grid grid-cols-2 gap-4 border-t border-slate-50 pt-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                      {formData.category === 'INVESTMENT' ? 'Data de Aplicação' : 'Data de Aquisição'}
                    </label>
                    <input
                      type="date"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                      value={formData.acquisitionDate}
                      onChange={(e) => setFormData({ ...formData, acquisitionDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                      {formData.category === 'INVESTMENT' ? 'Valor Aplicado (Custo) (R$)' : 'Valor Aquisição (R$)'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                      placeholder="0.00"
                      value={formData.purchaseValue}
                      onChange={(e) => setFormData({ ...formData, purchaseValue: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {/* Advanced Classification: Uso vs Investimento */}
              <div className="bg-slate-50 rounded-2xl p-4 space-y-4 border border-slate-200">
                {formData.category !== 'INVESTMENT' && !formData.isLoan && (
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-xs">
                      <input
                        type="radio"
                        name="purpose"
                        checked={formData.purpose === 'uso'}
                        onChange={() => setFormData({ ...formData, purpose: 'uso', isLoan: false })}
                      />
                      Uso Pessoal
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-xs">
                      <input
                        type="radio"
                        name="purpose"
                        checked={formData.purpose === 'investimento'}
                        onChange={() => setFormData({ ...formData, purpose: 'investimento' })}
                      />
                      Investimento / Negócio
                    </label>
                  </div>
                )}

                {formData.category === 'VEHICLE' && (
                  <div className="space-y-4 animate-in slide-in-from-top-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Tipo de Veículo</label>
                        <select
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                          value={formData.vehicleType}
                          onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value as any })}
                        >
                          <option value="CAR">Carro</option>
                          <option value="MOTORCYCLE">Moto</option>
                          <option value="TRUCK">Caminhão</option>
                          <option value="OTHER">Outro</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Custo de Transferência (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                          value={formData.transferFee}
                          onChange={(e) => setFormData({ ...formData, transferFee: e.target.value })}
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Placa</label>
                        <input
                          type="text"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-brand-500/20"
                          value={formData.licensePlate || ''}
                          onChange={(e) => setFormData({ ...formData, licensePlate: e.target.value })}
                          placeholder="ABC1D23"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Renavam</label>
                        <input
                          type="text"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20"
                          value={formData.renavam || ''}
                          onChange={(e) => setFormData({ ...formData, renavam: e.target.value })}
                          placeholder="00000000000"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Ano / Modelo</label>
                        <input
                          type="text"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20"
                          value={formData.yearModel || ''}
                          onChange={(e) => setFormData({ ...formData, yearModel: e.target.value })}
                          placeholder="2023/2024"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Quilometragem</label>
                        <input
                          type="number"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20"
                          value={formData.mileage || ''}
                          onChange={(e) => setFormData({ ...formData, mileage: e.target.value })}
                          placeholder="Ex: 50000"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Valor Tabela FIPE Atual (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20"
                        placeholder="FIPE Atual"
                        value={formData.fipeValue}
                        onChange={(e) => setFormData({ ...formData, fipeValue: e.target.value })}
                      />
                    </div>

                    <div className="space-y-3 pt-3 border-t border-dashed border-slate-200">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Consórcio Vinculado (opcional)</label>
                        <select
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20"
                          value={formData.selectedConsortiumId}
                          onChange={(e) => setFormData({ ...formData, selectedConsortiumId: e.target.value })}
                        >
                          <option value="">-- Nenhum --</option>
                          {activeLiabilities.filter(l => l.type === 'CONSORTIUM').map(l => (
                            <option key={l.id} value={l.id}>{l.name} (Saldo: {formatCurrency(l.remainingBalance)})</option>
                          ))}
                        </select>
                      </div>
                      {formData.selectedConsortiumId && (
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Percentual Alocado ao Veículo (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                            value={formData.consortiumAllocationRatio}
                            onChange={(e) => setFormData({ ...formData, consortiumAllocationRatio: e.target.value })}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {formData.category === 'VEHICLE' && formData.purpose === 'uso' && (
                  <div className="space-y-4 pt-3 border-t border-dashed border-slate-200 animate-in slide-in-from-top-2">
                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Despesas Periódicas Estimadas</p>
                    <div className="grid grid-cols-2 gap-4">
                      {/* IPVA Group */}
                      <div className="col-span-2 bg-slate-50/50 p-3 rounded-xl border border-slate-200/60 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Custo Estimado IPVA (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.ipvaFee}
                              onChange={(e) => setFormData({ ...formData, ipvaFee: e.target.value })}
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pagamento IPVA</label>
                            <select
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.ipvaPaymentMethod}
                              onChange={(e) => setFormData({ ...formData, ipvaPaymentMethod: e.target.value as any })}
                            >
                              <option value="PARCELADO">Parcelado</option>
                              <option value="A_VISTA">À Vista (1x)</option>
                            </select>
                          </div>
                        </div>
                        {formData.ipvaPaymentMethod === 'PARCELADO' && (
                          <div className="animate-in slide-in-from-top-2">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quantidade de Parcelas IPVA</label>
                            <input
                              type="number"
                              min="1"
                              max="12"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.ipvaInstallmentsCount}
                              onChange={(e) => setFormData({ ...formData, ipvaInstallmentsCount: e.target.value })}
                              placeholder="5"
                            />
                          </div>
                        )}
                      </div>

                      {/* Seguro Group */}
                      <div className="col-span-2 bg-slate-50/50 p-3 rounded-xl border border-slate-200/60 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Custo Estimado Seguro (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.seguroFee}
                              onChange={(e) => setFormData({ ...formData, seguroFee: e.target.value })}
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pagamento Seguro</label>
                            <select
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.seguroPaymentMethod}
                              onChange={(e) => setFormData({ ...formData, seguroPaymentMethod: e.target.value as any })}
                            >
                              <option value="PARCELADO">Parcelado</option>
                              <option value="RECORRENTE">Mensal Recorrente</option>
                              <option value="A_VISTA">Anual (À Vista 1x)</option>
                            </select>
                          </div>
                        </div>
                        {formData.seguroPaymentMethod === 'PARCELADO' && (
                          <div className="animate-in slide-in-from-top-2">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quantidade de Parcelas Seguro</label>
                            <input
                              type="number"
                              min="1"
                              max="12"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.seguroInstallmentsCount}
                              onChange={(e) => setFormData({ ...formData, seguroInstallmentsCount: e.target.value })}
                              placeholder="10"
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Licenciamento Anual (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                          value={formData.licenciamentoFee}
                          onChange={(e) => setFormData({ ...formData, licenciamentoFee: e.target.value })}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Manutenção Mensal (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                          value={formData.maintenanceMonthlyEstimated}
                          onChange={(e) => setFormData({ ...formData, maintenanceMonthlyEstimated: e.target.value })}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {formData.category === 'VEHICLE' && formData.purpose === 'investimento' && (
                  <div className="space-y-4 pt-3 border-t border-dashed border-slate-200 animate-in slide-in-from-top-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Modalidade do Investimento</label>
                      <select
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                        value={formData.vehiclePurposeType}
                        onChange={(e) => setFormData({ ...formData, vehiclePurposeType: e.target.value as any })}
                      >
                        <option value="RENTAL">Locação / Aluguel (Fluxo de Caixa)</option>
                        <option value="FLIP">Compra e Venda / Revenda (Flip)</option>
                      </select>
                    </div>

                    {formData.vehiclePurposeType === 'RENTAL' ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tipo de Aluguel</label>
                            <select
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.rentalType}
                              onChange={(e) => setFormData({ ...formData, rentalType: e.target.value as any })}
                            >
                              <option value="anual">Mensal / Assinatura</option>
                              <option value="short_stay">Diário / Plataforma</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Receita de Aluguel (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.rentalIncome}
                              onChange={(e) => setFormData({ ...formData, rentalIncome: e.target.value })}
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Taxa Plataforma (R$ ou %)</label>
                            <input
                              type="number"
                              step="0.01"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.rentalPlatformFee}
                              onChange={(e) => setFormData({ ...formData, rentalPlatformFee: e.target.value })}
                              placeholder="0.00"
                            />
                          </div>
                          {/* IPVA Group */}
                          <div className="col-span-2 bg-slate-50/50 p-3 rounded-xl border border-slate-200/60 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Custo IPVA (R$)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                                  value={formData.ipvaFee}
                                  onChange={(e) => setFormData({ ...formData, ipvaFee: e.target.value })}
                                  placeholder="0.00"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pagamento IPVA</label>
                                <select
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                                  value={formData.ipvaPaymentMethod}
                                  onChange={(e) => setFormData({ ...formData, ipvaPaymentMethod: e.target.value as any })}
                                >
                                  <option value="PARCELADO">Parcelado</option>
                                  <option value="A_VISTA">À Vista (1x)</option>
                                </select>
                              </div>
                            </div>
                            {formData.ipvaPaymentMethod === 'PARCELADO' && (
                              <div className="animate-in slide-in-from-top-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quantidade de Parcelas IPVA</label>
                                <input
                                  type="number"
                                  min="1"
                                  max="12"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                                  value={formData.ipvaInstallmentsCount}
                                  onChange={(e) => setFormData({ ...formData, ipvaInstallmentsCount: e.target.value })}
                                  placeholder="5"
                                />
                              </div>
                            )}
                          </div>

                          {/* Seguro Group */}
                          <div className="col-span-2 bg-slate-50/50 p-3 rounded-xl border border-slate-200/60 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Seguro Comercial (R$)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                                  value={formData.seguroFee}
                                  onChange={(e) => setFormData({ ...formData, seguroFee: e.target.value })}
                                  placeholder="0.00"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pagamento Seguro</label>
                                <select
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                                  value={formData.seguroPaymentMethod}
                                  onChange={(e) => setFormData({ ...formData, seguroPaymentMethod: e.target.value as any })}
                                >
                                  <option value="PARCELADO">Parcelado</option>
                                  <option value="RECORRENTE">Mensal Recorrente</option>
                                  <option value="A_VISTA">Anual (À Vista 1x)</option>
                                </select>
                              </div>
                            </div>
                            {formData.seguroPaymentMethod === 'PARCELADO' && (
                              <div className="animate-in slide-in-from-top-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quantidade de Parcelas Seguro</label>
                                <input
                                  type="number"
                                  min="1"
                                  max="12"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                                  value={formData.seguroInstallmentsCount}
                                  onChange={(e) => setFormData({ ...formData, seguroInstallmentsCount: e.target.value })}
                                  placeholder="10"
                                />
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Licenciamento Anual (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.licenciamentoFee}
                              onChange={(e) => setFormData({ ...formData, licenciamentoFee: e.target.value })}
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Preço Venda Alvo (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                            value={formData.targetSaleValue}
                            onChange={(e) => setFormData({ ...formData, targetSaleValue: e.target.value })}
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Orçamento Preparação (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                            value={formData.preparationBudget}
                            onChange={(e) => setFormData({ ...formData, preparationBudget: e.target.value })}
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {formData.category === 'OTHER' && formData.purpose === 'investimento' && (
                  <div className="space-y-4 pt-3 border-t border-dashed border-slate-200 animate-in slide-in-from-top-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Modalidade do Investimento</label>
                      <select
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                        value={formData.vehiclePurposeType}
                        onChange={(e) => setFormData({ ...formData, vehiclePurposeType: e.target.value as any })}
                      >
                        <option value="RENTAL">Locação / Rendimento Periódico</option>
                        <option value="FLIP">Compra e Venda / Revenda (Flip)</option>
                      </select>
                    </div>

                    {formData.vehiclePurposeType === 'RENTAL' ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="flex items-center gap-2 cursor-pointer font-bold text-xs select-none mb-2 mt-2">
                              <input
                                type="checkbox"
                                checked={formData.isRented}
                                onChange={(e) => setFormData({ ...formData, isRented: e.target.checked })}
                              />
                              Ativo Locado / Rendendo?
                            </label>
                          </div>
                          {formData.isRented && (
                            <div>
                              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Rendimento/Aluguel Mensal (R$)</label>
                              <input
                                type="number"
                                step="0.01"
                                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                                value={formData.rentalIncome}
                                onChange={(e) => setFormData({ ...formData, rentalIncome: e.target.value })}
                                placeholder="0.00"
                              />
                            </div>
                          )}
                          {formData.isRented && (
                            <>
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Taxa Intermediação/Plataforma (R$)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                                  value={formData.rentalPlatformFee}
                                  onChange={(e) => setFormData({ ...formData, rentalPlatformFee: e.target.value })}
                                  placeholder="0.00"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Custo Mensal Guarda/Seguro (R$)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                                  value={formData.maintenanceMonthlyEstimated}
                                  onChange={(e) => setFormData({ ...formData, maintenanceMonthlyEstimated: e.target.value })}
                                  placeholder="0.00"
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Preço Venda Alvo (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                            value={formData.targetSaleValue}
                            onChange={(e) => setFormData({ ...formData, targetSaleValue: e.target.value })}
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Orçamento Preparação/Restauração (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                            value={formData.preparationBudget}
                            onChange={(e) => setFormData({ ...formData, preparationBudget: e.target.value })}
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {editingAsset && !formData.isLoan && (
                  <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 border-t border-slate-200 pt-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Taxa de Corretagem (R$)</label>
                      <input
                        type="number"
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold"
                        value={formData.brokerFee}
                        onChange={(e) => setFormData({ ...formData, brokerFee: e.target.value })}
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-xs select-none pt-6">
                      <input
                        type="checkbox"
                        checked={formData.isSold}
                        onChange={(e) => setFormData({ ...formData, isSold: e.target.checked })}
                      />
                      Marcar como Vendido
                    </label>

                    {formData.isSold && (
                      <div className="col-span-2 space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Valor Venda (R$)</label>
                            <input
                              type="number"
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold"
                              value={formData.soldValue}
                              onChange={(e) => setFormData({ ...formData, soldValue: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Comissão de Venda (R$)</label>
                            <input
                              type="number"
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold"
                              value={formData.saleCommission}
                              onChange={(e) => setFormData({ ...formData, saleCommission: e.target.value })}
                              placeholder="0.00"
                            />
                          </div>
                        </div>

                        {true && (
                          <div className="space-y-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Forma de Recebimento</label>
                              <select
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                                value={formData.salePaymentMethod}
                                onChange={(e) => setFormData({ ...formData, salePaymentMethod: e.target.value as any })}
                              >
                                <option value="A_VISTA">À Vista (Dinheiro/PIX)</option>
                                <option value="PARCELADO">Parcelado (Contas a Receber)</option>
                                <option value="PERMUTA">Permuta Integral (Troca de Bens)</option>
                                <option value="HIBRIDO">Híbrido (Parte Dinheiro, Parte Permuta)</option>
                              </select>
                            </div>

                            {formData.salePaymentMethod === 'A_VISTA' && (
                              <div className="animate-in slide-in-from-top-2">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Data de Recebimento</label>
                                <input
                                  type="date"
                                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20"
                                  value={formData.saleDate}
                                  onChange={(e) => setFormData({ ...formData, saleDate: e.target.value })}
                                />
                              </div>
                            )}

                            {formData.salePaymentMethod === 'HIBRIDO' && (
                              <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                                <div>
                                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Valor em Dinheiro (R$)</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20"
                                    value={formData.saleCashAmount}
                                    onChange={(e) => setFormData({ ...formData, saleCashAmount: e.target.value })}
                                    placeholder="0.00"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Data do Recebimento</label>
                                  <input
                                    type="date"
                                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20"
                                    value={formData.saleDate}
                                    onChange={(e) => setFormData({ ...formData, saleDate: e.target.value })}
                                  />
                                </div>
                              </div>
                            )}

                            {(formData.salePaymentMethod === 'PERMUTA' || formData.salePaymentMethod === 'HIBRIDO') && (
                              <div className="space-y-3 pt-2 border-t border-dashed border-slate-200">
                                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Bens Recebidos na Permuta</p>
                                
                                {formData.permutaItems && formData.permutaItems.map((item, idx) => (
                                  <div key={idx} className="grid grid-cols-12 gap-2 bg-white p-3 rounded-xl border border-slate-100 items-end">
                                    <div className="col-span-3">
                                      <label className="block text-[10px] font-bold text-slate-400 mb-1">Tipo</label>
                                      <select
                                        className="w-full h-8 px-1.5 bg-slate-50 border rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20"
                                        value={item.type}
                                        onChange={(e) => {
                                          const newItems = [...formData.permutaItems];
                                          newItems[idx].type = e.target.value as any;
                                          setFormData({ ...formData, permutaItems: newItems });
                                        }}
                                      >
                                        <option value="VEHICLE">Veículo</option>
                                        <option value="REAL_ESTATE">Imóvel</option>
                                        <option value="OTHER">Outro Bem</option>
                                      </select>
                                    </div>
                                    
                                    <div className="col-span-5">
                                      <label className="block text-[10px] font-bold text-slate-400 mb-1">Nome / Descrição</label>
                                      <input
                                        className="w-full h-8 px-2 bg-slate-50 border rounded-lg text-xs"
                                        value={item.name}
                                        onChange={(e) => {
                                          const newItems = [...formData.permutaItems];
                                          newItems[idx].name = e.target.value;
                                          setFormData({ ...formData, permutaItems: newItems });
                                        }}
                                        placeholder={
                                          item.type === 'VEHICLE'
                                            ? 'Ex: Fiat Uno 2012'
                                            : item.type === 'REAL_ESTATE'
                                            ? 'Ex: Terreno Condomínio'
                                            : 'Ex: Cota Consórcio'
                                        }
                                      />
                                    </div>

                                    <div className="col-span-3">
                                      <label className="block text-[10px] font-bold text-slate-400 mb-1">Valor (R$)</label>
                                      <input
                                        type="number"
                                        className="w-full h-8 px-2 bg-slate-50 border rounded-lg text-xs font-bold"
                                        value={item.value}
                                        onChange={(e) => {
                                          const newItems = [...formData.permutaItems];
                                          newItems[idx].value = e.target.value;
                                          setFormData({ ...formData, permutaItems: newItems });
                                        }}
                                        placeholder="0.00"
                                      />
                                    </div>

                                    <div className="col-span-1 flex justify-center pb-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newItems = formData.permutaItems.filter((_, i) => i !== idx);
                                          setFormData({ ...formData, permutaItems: newItems });
                                        }}
                                        className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </div>
                                ))}

                                <button
                                  type="button"
                                  onClick={() => {
                                    const newItems = [
                                      ...(formData.permutaItems || []),
                                      { type: 'VEHICLE' as const, name: '', value: '' }
                                    ];
                                    setFormData({ ...formData, permutaItems: newItems });
                                  }}
                                  className="w-full h-9 border border-dashed border-slate-300 rounded-xl text-xs font-bold text-slate-500 hover:border-brand-500 hover:text-brand-600 transition-all flex items-center justify-center gap-1.5"
                                >
                                  <Plus size={12} />
                                  Adicionar Bem Recebido
                                </button>
                              </div>
                            )}

                          </div>
                        )}

                      </div>
                    )}
                  </div>
                )}

                {formData.category === 'REAL_ESTATE' && (
                  <div className="space-y-4 pt-2 border-t border-slate-200 animate-in slide-in-from-top-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Estágio do Imóvel</label>
                        <select
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                          value={formData.propertyStage}
                          onChange={(e) => setFormData({ ...formData, propertyStage: e.target.value as any, isRented: false })}
                        >
                          <option value="PRONTO">Pronto</option>
                          <option value="PLANTA">Na Planta (Em Construção)</option>
                        </select>
                      </div>
                      {formData.propertyStage === 'PRONTO' && formData.purpose === 'investimento' && (
                        <label className="flex items-center gap-2 cursor-pointer font-bold text-xs select-none pt-6">
                          <input
                            type="checkbox"
                            checked={formData.isRented}
                            onChange={(e) => setFormData({ ...formData, isRented: e.target.checked })}
                          />
                          Está Alugado?
                        </label>
                      )}
                    </div>

                    {formData.propertyStage === 'PLANTA' && (
                      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-dashed border-slate-200 animate-in slide-in-from-top-2">
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Índice Correção Construtora</label>
                          <select
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20"
                            value={formData.constructorIndexType}
                            onChange={(e) => setFormData({ ...formData, constructorIndexType: e.target.value as any })}
                          >
                            <option value="INCC">INCC</option>
                            <option value="IPCA">IPCA</option>
                            <option value="IGP-M">IGP-M</option>
                            <option value="FIXED">Fixo (Sem reajuste)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Projeção Reajuste (% am)</label>
                          <input
                            type="number"
                            step="0.01"
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900"
                            value={formData.constructorIndexRate}
                            onChange={(e) => setFormData({ ...formData, constructorIndexRate: e.target.value })}
                          />
                        </div>
                      </div>
                    )}

                    {formData.propertyStage === 'PRONTO' && formData.purpose === 'investimento' && formData.isRented && (
                      <div className="space-y-3 pt-2 border-t border-dashed border-slate-200 animate-in slide-in-from-top-2">
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de Aluguel</label>
                            <select
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                              value={formData.rentalType}
                              onChange={(e) => setFormData({ ...formData, rentalType: e.target.value as any })}
                            >
                              <option value="anual">Locação Anual</option>
                              <option value="short_stay">Short Stay (Temporada)</option>
                            </select>
                          </div>
                          {formData.rentalType === 'anual' ? (
                            <>
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor Aluguel (R$)</label>
                                <input
                                  type="number"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                                  value={formData.rentalIncome}
                                  onChange={(e) => setFormData({ ...formData, rentalIncome: e.target.value })}
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Inicial</label>
                                <input
                                  type="date"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                                  value={formData.rentalDate}
                                  onChange={(e) => setFormData({ ...formData, rentalDate: e.target.value })}
                                />
                              </div>
                            </>
                          ) : (
                            <div className="col-span-2 flex items-center pt-5">
                              <span className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded p-1 font-bold">Locações devem ser inseridas no Extrato do Card.</span>
                            </div>
                          )}
                        </div>
                        {formData.rentalType === 'anual' && (
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Taxa de Administração (Imobiliária)</label>
                            <div className="grid grid-cols-2 gap-2">
                              <select
                                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                                value={formData.discountType}
                                onChange={(e) => setFormData({ ...formData, discountType: e.target.value as any })}
                              >
                                <option value="PERCENT">% do aluguel</option>
                                <option value="VALUE">Valor fixo (R$)</option>
                              </select>
                              <input
                                type="number"
                                step="0.01"
                                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                                value={formData.discountValue}
                                onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                                placeholder="0"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Condomínio e IPTU */}
                    {formData.propertyStage === 'PRONTO' && (
                      <div className="space-y-4 pt-3 border-t border-dashed border-slate-200 animate-in slide-in-from-top-2">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Condomínio & IPTU</p>
                        <div className="grid grid-cols-3 gap-3 items-end">
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Condomínio (R$/mês)</label>
                            <input
                              type="number" step="0.01"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.condoFee}
                              onChange={(e) => setFormData({ ...formData, condoFee: e.target.value })}
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quem paga</label>
                            <select
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.condoPayer}
                              onChange={(e) => setFormData({ ...formData, condoPayer: e.target.value as any })}
                            >
                              <option value="PROPRIETARIO">Proprietário</option>
                              <option value="PROPRIETARIO_REEMBOLSO">Proprietário (reembolsado)</option>
                              <option value="INQUILINO_DIRETO">Inquilino paga direto</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Próx. Vencimento</label>
                            <input
                              type="date"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.condoNextDate}
                              onChange={(e) => setFormData({ ...formData, condoNextDate: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-3 items-end">
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">IPTU (R$)</label>
                            <input
                              type="number" step="0.01"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.iptuFee}
                              onChange={(e) => setFormData({ ...formData, iptuFee: e.target.value })}
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quem paga</label>
                            <select
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.iptuPayer}
                              onChange={(e) => setFormData({ ...formData, iptuPayer: e.target.value as any })}
                            >
                              <option value="PROPRIETARIO">Proprietário</option>
                              <option value="PROPRIETARIO_REEMBOLSO">Proprietário (reembolsado)</option>
                              <option value="INQUILINO_DIRETO">Inquilino paga direto</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Frequência</label>
                            <select
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.iptuFrequency}
                              onChange={(e) => setFormData({ ...formData, iptuFrequency: e.target.value as any })}
                            >
                              <option value="monthly">Mensal</option>
                              <option value="yearly">Anual</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Próx. Vencimento</label>
                            <input
                              type="date"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.iptuNextDate}
                              onChange={(e) => setFormData({ ...formData, iptuNextDate: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Opções de Financiamento/Consórcio */}
                    <div className="space-y-4 pt-3 border-t border-dashed border-slate-200 animate-in slide-in-from-top-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Forma de Pagamento (Saldo Devedor)</label>
                        <select
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20"
                          value={formData.deliveryPaymentMethod}
                          onChange={(e) => setFormData({ ...formData, deliveryPaymentMethod: e.target.value as any })}
                        >
                          <option value="A_VISTA">À Vista / Quitado</option>
                          <option value="FINANCIAMENTO">Financiamento Direto</option>
                          <option value="CONSORCIO">Consórcio Vinculado</option>
                          <option value="A_DEFINIR">A Definir (Saldo na Entrega)</option>
                        </select>
                      </div>

                      {formData.deliveryPaymentMethod === 'A_DEFINIR' && (
                        <div className="space-y-3 p-3 bg-slate-50 border border-slate-100 rounded-2xl animate-in slide-in-from-top-2">
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saldo Estimado a Definir (R$)</label>
                            <input
                              type="number"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20"
                              value={formData.deliveryBalance}
                              onChange={(e) => setFormData({ ...formData, deliveryBalance: e.target.value })}
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      )}

                        {formData.deliveryPaymentMethod === 'CONSORCIO' && (
                          <div className="space-y-3 p-3 bg-slate-50 border border-slate-100 rounded-2xl animate-in slide-in-from-top-2">
                            <div>
                              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Consórcio Vinculado</label>
                              <select
                                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20"
                                value={formData.selectedConsortiumId}
                                onChange={(e) => setFormData({ ...formData, selectedConsortiumId: e.target.value })}
                              >
                                <option value="">-- Selecione um Consórcio --</option>
                                {activeLiabilities.filter(l => l.type === 'CONSORTIUM').map(l => (
                                  <option key={l.id} value={l.id}>{l.name} (Saldo: {formatCurrency(l.remainingBalance)})</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Percentual Alocado ao Imóvel (%)</label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900"
                                value={formData.consortiumAllocationRatio}
                                onChange={(e) => setFormData({ ...formData, consortiumAllocationRatio: e.target.value })}
                              />
                            </div>
                          </div>
                        )}

                        {formData.deliveryPaymentMethod === 'FINANCIAMENTO' && (
                          <div className="space-y-3 p-3 bg-slate-50 border border-slate-100 rounded-2xl animate-in slide-in-from-top-2">
                            <div>
                              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Nome do Financiamento</label>
                              <input
                                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20"
                                value={formData.financingName}
                                onChange={(e) => setFormData({ ...formData, financingName: e.target.value })}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saldo a Financiar (R$)</label>
                                <input
                                  type="number"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900"
                                  value={formData.deliveryBalance}
                                  onChange={(e) => setFormData({ ...formData, deliveryBalance: e.target.value })}
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Original (R$)</label>
                                <input
                                  type="number"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900"
                                  value={formData.financingOriginalTotal}
                                  onChange={(e) => setFormData({ ...formData, financingOriginalTotal: e.target.value })}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor Parcela</label>
                                <input
                                  type="number"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900"
                                  value={formData.financingInstallment}
                                  onChange={(e) => setFormData({ ...formData, financingInstallment: e.target.value })}
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Parcelas</label>
                                <input
                                  type="number"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900"
                                  value={formData.financingInstallmentsCount}
                                  onChange={(e) => setFormData({ ...formData, financingInstallmentsCount: e.target.value })}
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Dia Venc.</label>
                                <input
                                  type="number"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900"
                                  value={formData.financingDueDay}
                                  onChange={(e) => setFormData({ ...formData, financingDueDay: e.target.value })}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                  </div>
                )}

                {/* Loans (Empréstimos Concedidos) parameters */}
                {formData.category === 'OTHER' && (
                  <div className="space-y-4 pt-2 border-t border-slate-200 animate-in slide-in-from-top-2">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-xs select-none">
                      <input
                        type="checkbox"
                        checked={formData.isLoan}
                        onChange={(e) => setFormData({ ...formData, isLoan: e.target.checked })}
                      />
                      Lançar como Empréstimo a Terceiro
                    </label>

                    {formData.isLoan && (
                      <div className="space-y-3 pt-2 border-t border-dashed border-slate-200 animate-in slide-in-from-top-2">

                        {/* Seletor de modelo */}
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Modelo de Cobrança</label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, loanType: 'INSTALLMENTS' })}
                              className={`p-3 rounded-xl border-2 text-left transition-all ${formData.loanType === 'INSTALLMENTS' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                            >
                              <p className={`text-xs font-black uppercase tracking-wider ${formData.loanType === 'INSTALLMENTS' ? 'text-brand-700' : 'text-slate-600'}`}>Parcelado Fixo</p>
                              <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Número de parcelas definido. Valor igual todo mês.</p>
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, loanType: 'OPEN_BALANCE' })}
                              className={`p-3 rounded-xl border-2 text-left transition-all ${formData.loanType === 'OPEN_BALANCE' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                            >
                              <p className={`text-xs font-black uppercase tracking-wider ${formData.loanType === 'OPEN_BALANCE' ? 'text-emerald-700' : 'text-slate-600'}`}>Conta Corrente</p>
                              <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Juros diários sobre saldo. Pagamentos livres abatendo o principal.</p>
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Devedor (Nome)</label>
                            <input
                              required
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                              value={formData.loanDebtor}
                              onChange={(e) => setFormData({ ...formData, loanDebtor: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Data de Concessão</label>
                            <input
                              required
                              type="date"
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1 text-xs font-bold focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                              value={formData.acquisitionDate}
                              onChange={(e) => setFormData({ ...formData, acquisitionDate: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Valor Emprestado (Principal)</label>
                            <input
                              required
                              type="number"
                              step="0.01"
                              min="0.01"
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                              value={formData.loanPrincipal}
                              onChange={(e) => setFormData({ ...formData, loanPrincipal: e.target.value })}
                            />
                          </div>
                          {formData.loanType !== 'OPEN_BALANCE' && (
                            <div>
                              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Dia de Vencimento (1 a 31)</label>
                              <input
                                type="number"
                                min="1"
                                max="31"
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                                value={formData.loanDueDate}
                                onChange={(e) => setFormData({ ...formData, loanDueDate: e.target.value })}
                              />
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Taxa de Juros (%) a.m.</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                              value={formData.loanInterestRate}
                              onChange={(e) => setFormData({ ...formData, loanInterestRate: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Ou Juros Fixo Mensal (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                              value={formData.loanFixedValue}
                              onChange={(e) => setFormData({ ...formData, loanFixedValue: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          {formData.loanType !== 'OPEN_BALANCE' && (
                            <div>
                              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Quantidade de Parcelas a Receber</label>
                              <input
                                type="number"
                                min="1"
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                                value={formData.loanInstallmentsCount}
                                onChange={(e) => setFormData({ ...formData, loanInstallmentsCount: e.target.value })}
                                placeholder="Ex: 12"
                              />
                            </div>
                          )}
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest text-left mb-1">Tipo de Juros</label>
                            <div className="flex gap-4 pt-1.5">
                              <label className="flex items-center gap-2 cursor-pointer font-bold text-xs">
                                <input
                                  type="radio"
                                  name="loanInterestType"
                                  checked={formData.loanInterestType === 'SIMPLE'}
                                  onChange={() => setFormData({ ...formData, loanInterestType: 'SIMPLE' })}
                                />
                                Juros Simples
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer font-bold text-xs">
                                <input
                                  type="radio"
                                  name="loanInterestType"
                                  checked={formData.loanInterestType === 'COMPOUND'}
                                  onChange={() => setFormData({ ...formData, loanInterestType: 'COMPOUND' })}
                                />
                                Juros Compostos
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* Investment parameters */}
                {formData.category === 'INVESTMENT' && (
                  <div className="space-y-4 pt-2 border-t border-slate-200 animate-in slide-in-from-top-2">
                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest text-left">Parâmetros do Investimento</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 text-left">Corretora Vinculada</label>
                        <select
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                          value={formData.brokerAccountId}
                          onChange={(e) => setFormData({ ...formData, brokerAccountId: e.target.value })}
                        >
                          <option value="">Sem Corretora (Caixa Livre)</option>
                          {brokers.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 text-left">Tipo de Ativo / Alocação</label>
                        <select
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                          value={formData.investmentType}
                          onChange={(e) => setFormData({ ...formData, investmentType: e.target.value })}
                        >
                          <option value="CDB">CDB</option>
                          <option value="POUPANCA">Poupança</option>
                          <option value="LCI_LCA">LCI / LCA</option>
                          <option value="TESOURO">Tesouro Direto</option>
                          <option value="DEBENTURES">Debêntures</option>
                          <option value="CRI_CRA">CRI / CRA</option>
                          <option value="COE">COE</option>
                          <option value="ACOES">Ações</option>
                          <option value="FIIS">FIIs (Fundos Imobiliários)</option>
                          <option value="FUNDOS">Fundos de Investimento</option>
                          <option value="CRIPTO">Criptoativos</option>
                          <option value="PREVIDENCIA">Previdência Privada</option>
                          <option value="OUTROS">Outros</option>
                        </select>
                      </div>
                    </div>

                    {!['ACOES', 'FIIS', 'CRIPTO'].includes(formData.investmentType) && (
                      <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                        <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 text-left">Indexador</label>
                          <select
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                            value={formData.interestType}
                            onChange={(e) => setFormData({ ...formData, interestType: e.target.value })}
                          >
                            <option value="CDI">Pós-fixado (CDI)</option>
                            <option value="PRE">Pré-fixado</option>
                            <option value="IPCA">Inflação (IPCA+)</option>
                            <option value="OUTROS">Outros</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 text-left">Taxa Rentabilidade {formData.interestType === 'CDI' ? '(% do CDI)' : formData.interestType === 'IPCA' ? '(% acima do IPCA)' : '(% a.a.)'}</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                            placeholder={formData.interestType === 'CDI' ? 'Ex: 102' : formData.interestType === 'IPCA' ? 'Ex: 6,50' : 'Ex: 12,60'}
                            value={formData.yieldRate}
                            onChange={(e) => setFormData({ ...formData, yieldRate: e.target.value.replace(/[^0-9.,]/g, '') })}
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 text-left">Distribuição de Rendimentos</label>
                        <select
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                          value={formData.payoutType}
                          onChange={(e) => setFormData({ ...formData, payoutType: e.target.value as any })}
                        >
                          <option value="ACUMULADO">Acumulado / Reinvestido no Ativo</option>
                          <option value="MENSAL">Mensal (Cai na Conta / Cupom)</option>
                        </select>
                      </div>
                      {!['ACOES', 'FIIS', 'CRIPTO'].includes(formData.investmentType) && (
                        <div className="animate-in slide-in-from-top-2">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 text-left">Liquidez</label>
                          <select
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                            value={formData.investmentLiquidity}
                            onChange={(e) => setFormData({ ...formData, investmentLiquidity: e.target.value })}
                          >
                            <option value="Diária">Diária</option>
                            <option value="No Vencimento">No Vencimento</option>
                            <option value="D+1">D+1</option>
                            <option value="D+30">D+30</option>
                            <option value="Outra">Outra</option>
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {!['ACOES', 'FIIS', 'CRIPTO'].includes(formData.investmentType) ? (
                        <div className="animate-in slide-in-from-top-2">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 text-left">Data de Vencimento (Opcional)</label>
                          <input
                            type="date"
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                            value={formData.vencimentoDate}
                            onChange={(e) => setFormData({ ...formData, vencimentoDate: e.target.value })}
                          />
                        </div>
                      ) : null}
                      <div className={['ACOES', 'FIIS', 'CRIPTO'].includes(formData.investmentType) ? 'col-span-2' : ''}>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 text-left">Status</label>
                        <select
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                          value={formData.status || 'ATIVO'}
                          onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                        >
                          <option value="ATIVO">Ativo</option>
                          <option value="RESGATADO">Resgatado</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Descrição</label>
                <textarea
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  rows={2}
                  placeholder="Informações adicionais sobre o bem..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </div>

            <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-slate-200 transition-colors">Cancelar</button>
                <button type="submit" disabled={savingAssetUi} className="flex-1 px-4 py-3 bg-brand-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-brand-500/20 hover:scale-[1.02] transition-transform active:scale-95 disabled:opacity-50 disabled:hover:scale-100">{savingAssetUi ? 'Salvando...' : 'Salvar Bem'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REGISTRO DE PAGAMENTO (Conta Corrente) */}
      {loanPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm">Registrar Pagamento</h3>
              <button onClick={() => setLoanPaymentModal(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Empréstimo</p>
                <p className="font-black text-slate-900">{loanPaymentModal.loan.name}</p>
                <p className="text-xs text-slate-500">Devedor: {loanPaymentModal.loan.metadata?.loanDebtor}</p>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Data do Pagamento</label>
                <input
                  type="date"
                  value={loanPaymentModal.date}
                  onChange={e => setLoanPaymentModal(p => p ? { ...p, date: e.target.value } : null)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Valor Recebido (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0,00"
                  value={loanPaymentModal.amount}
                  onChange={e => setLoanPaymentModal(p => p ? { ...p, amount: e.target.value } : null)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Conta que Recebe</label>
                <select
                  value={loanPaymentModal.accountId}
                  onChange={e => setLoanPaymentModal(p => p ? { ...p, accountId: e.target.value } : null)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500 transition-all"
                >
                  {allAccounts.map((acc: any) => (
                    <option key={acc.id} value={acc.id}>{acc.institution || acc.name}</option>
                  ))}
                </select>
              </div>
              <button
                disabled={!loanPaymentModal.amount || !loanPaymentModal.accountId || loanPaymentModal.isSubmitting}
                onClick={async () => {
                  if (!supabase || !loanPaymentModal.amount) return;
                  setLoanPaymentModal(p => p ? { ...p, isSubmitting: true } : null);
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    const userId = session?.user?.id;
                    const acc = allAccounts.find((a: any) => a.id === loanPaymentModal.accountId);
                    const { error } = await supabase.from('transactions').insert({
                      user_id: userId,
                      date: loanPaymentModal.date,
                      description: `Pagamento - ${loanPaymentModal.loan.name} (${loanPaymentModal.loan.metadata?.loanDebtor || ''})`,
                      amount: parseFloat(loanPaymentModal.amount),
                      type: 'INCOME',
                      category: 'Empréstimos/Investimentos',
                      account_id: loanPaymentModal.accountId,
                      account_name: acc?.institution || acc?.name || '',
                      is_paid: true,
                      paid_amount: parseFloat(loanPaymentModal.amount),
                      paid_at: loanPaymentModal.date,
                      metadata: { linked_asset_id: loanPaymentModal.loan.id, is_loan_payment: true }
                    });
                    if (error) throw error;
                    await supabase.rpc('recalculate_account_balance', { p_account_id: loanPaymentModal.accountId });
                    setLoanPaymentModal(null);
                    // Recarrega os dados do asset
                    const ev = new Event('offline-sync-completed');
                    window.dispatchEvent(ev);
                  } catch (err: any) {
                    console.error('Erro ao registrar pagamento:', err);
                    setLoanPaymentModal(p => p ? { ...p, isSubmitting: false } : null);
                  }
                }}
                className="w-full py-3.5 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest disabled:opacity-50 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
              >
                {loanPaymentModal.isSubmitting ? (
                  <><Loader2 size={14} className="animate-spin" /> Registrando...</>
                ) : (
                  <><Check size={14} /> Confirmar Pagamento</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REAL ESTATE DETAILED CONFIG */}
      {/* MODAL: RESGATE DE INVESTIMENTO */}
      {showResgateModal && selectedAssetForResgate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Resgatar Investimento</h3>
              <button 
                type="button"
                onClick={() => {
                  setShowResgateModal(false);
                  setSelectedAssetForResgate(null);
                }} 
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-50"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleRedeemInvestment} className="p-6 space-y-4">
              <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 space-y-1">
                <p className="text-xs text-indigo-500 font-bold uppercase tracking-wider">Ativo Selecionado</p>
                <p className="text-sm font-black text-slate-900">{selectedAssetForResgate.name}</p>
                <div className="flex justify-between items-center pt-2 mt-1 border-t border-indigo-100/50">
                  <span className="text-xs text-slate-500 font-semibold">Saldo Bruto Atual:</span>
                  <span className="text-sm font-bold text-slate-800">{formatCurrency(Number(selectedAssetForResgate.estimatedValue || 0))}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500 font-semibold">Valor Líquido (Estimado):</span>
                  <span className="text-sm font-black text-emerald-600">{formatCurrency(selectedAssetForResgate.netValue || Number(selectedAssetForResgate.estimatedValue || 0))}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Tipo de Resgate</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-xs">
                    <input
                      type="radio"
                      name="resgateType"
                      checked={resgateForm.type === 'TOTAL'}
                      onChange={() => setResgateForm({ ...resgateForm, type: 'TOTAL', amount: '' })}
                    />
                    Resgate Total
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-xs">
                    <input
                      type="radio"
                      name="resgateType"
                      checked={resgateForm.type === 'PARCIAL'}
                      onChange={() => setResgateForm({ ...resgateForm, type: 'PARCIAL', amount: '' })}
                    />
                    Resgate Parcial
                  </label>
                </div>
              </div>

              {resgateForm.type === 'PARCIAL' && (
                <div className="animate-in slide-in-from-top-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Valor do Resgate (R$)</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={Number(selectedAssetForResgate.estimatedValue || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    placeholder="0.00"
                    value={resgateForm.amount}
                    onChange={(e) => setResgateForm({ ...resgateForm, amount: e.target.value })}
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Conta de Destino (Para Crédito)</label>
                <select
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  value={resgateForm.destinationAccountId}
                  onChange={(e) => setResgateForm({ ...resgateForm, destinationAccountId: e.target.value })}
                >
                  <option value="">Selecione uma conta...</option>
                  {allAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.institution || acc.name} ({acc.type === 'INVESTMENT' ? 'Corretora' : 'Conta Corrente'})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1 font-semibold leading-tight font-medium">O valor líquido resgatado será somado ao saldo livre desta conta e gerará um lançamento de receita automática no extrato.</p>
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => {
                    setShowResgateModal(false);
                    setSelectedAssetForResgate(null);
                  }} 
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-transform active:scale-95"
                >
                  Confirmar Resgate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRealEstateManageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Ajustar Custos & Aluguel</h3>
              <button onClick={() => setShowRealEstateManageModal(false)} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-50">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {(() => {
                const linkedAssetForRent = physicalAssets.find(p => p.id === selectedLiabilityForManage?.linkedAssetId);
                const isUsoProprio = linkedAssetForRent?.metadata?.purpose === 'uso';
                return (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Estágio do Imóvel</label>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                    value={realEstateManageForm.propertyType}
                    onChange={(e) => {
                      const newType = e.target.value as 'PLANTA' | 'PRONTO';
                      setRealEstateManageForm({
                        ...realEstateManageForm,
                        propertyType: newType,
                        isRented: newType === 'PRONTO' ? false : realEstateManageForm.isRented
                      });
                    }}
                  >
                    <option value="PRONTO">Pronto / Entregue</option>
                    <option value="PLANTA">Na Planta (Em Construção)</option>
                  </select>
                </div>
                {realEstateManageForm.propertyType === 'PRONTO' && !isUsoProprio && (
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-xs select-none pt-6">
                    <input
                      type="checkbox"
                      checked={realEstateManageForm.isRented}
                      onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, isRented: e.target.checked })}
                    />
                    Está Alugado?
                  </label>
                )}
                {realEstateManageForm.propertyType === 'PRONTO' && isUsoProprio && (
                  <p className="text-[10px] text-slate-400 font-semibold pt-6">Imóvel de uso próprio não gera aluguel. Mude para "Investimento" no cadastro do imóvel pra liberar essa opção.</p>
                )}
              </div>
                );
              })()}

              {/* Delivery Settle Wizard (Detail 5) */}
              {(() => {
                const asset = physicalAssets.find(p => p.id === selectedLiabilityForManage?.linkedAssetId);
                const wasPlanta = asset?.metadata?.propertyStage === 'PLANTA';
                const isTransitioningToPronto = wasPlanta && realEstateManageForm.propertyType === 'PRONTO';

                if (!isTransitioningToPronto) return null;

                return (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-3 animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 text-indigo-800 font-bold text-xs uppercase tracking-wider">
                      <Sparkles size={16} />
                      Quitação do Saldo Devedor
                    </div>
                    <p className="text-xs text-indigo-600 font-bold">
                      O imóvel passou de "Na Planta" para "Pronto". Defina como quitará o Saldo Devedor final das chaves.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-1">Valor Saldo Devedor (R$)</label>
                        <input
                          type="number"
                          className="w-full bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800"
                          placeholder="0.00"
                          value={realEstateManageForm.deliveryBalance}
                          onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, deliveryBalance: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-1">Forma de Pagamento</label>
                        <select
                          className="w-full bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800"
                          value={realEstateManageForm.deliveryPaymentMethod}
                          onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, deliveryPaymentMethod: e.target.value as any })}
                        >
                          <option value="A_VISTA">À Vista (Recursos Próprios)</option>
                          <option value="FINANCIAMENTO">Financiamento Bancário</option>
                          <option value="CONSORCIO">Contemplar Consórcio Existente</option>
                          <option value="A_DEFINIR">A Definir (Saldo na Entrega)</option>
                        </select>
                      </div>
                    </div>

                    {realEstateManageForm.deliveryPaymentMethod === 'CONSORCIO' && (
                      <div className="animate-in slide-in-from-top-2">
                        <label className="block text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-1">Selecione o Consórcio</label>
                        <select
                          className="w-full bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800"
                          value={realEstateManageForm.selectedConsortiumId}
                          onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, selectedConsortiumId: e.target.value })}
                        >
                          <option value="">-- Escolha um consórcio --</option>
                          {liabilities
                            .filter(l => l.type === 'CONSORTIUM' && !l.is_archived)
                            .map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name} (Saldo: R$ {c.remainingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                              </option>
                            ))}
                        </select>
                      </div>
                    )}

                    {realEstateManageForm.deliveryPaymentMethod === 'FINANCIAMENTO' && (
                      <div className="space-y-3 pt-2 border-t border-indigo-100/50 animate-in slide-in-from-top-2">
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Nome da Dívida</label>
                          <input
                            type="text"
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20"
                            placeholder="Ex: Financiamento Piazza do Bosque"
                            value={realEstateManageForm.financingName}
                            onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, financingName: e.target.value })}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tipo de Dívida</label>
                            <select
                              disabled
                              className="w-full bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-500"
                              value="MORTGAGE"
                            >
                              <option value="MORTGAGE">Financiamento Imobiliário</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Bem Vinculado</label>
                            <select
                              disabled
                              className="w-full bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-500"
                            >
                              <option>{asset?.name}</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Original Total (R$)</label>
                            <input
                              type="number"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900"
                              placeholder="0.00"
                              value={realEstateManageForm.financingOriginalTotal}
                              onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, financingOriginalTotal: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">Saldo Devedor Atual (R$)</label>
                            <input
                              type="number"
                              className="w-full bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-rose-900 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-rose-400"
                              placeholder="0.00"
                              value={realEstateManageForm.deliveryBalance}
                              onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, deliveryBalance: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor Parcela (R$)</label>
                            <input
                              type="number"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-900"
                              placeholder="0.00"
                              value={realEstateManageForm.financingInstallment}
                              onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, financingInstallment: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Parcelas Rest.</label>
                            <input
                              type="number"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-900"
                              placeholder="Ex: 180"
                              value={realEstateManageForm.financingInstallmentsCount}
                              onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, financingInstallmentsCount: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Dia Venc.</label>
                            <input
                              type="number"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-900"
                              placeholder="Ex: 25"
                              value={realEstateManageForm.financingDueDay}
                              onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, financingDueDay: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {realEstateManageForm.propertyType === 'PRONTO' && realEstateManageForm.isRented && (
                <div className="space-y-3 pt-2 border-t border-dashed border-slate-200 animate-in slide-in-from-top-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de Aluguel</label>
                      <select
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold"
                        value={realEstateManageForm.rentalType}
                        onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, rentalType: e.target.value as any })}
                      >
                        <option value="anual">Locação Anual</option>
                        <option value="short_stay">Short Stay (Temporada)</option>
                      </select>
                    </div>
                    {realEstateManageForm.rentalType === 'anual' ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Aluguel (R$)</label>
                          <input
                            type="number"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                            value={realEstateManageForm.rentalIncome}
                            onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, rentalIncome: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Inicial</label>
                          <input
                            type="date"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                            value={realEstateManageForm.rentalDate}
                            onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, rentalDate: e.target.value })}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center pt-3">
                        <span className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded p-1 font-bold">Lançamentos via Extrato do Card.</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Condomínio (R$)</label>
                      <input
                        type="number"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                        value={realEstateManageForm.condoFee}
                        onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, condoFee: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">IPTU Mensal (R$)</label>
                      <input
                        type="number"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                        value={realEstateManageForm.iptuFee}
                        onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, iptuFee: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="flex gap-4 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-xs">
                      <input
                        type="checkbox"
                        checked={realEstateManageForm.inquilinoPaysCondo}
                        onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, inquilinoPaysCondo: e.target.checked })}
                      />
                      Inquilino paga Condomínio
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-xs">
                      <input
                        type="checkbox"
                        checked={realEstateManageForm.inquilinoPaysIPTU}
                        onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, inquilinoPaysIPTU: e.target.checked })}
                      />
                      Inquilino paga IPTU
                    </label>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Prestação Financiamento</label>
                  <input
                    type="number"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold"
                    placeholder="0.00"
                    value={realEstateManageForm.installmentAmount}
                    onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, installmentAmount: e.target.value })}
                  />
                </div>
                {realEstateManageForm.propertyType === 'PLANTA' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Entrega das Chaves</label>
                    <input
                      type="month"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold"
                      value={realEstateManageForm.deliveryDate}
                      onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, deliveryDate: e.target.value })}
                    />
                  </div>
                )}
              </div>

              <div className="pt-4 flex gap-3 border-t border-slate-100">
                <button onClick={() => setShowRealEstateManageModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-widest">Cancelar</button>
                <button onClick={saveRealEstateManage} className="flex-1 py-3 bg-brand-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg">Salvar Ajustes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CARD EXTRATO / LEDGER DETAILED VIEW WITH BIDIRECTIONAL SYNC */}
      {showExtratoModal && selectedAssetForExtrato && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 flex flex-col max-h-[85vh]">
            {/* Header - hidden during print */}
            <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 print:hidden">
              <div className="flex items-center gap-4">
                <div>
                  <h3 className="font-black text-slate-900 uppercase tracking-tight text-lg">
                    {selectedAssetForExtrato.metadata?.isLoan ? 'Extrato de Empréstimo Concedido' : 'Extrato e Lançamentos do Card'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">{selectedAssetForExtrato.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => exportExtratoToExcel(selectedAssetForExtrato)} className="p-2.5 bg-white border border-slate-200 text-slate-500 hover:text-brand-600 rounded-xl flex items-center justify-center transition-all shadow-sm" title="Exportar Excel"><FileSpreadsheet size={16} /></button>
                <button onClick={() => window.print()} className="p-2.5 bg-white border border-slate-200 text-slate-500 hover:text-brand-600 rounded-xl flex items-center justify-center transition-all shadow-sm" title="Imprimir PDF"><Printer size={16} /></button>
                <button onClick={() => handleArchiveAssetFromExtrato(selectedAssetForExtrato)} className="p-2.5 bg-white border border-slate-200 text-slate-500 hover:text-rose-600 rounded-xl flex items-center justify-center transition-all shadow-sm" title="Arquivar / Marcar como Vendido"><Archive size={16} /></button>
                <button onClick={async () => { await handleDeleteAsset(selectedAssetForExtrato); setShowExtratoModal(false); }} className="p-2.5 bg-white border border-slate-200 text-rose-500 hover:bg-rose-50 rounded-xl flex items-center justify-center transition-all shadow-sm" title="Excluir Lançamento do Bem"><Trash2 size={16} /></button>
                <button onClick={() => { setShowExtratoModal(false); setIsAddingExtratoTx(false); }} className="w-10 h-10 bg-white border border-slate-100 text-slate-400 hover:text-rose-500 rounded-xl flex items-center justify-center transition-all shadow-sm ml-1"><X size={18} /></button>
              </div>
            </div>

            {/* Print header - only visible during print */}
            <div className="hidden print:block p-8 border-b border-slate-200">
              <h2 className="text-2xl font-black text-slate-900">Zyvion – Extrato de Empréstimo Concedido</h2>
              <p className="text-sm text-slate-600 mt-1">Empréstimo: <strong>{selectedAssetForExtrato.name}</strong></p>
              {selectedAssetForExtrato.metadata?.loanDebtor && (
                <p className="text-sm text-slate-600">Devedor: <strong>{selectedAssetForExtrato.metadata.loanDebtor}</strong></p>
              )}
              <p className="text-sm text-slate-600">Emitido em: {new Date().toLocaleDateString('pt-BR')}</p>
            </div>

            <div className="p-8 flex-1 overflow-y-auto custom-scrollbar space-y-6">

              {/* LOAN-specific amortization summary panel */}
              {selectedAssetForExtrato.metadata?.isLoan && (() => {
                const meta = selectedAssetForExtrato.metadata || {};
                const principal = Number(meta.loanPrincipal) || 0;
                const loanLinkedTxs = getAssetLinkedTransactions(selectedAssetForExtrato.id)
                  .filter(t => t.type === 'INCOME')
                  .sort((a, b) => a.date.localeCompare(b.date));

                let runningBalance = principal;
                const interestType = meta.loanInterestType || 'SIMPLE';
                const monthlyRate = (Number(meta.loanInterestRate) || 0) / 100;

                // Build amortization schedule from paid receipts based on elapsed time
                const concessionDate = selectedAssetForExtrato.acquisitionDate || DateUtils.formatToISODate();
                const schedule = loanLinkedTxs.map((tx, idx) => {
                  const prevDate = idx === 0 ? concessionDate : loanLinkedTxs[idx - 1].date;
                  const d1 = new Date(prevDate);
                  const d2 = new Date(tx.date);
                  const diffTime = Math.max(0, d2.getTime() - d1.getTime());
                  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                  const elapsedMonths = diffDays / 30.4375;

                  const interest = interestType === 'COMPOUND'
                    ? runningBalance * (Math.pow(1 + monthlyRate, elapsedMonths) - 1)
                    : principal * monthlyRate * elapsedMonths;

                  const totalReceived = Number(tx.amount) || 0;
                  const interestPaid = Math.min(interest, totalReceived);
                  const principalPaid = Math.max(0, totalReceived - interestPaid);
                  runningBalance = Math.max(0, runningBalance - principalPaid);
                  return {
                    tx,
                    interest: Math.round(interestPaid * 100) / 100,
                    principalPaid: Math.round(principalPaid * 100) / 100,
                    balance: Math.round(runningBalance * 100) / 100,
                    idx
                  };
                });

                const totalReceived = loanLinkedTxs.reduce((s, t) => s + Number(t.amount), 0);
                const currentBalance = Math.max(0, runningBalance);
                const progressPct = principal > 0 ? Math.min(100, Math.round((totalReceived / principal) * 100)) : 0;

                return (
                  <div className="space-y-4">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                        <p className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Principal</p>
                        <p className="text-sm font-black text-emerald-700">{formatCurrency(principal)}</p>
                      </div>
                      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                        <p className="text-[10px] font-black uppercase text-amber-500 tracking-widest">Saldo Devedor</p>
                        <p className="text-sm font-black text-amber-700">{formatCurrency(currentBalance)}</p>
                      </div>
                      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
                        <p className="text-[10px] font-black uppercase text-indigo-500 tracking-widest">Recebido</p>
                        <p className="text-sm font-black text-indigo-700">{formatCurrency(totalReceived)}</p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-black uppercase text-slate-400">
                        <span>Retorno do Principal</span>
                        <span>{progressPct}% quitado</span>
                      </div>
                      <div 
                        className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden"
                        role="progressbar"
                        aria-valuenow={Math.min(100, Math.max(0, progressPct))}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Progresso de amortização do empréstimo"
                      >
                        <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                      </div>
                    </div>

                    {/* Amortization table */}
                    {schedule.length > 0 && (
                      <div>
                        <p className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Tabela de Amortização</p>
                        <div className="rounded-xl border border-slate-200 overflow-hidden">
                          <table className="w-full text-xs font-medium">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="text-left px-3 py-2 font-black uppercase text-slate-400 tracking-wider">Data</th>
                                <th className="text-right px-3 py-2 font-black uppercase text-slate-400 tracking-wider">Total Recebido</th>
                                <th className="text-right px-3 py-2 font-black uppercase text-slate-400 tracking-wider">Juros</th>
                                <th className="text-right px-3 py-2 font-black uppercase text-slate-400 tracking-wider">Principal</th>
                                <th className="text-right px-3 py-2 font-black uppercase text-slate-400 tracking-wider">Saldo Rest.</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {schedule.map(({ tx, interest, principalPaid, balance }) => (
                                <tr key={tx.id} className="hover:bg-slate-50/50">
                                  <td className="px-3 py-2 text-slate-600">{DateUtils.formatDisplayDate(tx.date)}</td>
                                  <td className="px-3 py-2 text-right font-bold text-emerald-600">{formatCurrency(Number(tx.amount))}</td>
                                  <td className="px-3 py-2 text-right text-amber-600">{formatCurrency(interest)}</td>
                                  <td className="px-3 py-2 text-right text-indigo-600">{formatCurrency(principalPaid)}</td>
                                  <td className="px-3 py-2 text-right font-bold text-slate-800">{formatCurrency(balance)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Financial summary within the card extrato (non-loan) */}
              {!selectedAssetForExtrato.metadata?.isLoan && (() => {
                const info = getAssetFinancialHistory(selectedAssetForExtrato);
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <div className="flex justify-between items-center sm:flex-col sm:items-start sm:justify-start">
                      <p className="text-xs font-black uppercase text-slate-400 tracking-wider">Total Receitas</p>
                      <p className="text-sm sm:text-base font-black text-emerald-600">{formatCurrency(info.totalIncome)}</p>
                    </div>
                    <div className="flex justify-between items-center sm:flex-col sm:items-start sm:justify-start border-t sm:border-t-0 sm:border-l border-slate-200/60 pt-2 sm:pt-0 sm:pl-4">
                      <p className="text-xs font-black uppercase text-slate-400 tracking-wider">Total Gastos Extras</p>
                      <p className="text-sm sm:text-base font-black text-rose-500">{formatCurrency(info.totalExtraExpenses)}</p>
                    </div>
                    <div className="flex justify-between items-center sm:flex-col sm:items-start sm:justify-start border-t sm:border-t-0 sm:border-l border-slate-200/60 pt-2 sm:pt-0 sm:pl-4">
                      <p className="text-xs font-black uppercase text-slate-400 tracking-wider">Saldo Consolidado</p>
                      <p className={`text-sm sm:text-base font-black ${info.totalIncome - info.totalExtraExpenses >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {formatCurrency(info.totalIncome - info.totalExtraExpenses)}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Transactions Ledger List */}
              <div className="space-y-4">
                <div className="flex justify-between items-center print:hidden">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">
                    {selectedAssetForExtrato.metadata?.isLoan ? 'Recebimentos Registrados' : 'Histórico de Lançamentos'}
                  </h4>
                  {!isAddingExtratoTx && (
                    <button
                      onClick={() => {
                        if (selectedAssetForExtrato.metadata?.isLoan) {
                          setNewTxForm({
                            description: `Recebimento de Empréstimo - ${selectedAssetForExtrato.name}`,
                            amount: '',
                            type: 'INCOME',
                            date: DateUtils.formatToISODate(),
                            isHistorical: false,
                            category: 'Empréstimos/Investimentos',
                            subcategory: 'Amortização',
                            isCapitalized: false
                          });
                        } else {
                          setNewTxForm({
                            description: '',
                            amount: '',
                            type: 'EXPENSE',
                            date: DateUtils.formatToISODate(),
                            isHistorical: false,
                            category: 'Outros',
                            subcategory: '',
                            isCapitalized: false
                          });
                        }
                        setIsAddingExtratoTx(true);
                      }}
                      className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-black uppercase tracking-widest"
                    >
                      {selectedAssetForExtrato.metadata?.isLoan ? '+ Lançar Recebimento' : '+ Novo Lançamento'}
                    </button>
                  )}
                </div>

                {isAddingExtratoTx && (
                  <form onSubmit={handleSaveCardTransaction} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 animate-in slide-in-from-top-2 print:hidden">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Descrição</label>
                        <input
                          required
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold"
                          placeholder="Ex: Reforma da Cozinha"
                          value={newTxForm.description}
                          onChange={e => setNewTxForm({ ...newTxForm, description: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Valor (R$)</label>
                        <input
                          required
                          type="number"
                          step="0.01"
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold"
                          placeholder="0.00"
                          value={newTxForm.amount}
                          onChange={e => setNewTxForm({ ...newTxForm, amount: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Tipo</label>
                        <select
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                          value={newTxForm.type}
                          onChange={e => setNewTxForm({ ...newTxForm, type: e.target.value as any })}
                        >
                          <option value="EXPENSE">Despesa (Saída)</option>
                          <option value="INCOME">Receita (Entrada)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Data</label>
                        <input
                          type="date"
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                          value={newTxForm.date}
                          onChange={e => setNewTxForm({ ...newTxForm, date: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Categoria</label>
                        <input
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                          value={newTxForm.category}
                          onChange={e => setNewTxForm({ ...newTxForm, category: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <label className="flex items-center gap-2 cursor-pointer font-bold text-xs">
                        <input
                          type="checkbox"
                          checked={newTxForm.isHistorical}
                          onChange={e => setNewTxForm({ ...newTxForm, isHistorical: e.target.checked })}
                        />
                        Lançamento Passado (Não conta no Dashboard Mensal)
                      </label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setIsAddingExtratoTx(false)} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-black uppercase">Cancelar</button>
                        <button type="submit" className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-black uppercase">Lançar</button>
                      </div>
                    </div>
                  </form>
                )}

                <div className="space-y-3">
                  {getAssetLinkedTransactions(selectedAssetForExtrato.id).map(tx => (
                    <div key={tx.id} className="flex justify-between items-center bg-slate-50 border border-slate-100 p-4 rounded-xl group hover:border-slate-200 transition-all">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-800 flex items-center gap-2">
                          {tx.description}
                          {tx.metadata?.is_historical && (
                            <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[7px] font-black uppercase tracking-wider">Histórico</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400 font-medium">
                          {DateUtils.formatDisplayDate(tx.date)} • {tx.category}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`text-xs font-black ${tx.type === 'INCOME' ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.amount)}
                        </span>
                        <button
                          onClick={() => handleDeleteCardTransaction(tx.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-600 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {getAssetLinkedTransactions(selectedAssetForExtrato.id).length === 0 && (
                    <div className="py-8 text-center text-slate-400 italic text-[11px]">
                      Nenhum lançamento vinculado a este card patrimonial.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REGULAR LIABILITY MODAL */}
      {showLiabilityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">{editingLiability ? 'Editar Passivo / Financiamento' : 'Novo Passivo / Financiamento'}</h3>
              <button onClick={() => { setShowLiabilityModal(false); setForceRegenSchedule(false); }} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-50">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveLiability} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Nome da Dívida</label>
                <input
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                  placeholder="Ex: Financiamento Jeep"
                  value={liabilityFormData.name}
                  onChange={(e) => setLiabilityFormData({ ...liabilityFormData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Tipo de Dívida</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-red-500"
                  value={liabilityFormData.type}
                  onChange={(e) => setLiabilityFormData({ ...liabilityFormData, type: e.target.value as any })}
                >
                  <option value="MORTGAGE">Financiamento Imobiliário</option>
                  <option value="VEHICLE_FINANCING">Financiamento de Veículo</option>
                  <option value="PERSONAL_LOAN">Empréstimo Pessoal</option>
                  <option value="CONSORTIUM">Consórcio</option>
                  <option value="OTHER">Outras Dívidas</option>
                </select>
              </div>

              {/* Opção de Pagamentos Históricos Anteriores */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider cursor-pointer select-none" htmlFor="hasHistoricalPayments">
                    Possui pagamentos anteriores ao Zyvion?
                  </label>
                  <input
                    id="hasHistoricalPayments"
                    type="checkbox"
                    className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500"
                    checked={liabilityFormData.hasHistoricalPayments}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setLiabilityFormData(prev => {
                        const next = { ...prev, hasHistoricalPayments: checked };
                        if (!checked) {
                          next.historicalPaidAmount = '';
                          next.historicalInstallmentsPaid = '';
                          next.historicalInstallmentValue = '';
                        }
                        return next;
                      });
                    }}
                  />
                </div>

                {liabilityFormData.hasHistoricalPayments && (
                  <div className="space-y-3 pt-2 border-t border-slate-200 animate-in slide-in-from-top-2">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Tipo de Entrada Histórica</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                            liabilityFormData.historicalCalculationType === 'calculated'
                              ? 'bg-brand-600 text-white shadow-sm'
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                          onClick={() => setLiabilityFormData(prev => ({ ...prev, historicalCalculationType: 'calculated' }))}
                        >
                          Calcular por Parcelas
                        </button>
                        <button
                          type="button"
                          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                            liabilityFormData.historicalCalculationType === 'direct'
                              ? 'bg-brand-600 text-white shadow-sm'
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                          onClick={() => setLiabilityFormData(prev => ({ ...prev, historicalCalculationType: 'direct' }))}
                        >
                          Valor Direto
                        </button>
                      </div>
                    </div>

                    {liabilityFormData.historicalCalculationType === 'calculated' ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Parcelas Pagas</label>
                          <input
                            type="number"
                            min="0"
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20"
                            placeholder="0"
                            value={liabilityFormData.historicalInstallmentsPaid}
                            onChange={(e) => {
                              const val = e.target.value;
                              setLiabilityFormData(prev => {
                                const installments = parseInt(val, 10) || 0;
                                const instVal = parseFloat(prev.historicalInstallmentValue) || 0;
                                const calculatedTotal = installments * instVal;
                                const next = {
                                  ...prev,
                                  historicalInstallmentsPaid: val,
                                  historicalPaidAmount: calculatedTotal > 0 ? calculatedTotal.toFixed(2) : ''
                                };
                                // O Saldo Devedor NÃO é recalculado a partir do pago histórico (que inclui juros);
                                // ele é informado por você (é o que o banco mostra). O histórico fica só como registro.
                                return next;
                              });
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor da Parcela (R$)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20"
                            placeholder="0.00"
                            value={liabilityFormData.historicalInstallmentValue}
                            onChange={(e) => {
                              const val = e.target.value;
                              setLiabilityFormData(prev => {
                                const instVal = parseFloat(val) || 0;
                                const installments = parseInt(prev.historicalInstallmentsPaid, 10) || 0;
                                const calculatedTotal = installments * instVal;
                                const next = {
                                  ...prev,
                                  historicalInstallmentValue: val,
                                  historicalPaidAmount: calculatedTotal > 0 ? calculatedTotal.toFixed(2) : ''
                                };
                                // O Saldo Devedor NÃO é recalculado a partir do pago histórico (que inclui juros);
                                // ele é informado por você (é o que o banco mostra). O histórico fica só como registro.
                                return next;
                              });
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor Total Pago Anteriormente (R$)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20"
                          placeholder="0.00"
                          value={liabilityFormData.historicalPaidAmount}
                          onChange={(e) => {
                            const val = e.target.value;
                            setLiabilityFormData(prev => ({
                              ...prev,
                              historicalPaidAmount: val
                              // Saldo Devedor não é recalculado a partir do pago histórico (inclui juros) — é informado por você.
                            }));
                          }}
                        />
                      </div>
                    )}

                    {parseFloat(liabilityFormData.historicalPaidAmount) > 0 && (
                      <div className="p-2 bg-brand-50 rounded-lg border border-brand-100/50 flex justify-between items-center text-[10px] font-black text-brand-700 tracking-wide">
                        <span>Total Pago Histórico:</span>
                        <span>{formatCurrency(parseFloat(liabilityFormData.historicalPaidAmount))}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Original Total (R$)</label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-red-500"
                    value={liabilityFormData.totalAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLiabilityFormData(prev => ({
                        ...prev,
                        totalAmount: val,
                        // Se o Saldo Devedor ainda está vazio, sugere o total (dívida nova sem histórico).
                        // Nunca subtrai o pago histórico (que inclui juros) — isso distorcia o saldo.
                        remainingBalance: (prev.remainingBalance === '' && val) ? val : prev.remainingBalance
                      }));
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Saldo Devedor Atual (R$)</label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-red-500"
                    value={liabilityFormData.remainingBalance}
                    onChange={(e) => setLiabilityFormData({ ...liabilityFormData, remainingBalance: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Valor Parcela</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20"
                    value={liabilityFormData.installmentAmount}
                    onChange={(e) => setLiabilityFormData({ ...liabilityFormData, installmentAmount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Parcelas Restantes</label>
                  <input
                    type="number"
                    min="0"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20"
                    value={liabilityFormData.installmentsRemaining}
                    onChange={(e) => setLiabilityFormData({ ...liabilityFormData, installmentsRemaining: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Dia Vencimento</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20"
                    value={liabilityFormData.dueDay}
                    onChange={(e) => setLiabilityFormData({ ...liabilityFormData, dueDay: e.target.value })}
                  />
                </div>
              </div>

              {/* Detalhes de Financiamento (juros, amortização, índice) — imagem 2 migrada para o passivo */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detalhes de Financiamento (opcional)</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Taxa Juros (% am)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20"
                      placeholder="0.0"
                      value={liabilityFormData.interestRate}
                      onChange={(e) => setLiabilityFormData({ ...liabilityFormData, interestRate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Tipo Amortização</label>
                    <select
                      className="w-full bg-white border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20"
                      value={liabilityFormData.amortizationType}
                      onChange={(e) => setLiabilityFormData({ ...liabilityFormData, amortizationType: e.target.value as 'SAC' | 'PRICE' })}
                    >
                      <option value="SAC">SAC (Decrescente)</option>
                      <option value="PRICE">Price (Igual)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Data 1ª Parcela</label>
                    <input
                      type="date"
                      className="w-full bg-white border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20"
                      value={liabilityFormData.firstInstallmentDate}
                      onChange={(e) => setLiabilityFormData({ ...liabilityFormData, firstInstallmentDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Índice Correção</label>
                    <select
                      className="w-full bg-white border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20"
                      value={liabilityFormData.indexType}
                      onChange={(e) => setLiabilityFormData({ ...liabilityFormData, indexType: e.target.value as any })}
                    >
                      <option value="FIXED">Fixo (Sem reajuste)</option>
                      <option value="INCC">INCC</option>
                      <option value="IPCA">IPCA</option>
                      <option value="IGP-M">IGP-M</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Projeção Reajuste (% am)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-brand-500/20"
                      placeholder="0.0"
                      value={liabilityFormData.indexationRate}
                      onChange={(e) => setLiabilityFormData({ ...liabilityFormData, indexationRate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* A) Pelo Nº DE PARCELAS: sabe quantas parcelas e o saldo → calcula o VALOR da parcela. */}
                  <button
                    type="button"
                    onClick={() => {
                      // Base = SALDO DEVEDOR (o que ainda falta pagar).
                      const principal = parseFloat(liabilityFormData.remainingBalance) || 0;
                      const n = parseInt(liabilityFormData.installmentsRemaining, 10) || 0;
                      const i = (parseFloat(liabilityFormData.interestRate) || 0) / 100;
                      if (principal <= 0 || n <= 0) {
                        toast('Preencha o Saldo Devedor e a quantidade de Parcelas Restantes.', 'warning');
                        return;
                      }
                      let first = 0;
                      if (i === 0) {
                        // Sem juros → parcelas lineares (iguais).
                        first = principal / n;
                      } else if (liabilityFormData.amortizationType === 'SAC') {
                        first = (principal / n) + (principal * i); // 1ª parcela (a maior); as demais decrescem
                      } else {
                        first = principal * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1); // Price (iguais)
                      }
                      // O campo guarda a 1ª parcela SEM reajuste aplicado: ela é a âncora do
                      // cronograma, e a correção só incide a partir da 2ª parcela.
                      setLiabilityFormData(prev => ({ ...prev, installmentAmount: (Math.round(first * 100) / 100).toString() }));
                    }}
                    className="w-full py-2 rounded-xl bg-brand-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 transition-colors"
                  >
                    🧮 Descobrir o valor da parcela
                  </button>

                  {/* B) Pelo VALOR DA PARCELA: sabe o valor da parcela e o saldo → calcula QUANTAS parcelas faltam. */}
                  <button
                    type="button"
                    onClick={() => {
                      // Base = SALDO DEVEDOR; a partir do valor da 1ª parcela, descobre o nº de parcelas.
                      const principal = parseFloat(liabilityFormData.remainingBalance) || 0;
                      // A 1ª parcela é a âncora e já vem sem reajuste (a correção só incide
                      // da 2ª em diante), então entra direto no cálculo.
                      const parcela = parseFloat(liabilityFormData.installmentAmount) || 0;
                      const i = (parseFloat(liabilityFormData.interestRate) || 0) / 100;
                      if (principal <= 0 || parcela <= 0) {
                        toast('Preencha o Saldo Devedor e o Valor da Parcela.', 'warning');
                        return;
                      }
                      let n = 0;
                      if (i === 0) {
                        n = principal / parcela; // linear
                      } else if (liabilityFormData.amortizationType === 'SAC') {
                        // 1ª parcela SAC = saldo/n + saldo*i  →  n = saldo / (parcela - saldo*i)
                        const denom = parcela - principal * i;
                        if (denom <= 0) { toast('O valor da parcela é baixo demais para cobrir os juros. Aumente a parcela.', 'warning'); return; }
                        n = principal / denom;
                      } else {
                        // Price: parcela = saldo * i(1+i)^n / ((1+i)^n - 1)  →  n = -ln(1 - saldo*i/parcela) / ln(1+i)
                        const ratio = 1 - (principal * i) / parcela;
                        if (ratio <= 0) { toast('O valor da parcela é baixo demais para cobrir os juros. Aumente a parcela.', 'warning'); return; }
                        n = -Math.log(ratio) / Math.log(1 + i);
                      }
                      const nRounded = Math.max(1, Math.ceil(n));
                      setLiabilityFormData(prev => ({ ...prev, installmentsRemaining: nRounded.toString() }));
                    }}
                    className="w-full py-2 rounded-xl bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-colors"
                  >
                    🧮 Descobrir quantas parcelas faltam
                  </button>
                </div>
                <p className="text-[9px] text-slate-400 leading-normal">
                  As parcelas são geradas em Transações ao salvar. O <strong>Valor Parcela</strong> acima é a 1ª parcela:
                  no SAC as seguintes decrescem a partir dela; no Price ficam todas iguais a ela; sem juros ficam lineares.
                </p>

                {editingLiability && (
                  <label className="flex items-start gap-2 cursor-pointer bg-white border border-slate-200 rounded-xl p-3">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={forceRegenSchedule}
                      onChange={(e) => setForceRegenSchedule(e.target.checked)}
                    />
                    <span className="text-[10px] font-bold text-slate-500 leading-normal">
                      Recalcular as parcelas futuras ao salvar
                      <span className="block font-medium text-slate-400">
                        Apaga e recria só as parcelas ainda não pagas com data de hoje em diante. Parcelas já pagas e datas passadas ficam intactas.
                      </span>
                    </span>
                  </label>
                )}
              </div>

              {activePhysicalAssets.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Bem Vinculado (Opcional)</label>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-500/20"
                    value={liabilityFormData.linkedAssetId}
                    onChange={(e) => setLiabilityFormData({ ...liabilityFormData, linkedAssetId: e.target.value })}
                  >
                    <option value="">— Nenhum bem vinculado —</option>
                    {activePhysicalAssets.map(asset => (
                      <option key={asset.id} value={asset.id}>{asset.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-4 flex gap-3 border-t border-slate-100">
                <button type="button" onClick={() => { setShowLiabilityModal(false); setForceRegenSchedule(false); }} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-slate-200 transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg">Salvar Passivo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LIABILITY EXTRATO / LEDGER DETAILED VIEW WITH AMORTIZATION SYNC */}
      {selectedLiabilityForExtrato && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 print:hidden">
              <div>
                <h3 className="font-black text-slate-900 uppercase tracking-tight text-lg">
                  Extrato e Amortização de Passivo
                </h3>
                <p className="text-xs text-slate-400 font-medium">{selectedLiabilityForExtrato.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => exportLiabilityExtratoToExcel(selectedLiabilityForExtrato)} 
                  className="p-2.5 bg-white border border-slate-200 text-slate-500 hover:text-brand-600 rounded-xl flex items-center justify-center transition-all shadow-sm" 
                  title="Exportar Excel"
                  aria-label="Exportar extrato para Excel"
                >
                  <FileSpreadsheet size={16} />
                </button>
                <button 
                  onClick={() => window.print()} 
                  className="p-2.5 bg-white border border-slate-200 text-slate-500 hover:text-brand-600 rounded-xl flex items-center justify-center transition-all shadow-sm" 
                  title="Imprimir PDF"
                  aria-label="Imprimir extrato em PDF"
                >
                  <Printer size={16} />
                </button>
                <button 
                  onClick={() => {
                    handleArchiveLiability(selectedLiabilityForExtrato);
                    setSelectedLiabilityForExtrato(null);
                  }} 
                  className="p-2.5 bg-white border border-slate-200 text-slate-500 hover:text-rose-600 rounded-xl flex items-center justify-center transition-all shadow-sm" 
                  title="Arquivar Passivo"
                  aria-label="Arquivar este passivo"
                >
                  <Archive size={16} />
                </button>
                <button 
                  onClick={() => {
                    setSelectedLiabilityForExtrato(null);
                    setIsAddingLiabilityTx(false);
                  }} 
                  className="w-10 h-10 bg-white border border-slate-100 text-slate-400 hover:text-rose-500 rounded-xl flex items-center justify-center transition-all shadow-sm ml-1"
                  aria-label="Fechar modal"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Print Header */}
            <div className="hidden print:block p-8 border-b border-slate-200">
              <h2 className="text-2xl font-black text-slate-900">Zyvion – Extrato de Passivo / Dívida</h2>
              <p className="text-sm text-slate-600 mt-1">Passivo: <strong>{selectedLiabilityForExtrato.name}</strong></p>
              <p className="text-sm text-slate-600">Tipo: <strong>{selectedLiabilityForExtrato.type}</strong></p>
              <p className="text-sm text-slate-600">Emitido em: {new Date().toLocaleDateString('pt-BR')}</p>
            </div>

            {/* Content */}
            <div className="p-8 flex-1 overflow-y-auto custom-scrollbar space-y-6">
              
              {/* Financial info panels */}
              {(() => {
                const info = getLiabilityFinancialHistory(selectedLiabilityForExtrato);
                const totalAmount = selectedLiabilityForExtrato.totalAmount || 0;
                const remaining = selectedLiabilityForExtrato.remainingBalance;
                const paidPct = totalAmount > 0 ? Math.min(100, Math.round(((totalAmount - remaining) / totalAmount) * 100)) : 0;

                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Valor Original</p>
                        <p className="text-sm font-black text-slate-700">{formatCurrency(totalAmount)}</p>
                      </div>
                      <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                        <p className="text-[10px] font-black uppercase text-red-500 tracking-widest">Saldo Devedor</p>
                        <p className="text-sm font-black text-red-700">{formatCurrency(remaining)}</p>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                        <p className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Total Pago</p>
                        <p className="text-sm font-black text-emerald-700">{formatCurrency(totalAmount - remaining)}</p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-black uppercase text-slate-400">
                        <span>Progresso de Quitação</span>
                        <span>{paidPct}% quitado</span>
                      </div>
                      <div 
                        className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden"
                        role="progressbar"
                        aria-valuenow={paidPct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Progresso de quitação da dívida"
                      >
                        <div 
                          className="bg-emerald-500 h-full rounded-full transition-all" 
                          style={{ width: `${paidPct}%` }} 
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Transactions list */}
              <div className="space-y-4">
                <div className="flex justify-between items-center print:hidden">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">
                    Histórico de Pagamentos
                  </h4>
                  {!isAddingLiabilityTx && (
                    <button
                      onClick={() => {
                        setNewTxForm({
                          description: `Pagamento Parcela - ${selectedLiabilityForExtrato.name}`,
                          amount: selectedLiabilityForExtrato.installmentAmount ? String(selectedLiabilityForExtrato.installmentAmount) : '',
                          type: 'EXPENSE',
                          date: DateUtils.formatToISODate(),
                          isHistorical: false,
                          category: 'Financiamento/Dívida',
                          subcategory: 'Amortização',
                          isCapitalized: false
                        });
                        setIsAddingLiabilityTx(true);
                      }}
                      className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-colors"
                    >
                      + Lançar Pagamento
                    </button>
                  )}
                </div>

                {/* Inline form for adding transaction */}
                {isAddingLiabilityTx && (
                  <form onSubmit={handleSaveLiabilityTransaction} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 animate-in slide-in-from-top-2 print:hidden">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Descrição</label>
                        <input
                          required
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold"
                          placeholder="Ex: Pagamento Parcela"
                          value={newTxForm.description}
                          onChange={e => setNewTxForm({ ...newTxForm, description: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Valor do Pagamento (R$)</label>
                        <input
                          required
                          type="number"
                          min="0.01"
                          step="0.01"
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold"
                          placeholder="0.00"
                          value={newTxForm.amount}
                          onChange={e => setNewTxForm({ ...newTxForm, amount: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Data</label>
                        <input
                          type="date"
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                          value={newTxForm.date}
                          onChange={e => setNewTxForm({ ...newTxForm, date: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Categoria</label>
                        <input
                          readOnly
                          className="w-full bg-slate-100 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-500 outline-none"
                          value={newTxForm.category}
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <label className="flex items-center gap-2 cursor-pointer font-bold text-xs">
                        <input
                          type="checkbox"
                          checked={newTxForm.isHistorical}
                          onChange={e => setNewTxForm({ ...newTxForm, isHistorical: e.target.checked })}
                        />
                        Lançamento Passado (Não conta no Dashboard Mensal)
                      </label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setIsAddingLiabilityTx(false)} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-black uppercase">Cancelar</button>
                        <button type="submit" className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-black uppercase">Lançar</button>
                      </div>
                    </div>
                  </form>
                )}

                {/* Ledger entries list — usa fetch direto do banco (sem limitação de paginação) */}
                <div className="space-y-3">
                  {liabilityExtratoLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-brand-500" size={24} /></div>
                  ) : (() => {
                    const allTxs = liabilityExtratoTxs.length > 0 ? liabilityExtratoTxs : getLiabilityLinkedTransactions(selectedLiabilityForExtrato.id);

                    // Separa lançamentos históricos (contrato anterior) das parcelas do contrato atual
                    const historicalTxs = allTxs.filter(tx =>
                      tx.metadata?.is_historical ||
                      tx.description?.includes('Histórico') ||
                      tx.description?.includes('Recebimento de Empréstimo') ||
                      (tx.is_paid && !tx.description?.includes('(SAC)') && !tx.description?.includes('Parcela'))
                    );
                    const installmentTxs = allTxs.filter(tx => !historicalTxs.includes(tx));
                    const paidInstallments = installmentTxs.filter(tx => tx.is_paid);
                    const pendingInstallments = installmentTxs.filter(tx => !tx.is_paid);

                    if (allTxs.length === 0) return (
                      <div className="text-center py-10 border-2 border-dashed border-slate-100 rounded-2xl">
                        <History size={36} className="mx-auto text-slate-300 mb-2" />
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Nenhum pagamento registrado</p>
                        <p className="text-[10px] text-slate-400 mt-1">Lançamentos de amortização aparecerão aqui.</p>
                      </div>
                    );

                    return (
                      <div className="space-y-4">
                        {/* Bloco: Contrato Anterior (registros históricos) */}
                        {historicalTxs.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="flex-1 h-px bg-slate-100" />
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2 py-1 bg-slate-50 rounded-lg border border-slate-100">
                                Contrato Anterior — Amortização Histórica
                              </span>
                              <div className="flex-1 h-px bg-slate-100" />
                            </div>
                            {historicalTxs.map(tx => (
                              <div key={tx.id} className="flex justify-between items-center bg-slate-50 border border-slate-100 p-3 rounded-xl group hover:border-slate-200 transition-all mb-2">
                                <div className="space-y-0.5">
                                  <p className="text-xs font-bold text-slate-600">{tx.description}</p>
                                  <p className="text-[10px] text-slate-400">{DateUtils.formatDisplayDate(tx.date)} • Contrato anterior</p>
                                </div>
                                <span className="text-xs font-black text-slate-500">{formatCurrency(tx.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Bloco: Parcelas do Contrato Atual — pagas */}
                        {paidInstallments.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="flex-1 h-px bg-emerald-100" />
                              <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest px-2 py-1 bg-emerald-50 rounded-lg border border-emerald-100">
                                Contrato Atual — Pagas ({paidInstallments.length})
                              </span>
                              <div className="flex-1 h-px bg-emerald-100" />
                            </div>
                            {paidInstallments.map(tx => (
                              <div key={tx.id} className="flex justify-between items-center bg-emerald-50/50 border border-emerald-100 p-3 rounded-xl group hover:border-emerald-200 transition-all mb-2">
                                <div className="space-y-0.5">
                                  <p className="text-xs font-bold text-slate-800">{tx.description}</p>
                                  <p className="text-[10px] text-slate-400">{DateUtils.formatDisplayDate(tx.date)} • {tx.category}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-black text-rose-500">-{formatCurrency(tx.amount)}</span>
                                  <button onClick={() => handleDeleteLiabilityTransaction(tx.id, tx.amount)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-600 transition-all print:hidden" aria-label={`Excluir ${tx.description}`}>
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Bloco: Parcelas do Contrato Atual — pendentes */}
                        {pendingInstallments.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="flex-1 h-px bg-slate-100" />
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2 py-1 bg-slate-50 rounded-lg border border-slate-100">
                                Contrato Atual — Pendentes ({pendingInstallments.length} parcelas)
                              </span>
                              <div className="flex-1 h-px bg-slate-100" />
                            </div>
                            {pendingInstallments.map(tx => (
                              <div key={tx.id} className="flex justify-between items-center bg-white border border-slate-100 p-3 rounded-xl group hover:border-slate-200 transition-all mb-2">
                                <div className="space-y-0.5">
                                  <p className="text-xs font-bold text-slate-800">{tx.description}</p>
                                  <p className="text-[10px] text-slate-400">{DateUtils.formatDisplayDate(tx.date)} • Vencimento</p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-black text-slate-500">-{formatCurrency(tx.amount)}</span>
                                  <button onClick={() => handleDeleteLiabilityTransaction(tx.id, tx.amount)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-600 transition-all print:hidden" aria-label={`Excluir ${tx.description}`}>
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showWizardModal && (
        <RealEstateWizardModal
          onClose={() => setShowWizardModal(false)}
          onSuccess={() => {
            setShowWizardModal(false);
            fetchData();
          }}
        />
      )}

      {showRealEstateDetailModal && selectedRealEstateForDetail && (
        <RealEstateDetailModal
          asset={selectedRealEstateForDetail}
          onClose={() => {
            setShowRealEstateDetailModal(false);
            setSelectedRealEstateForDetail(null);
          }}
          onSuccess={() => {
            fetchData();
          }}
          transactions={transactions}
        />
      )}

      {showCategorySelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-[45px] w-full max-w-3xl max-h-[90vh] shadow-2xl overflow-hidden border border-white/20 animate-in slide-in-from-bottom-4 flex flex-col">
            <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight italic">Selecione o Tipo de Ativo</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Para onde deseja direcionar seu novo patrimônio?</p>
              </div>
              <button onClick={() => setShowCategorySelector(false)} className="w-10 h-10 bg-white border border-slate-200 text-slate-400 hover:text-rose-500 rounded-xl flex items-center justify-center transition-all shadow-sm"><X size={20} /></button>
            </div>

            <div className="p-10 grid grid-cols-1 sm:grid-cols-2 gap-6 overflow-y-auto">
              
              {/* Option 1: Imóvel */}
              <button
                onClick={() => {
                  setShowCategorySelector(false);
                  setShowWizardModal(true);
                }}
                className="p-6 bg-white border border-slate-100 hover:border-brand-500 rounded-[30px] text-left hover:shadow-xl transition-all duration-300 flex items-start gap-4 group"
              >
                <div className="w-12 h-12 bg-slate-100 group-hover:bg-slate-900 group-hover:text-white rounded-2xl flex items-center justify-center transition-colors"><Building2 size={24} /></div>
                <div className="space-y-1">
                  <h4 className="font-black text-slate-900 text-sm group-hover:text-brand-600">Ativo Imobiliário</h4>
                  <p className="text-xs text-slate-400 leading-normal font-medium">Cadastre imóveis na planta ou prontos, controle financiamentos (SAC/Price), parcelas e aluguéis.</p>
                </div>
              </button>

              {/* Option 2: Veículo */}
              <button
                onClick={() => {
                  setShowCategorySelector(false);
                  resetAssetForm();
                  setEditingAsset(null);
                  setFormData(prev => ({ ...prev, category: 'VEHICLE', purpose: 'uso' }));
                  setShowModal(true);
                }}
                className="p-6 bg-white border border-slate-100 hover:border-brand-500 rounded-[30px] text-left hover:shadow-xl transition-all duration-300 flex items-start gap-4 group"
              >
                <div className="w-12 h-12 bg-slate-100 group-hover:bg-slate-900 group-hover:text-white rounded-2xl flex items-center justify-center transition-colors"><Car size={24} /></div>
                <div className="space-y-1">
                  <h4 className="font-black text-slate-900 text-sm group-hover:text-brand-600">Veículo</h4>
                  <p className="text-xs text-slate-400 leading-normal font-medium">Adicione carros, motos ou outros veículos para acompanhamento automático da tabela FIPE.</p>
                </div>
              </button>

              {/* Option 3: Outros Bens */}
              <button
                onClick={() => {
                  setShowCategorySelector(false);
                  resetAssetForm();
                  setEditingAsset(null);
                  setFormData(prev => ({ ...prev, category: 'OTHER', purpose: 'uso' }));
                  setShowModal(true);
                }}
                className="p-6 bg-white border border-slate-100 hover:border-brand-500 rounded-[30px] text-left hover:shadow-xl transition-all duration-300 flex items-start gap-4 group"
              >
                <div className="w-12 h-12 bg-slate-100 group-hover:bg-slate-900 group-hover:text-white rounded-2xl flex items-center justify-center transition-colors"><Box size={24} /></div>
                <div className="space-y-1">
                  <h4 className="font-black text-slate-950 text-sm group-hover:text-brand-600">Outros Bens Físicos</h4>
                  <p className="text-xs text-slate-400 leading-normal font-medium">Joias, maquinários, cabeças de gado ou qualquer outro bem físico de valor de mercado.</p>
                </div>
              </button>

              {/* Option 4: Investimento / Empréstimo */}
              <div
                className="p-6 bg-white border border-slate-100 rounded-[30px] text-left flex flex-col justify-between gap-4"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center"><TrendingUp size={24} /></div>
                  <div className="space-y-1">
                    <h4 className="font-black text-slate-900 text-sm">Investimentos</h4>
                    <p className="text-xs text-slate-400 leading-normal font-medium">Controle de rendimentos financeiros ou empréstimos ativos a receber.</p>
                  </div>
                </div>
                <div className="flex gap-2 border-t pt-3">
                  <button
                    onClick={() => {
                      setShowCategorySelector(false);
                      resetAssetForm();
                      setEditingAsset(null);
                      setFormData(prev => ({ ...prev, isLoan: true, category: 'OTHER' }));
                      setShowModal(true);
                    }}
                    className="flex-1 py-2 bg-slate-950 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase text-center tracking-wider"
                  >
                    Empréstimo Concedido
                  </button>
                  <button
                    onClick={() => {
                      setShowCategorySelector(false);
                      resetAssetForm();
                      setEditingAsset(null);
                      setFormData(prev => ({ ...prev, category: 'INVESTMENT', purpose: 'investimento' }));
                      setShowModal(true);
                    }}
                    className="flex-1 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-black uppercase text-center tracking-wider"
                  >
                    Investimento Financeiro
                  </button>
                </div>
              </div>

              {/* Option 5: Passivo / Dívida */}
              <button
                onClick={() => {
                  setShowCategorySelector(false);
                  setLiabilityFormData({
                    name: '',
                    type: 'PERSONAL_LOAN',
                    totalAmount: '',
                    remainingBalance: '',
                    interestRate: '',
                    installmentAmount: '',
                    installmentsRemaining: '',
                    dueDay: '10',
                    linkedAssetId: '',
                    indexationRate: '',
                    amortizationType: 'SAC',
                    indexType: 'FIXED',
                    firstInstallmentDate: '',
                    balloonMonth: '',
                    balloonYear: '',
                    balloonAmount: '',
                    balloons: [],
                    propertyType: 'PLANTA',
                    hasHistoricalPayments: false,
                    historicalCalculationType: 'calculated',
                    historicalInstallmentsPaid: '',
                    historicalInstallmentValue: '',
                    historicalPaidAmount: ''
                  });
                  setEditingLiability(null);
                  setShowLiabilityModal(true);
                }}
                className="p-6 bg-white border border-slate-100 hover:border-brand-500 rounded-[30px] text-left hover:shadow-xl transition-all duration-300 flex items-start gap-4 group"
              >
                <div className="w-12 h-12 bg-slate-100 group-hover:bg-slate-900 group-hover:text-white rounded-2xl flex items-center justify-center transition-colors"><Landmark size={24} /></div>
                <div className="space-y-1">
                  <h4 className="font-black text-slate-900 text-sm group-hover:text-brand-600">Passivo / Dívida</h4>
                  <p className="text-xs text-slate-400 leading-normal font-medium">Empréstimos, consórcios, financiamentos não vinculados a um imóvel/veículo específico.</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {showCustomizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-[40px] w-full max-w-4xl shadow-2xl overflow-hidden border border-white/20 animate-in slide-in-from-bottom-4">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight italic flex items-center gap-2">
                  <SlidersHorizontal size={22} className="text-brand-600 animate-pulse" />
                  Personalizar Visualização do Painel
                </h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                  Ative ou desative os cartões da sua visão geral
                </p>
              </div>
              <button 
                onClick={() => setShowCustomizeModal(false)} 
                className="w-10 h-10 bg-white border border-slate-200 text-slate-400 hover:text-rose-500 rounded-xl flex items-center justify-center transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-8 max-h-[65vh] overflow-y-auto scrollbar-thin">
              
              {/* Seção 1: Cartões de Resumo */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                  <LayoutGrid size={16} className="text-slate-400" />
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                    Cartões de Resumo (Topo)
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { key: 'fluxo', label: 'Fluxo Mensal', icon: <Zap size={14} className="text-brand-500" /> },
                    { key: 'patrimonio', label: 'Patrimônio Real', icon: <Briefcase size={14} className="text-emerald-500" /> },
                    { key: 'imobiliario', label: 'Imobiliário', icon: <Building2 size={14} className="text-blue-500" /> },
                    { key: 'veiculos', label: 'Veículos', icon: <Car size={14} className="text-indigo-500" /> },
                    { key: 'outros', label: 'Outros Bens', icon: <Box size={14} className="text-slate-500" /> },
                    { key: 'financeiro', label: 'Financeiro', icon: <TrendingUp size={14} className="text-violet-500" /> },
                    { key: 'emprestimos', label: 'Empréstimos', icon: <HandCoins size={14} className="text-amber-500" /> },
                    { key: 'dividas', label: 'Dívidas', icon: <Landmark size={14} className="text-rose-500" /> },
                  ].map((item) => (
                    <div 
                      key={item.key} 
                      className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between group ${
                        visibleCards[item.key] 
                          ? 'bg-slate-50/50 border-slate-200/80 shadow-sm' 
                          : 'bg-white border-slate-100 opacity-60 hover:opacity-80'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                          visibleCards[item.key] ? 'bg-white shadow-sm border border-slate-100' : 'bg-slate-50'
                        }`}>
                          {item.icon}
                        </div>
                        <span className="text-xs font-bold text-slate-700 tracking-tight">{item.label}</span>
                      </div>
                      <button
                        onClick={() => handleToggleCardVisibility(item.key)}
                        className={`w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                          visibleCards[item.key] ? 'bg-brand-600' : 'bg-slate-200'
                        }`}
                        aria-label={`Toggle visibility of ${item.label}`}
                      >
                        <div
                          className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-300 ${
                            visibleCards[item.key] ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Seção 2: Blocos de Análise */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                  <PieChart size={16} className="text-slate-400" />
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                    Análises Detalhadas (Abaixo)
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    { key: 'detalheImobiliario', label: 'Investimento Imobiliário', icon: <Building2 size={14} className="text-blue-500" /> },
                    { key: 'detalheBensFisicos', label: 'Bens Físicos e Veículos', icon: <Car size={14} className="text-indigo-500" /> },
                    { key: 'detalheFinanceiro', label: 'Ativos Financeiros', icon: <TrendingUp size={14} className="text-violet-500" /> },
                    { key: 'detalheEmprestimos', label: 'Empréstimos a Receber', icon: <HandCoins size={14} className="text-amber-500" /> },
                    { key: 'detalheDividas', label: 'Financiamentos e Dívidas', icon: <Landmark size={14} className="text-rose-500" /> },
                    { key: 'detalhePlanejamento', label: 'Planejamento Financeiro', icon: <Target size={14} className="text-emerald-500" /> },
                  ].map((item) => (
                    <div 
                      key={item.key} 
                      className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between group ${
                        visibleCards[item.key] 
                          ? 'bg-slate-50/50 border-slate-200/80 shadow-sm' 
                          : 'bg-white border-slate-100 opacity-60 hover:opacity-80'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                          visibleCards[item.key] ? 'bg-white shadow-sm border border-slate-100' : 'bg-slate-50'
                        }`}>
                          {item.icon}
                        </div>
                        <span className="text-xs font-bold text-slate-700 tracking-tight">{item.label}</span>
                      </div>
                      <button
                        onClick={() => handleToggleCardVisibility(item.key)}
                        className={`w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                          visibleCards[item.key] ? 'bg-brand-600' : 'bg-slate-200'
                        }`}
                        aria-label={`Toggle visibility of ${item.label}`}
                      >
                        <div
                          className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-300 ${
                            visibleCards[item.key] ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4">
              <button
                onClick={() => {
                  const defaults = {
                    fluxo: true,
                    patrimonio: true,
                    imobiliario: true,
                    veiculos: true,
                    outros: true,
                    financeiro: true,
                    emprestimos: true,
                    dividas: true,
                    detalheImobiliario: true,
                    detalheBensFisicos: true,
                    detalheFinanceiro: true,
                    detalheEmprestimos: true,
                    detalheDividas: true,
                    detalhePlanejamento: true,
                  };
                  setVisibleCards(defaults);
                  localStorage.setItem('finvision_assets_visible_cards', JSON.stringify(defaults));
                }}
                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
              >
                Restaurar Padrão
              </button>
              <button
                onClick={() => setShowCustomizeModal(false)}
                className="px-6 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md hover:scale-105 transition-transform active:scale-95"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Assets;




