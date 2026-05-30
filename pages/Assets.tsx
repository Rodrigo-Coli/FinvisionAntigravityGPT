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
  ArrowRightLeft
} from 'lucide-react';
import { PhysicalAsset, InvestmentBroker, Liability, Transaction } from '../types';
import { supabase } from '../lib/supabase/client';
import { RealEstateWizardModal } from '../components/assets/RealEstateWizardModal';

const Assets: React.FC = () => {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<'overview' | 'realestate' | 'physical' | 'investments' | 'liabilities'>('overview');
  const [inccRate, setInccRate] = useState<number | null>(null);
  const [loadingIncc, setLoadingIncc] = useState<boolean>(false);

  // Core Data States
  const [physicalAssets, setPhysicalAssets] = useState<PhysicalAsset[]>([]);
  const [brokers, setBrokers] = useState<InvestmentBroker[]>([]);
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
    // Rental info
    isRented: false,
    rentalIncome: '',
    condoFee: '',
    iptuFee: '',
    inquilinoPaysCondo: false,
    inquilinoPaysIPTU: false,
    // Loan assets
    isLoan: false,
    loanPrincipal: '',
    loanInterestType: 'SIMPLE' as 'SIMPLE' | 'COMPOUND',
    loanInterestRate: '',
    loanFixedValue: '',
    loanDueDate: '',
    loanDebtor: ''
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
    iptuFee: ''
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
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      // 1. Fetch Physical Assets
      const { data: phys } = await supabase
        .from('physical_assets')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: true });

      if (phys) {
        setPhysicalAssets(phys.map((p: any) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          estimatedValue: Number(p.estimated_value),
          acquisitionDate: p.acquisition_date,
          description: p.description,
          is_archived: p.is_archived,
          metadata: p.metadata || {}
        })));
      }

      // 2. Fetch Accounts (Brokers and Banks alocations)
      const { data: accs } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_archived', false);

      if (accs) {
        const brokerList = accs.filter((a: any) => a.type === 'INVESTMENT').map((a: any) => {
          // Custom broker specs inside account metadata
          const meta = a.metadata || {};
          return {
            id: a.id,
            name: a.institution || a.name,
            balance: Number(a.current_balance),
            allocation: [
              { type: meta.productType || 'Investimentos', percentage: 100, value: Number(a.current_balance), color: 'bg-brand-500' }
            ],
            metadata: meta
          };
        });
        setBrokers(brokerList as any);
      }

      // 3. Fetch Liabilities
      const { data: liabs } = await supabase
        .from('liabilities')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_archived', false);

      if (liabs) {
        setLiabilities(liabs.map((l: any) => ({
          id: l.id,
          name: l.name,
          type: l.type,
          totalAmount: Number(l.total_amount),
          remainingBalance: Number(l.remaining_balance),
          interestRate: l.interest_rate ? Number(l.interest_rate) : undefined,
          linkedAssetId: l.linked_asset_id,
          installmentAmount: l.installment_amount ? Number(l.installment_amount) : undefined,
          installmentsRemaining: l.installments_remaining ? Number(l.installments_remaining) : undefined,
          dueDay: l.due_day ? Number(l.due_day) : undefined,
          metadata: l.metadata || {},
          is_archived: l.is_archived
        })));
      }

      // 4. Fetch All non-deleted Transactions for bidirectional references
      const { data: txs } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_deleted', false);

      if (txs) {
        setTransactions(txs.map((t: any) => ({
          id: t.id,
          description: t.description,
          amount: Number(t.amount),
          date: t.date,
          type: t.type,
          accountId: t.account_id,
          accountName: t.account_name,
          category: t.category,
          subcategory: t.subcategory,
          metadata: t.metadata || {},
          isPaid: t.is_paid,
          liability_id: t.liability_id,
          is_recurring: t.is_recurring,
          installment_number: t.installment_number,
          installment_total: t.installment_total
        })));
      }

    } catch (e: any) {
      console.error('Assets: Error fetching data', e);
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

  // Sustainability Panel calculations
  const sustainabilitySummary = useMemo(() => {
    const activePhysImob = activePhysicalAssets.filter(p => p.category === 'REAL_ESTATE' && !excludedAssetIds.includes(p.id));
    const activePhysOthers = activePhysicalAssets.filter(p => p.category !== 'REAL_ESTATE' && !excludedOtherAssetIds.includes(p.id));
    
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

    // Rental inflows
    const totalRents = activePhysImob.reduce((acc, curr) => {
      const meta = curr.metadata || {};
      if (meta.isRented && meta.rentalIncome) {
        return acc + Number(meta.rentalIncome);
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
  }, [activePhysicalAssets, activeLiabilities, brokers, excludedAssetIds, excludedConsortiumIds, excludedOtherAssetIds, excludedOtherLiabilityIds, excludedBrokerIds, estimatedYieldRate]);

  // Asset helpers
  const getAssetLinkedTransactions = (assetId: string) => {
    return transactions.filter(t => t.metadata?.linked_asset_id === assetId);
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

  // Safe Property status toggle
  const togglePropertyTypeDirectly = async (asset: PhysicalAsset) => {
    if (!supabase) return;
    const meta = asset.metadata || {};
    const newStage = meta.propertyStage === 'PLANTA' ? 'PRONTO' : 'PLANTA';
    const updatedMeta = {
      ...meta,
      propertyStage: newStage,
      isRented: newStage === 'PLANTA' ? false : meta.isRented
    };

    try {
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const value = parseFloat(formData.estimatedValue) || 0;
      const purchaseVal = parseFloat(formData.purchaseValue) || 0;
      const fipeVal = parseFloat(formData.fipeValue) || 0;
      const brokerFeeVal = parseFloat(formData.brokerFee) || 0;
      const soldVal = parseFloat(formData.soldValue) || 0;
      const rentVal = parseFloat(formData.rentalIncome) || 0;
      const condoFeeVal = parseFloat(formData.condoFee) || 0;
      const iptuFeeVal = parseFloat(formData.iptuFee) || 0;

      // Loans
      const loanPrincipalVal = parseFloat(formData.loanPrincipal) || 0;
      const loanInterestRateVal = parseFloat(formData.loanInterestRate) || 0;
      const loanFixedValueVal = parseFloat(formData.loanFixedValue) || 0;

      const metadata: Record<string, any> = {
        purpose: formData.purpose,
        purchaseValue: purchaseVal,
        fipeValue: fipeVal,
        brokerFee: brokerFeeVal,
        isSold: formData.isSold,
        soldValue: soldVal,
        // Pre-construction
        propertyStage: formData.category === 'REAL_ESTATE' ? formData.propertyStage : undefined,
        indexType: formData.indexType,
        balloons: formData.balloons,
        // Rental
        isRented: formData.isRented,
        rentalIncome: rentVal,
        condoFee: condoFeeVal,
        iptuFee: iptuFeeVal,
        inquilinoPaysCondo: formData.inquilinoPaysCondo,
        inquilinoPaysIPTU: formData.inquilinoPaysIPTU,
        // Loan details
        isLoan: formData.isLoan,
        loanPrincipal: loanPrincipalVal,
        loanInterestType: formData.loanInterestType,
        loanInterestRate: loanInterestRateVal,
        loanFixedValue: loanFixedValueVal,
        loanDueDate: formData.loanDueDate,
        loanDebtor: formData.loanDebtor
      };

      if (editingAsset) {
        // UPDATE existing asset
        const { error } = await supabase
          .from('physical_assets')
          .update({
            name: formData.name,
            category: formData.category,
            estimated_value: value,
            acquisition_date: formData.acquisitionDate || null,
            description: formData.description,
            metadata
          })
          .eq('id', editingAsset.id);

        if (error) throw error;
      } else {
        // INSERT new asset
        const { data: newAsset, error } = await supabase
          .from('physical_assets')
          .insert([{
            user_id: user.id,
            name: formData.name,
            category: formData.category,
            estimated_value: value,
            acquisition_date: formData.acquisitionDate || null,
            description: formData.description,
            metadata
          }])
          .select()
          .single();

        if (error) throw error;

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
          await supabase.from('transactions').insert({
            user_id: user.id,
            description: `Desembolso Empréstimo: ${formData.name}`,
            amount: loanPrincipalVal,
            date: formData.acquisitionDate || new Date().toISOString().split('T')[0],
            type: 'EXPENSE',
            category: catName,
            category_id: catId || null,
            is_paid: true,
            paid_amount: loanPrincipalVal,
            paid_at: formData.acquisitionDate || new Date().toISOString().split('T')[0],
            metadata: {
              linked_asset_id: newAsset.id,
              type: 'loan_disbursement'
            }
          });
        }
      }

      setShowModal(false);
      setEditingAsset(null);
      resetAssetForm();
      fetchData();
    } catch (err: any) {
      alert(`Erro ao salvar: ${err.message}`);
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
      isRented: false,
      rentalIncome: '',
      condoFee: '',
      iptuFee: '',
      inquilinoPaysCondo: false,
      inquilinoPaysIPTU: false,
      isLoan: false,
      loanPrincipal: '',
      loanInterestType: 'SIMPLE',
      loanInterestRate: '',
      loanFixedValue: '',
      loanDueDate: '',
      loanDebtor: ''
    });
  };

  const openEditAsset = (asset: PhysicalAsset) => {
    setEditingAsset(asset);
    const meta = asset.metadata || {};
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
      isRented: !!meta.isRented,
      rentalIncome: meta.rentalIncome ? String(meta.rentalIncome) : '',
      condoFee: meta.condoFee ? String(meta.condoFee) : '',
      iptuFee: meta.iptuFee ? String(meta.iptuFee) : '',
      inquilinoPaysCondo: !!meta.inquilinoPaysCondo,
      inquilinoPaysIPTU: !!meta.inquilinoPaysIPTU,
      isLoan: !!meta.isLoan,
      loanPrincipal: meta.loanPrincipal ? String(meta.loanPrincipal) : '',
      loanInterestType: meta.loanInterestType || 'SIMPLE',
      loanInterestRate: meta.loanInterestRate ? String(meta.loanInterestRate) : '',
      loanFixedValue: meta.loanFixedValue ? String(meta.loanFixedValue) : '',
      loanDueDate: meta.loanDueDate || '',
      loanDebtor: meta.loanDebtor || ''
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
        iptuFee: meta.iptuFee ? String(meta.iptuFee) : ''
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
        iptuFee: meta.iptuFee ? String(meta.iptuFee) : ''
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
          inquilinoPaysIPTU: realEstateManageForm.inquilinoPaysIPTU
        };

        await supabase
          .from('physical_assets')
          .update({ metadata: updatedAssetMeta })
          .eq('id', asset.id);
      }

      // Update liability
      const updatedMetadata = {
        ...(selectedLiabilityForManage.metadata || {}),
        propertyType: realEstateManageForm.propertyType,
        rentalIncome: rentVal,
        operationalExpenses: (realEstateManageForm.inquilinoPaysCondo ? 0 : condoVal) + (realEstateManageForm.inquilinoPaysIPTU ? 0 : iptuVal),
        deliveryDate: realEstateManageForm.deliveryDate
      };

      if (selectedLiabilityForManage.id === 'new-temp') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado");

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
    const { data: { user } } = await supabase.auth.getUser();
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
      const { data: { user } } = await supabase.auth.getUser();
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
      const metadata = {
        linked_asset_id: selectedAssetForExtrato.id,
        is_historical: newTxForm.isHistorical
      };

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Patrimônio Líquido</h1>
          <p className="text-sm text-slate-400 font-medium">Bens físicos, investimentos inteligentes e passivos consolidados.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowWizardModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-white border border-brand-200 text-brand-600 rounded-xl text-sm font-bold shadow-sm hover:bg-brand-50 hover:scale-105 transition-transform active:scale-95"
          >
            <Building2 size={18} /> Aquisição Imobiliária
          </button>
          <button
            onClick={() => {
              resetAssetForm();
              setEditingAsset(null);
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform active:scale-95"
          >
            <Plus size={18} /> Novo Ativo
          </button>
        </div>
      </div>

      {/* SUMMARY BANNER */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-brand-900 md:col-span-1 rounded-[32px] p-8 text-white relative overflow-hidden group shadow-xl shadow-brand-900/10">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-[100px] -translate-y-10 translate-x-10" />
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Patrimônio Líquido Real</p>
          <h3 className="text-3xl font-black tracking-tight italic">{formatCurrency(totalNetWorth)}</h3>
          <div className="mt-6 flex items-center gap-2">
            <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-lg">+1.2%</span>
            <span className="text-slate-400 text-[10px] font-medium uppercase tracking-widest">Crescimento Mensal</span>
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-[32px] p-8 shadow-sm relative overflow-hidden">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Bens Físicos</p>
          <h3 className="text-3xl font-black text-slate-900 tracking-tight italic">{formatCurrency(totalPhysical)}</h3>
          <p className="text-[10px] font-bold text-slate-400 mt-6 uppercase tracking-widest leading-none flex items-center gap-1.5">
            <Box size={12} className="text-brand-500" /> {activePhysicalAssets.length} Imóveis e Veículos
          </p>
        </div>

        <div className="bg-white border border-slate-100 rounded-[32px] p-8 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Ativos Financeiros</p>
          <h3 className="text-3xl font-black text-brand-600 tracking-tight italic">{formatCurrency(totalFinancial)}</h3>
          <p className="text-[10px] font-bold text-brand-500 mt-6 uppercase tracking-widest leading-none flex items-center gap-1.5">
            <TrendingUp size={12} /> XP, BTG e Carteiras
          </p>
        </div>

        <div className="bg-red-50/50 border border-red-100/50 rounded-[32px] p-8 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-400 mb-2">Dívidas e Financiamentos</p>
          <h3 className="text-3xl font-black text-red-600 tracking-tight italic">{formatCurrency(totalLiabilities)}</h3>
          <p className="text-[10px] font-bold text-red-400 mt-6 uppercase tracking-widest leading-none flex items-center gap-1.5">
            <Landmark size={12} /> {activeLiabilities.length} Passivos Gerais
          </p>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex gap-2 p-1.5 bg-slate-50 border border-slate-100 rounded-2xl w-full max-w-full overflow-x-auto scrollbar-hide">
        {[
          { id: 'overview', label: 'Visão Geral', icon: <LayoutGrid size={16} /> },
          { id: 'realestate', label: 'Investimento Imobiliário', icon: <Building2 size={16} /> },
          { id: 'physical', label: 'Bens Físicos', icon: <Box size={16} /> },
          { id: 'investments', label: 'Investimentos & Empréstimos', icon: <TrendingUp size={16} /> },
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-10 rounded-[32px] border border-slate-100 shadow-sm space-y-8">
              <h3 className="font-bold text-slate-900 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center"><PieChart size={18} /></div>
                Alocação Patrimonial
              </h3>
              <div className="flex flex-col sm:flex-row items-center gap-12">
                <div className="relative w-40 h-40 shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="16" fill="none" className="stroke-slate-50" strokeWidth="3" />
                    <circle cx="18" cy="18" r="16" fill="none" className="stroke-brand-600" strokeWidth="3" strokeDasharray={`${totalAssets > 0 ? Math.round((totalFinancial / totalAssets) * 100) : 0} 100`} />
                    <circle cx="18" cy="18" r="16" fill="none" className="stroke-emerald-500" strokeWidth="3" strokeDasharray={`${totalAssets > 0 ? Math.round((totalPhysical / totalAssets) * 100) : 0} 100`} strokeDashoffset={`-${totalAssets > 0 ? Math.round((totalFinancial / totalAssets) * 100) : 0}`} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold text-slate-900">100%</span>
                  </div>
                </div>
                <div className="w-full space-y-4">
                  <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl group cursor-default">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 bg-brand-600 rounded-full" />
                      <span className="text-xs font-bold text-slate-600 uppercase">Investimentos Ativos</span>
                    </div>
                    <span className="text-sm font-bold text-slate-900">{totalAssets ? Math.round((totalFinancial / totalAssets) * 100) : 0}%</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl group cursor-default">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                      <span className="text-xs font-bold text-slate-600 uppercase">Bens Físicos</span>
                    </div>
                    <span className="text-sm font-bold text-slate-900">{totalAssets ? Math.round((totalPhysical / totalAssets) * 100) : 0}%</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-red-50/50 rounded-2xl group cursor-default">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 bg-red-500 rounded-full" />
                      <span className="text-xs font-bold text-red-600 uppercase">Comprometimento em Dívidas</span>
                    </div>
                    <span className="text-sm font-bold text-red-600">{totalAssets ? Math.round((totalLiabilities / totalAssets) * 100) : 0}%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-10 rounded-[32px] border border-slate-100 shadow-sm space-y-8">
              <h3 className="font-bold text-slate-900 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center"><Target size={18} /></div>
                Objetivos Patrimoniais
              </h3>
              <div className="space-y-4">
                <p className="text-xs text-slate-400 font-medium italic">Seus investimentos estão crescendo de forma saudável!</p>
                <div className="p-5 bg-brand-50 border border-brand-100 rounded-2xl">
                  <h4 className="text-xs font-black text-brand-800 uppercase tracking-widest mb-1">Preservação de Capital</h4>
                  <p className="text-[11px] text-brand-600 leading-relaxed">O valor acumulado em rendimentos mensais cobre a totalidade de custos operacionais com passivos. Continue alocando recursos em ativos inteligentes.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* REAL ESTATE VIEW */}
        {activeView === 'realestate' && (
          <div className="space-y-8">
            <div className="flex gap-4 border-b border-slate-100 pb-3">
              <button
                onClick={() => setActiveSubTab('portfolio')}
                className={`pb-2 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${activeSubTab === 'portfolio' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                🏢 Imóveis e Consórcios
              </button>
              <button
                onClick={() => setActiveSubTab('simulator')}
                className={`pb-2 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${activeSubTab === 'simulator' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                📈 Simulador de Sustentabilidade
              </button>
            </div>

            {activeSubTab === 'portfolio' && (
              <div className="space-y-8">
                {/* Sustainable Analysis Indicator */}
                <div className="bg-slate-900 text-white rounded-[40px] p-8 lg:p-10 shadow-xl space-y-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 rounded-bl-[200px] pointer-events-none" />
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-6 border-b border-white/10">
                    <div>
                      <h3 className="text-2xl font-black italic tracking-tight flex items-center gap-2">
                        <Zap className="text-brand-400 shrink-0" size={24} />
                        Autossuficiência & Preservação do Imóvel
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Comparativo de fluxo passivo de aluguéis e dividendos contra dívidas imobiliárias</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => setShowAnalysisSettings(!showAnalysisSettings)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                      >
                        {showAnalysisSettings ? 'Fechar Ajustes ✕' : '⚙️ Customizar Filtros'}
                      </button>
                    </div>
                  </div>

                  {showAnalysisSettings && (
                    <div className="p-6 bg-white/5 border border-white/10 rounded-3xl grid grid-cols-1 sm:grid-cols-3 gap-6 animate-in slide-in-from-top duration-300">
                      <div className="space-y-3 bg-slate-950/40 p-5 rounded-2xl border border-white/5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-white/5 pb-2">🏢 Imóveis Incluídos</p>
                        <div className="space-y-2.5 max-h-[150px] overflow-y-auto">
                          {activePhysicalAssets.filter(p => p.category === 'REAL_ESTATE').map(asset => {
                            const isIncluded = !excludedAssetIds.includes(asset.id);
                            return (
                              <label key={asset.id} className="flex items-center gap-3 cursor-pointer text-xs font-medium">
                                <input
                                  type="checkbox"
                                  checked={isIncluded}
                                  onChange={() => setExcludedAssetIds(prev => isIncluded ? [...prev, asset.id] : prev.filter(id => id !== asset.id))}
                                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-brand-600 focus:ring-brand-500"
                                />
                                <span className={isIncluded ? 'text-white' : 'text-slate-500 line-through'}>{asset.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      
                      <div className="space-y-3 bg-slate-950/40 p-5 rounded-2xl border border-white/5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-white/5 pb-2">💳 Consórcios</p>
                        <div className="space-y-2.5 max-h-[150px] overflow-y-auto">
                          {activeLiabilities.filter(l => l.type === 'CONSORTIUM').map(cons => {
                            const isIncluded = !excludedConsortiumIds.includes(cons.id);
                            return (
                              <label key={cons.id} className="flex items-center gap-3 cursor-pointer text-xs font-medium">
                                <input
                                  type="checkbox"
                                  checked={isIncluded}
                                  onChange={() => setExcludedConsortiumIds(prev => isIncluded ? [...prev, cons.id] : prev.filter(id => id !== cons.id))}
                                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-brand-600"
                                />
                                <span className={isIncluded ? 'text-white' : 'text-slate-500 line-through'}>{cons.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-3 bg-slate-950/40 p-5 rounded-2xl border border-white/5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-white/5 pb-2">Rentabilidade XP</p>
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="number"
                            step="0.05"
                            className="w-16 h-8 bg-white/10 border border-white/10 text-white rounded-lg text-xs font-bold text-center outline-none"
                            value={estimatedYieldRate}
                            onChange={e => setEstimatedYieldRate(parseFloat(e.target.value) || 0)}
                          />
                          <span className="text-xs text-slate-300">% am</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Calculations rendering */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Rendas & Aluguéis (Entradas)</p>
                      <div className="flex justify-between items-baseline">
                        <span className="text-2xl font-black text-emerald-400">{formatCurrency(sustainabilitySummary.totalInflow)}</span>
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">Entrada Estimada</span>
                      </div>
                      <div className="border-t border-white/5 pt-2 text-[9px] text-slate-400 space-y-1">
                        <div className="flex justify-between">
                          <span>Aluguéis Ativos:</span>
                          <span className="font-bold text-slate-200">{formatCurrency(sustainabilitySummary.totalRents)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Yield XP ({estimatedYieldRate}%):</span>
                          <span className="font-bold text-slate-200">{formatCurrency(sustainabilitySummary.estimatedMonthlyYield)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Prestações & Despesas (Saídas)</p>
                      <div className="flex justify-between items-baseline">
                        <span className="text-2xl font-black text-rose-400">{formatCurrency(sustainabilitySummary.totalOutflow)}</span>
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">Saídas Mensais</span>
                      </div>
                      <div className="border-t border-white/5 pt-2 text-[9px] text-slate-400 space-y-1">
                        <div className="flex justify-between">
                          <span>Financiamento Imob:</span>
                          <span className="font-bold text-slate-200">{formatCurrency(sustainabilitySummary.totalMortgageInstallments)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Custos IPTU / Condomínio:</span>
                          <span className="font-bold text-slate-200">{formatCurrency(sustainabilitySummary.totalOperatingCosts)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Parcela Consórcios:</span>
                          <span className="font-bold text-slate-200">{formatCurrency(sustainabilitySummary.totalConsortiumInstallments)}</span>
                        </div>
                      </div>
                    </div>

                    <div className={`rounded-3xl p-6 space-y-4 ${sustainabilitySummary.netFlow >= 0 ? 'bg-emerald-950/60 border border-emerald-500/20' : 'bg-rose-950/60 border border-rose-500/20'}`}>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Resultado Líquido Patrimonial</p>
                      <div className="flex justify-between items-baseline">
                        <span className={`text-2xl font-black ${sustainabilitySummary.netFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {sustainabilitySummary.netFlow >= 0 ? '+' : ''}{formatCurrency(sustainabilitySummary.netFlow)}
                        </span>
                        <span className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter">Saldo Líquido</span>
                      </div>
                      <div className="border-t border-white/5 pt-2 text-[9px] text-slate-300 space-y-1">
                        <div className="flex justify-between">
                          <span>Sustentabilidade:</span>
                          <span className="font-black text-slate-100">{sustainabilitySummary.selfSustainabilityPercent}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Autossuficiente:</span>
                          <span className="font-bold">{sustainabilitySummary.netFlow >= 0 ? 'SIM 🟢' : 'NÃO 🔴'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Real Estate Active Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {activePhysicalAssets.filter(p => p.category === 'REAL_ESTATE').map(asset => {
                    const meta = asset.metadata || {};
                    const linkedLiab = activeLiabilities.find(l => l.linkedAssetId === asset.id);
                    const propertyStage = meta.propertyStage || 'PRONTO';
                    const isRented = !!meta.isRented;
                    const rental = Number(meta.rentalIncome) || 0;
                    const condo = Number(meta.condoFee) || 0;
                    const iptu = Number(meta.iptuFee) || 0;
                    const installment = linkedLiab ? Number(linkedLiab.installmentAmount) : 0;

                    // Calculate sustainability at property level
                    const actualCondoCost = meta.inquilinoPaysCondo ? 0 : condo;
                    const actualIptuCost = meta.inquilinoPaysIPTU ? 0 : iptu;
                    const totalMonthlyCost = installment + actualCondoCost + actualIptuCost;
                    const netPropertyFlow = isRented ? rental - totalMonthlyCost : -totalMonthlyCost;

                    return (
                      <div key={asset.id} className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden hover:shadow-xl transition-all duration-500 flex flex-col justify-between">
                        <div className="p-8 space-y-6">
                          <div className="flex justify-between items-start">
                            <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-slate-900/10">
                              <HomeIcon size={22} />
                            </div>
                            <div className="flex gap-1.5">
                              {propertyStage === 'PLANTA' ? (
                                <button
                                  onClick={() => togglePropertyTypeDirectly(asset)}
                                  className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-xl text-[8px] font-black uppercase tracking-widest border border-amber-100 transition-colors"
                                >
                                  Na Planta 🛠️
                                </button>
                              ) : (
                                <button
                                  onClick={() => togglePropertyTypeDirectly(asset)}
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
                            <h4 className="font-black text-slate-900 text-xl tracking-tight leading-tight italic">{asset.name}</h4>
                            <div className="flex justify-between items-center mt-3 border-b border-slate-50 pb-2">
                              <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Avaliação Atual:</p>
                              <p className="text-sm font-black text-slate-900">{formatCurrency(asset.estimatedValue)}</p>
                            </div>
                          </div>

                          {/* Pre-construction specs */}
                          {propertyStage === 'PLANTA' ? (
                            <div className="space-y-3 pt-2 text-[11px] text-slate-500">
                              <div className="flex justify-between">
                                <span>Índice Correção:</span>
                                <span className="font-bold text-brand-600">{meta.indexType || 'INCC'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Valor de Compra:</span>
                                <span className="font-bold text-slate-800">{formatCurrency(meta.purchaseValue || 0)}</span>
                              </div>
                              {linkedLiab && (
                                <div className="flex justify-between">
                                  <span>Financiamento Restante:</span>
                                  <span className="font-bold text-red-500">{formatCurrency(linkedLiab.remainingBalance)}</span>
                                </div>
                              )}
                              <div className="flex justify-between border-t border-dashed border-slate-100 pt-2 font-bold text-slate-600">
                                <span>Déficit Mensal:</span>
                                <span className="text-rose-500">{formatCurrency(totalMonthlyCost)}/mês</span>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3 pt-2 text-[11px] text-slate-500">
                              <div className="flex justify-between">
                                <span>Aluguel Líquido:</span>
                                <span className="font-bold text-emerald-600">{isRented ? formatCurrency(rental) : 'Não Alugado'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Prestação Financiamento:</span>
                                <span className="font-bold text-slate-700">{formatCurrency(installment)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Condomínio + IPTU:</span>
                                <span className="font-bold text-slate-700">{formatCurrency(condo + iptu)}</span>
                              </div>
                              <div className="flex justify-between text-[10px] border-t border-dashed border-slate-100 pt-2 font-bold">
                                <span>Saldo Caixa Líquido:</span>
                                <span className={netPropertyFlow >= 0 ? 'text-emerald-600' : 'text-rose-500'}>
                                  {netPropertyFlow >= 0 ? '+' : ''}{formatCurrency(netPropertyFlow)}/mês
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
                                  style={{ width: `${Math.min(isRented && totalMonthlyCost > 0 ? Math.round((rental / totalMonthlyCost) * 100) : 0, 100)}%` }}
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
                        <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex justify-between items-center gap-4">
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
                            <button
                              onClick={() => openEditAsset(asset)}
                              className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-brand-600"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleArchiveAsset(asset)}
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
            )}

            {activeSubTab === 'simulator' && (
              <div className="bg-white p-10 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                <h3 className="font-bold text-slate-900 flex items-center gap-3">
                  <TrendingUp size={20} className="text-slate-500" />
                  Projeção e Simulações Imobiliárias
                </h3>
                <p className="text-xs text-slate-400 font-medium">Configure cenários hipotéticos de taxa vacância, juros e aluguéis para simular o retorno futuro.</p>
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 italic">
                  Simulador de investimento imobiliário avançado integrado. Adicione novas aquisições na planta para simular correções pelo INCC histórico nas prestações mensais e balões.
                </div>
              </div>
            )}
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
                const diffFipe = fipe - value;
                const isDepreciatingFast = purchase > 0 && fipe < purchase * 0.8;

                return (
                  <div key={asset.id} className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden hover:shadow-xl transition-all duration-500 flex flex-col justify-between">
                    <div className="p-8 space-y-6">
                      <div className="flex justify-between items-start">
                        <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-slate-900/10">
                          {asset.category === 'VEHICLE' ? <Car size={22} /> : <Box size={22} />}
                        </div>
                        <div className="flex gap-1.5">
                          {meta.purpose === 'investimento' ? (
                            <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-xl text-[8px] font-black uppercase tracking-widest border border-indigo-100">Investimento</span>
                          ) : (
                            <span className="px-3 py-1 bg-slate-50 text-slate-600 rounded-xl text-[8px] font-black uppercase tracking-widest border border-slate-100">Uso Pessoal</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-black text-slate-900 text-xl tracking-tight leading-tight italic">{asset.name}</h4>
                        <div className="flex justify-between items-center mt-3 border-b border-slate-50 pb-2">
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Avaliação Atual:</p>
                          <p className="text-sm font-black text-slate-900">{formatCurrency(value)}</p>
                        </div>
                      </div>

                      {/* Calculations specs */}
                      <div className="space-y-3 text-[11px] text-slate-500">
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
                        <div className={`p-3 rounded-xl flex items-start gap-2.5 ${isDepreciatingFast ? 'bg-amber-50 border border-amber-100 text-amber-800' : 'bg-slate-50 border border-slate-100 text-slate-600'}`}>
                          {isDepreciatingFast ? <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-500" /> : <HelpCircle size={16} className="shrink-0 mt-0.5 text-slate-400" />}
                          <p className="text-[10px] leading-relaxed">
                            {isDepreciatingFast 
                              ? '🚨 O veículo desvalorizou mais de 20% em relação ao valor de compra. Pode ser um bom momento para desinvestimento.' 
                              : '🟢 Nível de depreciação aceitável. Valor está estável comparado à média FIPE.'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Actions bar */}
                    <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex justify-between items-center gap-4">
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

                {formData.category === 'VEHICLE' && formData.purpose === 'uso' && (
                  <div className="space-y-2 animate-in slide-in-from-top-2">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Valor Atual Tabela FIPE (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900 outline-none"
                      placeholder="FIPE Atual"
                      value={formData.fipeValue}
                      onChange={(e) => setFormData({ ...formData, fipeValue: e.target.value })}
                    />
                  </div>
                )}

                {formData.purpose === 'investimento' && formData.category !== 'REAL_ESTATE' && (
                  <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
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
                      Já foi Vendido?
                    </label>
                    {formData.isSold && (
                      <div className="col-span-2">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Valor Venda (R$)</label>
                        <input
                          type="number"
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold"
                          value={formData.soldValue}
                          onChange={(e) => setFormData({ ...formData, soldValue: e.target.value })}
                        />
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
                          onChange={(e) => setFormData({ ...formData, propertyStage: e.target.value as any })}
                        >
                          <option value="PRONTO">Pronto</option>
                          <option value="PLANTA">Na Planta (Em Construção)</option>
                        </select>
                      </div>
                      {formData.propertyStage === 'PRONTO' && (
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

                    {formData.propertyStage === 'PRONTO' && formData.isRented && (
                      <div className="space-y-3 pt-2 border-t border-dashed border-slate-200 animate-in slide-in-from-top-2">
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Valor Aluguel (R$)</label>
                            <input
                              type="number"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.rentalIncome}
                              onChange={(e) => setFormData({ ...formData, rentalIncome: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Condomínio (R$)</label>
                            <input
                              type="number"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.condoFee}
                              onChange={(e) => setFormData({ ...formData, condoFee: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">IPTU Mensal (R$)</label>
                            <input
                              type="number"
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold"
                              value={formData.iptuFee}
                              onChange={(e) => setFormData({ ...formData, iptuFee: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="flex gap-4 pt-1">
                          <label className="flex items-center gap-2 cursor-pointer font-bold text-[10px]">
                            <input
                              type="checkbox"
                              checked={formData.inquilinoPaysCondo}
                              onChange={(e) => setFormData({ ...formData, inquilinoPaysCondo: e.target.checked })}
                            />
                            Inquilino paga Condomínio
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer font-bold text-[10px]">
                            <input
                              type="checkbox"
                              checked={formData.inquilinoPaysIPTU}
                              onChange={(e) => setFormData({ ...formData, inquilinoPaysIPTU: e.target.checked })}
                            />
                            Inquilino paga IPTU
                          </label>
                        </div>
                      </div>
                    )}
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
                    onChange={(e) => setRealEstateManageForm({ ...realEstateManageForm, propertyType: e.target.value as any })}
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

              {realEstateManageForm.propertyType === 'PRONTO' && realEstateManageForm.isRented && (
                <div className="space-y-3 pt-2 border-t border-dashed border-slate-200 animate-in slide-in-from-top-2">
                  <div className="grid grid-cols-3 gap-3">
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
    </div>
  );
};

export default Assets;
