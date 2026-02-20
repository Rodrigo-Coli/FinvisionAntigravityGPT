import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  MoreVertical,
  Edit2,
  Archive,
  Landmark,
  Wallet,
  TrendingUp,
  Filter,
  CheckCircle2,
  X,
  Loader2,
  EyeOff,
  Calendar,
  ArrowRight,
  Info,
  History,
  CreditCard,
  Building2,
  RefreshCw
} from 'lucide-react';
import { BankAccount, AccountType } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';

const COLORS = [
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Purple', hex: '#9333ea' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Red', hex: '#ef4444' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Zinc', hex: '#18181b' },
];

const Accounts: React.FC = () => {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // States for Balance Adjustment Modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustAccount, setAdjustAccount] = useState<BankAccount | null>(null);
  const [hasTransactions, setHasTransactions] = useState(false);
  const [adjustMode, setAdjustMode] = useState<'initial' | 'transaction'>('transaction');
  const [adjustValue, setAdjustValue] = useState<number>(0);
  const [adjustDate, setAdjustDate] = useState(new Date().toISOString().split('T')[0]);
  const [adjustDesc, setAdjustDesc] = useState('Investimentos');
  const [adjustCat, setAdjustCat] = useState('Investimentos');
  const [isSavingAdjust, setIsSavingAdjust] = useState(false);

  // States for New Account Form
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [institution, setInstitution] = useState('');
  const [type, setType] = useState<AccountType>('CHECKING');
  const [initialBalance, setInitialBalance] = useState<number>(0);
  const [limit, setLimit] = useState<number>(0);
  const [currency, setCurrency] = useState('BRL');
  const [color, setColor] = useState('#3b82f6');
  const [includeInDashboard, setIncludeInDashboard] = useState(true);

  // States for Filters
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ACTIVE' | 'ARCHIVED' | 'ALL'>('ACTIVE');
  const [filterCurrency, setFilterCurrency] = useState<string>('ALL');
  const [filterDashboard, setFilterDashboard] = useState<string>('ALL');

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    if (!isSupabaseConfigured || !supabase) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      const mapped = (data || [])
        .map((acc: any) => ({
          id: acc.id,
          institution: acc.institution || acc.name || 'Conta',
          name: acc.name || acc.institution || 'Conta',
          type: acc.type as AccountType,
          currency: acc.currency,
          initialBalance: Number(acc.initial_balance || 0),
          currentBalance: Number(acc.current_balance || 0),
          limit: Number(acc.limit || acc.overdraft_limit || 0),
          color: acc.color,
          isArchived: acc.is_archived || acc.status === 'archived',
          includeInDashboard: acc.include_in_dashboard !== false
        }))
        .sort((a, b) => a.institution.localeCompare(b.institution));

      setAccounts(mapped);
    } catch (err) {
      console.error('Error fetching accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAccount = async () => {
    if (!supabase) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Usuário não autenticado');
        return;
      }

      const payload: any = {
        institution,
        type,
        initial_balance: initialBalance,
        limit,
        currency,
        color,
        include_in_dashboard: includeInDashboard,
      };

      if (isEditing) {
        const { error } = await supabase
          .from('accounts')
          .update(payload)
          .eq('id', isEditing)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('accounts')
          .insert([{
            ...payload,
            user_id: user.id,
            current_balance: initialBalance
          }]);
        if (error) throw error;
      }

      setShowModal(false);
      resetForm();
      fetchAccounts();
    } catch (err: any) {
      console.error('Error saving account:', err);
      alert('Erro ao salvar conta: ' + (err.message || 'Erro desconhecido'));
    }
  };

  const handleArchiveAccount = async (id: string, current: boolean) => {
    if (!supabase) return;
    try {
      await supabase.from('accounts').update({ is_archived: !current }).eq('id', id);
      fetchAccounts();
    } catch (err) {
      alert('Erro ao arquivar conta');
    }
  };

  const handleEditInitialBalance = async (acc: BankAccount) => {
    if (!supabase) return;

    setLoading(true);
    try {
      const { count, error } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('account_id', acc.id);

      if (error) throw error;

      const hasTxs = (count || 0) > 0;
      setHasTransactions(hasTxs);
      setAdjustAccount(acc);
      // Mantém a inteligência de abrir na aba certa, mas agora permite trocar
      setAdjustValue(hasTxs ? acc.currentBalance : acc.initialBalance);
      setAdjustMode(hasTxs ? 'transaction' : 'initial');
      setAdjustDate(new Date().toISOString().split('T')[0]);
      setAdjustDesc('Ajuste de Saldo');
      setAdjustCat('Investimentos');
      setShowAdjustModal(true);
    } catch (err) {
      console.error(err);
      alert("Erro ao verificar histórico da conta.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAdjustment = async () => {
    if (!supabase || !adjustAccount) return;
    setIsSavingAdjust(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (adjustMode === 'initial') {
        // Regra: delta = newInitial - oldInitial
        // Regra: novoCurrent = current + delta
        const delta = adjustValue - adjustAccount.initialBalance;
        const newCurrentBalance = adjustAccount.currentBalance + delta;

        const updatePayload: any = {
          initial_balance: adjustValue,
          current_balance: newCurrentBalance
        };

        const { error } = await supabase
          .from('accounts')
          .update(updatePayload)
          .eq('id', adjustAccount.id)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // Option B: Create adjustment transaction (Nova Transação)
        const delta = adjustValue - adjustAccount.currentBalance;

        if (delta === 0) {
          alert("O novo saldo é igual ao saldo atual. Informe um valor diferente.");
          setIsSavingAdjust(false);
          return;
        }

        const txType = delta > 0 ? 'INCOME' : 'EXPENSE';
        const txAmount = Math.abs(delta);

        const { error: txError } = await supabase
          .from('transactions')
          .insert({
            user_id: user.id,
            account_id: adjustAccount.id,
            account_name: adjustAccount.institution,
            date: adjustDate,
            description: adjustDesc,
            category: adjustCat,
            type: txType,
            amount: txAmount
          });

        if (txError) throw txError;

        const { error: accError } = await supabase
          .from('accounts')
          .update({
            current_balance: adjustValue
          })
          .eq('id', adjustAccount.id)
          .eq('user_id', user.id);

        if (accError) throw accError;
      }

      setShowAdjustModal(false);
      fetchAccounts();
      alert("Saldo ajustado com sucesso!");
    } catch (err: any) {
      console.error(err);
      alert("Erro ao salvar ajuste: " + err.message);
    } finally {
      setIsSavingAdjust(false);
    }
  };

  const resetForm = () => {
    setIsEditing(null);
    setInstitution('');
    setType('CHECKING');
    setInitialBalance(0);
    setLimit(0);
    setCurrency('BRL');
    setColor('#3b82f6');
    setIncludeInDashboard(true);
  };

  const handleEditAccount = (acc: BankAccount) => {
    setIsEditing(acc.id);
    setInstitution(acc.institution);
    setType(acc.type);
    setInitialBalance(acc.initialBalance);
    setLimit(acc.limit);
    setCurrency(acc.currency);
    setColor(acc.color);
    setIncludeInDashboard(acc.includeInDashboard);
    setShowModal(true);
  };

  const formatCurrency = (val: number, cur: string = 'BRL') =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur }).format(val);

  const getIcon = (type: AccountType) => {
    switch (type) {
      case 'CASH': return <Wallet size={20} />;
      case 'INVESTMENT': return <TrendingUp size={20} />;
      default: return <Landmark size={20} />;
    }
  };

  const getTypeLabel = (type: AccountType) => {
    switch (type) {
      case 'CHECKING': return 'Conta Corrente';
      case 'SAVINGS': return 'Poupança';
      case 'INVESTMENT': return 'Investimento';
      case 'CASH': return 'Dinheiro';
    }
  };

  const filteredAccounts = accounts.filter(acc => {
    const matchesSearch = acc.institution.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'ALL' || acc.type === filterType;
    const matchesStatus = filterStatus === 'ALL' || (filterStatus === 'ACTIVE' ? !acc.isArchived : acc.isArchived);
    const matchesCurrency = filterCurrency === 'ALL' || acc.currency === filterCurrency;
    const matchesDashboard = filterDashboard === 'ALL' || (filterDashboard === 'YES' ? acc.includeInDashboard : !acc.includeInDashboard);
    return matchesSearch && matchesType && matchesStatus && matchesCurrency && matchesDashboard;
  });

  const activeFilterCount = (filterType !== 'ALL' ? 1 : 0) +
    (filterStatus !== 'ACTIVE' ? 1 : 0) +
    (filterCurrency !== 'ALL' ? 1 : 0) +
    (filterDashboard !== 'ALL' ? 1 : 0);

  // Helper calculation for the modal variation display
  const currentDelta = adjustAccount ? adjustValue - (adjustMode === 'initial' ? adjustAccount.initialBalance : adjustAccount.currentBalance) : 0;

  return (
    <div className="max-w-7xl mx-auto py-16 sm:py-24 px-8 sm:px-12 space-y-16 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-12">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-4xl sm:text-6xl font-bold text-slate-900 tracking-tight leading-none">
              Contas e <span className="text-brand-600">Carteiras</span>
            </h1>
            <span className="px-3 py-1 bg-slate-50 text-slate-400 rounded-full text-[10px] font-bold uppercase tracking-widest border border-slate-100 shadow-sm">Liquidez</span>
          </div>
          <p className="text-slate-500 font-medium text-lg sm:text-2xl leading-relaxed max-w-2xl">
            Gestão granular de custódia e saldos operacionais. <br className="hidden sm:block" /> {accounts.length} fontes de liquidez conectadas.
          </p>
        </div>

        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="w-full md:w-auto px-10 py-6 bg-slate-900 text-white rounded-[24px] font-bold text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-black/10 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-4"
        >
          <Plus size={20} /> Nova Instituição
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col xl:flex-row gap-6">
        <div className="relative flex-grow group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors" size={20} />
          <input
            type="text"
            placeholder="Pesquisar por ecossistema ou instituição..."
            className="w-full pl-16 pr-8 h-20 bg-white border border-slate-100 rounded-[28px] outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-300 text-base font-bold text-slate-900 transition-all shadow-soft placeholder:text-slate-200"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex-1 xl:flex-none px-10 h-20 rounded-[28px] font-bold text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-4 border ${activeFilterCount > 0 ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-100 text-slate-400 hover:text-slate-900 hover:border-slate-300 shadow-soft'}`}
          >
            <Filter size={20} />
            <span className="hidden sm:inline">Advanced Filters</span> {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>
          <button
            onClick={() => setFilterStatus(filterStatus === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED')}
            className={`flex-1 xl:flex-none px-10 h-20 rounded-[28px] font-bold text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-4 border ${filterStatus === 'ARCHIVED' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-100 text-slate-400 hover:text-slate-900 hover:border-slate-300 shadow-soft'}`}
          >
            <Archive size={20} />
            <span className="hidden sm:inline">{filterStatus === 'ARCHIVED' ? 'Ver Ativas' : 'Show Archives'}</span>
          </button>
        </div>
      </div>

      {/* Grid of Accounts */}
      {loading ? (
        <div className="py-48 flex flex-col items-center justify-center gap-10">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-slate-50 border-t-slate-900 rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={32} className="text-slate-200 animate-pulse" />
            </div>
          </div>
          <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[11px] animate-pulse">Syncing Liquidity Nodes...</p>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="bg-white rounded-[64px] border border-slate-100 shadow-soft p-24 text-center flex flex-col items-center gap-10">
          <div className="w-32 h-32 bg-slate-50 rounded-[40px] flex items-center justify-center text-slate-200 border border-slate-100">
            <CreditCard size={64} />
          </div>
          <div className="space-y-4">
            <h3 className="text-3xl font-bold text-slate-900 tracking-tight">Zero Liquidez Detectada</h3>
            <p className="text-slate-400 font-medium text-lg max-w-md mx-auto leading-relaxed">Nenhuma fonte de recursos corresponde aos filtros atuais ou foi indexada ao sistema.</p>
          </div>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="px-12 py-6 bg-slate-900 text-white rounded-[28px] font-bold text-[11px] uppercase tracking-[0.3em] hover:bg-slate-800 transition-all shadow-2xl shadow-black/10 active:scale-95"
          >
            Indexar Nova Conta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10">
          {filteredAccounts.map((acc: any) => (
            <div
              key={acc.id}
              className={`bg-white rounded-[40px] border border-slate-100 shadow-soft overflow-hidden group hover:shadow-2xl hover:border-slate-300 transition-all duration-500 flex flex-col justify-between min-h-[420px] ${acc.isArchived ? 'opacity-60 grayscale scale-95' : ''}`}
            >
              <div className="p-10 sm:p-12 space-y-10 flex-grow">
                <div className="flex justify-between items-start">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: acc.color }} />
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">
                        {getTypeLabel(acc.type)}
                      </span>
                    </div>
                    <h3 className="text-3xl font-bold text-slate-900 tracking-tighter leading-tight group-hover:text-brand-600 transition-colors">
                      {acc.institution || acc.name}
                    </h3>
                  </div>
                  <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-200 group-hover:text-slate-900 group-hover:bg-white border border-transparent group-hover:border-slate-100 transition-all duration-500 shadow-inner group-hover:shadow-soft">
                    {getIcon(acc.type)}
                  </div>
                </div>

                <div className="space-y-3 pt-12">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] ml-1">Capital Liquído</p>
                  <p className={`text-5xl font-black tracking-tighter leading-none ${acc.currentBalance < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                    {formatCurrency(acc.currentBalance)}
                  </p>
                </div>
              </div>

              <div className="px-10 py-8 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between group-hover:bg-white transition-colors duration-500">
                <div className="flex gap-4">
                  <button
                    onClick={() => handleEditInitialBalance(acc)}
                    className="w-12 h-12 bg-white border border-slate-100 text-slate-300 hover:text-slate-900 hover:border-slate-300 rounded-2xl flex items-center justify-center shadow-sm transition-all active:scale-90"
                    title="Ajustar Saldo"
                  >
                    <RefreshCw size={20} strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={() => handleEditAccount(acc)}
                    className="w-12 h-12 bg-white border border-slate-100 text-slate-300 hover:text-slate-900 hover:border-slate-300 rounded-2xl flex items-center justify-center shadow-sm transition-all active:scale-90"
                    title="Editar"
                  >
                    <Edit2 size={20} strokeWidth={1.5} />
                  </button>
                </div>
                <button
                  onClick={() => handleArchiveAccount(acc.id, acc.isArchived)}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-90 ${acc.isArchived ? 'bg-slate-900 text-white shadow-lg' : 'bg-white border border-slate-100 text-slate-300 hover:text-amber-600 hover:border-amber-200 shadow-sm'}`}
                  title={acc.isArchived ? 'Desarquivar' : 'Arquivar'}
                >
                  {acc.isArchived ? <RefreshCw size={20} /> : <Archive size={20} strokeWidth={1.5} />}
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="group relative h-[420px] rounded-[40px] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center gap-8 text-slate-400 hover:border-brand-200 hover:text-brand-600 hover:bg-slate-50 transition-all duration-500 overflow-hidden"
          >
            <div className="w-20 h-20 bg-slate-50 rounded-[32px] flex items-center justify-center group-hover:bg-white group-hover:scale-110 transition-all duration-500 shadow-inner group-hover:shadow-soft border border-transparent group-hover:border-slate-100">
              <Plus size={32} />
            </div>
            <div className="text-center space-y-2">
              <span className="font-bold text-2xl tracking-tight text-slate-900 block">Expandir Ecossistema</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Add Bank or Wallet</span>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-brand-600/0 to-brand-600/5 group-hover:from-brand-600/5 transition-all duration-1000" />
          </button>
        </div>
      )}

      {/* Balance Adjustment Modal */}
      {showAdjustModal && adjustAccount && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-8 animate-in fade-in duration-500">
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-xl" onClick={() => setShowAdjustModal(false)}></div>
          <div className="bg-white rounded-[48px] w-full max-w-xl shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-500 border border-slate-100">
            <div className="p-12 sm:p-16">
              <div className="flex items-center justify-between mb-12">
                <div className="space-y-2">
                  <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Ajuste de Saldo</h2>
                  <p className="text-[11px] font-bold text-brand-600 uppercase tracking-[0.3em]">{adjustAccount.institution.toUpperCase()}</p>
                </div>
                <button onClick={() => setShowAdjustModal(false)} className="w-14 h-14 flex items-center justify-center text-slate-200 hover:text-slate-900 hover:bg-slate-50 rounded-2xl transition-all active:scale-90"><X size={32} /></button>
              </div>

              <div className="space-y-10">
                {/* Option Tabs */}
                <div className="flex bg-slate-50 p-2 rounded-[24px] border border-slate-100">
                  <button
                    onClick={() => {
                      setAdjustMode('initial');
                      setAdjustValue(adjustAccount.initialBalance);
                    }}
                    className={`flex-1 py-5 rounded-[20px] text-[11px] font-bold uppercase tracking-[0.2em] transition-all ${adjustMode === 'initial' ? 'bg-white text-slate-950 shadow-soft' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Abertura
                  </button>
                  <button
                    onClick={() => {
                      setAdjustMode('transaction');
                      setAdjustValue(adjustAccount.currentBalance);
                    }}
                    className={`flex-1 py-5 rounded-[20px] text-[11px] font-bold uppercase tracking-[0.2em] transition-all ${adjustMode === 'transaction' ? 'bg-white text-slate-950 shadow-soft' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Movimentação
                  </button>
                </div>

                {/* Form Fields */}
                <div className="space-y-8">
                  <div className="space-y-4">
                    <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em] ml-2">
                      {adjustMode === 'transaction' ? 'Settlement Target Value' : 'Opening Balance Override'}
                    </label>
                    <div className="relative group">
                      <span className="absolute left-8 top-1/2 -translate-y-1/2 font-black text-slate-200 text-3xl group-focus-within:text-slate-900 transition-colors">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={adjustValue}
                        onChange={e => {
                          const val = Number(e.target.value);
                          setAdjustValue(val);
                          if (adjustMode === 'transaction') {
                            const d = val - adjustAccount.currentBalance;
                            if (d > 0) setAdjustDesc('Rendimento / Ajuste');
                            else if (d < 0) setAdjustDesc('Despesa / Ajuste');
                            else setAdjustDesc('Ajuste de Saldo');
                          }
                        }}
                        className="w-full h-24 pl-20 pr-10 bg-slate-50 border border-slate-100 rounded-[32px] font-black text-4xl text-slate-900 outline-none focus:ring-8 focus:ring-slate-900/5 focus:border-slate-300 focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  {adjustMode === 'transaction' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-4">
                      <div className="space-y-4">
                        <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em] ml-2">Execution Date</label>
                        <div className="relative group">
                          <Calendar className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-200 group-focus-within:text-slate-900 transition-colors" size={20} />
                          <input
                            type="date"
                            value={adjustDate}
                            onChange={e => setAdjustDate(e.target.value)}
                            className="w-full h-18 pl-18 pr-6 bg-slate-50 border border-slate-100 rounded-[28px] font-bold text-sm text-slate-900 outline-none focus:border-slate-300 focus:bg-white transition-all cursor-pointer"
                          />
                        </div>
                      </div>
                      <div className="space-y-4">
                        <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em] ml-2">Audit Memo</label>
                        <input
                          type="text"
                          value={adjustDesc}
                          onChange={e => setAdjustDesc(e.target.value)}
                          placeholder="Audit Log Description"
                          className="w-full h-18 px-8 bg-slate-50 border border-slate-100 rounded-[28px] font-bold text-sm text-slate-900 outline-none focus:border-slate-300 focus:bg-white transition-all"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-16 flex flex-col sm:flex-row gap-6">
                <button
                  onClick={() => setShowAdjustModal(false)}
                  className="flex-1 py-6 text-slate-400 font-bold text-[11px] uppercase tracking-[0.3em] hover:text-slate-900 transition-all active:scale-95"
                >
                  Abandor
                </button>
                <button
                  onClick={handleSaveAdjustment}
                  disabled={isSavingAdjust || currentDelta === 0}
                  className="flex-[2] py-6 bg-slate-900 text-white rounded-[28px] font-bold uppercase text-[11px] tracking-[0.3em] shadow-2xl shadow-black/10 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-4 disabled:opacity-20 disabled:grayscale"
                >
                  {isSavingAdjust ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                  Execute Transaction
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Account Modal (Create/Edit) */}
      {showModal && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-8 animate-in fade-in duration-500">
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-xl" onClick={() => setShowModal(false)}></div>
          <div className="bg-white rounded-t-[48px] sm:rounded-[64px] w-full max-w-2xl shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom-20 sm:zoom-in-95 duration-500 border border-slate-100">
            <div className="p-12 sm:p-20">
              <div className="flex items-center justify-between mb-16">
                <div className="space-y-2">
                  <h2 className="text-4xl font-black text-slate-900 tracking-tighter leading-none">{isEditing ? 'Index Rules' : 'Nova Indexação'}</h2>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em]">Configure Liquidity Node Parameters</p>
                </div>
                <button onClick={() => setShowModal(false)} className="w-16 h-16 flex items-center justify-center text-slate-200 hover:text-slate-900 hover:bg-slate-50 rounded-3xl transition-all active:scale-90">
                  <X size={36} />
                </button>
              </div>

              <div className="space-y-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em] ml-2">Institution / Name</label>
                    <input type="text" value={institution} onChange={e => setInstitution(e.target.value)} placeholder="Ex: Citibank" className="w-full h-18 px-8 bg-slate-50 border border-slate-100 rounded-[28px] outline-none focus:ring-8 focus:ring-slate-900/5 focus:border-slate-300 focus:bg-white transition-all font-bold text-sm text-slate-900" />
                  </div>
                  <div className="space-y-4">
                    <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em] ml-2">Asset Type</label>
                    <div className="relative group">
                      <select value={type} onChange={e => setType(e.target.value as AccountType)} className="w-full h-18 px-8 bg-slate-50 border border-slate-100 rounded-[28px] outline-none focus:ring-8 focus:ring-slate-900/5 focus:border-slate-300 focus:bg-white transition-all font-bold text-sm text-slate-900 appearance-none cursor-pointer">
                        <option value="CHECKING">Conta Corrente</option>
                        <option value="SAVINGS">Poupança</option>
                        <option value="INVESTMENT">Investimento</option>
                        <option value="CASH">Dinheiro / Carteira</option>
                      </select>
                      <ArrowRight size={18} className="absolute right-6 top-1/2 -translate-y-1/2 -rotate-90 pointer-events-none text-slate-300" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em] ml-2">Opening Settlement</label>
                    <input type="number" value={initialBalance} onChange={e => setInitialBalance(Number(e.target.value))} placeholder="0.00" className="w-full h-18 px-8 bg-slate-50 border border-slate-100 rounded-[28px] outline-none focus:ring-8 focus:ring-slate-900/5 focus:border-slate-300 focus:bg-white transition-all font-bold text-sm text-slate-900" />
                  </div>
                  <div className="space-y-4">
                    <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em] ml-2">Overdraft Ceiling</label>
                    <input type="number" value={limit} onChange={e => setLimit(Number(e.target.value))} placeholder="0.00" className="w-full h-18 px-8 bg-slate-50 border border-slate-100 rounded-[28px] outline-none focus:ring-8 focus:ring-slate-900/5 focus:border-slate-300 focus:bg-white transition-all font-bold text-sm text-slate-900" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em] ml-2">Base Currency</label>
                    <div className="relative group">
                      <select value={currency} onChange={e => setCurrency(e.target.value)} className="w-full h-18 px-8 bg-slate-50 border border-slate-100 rounded-[28px] outline-none focus:ring-8 focus:ring-slate-900/5 focus:border-slate-300 focus:bg-white transition-all font-bold text-sm text-slate-900 appearance-none cursor-pointer">
                        <option value="BRL">Real (BRL)</option>
                        <option value="USD">Dólar (USD)</option>
                        <option value="EUR">Euro (EUR)</option>
                      </select>
                      <ArrowRight size={18} className="absolute right-6 top-1/2 -translate-y-1/2 -rotate-90 pointer-events-none text-slate-300" />
                    </div>
                  </div>
                  <div className="flex flex-col justify-end">
                    <button
                      onClick={() => setIncludeInDashboard(!includeInDashboard)}
                      className="group flex items-center justify-between w-full h-18 px-8 bg-slate-50 border border-slate-100 rounded-[28px] hover:bg-slate-100 transition-all font-bold text-sm text-slate-900"
                    >
                      <span>Dashboard Visibility</span>
                      <div className={`w-10 h-6 rounded-full p-1 transition-all duration-300 ${includeInDashboard ? 'bg-slate-900' : 'bg-slate-200'}`}>
                        <div className={`w-4 h-4 rounded-full bg-white transition-all duration-300 ${includeInDashboard ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em] ml-2">Visual Encoding</label>
                  <div className="flex flex-wrap gap-4">
                    {COLORS.map(c => (
                      <button
                        key={c.hex}
                        onClick={() => setColor(c.hex)}
                        className={`w-12 h-12 rounded-2xl transition-all group relative ${color === c.hex ? 'scale-110 shadow-xl ring-4 ring-slate-100' : 'opacity-40 hover:opacity-100 hover:scale-110'}`}
                        style={{ backgroundColor: c.hex }}
                      >
                        {color === c.hex && <div className="absolute inset-0 flex items-center justify-center"><CheckCircle2 size={20} className="text-white" /></div>}
                      </button>
                    ))}
                    <div className="relative w-12 h-12">
                      <input type="color" value={color} onChange={e => setColor(e.target.value)} className="absolute inset-0 w-full h-full rounded-2xl cursor-pointer border-none opacity-0 z-10" />
                      <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300 group-hover:text-slate-900 transition-all">
                        <Plus size={24} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-20 flex flex-col sm:flex-row gap-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-6 text-slate-400 font-bold text-[11px] uppercase tracking-[0.3em] hover:text-slate-900 transition-all active:scale-95"
                >
                  Abandor
                </button>
                <button
                  onClick={handleSaveAccount}
                  className="flex-[2] py-6 bg-slate-900 text-white rounded-[28px] font-bold uppercase text-[11px] tracking-[0.3em] shadow-2xl shadow-black/10 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-4"
                >
                  {isEditing ? 'Sync Rule Set' : 'Generate Liquidity Node'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Accounts;