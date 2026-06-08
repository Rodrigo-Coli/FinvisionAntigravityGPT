import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Home as HomeIcon,
  Car,
  TrendingUp,
  Briefcase,
  ChevronRight,
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
  Landmark,
  X,
  ArrowDownRight,
  HelpCircle,
  Loader2,
  Trash2,
  Archive,
  DollarSign,
  AlertTriangle,
  History,
  Check,
  Percent,
  Calendar,
  Layers,
  ArrowRightLeft,
  Sparkles
} from 'lucide-react';
import { PhysicalAsset, InvestmentBroker, Liability, Transaction } from '../types';
import { supabase } from '../lib/supabase/client';
import { RealEstateWizardModal } from '../components/assets/RealEstateWizardModal';
import { RealEstateDetailModal } from '../components/assets/RealEstateDetailModal';
import { DateUtils } from '../lib/dateUtils';

const Assets: React.FC = () => {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<'overview' | 'realestate' | 'physical' | 'investments' | 'liabilities'>('overview');
  const [inccRate, setInccRate] = useState<number | null>(null);
  const [loadingIncc, setLoadingIncc] = useState<boolean>(false);

  // Category Selector and Real Estate detail states
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

  // Modals & Wizards States
  const [showModal, setShowModal] = useState(false);
  const [showWizardModal, setShowWizardModal] = useState(false);
  const [showLiabilityModal, setShowLiabilityModal] = useState(false);
  const [showRealEstateManageModal, setShowRealEstateManageModal] = useState(false);
  const [selectedAssetForExtrato, setSelectedAssetForExtrato] = useState<PhysicalAsset | null>(null);
  const [showExtratoModal, setShowExtratoModal] = useState(false);
  const [isAddingExtratoTx, setIsAddingExtratoTx] = useState(false);

  // Form States
  const [editingAsset, setEditingAsset] = useState<PhysicalAsset | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'REAL_ESTATE' as 'REAL_ESTATE' | 'VEHICLE' | 'OTHER',
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
    condoFee: '',
    iptuFee: '',
    inquilinoPaysCondo: false,
    inquilinoPaysIPTU: false,
    rentalType: 'anual' as 'anual' | 'short_stay',
    rentalDate: new Date().toISOString().split('T')[0],
    // Loan assets
    isLoan: false,
    loanPrincipal: '',
    loanInterestType: 'SIMPLE' as 'SIMPLE' | 'COMPOUND',
    loanInterestRate: '',
    loanFixedValue: '',
    loanDueDate: '',
    loanDebtor: '',
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
    transferFee: '',
    vehiclePurposeType: 'RENTAL' as 'RENTAL' | 'FLIP',
    ipvaFee: '',
    seguroFee: '',
    licenciamentoFee: '',
    maintenanceMonthlyEstimated: '',
    rentalPlatformFee: '',
    targetSaleValue: '',
    preparationBudget: '',
    saleComission: '',
    salePaymentMethod: 'A_VISTA' as 'A_VISTA' | 'PARCELADO' | 'PERMUTA' | 'HIBRIDO',
    permutaVeiculoValor: '',
    permutaVeiculoNome: '',
    permutaImovelValor: '',
    permutaImovelNome: '',
    permutaOutrosValor: '',
    permutaOutrosNome: '',
    permutaItems: [] as { type: 'VEHICLE' | 'REAL_ESTATE' | 'OTHER'; name: string; value: string }[],
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
    rentalDate: new Date().toISOString().split('T')[0]
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
    balloonMonth: '',
    balloonYear: '',
    balloonAmount: '',
    balloons: [] as { month: number; year: number; amount: number }[],
    propertyType: 'PLANTA' as 'PLANTA' | 'PRONTO'
  });

  // Modal new transaction local form
  const [newTxForm, setNewTxForm] = useState({
    description: '',
    amount: '',
    type: 'EXPENSE' as 'INCOME' | 'EXPENSE',
    date: new Date().toISOString().split('T')[0],
    isHistorical: false,
    category: 'Outros',
    subcategory: ''
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
        const brokerList = accs.filter((a: any) => a.type === 'INVESTMENT').map((a: any) => {
          const meta = a.metadata || {};
          return {
            id: a.id,
            name: a.institution || a.name,
            balance: Number(a.current_balance || a.balance),
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
      const [physRes, accsRes, liabsRes] = await Promise.all([
        supabase
          .from('physical_assets')
          .select('*')
          .eq('user_id', userId)
          .eq('is_archived', false)
          .order('created_at', { ascending: true }),
        supabase
          .from('accounts')
          .select('*')
          .eq('user_id', userId)
          .eq('is_archived', false),
        supabase
          .from('liabilities')
          .select('*')
          .eq('user_id', userId)
          .eq('is_archived', false)
      ]);

      if (physRes.error) throw physRes.error;
      if (accsRes.error) throw accsRes.error;
      if (liabsRes.error) throw liabsRes.error;

      const phys = physRes.data || [];
      const accs = accsRes.data || [];
      const liabs = liabsRes.data || [];

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
        is_archived: !!l.is_archived
      }));
      setLiabilities(mappedLiabs);

      // Busca os primeiros 3 blocos de transações (0 a 2999) em paralelo para reduzir drasticamente a latência de RTT da rede
      let allTxs: any[] = [];
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];

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

  // Filter out archived
  const activePhysicalAssets = useMemo(() => physicalAssets.filter(p => !p.is_archived), [physicalAssets]);
  const activeLiabilities = useMemo(() => liabilities.filter(l => !l.is_archived), [liabilities]);

  // Pre-computes and maps all transactions to their respective physical assets in O(N) linear time.
  const linkedTransactionsMap = useMemo(() => {
    const assetMatches = activePhysicalAssets.map(p => {
      const assetName = p.name.toLowerCase();
      const cleanName = assetName
        .replace(/apartamento|casa|carro|veículo|jeep|honda|audi|toyota/g, '')
        .trim();
      const firstWord = cleanName.length > 2 ? cleanName.split(/\s+/)[0] : '';
      return {
        id: p.id,
        cleanName,
        firstWord: firstWord && firstWord.length > 3 ? firstWord : ''
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

    // Rental inflows: actual paid rents of the current month using robust name matching fallback
    const totalRents = activePhysImob.reduce((acc, curr) => {
      const meta = curr.metadata || {};
      if (meta.isRented) {
        const currentMonthStr = DateUtils.formatToISODate(new Date()).substring(0, 7); // YYYY-MM
        const assetTxs = linkedTransactionsMap.get(curr.id) || [];

        const currentMonthRents = assetTxs.filter(t => 
          t.type === 'INCOME' && 
          t.isPaid &&
          t.date.substring(0, 7) === currentMonthStr
        );

        return acc + currentMonthRents.reduce((sum, tx) => sum + (tx.paidAmount || tx.amount), 0);
      }
      return acc;
    }, 0);

    // Operating expenses (Condo + IPTU if paid by owner)
    const totalOperatingCosts = activePhysImob.reduce((acc, curr) => {
      const meta = curr.metadata || {};
      let cost = 0;
      if (!meta.inquilinoPaysCondo && meta.condoFee) cost += Number(meta.condoFee);
      if (!meta.inquilinoPaysIPTU && meta.iptuFee) cost += Number(meta.iptuFee);
      return acc + cost;
    }, 0);

    // Investment yield calculation
    const activeFinancial = brokers.filter(b => !excludedBrokerIds.includes(b.id));
    const totalInvestedBalance = activeFinancial.reduce((acc, curr) => acc + curr.balance, 0);
    const estimatedMonthlyYield = totalInvestedBalance * (estimatedYieldRate / 100);

    const totalInflow = totalRents + estimatedMonthlyYield;
    const totalOutflow = totalMortgageInstallments + totalOperatingCosts + totalConsortiumInstallments + totalOtherInstallments;
    const netFlow = totalInflow - totalOutflow;
    const selfSustainabilityPercent = totalOutflow > 0 ? Math.round((totalInflow / totalOutflow) * 100) : 100;

    return {
      totalRents,
      estimatedMonthlyYield,
      totalInflow,
      totalMortgageInstallments,
      totalOperatingCosts,
      totalConsortiumInstallments,
      totalOtherInstallments,
      totalOutflow,
      netFlow,
      selfSustainabilityPercent,
      totalInvestedBalance
    };
  }, [activePhysicalAssets, activeLiabilities, brokers, excludedAssetIds, excludedConsortiumIds, excludedOtherAssetIds, excludedOtherLiabilityIds, excludedBrokerIds, estimatedYieldRate, linkedTransactionsMap]);

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

  // Sync Rental Income Transactions: Activates/Deactivates starting from today forward
  const syncRentalTransactions = async (
    assetId: string,
    isRented: boolean,
    rentalIncome: number,
    assetName: string,
    userId: string,
    rentalType: 'anual' | 'short_stay' = 'anual',
    rentalDate: string = new Date().toISOString().split('T')[0]
  ) => {
    if (!supabase) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // --- FETCH ALL TRANSACTIONS TO DYNAMICALLY AUDIT ---
      const { data: allTxs, error: fetchErr } = await supabase
        .from('transactions')
        .select('id, date, is_paid, metadata')
        .eq('user_id', userId)
        .eq('is_deleted', false);

      if (fetchErr) throw fetchErr;

      // --- CLEAN UP STRICTLY FUTURE RENTAL TRANSACTIONS ---
      // If deactivated OR type changed to short stay, delete strictly future rental income transactions (date > todayStr)
      if (!isRented || rentalType === 'short_stay' || rentalIncome <= 0) {
        const targetTxs = (allTxs || []).filter((t: any) => 
          t.metadata?.linked_asset_id === assetId && 
          t.metadata?.type === 'rental_income' && 
          t.date > todayStr // Strictly future
        );

        if (targetTxs.length > 0) {
          const idsToDelete = targetTxs.map((t: any) => t.id);
          const { error: delErr } = await supabase
            .from('transactions')
            .delete()
            .in('id', idsToDelete);
          if (delErr) throw delErr;
        }
      }

      // --- GENERATE / EXTEND ROLLING 24 MONTHS OF RENTAL INCOME FOR ANUAL ---
      if (isRented && rentalType === 'anual' && rentalIncome > 0) {
        const categoryName = 'Receitas Patrimoniais';
        let catId = '';
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
            .insert({
              user_id: userId,
              name: categoryName,
              type: 'INCOME',
              color: 'bg-emerald-50 text-emerald-600'
            })
            .select('id')
            .maybeSingle();
          if (c) catId = c.id;
        }

        const existingRentTxs = (allTxs || []).filter((t: any) => 
          t.metadata?.linked_asset_id === assetId && 
          t.metadata?.type === 'rental_income'
        );

        const today = new Date();
        const baseDate = rentalDate ? new Date(rentalDate) : today;
        const rentDay = baseDate.getDate();

        const currentMonthFirst = new Date(today.getFullYear(), today.getMonth(), rentDay);
        let startGeneratingFromDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), rentDay);

        if (existingRentTxs.length > 0) {
          const dates = existingRentTxs.map((t: any) => new Date(t.date).getTime());
          const maxTime = Math.max(...dates);
          const maxDate = new Date(maxTime);
          const nextMonthOfMax = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, rentDay);
          
          if (nextMonthOfMax.getTime() < currentMonthFirst.getTime()) {
            startGeneratingFromDate = currentMonthFirst;
          } else {
            startGeneratingFromDate = nextMonthOfMax;
          }
        }

        const horizonDate = new Date(today.getFullYear(), today.getMonth() + 23, rentDay);
        const futureRentTxs = [];
        
        let currentYear = startGeneratingFromDate.getFullYear();
        let currentMonth = startGeneratingFromDate.getMonth();
        
        while (true) {
          const currentTarget = new Date(currentYear, currentMonth, rentDay);
          if (currentTarget > horizonDate) break;
          
          const dateStr = currentTarget.toISOString().split('T')[0];
          
          if (dateStr >= todayStr) {
            futureRentTxs.push({
              user_id: userId,
              description: `Receita de Aluguel Regular - ${assetName}`,
              amount: rentalIncome,
              date: dateStr,
              type: 'INCOME',
              category: categoryName,
              category_id: catId || null,
              is_paid: false,
              paid_amount: 0,
              paid_at: null,
              metadata: {
                linked_asset_id: assetId,
                type: 'rental_income',
                auto_generated: true
              }
            });
          }
          
          currentMonth++;
          if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
          }
        }

        if (futureRentTxs.length > 0) {
          const { error: insErr } = await supabase.from('transactions').insert(futureRentTxs);
          if (insErr) throw insErr;
        }
      }
    } catch (e: any) {
      console.error("Erro ao sincronizar aluguéis:", e);
    }
  };

  const syncVehicleTransactions = async (
    vehicleId: string,
    isNew: boolean,
    userId: string,
    formValues: typeof formData
  ) => {
    if (!supabase) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
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
          description: `Taxa de Transferência/Doc - ${formValues.name}`,
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
        const comission = parseFloat(formValues.saleComission) || 0;

        // Registrar comissão de venda (se houver)
        if (comission > 0) {
          await supabase.from('transactions').insert([{
            user_id: userId,
            description: `Comissão de Venda - ${formValues.name}`,
            amount: comission,
            date: todayStr,
            type: 'EXPENSE',
            category: categoryName,
            subcategory: 'Comissão',
            category_id: catId || null,
            is_paid: true,
            paid_amount: comission,
            paid_at: todayStr,
            metadata: { linked_asset_id: vehicleId, type: 'vehicle_sale_comission' }
          }]);
        }

        // Registrar recebimento da venda
        let revenueCatId = '';
        const { data: revCat } = await supabase
          .from('categories')
          .select('id')
          .eq('user_id', userId)
          .eq('name', 'Outras Receitas')
          .maybeSingle();
        if (revCat) {
          revenueCatId = revCat.id;
        }

        if (formValues.salePaymentMethod === 'A_VISTA' || formValues.salePaymentMethod === 'HIBRIDO') {
          // Valor à vista
          let cashVal = soldAmount;
          if (formValues.salePaymentMethod === 'HIBRIDO') {
            let permutaVal = 0;
            if (Array.isArray(formValues.permutaItems)) {
              permutaVal = formValues.permutaItems.reduce((acc: number, item: any) => acc + (parseFloat(item.value) || 0), 0);
            } else {
              permutaVal = (parseFloat(formValues.permutaVeiculoValor) || 0) + (parseFloat(formValues.permutaImovelValor) || 0) + (parseFloat(formValues.permutaOutrosValor) || 0);
            }
            cashVal = Math.max(0, soldAmount - permutaVal);
          }

          if (cashVal > 0) {
            await supabase.from('transactions').insert([{
              user_id: userId,
              description: `Receita Venda de Veículo (À Vista) - ${formValues.name}`,
              amount: cashVal,
              date: todayStr,
              type: 'INCOME',
              category: 'Outras Receitas',
              subcategory: 'Venda de Ativo',
              category_id: revenueCatId || null,
              is_paid: true,
              paid_amount: cashVal,
              paid_at: todayStr,
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
            const futureDateStr = futureDate.toISOString().split('T')[0];

            newSaleInstallments.push({
              user_id: userId,
              description: `Receita Parcelada Venda (${i+1}/${parcelas}) - ${formValues.name}`,
              amount: valorParcela,
              date: futureDateStr,
              type: 'INCOME',
              category: 'Outras Receitas',
              subcategory: 'Venda de Ativo',
              category_id: revenueCatId || null,
              is_paid: false,
              metadata: { linked_asset_id: vehicleId, type: 'vehicle_sale_installment', installment: i+1 }
            });
          }
          if (newSaleInstallments.length > 0) {
            await supabase.from('transactions').insert(newSaleInstallments);
          }
        }

        // Criar bens de permuta automaticamente
        if (Array.isArray(formValues.permutaItems)) {
          const assetsToInsert = formValues.permutaItems
            .filter((item: any) => item.name && (parseFloat(item.value) || 0) > 0)
            .map((item: any) => ({
              user_id: userId,
              name: item.name,
              category: item.type,
              estimated_value: parseFloat(item.value) || 0,
              acquisition_date: todayStr,
              description: `Recebido em permuta na venda de ${formValues.name}`,
              metadata: item.type === 'REAL_ESTATE' ? { propertyStage: 'PRONTO', purpose: 'uso' } : { purpose: 'uso' }
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
              acquisition_date: todayStr,
              description: `Recebido em permuta na venda de ${formValues.name}`,
              metadata: { purpose: 'uso' }
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
              acquisition_date: todayStr,
              description: `Recebido em permuta na venda de ${formValues.name}`,
              metadata: { propertyStage: 'PRONTO', purpose: 'uso' }
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
              metadata: { purpose: 'uso' }
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

      // 3. Provisões de IPVA (Cota Única ou Parcelado em 5 vezes para simplificar)
      if (ipva > 0) {
        const parcelasIPVA = 5;
        const valorIPVA = ipva / parcelasIPVA;
        const newIpvaTxs = [];
        for (let i = 0; i < parcelasIPVA; i++) {
          const futureDate = new Date();
          futureDate.setMonth(futureDate.getMonth() + i);
          const futureDateStr = futureDate.toISOString().split('T')[0];

          newIpvaTxs.push({
            user_id: userId,
            description: `IPVA (${i+1}/${parcelasIPVA}) - ${formValues.name}`,
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

      // 4. Provisões de Seguro (Mensalizado em 10 vezes)
      if (seguro > 0) {
        const parcelasSeguro = 10;
        const valorSeguro = seguro / parcelasSeguro;
        const newSeguroTxs = [];
        for (let i = 0; i < parcelasSeguro; i++) {
          const futureDate = new Date();
          futureDate.setMonth(futureDate.getMonth() + i);
          const futureDateStr = futureDate.toISOString().split('T')[0];

          newSeguroTxs.push({
            user_id: userId,
            description: `Seguro Veicular (${i+1}/${parcelasSeguro}) - ${formValues.name}`,
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
        const futureDateStr = futureDate.toISOString().split('T')[0];

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
        
        let rentalCatId = '';
        const { data: rentCat } = await supabase
          .from('categories')
          .select('id')
          .eq('user_id', userId)
          .eq('name', 'Receita Operacional Imobiliária') // Utiliza categoria de locação existente
          .maybeSingle();
        if (rentCat) {
          rentalCatId = rentCat.id;
        }

        const newRentTxs = [];
        for (let i = 0; i < 24; i++) { // Provisão de 24 meses
          const futureDate = new Date();
          futureDate.setMonth(futureDate.getMonth() + i);
          const futureDateStr = futureDate.toISOString().split('T')[0];

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
          meta.rentalDate || new Date().toISOString().split('T')[0]
        );
      }

      const { error } = await supabase
        .from('physical_assets')
        .update({ metadata: updatedMeta })
        .eq('id', asset.id);

      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert(`Erro ao atualizar status: ${err.message}`);
    }
  };

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    try {
      const isRealEstate = formData.category === 'REAL_ESTATE';
      
      const value = isRealEstate && editingAsset 
        ? editingAsset.estimatedValue 
        : (parseFloat(formData.estimatedValue) || 0);
        
      const purchaseVal = isRealEstate && editingAsset 
        ? (parseFloat(editingAsset.metadata?.purchaseValue) || 0)
        : (parseFloat(formData.purchaseValue) || 0);
        
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
        // Loan details
        isLoan: formData.isLoan,
        loanPrincipal: loanPrincipalVal,
        loanInterestType: formData.loanInterestType,
        loanInterestRate: loanInterestRateVal,
        loanFixedValue: loanFixedValueVal,
        loanDueDate: formData.loanDueDate,
        loanDebtor: formData.loanDebtor,
        // Financing / Consortium details
        deliveryPaymentMethod: isRealEstate ? formData.deliveryPaymentMethod : undefined,
        deliveryBalance: isRealEstate ? (parseFloat(formData.deliveryBalance) || 0) : undefined,
        selectedConsortiumId: isRealEstate ? (formData.selectedConsortiumId || undefined) : undefined,
        consortiumAllocationRatio: isRealEstate && formData.selectedConsortiumId ? (parseFloat(formData.consortiumAllocationRatio) || 100) : undefined,
        financingInstallment: isRealEstate ? (parseFloat(formData.financingInstallment) || 0) : undefined,
        financingInstallmentsCount: isRealEstate ? (parseInt(formData.financingInstallmentsCount, 10) || 0) : undefined,
        financingDueDay: isRealEstate ? formData.financingDueDay : undefined,
        financingName: isRealEstate ? formData.financingName : undefined,
        financingOriginalTotal: isRealEstate ? (parseFloat(formData.financingOriginalTotal) || 0) : undefined,
        // Vehicle details
        vehicleType: formData.category === 'VEHICLE' ? formData.vehicleType : undefined,
        transferFee: formData.category === 'VEHICLE' ? (parseFloat(formData.transferFee) || 0) : undefined,
        vehiclePurposeType: formData.category === 'VEHICLE' && formData.purpose === 'investimento' ? formData.vehiclePurposeType : undefined,
        ipvaFee: formData.category === 'VEHICLE' ? (parseFloat(formData.ipvaFee) || 0) : undefined,
        seguroFee: formData.category === 'VEHICLE' ? (parseFloat(formData.seguroFee) || 0) : undefined,
        licenciamentoFee: formData.category === 'VEHICLE' ? (parseFloat(formData.licenciamentoFee) || 0) : undefined,
        maintenanceMonthlyEstimated: formData.category === 'VEHICLE' ? (parseFloat(formData.maintenanceMonthlyEstimated) || 0) : undefined,
        rentalPlatformFee: formData.category === 'VEHICLE' && formData.purpose === 'investimento' ? (parseFloat(formData.rentalPlatformFee) || 0) : undefined,
        targetSaleValue: formData.category === 'VEHICLE' && formData.purpose === 'investimento' ? (parseFloat(formData.targetSaleValue) || 0) : undefined,
        preparationBudget: formData.category === 'VEHICLE' && formData.purpose === 'investimento' ? (parseFloat(formData.preparationBudget) || 0) : undefined,
        saleComission: formData.category === 'VEHICLE' && formData.isSold ? (parseFloat(formData.saleComission) || 0) : undefined,
        salePaymentMethod: formData.category === 'VEHICLE' && formData.isSold ? formData.salePaymentMethod : undefined,
        permutaVeiculoValor: formData.category === 'VEHICLE' && formData.isSold ? (parseFloat(formData.permutaVeiculoValor) || 0) : undefined,
        permutaVeiculoNome: formData.category === 'VEHICLE' && formData.isSold ? formData.permutaVeiculoNome : undefined,
        permutaImovelValor: formData.category === 'VEHICLE' && formData.isSold ? (parseFloat(formData.permutaImovelValor) || 0) : undefined,
        permutaImovelNome: formData.category === 'VEHICLE' && formData.isSold ? formData.permutaImovelNome : undefined,
        permutaOutrosValor: formData.category === 'VEHICLE' && formData.isSold ? (parseFloat(formData.permutaOutrosValor) || 0) : undefined,
        permutaOutrosNome: formData.category === 'VEHICLE' && formData.isSold ? formData.permutaOutrosNome : undefined,
        permutaItems: formData.category === 'VEHICLE' && formData.isSold ? formData.permutaItems : undefined,
      };

      // Preserve existing real estate evolution details if editing
      if (isRealEstate && editingAsset) {
        const oldMeta = editingAsset.metadata || {};
        metadata.condoFee = oldMeta.condoFee;
        metadata.iptuFee = oldMeta.iptuFee;
        metadata.inquilinoPaysCondo = oldMeta.inquilinoPaysCondo;
        metadata.inquilinoPaysIPTU = oldMeta.inquilinoPaysIPTU;
        metadata.condoPayer = oldMeta.condoPayer;
        metadata.iptuPayer = oldMeta.iptuPayer;
        metadata.condoNextDate = oldMeta.condoNextDate;
        metadata.iptuNextDate = oldMeta.iptuNextDate;
        metadata.iptuFrequency = oldMeta.iptuFrequency;
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
        // UPDATE existing asset
        const { error } = await supabase
          .from('physical_assets')
          .update({
            name: formData.name,
            category: formData.category,
            estimated_value: value,
            acquisition_date: acqDate,
            description: formData.description,
            metadata
          })
          .eq('id', editingAsset.id);

        if (error) throw error;
        assetId = editingAsset.id;

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
                const acquisitionDateStr = editingAsset.acquisitionDate || new Date().toISOString().split('T')[0];
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

          await syncRentalTransactions(
            editingAsset.id,
            finalIsRented,
            rentVal,
            formData.name,
            user.id,
            formData.rentalType,
            formData.rentalDate
          );
        }
        if (formData.category === 'VEHICLE') {
          await syncVehicleTransactions(editingAsset.id, false, user.id, formData);
        }
      } else {
        // INSERT new asset
        const { data: newAsset, error } = await supabase
          .from('physical_assets')
          .insert([{
            user_id: user.id,
            name: formData.name,
            category: formData.category,
            estimated_value: value,
            acquisition_date: acqDate,
            description: formData.description,
            metadata
          }])
          .select()
          .single();

        if (error) throw error;
        if (newAsset) assetId = newAsset.id;

        if (isRealEstate && newAsset) {
          await syncRentalTransactions(
            newAsset.id,
            finalIsRented,
            rentVal,
            formData.name,
            user.id,
            formData.rentalType,
            formData.rentalDate
          );
        }

        if (formData.category === 'VEHICLE' && newAsset) {
          await syncVehicleTransactions(newAsset.id, true, user.id, formData);
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
          const todayStr = new Date().toISOString().split('T')[0];
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

      setShowModal(false);
      setEditingAsset(null);
      resetAssetForm();
      fetchData();
      alert('Ativo salvo com sucesso!');
    } catch (err: any) {
      alert(`Erro ao salvar ativo: ${err.message}`);
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
      condoFee: '',
      iptuFee: '',
      inquilinoPaysCondo: false,
      inquilinoPaysIPTU: false,
      rentalType: 'anual',
      rentalDate: new Date().toISOString().split('T')[0],
      isLoan: false,
      loanPrincipal: '',
      loanInterestType: 'SIMPLE',
      loanInterestRate: '',
      loanFixedValue: '',
      loanDueDate: '',
      loanDebtor: '',
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
      transferFee: '',
      vehiclePurposeType: 'RENTAL',
      ipvaFee: '',
      seguroFee: '',
      licenciamentoFee: '',
      maintenanceMonthlyEstimated: '',
      rentalPlatformFee: '',
      targetSaleValue: '',
      preparationBudget: '',
      saleComission: '',
      salePaymentMethod: 'A_VISTA',
      permutaVeiculoValor: '',
      permutaVeiculoNome: '',
      permutaImovelValor: '',
      permutaImovelNome: '',
      permutaOutrosValor: '',
      permutaOutrosNome: '',
      permutaItems: [],
    });
  };

  const openEditAsset = (asset: PhysicalAsset) => {
    setEditingAsset(asset);
    const meta = asset.metadata || {};
    
    const linkedLiab = activeLiabilities.find(l => l.linkedAssetId === asset.id);
    let devPayMethod: 'A_VISTA' | 'FINANCIAMENTO' | 'CONSORCIO' | 'A_DEFINIR' = 'A_VISTA';
    let selConsortiumId = '';
    let consAllocRatio = '100';
    let finOrigTotal = '';
    let finInst = '';
    let finInstCount = '';
    let finDueDay = '10';
    let finName = `Financiamento: ${asset.name}`;
    let devBal = '';

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
      condoFee: meta.condoFee ? String(meta.condoFee) : '',
      iptuFee: meta.iptuFee ? String(meta.iptuFee) : '',
      inquilinoPaysCondo: !!meta.inquilinoPaysCondo,
      inquilinoPaysIPTU: !!meta.inquilinoPaysIPTU,
      rentalType: meta.rentalType || 'anual',
      rentalDate: meta.rentalDate || new Date().toISOString().split('T')[0],
      isLoan: !!meta.isLoan,
      loanPrincipal: meta.loanPrincipal ? String(meta.loanPrincipal) : '',
      loanInterestType: meta.loanInterestType || 'SIMPLE',
      loanInterestRate: meta.loanInterestRate ? String(meta.loanInterestRate) : '',
      loanFixedValue: meta.loanFixedValue ? String(meta.loanFixedValue) : '',
      loanDueDate: meta.loanDueDate || '',
      loanDebtor: meta.loanDebtor || '',
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
      transferFee: meta.transferFee ? String(meta.transferFee) : '',
      vehiclePurposeType: meta.vehiclePurposeType || 'RENTAL',
      ipvaFee: meta.ipvaFee ? String(meta.ipvaFee) : '',
      seguroFee: meta.seguroFee ? String(meta.seguroFee) : '',
      licenciamentoFee: meta.licenciamentoFee ? String(meta.licenciamentoFee) : '',
      maintenanceMonthlyEstimated: meta.maintenanceMonthlyEstimated ? String(meta.maintenanceMonthlyEstimated) : '',
      rentalPlatformFee: meta.rentalPlatformFee ? String(meta.rentalPlatformFee) : '',
      targetSaleValue: meta.targetSaleValue ? String(meta.targetSaleValue) : '',
      preparationBudget: meta.preparationBudget ? String(meta.preparationBudget) : '',
      saleComission: meta.saleComission ? String(meta.saleComission) : '',
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
    });
    setShowModal(true);
  };

  const handleArchiveAsset = async (asset: PhysicalAsset) => {
    if (!supabase) return;
    if (!window.confirm(`Tem certeza que deseja arquivar o bem "${asset.name}"?`)) return;
    try {
      const { error } = await supabase
        .from('physical_assets')
        .update({ is_archived: true })
        .eq('id', asset.id);

      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert(`Erro ao arquivar: ${err.message}`);
    }
  };

  const handleDeleteAsset = async (asset: PhysicalAsset) => {
    if (!supabase) return;
    if (!window.confirm(`Atenção: Excluir o bem "${asset.name}" removerá permanentemente o ativo. Suas transações vinculadas serão mantidas para integridade histórica. Deseja continuar?`)) return;
    try {
      const { error } = await supabase
        .from('physical_assets')
        .delete()
        .eq('id', asset.id);

      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert(`Erro ao excluir: ${err.message}`);
    }
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
        rentalDate: meta.rentalDate || new Date().toISOString().split('T')[0]
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
        rentalDate: meta.rentalDate || new Date().toISOString().split('T')[0]
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
            const todayStr = new Date().toISOString().split('T')[0];
            await supabase.from('transactions').insert([{
              user_id: user.id,
              description: `Quitação Saldo Chaves - ${asset.name}`,
              amount: balance,
              date: todayStr,
              type: 'EXPENSE',
              category: 'Habitação',
              is_paid: true,
              paid_amount: balance,
              paid_at: todayStr,
              metadata: {
                linked_asset_id: asset.id,
                type: 'delivery_quitacao'
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
      alert(`Erro ao salvar os ajustes: ${err.message}`);
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
            balloons: liabilityFormData.balloons,
            propertyType: liabilityFormData.type === 'MORTGAGE' ? (liabilityFormData.propertyType || 'PLANTA') : undefined,
            isRealEstate: liabilityFormData.type === 'MORTGAGE' ? true : undefined
          }
        }).eq('id', editingLiability.id);
        if (error) throw error;

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
            balloons: liabilityFormData.balloons,
            propertyType: liabilityFormData.type === 'MORTGAGE' ? (liabilityFormData.propertyType || 'PLANTA') : undefined,
            isRealEstate: liabilityFormData.type === 'MORTGAGE' ? true : undefined
          }
        }]).select();

        if (error) throw error;

        // Auto-generate future pending cash flow transactions
        if (newLiab && newLiab.length > 0 && installmentAmt > 0 && installmentsLeft > 0) {
          const liabilityId = newLiab[0].id;
          const today = new Date();
          const categoryName = 'Financiamento/Dívida';

          const { data: existingCat } = await supabase.from('categories')
            .select('id').eq('user_id', user.id).eq('name', categoryName).single();

          let catId = '';
          if (!existingCat) {
            const { data: c } = await supabase.from('categories').insert({
              user_id: user.id,
              name: categoryName,
              type: 'EXPENSE',
              color: 'bg-rose-50 text-rose-600'
            }).select('id').single();
            if (c) catId = c.id;
          } else {
            catId = existingCat.id;
          }

          const futureTransactions = [];
          const MAX_GENERATE = Math.min(installmentsLeft, 120); // Safety cap for bulk generation
          for (let i = 1; i <= MAX_GENERATE; i++) {
            const txDate = new Date(today.getFullYear(), today.getMonth() + i, dueDay);
            futureTransactions.push({
              user_id: user.id,
              description: `Parcela ${i}/${installmentsLeft} - ${liabilityFormData.name}`,
              amount: installmentAmt,
              date: txDate.toISOString().split('T')[0],
              type: 'EXPENSE',
              category: categoryName,
              category_id: catId || null,
              is_paid: false,
              is_recurring: true,
              is_installment: true,
              installment_number: i,
              installment_total: installmentsLeft,
              installment_group_id: liabilityId,
              liability_id: liabilityId,
              metadata: {
                auto_generated: true,
                installment_number: i,
                installment_group_id: liabilityId,
                linked_asset_id: liabilityFormData.linkedAssetId || undefined
              }
            });
          }

          await supabase.from('transactions').insert(futureTransactions);
        }
      }

      setShowLiabilityModal(false);
      setEditingLiability(null);
      setLiabilityFormData({ name: '', type: 'PERSONAL_LOAN', totalAmount: '', remainingBalance: '', interestRate: '', installmentAmount: '', installmentsRemaining: '', dueDay: '', linkedAssetId: '', indexationRate: '', balloonMonth: '', balloonYear: '', balloonAmount: '', balloons: [], propertyType: 'PLANTA' });
      fetchData();
    } catch (err: any) {
      alert(`Erro ao salvar passivo: ${err.message}`);
    }
  };

  const openEditLiability = (liability: any) => {
    setEditingLiability(liability);
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
      balloonMonth: '',
      balloonYear: '',
      balloonAmount: '',
      balloons: liability.metadata?.balloons || [],
      propertyType: liability.metadata?.propertyType || 'PLANTA'
    });
    setShowLiabilityModal(true);
  };

  const handleDeleteLiability = async (id: string) => {
    if (!supabase) return;
    if (!window.confirm("Certeza que deseja excluir este passivo? Ele será removido do seu patrimônio físico.")) return;
    try {
      const { error } = await supabase.from('liabilities').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert(`Erro ao excluir passivo: ${err.message}`);
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
        alert("Preencha um valor válido.");
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
        date: new Date().toISOString().split('T')[0],
        isHistorical: false,
        category: 'Outros',
        subcategory: ''
      });
      
      // Update selected asset representation locally to reflect the new transaction
      fetchData();
    } catch (err: any) {
      alert(`Erro ao adicionar lançamento: ${err.message}`);
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
      alert(`Erro ao deletar lançamento: ${err.message}`);
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  // Totals calculations
  const totalPhysical = activePhysicalAssets.reduce((acc, curr) => acc + curr.estimatedValue, 0);
  const totalFinancial = brokers.reduce((acc, curr) => acc + curr.balance, 0);
  const totalLiabilities = activeLiabilities.reduce((acc, curr) => acc + curr.remainingBalance, 0);
  const totalAssets = totalPhysical + totalFinancial;
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
    const activePhys = activePhysicalAssets;
    const activeLiab = activeLiabilities;

    // Helper to dynamically link a liability to an asset with name substring fallback
    const isLiabilityLinkedToAsset = (l: Liability, p: PhysicalAsset) => {
      if (l.linkedAssetId === p.id) return true;
      const assetNameClean = p.name.toLowerCase()
        .replace(/apartamento|casa|carro|veículo|jeep|honda|audi|toyota/g, '')
        .trim();
      const liabNameClean = l.name.toLowerCase()
        .replace(/financiamento|consórcio|consorcio|dívida|divida/g, '')
        .trim();
      if (assetNameClean.length > 2 && liabNameClean.includes(assetNameClean)) return true;
      const firstWord = assetNameClean.split(/\s+/)[0];
      if (firstWord && firstWord.length > 3 && liabNameClean.includes(firstWord)) return true;
      return false;
    };

    // 1. INVESTIMENTO IMOBILIÁRIO SUMS
    const plantaAssets = activePhys.filter(p => p.category === 'REAL_ESTATE' && p.metadata?.propertyStage === 'PLANTA');
    const prontoAssets = activePhys.filter(p => p.category === 'REAL_ESTATE' && p.metadata?.propertyStage !== 'PLANTA');

    const plantaValue = plantaAssets.reduce((sum, p) => sum + p.estimatedValue, 0);
    const plantaLiabs = activeLiab.filter(l => plantaAssets.some(p => isLiabilityLinkedToAsset(l, p)));
    const plantaInstallments = plantaLiabs.reduce((sum, l) => sum + (l.installmentAmount || 0), 0);
    
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
    const plantaAmortizationPaid = plantaLiabAmortized > 0 ? plantaLiabAmortized : plantaTxAmortized;

    const plantaLiabRemaining = plantaLiabs.reduce((sum, l) => sum + l.remainingBalance, 0);
    const plantaBalloonsRemaining = plantaAssets.reduce((sum, p) => {
      const balloonsList = p.metadata?.balloons || [];
      return sum + balloonsList.reduce((acc: number, b: any) => acc + (Number(b.amount) || 0), 0);
    }, 0);
    const plantaRemainingToPay = plantaLiabRemaining + plantaBalloonsRemaining;

    const plantaAdditionalExpenses = plantaTxs.filter(t => 
      t.type === 'EXPENSE' && 
      !t.is_recurring && 
      t.metadata?.type !== 'delivery_quitacao'
    ).reduce((sum, t) => sum + t.amount, 0);

    const prontoValue = prontoAssets.reduce((sum, p) => sum + p.estimatedValue, 0);
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
    const prontoAmortizationPaid = prontoLiabAmortized > 0 ? prontoLiabAmortized : prontoTxAmortized;

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
    
    const financialAllocation = brokers.map(b => {
      const type = b.metadata?.productType || 'Investimentos';
      return { type, balance: b.balance };
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

    // Yield transactions (categories Rendimentos/Investimentos or metadata type)
    const yieldTxs = transactions.filter(t => 
      t.type === 'INCOME' && 
      (t.category === 'Rendimentos' || t.category === 'Investimentos' || t.metadata?.type === 'investment_yield')
    );

    const currentMonthYield = yieldTxs.filter(t => 
      t.date.substring(0, 7) === currentMonthStr
    ).reduce((sum, t) => sum + t.amount, 0);

    const uniqueMonths = Array.from(new Set(yieldTxs.map(t => t.date.substring(0, 7))));
    const averageMonthlyYield = uniqueMonths.length > 0 ? yieldTxs.reduce((sum, t) => sum + t.amount, 0) / uniqueMonths.length : 0;

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

    return {
      plantaValue,
      plantaInstallments,
      plantaPaid: plantaAmortizationPaid,
      plantaRemainingToPay,
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
      finRemaining
    };
  }, [activePhysicalAssets, activeLiabilities, brokers, transactions, totalFinancial, linkedTransactionsMap]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <div className="w-10 h-10 border-2 border-slate-200 border-t-brand-600 rounded-full animate-spin" />
        <p className="text-slate-400 font-medium tracking-widest text-[10px] uppercase">Carregando Patrimônio Líquido...</p>
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
        <div className="flex gap-3">
          <button
            onClick={() => setShowCategorySelector(true)}
            className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform active:scale-95"
          >
            <Plus size={18} /> Novo Ativo
          </button>
        </div>
      </div>

      {/* NAVIGATION TABS - IMMEDIATELY ACCESSIBLE AT TOP */}
      <div className="flex gap-2 p-1.5 bg-slate-50 border border-slate-100 rounded-2xl w-full max-w-full overflow-x-auto scrollbar-hide">
        {[
          { id: 'overview', label: 'Visão Geral', icon: <LayoutGrid size={16} /> },
          { id: 'realestate', label: 'Ativos Imobiliários', icon: <Building2 size={16} /> },
          { id: 'physical', label: 'Bens Físicos', icon: <Box size={16} /> },
          { id: 'investments', label: 'Investimentos', icon: <TrendingUp size={16} /> },
          { id: 'liabilities', label: 'Passivos (Dívidas)', icon: <Landmark size={16} /> }
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
            {/* COMPACT TOTALS GRID (6 Cards) */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* Fluxo Mensal */}
              <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-4 shadow-md flex flex-col justify-between min-h-[110px] relative overflow-hidden group hover:scale-[1.02] transition-all col-span-2 sm:col-span-1">
                <div className="absolute -right-4 -bottom-4 w-12 h-12 bg-white/5 rounded-full pointer-events-none" />
                <div className="flex justify-between items-start">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Fluxo Mensal</span>
                  <Zap size={14} className="text-brand-400" />
                </div>
                <div className="mt-1 space-y-0.5">
                  <div className="flex justify-between text-[9px] text-slate-400">
                    <span>Recebimentos:</span>
                    <span className="font-bold text-emerald-400">{formatCurrency(sustainabilitySummary.totalInflow)}</span>
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-400">
                    <span>Despesas:</span>
                    <span className="font-bold text-rose-400">{formatCurrency(sustainabilitySummary.totalOutflow)}</span>
                  </div>
                  <div className="flex justify-between items-baseline border-t border-slate-800 pt-1 mt-1">
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Saldo</span>
                    <span className={`text-base font-black tracking-tight italic ${sustainabilitySummary.netFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {sustainabilitySummary.netFlow >= 0 ? '+' : ''}{formatCurrency(sustainabilitySummary.netFlow)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Patrimônio Líquido */}
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col justify-between min-h-[110px] hover:scale-[1.02] transition-all">
                <div className="flex justify-between items-start">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Patrimônio Real</span>
                  <TrendingUp size={14} className="text-emerald-500" />
                </div>
                <div className="mt-2">
                  <h4 className="text-base font-black text-slate-900 tracking-tight italic">
                    {formatCurrency(totalNetWorth)}
                  </h4>
                  <span className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest">Líquido</span>
                </div>
              </div>

              {/* Investimento Imobiliário */}
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col justify-between min-h-[110px] hover:scale-[1.02] transition-all">
                <div className="flex justify-between items-start">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Imobiliário</span>
                  <Building2 size={14} className="text-brand-500" />
                </div>
                <div className="mt-2">
                  <h4 className="text-base font-black text-slate-900 tracking-tight italic">
                    {formatCurrency(overviewData.plantaValue + overviewData.prontoValue)}
                  </h4>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Planta + Pronto</span>
                </div>
              </div>

              {/* Bens Físicos */}
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col justify-between min-h-[110px] hover:scale-[1.02] transition-all">
                <div className="flex justify-between items-start">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Bens Físicos</span>
                  <Box size={14} className="text-brand-500" />
                </div>
                <div className="mt-2">
                  <h4 className="text-base font-black text-slate-900 tracking-tight italic">
                    {formatCurrency(overviewData.usoCurrentValueTotal + overviewData.invEstimatedValue)}
                  </h4>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Uso + Inv.</span>
                </div>
              </div>

              {/* Investimentos Financeiros */}
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col justify-between min-h-[110px] hover:scale-[1.02] transition-all">
                <div className="flex justify-between items-start">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Financeiro</span>
                  <PieChart size={14} className="text-brand-500" />
                </div>
                <div className="mt-2">
                  <h4 className="text-base font-black text-brand-600 tracking-tight italic">
                    {formatCurrency(overviewData.totalFinancialFunds)}
                  </h4>
                  <span className="text-[8px] font-bold text-brand-500 uppercase tracking-widest">Corretoras</span>
                </div>
              </div>

              {/* Passivos e Dívidas */}
              <div className="bg-red-50/30 border border-red-100/50 rounded-2xl p-4 shadow-sm flex flex-col justify-between min-h-[110px] hover:scale-[1.02] transition-all">
                <div className="flex justify-between items-start">
                  <span className="text-[9px] font-black uppercase tracking-wider text-red-500">Dívidas</span>
                  <Landmark size={14} className="text-red-500" />
                </div>
                <div className="mt-2">
                  <h4 className="text-base font-black text-red-600 tracking-tight italic">
                    {formatCurrency(totalLiabilities)}
                  </h4>
                  <span className="text-[8px] font-bold text-red-400 uppercase tracking-widest">Saldo Devedor</span>
                </div>
              </div>
            </div>

            {/* 4 DETAILED ANALYTICS SECTIONS (2x2 Grid) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Bloco A: Investimento Imobiliário */}
              <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-900 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                      <Building2 size={18} />
                    </div>
                    Investimento Imobiliário (Planta vs Entregue)
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Planta Stage */}
                  <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3.5">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1.5">
                      🏗️ Na Planta / Em Obras
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
                        <span className="font-bold text-slate-900">{formatCurrency(overviewData.plantaPaid)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Restante a Pagar:</span>
                        <span className="font-bold text-brand-600">{formatCurrency(overviewData.plantaRemainingToPay)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Despesas Extras/Balões:</span>
                        <span className="font-bold text-slate-900">{formatCurrency(overviewData.plantaAdditionalExpenses)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Pronto Stage */}
                  <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3.5">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between items-center">
                      <span>🏢 Imóveis Entregues</span>
                    </p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Valor Estimado:</span>
                        <span className="font-bold text-slate-900">{formatCurrency(overviewData.prontoValue)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Prestação Financiamento:</span>
                        <span className="font-bold text-slate-900">{formatCurrency(overviewData.prontoInstallments)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Financiamento Contratado:</span>
                        <span className="font-bold text-slate-900">{formatCurrency(overviewData.prontoContracted)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Saldo Devedor Restante:</span>
                        <span className="font-bold text-red-500">{formatCurrency(overviewData.prontoRemainingToPay)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Custos Operacionais:</span>
                        <span className="font-bold text-slate-900">{formatCurrency(overviewData.prontoOperatingCosts)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Total Pago Financiamento:</span>
                        <span className="font-bold text-emerald-600">{formatCurrency(overviewData.prontoPaid)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Aluguéis Recebidos:</span>
                        <span className="font-bold text-emerald-600">{formatCurrency(overviewData.prontoReceived)}</span>
                      </div>
                      <div className="flex justify-between text-xs border-t border-slate-200 pt-1.5 mt-1">
                        <span className="text-slate-600 font-bold">Mensal Líquido (Mês Atual):</span>
                        <span className={`font-black ${overviewData.prontoMonthlyNetFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {overviewData.prontoMonthlyNetFlow >= 0 ? '+' : ''}{formatCurrency(overviewData.prontoMonthlyNetFlow)}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs border-t border-slate-200 pt-1.5 mt-1">
                        <span className="text-slate-600 font-bold">Fluxo Histórico Líquido (Se Vender):</span>
                        <span className={`font-black ${overviewData.prontoNetFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {overviewData.prontoNetFlow >= 0 ? '+' : ''}{formatCurrency(overviewData.prontoNetFlow)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bloco B: Bens Físicos */}
              <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-900 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                      <Box size={18} />
                    </div>
                    Bens Físicos (Uso vs Investimento)
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Para Uso */}
                  <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3.5">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1.5">
                      🚗 Para Uso Pessoal
                    </p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Custo de Aquisição:</span>
                        <span className="font-bold text-slate-900">{formatCurrency(overviewData.usoAcquisitionTotal)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Valor Estimado FIPE:</span>
                        <span className="font-bold text-slate-900">{formatCurrency(overviewData.usoCurrentValueTotal)}</span>
                      </div>
                      <div className="flex justify-between text-xs border-t border-slate-200 pt-1.5 mt-1">
                        <span className="text-slate-600 font-bold">Ágio / Deságio:</span>
                        <span className={`font-black flex items-center gap-1 ${overviewData.usoAgioDesagio >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {overviewData.usoAgioDesagio >= 0 ? '+' : ''}{formatCurrency(overviewData.usoAgioDesagio)}
                          <span className="text-[9px] font-bold">({overviewData.usoAgioDesagioPercent.toFixed(1)}%)</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Para Investimento */}
                  <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3.5">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1.5">
                      📈 Para Investimento / Venda
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
                        <span className="text-slate-600 font-bold">Lucro Líquido Est.:</span>
                        <span className={`font-black flex items-center gap-1 ${overviewData.invNetProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {overviewData.invNetProfit >= 0 ? '+' : ''}{formatCurrency(overviewData.invNetProfit)}
                          <span className="text-[9px] font-bold">({overviewData.invProfitPercent.toFixed(1)}% ROI)</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bloco C: Investimentos Financeiros */}
              <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-900 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                      <TrendingUp size={18} />
                    </div>
                    Investimentos Financeiros
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Allocation */}
                  <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1.5">
                      📊 Alocação por Classe
                    </p>
                    <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                      {overviewData.allocationList.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">Sem investimentos cadastrados.</p>
                      ) : (
                        overviewData.allocationList.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-xs">
                            <span className="text-slate-500 font-medium truncate max-w-[120px]">{item.type}</span>
                            <span className="font-bold text-slate-900">
                              {formatCurrency(item.balance)} <span className="text-[9px] font-medium text-slate-400">({item.percentage}%)</span>
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Monthly Yield comparison */}
                  <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1.5">
                      💵 Rendimentos da Carteira
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
                      <div className="p-3 bg-brand-50 rounded-xl mt-2">
                        <p className="text-[10px] text-brand-600 leading-relaxed font-medium">
                          Sua carteira gera aproximadamente <span className="font-bold text-brand-700">{formatCurrency(sustainabilitySummary.estimatedMonthlyYield)}</span> de dividendos implícitos por mês baseado em taxa média mensal de {estimatedYieldRate}%.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bloco D: Passivos e Dívidas */}
              <div className="bg-white p-6 sm:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-900 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                      <Landmark size={18} />
                    </div>
                    Passivos e Dívidas (Financiamentos vs Consórcios)
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Consórcios */}
                  <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3.5">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1.5">
                      💳 Consórcios Ativos
                    </p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Parcelas Mensais:</span>
                        <span className="font-bold text-slate-900">{formatCurrency(overviewData.consInstallments)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Total Contratado:</span>
                        <span className="font-bold text-slate-900">{formatCurrency(overviewData.consContracted)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Total Pago:</span>
                        <span className="font-bold text-slate-900">{formatCurrency(overviewData.consPaid)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Lances Ofertados:</span>
                        <span className="font-bold text-slate-900">{formatCurrency(overviewData.consLances)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Cartas em Obras/Uso:</span>
                        <span className="font-bold text-slate-950">{formatCurrency(overviewData.consUtilized)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Cartas Livres:</span>
                        <span className="font-bold text-brand-600">{formatCurrency(overviewData.consToContemplate)}</span>
                      </div>
                      <div className="flex justify-between text-xs border-t border-slate-200 pt-1.5 mt-1">
                        <span className="text-slate-600 font-bold">Saldo Devedor:</span>
                        <span className="font-black text-red-600">{formatCurrency(overviewData.consRemaining)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Financiamentos */}
                  <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-3.5">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-1.5">
                      🏛️ Financiamentos Gerais
                    </p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Prestações Mensais:</span>
                        <span className="font-bold text-slate-900">{formatCurrency(overviewData.finInstallments)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Total Contratado:</span>
                        <span className="font-bold text-slate-900">{formatCurrency(overviewData.finContracted)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-medium">Total Pago:</span>
                        <span className="font-bold text-slate-900">{formatCurrency(overviewData.finPaid)}</span>
                      </div>
                      <div className="flex justify-between text-xs border-t border-slate-200 pt-1.5 mt-1">
                        <span className="text-slate-600 font-bold">Saldo Devedor Restante:</span>
                        <span className="font-black text-red-600">{formatCurrency(overviewData.finRemaining)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* REAL ESTATE VIEW */}
        {activeView === 'realestate' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 gap-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight italic flex items-center gap-2">
                  <Building2 size={20} className="text-slate-500" />
                  Seus Ativos Imobiliários
                </h3>
              </div>
              <button
                onClick={() => setShowWizardModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-brand-200 text-brand-600 rounded-xl text-xs font-bold shadow-sm hover:bg-brand-50 hover:scale-105 transition-transform active:scale-95"
              >
                <Building2 size={16} /> Aquisição Imobiliária
              </button>
            </div>

            <div className="space-y-8">
              {/* Filter Bar for Real Estate Card Metrics */}
              <div className="bg-slate-50 p-4 rounded-[25px] border border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acompanhamento de Caixa:</span>
                  <div className="flex overflow-x-auto scrollbar-hide bg-slate-200/50 p-0.5 rounded-lg border w-full sm:w-auto max-w-[calc(100vw-48px)] sm:max-w-none">
                    <button onClick={() => setCardPeriod('CONTRACT')} className={`px-3 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-all flex-shrink-0 ${cardPeriod === 'CONTRACT' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Contrato</button>
                    <button onClick={() => setCardPeriod('CURRENT_MONTH')} className={`px-3 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-all flex-shrink-0 ${cardPeriod === 'CURRENT_MONTH' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Mês Atual</button>
                    <button onClick={() => setCardPeriod('PREVIOUS_MONTH')} className={`px-3 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-all flex-shrink-0 ${cardPeriod === 'PREVIOUS_MONTH' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Mês Anterior</button>
                    <button onClick={() => setCardPeriod('CURRENT_YEAR')} className={`px-3 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-all flex-shrink-0 ${cardPeriod === 'CURRENT_YEAR' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Anual</button>
                    <button onClick={() => setCardPeriod('CUSTOM')} className={`px-3 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-all flex-shrink-0 ${cardPeriod === 'CUSTOM' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Personalizado</button>
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

              {/* Real Estate Active Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {activePhysicalAssets.filter(p => p.category === 'REAL_ESTATE').map(asset => {
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
                      className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden hover:shadow-xl transition-all duration-500 flex flex-col justify-between cursor-pointer text-left"
                    >
                      <div className="p-6 sm:p-8 space-y-5 sm:space-y-6">
                        <div className="flex justify-between items-start">
                          <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-slate-900/10">
                            <HomeIcon size={22} />
                          </div>
                          <div className="flex flex-wrap gap-1.5 justify-end">
                            {propertyStage === 'PLANTA' ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); togglePropertyTypeDirectly(asset); }}
                                className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-xl text-[8px] font-black uppercase tracking-widest border border-amber-100 transition-colors"
                              >
                                Na Planta 🛠️
                              </button>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); togglePropertyTypeDirectly(asset); }}
                                className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-xl text-[8px] font-black uppercase tracking-widest border border-emerald-100 transition-colors"
                              >
                                Pronto / Entregue 🏢
                              </button>
                            )}
                            {meta.purpose === 'investimento' ? (
                              <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-xl text-[8px] font-black uppercase tracking-widest border border-indigo-100">Investimento</span>
                            ) : (
                              <span className="px-3 py-1 bg-slate-50 text-slate-600 rounded-xl text-[8px] font-black uppercase tracking-widest border border-slate-100">Uso Próprio</span>
                            )}
                          </div>
                        </div>

                        <div>
                          <h4 className="font-black text-slate-900 text-lg sm:text-xl tracking-tight leading-tight italic break-words">{asset.name}</h4>
                          <div className="flex justify-between items-center mt-3 border-b border-slate-50 pb-2">
                            <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Avaliação Atual:</p>
                            <p className="text-sm font-black text-slate-900">{formatCurrency(asset.estimatedValue)}</p>
                          </div>
                        </div>

                        {/* Pre-construction specs */}
                        {propertyStage === 'PLANTA' ? (
                          <div className="space-y-2.5 pt-2 text-[10px] sm:text-[11px] text-slate-500">
                            <div className="flex justify-between">
                              <span>Valor devido Obra:</span>
                              <span className="font-bold text-rose-500">{formatCurrency(unpaidObra)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Valor pago obra:</span>
                              <span className="font-bold text-emerald-600">{formatCurrency(paidObra)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Valor da Parcela atual:</span>
                              <span className="font-bold text-slate-800">{formatCurrency(currentConstructorInstallmentValue)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Valor intermediária atual:</span>
                              <span className="font-bold text-slate-800">{formatCurrency(currentBalloonValue)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Índice Correção:</span>
                              <span className="font-bold text-brand-600">{meta.constructorIndexType || 'INCC'}</span>
                            </div>
                            <div className="flex justify-between border-t border-dashed border-slate-100 pt-2 font-bold text-slate-600">
                              <span>% de correção atual:</span>
                              <span className="text-brand-600">{meta.constructorIndexRate !== undefined ? `${meta.constructorIndexRate}% a.m.` : '0.0% a.m.'}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2.5 pt-2 text-[10px] sm:text-[11px] text-slate-500">
                            <div className="flex justify-between">
                              <span>Aluguel Líquido:</span>
                              <span className="font-bold text-emerald-600">
                                {cardPeriod === 'CONTRACT' && !isRented 
                                  ? 'Não Alugado' 
                                  : formatCurrency(rental)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Prestação Financiamento:</span>
                              <span className="font-bold text-slate-700">{formatCurrency(installment)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Condomínio + IPTU (Despesa):</span>
                              <span className="font-bold text-slate-700">{formatCurrency(displayCondoIptu)}</span>
                            </div>
                            {(cardPeriod !== 'CONTRACT' || meta.condoPayer === 'PROPRIETARIO_REEMBOLSO' || meta.iptuPayer === 'PROPRIETARIO_REEMBOLSO') && (
                              <div className="flex justify-between">
                                <span>Reembolso Condo/IPTU (Receita):</span>
                                <span className="font-bold text-emerald-600">+{formatCurrency(reimbursement)}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-[10px] border-t border-dashed border-slate-100 pt-2 font-bold">
                              <span>Saldo Caixa Líquido:</span>
                              <span className={netPropertyFlow >= 0 ? 'text-emerald-600' : 'text-rose-500'}>
                                {netPropertyFlow >= 0 ? '+' : ''}{formatCurrency(netPropertyFlow)}
                                {cardPeriod === 'CONTRACT' ? '/mês' : ''}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Sustainability metrics property health */}
                        {propertyStage === 'PRONTO' && meta.purpose === 'investimento' && (
                          <div className="p-3 bg-slate-50 rounded-xl space-y-2 border border-slate-100">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Saúde Financeira do Ativo</p>
                            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden flex">
                              <div
                                className={`h-full ${netPropertyFlow >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                style={{ 
                                  width: `${Math.min(
                                    cardPeriod === 'CONTRACT'
                                      ? (isRented && totalMonthlyCost > 0 ? Math.round((rental / totalMonthlyCost) * 100) : 0)
                                      : ((installment + displayCondoIptu) > 0 ? Math.round((rental / (installment + displayCondoIptu)) * 100) : (rental > 0 ? 100 : 0)), 
                                    100
                                  )}%` 
                                }}
                              />
                            </div>
                            <p className="text-[9px] font-semibold text-slate-500">
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
                          className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-brand-600 transition-colors"
                        >
                          <History size={12} /> Detalhes & Evolução
                        </button>
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditAsset(asset); }}
                            className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-brand-600"
                          >
                            Editar
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleArchiveAsset(asset); }}
                            className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-amber-600"
                          >
                            Arquivar
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

        {/* PHYSICAL ASSETS VIEW */}
        {activeView === 'physical' && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-slate-900 tracking-tight italic flex items-center gap-2">
              <Box size={20} className="text-slate-500" />
              Seus Bens Físicos
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {activePhysicalAssets.filter(p => p.category !== 'REAL_ESTATE').map(asset => {
                const meta = asset.metadata || {};
                const value = asset.estimatedValue;
                const purchase = Number(meta.purchaseValue) || value;
                const fipe = Number(meta.fipeValue) || value;

                // Margem de ágio / deságio
                const diffVal = value - purchase;
                const percentVal = purchase > 0 ? (diffVal / purchase) * 100 : 0;
                
                // FIPE analysis
                const isDepreciatingFast = purchase > 0 && fipe < purchase * 0.8;

                return (
                  <div key={asset.id} className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden hover:shadow-xl transition-all duration-500 flex flex-col justify-between">
                    <div className="p-6 sm:p-8 space-y-5 sm:space-y-6">
                      <div className="flex justify-between items-start">
                        <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-slate-900/10">
                          {asset.category === 'VEHICLE' ? <Car size={22} /> : <Box size={22} />}
                        </div>
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          {meta.purpose === 'investimento' ? (
                            <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-xl text-[8px] font-black uppercase tracking-widest border border-indigo-100">Investimento</span>
                          ) : (
                            <span className="px-3 py-1 bg-slate-50 text-slate-600 rounded-xl text-[8px] font-black uppercase tracking-widest border border-slate-100">Uso Pessoal</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-black text-slate-900 text-lg sm:text-xl tracking-tight leading-tight italic break-words">{asset.name}</h4>
                        <div className="flex justify-between items-center mt-3 border-b border-slate-50 pb-2">
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Avaliação Atual:</p>
                          <p className="text-sm font-black text-slate-900">{formatCurrency(value)}</p>
                        </div>
                      </div>

                      {/* Calculations specs */}
                      <div className="space-y-2.5 text-[10px] sm:text-[11px] text-slate-500">
                        <div className="flex justify-between">
                          <span>Valor Aquisição:</span>
                          <span className="font-bold text-slate-800">{formatCurrency(purchase)}</span>
                        </div>
                        {asset.category === 'VEHICLE' && (
                          <div className="flex justify-between">
                            <span>Valor Tabela FIPE:</span>
                            <span className="font-bold text-slate-800">{formatCurrency(fipe)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>Margem Ágio/Deságio:</span>
                          <span className={`font-bold ${diffVal >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {diffVal >= 0 ? '+' : ''}{formatCurrency(diffVal)} ({percentVal.toFixed(1)}%)
                          </span>
                        </div>
                      </div>

                      {/* Yield alerts based on FIPE */}
                      {asset.category === 'VEHICLE' && meta.purpose === 'uso' && (
                        <div className="p-3 bg-slate-50 rounded-xl space-y-1 border border-slate-100 text-[10px]">
                          {isDepreciatingFast ? (
                            <p className="text-rose-500 font-semibold flex items-center gap-1"><AlertTriangle size={10} /> Depreciação rápida observada.</p>
                          ) : (
                            <p className="text-emerald-600 font-semibold">Valor estável ou valorizado.</p>
                          )}
                          <p className="text-slate-400 font-medium leading-tight">Calculado comparando FIPE atual contra preço de aquisição registrado.</p>
                        </div>
                      )}
                    </div>

                    {/* Actions bar */}
                    <div className="px-6 sm:px-8 py-4 sm:py-5 bg-slate-50 border-t border-slate-100 flex flex-wrap justify-between items-center gap-2 sm:gap-4">
                      <button
                        onClick={() => {
                          setSelectedAssetForExtrato(asset);
                          setShowExtratoModal(true);
                        }}
                        className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-brand-600 transition-colors"
                      >
                        <History size={12} /> Extrato & Ajustes
                      </button>
                      <div className="flex gap-2">
                        <button onClick={() => openEditAsset(asset)} className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-brand-600">Editar</button>
                        <button onClick={() => handleArchiveAsset(asset)} className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-amber-600">Arquivar</button>
                      </div>
                    </div>
                  </div>
                );
              })}

              <button
                onClick={() => {
                  resetAssetForm();
                  setEditingAsset(null);
                  setShowModal(true);
                }}
                className="rounded-[32px] border-2 border-dashed border-slate-200 p-8 flex flex-col items-center justify-center gap-4 text-slate-400 hover:border-brand-500 hover:text-brand-600 hover:bg-slate-50 transition-all min-h-[300px]"
              >
                <Plus size={36} />
                <span className="font-bold text-slate-600">Novo Bem Físico</span>
              </button>
            </div>
          </div>
        )}

        {/* INVESTMENTS & LOANS VIEW */}
        {activeView === 'investments' && (
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
                  className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-800 transition-colors"
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

                  // Get receipts linked to this loan
                  const txsInfo = getAssetFinancialHistory(loan);
                  const returned = txsInfo.totalIncome;
                  const progressPercent = principal > 0 ? Math.round((returned / principal) * 100) : 0;
                  
                  return (
                    <div key={loan.id} className="bg-white rounded-[40px] border border-slate-100 shadow-sm p-8 space-y-6 flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <div className="w-10 h-10 bg-slate-100 text-slate-900 rounded-xl flex items-center justify-center">
                            <ArrowRightLeft size={20} />
                          </div>
                          <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[8px] font-black uppercase tracking-widest border border-emerald-100">Ativo Corrente</span>
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-lg uppercase tracking-tight">{loan.name}</h4>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Devedor: {meta.loanDebtor || 'Não Informado'}</p>
                        </div>

                        {/* Progress and metrics */}
                        <div className="space-y-2 pt-2">
                          <div className="flex justify-between text-[9px] font-black uppercase text-slate-400">
                            <span>Retorno do Principal</span>
                            <span>{progressPercent}% ({formatCurrency(returned)})</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full transition-all" style={{ width: `${Math.min(progressPercent, 100)}%` }} />
                          </div>
                        </div>

                        <div className="pt-2 text-[11px] text-slate-500 space-y-2">
                          <div className="flex justify-between">
                            <span>Valor Principal:</span>
                            <span className="font-bold text-slate-800">{formatCurrency(principal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Taxa de Juros:</span>
                            <span className="font-bold text-slate-800">
                              {meta.loanInterestType === 'COMPOUND' ? 'Compostos' : 'Simples'}: {rate > 0 ? `${rate}% a.m.` : formatCurrency(fixedVal)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Data Recebimento:</span>
                            <span className="font-bold text-slate-800">Todo dia {meta.loanDueDate || '05'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="border-t border-slate-50 pt-4 flex justify-between items-center">
                        <button
                          onClick={() => {
                            setSelectedAssetForExtrato(loan);
                            setShowExtratoModal(true);
                          }}
                          className="text-[9px] font-black uppercase tracking-widest text-brand-600 hover:underline"
                        >
                          Lançar Recebimentos
                        </button>
                        <div className="flex gap-2">
                          <button onClick={() => openEditAsset(loan)} className="text-[9px] font-bold text-slate-400 hover:text-brand-600 uppercase tracking-widest">Editar</button>
                          <button onClick={() => handleDeleteAsset(loan)} className="text-[9px] font-bold text-slate-400 hover:text-rose-600 uppercase tracking-widest">Remover</button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {activePhysicalAssets.filter(p => p.metadata?.isLoan).length === 0 && (
                  <div className="col-span-full py-12 border-2 border-dashed border-slate-100 rounded-[32px] flex flex-col items-center justify-center text-slate-300">
                    <ArrowRightLeft size={36} />
                    <p className="mt-4 font-black uppercase tracking-widest text-[10px]">Nenhum empréstimo cadastrado</p>
                    <p className="text-[9px] text-slate-400 mt-2 font-medium italic">Registre os valores emprestados para calcular os retornos de juros.</p>
                  </div>
                )}
              </div>
            </div>

            {/* BANK INVESTMENTS (BROKERS) SECTION */}
            <div className="space-y-6 pt-6">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight italic flex items-center gap-2">
                <TrendingUp size={20} className="text-slate-500" />
                Sua Carteira de Investimentos Financeiros
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {brokers.map(broker => {
                  const meta = broker.metadata || {};
                  const isPre = meta.interestType === 'PRE';
                  const isCupom = meta.payoutType === 'CUPOM';

                  return (
                    <div key={broker.id} className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-8 space-y-6 flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <div className="w-10 h-10 bg-slate-100 text-slate-900 rounded-xl flex items-center justify-center">
                            <TrendingUp size={20} />
                          </div>
                          <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[8px] font-black uppercase tracking-widest border border-indigo-100">
                            {meta.allocationType || 'LCI/LCA'}
                          </span>
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-lg uppercase tracking-tight">{broker.name}</h4>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Saldo Atual: {formatCurrency(broker.balance)}</p>
                        </div>

                        <div className="pt-2 text-[11px] text-slate-500 space-y-2">
                          <div className="flex justify-between">
                            <span>Tipo Indexação:</span>
                            <span className="font-bold text-slate-800">{isPre ? 'Pré-fixado' : 'Pós-fixado (CDI)'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Juros Mensais:</span>
                            <span className="font-bold text-slate-800">{isCupom ? 'Cupom em Conta 🟢' : 'Acumulado Vencimento 🔒'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Rentabilidade Estimada:</span>
                            <span className="font-bold text-emerald-600">{meta.yieldRate || '10.5'}% a.a.</span>
                          </div>
                        </div>
                      </div>

                      {/* yield benchmark indicator */}
                      <div className="p-3 bg-slate-50 rounded-xl flex items-center gap-2 border border-slate-100">
                        <Check size={14} className="text-emerald-500 shrink-0" />
                        <span className="text-[9px] font-semibold text-slate-500">🟢 Excelente rentabilidade. Ativo superando taxa CDI média do mercado.</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* LIABILITIES VIEW */}
        {activeView === 'liabilities' && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-slate-900 tracking-tight italic flex items-center gap-2">
              <Landmark size={20} className="text-slate-500" />
              Sua Carteira de Passivos e Financiamentos
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {activeLiabilities.map(liability => (
                <div key={liability.id} className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden hover:shadow-xl transition-all duration-500 flex flex-col justify-between">
                  <div className="p-8 space-y-6">
                    <div className="flex justify-between items-start">
                      <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center shadow-lg shadow-red-100/50">
                        <Landmark size={22} />
                      </div>
                      <span className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-[8px] font-black uppercase tracking-widest border border-red-100">Dívida Ativa</span>
                    </div>

                    <div>
                      <h4 className="font-black text-slate-900 text-lg tracking-tight leading-tight italic uppercase">{liability.name}</h4>
                      <div className="flex justify-between items-center mt-3 border-b border-slate-50 pb-2">
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Saldo Devedor Atual:</p>
                        <p className="text-sm font-black text-red-600">{formatCurrency(liability.remainingBalance)}</p>
                      </div>
                    </div>

                    <div className="space-y-2 text-[11px] text-slate-500">
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
                    </div>
                  </div>

                  <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                    <button onClick={() => openEditLiability(liability)} className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-brand-600">Ajustar Parcelas</button>
                    <button onClick={() => handleDeleteLiability(liability.id)} className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-600">Excluir Passivo</button>
                  </div>
                </div>
              ))}
              
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
                    balloonMonth: '',
                    balloonYear: '',
                    balloonAmount: '',
                    balloons: [],
                    propertyType: 'PLANTA'
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
              <h3 className="font-black text-slate-900 uppercase tracking-tight">{editingAsset ? 'Editar Ativo Físico' : 'Novo Ativo Físico'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-50">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveAsset} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Identificação do Bem</label>
                <input
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  placeholder="Ex: Jeep Compass"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              {/* Category & Value - Hide for Real Estate edit, edit in Evolution card instead */}
              {(!editingAsset || editingAsset.category !== 'REAL_ESTATE') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Categoria</label>
                    <select
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                    >
                      <option value="REAL_ESTATE">Imóvel</option>
                      <option value="VEHICLE">Veículo</option>
                      <option value="OTHER">Outros Bens</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Valor Estimado Atual (R$)</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500"
                      placeholder="0.00"
                      value={formData.estimatedValue}
                      onChange={(e) => setFormData({ ...formData, estimatedValue: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {/* Acquisition Date & Purchase Value - Hide for Real Estate edit */}
              {(!editingAsset || editingAsset.category !== 'REAL_ESTATE') && (
                <div className="grid grid-cols-2 gap-4 border-t border-slate-50 pt-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Data de Aquisição</label>
                    <input
                      type="date"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500"
                      value={formData.acquisitionDate}
                      onChange={(e) => setFormData({ ...formData, acquisitionDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Valor Aquisição (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500"
                      placeholder="0.00"
                      value={formData.purchaseValue}
                      onChange={(e) => setFormData({ ...formData, purchaseValue: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {/* Advanced Classification: Uso vs Investimento */}
              <div className="bg-slate-50 rounded-2xl p-4 space-y-4 border border-slate-200">
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

                {formData.category === 'VEHICLE' && (
                  <div className="space-y-4 animate-in slide-in-from-top-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Tipo de Veículo</label>
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
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Custo de Transferência (R$)</label>
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
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Valor Tabela FIPE Atual (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 outline-none"
                        placeholder="FIPE Atual"
                        value={formData.fipeValue}
                        onChange={(e) => setFormData({ ...formData, fipeValue: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                {formData.category === 'VEHICLE' && formData.purpose === 'uso' && (
                  <div className="space-y-4 pt-3 border-t border-dashed border-slate-200 animate-in slide-in-from-top-2">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Despesas Periódicas Estimadas</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Custo Estimado IPVA (R$)</label>
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
                        <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Custo Estimado Seguro (R$)</label>
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
                        <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Licenciamento Anual (R$)</label>
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
                        <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Manutenção Mensal (R$)</label>
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
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Modalidade do Investimento</label>
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
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Tipo de Aluguel</label>
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
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Receita de Aluguel (R$)</label>
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
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Taxa Plataforma (R$ ou %)</label>
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
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Seguro Comercial (R$)</label>
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
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Custo IPVA (R$)</label>
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
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Licenciamento Anual (R$)</label>
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
                          <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Preço Venda Alvo (R$)</label>
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
                          <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Orçamento Preparação (R$)</label>
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

                {formData.purpose === 'investimento' && formData.category !== 'REAL_ESTATE' && (
                  <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 border-t border-slate-200 pt-3">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Taxa de Corretagem (R$)</label>
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
                            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Valor Venda (R$)</label>
                            <input
                              type="number"
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold"
                              value={formData.soldValue}
                              onChange={(e) => setFormData({ ...formData, soldValue: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Comissão de Venda (R$)</label>
                            <input
                              type="number"
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold"
                              value={formData.saleComission}
                              onChange={(e) => setFormData({ ...formData, saleComission: e.target.value })}
                              placeholder="0.00"
                            />
                          </div>
                        </div>

                        {formData.category === 'VEHICLE' && (
                          <div className="space-y-4">
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Forma de Recebimento</label>
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

                            {(formData.salePaymentMethod === 'PERMUTA' || formData.salePaymentMethod === 'HIBRIDO') && (
                              <div className="space-y-3 pt-2 border-t border-dashed border-slate-200">
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Bens Recebidos na Permuta</p>
                                
                                {formData.permutaItems && formData.permutaItems.map((item, idx) => (
                                  <div key={idx} className="grid grid-cols-12 gap-2 bg-white p-3 rounded-xl border border-slate-100 items-end">
                                    <div className="col-span-3">
                                      <label className="block text-[8px] font-bold text-slate-400 mb-1">Tipo</label>
                                      <select
                                        className="w-full h-8 px-1.5 bg-slate-50 border rounded-lg text-[10px] font-bold outline-none"
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
                                      <label className="block text-[8px] font-bold text-slate-400 mb-1">Nome / Descrição</label>
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
                                      <label className="block text-[8px] font-bold text-slate-400 mb-1">Valor (R$)</label>
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
                                  className="w-full h-9 border border-dashed border-slate-300 rounded-xl text-[10px] font-bold text-slate-500 hover:border-brand-500 hover:text-brand-600 transition-all flex items-center justify-center gap-1.5"
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
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Estágio do Imóvel</label>
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
                          <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Índice Correção Construtora</label>
                          <select
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-900 outline-none"
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
                          <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Projeção Reajuste (% am)</label>
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
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Tipo de Aluguel</label>
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
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Valor Aluguel (R$)</label>
                                <input
                                  type="number"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                                  value={formData.rentalIncome}
                                  onChange={(e) => setFormData({ ...formData, rentalIncome: e.target.value })}
                                />
                              </div>
                              <div>
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Data Inicial</label>
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
                              <span className="text-[9px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded p-1 font-bold">Locações devem ser inseridas no Extrato do Card.</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Opções de Financiamento/Consórcio */}
                    <div className="space-y-4 pt-3 border-t border-dashed border-slate-200 animate-in slide-in-from-top-2">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Forma de Pagamento (Saldo Devedor)</label>
                        <select
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none"
                          value={formData.deliveryPaymentMethod}
                          onChange={(e) => setFormData({ ...formData, deliveryPaymentMethod: e.target.value as any })}
                        >
                          <option value="A_VISTA">À Vista / Quitado</option>
                          <option value="FINANCIAMENTO">Financiamento Direto</option>
                          <option value="CONSORCIO">Consórcio Vinculado</option>
                          <option value="A_DEFINIR">A Definir (Saldo na Entrega)</option>
                        </select>
                      </div>

                        {formData.deliveryPaymentMethod === 'CONSORCIO' && (
                          <div className="space-y-3 p-3 bg-slate-50 border border-slate-100 rounded-2xl animate-in slide-in-from-top-2">
                            <div>
                              <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Consórcio Vinculado</label>
                              <select
                                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-900 outline-none"
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
                              <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Percentual Alocado ao Imóvel (%)</label>
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
                              <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Nome do Financiamento</label>
                              <input
                                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900 outline-none"
                                value={formData.financingName}
                                onChange={(e) => setFormData({ ...formData, financingName: e.target.value })}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Saldo a Financiar (R$)</label>
                                <input
                                  type="number"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900"
                                  value={formData.deliveryBalance}
                                  onChange={(e) => setFormData({ ...formData, deliveryBalance: e.target.value })}
                                />
                              </div>
                              <div>
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Original (R$)</label>
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
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor Parcela</label>
                                <input
                                  type="number"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900"
                                  value={formData.financingInstallment}
                                  onChange={(e) => setFormData({ ...formData, financingInstallment: e.target.value })}
                                />
                              </div>
                              <div>
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Parcelas</label>
                                <input
                                  type="number"
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-900"
                                  value={formData.financingInstallmentsCount}
                                  onChange={(e) => setFormData({ ...formData, financingInstallmentsCount: e.target.value })}
                                />
                              </div>
                              <div>
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Dia Venc.</label>
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
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Devedor (Nome)</label>
                            <input
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold"
                              value={formData.loanDebtor}
                              onChange={(e) => setFormData({ ...formData, loanDebtor: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Valor Emprestado (Principal)</label>
                            <input
                              type="number"
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold"
                              value={formData.loanPrincipal}
                              onChange={(e) => setFormData({ ...formData, loanPrincipal: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Juros (%) a.m.</label>
                            <input
                              type="number"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.loanInterestRate}
                              onChange={(e) => setFormData({ ...formData, loanInterestRate: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Ou Juros Fixo (R$)</label>
                            <input
                              type="number"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.loanFixedValue}
                              onChange={(e) => setFormData({ ...formData, loanFixedValue: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Dia Vencimento</label>
                            <input
                              type="number"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.loanDueDate}
                              onChange={(e) => setFormData({ ...formData, loanDueDate: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="flex gap-4 pt-1">
                          <label className="flex items-center gap-2 cursor-pointer font-bold text-[10px]">
                            <input
                              type="radio"
                              name="loanInterestType"
                              checked={formData.loanInterestType === 'SIMPLE'}
                              onChange={() => setFormData({ ...formData, loanInterestType: 'SIMPLE' })}
                            />
                            Juros Simples
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer font-bold text-[10px]">
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
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Descrição</label>
                <textarea
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500"
                  rows={2}
                  placeholder="Informações adicionais sobre o bem..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-slate-200 transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-3 bg-brand-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-brand-500/20 hover:scale-[1.02] transition-transform active:scale-95">Salvar Bem</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REAL ESTATE DETAILED CONFIG */}
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Estágio do Imóvel</label>
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
                {realEstateManageForm.propertyType === 'PRONTO' && (
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-xs select-none pt-6">
                    <input
                      type="checkbox"
                      checked={realEstateManageForm.isRented}
                      onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, isRented: e.target.checked })}
                    />
                    Está Alugado?
                  </label>
                )}
              </div>

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
                    <p className="text-[10px] text-indigo-600 font-bold">
                      O imóvel passou de "Na Planta" para "Pronto". Defina como quitará o Saldo Devedor final das chaves.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[8px] font-black text-indigo-700 uppercase tracking-widest mb-1">Valor Saldo Devedor (R$)</label>
                        <input
                          type="number"
                          className="w-full bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800"
                          placeholder="0.00"
                          value={realEstateManageForm.deliveryBalance}
                          onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, deliveryBalance: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black text-indigo-700 uppercase tracking-widest mb-1">Forma de Pagamento</label>
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
                        <label className="block text-[8px] font-black text-indigo-700 uppercase tracking-widest mb-1">Selecione o Consórcio</label>
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
                          <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Nome da Dívida</label>
                          <input
                            type="text"
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 outline-none"
                            placeholder="Ex: Financiamento Piazza do Bosque"
                            value={realEstateManageForm.financingName}
                            onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, financingName: e.target.value })}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Tipo de Dívida</label>
                            <select
                              disabled
                              className="w-full bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-500"
                              value="MORTGAGE"
                            >
                              <option value="MORTGAGE">Financiamento Imobiliário</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Bem Vinculado</label>
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
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Original Total (R$)</label>
                            <input
                              type="number"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900"
                              placeholder="0.00"
                              value={realEstateManageForm.financingOriginalTotal}
                              onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, financingOriginalTotal: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-rose-500 uppercase tracking-widest mb-1">Saldo Devedor Atual (R$)</label>
                            <input
                              type="number"
                              className="w-full bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-rose-900 outline-none focus:border-rose-400"
                              placeholder="0.00"
                              value={realEstateManageForm.deliveryBalance}
                              onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, deliveryBalance: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor Parcela (R$)</label>
                            <input
                              type="number"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-900"
                              placeholder="0.00"
                              value={realEstateManageForm.financingInstallment}
                              onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, financingInstallment: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Parcelas Rest.</label>
                            <input
                              type="number"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-900"
                              placeholder="Ex: 180"
                              value={realEstateManageForm.financingInstallmentsCount}
                              onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, financingInstallmentsCount: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Dia Venc.</label>
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
                      <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Tipo de Aluguel</label>
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
                          <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Aluguel (R$)</label>
                          <input
                            type="number"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                            value={realEstateManageForm.rentalIncome}
                            onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, rentalIncome: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Data Inicial</label>
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
                        <span className="text-[9px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded p-1 font-bold">Lançamentos via Extrato do Card.</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Condomínio (R$)</label>
                      <input
                        type="number"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                        value={realEstateManageForm.condoFee}
                        onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, condoFee: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">IPTU Mensal (R$)</label>
                      <input
                        type="number"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                        value={realEstateManageForm.iptuFee}
                        onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, iptuFee: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="flex gap-4 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-[9px]">
                      <input
                        type="checkbox"
                        checked={realEstateManageForm.inquilinoPaysCondo}
                        onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, inquilinoPaysCondo: e.target.checked })}
                      />
                      Inquilino paga Condomínio
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-[9px]">
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
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Prestação Financiamento</label>
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
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Entrega das Chaves</label>
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
            <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900 uppercase tracking-tight text-lg">Extrato e Lançamentos do Card</h3>
                <p className="text-xs text-slate-400 font-medium">Bens Físicos: {selectedAssetForExtrato.name}</p>
              </div>
              <button onClick={() => { setShowExtratoModal(false); setIsAddingExtratoTx(false); }} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-50">
                <X size={20} />
              </button>
            </div>

            <div className="p-8 flex-1 overflow-y-auto custom-scrollbar space-y-6">
              
              {/* Financial summary within the card extrato */}
              {(() => {
                const info = getAssetFinancialHistory(selectedAssetForExtrato);
                return (
                  <div className="grid grid-cols-3 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <div>
                      <p className="text-[8px] font-black uppercase text-slate-400">Total Receitas</p>
                      <p className="text-base font-black text-emerald-600">{formatCurrency(info.totalIncome)}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black uppercase text-slate-400">Total Gastos Extras</p>
                      <p className="text-base font-black text-rose-500">{formatCurrency(info.totalExtraExpenses)}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black uppercase text-slate-400">Saldo Consolidado</p>
                      <p className={`text-base font-black ${info.totalIncome - info.totalExtraExpenses >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {formatCurrency(info.totalIncome - info.totalExtraExpenses)}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Transactions Ledger List */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Histórico de Lançamentos</h4>
                  {!isAddingExtratoTx && (
                    <button
                      onClick={() => setIsAddingExtratoTx(true)}
                      className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest"
                    >
                      + Novo Lançamento
                    </button>
                  )}
                </div>

                {isAddingExtratoTx && (
                  <form onSubmit={handleSaveCardTransaction} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 animate-in slide-in-from-top-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[8px] font-black uppercase text-slate-400 mb-1">Descrição</label>
                        <input
                          required
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold"
                          placeholder="Ex: Reforma da Cozinha"
                          value={newTxForm.description}
                          onChange={e => setNewTxForm({ ...newTxForm, description: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black uppercase text-slate-400 mb-1">Valor (R$)</label>
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
                        <label className="block text-[8px] font-black uppercase text-slate-400 mb-1">Tipo</label>
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
                        <label className="block text-[8px] font-black uppercase text-slate-400 mb-1">Data</label>
                        <input
                          type="date"
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                          value={newTxForm.date}
                          onChange={e => setNewTxForm({ ...newTxForm, date: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black uppercase text-slate-400 mb-1">Categoria</label>
                        <input
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                          value={newTxForm.category}
                          onChange={e => setNewTxForm({ ...newTxForm, category: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <label className="flex items-center gap-2 cursor-pointer font-bold text-[10px]">
                        <input
                          type="checkbox"
                          checked={newTxForm.isHistorical}
                          onChange={e => setNewTxForm({ ...newTxForm, isHistorical: e.target.checked })}
                        />
                        Lançamento Passado (Não conta no Dashboard Mensal)
                      </label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setIsAddingExtratoTx(false)} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[9px] font-black uppercase">Cancelar</button>
                        <button type="submit" className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-[9px] font-black uppercase">Lançar</button>
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
                        <p className="text-[9px] text-slate-400 font-medium">
                          {new Date(tx.date).toLocaleDateString('pt-BR')} • {tx.category}
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
              <button onClick={() => setShowLiabilityModal(false)} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-50">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveLiability} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Nome da Dívida</label>
                <input
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                  placeholder="Ex: Financiamento Jeep"
                  value={liabilityFormData.name}
                  onChange={(e) => setLiabilityFormData({ ...liabilityFormData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Tipo de Dívida</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-red-500"
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Original Total (R$)</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-red-500"
                    value={liabilityFormData.totalAmount}
                    onChange={(e) => setLiabilityFormData({ ...liabilityFormData, totalAmount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-red-500 uppercase tracking-widest mb-1.5">Saldo Devedor Atual</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    className="w-full bg-red-50/50 border border-red-200 rounded-xl px-4 py-3 text-sm font-bold text-red-900 outline-none focus:border-red-500"
                    value={liabilityFormData.remainingBalance}
                    onChange={(e) => setLiabilityFormData({ ...liabilityFormData, remainingBalance: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-2">
                <div>
                  <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Valor Parcela</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                    value={liabilityFormData.installmentAmount}
                    onChange={(e) => setLiabilityFormData({ ...liabilityFormData, installmentAmount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Parcelas Restantes</label>
                  <input
                    type="number"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                    value={liabilityFormData.installmentsRemaining}
                    onChange={(e) => setLiabilityFormData({ ...liabilityFormData, installmentsRemaining: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Dia Vencimento</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                    value={liabilityFormData.dueDay}
                    onChange={(e) => setLiabilityFormData({ ...liabilityFormData, dueDay: e.target.value })}
                  />
                </div>
              </div>

              {activePhysicalAssets.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Bem Vinculado (Opcional)</label>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none"
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
                <button type="button" onClick={() => setShowLiabilityModal(false)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-slate-200 transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg">Salvar Passivo</button>
              </div>
            </form>
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
          <div className="bg-white rounded-[45px] w-full max-w-3xl shadow-2xl overflow-hidden border border-white/20 animate-in slide-in-from-bottom-4">
            <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight italic">Selecione o Tipo de Ativo</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Para onde deseja direcionar seu novo patrimônio?</p>
              </div>
              <button onClick={() => setShowCategorySelector(false)} className="w-10 h-10 bg-white border border-slate-200 text-slate-400 hover:text-rose-500 rounded-xl flex items-center justify-center transition-all shadow-sm"><X size={20} /></button>
            </div>

            <div className="p-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
              
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
                  <p className="text-[10px] text-slate-400 leading-normal font-medium">Cadastre imóveis na planta ou prontos, controle financiamentos (SAC/Price), parcelas e aluguéis.</p>
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
                  <p className="text-[10px] text-slate-400 leading-normal font-medium">Adicione carros, motos ou outros veículos para acompanhamento automático da tabela FIPE.</p>
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
                  <p className="text-[10px] text-slate-400 leading-normal font-medium">Joias, maquinários, cabeças de gado ou qualquer outro bem físico de valor de mercado.</p>
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
                    <p className="text-[10px] text-slate-400 leading-normal font-medium">Controle de rendimentos financeiros ou empréstimos ativos a receber.</p>
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
                    className="flex-1 py-2 bg-slate-950 hover:bg-slate-800 text-white rounded-xl text-[9px] font-black uppercase text-center tracking-wider"
                  >
                    Empréstimo Concedido
                  </button>
                  <button
                    onClick={() => {
                      setShowCategorySelector(false);
                      navigate('/accounts');
                    }}
                    className="flex-1 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-[9px] font-black uppercase text-center tracking-wider"
                  >
                    Investimento Financeiro
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Assets;
