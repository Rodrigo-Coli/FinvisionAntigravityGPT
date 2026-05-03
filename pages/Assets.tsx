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
  ArrowDownRight
} from 'lucide-react';
import { PhysicalAsset, InvestmentBroker, Liability } from '../types';

import { supabase } from '../lib/supabase/client';
import { RealEstateWizardModal } from '../components/assets/RealEstateWizardModal';

const Assets: React.FC = () => {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<'overview' | 'physical' | 'investments' | 'liabilities'>('overview');
  const [physicalAssets, setPhysicalAssets] = useState<PhysicalAsset[]>([]);
  const [brokers, setBrokers] = useState<InvestmentBroker[]>([]);
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
    balloons: [] as { month: number; year: number; amount: number }[]
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
            balloons: liabilityFormData.balloons
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
            balloons: liabilityFormData.balloons
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
      setLiabilityFormData({ name: '', type: 'PERSONAL_LOAN', totalAmount: '', remainingBalance: '', interestRate: '', installmentAmount: '', installmentsRemaining: '', dueDay: '', linkedAssetId: '', indexationRate: '', balloonMonth: '', balloonYear: '', balloonAmount: '', balloons: [] });
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
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;

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
          metadata: l.metadata
        })));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
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
      balloons: liability.metadata?.balloons || []
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
    <div className="max-w-[1600px] mx-auto px-4 sm:px-10 py-8 space-y-8 animate-in fade-in duration-500">
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

        {activeView === 'physical' && (
          <div className="space-y-10">
            {/* MANAGEMENT OVERLAY / DRAWER (Simple inline for now) */}
            {selectedAssetForManagement && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-500 bg-slate-900 rounded-[40px] p-10 text-white space-y-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8">
                  <button onClick={() => setSelectedAssetForManagement(null)} className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center justify-center transition-all"><X size={24} /></button>
                </div>
                
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-brand-600 rounded-[18px] flex items-center justify-center"><Building2 size={24} /></div>
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
                   {/* INCOME CARD */}
                   <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 space-y-6">
                      <div className="flex justify-between items-center">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest italic">Receita Mensal (Aluguel)</h4>
                        <div className="w-8 h-8 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center"><ArrowUpRight size={16} /></div>
                      </div>
                      <p className="text-3xl font-black text-emerald-400">{formatCurrency(2450)}</p> {/* Mock value, to be connected with transactions */}
                      <p className="text-[9px] font-bold text-slate-500 leading-relaxed uppercase tracking-tight">Média dos últimos 12 meses. Representa um Yield de 0.45% am.</p>
                   </div>

                   {/* EXPENSES CARD */}
                   <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 space-y-6">
                      <div className="flex justify-between items-center">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest italic">Despesas Operacionais</h4>
                        <div className="w-8 h-8 bg-rose-500/20 text-rose-400 rounded-xl flex items-center justify-center"><ArrowDownRight size={16} /></div>
                      </div>
                      <p className="text-3xl font-black text-rose-400">{formatCurrency(890)}</p> {/* Condo + IPTU + Maintenace */}
                      <div className="flex gap-2">
                        <span className="text-[8px] font-black px-2 py-1 bg-white/5 rounded-lg border border-white/10">IPTU</span>
                        <span className="text-[8px] font-black px-2 py-1 bg-white/5 rounded-lg border border-white/10">CONDOMÍNIO</span>
                        <span className="text-[8px] font-black px-2 py-1 bg-white/5 rounded-lg border border-white/10">TAXAS</span>
                      </div>
                   </div>

                   {/* NET PROFIT CARD */}
                   <div className="bg-brand-600 rounded-[32px] p-8 space-y-6 shadow-xl shadow-brand-600/20">
                      <div className="flex justify-between items-center">
                        <h4 className="text-xs font-black text-white uppercase tracking-widest italic">Fluxo de Caixa Líquido</h4>
                        <div className="w-8 h-8 bg-white/20 text-white rounded-xl flex items-center justify-center"><Zap size={16} /></div>
                      </div>
                      <p className="text-3xl font-black text-white">{formatCurrency(1560)}</p>
                      <button 
                        onClick={() => navigate('/history', { state: { filterByAsset: selectedAssetForManagement.id } })}
                        className="w-full py-3 bg-white text-brand-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all"
                      >
                        Ver Extrato do Imóvel
                      </button>
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
                        <button onClick={() => setSelectedAssetForManagement(asset)} className="p-3 text-slate-400 hover:bg-brand-50 hover:text-brand-600 rounded-2xl transition-all"><TrendingUp size={20} /></button>
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
                    <button onClick={() => setSelectedAssetForManagement(asset)} className="text-brand-600 text-[10px] font-black uppercase tracking-[0.2em] group-hover:underline flex items-center gap-2">
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
                  onChange={(e) => setLiabilityFormData({ ...liabilityFormData, type: e.target.value })}
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
