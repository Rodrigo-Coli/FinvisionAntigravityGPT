import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Home,
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
  Loader2
} from 'lucide-react';
import { PhysicalAsset, InvestmentBroker, Liability } from '../types';

import { supabase } from '../lib/supabase/client';
import { RealEstateWizardModal } from '../components/assets/RealEstateWizardModal';

const Assets: React.FC = () => {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<'overview' | 'realestate' | 'physical' | 'investments' | 'liabilities'>('overview');
  const [inccRate, setInccRate] = useState<number | null>(null);
  const [loadingIncc, setLoadingIncc] = useState<boolean>(false);

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
  const [physicalAssets, setPhysicalAssets] = useState<PhysicalAsset[]>([]);
  const [brokers, setBrokers] = useState<InvestmentBroker[]>([]);
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [realEstateTransactions, setRealEstateTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [estimatedYieldRate, setEstimatedYieldRate] = useState<number>(0.8);
  const [excludedAssetIds, setExcludedAssetIds] = useState<string[]>([]);
  const [excludedConsortiumIds, setExcludedConsortiumIds] = useState<string[]>([]);
  const [excludedOtherAssetIds, setExcludedOtherAssetIds] = useState<string[]>([]);
  const [excludedOtherLiabilityIds, setExcludedOtherLiabilityIds] = useState<string[]>([]);
  const [excludedBrokerIds, setExcludedBrokerIds] = useState<string[]>([]);
  const [showAnalysisSettings, setShowAnalysisSettings] = useState(false);
  const [showRealEstateManageModal, setShowRealEstateManageModal] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'portfolio' | 'simulator'>('portfolio');
  const [projectionPeriod, setProjectionPeriod] = useState<6 | 12 | 24 | 36>(12);
  const [projectionScope, setProjectionScope] = useState<string>('consolidated');
  const [propertyVacancySim, setPropertyVacancySim] = useState<Record<string, boolean>>({});
  const [auditModalData, setAuditModalData] = useState<{
    monthLabel: string;
    type: 'inflow' | 'outflow' | 'investments';
    items: { name: string; value: number }[];
  } | null>(null);
  const [selectedLiabilityForManage, setSelectedLiabilityForManage] = useState<any | null>(null);
  const [realEstateManageForm, setRealEstateManageForm] = useState({
    propertyType: 'PLANTA' as 'PLANTA' | 'PRONTO',
    rentalIncome: '',
    operationalExpenses: '',
    deliveryDate: '',
    installmentAmount: ''
  });

  const openManageRealEstateForAsset = (asset: PhysicalAsset, liability?: any) => {
    if (liability) {
      setSelectedLiabilityForManage(liability);
      setRealEstateManageForm({
        propertyType: liability.metadata?.propertyType || 'PLANTA',
        rentalIncome: liability.metadata?.rentalIncome ? String(liability.metadata.rentalIncome) : '',
        operationalExpenses: liability.metadata?.operationalExpenses ? String(liability.metadata.operationalExpenses) : '',
        deliveryDate: liability.metadata?.deliveryDate || '',
        installmentAmount: liability.installmentAmount ? String(liability.installmentAmount) : ''
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
          propertyType: 'PRONTO',
          rentalIncome: 0,
          operationalExpenses: 0,
          isRealEstate: true
        }
      });
      setRealEstateManageForm({
        propertyType: 'PRONTO',
        rentalIncome: '',
        operationalExpenses: '',
        deliveryDate: '',
        installmentAmount: ''
      });
    }
    setShowRealEstateManageModal(true);
  };

  const saveRealEstateManage = async () => {
    if (!supabase || !selectedLiabilityForManage) return;
    try {
      const rentVal = parseFloat(realEstateManageForm.rentalIncome) || 0;
      const expVal = parseFloat(realEstateManageForm.operationalExpenses) || 0;
      const instVal = parseFloat(realEstateManageForm.installmentAmount) || 0;

      const updatedMetadata = {
        ...(selectedLiabilityForManage.metadata || {}),
        propertyType: realEstateManageForm.propertyType,
        rentalIncome: rentVal,
        operationalExpenses: expVal,
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

  const [showModal, setShowModal] = useState(false);
  const [showWizardModal, setShowWizardModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<PhysicalAsset | null>(null);
  const [editingLiability, setEditingLiability] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'REAL_ESTATE',
    estimatedValue: '',
    acquisitionDate: '',
    description: ''
  });

  const [selectedAssetForManagement, setSelectedAssetForManagement] = useState<PhysicalAsset | null>(null);

  const openEditAsset = (asset: PhysicalAsset) => {
    setEditingAsset(asset);
    setFormData({
      name: asset.name,
      category: asset.category,
      estimatedValue: String(asset.estimatedValue),
      acquisitionDate: asset.acquisitionDate || '',
      description: asset.description || ''
    });
    setShowModal(true);
  };

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      if (editingAsset) {
        // UPDATE existing asset
        const { error } = await supabase.from('physical_assets').update({
          name: formData.name,
          category: formData.category,
          estimated_value: parseFloat(formData.estimatedValue) || 0,
          acquisition_date: formData.acquisitionDate || null,
          description: formData.description
        }).eq('id', editingAsset.id);
        if (error) throw error;
      } else {
        // INSERT new asset
        const { error } = await supabase.from('physical_assets').insert([{
          user_id: user.id,
          name: formData.name,
          category: formData.category,
          estimated_value: parseFloat(formData.estimatedValue) || 0,
          acquisition_date: formData.acquisitionDate || null,
          description: formData.description
        }]);
        if (error) throw error;
      }

      setShowModal(false);
      setEditingAsset(null);
      setFormData({ name: '', category: 'REAL_ESTATE', estimatedValue: '', acquisitionDate: '', description: '' });
      fetchData();
    } catch (err: any) {
      alert(`Erro ao salvar: ${err.message}`);
    }
  };

  const [showLiabilityModal, setShowLiabilityModal] = useState(false);
  const [liabilityFormData, setLiabilityFormData] = useState({
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
    balloonMonth: '',
    balloonYear: '',
    balloonAmount: '',
    balloons: [] as { month: number; year: number; amount: number }[],
    propertyType: 'PLANTA' as 'PLANTA' | 'PRONTO'
  });

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
          metadata: {
            ...editingLiability.metadata,
            indexationRate: parseFloat(liabilityFormData.indexationRate) || 0,
            balloons: liabilityFormData.balloons,
            propertyType: liabilityFormData.type === 'MORTGAGE' ? (liabilityFormData.propertyType || 'PLANTA') : undefined,
            isRealEstate: liabilityFormData.type === 'MORTGAGE' ? true : undefined
          }
        }).eq('id', editingLiability.id);
        if (error) throw error;
      } else {
        // 1. Insert the Liability
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

        // 2. If user filled out installment info, auto-generate future PENDING transactions
        if (newLiab && newLiab.length > 0 && installmentAmt > 0 && installmentsLeft > 0) {
          const liabilityId = newLiab[0].id;
          const today = new Date();
          const categoryName = 'Financiamento/Dívida';

          // Garante que a categoria exista na conta do usuário
          const { data: existingCat } = await supabase.from('categories')
            .select('id').eq('user_id', user.id).eq('name', categoryName).single();

          if (!existingCat) {
            await supabase.from('categories').insert({
              user_id: user.id,
              name: categoryName,
              type: 'EXPENSE',
              color: 'bg-rose-50 text-rose-600'
            });
          }

          const futureTransactions = [];

          const MAX_GENERATE = Math.min(installmentsLeft, 240);
          for (let i = 1; i <= MAX_GENERATE; i++) {
            const txDate = new Date(today.getFullYear(), today.getMonth() + i, dueDay);
            if (txDate.getDate() !== dueDay) {
              txDate.setDate(0);
            }
            futureTransactions.push({
              user_id: user.id,
              description: `Parcela ${i}/${installmentsLeft} - ${liabilityFormData.name}`,
              amount: installmentAmt,
              date: txDate.toISOString().split('T')[0],
              type: 'EXPENSE',
              category: 'Financiamento/Dívida',
              account_id: null,
              is_amortization: true,
              liability_id: liabilityId,
              is_paid: false,
              is_recurring: true,
              metadata: { auto_generated: true, installment_number: i, installment_group_id: liabilityId }
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
      alert(`Erro ao salvar: ${err.message}`);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const sb = supabase;
    if (!sb) return;
    setIsLoading(true);
    try {
      const { data: { user }, error: authError } = await sb.auth.getUser();
      if (authError) throw authError;
      if (!user) {
        console.error('Assets: No user found');
        setIsLoading(false);
        return;
      }

      console.log('Assets: Fetching data for user', user.id);

      // Fetch Physical Assets
      const { data: phys } = await sb.from('physical_assets').select('*').eq('user_id', user.id);
      if (phys) {
        setPhysicalAssets(phys.map((p: any) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          estimatedValue: Number(p.estimated_value),
          acquisitionDate: p.acquisition_date,
          description: p.description
        })));
      }

      // Fetch Investment Accounts (as Brokers)
      const { data: accs } = await sb.from('accounts').select('*').eq('user_id', user.id).eq('type', 'INVESTMENT');
      if (accs) {
        setBrokers(accs.map((a: any) => ({
          id: a.id,
          name: a.institution,
          balance: Number(a.current_balance),
          allocation: [
            { type: 'Capital', percentage: 100, value: Number(a.current_balance), color: 'bg-brand-500' }
          ]
        })));
      }

      // Fetch Liabilities
      const { data: liabs } = await sb.from('liabilities').select('*').eq('user_id', user.id);
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
          metadata: l.metadata
        })));
      }

      // Fetch transactions linked to liabilities
      const { data: txs } = await sb.from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .not('liability_id', 'is', null);
      if (txs) {
        setRealEstateTransactions(txs);
      }
    } catch (e: any) {
      console.error('Assets: Error fetching data', e);
      alert(`Erro ao carregar patrimônio: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  const isRealEstateLiab = (l: any) => {
    if (l.type === 'MORTGAGE' || l.metadata?.isRealEstate) return true;
    if (l.linkedAssetId) {
      const linkedAsset = physicalAssets.find(p => p.id === l.linkedAssetId);
      if (linkedAsset && linkedAsset.category === 'REAL_ESTATE') return true;
    }
    return false;
  };

  const togglePropertyTypeDirectly = async (asset: PhysicalAsset, liability?: any) => {
    if (!supabase) return;
    const currentType = liability?.metadata?.propertyType || 'PLANTA';
    const newType = currentType === 'PLANTA' ? 'PRONTO' : 'PLANTA';
    
    try {
      if (liability) {
        const updatedMetadata = {
          ...(liability.metadata || {}),
          propertyType: newType
        };
        
        const { error } = await supabase.from('liabilities').update({
          metadata: updatedMetadata
        }).eq('id', liability.id);
        
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const { error } = await supabase.from('liabilities').insert([{
          user_id: user.id,
          name: `Custos/Rendimentos: ${asset.name}`,
          type: 'MORTGAGE',
          total_amount: 0,
          remaining_balance: 0,
          installment_amount: 0,
          linked_asset_id: asset.id,
          metadata: {
            propertyType: newType,
            rentalIncome: 0,
            operationalExpenses: 0,
            isRealEstate: true
          }
        }]);
        
        if (error) throw error;
      }
      
      fetchData();
    } catch (err: any) {
      alert(`Erro ao alterar o status do imóvel: ${err.message}`);
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
      installmentAmount: '',
      installmentsRemaining: '',
      dueDay: '',
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
    if (!window.confirm("Certeza que deseja excluir este passivo? Ele será removido do seu patrimônio físico.")) return;
    try {
      const { error } = await supabase!.from('liabilities').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert(`Erro ao excluir passivo: ${err.message}`);
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const totalPhysical = physicalAssets.reduce((acc, curr) => acc + curr.estimatedValue, 0);
  const totalFinancial = brokers.reduce((acc, curr) => acc + curr.balance, 0);
  const totalLiabilities = liabilities.reduce((acc, curr) => acc + curr.remainingBalance, 0);
  const totalAssets = totalPhysical + totalFinancial;
  const totalNetWorth = totalAssets - totalLiabilities;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
        <div className="w-10 h-10 border-2 border-slate-200 border-t-brand-600 rounded-full animate-spin" />
        <p className="text-slate-400 font-medium tracking-widest text-[10px] uppercase">Carregando Patrimônio...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-10 pt-8 pb-36 space-y-8 animate-in fade-in duration-500">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Patrimônio Líquido</h1>
          <p className="text-sm text-slate-400 font-medium">Bens físicos e ativos financeiros consolidados.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowWizardModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-white border border-brand-200 text-brand-600 rounded-xl text-sm font-bold shadow-sm hover:bg-brand-50 hover:scale-105 transition-transform active:scale-95"
          >
            <Building2 size={18} /> Aquisição Imobiliária
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform active:scale-95"
          >
            <Plus size={18} /> Novo Ativo
          </button>
        </div>
      </div>

      {/* SUMMARY BANNER */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-brand-900 md:col-span-1 rounded-[32px] p-8 text-white relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-[100px] -translate-y-10 translate-x-10" />
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Total Consolidado</p>
          <h3 className="text-3xl font-bold tracking-tight">{formatCurrency(totalNetWorth)}</h3>
          <div className="mt-6 flex items-center gap-2">
            <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-lg">{totalNetWorth > 0 ? '+0.0%' : '---'}</span>
            <span className="text-slate-500 text-[10px] font-medium uppercase tracking-widest">Crescimento real</span>
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-[32px] p-8 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Bens Físicos</p>
          <h3 className="text-3xl font-bold text-slate-900 tracking-tight">{formatCurrency(totalPhysical)}</h3>
          <p className="text-[10px] font-bold text-slate-300 mt-6 uppercase tracking-widest">Imóveis e Veículos</p>
        </div>

        <div className="bg-white border border-slate-100 rounded-[32px] p-8 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Financeiros</p>
          <h3 className="text-3xl font-bold text-brand-600 tracking-tight">{formatCurrency(totalFinancial)}</h3>
          <p className="text-[10px] font-bold text-slate-300 mt-6 uppercase tracking-widest">Corretoras e Cripto</p>
        </div>

        <div className="bg-red-50/50 border border-red-100/50 rounded-[32px] p-8 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-400 mb-2">Passivos</p>
          <h3 className="text-3xl font-bold text-red-600 tracking-tight">{formatCurrency(totalLiabilities)}</h3>
          <p className="text-[10px] font-bold text-red-300 mt-6 uppercase tracking-widest">Dívidas e Financiamentos</p>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex gap-2 p-1.5 bg-slate-50 border border-slate-100 rounded-2xl w-full max-w-full overflow-x-auto scrollbar-hide">
        {[
          { id: 'overview', label: 'Visão Geral', icon: <LayoutGrid size={16} /> },
          { id: 'realestate', label: 'Investimento Imobiliário', icon: <Building2 size={16} /> },
          { id: 'physical', label: 'Bens Físicos', icon: <Box size={16} /> },
          { id: 'investments', label: 'Investimentos', icon: <TrendingUp size={16} /> },
          { id: 'liabilities', label: 'Passivos (Dívidas)', icon: <Landmark size={16} /> }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${activeView === tab.id ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTENT AREA */}
      <div className="animate-in fade-in duration-700">
        {activeView === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-10 rounded-[32px] border border-slate-100 shadow-sm space-y-8">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center"><PieChart size={18} /></div>
                  Alocação Geral
                </h3>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-12">
                <div className="relative w-40 h-40 shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="16" fill="none" className="stroke-slate-50" strokeWidth="3" />
                    <circle cx="18" cy="18" r="16" fill="none" className="stroke-brand-600" strokeWidth="3" strokeDasharray="80 100" />
                    <circle cx="18" cy="18" r="16" fill="none" className="stroke-emerald-500" strokeWidth="3" strokeDasharray="20 100" strokeDashoffset="-80" />
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
              <div className="space-y-8">
                <p className="text-xs text-slate-400 font-medium italic">Configure seus objetivos na página de Planejamento para acompanhar seu progresso aqui.</p>
              </div>
            </div>
          </div>
        )}

        {activeView === 'realestate' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* SUB-TABS NAVIGATION */}
            <div className="flex gap-4 border-b border-slate-100 pb-3">
              <button
                onClick={() => setActiveSubTab('portfolio')}
                className={`pb-2 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${activeSubTab === 'portfolio' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                🏢 Carteira Ativa (Bens e Consórcios)
              </button>
              <button
                onClick={() => setActiveSubTab('simulator')}
                className={`pb-2 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${activeSubTab === 'simulator' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                📈 Simulador de Projeção Mensal
              </button>
            </div>

            {activeSubTab === 'portfolio' && (
              <>
                {/* CONSOLIDATED SUMMARY CARDS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Gross Real Estate Portfolio */}
              <div className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Bens Imobiliários (Ativo)</p>
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {formatCurrency(physicalAssets.filter(p => p.category === 'REAL_ESTATE').reduce((acc, curr) => acc + curr.estimatedValue, 0))}
                </h3>
                <p className="text-[9px] font-bold text-brand-600 mt-4 uppercase tracking-widest flex items-center gap-1">
                  <ArrowUpRight size={12} className="text-brand-600" /> {physicalAssets.filter(p => p.category === 'REAL_ESTATE').length} Imóveis Cadastrados
                </p>
              </div>

              {/* Real Estate Debt */}
              <div className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Dívidas Imobiliárias (Passivo)</p>
                <h3 className="text-2xl font-bold text-red-600 tracking-tight">
                  {formatCurrency(liabilities.filter(isRealEstateLiab).reduce((acc, curr) => acc + curr.remainingBalance, 0))}
                </h3>
                <p className="text-[9px] font-bold text-rose-500 mt-4 uppercase tracking-widest flex items-center gap-1">
                  <ArrowDownRight size={12} className="text-rose-500" /> {liabilities.filter(isRealEstateLiab).length} Financiamentos
                </p>
              </div>

              {/* Net Real Estate Equity */}
              <div className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">Equity Imobiliário Líquido</p>
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {formatCurrency(
                    physicalAssets.filter(p => p.category === 'REAL_ESTATE').reduce((acc, curr) => acc + curr.estimatedValue, 0) -
                    liabilities.filter(isRealEstateLiab).reduce((acc, curr) => acc + curr.remainingBalance, 0)
                  )}
                </h3>
                <p className="text-[9px] font-bold text-brand-600 mt-4 uppercase tracking-widest leading-none">Seu patrimônio líquido em imóveis</p>
              </div>

              {/* LTV Médio */}
              <div className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-2">LTV Médio (Alavancagem)</p>
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {(() => {
                    const totalImobAsset = physicalAssets.filter(p => p.category === 'REAL_ESTATE').reduce((acc, curr) => acc + curr.estimatedValue, 0);
                    const totalImobDebt = liabilities.filter(isRealEstateLiab).reduce((acc, curr) => acc + curr.remainingBalance, 0);
                    if (totalImobAsset === 0) return '0%';
                    return `${Math.round((totalImobDebt / totalImobAsset) * 100)}%`;
                  })()}
                </h3>
                <p className="text-[9px] font-bold text-slate-400 mt-4 uppercase tracking-widest leading-none">Menos de 50% é considerado seguro</p>
              </div>
            </div>

            {/* INTEGRATED CAIXA / YIELD vs PASSIVOS PANEL */}
            <div className="bg-slate-900 text-white rounded-[40px] p-8 lg:p-10 shadow-xl space-y-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 rounded-bl-[200px] pointer-events-none" />
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-6 border-b border-white/10">
                <div>
                  <h3 className="text-2xl font-black italic tracking-tight flex items-center gap-2">
                    <Zap className="text-brand-400 shrink-0" size={24} />
                    Painel de Autossuficiência e Preservação de Capital
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Análise integrada de Imóveis, Consórcios e Rentabilidade Financeira</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <button
                    onClick={() => setShowAnalysisSettings(!showAnalysisSettings)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    {showAnalysisSettings ? 'Fechar Ajustes ✕' : '⚙️ Personalizar Análise'}
                  </button>
                  <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl p-2 shrink-0">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Simular Taxa:</span>
                    <input
                      type="number"
                      step="0.05"
                      className="w-14 h-8 bg-white/10 border border-white/10 text-white rounded-lg text-xs font-bold text-center outline-none focus:border-brand-500"
                      value={estimatedYieldRate}
                      onChange={e => setEstimatedYieldRate(parseFloat(e.target.value) || 0)}
                    />
                    <span className="text-xs font-bold text-slate-300">% am</span>
                  </div>
                </div>
              </div>

              {/* DYNAMIC SELECTION FILTER PANEL */}
              {showAnalysisSettings && (
                <div className="p-6 bg-white/5 border border-white/10 rounded-3xl space-y-6 animate-in slide-in-from-top duration-300">
                  <h4 className="text-xs font-black uppercase tracking-wider text-brand-400">Marque quais itens deseja incluir nos cálculos de fluxo passivo e compromissos:</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                    {/* Imóveis Column */}
                    <div className="space-y-3 bg-slate-950/40 p-5 rounded-2xl border border-white/5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-white/5 pb-2">🏢 Imóveis (Aluguel / Despesa)</p>
                      <div className="space-y-2.5 max-h-[200px] overflow-y-auto pr-1">
                        {physicalAssets.filter(p => p.category === 'REAL_ESTATE').map(asset => {
                          const isIncluded = !excludedAssetIds.includes(asset.id);
                          return (
                            <label key={asset.id} className="flex items-center gap-3 cursor-pointer text-xs font-medium hover:text-white transition-colors">
                              <input
                                type="checkbox"
                                checked={isIncluded}
                                onChange={() => {
                                  setExcludedAssetIds(prev =>
                                    isIncluded ? [...prev, asset.id] : prev.filter(id => id !== asset.id)
                                  );
                                }}
                                className="w-4 h-4 rounded border-white/20 bg-white/5 text-brand-600 focus:ring-brand-500"
                              />
                              <span className={isIncluded ? 'text-white' : 'text-slate-500 line-through'}>{asset.name}</span>
                            </label>
                          );
                        })}
                        {physicalAssets.filter(p => p.category === 'REAL_ESTATE').length === 0 && (
                          <p className="text-[10px] text-slate-500 italic">Nenhum imóvel cadastrado</p>
                        )}
                      </div>
                    </div>

                    {/* Veículos e Outros Bens Column */}
                    <div className="space-y-3 bg-slate-950/40 p-5 rounded-2xl border border-white/5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-white/5 pb-2">🚗 Veículos e Bens (Físicos)</p>
                      <div className="space-y-2.5 max-h-[200px] overflow-y-auto pr-1">
                        {physicalAssets.filter(p => p.category !== 'REAL_ESTATE').map(asset => {
                          const isIncluded = !excludedOtherAssetIds.includes(asset.id);
                          return (
                            <label key={asset.id} className="flex items-center gap-3 cursor-pointer text-xs font-medium hover:text-white transition-colors">
                              <input
                                type="checkbox"
                                checked={isIncluded}
                                onChange={() => {
                                  setExcludedOtherAssetIds(prev =>
                                    isIncluded ? [...prev, asset.id] : prev.filter(id => id !== asset.id)
                                  );
                                }}
                                className="w-4 h-4 rounded border-white/20 bg-white/5 text-brand-600 focus:ring-brand-500"
                              />
                              <span className={isIncluded ? 'text-white' : 'text-slate-500 line-through'}>{asset.name}</span>
                            </label>
                          );
                        })}
                        {physicalAssets.filter(p => p.category !== 'REAL_ESTATE').length === 0 && (
                          <p className="text-[10px] text-slate-500 italic">Nenhum veículo/bem cadastrado</p>
                        )}
                      </div>
                    </div>

                    {/* Consórcios Column */}
                    <div className="space-y-3 bg-slate-950/40 p-5 rounded-2xl border border-white/5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-white/5 pb-2">💳 Consórcios (Parcelas)</p>
                      <div className="space-y-2.5 max-h-[200px] overflow-y-auto pr-1">
                        {liabilities.filter(l => l.type === 'CONSORTIUM').map(cons => {
                          const isIncluded = !excludedConsortiumIds.includes(cons.id);
                          return (
                            <label key={cons.id} className="flex items-center gap-3 cursor-pointer text-xs font-medium hover:text-white transition-colors">
                              <input
                                type="checkbox"
                                checked={isIncluded}
                                onChange={() => {
                                  setExcludedConsortiumIds(prev =>
                                    isIncluded ? [...prev, cons.id] : prev.filter(id => id !== cons.id)
                                  );
                                }}
                                className="w-4 h-4 rounded border-white/20 bg-white/5 text-brand-600 focus:ring-brand-500"
                              />
                              <span className={isIncluded ? 'text-white' : 'text-slate-500 line-through'}>{cons.name}</span>
                            </label>
                          );
                        })}
                        {liabilities.filter(l => l.type === 'CONSORTIUM').length === 0 && (
                          <p className="text-[10px] text-slate-500 italic">Nenhum consórcio cadastrado</p>
                        )}
                      </div>
                    </div>

                    {/* Financiamentos e Passivos Column */}
                    <div className="space-y-3 bg-slate-950/40 p-5 rounded-2xl border border-white/5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-white/5 pb-2">📉 Financiamentos e Passivos</p>
                      <div className="space-y-2.5 max-h-[200px] overflow-y-auto pr-1">
                        {liabilities.filter(l => l.type !== 'CONSORTIUM' && !isRealEstateLiab(l)).map(liab => {
                          const isIncluded = !excludedOtherLiabilityIds.includes(liab.id);
                          return (
                            <label key={liab.id} className="flex items-center gap-3 cursor-pointer text-xs font-medium hover:text-white transition-colors">
                              <input
                                type="checkbox"
                                checked={isIncluded}
                                onChange={() => {
                                  setExcludedOtherLiabilityIds(prev =>
                                    isIncluded ? [...prev, liab.id] : prev.filter(id => id !== liab.id)
                                  );
                                }}
                                className="w-4 h-4 rounded border-white/20 bg-white/5 text-brand-600 focus:ring-brand-500"
                              />
                              <span className={isIncluded ? 'text-white' : 'text-slate-500 line-through'}>{liab.name}</span>
                            </label>
                          );
                        })}
                        {liabilities.filter(l => l.type !== 'CONSORTIUM' && !isRealEstateLiab(l)).length === 0 && (
                          <p className="text-[10px] text-slate-500 italic">Nenhum passivo geral cadastrado</p>
                        )}
                      </div>
                    </div>

                    {/* Contas de Investimento Column */}
                    <div className="space-y-3 bg-slate-950/40 p-5 rounded-2xl border border-white/5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-white/5 pb-2">📈 Contas Financeiras (XP/BTG...)</p>
                      <div className="space-y-2.5 max-h-[200px] overflow-y-auto pr-1">
                        {brokers.map(broker => {
                          const isIncluded = !excludedBrokerIds.includes(broker.id);
                          return (
                            <label key={broker.id} className="flex items-center gap-3 cursor-pointer text-xs font-medium hover:text-white transition-colors">
                              <input
                                type="checkbox"
                                checked={isIncluded}
                                onChange={() => {
                                  setExcludedBrokerIds(prev =>
                                    isIncluded ? [...prev, broker.id] : prev.filter(id => id !== broker.id)
                                  );
                                }}
                                className="w-4 h-4 rounded border-white/20 bg-white/5 text-brand-600 focus:ring-brand-500"
                              />
                              <span className={isIncluded ? 'text-white' : 'text-slate-500 line-through'}>{broker.name}</span>
                            </label>
                          );
                        })}
                        {brokers.length === 0 && (
                          <p className="text-[10px] text-slate-500 italic">Nenhuma conta vinculada</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CALCULATING VALUES FOR THE PANEL */}
              {(() => {
                // Outflows (Filtered dynamically by exclusions and asset type)
                const mortgageLiabs = liabilities.filter(l => {
                  if (!isRealEstateLiab(l)) return false;
                  if (excludedAssetIds.includes(l.linkedAssetId || '')) return false;
                  return true;
                });
                const consortiumLiabs = liabilities.filter(l => l.type === 'CONSORTIUM' && !excludedConsortiumIds.includes(l.id));
                const otherGeneralLiabs = liabilities.filter(l => l.type !== 'CONSORTIUM' && !isRealEstateLiab(l) && !excludedOtherLiabilityIds.includes(l.id));
                
                const totalMortgageInstallments = mortgageLiabs.reduce((acc, curr) => {
                  if (curr.remainingBalance <= 0 || (curr.installmentsRemaining !== undefined && curr.installmentsRemaining <= 0)) return acc;
                  return acc + (curr.installmentAmount || 0);
                }, 0);
                const totalOperatingCosts = mortgageLiabs.reduce((acc, curr) => acc + (Number(curr.metadata?.operationalExpenses) || 0), 0);
                const totalConsortiumInstallments = consortiumLiabs.reduce((acc, curr) => {
                  if (curr.remainingBalance <= 0 || (curr.installmentsRemaining !== undefined && curr.installmentsRemaining <= 0)) return acc;
                  return acc + (curr.installmentAmount || 0);
                }, 0);
                const totalOtherLiabilitiesInstallments = otherGeneralLiabs.reduce((acc, curr) => {
                  if (curr.remainingBalance <= 0 || (curr.installmentsRemaining !== undefined && curr.installmentsRemaining <= 0)) return acc;
                  return acc + (curr.installmentAmount || 0);
                }, 0);
                
                const totalOutflow = totalMortgageInstallments + totalOperatingCosts + totalConsortiumInstallments + totalOtherLiabilitiesInstallments;

                // Inflows (Filtered dynamically by exclusions)
                const totalRents = mortgageLiabs.reduce((acc, curr) => acc + (Number(curr.metadata?.rentalIncome) || 0), 0);
                const activeBrokers = brokers.filter(b => !excludedBrokerIds.includes(b.id));
                const totalInvestments = activeBrokers.reduce((acc, curr) => acc + curr.balance, 0);
                const estimatedMonthlyYieldValue = totalInvestments * (estimatedYieldRate / 100);
                
                const totalPassiveInflow = totalRents + estimatedMonthlyYieldValue;
                const netCashFlow = totalPassiveInflow - totalOutflow;
                const selfSustainabilityPercent = totalOutflow > 0 ? Math.round((totalPassiveInflow / totalOutflow) * 100) : 100;

                return (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Renda Passiva Card */}
                      <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Renda Passiva Mensal (Entradas)</p>
                        <div className="flex flex-col gap-2">
                          <div className="flex justify-between items-baseline">
                            <span className="text-2xl font-black text-emerald-400">{formatCurrency(totalPassiveInflow)}</span>
                            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">Entradas Totais</span>
                          </div>
                          <div className="border-t border-white/5 pt-2 text-[9px] text-slate-400 space-y-1">
                            <div className="flex justify-between">
                              <span>Aluguéis de Imóveis:</span>
                              <span className="font-bold text-slate-200">{formatCurrency(totalRents)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Rentabilidade XP/Corretoras ({estimatedYieldRate}% am):</span>
                              <span className="font-bold text-slate-200">{formatCurrency(estimatedMonthlyYieldValue)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Compromissos e Despesas Card */}
                      <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Compromissos e Parcelas (Saídas)</p>
                        <div className="flex flex-col gap-2">
                          <div className="flex justify-between items-baseline">
                            <span className="text-2xl font-black text-rose-400">{formatCurrency(totalOutflow)}</span>
                            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">Saídas Totais</span>
                          </div>
                          <div className="border-t border-white/5 pt-2 text-[9px] text-slate-400 space-y-1">
                            <div className="flex justify-between">
                              <span>Parcelas Imobiliárias:</span>
                              <span className="font-bold text-slate-200">{formatCurrency(totalMortgageInstallments)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Condomínio + IPTU Imóveis:</span>
                              <span className="font-bold text-slate-200">{formatCurrency(totalOperatingCosts)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Parcelas de Consórcios:</span>
                              <span className="font-bold text-slate-200">{formatCurrency(totalConsortiumInstallments)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Resultado e Margem Card */}
                      <div className={`rounded-3xl p-6 space-y-4 shadow-lg ${netCashFlow >= 0 ? 'bg-emerald-950/60 border border-emerald-500/20' : 'bg-rose-950/60 border border-rose-500/20'}`}>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Resultado do Fluxo Recorrente</p>
                        <div className="flex flex-col gap-2">
                          <div className="flex justify-between items-baseline">
                            <span className={`text-2xl font-black ${netCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {netCashFlow >= 0 ? '+' : ''}{formatCurrency(netCashFlow)}
                            </span>
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Saldo Líquido</span>
                          </div>
                          <div className="border-t border-white/5 pt-2 text-[9px] text-slate-300 space-y-1">
                            <div className="flex justify-between">
                              <span>Status Financeiro:</span>
                              <span className={`font-black ${netCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {netCashFlow >= 0 ? 'SUPERAVITÁRIO' : 'DÉFICIT DE CAIXA'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Grau de Sustentabilidade:</span>
                              <span className="font-bold">{selfSustainabilityPercent}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* CAPITAL PRESERVATION INDICATOR AND GAUGE */}
                    <div className="p-6 bg-white/5 border border-white/10 rounded-2xl space-y-4">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-3.5 h-3.5 rounded-full ${netCashFlow >= 0 ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`} />
                          <div>
                            <p className="text-xs font-black uppercase tracking-wider italic">Indicador de Preservação de Capital Principal</p>
                            <p className="text-[9px] text-slate-400 mt-0.5">Métrica que mede se as dívidas e custos estão corroendo seus investimentos financeiros.</p>
                          </div>
                        </div>
                        {netCashFlow >= 0 ? (
                          <span className="px-4 py-1.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-black rounded-lg border border-emerald-500/30 uppercase tracking-widest">
                            Preservação: 100% Protegido 🟢
                          </span>
                        ) : (
                          <span className="px-4 py-1.5 bg-rose-500/20 text-rose-400 text-[10px] font-black rounded-lg border border-rose-500/30 uppercase tracking-widest">
                            Retirada de Capital Ativa 🔴
                          </span>
                        )}
                      </div>

                      <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden flex border border-white/5">
                        <div
                          className={`h-full transition-all duration-700 ${netCashFlow >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                          style={{ width: `${Math.min(selfSustainabilityPercent, 100)}%` }}
                        />
                      </div>

                      <p className="text-[10px] text-slate-300 leading-relaxed">
                        {netCashFlow >= 0 ? (
                          <>
                            <strong>Parabéns!</strong> Seus rendimentos passivos agregados (Aluguéis + Rentabilidade estimada de {formatCurrency(totalInvestments)} investidos) superam todas as suas despesas recorrentes com financiamentos, condomínios, IPTUs e parcelas de consórcios. <strong>O seu patrimônio principal está 100% protegido e se valorizando por conta própria, livre de queima de capital!</strong>
                          </>
                        ) : (
                          <>
                            <strong>Atenção:</strong> Suas receitas passivas recorrentes cobrem apenas {selfSustainabilityPercent}% das suas despesas totais de imóveis e consórcios. Existe um déficit de <strong>{formatCurrency(Math.abs(netCashFlow))} por mês</strong> que está sendo <strong>retirado do seu capital principal</strong> (diminuindo seus investimentos líquidos) ou financiado pela sua renda ativa de trabalho. Sugerimos cautela antes de assumir novos financiamentos imobiliários.
                          </>
                        )}
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* REAL ESTATE AND CONSORTIA SECTION DETAILED */}
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-900 tracking-tight italic flex items-center gap-2">
                  <Building2 size={20} className="text-slate-500" />
                  Seus Bens e Financiamentos Imobiliários
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {physicalAssets.filter(asset => asset.category === 'REAL_ESTATE').map(asset => {
                  const linkedLiab = liabilities.find(l => l.linkedAssetId === asset.id);
                  const propertyType = linkedLiab?.metadata?.propertyType || 'PLANTA';
                  const rental = Number(linkedLiab?.metadata?.rentalIncome) || 0;
                  const costs = Number(linkedLiab?.metadata?.operationalExpenses) || 0;
                  const installment = Number(linkedLiab?.installmentAmount) || 0;
                  const netPropertyFlow = propertyType === 'PRONTO' ? rental - costs - installment : -(costs + installment);
                  
                  return (
                    <div key={asset.id} className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden hover:shadow-xl transition-all duration-500 flex flex-col justify-between">
                      <div className="p-8 space-y-6">
                        <div className="flex justify-between items-start">
                          <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-slate-900/10">
                            <Home size={22} />
                          </div>
                          <div className="flex gap-1">
                            {propertyType === 'PLANTA' ? (
                              <button
                                onClick={() => togglePropertyTypeDirectly(asset, linkedLiab)}
                                title="Clique para alternar o status do imóvel para Pronto / Entregue"
                                className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-xl text-[8px] font-black uppercase tracking-widest border border-amber-100 flex items-center gap-1 transition-colors"
                              >
                                Na Planta 🔄
                              </button>
                            ) : (
                              <button
                                onClick={() => togglePropertyTypeDirectly(asset, linkedLiab)}
                                title="Clique para alternar o status do imóvel para Na Planta"
                                className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-xl text-[8px] font-black uppercase tracking-widest border border-emerald-100 flex items-center gap-1 transition-colors"
                              >
                                Pronto / Entregue 🔄
                              </button>
                            )}
                          </div>
                        </div>

                        <div>
                          <h4 className="font-black text-slate-900 text-xl tracking-tight leading-tight italic">{asset.name}</h4>
                          <p className="text-[9px] text-slate-400 mt-2 font-black uppercase tracking-widest leading-none">Avaliação: {formatCurrency(asset.estimatedValue)}</p>
                        </div>

                        {/* Rents vs Mortgage details */}
                        <div className="pt-6 border-t border-slate-50 space-y-4">
                          {propertyType === 'PRONTO' ? (
                            <>
                              <div className="flex justify-between text-[10px] text-slate-500">
                                <span>Aluguel Recebido:</span>
                                <span className="font-bold text-emerald-600">{formatCurrency(rental)}</span>
                              </div>
                              <div className="flex justify-between text-[10px] text-slate-500">
                                <span>IPTU / Condomínio:</span>
                                <span className="font-bold text-rose-500">{formatCurrency(costs)}</span>
                              </div>
                              <div className="flex justify-between text-[10px] text-slate-500">
                                <span>Prestação Dívida:</span>
                                <span className="font-bold text-slate-700">{formatCurrency(installment)}</span>
                              </div>
                              <div className="flex justify-between text-[10px] border-t border-dashed border-slate-100 pt-2 font-bold">
                                <span>Sobras Caixa Líquido:</span>
                                <span className={netPropertyFlow >= 0 ? 'text-emerald-600' : 'text-rose-500'}>
                                  {netPropertyFlow >= 0 ? '+' : ''}{formatCurrency(netPropertyFlow)}/mês
                                </span>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex justify-between text-[10px] text-slate-500">
                                <span>Despesas Obra / Seguro:</span>
                                <span className="font-bold text-rose-500">{formatCurrency(costs)}</span>
                              </div>
                              <div className="flex justify-between text-[10px] text-slate-500">
                                <span>Prestação Financiamento:</span>
                                <span className="font-bold text-slate-700">{formatCurrency(installment)}</span>
                              </div>
                              <div className="flex justify-between text-[10px] text-slate-500">
                                <span>Índice Correção:</span>
                                <span className="font-bold text-brand-600">{linkedLiab?.metadata?.index_type || 'INCC'}</span>
                              </div>
                              <div className="flex justify-between text-[10px] border-t border-dashed border-slate-100 pt-2 font-bold text-slate-400">
                                <span>Consome Mensal:</span>
                                <span className="text-rose-500">{formatCurrency(netPropertyFlow)}/mês</span>
                              </div>

                              {/* LIST OF DOWN PAYMENTS AND BALLOONS */}
                              {linkedLiab && (
                                <div className="space-y-3 pt-3 border-t border-dashed border-slate-100 animate-in fade-in duration-300">
                                  {(() => {
                                    const assetTxs = realEstateTransactions.filter(t => t.liability_id === linkedLiab.id);
                                    
                                    const downPaymentsList = assetTxs.filter(t => 
                                      t.metadata?.type === 'DOWN_PAYMENT' || 
                                      t.description.toUpperCase().includes('ATO')
                                    ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                                    
                                    const intermList = assetTxs.filter(t => 
                                      t.metadata?.type === 'INTERMEDIARY' || 
                                      t.description.toUpperCase().includes('INTERMEDIÁRIA') || 
                                      t.description.toUpperCase().includes('BALÃO')
                                    ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                                    return (
                                      <>
                                        {downPaymentsList.length > 0 && (
                                          <div className="space-y-1">
                                            <p className="text-[8px] font-black text-brand-600 uppercase tracking-widest">🎯 Parcelas Ato / Entrada:</p>
                                            <div className="max-h-[90px] overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                                              {downPaymentsList.map(dp => (
                                                <div key={dp.id} className="flex justify-between text-[8px] font-bold text-slate-500">
                                                  <span className={dp.is_paid ? 'line-through text-slate-400' : ''}>
                                                    {dp.description.split(' - ')[0]} ({new Date(dp.date).toLocaleDateString('pt-BR', { month: '2-digit', year: '2-digit' })}):
                                                  </span>
                                                  <span className={dp.is_paid ? 'text-emerald-500' : 'text-slate-700'}>
                                                    {formatCurrency(dp.amount)} {dp.is_paid ? '✓' : ''}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        {intermList.length > 0 && (
                                          <div className="space-y-1 pt-1.5 border-t border-dotted border-slate-100">
                                            <p className="text-[8px] font-black text-amber-600 uppercase tracking-widest">🎈 Parcelas Intermediárias / Balões:</p>
                                            <div className="max-h-[90px] overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                                              {intermList.map(im => (
                                                <div key={im.id} className="flex justify-between text-[8px] font-bold text-slate-500">
                                                  <span className={im.is_paid ? 'line-through text-slate-400' : ''}>
                                                    {im.description.split(' - ')[0]} ({new Date(im.date).toLocaleDateString('pt-BR', { month: '2-digit', year: '2-digit' })}):
                                                  </span>
                                                  <span className={im.is_paid ? 'text-emerald-500' : 'text-amber-600'}>
                                                    {formatCurrency(im.amount)} {im.is_paid ? '✓' : ''}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="px-8 py-5 bg-slate-50/80 flex justify-between items-center border-t border-slate-100">
                        <button
                          onClick={() => openManageRealEstateForAsset(asset, linkedLiab)}
                          className="text-brand-600 text-[9px] font-black uppercase tracking-widest hover:underline"
                        >
                          Ajustar Aluguel e Custos
                        </button>
                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                          LTV: {linkedLiab ? `${Math.round((linkedLiab.remainingBalance / asset.estimatedValue) * 100)}%` : '0% (Quitado)'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CONSORTIA DETAILED GRID */}
            <div className="space-y-6 pt-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-900 tracking-tight italic flex items-center gap-2">
                  <Wallet size={20} className="text-slate-500" />
                  Sua Carteira de Consórcios
                </h3>
                <button
                  onClick={() => {
                    setLiabilityFormData({
                      name: 'Novo Consórcio',
                      type: 'CONSORTIUM',
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
                  className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-800 transition-colors"
                >
                  <Plus size={12} /> Adicionar Consórcio
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {liabilities.filter(l => l.type === 'CONSORTIUM').map(consortium => (
                  <div key={consortium.id} className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-8 space-y-6 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="w-10 h-10 bg-slate-100 text-slate-900 rounded-xl flex items-center justify-center">
                          <Wallet size={20} />
                        </div>
                        <span className="px-3 py-1 bg-brand-50 text-brand-600 rounded-lg text-[8px] font-black uppercase tracking-widest border border-brand-100">Consórcio Ativo</span>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-lg uppercase tracking-tight">{consortium.name}</h4>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Crédito Restante: {formatCurrency(consortium.remainingBalance)}</p>
                      </div>
                    </div>

                    <div className="border-t border-slate-50 pt-4 flex justify-between items-end">
                      <div>
                        <p className="text-[8px] font-black uppercase text-slate-300 tracking-widest mb-1 leading-none">Prestação Mensal</p>
                        <p className="text-xl font-bold text-slate-900 leading-none">{formatCurrency(consortium.installmentAmount || 0)}</p>
                      </div>
                      <button
                        onClick={() => openEditLiability(consortium)}
                        className="text-[9px] font-bold text-slate-400 hover:text-brand-600 uppercase tracking-widest"
                      >
                        Ajustar Parcelas
                      </button>
                    </div>
                  </div>
                ))}
                {liabilities.filter(l => l.type === 'CONSORTIUM').length === 0 && (
                  <div className="col-span-full py-12 border-2 border-dashed border-slate-100 rounded-[32px] flex flex-col items-center justify-center text-slate-300">
                    <Wallet size={36} />
                    <p className="mt-4 font-black uppercase tracking-widest text-[10px]">Nenhum consórcio cadastrado</p>
                    <p className="text-[9px] text-slate-400 mt-2 font-medium italic">Adicione seus consórcios para integrá-los à análise de caixa!</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ACTIVE SUB-TAB SIMULATOR VIEW */}
        {activeSubTab === 'simulator' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* CONTROLS BAR */}
            <div className="bg-slate-900 text-white rounded-[32px] p-6 lg:p-8 shadow-xl space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-brand-500/5 rounded-bl-[150px] pointer-events-none" />
              
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div>
                  <h3 className="text-xl font-black italic tracking-tight flex items-center gap-2">
                    <Zap className="text-brand-400 shrink-0" size={20} />
                    Simulador de Sustentabilidade de Fluxo Patrimonial
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Configure o escopo, período e cenários para analisar a saúde do seu capital</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Projection Scope dropdown */}
                  <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl p-2.5">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Escopo:</span>
                    <select
                      className="bg-transparent border-none text-white rounded-lg text-xs font-bold outline-none cursor-pointer pr-4"
                      value={projectionScope}
                      onChange={e => setProjectionScope(e.target.value)}
                    >
                      <option value="consolidated" className="bg-slate-900 text-white">Consolidado (Todos)</option>
                      {physicalAssets.filter(p => p.category === 'REAL_ESTATE').map(asset => (
                        <option key={asset.id} value={asset.id} className="bg-slate-900 text-white">{asset.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Projection Period dropdown */}
                  <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl p-2.5">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Período:</span>
                    <select
                      className="bg-transparent border-none text-white rounded-lg text-xs font-bold outline-none cursor-pointer pr-4"
                      value={projectionPeriod}
                      onChange={e => setProjectionPeriod(parseInt(e.target.value, 10) as any)}
                    >
                      <option value={6} className="bg-slate-900 text-white">6 Meses</option>
                      <option value={12} className="bg-slate-900 text-white">12 Meses</option>
                      <option value={24} className="bg-slate-900 text-white">24 Meses</option>
                      <option value={36} className="bg-slate-900 text-white">36 Meses</option>
                    </select>
                  </div>

                  {/* Yield rate input */}
                  <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl p-2.5">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Taxa Yield:</span>
                    <input
                      type="number"
                      step="0.05"
                      className="w-12 h-6 bg-white/10 border border-white/10 text-white rounded-md text-xs font-bold text-center outline-none"
                      value={estimatedYieldRate}
                      onChange={e => setEstimatedYieldRate(parseFloat(e.target.value) || 0)}
                    />
                    <span className="text-[10px] text-slate-300 font-bold">% am</span>
                  </div>
                </div>
              </div>

              {/* ACTIVE ITEMS FILTERS (Only relevant in Consolidated view) */}
              {projectionScope === 'consolidated' && (
                <div className="border-t border-white/10 pt-4">
                  <div className="flex justify-between items-center mb-3">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Itens incluídos no cálculo unificado:</p>
                    <button
                      onClick={() => setShowAnalysisSettings(!showAnalysisSettings)}
                      className="text-[8px] font-black uppercase text-brand-400 tracking-widest hover:underline"
                    >
                      {showAnalysisSettings ? 'Ocultar Seletores' : 'Exibir Seletores Avançados'}
                    </button>
                  </div>
                  
                  {showAnalysisSettings && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 bg-slate-950/40 p-5 rounded-2xl border border-white/5 animate-in slide-in-from-top duration-200">
                      {/* Imóveis */}
                      <div className="space-y-2">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-1">🏢 Imóveis</p>
                        {physicalAssets.filter(p => p.category === 'REAL_ESTATE').map(asset => {
                          const isIncluded = !excludedAssetIds.includes(asset.id);
                          return (
                            <label key={asset.id} className="flex items-center gap-2.5 cursor-pointer text-[11px] font-medium hover:text-white transition-colors">
                              <input
                                type="checkbox"
                                checked={isIncluded}
                                onChange={() => {
                                  setExcludedAssetIds(prev =>
                                    isIncluded ? [...prev, asset.id] : prev.filter(id => id !== asset.id)
                                  );
                                }}
                                className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-brand-600 focus:ring-brand-500"
                              />
                              <span className={isIncluded ? 'text-white' : 'text-slate-500 line-through'}>{asset.name}</span>
                            </label>
                          );
                        })}
                      </div>

                      {/* Veículos e Outros Bens */}
                      <div className="space-y-2">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-1">🚗 Veículos e Bens</p>
                        {physicalAssets.filter(p => p.category !== 'REAL_ESTATE').map(asset => {
                          const isIncluded = !excludedOtherAssetIds.includes(asset.id);
                          return (
                            <label key={asset.id} className="flex items-center gap-2.5 cursor-pointer text-[11px] font-medium hover:text-white transition-colors">
                              <input
                                type="checkbox"
                                checked={isIncluded}
                                onChange={() => {
                                  setExcludedOtherAssetIds(prev =>
                                    isIncluded ? [...prev, asset.id] : prev.filter(id => id !== asset.id)
                                  );
                                }}
                                className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-brand-600 focus:ring-brand-500"
                              />
                              <span className={isIncluded ? 'text-white' : 'text-slate-500 line-through'}>{asset.name}</span>
                            </label>
                          );
                        })}
                      </div>

                      {/* Consórcios */}
                      <div className="space-y-2">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-1">💳 Consórcios</p>
                        {liabilities.filter(l => l.type === 'CONSORTIUM').map(cons => {
                          const isIncluded = !excludedConsortiumIds.includes(cons.id);
                          return (
                            <label key={cons.id} className="flex items-center gap-2.5 cursor-pointer text-[11px] font-medium hover:text-white transition-colors">
                              <input
                                type="checkbox"
                                checked={isIncluded}
                                onChange={() => {
                                  setExcludedConsortiumIds(prev =>
                                    isIncluded ? [...prev, cons.id] : prev.filter(id => id !== cons.id)
                                  );
                                }}
                                className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-brand-600 focus:ring-brand-500"
                              />
                              <span className={isIncluded ? 'text-white' : 'text-slate-500 line-through'}>{cons.name}</span>
                            </label>
                          );
                        })}
                      </div>

                      {/* Passivos Gerais */}
                      <div className="space-y-2">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-1">📉 Passivos Gerais</p>
                        {liabilities.filter(l => l.type !== 'CONSORTIUM' && !isRealEstateLiab(l)).map(liab => {
                          const isIncluded = !excludedOtherLiabilityIds.includes(liab.id);
                          return (
                            <label key={liab.id} className="flex items-center gap-2.5 cursor-pointer text-[11px] font-medium hover:text-white transition-colors">
                              <input
                                type="checkbox"
                                checked={isIncluded}
                                onChange={() => {
                                  setExcludedOtherLiabilityIds(prev =>
                                    isIncluded ? [...prev, liab.id] : prev.filter(id => id !== liab.id)
                                  );
                                }}
                                className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-brand-600 focus:ring-brand-500"
                              />
                              <span className={isIncluded ? 'text-white' : 'text-slate-500 line-through'}>{liab.name}</span>
                            </label>
                          );
                        })}
                      </div>

                      {/* Brokers */}
                      <div className="space-y-2">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-1">📈 Investimentos</p>
                        {brokers.map(broker => {
                          const isIncluded = !excludedBrokerIds.includes(broker.id);
                          return (
                            <label key={broker.id} className="flex items-center gap-2.5 cursor-pointer text-[11px] font-medium hover:text-white transition-colors">
                              <input
                                type="checkbox"
                                checked={isIncluded}
                                onChange={() => {
                                  setExcludedBrokerIds(prev =>
                                    isIncluded ? [...prev, broker.id] : prev.filter(id => id !== broker.id)
                                  );
                                }}
                                className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-brand-600 focus:ring-brand-500"
                              />
                              <span className={isIncluded ? 'text-white' : 'text-slate-500 line-through'}>{broker.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* VACANCY SIMULATOR PANEL */}
            {projectionScope === 'consolidated' && physicalAssets.filter(p => p.category === 'REAL_ESTATE').length > 0 && (
              <div className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">🚨 Simulador de Vacância / Ocupação de Aluguel</p>
                <p className="text-xs text-slate-400 font-medium">Desmarque para simular o imóvel como <strong>vago/desocupado</strong> na projeção futura e ver o impacto imediato no seu caixa:</p>
                <div className="flex flex-wrap gap-4">
                  {physicalAssets.filter(p => p.category === 'REAL_ESTATE').map(asset => {
                    const isRented = propertyVacancySim[asset.id] !== false; // defaults to true
                    return (
                      <button
                        key={asset.id}
                        onClick={() => {
                          setPropertyVacancySim({
                            ...propertyVacancySim,
                            [asset.id]: !isRented
                          });
                        }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${isRented ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}
                      >
                        <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                        {asset.name}: {isRented ? 'Alugado 🏠' : 'Vago ❌'}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* MONTH BY MONTH PROJECTION SHEET */}
            {(() => {
              const today = new Date();
              const monthsToProject = projectionPeriod;

              // Filter items according to scope
              const filteredAssets = physicalAssets.filter(p => {
                if (p.category !== 'REAL_ESTATE') return false;
                if (projectionScope !== 'consolidated' && p.id !== projectionScope) return false;
                if (projectionScope === 'consolidated' && excludedAssetIds.includes(p.id)) return false;
                return true;
              });

              const filteredLiabilities = liabilities.filter(l => {
                if (projectionScope === 'consolidated') {
                  if (l.type === 'CONSORTIUM') return !excludedConsortiumIds.includes(l.id);
                  if (isRealEstateLiab(l)) {
                    if (excludedAssetIds.includes(l.linkedAssetId || '')) return false;
                    return true;
                  }
                  // General liabilities
                  return !excludedOtherLiabilityIds.includes(l.id);
                } else {
                  if (l.linkedAssetId !== projectionScope) return false;
                }
                return true;
              });

              const activeBrokers = brokers.filter(b => {
                if (projectionScope !== 'consolidated') return false;
                return !excludedBrokerIds.includes(b.id);
              });

              const startInvestmentCapital = activeBrokers.reduce((acc, curr) => acc + curr.balance, 0);
              const projectionData: any[] = [];
              let runningCapital = startInvestmentCapital;

              for (let m = 0; m < monthsToProject; m++) {
                const projMonthDate = new Date(today.getFullYear(), today.getMonth() + m, 1);
                const monthLabel = projMonthDate.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
                const monthNum = projMonthDate.getMonth() + 1;
                const yearNum = projMonthDate.getFullYear();

                // 1. Calculate Inflow (Rents + Financial Returns)
                const rentItems: { name: string; value: number }[] = [];
                filteredAssets.forEach(asset => {
                  const linkedLiab = liabilities.find(l => l.linkedAssetId === asset.id);
                  const isRentedSim = propertyVacancySim[asset.id] !== false;
                  const propertyType = linkedLiab?.metadata?.propertyType || 'PLANTA';
                  const rentalVal = Number(linkedLiab?.metadata?.rentalIncome) || 0;
                  const deliveryDateStr = linkedLiab?.metadata?.deliveryDate;

                  let isDelivered = propertyType === 'PRONTO';
                  if (propertyType === 'PLANTA' && deliveryDateStr) {
                    const delDate = new Date(deliveryDateStr);
                    if (projMonthDate >= new Date(delDate.getFullYear(), delDate.getMonth(), 1)) {
                      isDelivered = true;
                    }
                  }

                  if (isDelivered && isRentedSim && rentalVal > 0) {
                    rentItems.push({ name: `${asset.name} (Aluguel)`, value: rentalVal });
                  }
                });

                const totalRents = rentItems.reduce((acc, curr) => acc + curr.value, 0);

                // Investment simulated yields (only in consolidated view)
                const yieldValue = runningCapital * (estimatedYieldRate / 100);
                const investmentItems = projectionScope === 'consolidated' && startInvestmentCapital > 0 ? [
                  { name: `Yield Simulado (${estimatedYieldRate}% s/ ${formatCurrency(runningCapital)})`, value: yieldValue }
                ] : [];
                const totalYields = yieldValue > 0 && projectionScope === 'consolidated' ? yieldValue : 0;

                const totalInflow = totalRents + totalYields;

                // 2. Calculate Outflow (Mortgages, Condo, Consortia, Balloons, Down Payments)
                const mortgageItems: { name: string; value: number }[] = [];
                const condoItems: { name: string; value: number }[] = [];
                const consortiumItems: { name: string; value: number }[] = [];
                const balloonItems: { name: string; value: number }[] = [];
                const downPaymentItems: { name: string; value: number }[] = [];

                filteredLiabilities.forEach(l => {
                  const remaining = l.remainingBalance;
                  const isSettled = remaining <= 0 || (l.installmentsRemaining !== undefined && l.installmentsRemaining <= 0);

                  // Extract from realEstateTransactions (for ATO and balloons)
                  const monthTxs = realEstateTransactions.filter(t => {
                    if (t.liability_id !== l.id) return false;
                    const tDate = new Date(t.date);
                    const tMonth = tDate.getUTCMonth() + 1;
                    const tYear = tDate.getUTCFullYear();
                    const tMonthLocal = tDate.getMonth() + 1;
                    const tYearLocal = tDate.getFullYear();
                    return (tMonth === monthNum && tYear === yearNum) || (tMonthLocal === monthNum && tYearLocal === yearNum);
                  });

                  const downs = monthTxs.filter(t => t.metadata?.type === 'DOWN_PAYMENT' || t.description.toUpperCase().includes('ATO'));
                  downs.forEach(d => {
                    downPaymentItems.push({ name: `${l.name.replace('Dívida Imob: ', '')} (Ato / Entrada)`, value: Number(d.amount) });
                  });

                  const balls = monthTxs.filter(t => 
                    t.metadata?.type === 'INTERMEDIARY' || 
                    t.description.toUpperCase().includes('INTERMEDIÁRIA') || 
                    t.description.toUpperCase().includes('BALÃO')
                  );
                  balls.forEach(b => {
                    balloonItems.push({ name: `${l.name.replace('Dívida Imob: ', '')} (Intermediária / Balão)`, value: Number(b.amount) });
                  });

                  if (l.type === 'CONSORTIUM') {
                    if (!isSettled && (l.installmentsRemaining === undefined || l.installmentsRemaining > m)) {
                      consortiumItems.push({ name: `${l.name} (Parcela)`, value: l.installmentAmount || 0 });
                    }
                  } else {
                    if (!isSettled && (l.installmentsRemaining === undefined || l.installmentsRemaining > m)) {
                      mortgageItems.push({ name: `${l.name} (Prestador)`, value: l.installmentAmount || 0 });
                    }

                    const condoVal = Number(l.metadata?.operationalExpenses) || 0;
                    if (condoVal > 0) {
                      condoItems.push({ name: `${l.name.replace('Dívida Imob: ', '')} (Taxa/Cond)`, value: condoVal });
                    }

                    const balloons = l.metadata?.balloons || [];
                    balloons.forEach((b: any) => {
                      if (Number(b.month) === monthNum && Number(b.year) === yearNum) {
                        const hasMatch = balloonItems.some(item => Math.abs(item.value - Number(b.amount)) < 0.1);
                        if (!hasMatch) {
                          balloonItems.push({ name: `${l.name.replace('Dívida Imob: ', '')} (Intermediária / Balão)`, value: Number(b.amount) });
                        }
                      }
                    });
                  }
                });

                const totalMortgages = mortgageItems.reduce((acc, curr) => acc + curr.value, 0);
                const totalCondo = condoItems.reduce((acc, curr) => acc + curr.value, 0);
                const totalConsortium = consortiumItems.reduce((acc, curr) => acc + curr.value, 0);
                const totalBalloons = balloonItems.reduce((acc, curr) => acc + curr.value, 0);
                const totalDownPayments = downPaymentItems.reduce((acc, curr) => acc + curr.value, 0);

                const totalOutflow = totalMortgages + totalCondo + totalConsortium + totalBalloons + totalDownPayments;
                const netCashFlow = totalInflow - totalOutflow;

                const prevCapital = runningCapital;
                if (projectionScope === 'consolidated') {
                  runningCapital = Math.max(0, runningCapital + netCashFlow);
                }

                projectionData.push({
                  monthLabel,
                  totalRents,
                  rentItems,
                  totalYields,
                  investmentItems,
                  totalInflow,
                  totalMortgages,
                  mortgageItems,
                  totalCondo,
                  condoItems,
                  totalConsortium,
                  consortiumItems,
                  totalBalloons,
                  balloonItems,
                  totalDownPayments,
                  downPaymentItems,
                  totalOutflow,
                  netCashFlow,
                  prevCapital,
                  runningCapital
                });
              }

              const totalCumulativeCashflow = projectionData.reduce((acc, curr) => acc + curr.netCashFlow, 0);

              return (
                <div className="space-y-6">
                  {/* STATS HEADER */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Capital Inicial Simulador</p>
                      <h4 className="text-xl font-bold">{formatCurrency(startInvestmentCapital)}</h4>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Resultado Projetado Acumulado ({projectionPeriod}M)</p>
                      <h4 className={`text-xl font-bold ${totalCumulativeCashflow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {totalCumulativeCashflow >= 0 ? '+' : ''}{formatCurrency(totalCumulativeCashflow)}
                      </h4>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Capital Final Projetado</p>
                      <h4 className="text-xl font-bold text-brand-400">{formatCurrency(runningCapital)}</h4>
                    </div>
                  </div>

                  {/* SHEET TABLE CONTAINER */}
                  <div className="bg-white border border-slate-100 rounded-[32px] overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                          <LayoutGrid size={16} className="text-slate-400" />
                          Planilha de Fluxo de Caixa Mensal
                        </h4>
                        <p className="text-[10px] text-slate-400 font-medium">Toque nos valores nas colunas de Entradas, Saídas e Saldo para inspecionar os cálculos individuais e auditar erros.</p>
                      </div>
                      <span className="px-3 py-1 bg-brand-50 text-brand-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-brand-100">Auditável 🔍</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Mês</th>
                            <th className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Aluguéis (A)</th>
                            {projectionScope === 'consolidated' && (
                              <th className="py-4 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Rent. Invest (B)</th>
                            )}
                            <th className="py-4 px-6 text-[10px] font-black text-emerald-600 uppercase tracking-widest text-right bg-emerald-50/20">Total Entradas (A+B)</th>
                            <th className="py-4 px-6 text-[10px] font-black text-rose-600 uppercase tracking-widest text-right bg-rose-50/20">Saídas (Custo/Divida)</th>
                            <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Saldo Mensal</th>
                            {projectionScope === 'consolidated' && (
                              <th className="py-4 px-6 text-[10px] font-black text-brand-600 uppercase tracking-widest text-right">Saldo XP/Bancos</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {projectionData.map((row, idx) => {
                            const isPositive = row.netCashFlow >= 0;
                            const hasBalloons = row.totalBalloons > 0;
                            
                            return (
                              <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/40 transition-colors">
                                <td className="py-4.5 px-6 font-black text-slate-900 uppercase text-xs italic">{row.monthLabel}</td>
                                
                                <td 
                                  onClick={() => {
                                    if (row.rentItems.length > 0) {
                                      setAuditModalData({
                                        monthLabel: row.monthLabel,
                                        type: 'inflow',
                                        items: row.rentItems
                                      });
                                    }
                                  }}
                                  className="py-4.5 px-6 font-bold text-slate-600 text-xs text-right cursor-pointer hover:bg-slate-100/50 rounded-lg transition-colors"
                                >
                                  {formatCurrency(row.totalRents)}
                                </td>

                                {projectionScope === 'consolidated' && (
                                  <td 
                                    onClick={() => {
                                      if (row.investmentItems.length > 0) {
                                        setAuditModalData({
                                          monthLabel: row.monthLabel,
                                          type: 'investments',
                                          items: row.investmentItems
                                        });
                                      }
                                    }}
                                    className="py-4.5 px-6 font-bold text-slate-600 text-xs text-right cursor-pointer hover:bg-slate-100/50 rounded-lg transition-colors"
                                  >
                                    {formatCurrency(row.totalYields)}
                                  </td>
                                )}

                                <td className="py-4.5 px-6 font-extrabold text-emerald-600 text-xs text-right bg-emerald-50/10">
                                  {formatCurrency(row.totalInflow)}
                                </td>

                                <td 
                                  onClick={() => {
                                    const allOut = [
                                      ...row.mortgageItems,
                                      ...row.condoItems,
                                      ...row.consortiumItems,
                                      ...row.balloonItems,
                                      ...row.downPaymentItems
                                    ];
                                    if (allOut.length > 0) {
                                      setAuditModalData({
                                        monthLabel: row.monthLabel,
                                        type: 'outflow',
                                        items: allOut
                                      });
                                    }
                                  }}
                                  className={`py-4.5 px-6 font-extrabold text-xs text-right cursor-pointer hover:bg-rose-100/40 rounded-lg transition-all bg-rose-50/10 ${hasBalloons ? 'text-rose-700 bg-amber-50/20 border-l-4 border-amber-500' : 'text-rose-600'}`}
                                >
                                  <div className="flex flex-col items-end">
                                    <span>{formatCurrency(row.totalOutflow)}</span>
                                    {hasBalloons && <span className="text-[7px] text-amber-600 font-black uppercase tracking-tighter mt-0.5">Balão 🎈</span>}
                                  </div>
                                </td>

                                <td className={`py-4.5 px-6 font-black text-xs text-right ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {isPositive ? '+' : ''}{formatCurrency(row.netCashFlow)}
                                </td>

                                {projectionScope === 'consolidated' && (
                                  <td className="py-4.5 px-6 font-bold text-brand-700 text-xs text-right">
                                    {formatCurrency(row.runningCapital)}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* SIMULATION SUMMARY WARNINGS */}
                  <div className="p-6 bg-slate-900 text-white rounded-3xl space-y-4 border border-slate-800">
                    <div className="flex items-center gap-3">
                      <HelpCircle className="text-brand-400" size={18} />
                      <h4 className="font-bold text-sm tracking-tight">Análise do Simulador</h4>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {projectionScope !== 'consolidated' ? (
                        <>
                          Você está analisando a performance <strong>estritamente individual</strong> do imóvel selecionado. Esta simulação desconta impostos de condomínio/IPTU e compara a receita de aluguel dele contra a prestação da sua própria dívida imobiliária.
                        </>
                      ) : totalCumulativeCashflow >= 0 ? (
                        <>
                          Seu patrimônio financeiro e imobiliário está configurado de forma a gerar um **Superávit Acumulado de {formatCurrency(totalCumulativeCashflow)}** no horizonte de {projectionPeriod} meses. <strong>Excelente notícia: você tem luz verde total para realizar novos investimentos sem depleção de capital!</strong>
                        </>
                      ) : (
                        <>
                          Atenção: A simulação acusa um **Déficit Acumulado de {formatCurrency(Math.abs(totalCumulativeCashflow))}** no horizonte de {projectionPeriod} meses. Nos meses em que houver balões de obras ou ausência de aluguel, você precisará retirar recursos das suas reservas para honrar as parcelas. É aconselhável ter um caixa preventivo ou agilizar o aluguel dos imóveis para garantir a integridade do seu capital.
                        </>
                      )}
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* AUDIT INSPECTOR MODAL */}
        {auditModalData && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden border border-slate-100 animate-in slide-in-from-bottom-4 duration-300">
              <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight italic flex items-center gap-2">
                    <Search size={18} className="text-brand-500" />
                    Auditoria de Cálculos - {auditModalData.monthLabel}
                  </h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                    {auditModalData.type === 'inflow' ? 'Detalhamento das Receitas (Aluguéis)' : auditModalData.type === 'outflow' ? 'Detalhamento das Despesas / Compromissos' : 'Detalhamento dos Rendimentos Financeiros'}
                  </p>
                </div>
                <button 
                  onClick={() => setAuditModalData(null)} 
                  className="w-10 h-10 bg-white border border-slate-100 text-slate-400 hover:text-rose-500 rounded-xl flex items-center justify-center shadow-sm"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-8 space-y-6 max-h-[400px] overflow-y-auto">
                <div className="space-y-3">
                  {auditModalData.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100/50">
                      <span className="text-xs font-bold text-slate-700">{item.name}</span>
                      <span className={`text-xs font-black ${auditModalData.type === 'inflow' || auditModalData.type === 'investments' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatCurrency(item.value)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Soma dos Itens</span>
                  <span className={`text-sm font-black ${auditModalData.type === 'inflow' || auditModalData.type === 'investments' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {formatCurrency(auditModalData.items.reduce((acc, curr) => acc + curr.value, 0))}
                  </span>
                </div>
              </div>

              <div className="px-8 py-5 bg-slate-50/80 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setAuditModalData(null)} 
                  className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* REAL ESTATE QUICK EDIT MODAL */}
            {showRealEstateManageModal && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
                <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 border border-slate-100">
                  <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h3 className="text-lg font-black text-slate-900 tracking-tight italic">Ajustar Custos e Aluguel</h3>
                    <button onClick={() => setShowRealEstateManageModal(false)} className="w-10 h-10 bg-white border border-slate-100 text-slate-400 hover:text-rose-500 rounded-xl flex items-center justify-center shadow-sm"><X size={18} /></button>
                  </div>

                  <div className="p-8 space-y-6">
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Status do Imóvel</label>
                      <select
                        className="w-full h-12 px-4 bg-slate-50 border border-slate-100 rounded-xl font-bold text-xs outline-none"
                        value={realEstateManageForm.propertyType}
                        onChange={e => setRealEstateManageForm({ ...realEstateManageForm, propertyType: e.target.value as any })}
                      >
                        <option value="PLANTA">Na Planta (Em Construção)</option>
                        <option value="PRONTO">Pronto / Entregue (Rendimento / Aluguel)</option>
                      </select>
                    </div>

                    {realEstateManageForm.propertyType === 'PRONTO' && (
                      <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                        <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Aluguel Mensal Recebido (R$)</label>
                        <input
                          type="number"
                          className="w-full h-12 px-4 bg-slate-50 border border-slate-100 rounded-xl font-black text-sm outline-none"
                          placeholder="0,00"
                          value={realEstateManageForm.rentalIncome}
                          onChange={e => setRealEstateManageForm({ ...realEstateManageForm, rentalIncome: e.target.value })}
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">
                        {realEstateManageForm.propertyType === 'PRONTO' ? 'Custos Operacionais Mensais (Condomínio, IPTU...) (R$)' : 'Taxas de Obra / Seguros Mensais (R$)'}
                      </label>
                      <input
                        type="number"
                        className="w-full h-12 px-4 bg-slate-50 border border-slate-100 rounded-xl font-black text-sm outline-none"
                        placeholder="0,00"
                        value={realEstateManageForm.operationalExpenses}
                        onChange={e => setRealEstateManageForm({ ...realEstateManageForm, operationalExpenses: e.target.value })}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Valor da Prestação / Financiamento Mensal (R$)</label>
                      <input
                        type="number"
                        className="w-full h-12 px-4 bg-slate-50 border border-slate-100 rounded-xl font-black text-sm outline-none"
                        placeholder="0,00"
                        value={realEstateManageForm.installmentAmount}
                        onChange={e => setRealEstateManageForm({ ...realEstateManageForm, installmentAmount: e.target.value })}
                      />
                    </div>

                    <div className="pt-4 flex gap-4">
                      <button onClick={() => setShowRealEstateManageModal(false)} className="flex-1 h-12 bg-slate-50 text-slate-400 rounded-xl text-[9px] font-black uppercase tracking-widest">Cancelar</button>
                      <button onClick={saveRealEstateManage} className="flex-1 h-12 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-md">Salvar</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeView === 'physical' && (
          <div className="space-y-10">
            {/* MANAGEMENT OVERLAY / DRAWER (Simple inline for now) */}
            {selectedAssetForManagement && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
                <div className="animate-in zoom-in-95 duration-300 bg-slate-900 rounded-[40px] p-8 md:p-10 text-white space-y-8 shadow-2xl relative overflow-hidden max-w-5xl w-full max-h-[90vh] overflow-y-auto border border-white/10">
                  <div className="absolute top-0 right-0 p-6 md:p-8 z-10">
                    <button onClick={() => setSelectedAssetForManagement(null)} className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center justify-center transition-all"><X size={24} /></button>
                  </div>
                
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-brand-600 rounded-[18px] flex items-center justify-center">
                        {selectedAssetForManagement.category === 'REAL_ESTATE' ? <Building2 size={24} /> : <Car size={24} />}
                      </div>
                      <div>
                        <h3 className="text-2xl font-black italic tracking-tight">{selectedAssetForManagement.name}</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Performance Financeira Consolidada</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-4">
                     <div className="bg-white/5 border border-white/10 rounded-3xl px-8 py-4 text-center">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Valor de Mercado</p>
                        <p className="text-xl font-black">{formatCurrency(selectedAssetForManagement.estimatedValue)}</p>
                     </div>
                     <div className="bg-white/5 border border-white/10 rounded-3xl px-8 py-4 text-center">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">LTV (Dívida/Ativo)</p>
                        <p className="text-xl font-black text-brand-400">
                          {(() => {
                            const liab = liabilities.find(l => l.linkedAssetId === selectedAssetForManagement.id);
                            if (!liab) return '0%';
                            return `${Math.round((liab.remainingBalance / selectedAssetForManagement.estimatedValue) * 100)}%`;
                          })()}
                        </p>
                     </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {(() => {
                    const linkedLiab = liabilities.find(l => l.linkedAssetId === selectedAssetForManagement.id);
                    const isRealEstate = selectedAssetForManagement.category === 'REAL_ESTATE';
                    
                    if (isRealEstate) {
                      const rental = Number(linkedLiab?.metadata?.rentalIncome) || 0;
                      const costs = Number(linkedLiab?.metadata?.operationalExpenses) || 0;
                      const installment = Number(linkedLiab?.installmentAmount) || 0;
                      const netFlow = rental - costs - installment;
                      const yieldRate = selectedAssetForManagement.estimatedValue > 0 ? (rental / selectedAssetForManagement.estimatedValue) * 100 : 0;
                      
                      return (
                        <>
                          {/* INCOME CARD */}
                          <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 space-y-6">
                            <div className="flex justify-between items-center">
                              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest italic">Receita Mensal (Aluguel)</h4>
                              <div className="w-8 h-8 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center"><ArrowUpRight size={16} /></div>
                            </div>
                            <p className="text-3xl font-black text-emerald-400">{formatCurrency(rental)}</p>
                            <p className="text-[9px] font-bold text-slate-500 leading-relaxed uppercase tracking-tight">
                              {rental > 0 
                                ? `Representa um Yield de ${yieldRate.toFixed(2)}% am sobre o valor do imóvel.`
                                : 'Nenhum aluguel ativo configurado para este imóvel.'}
                            </p>
                          </div>

                          {/* EXPENSES CARD */}
                          <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 space-y-6">
                            <div className="flex justify-between items-center">
                              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest italic">Despesas Operacionais</h4>
                              <div className="w-8 h-8 bg-rose-500/20 text-rose-400 rounded-xl flex items-center justify-center"><ArrowDownRight size={16} /></div>
                            </div>
                            <p className="text-3xl font-black text-rose-400">{formatCurrency(costs)}</p>
                            <div className="flex gap-2">
                              <span className="text-[8px] font-black px-2 py-1 bg-white/5 rounded-lg border border-white/10">IPTU</span>
                              <span className="text-[8px] font-black px-2 py-1 bg-white/5 rounded-lg border border-white/10">CONDOMÍNIO</span>
                              <span className="text-[8px] font-black px-2 py-1 bg-white/5 rounded-lg border border-white/10">MANUTENÇÃO</span>
                            </div>
                          </div>

                          {/* NET PROFIT CARD */}
                          <div className="bg-brand-600 rounded-[32px] p-8 space-y-6 shadow-xl shadow-brand-600/20">
                            <div className="flex justify-between items-center">
                              <h4 className="text-xs font-black text-white uppercase tracking-widest italic">Fluxo de Caixa Líquido</h4>
                              <div className="w-8 h-8 bg-white/20 text-white rounded-xl flex items-center justify-center"><Zap size={16} /></div>
                            </div>
                            <p className="text-3xl font-black text-white">{formatCurrency(netFlow)}</p>
                            <button 
                              onClick={() => navigate('/history', { state: { filterByAsset: selectedAssetForManagement.id } })}
                              className="w-full py-3 bg-white text-brand-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all"
                            >
                              Ver Extrato do Imóvel
                            </button>
                          </div>
                        </>
                      );
                    } else {
                      // For VEHICLES or OTHER physical assets
                      const remainingDebt = Number(linkedLiab?.remainingBalance) || 0;
                      const netEquity = selectedAssetForManagement.estimatedValue - remainingDebt;
                      
                      return (
                        <>
                          {/* ASSET SPECIFICATIONS CARD */}
                          <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 space-y-6">
                            <div className="flex justify-between items-center">
                              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest italic">Especificações do Bem</h4>
                              <div className="w-8 h-8 bg-brand-500/20 text-brand-400 rounded-xl flex items-center justify-center"><Car size={16} /></div>
                            </div>
                            <div className="space-y-2 text-xs font-medium">
                              <p className="text-[10px] text-slate-400">Categoria: <span className="text-slate-200 font-black">VEÍCULO / OUTROS</span></p>
                              <p className="text-[10px] text-slate-400">Aquisição: <span className="text-slate-200 font-black">{selectedAssetForManagement.acquisitionDate ? new Date(selectedAssetForManagement.acquisitionDate).toLocaleDateString('pt-BR') : '---'}</span></p>
                              <p className="text-[10px] text-slate-400 leading-normal">Descrição: <span className="text-slate-200 font-black block mt-1">{selectedAssetForManagement.description || 'Sem descrição cadastrada.'}</span></p>
                            </div>
                          </div>

                          {/* LIABILITY STATUS CARD */}
                          <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 space-y-6">
                            <div className="flex justify-between items-center">
                              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest italic">Financiamento / Dívida</h4>
                              <div className="w-8 h-8 bg-rose-500/20 text-rose-400 rounded-xl flex items-center justify-center"><Landmark size={16} /></div>
                            </div>
                            <p className="text-3xl font-black text-rose-400">{formatCurrency(remainingDebt)}</p>
                            <p className="text-[9px] font-bold text-slate-500 leading-relaxed uppercase tracking-tight">
                              {remainingDebt > 0 
                                ? `Prestação de ${formatCurrency(linkedLiab?.installmentAmount || 0)}/mês (${linkedLiab?.installmentsRemaining || 0} parcelas restantes).`
                                : 'Este bem está 100% quitado e livre de ônus.'}
                            </p>
                          </div>

                          {/* NET EQUITY CARD */}
                          <div className="bg-brand-600 rounded-[32px] p-8 space-y-6 shadow-xl shadow-brand-600/20">
                            <div className="flex justify-between items-center">
                              <h4 className="text-xs font-black text-white uppercase tracking-widest italic">Patrimônio Líquido (Equity)</h4>
                              <div className="w-8 h-8 bg-white/20 text-white rounded-xl flex items-center justify-center"><Zap size={16} /></div>
                            </div>
                            <p className="text-3xl font-black text-white">{formatCurrency(netEquity)}</p>
                            <button 
                              onClick={() => navigate('/history', { state: { filterByAsset: selectedAssetForManagement.id } })}
                              className="w-full py-3 bg-white text-brand-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all"
                            >
                              Ver Extrato do Veículo
                            </button>
                          </div>
                        </>
                      );
                    }
                  })()}
                </div>
              </div>
            </div>
          )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {physicalAssets.map(asset => (
                <div key={asset.id} className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden group hover:border-brand-300 hover:shadow-xl hover:shadow-slate-200 transition-all duration-500">
                  <div className="p-10 space-y-8">
                    <div className="flex justify-between items-start">
                      <div className={`w-16 h-16 rounded-[24px] flex items-center justify-center ${asset.category === 'REAL_ESTATE' ? 'bg-brand-900 text-white' : 'bg-slate-900 text-white'} shadow-xl shadow-current/10`}>
                        {asset.category === 'REAL_ESTATE' ? <Home size={32} /> : <Car size={32} />}
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setSelectedAssetForManagement(asset)} 
                          className="p-3 text-slate-400 hover:bg-brand-50 hover:text-brand-600 rounded-2xl transition-all"
                        >
                          <TrendingUp size={20} />
                        </button>
                        <button onClick={() => openEditAsset(asset)} className="p-3 text-slate-400 hover:bg-slate-100 hover:text-slate-900 rounded-2xl transition-all"><MoreHorizontal size={20} /></button>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-black text-slate-900 text-2xl tracking-tight leading-tight italic">{asset.name}</h4>
                      <p className="text-[10px] text-slate-400 mt-2 font-black uppercase tracking-widest">{asset.description || 'Sem descrição cadastrada'}</p>
                    </div>

                    <div className="pt-8 border-t border-slate-50 flex justify-between items-end">
                      <div>
                        <p className="text-[9px] font-black uppercase text-slate-300 tracking-[0.2em] mb-1.5 leading-none">Avaliação Patrimonial</p>
                        <p className="text-3xl font-black text-slate-900 leading-none tracking-tighter italic">{formatCurrency(asset.estimatedValue)}</p>
                      </div>
                      {liabilities.some(l => l.linkedAssetId === asset.id) && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100">
                          <Landmark size={12} />
                          <span className="text-[8px] font-black uppercase tracking-tighter">Alienado</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="px-10 py-6 bg-slate-50/50 flex justify-between items-center border-t border-slate-50 group-hover:bg-brand-50 transition-colors">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ano Aquisição: {asset.acquisitionDate ? new Date(asset.acquisitionDate).getFullYear() : '---'}</span>
                    <button 
                      onClick={() => setSelectedAssetForManagement(asset)} 
                      className="text-brand-600 text-[10px] font-black uppercase tracking-[0.2em] group-hover:underline flex items-center gap-2"
                    >
                      Análise de Balanço <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={() => setShowModal(true)}
                className="rounded-[40px] border-4 border-dashed border-slate-100 p-10 flex flex-col items-center justify-center gap-6 text-slate-300 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50 transition-all min-h-[360px] group"
              >
                <div className="w-20 h-20 bg-slate-50 rounded-[30px] flex items-center justify-center group-hover:bg-white group-hover:shadow-lg transition-all"><Plus size={40} /></div>
                <div className="text-center">
                  <p className="font-black uppercase tracking-[0.2em] text-slate-400 text-sm italic group-hover:text-brand-600">Registrar Novo Bem</p>
                  <p className="text-[10px] text-slate-300 font-bold mt-2">Imóveis, Veículos, Terrenos</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {activeView === 'investments' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-4">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">Carteira de Investimentos</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">Visão consolidada por instituição</p>
              </div>
              <button 
                onClick={() => navigate('/accounts', { state: { openModal: true, defaultType: 'INVESTMENT' } })}
                className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform active:scale-95"
              >
                <Plus size={14} /> Novo Investimento
              </button>
            </div>

            {brokers.map(broker => (
              <div key={broker.id} className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden p-8 lg:p-12">
                <div className="flex flex-col lg:flex-row gap-12 lg:items-center">
                  <div className="flex-1 space-y-8">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 bg-brand-900 text-white rounded-[22px] flex items-center justify-center font-bold text-2xl shadow-xl shadow-slate-900/10 shrink-0">
                        {broker.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-2xl font-bold text-slate-900 tracking-tight">{broker.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Conectado</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-300 tracking-widest mb-2 leading-none">Patrimônio Atual</p>
                      <p className="text-4xl font-bold text-slate-900 tracking-tighter leading-none">{formatCurrency(broker.balance)}</p>
                    </div>

                    <div className="flex gap-4">
                      <button onClick={() => alert('Integração de corretoras e visualização detalhada em desenvolvimento.')} className="flex-1 lg:flex-none px-8 py-3.5 bg-brand-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform active:scale-95">Ver Detalhes</button>
                      <button className="flex-1 lg:flex-none px-8 py-3.5 bg-slate-50 text-slate-400 rounded-xl text-xs font-bold uppercase tracking-widest hover:text-slate-900 hover:bg-slate-100 transition-all">Relatórios</button>
                    </div>
                  </div>

                  <div className="flex-1 bg-slate-50/50 rounded-[32px] p-8 lg:p-10 space-y-6">
                    <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest text-center lg:text-left leading-none">Alocação por Classe</p>

                    <div className="w-full bg-white h-4 rounded-full overflow-hidden flex border border-slate-100 shadow-sm">
                      {broker.allocation.map((item, idx) => (
                        <div
                          key={idx}
                          className={`${item.color} h-full transition-all duration-700`}
                          style={{ width: `${item.percentage}%` }}
                        />
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {broker.allocation.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100/50 shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className={`w-2.5 h-2.5 ${item.color} rounded-full`} />
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{item.type}</span>
                          </div>
                          <span className="font-bold text-slate-900 text-xs">{formatCurrency(item.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {brokers.length === 0 && (
              <div className="py-20 border-2 border-dashed border-slate-100 rounded-[40px] flex flex-col items-center justify-center text-slate-300">
                <TrendingUp size={48} />
                <p className="mt-4 font-bold uppercase tracking-widest text-xs">Nenhum investimento cadastrado</p>
                <p className="text-[10px] text-slate-400 mt-2 font-medium italic">Vincule uma conta de Investimento na aba de Contas.</p>
              </div>
            )}
          </div>
        )}

        {activeView === 'liabilities' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {liabilities.map(liability => (
              <div key={liability.id} className="bg-white rounded-[32px] border border-red-100 shadow-sm overflow-hidden group hover:border-red-200 transition-all duration-300">
                <div className="p-8 space-y-6">
                  <div className="flex justify-between items-start">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-red-50 text-red-600 shadow-lg shadow-current/5 shrink-0">
                      <Landmark size={28} />
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditLiability(liability)} className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-brand-600 transition-colors px-2 py-1">Editar</button>
                      <button onClick={() => handleDeleteLiability(liability.id)} className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-red-600 transition-colors px-2 py-1">Excluir</button>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-900 text-xl tracking-tight leading-tight uppercase tracking-tight">{liability.name}</h4>
                    <span className="inline-block mt-2 px-2 py-1 bg-slate-100 text-slate-500 rounded text-[10px] font-bold uppercase tracking-widest">
                      {liability.type === 'MORTGAGE' ? 'Financiamento Imob.' : liability.type === 'VEHICLE_FINANCING' ? 'Financ. Veículo' : liability.type === 'PERSONAL_LOAN' ? 'Empréstimo Pessoal' : liability.type === 'CONSORTIUM' ? 'Consórcio' : 'Outros'}
                    </span>
                  </div>

                  <div className="pt-6 border-t border-slate-50">
                    <p className="text-[10px] font-bold uppercase text-red-300 tracking-widest mb-1.5 leading-none">Saldo Devedor Restante</p>
                    <p className="text-2xl font-bold text-red-600 leading-none">{formatCurrency(liability.remainingBalance)}</p>
                  </div>
                </div>
                <div className="px-8 py-4 bg-red-50/30 flex justify-between items-center border-t border-red-50">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Total: {formatCurrency(liability.totalAmount)}</span>
                  <button onClick={() => alert('Integração de pagamento de parcelas e amortização em breve.')} className="text-red-500 text-[10px] font-bold uppercase tracking-widest hover:underline">Amortizar</button>
                </div>
              </div>
            ))}
            <button
              onClick={() => setShowLiabilityModal(true)}
              className="rounded-[32px] border-2 border-dashed border-red-100 p-8 flex flex-col items-center justify-center gap-4 text-red-300 hover:border-red-300 hover:text-red-500 hover:bg-red-50/30 transition-all min-h-[280px]"
            >
              <Plus size={32} />
              <span className="font-bold text-red-400">Novo Passivo</span>
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Novo Bem Físico</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-50">
                <LayoutGrid size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveAsset} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Nome / Identificação</label>
                <input
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  placeholder="Ex: Apartamento Centro"
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
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="REAL_ESTATE">Imóvel</option>
                    <option value="VEHICLE">Veículo</option>
                    <option value="OTHER">Outros Bens</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Valor Estimado (R$)</label>
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

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Data de Aquisição</label>
                <input
                  type="date"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500"
                  value={formData.acquisitionDate}
                  onChange={(e) => setFormData({ ...formData, acquisitionDate: e.target.value })}
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

      {showLiabilityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">{editingLiability ? 'Editar Dívida / Passivo' : 'Nova Dívida / Passivo'}</h3>
              <button onClick={() => setShowLiabilityModal(false)} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-50">
                <LayoutGrid size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveLiability} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Descrição (Ex: Financiamento Caixa)</label>
                <input
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                  placeholder="Nome do Passivo"
                  value={liabilityFormData.name}
                  onChange={(e) => setLiabilityFormData({ ...liabilityFormData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Tipo de Passivo</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-red-500"
                  value={liabilityFormData.type}
                  onChange={(e) => {
                    const newType = e.target.value;
                    setLiabilityFormData({
                      ...liabilityFormData,
                      type: newType,
                      indexationRate: newType === 'MORTGAGE' ? '5.5' : liabilityFormData.indexationRate
                    });
                  }}
                >
                  <option value="MORTGAGE">Financiamento Imobiliário</option>
                  <option value="VEHICLE_FINANCING">Financiamento de Veículo</option>
                  <option value="PERSONAL_LOAN">Empréstimo Pessoal</option>
                  <option value="CONSORTIUM">Consórcio</option>
                  <option value="OTHER">Outras Dívidas</option>
                </select>
              </div>

              {liabilityFormData.type === 'MORTGAGE' && (
                <div className="animate-in slide-in-from-top-2 duration-200">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Status do Imóvel</label>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-red-500"
                    value={liabilityFormData.propertyType}
                    onChange={(e) => setLiabilityFormData({ ...liabilityFormData, propertyType: e.target.value as 'PLANTA' | 'PRONTO' })}
                  >
                    <option value="PLANTA">Na Planta (Em Construção)</option>
                    <option value="PRONTO">Pronto / Entregue (Rendimento / Aluguel)</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Valor Original Total</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-red-500"
                    placeholder="0.00"
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
                    placeholder="0.00"
                    value={liabilityFormData.remainingBalance}
                    onChange={(e) => setLiabilityFormData({ ...liabilityFormData, remainingBalance: e.target.value })}
                  />
                </div>
              </div>

              {!editingLiability && (
                <div className="grid grid-cols-3 gap-4 border-t border-slate-100 pt-4 mt-2">
                  <div>
                    <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Valor da Parcela</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-brand-500"
                      placeholder="0.00"
                      value={liabilityFormData.installmentAmount}
                      onChange={(e) => setLiabilityFormData({ ...liabilityFormData, installmentAmount: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Parcelas Restantes</label>
                    <input
                      type="number"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-brand-500"
                      placeholder="Ex: 170"
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
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-brand-500"
                      placeholder="Ex: 29"
                      value={liabilityFormData.dueDay}
                      onChange={(e) => setLiabilityFormData({ ...liabilityFormData, dueDay: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {physicalAssets.length > 0 && (
                <div className="border-t border-slate-100 pt-4">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    Bem Físico Vinculado <span className="text-slate-300 normal-case font-normal">(opcional)</span>
                  </label>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500"
                    value={liabilityFormData.linkedAssetId}
                    onChange={(e) => setLiabilityFormData({ ...liabilityFormData, linkedAssetId: e.target.value })}
                  >
                    <option value="">— Nenhum (dívida sem bem vinculado) —</option>
                    {physicalAssets.map(asset => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name} ({asset.category === 'REAL_ESTATE' ? 'Imóvel' : asset.category === 'VEHICLE' ? 'Veículo' : 'Outro'})
                      </option>
                    ))}
                  </select>
                  <p className="text-[9px] text-slate-400 mt-1 font-medium">Vinculando, o FinVision calcula o equity real do bem (Valor - Dívida).</p>
                </div>
              )}

              {liabilityFormData.type === 'MORTGAGE' && (
                <div className="border-t border-slate-100 pt-4 space-y-4">
                  <h4 className="text-xs font-bold text-brand-600 uppercase tracking-widest">Opções de Financiamento Imobiliário</h4>
                  
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Índice de Correção Anual Estimado (Ex: INCC/IPCA %)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-brand-500"
                      placeholder="Ex: 5.5"
                      value={liabilityFormData.indexationRate}
                      onChange={(e) => setLiabilityFormData({ ...liabilityFormData, indexationRate: e.target.value })}
                    />
                    <p className="text-[9px] text-slate-400 mt-1 font-medium">Usado para projetar o valor corrigido no fluxo de caixa.</p>
                    {loadingIncc ? (
                      <p className="text-[9px] text-slate-400 mt-1.5 font-bold flex items-center gap-1.5 text-brand-600 animate-pulse">
                        <Loader2 size={10} className="animate-spin" />
                        Buscando taxa INCC oficial em tempo real (BCB)...
                      </p>
                    ) : inccRate !== null ? (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded flex items-center gap-1 shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          INCC Atual (BCB): {inccRate.toFixed(2)}% a.a.
                        </span>
                        <button
                          type="button"
                          onClick={() => setLiabilityFormData({ ...liabilityFormData, indexationRate: String(inccRate) })}
                          className="text-[9px] font-black text-brand-600 hover:text-brand-700 underline uppercase tracking-tighter"
                        >
                          Aplicar este Índice
                        </button>
                      </div>
                    ) : (
                      <p className="text-[9px] text-slate-400 mt-1.5 font-medium italic">
                        Média histórica de 5.5% a.a. sugerida como padrão.
                      </p>
                    )}
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Adicionar Intermediária / Balão</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Mês (1-12)"
                        className="w-1/3 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 outline-none"
                        value={liabilityFormData.balloonMonth}
                        onChange={(e) => setLiabilityFormData({ ...liabilityFormData, balloonMonth: e.target.value })}
                      />
                      <input
                        type="number"
                        placeholder="Ano"
                        className="w-1/3 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 outline-none"
                        value={liabilityFormData.balloonYear}
                        onChange={(e) => setLiabilityFormData({ ...liabilityFormData, balloonYear: e.target.value })}
                      />
                      <input
                        type="number"
                        placeholder="Valor R$"
                        className="w-1/3 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 outline-none"
                        value={liabilityFormData.balloonAmount}
                        onChange={(e) => setLiabilityFormData({ ...liabilityFormData, balloonAmount: e.target.value })}
                      />
                    </div>
                    <button 
                      type="button" 
                      onClick={() => {
                        if (liabilityFormData.balloonMonth && liabilityFormData.balloonYear && liabilityFormData.balloonAmount) {
                          setLiabilityFormData({
                            ...liabilityFormData,
                            balloons: [...liabilityFormData.balloons, {
                              month: Number(liabilityFormData.balloonMonth),
                              year: Number(liabilityFormData.balloonYear),
                              amount: Number(liabilityFormData.balloonAmount)
                            }],
                            balloonMonth: '',
                            balloonYear: '',
                            balloonAmount: ''
                          });
                        }
                      }}
                      className="w-full py-2 bg-brand-100 text-brand-700 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-brand-200 transition-colors"
                    >
                      + Adicionar Parcela Extra
                    </button>

                    {liabilityFormData.balloons.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {liabilityFormData.balloons.map((b, idx) => (
                          <div key={idx} className="flex justify-between text-xs bg-white p-2 rounded border border-slate-100">
                            <span className="font-medium text-slate-600">{b.month}/{b.year}</span>
                            <span className="font-bold text-brand-600">R$ {b.amount}</span>
                            <button type="button" onClick={() => {
                              const newBalloons = [...liabilityFormData.balloons];
                              newBalloons.splice(idx, 1);
                              setLiabilityFormData({ ...liabilityFormData, balloons: newBalloons });
                            }} className="text-red-500 font-bold hover:underline">X</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowLiabilityModal(false)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-slate-200 transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-red-500/20 hover:scale-[1.02] transition-transform active:scale-95">Salvar Passivo</button>
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
