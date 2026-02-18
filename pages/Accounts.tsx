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
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .order('institution', { ascending: true });

      if (error) throw error;

      const mapped = (data || []).map((acc: any) => ({
        id: acc.id,
        institution: acc.institution,
        type: acc.type as AccountType,
        currency: acc.currency,
        initialBalance: Number(acc.initial_balance),
        currentBalance: Number(acc.current_balance),
        limit: Number(acc.limit),
        color: acc.color,
        isArchived: acc.is_archived,
        includeInDashboard: acc.include_in_dashboard
      }));

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
    <div className="max-w-7xl mx-auto py-6 sm:py-10 px-4 sm:px-6 lg:px-8 space-y-8 sm:space-y-10 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl sm:text-4xl font-display font-black text-slate-900 tracking-tight dark:text-white">
            Contas e <span className="text-brand-600 italic">Carteiras</span>
          </h1>
          <p className="text-slate-500 font-medium text-base sm:text-lg">Gerencie suas instituições financeiras e saldos</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="px-6 py-4 bg-brand-600 text-white rounded-[16px] sm:rounded-[20px] font-black text-xs uppercase tracking-widest shadow-xl shadow-brand-500/20 hover:bg-brand-700 transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <Plus size={18} /> Nova Conta
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative flex-grow">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Pesquisar por instituição..."
            className="w-full pl-11 pr-4 h-12 sm:h-14 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[16px] sm:rounded-2xl outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 text-sm font-medium transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex-1 sm:flex-none px-6 sm:px-8 h-12 sm:h-14 rounded-[16px] sm:rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeFilterCount > 0 ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/20' : 'bg-white dark:bg-slate-800 text-slate-600 border border-slate-100 dark:border-slate-700 hover:bg-slate-50'}`}
          >
            <Filter size={18} />
            <span className="hidden xs:inline">Filtros</span> {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>
          <button
            onClick={() => setFilterStatus(filterStatus === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED')}
            className={`flex-1 sm:flex-none px-6 sm:px-8 h-12 sm:h-14 rounded-[16px] sm:rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${filterStatus === 'ARCHIVED' ? 'bg-amber-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 border border-slate-100 dark:border-slate-700 hover:bg-slate-50'}`}
          >
            <Archive size={18} />
            <span className="hidden xs:inline">{filterStatus === 'ARCHIVED' ? 'Ver Ativas' : 'Arquivadas'}</span>
          </button>
        </div>
      </div>

      {/* Grid of Accounts */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-12 h-12 text-brand-600 animate-spin" />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] sm:text-xs">Carregando Contas...</p>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-[32px] sm:rounded-[40px] border-2 border-dashed border-slate-100 dark:border-slate-800 p-12 sm:p-20 text-center flex flex-col items-center gap-6">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-200 dark:text-slate-700">
            <CreditCard size={32} />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">Nenhuma conta encontrada</h3>
            <p className="text-slate-500 font-medium text-sm">Tente ajustar seus filtros ou cadastre uma nova instituição.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          {filteredAccounts.map((acc: any) => (
            <div
              key={acc.id}
              className={`bg-white dark:bg-slate-800 rounded-[28px] sm:rounded-[36px] border-t-4 shadow-sm overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ${acc.isArchived ? 'opacity-70 grayscale' : ''}`}
              style={{ borderTopColor: acc.color }}
            >
              <div className="p-6 sm:p-8 space-y-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{acc.type === 'BANK' ? 'Instituição' : 'Carteira'}</p>
                    <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white group-hover:text-brand-600 transition-colors">
                      {acc.institution || acc.name}
                    </h3>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-2xl group-hover:scale-110 transition-transform">
                    {acc.type === 'BANK' ? <Building2 size={20} className="text-slate-400" /> : <Wallet size={20} className="text-slate-400" />}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Atual</p>
                  <p className={`text-2xl sm:text-3xl font-display font-black tracking-tight ${acc.currentBalance < 0 ? 'text-rose-500' : 'text-slate-900 dark:text-white'}`}>
                    {formatCurrency(acc.currentBalance)}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-6 border-t border-slate-50 dark:border-slate-700/50">
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setAdjustAccount(acc); setAdjustValue(acc.currentBalance); setAdjustMode('current'); setShowAdjustModal(true); }}
                      className="p-2.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all"
                      title="Ajustar Saldo"
                    >
                      <RefreshCw size={18} />
                    </button>
                    <button
                      onClick={() => handleEditAccount(acc)}
                      className="p-2.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all"
                      title="Editar"
                    >
                      <Edit2 size={18} />
                    </button>
                  </div>
                  <button
                    onClick={() => handleArchiveAccount(acc.id, !acc.isArchived)}
                    className={`p-2.5 rounded-xl transition-all ${acc.isArchived ? 'text-amber-500 bg-amber-50' : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'}`}
                    title={acc.isArchived ? 'Desarquivar' : 'Arquivar'}
                  >
                    {acc.isArchived ? <RefreshCw size={18} /> : <Archive size={18} />}
                  </button>
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center p-8 text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition-all min-h-[220px] group"
          >
            <div className="p-4 bg-gray-50 rounded-full mb-3 group-hover:bg-blue-100 transition-colors">
              <Plus size={32} />
            </div>
            <span className="font-bold">Nova Conta</span>
            <span className="text-xs mt-1 text-center">Instituições, Investimentos ou Carteira</span>
          </button>
        </div>
      )}

      {/* Balance Adjustment Modal */}
      {showAdjustModal && adjustAccount && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setShowAdjustModal(false)}></div>
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden animate-in zoom-in duration-300">
            <div className="p-6 lg:p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Ajustar Saldo</h2>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{adjustAccount.institution}</p>
                </div>
                <button onClick={() => setShowAdjustModal(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-all"><X size={24} /></button>
              </div>

              <div className="space-y-4">
                {/* Option Tabs */}
                <div className="flex bg-gray-50 p-1 rounded-2xl border border-gray-100">
                  <button
                    onClick={() => {
                      setAdjustMode('initial');
                      setAdjustValue(adjustAccount.initialBalance);
                    }}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex flex-col items-center gap-1 ${adjustMode === 'initial' ? 'bg-white text-blue-600 shadow-sm border border-gray-100' : 'text-gray-400'}`}
                  >
                    Saldo Inicial
                  </button>
                  <button
                    onClick={() => {
                      setAdjustMode('transaction');
                      setAdjustValue(adjustAccount.currentBalance);
                    }}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex flex-col items-center gap-1 ${adjustMode === 'transaction' ? 'bg-white text-blue-600 shadow-sm border border-gray-100' : 'text-gray-400'}`}
                  >
                    Nova Transação
                    <span className="text-[7px] text-gray-400">(Ajuste)</span>
                  </button>
                </div>

                {/* Info for Initial Balance */}
                {adjustMode === 'initial' && (
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3">
                    <Info size={18} className="text-blue-500 shrink-0" />
                    <p className="text-[10px] font-bold text-blue-700 leading-relaxed uppercase">
                      Nota: Alterar o saldo inicial também ajustará o saldo atual da conta para manter a integridade.
                    </p>
                  </div>
                )}

                {/* Form Fields */}
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      {adjustMode === 'transaction' ? 'Novo Saldo Final' : 'Novo Saldo Inicial'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={adjustValue}
                        onChange={e => {
                          const val = Number(e.target.value);
                          setAdjustValue(val);
                          if (adjustMode === 'transaction') {
                            const d = val - adjustAccount.currentBalance;
                            if (d > 0) setAdjustDesc('Rendimento');
                            else if (d < 0) setAdjustDesc('Perda');
                            else setAdjustDesc('Ajuste de Saldo');
                          }
                        }}
                        className="w-full h-14 pl-12 pr-4 bg-gray-50 border border-gray-200 rounded-2xl font-black text-xl text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                      />
                    </div>

                    {currentDelta !== 0 && (
                      <p className={`text-[9px] font-bold uppercase mt-1 ml-1 flex items-center gap-1 ${currentDelta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <ArrowRight size={10} className={currentDelta >= 0 ? '-rotate-45' : 'rotate-45'} />
                        Variação: {formatCurrency(currentDelta)}
                      </p>
                    )}

                    {currentDelta === 0 && (
                      <p className="text-[9px] font-bold text-gray-400 uppercase mt-1 ml-1">
                        Informe um valor diferente do atual
                      </p>
                    )}
                  </div>

                  {adjustMode === 'transaction' && (
                    <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Data do Ajuste</label>
                        <div className="relative">
                          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                          <input
                            type="date"
                            value={adjustDate}
                            onChange={e => setAdjustDate(e.target.value)}
                            className="w-full h-12 pl-12 pr-4 bg-gray-50 border border-gray-200 rounded-xl font-bold text-xs outline-none"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Descrição</label>
                        <input
                          type="text"
                          value={adjustDesc}
                          onChange={e => setAdjustDesc(e.target.value)}
                          placeholder="Ex: Rendimento ou Perda"
                          className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl font-bold text-xs outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Categoria</label>
                        <input
                          type="text"
                          value={adjustCat}
                          onChange={e => setAdjustCat(e.target.value)}
                          className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl font-bold text-xs outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => setShowAdjustModal(false)}
                  className="flex-1 py-4 text-gray-400 font-bold text-xs uppercase tracking-widest"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveAdjustment}
                  disabled={isSavingAdjust || currentDelta === 0}
                  className="flex-2 w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl shadow-blue-100 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSavingAdjust ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                  Confirmar Ajuste
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Modal */}
      {showFilters && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setShowFilters(false)}></div>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom duration-300">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold">Filtros Avançados</h2>
                <button onClick={() => setShowFilters(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl"><X size={20} /></button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Tipo de Conta</label>
                  <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-full h-11 px-4 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none">
                    <option value="ALL">Todos os Tipos</option>
                    <option value="CHECKING">Conta Corrente</option>
                    <option value="SAVINGS">Poupança</option>
                    <option value="INVESTMENT">Investimento</option>
                    <option value="CASH">Dinheiro</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Moeda</label>
                  <select value={filterCurrency} onChange={(e) => setFilterCurrency(e.target.value)} className="w-full h-11 px-4 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none">
                    <option value="ALL">Todas as Moedas</option>
                    <option value="BRL">Real (BRL)</option>
                    <option value="USD">Dólar (USD)</option>
                    <option value="EUR">Euro (EUR)</option>
                  </select>
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button onClick={() => { setFilterType('ALL'); setFilterCurrency('ALL'); setFilterStatus('ACTIVE'); setFilterDashboard('ALL'); setShowFilters(false); }} className="flex-1 py-4 text-gray-400 font-bold text-sm uppercase">Limpar</button>
                <button onClick={() => setShowFilters(false)} className="flex-2 w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-sm shadow-xl shadow-blue-100">Aplicar Filtros</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Account Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={() => setShowModal(false)}></div>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom sm:zoom-in duration-300">
            <div className="p-6 lg:p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl lg:text-2xl font-bold text-gray-900">{isEditing ? 'Editar Conta' : 'Nova Instituição'}</h2>
                <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4 lg:space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Instituição</label>
                    <input type="text" value={institution} onChange={e => setInstitution(e.target.value)} placeholder="Ex: Santander" className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Tipo</label>
                    <select value={type} onChange={e => setType(e.target.value as AccountType)} className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                      <option value="CHECKING">Conta Corrente</option>
                      <option value="SAVINGS">Poupança</option>
                      <option value="INVESTMENT">Investimento</option>
                      <option value="CASH">Dinheiro / Carteira</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Saldo Inicial</label>
                    <input type="number" value={initialBalance} onChange={e => setInitialBalance(Number(e.target.value))} placeholder="0,00" className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Limite (Opcional)</label>
                    <input type="number" value={limit} onChange={e => setLimit(Number(e.target.value))} placeholder="0,00" className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Moeda</label>
                    <select value={currency} onChange={e => setCurrency(e.target.value)} className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                      <option value="BRL">Real (BRL)</option>
                      <option value="USD">Dólar (USD)</option>
                      <option value="EUR">Euro (EUR)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5 flex flex-col justify-end">
                    <label className="flex items-center gap-2 cursor-pointer p-3 bg-gray-50 rounded-xl border border-gray-100 hover:bg-white transition-all">
                      <input type="checkbox" checked={includeInDashboard} onChange={e => setIncludeInDashboard(e.target.checked)} className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      <span className="text-xs font-bold text-gray-600">Incluir no Dashboard</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Cor da Conta</label>
                  <div className="flex flex-wrap gap-3">
                    {COLORS.map(c => (
                      <button
                        key={c.hex}
                        onClick={() => setColor(c.hex)}
                        className={`w-10 h-10 rounded-full border-4 transition-all ${color === c.hex ? 'border-white ring-2 ring-blue-500 scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'}`}
                        style={{ backgroundColor: c.hex }}
                        title={c.name}
                      />
                    ))}
                    <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-10 rounded-full border-2 border-white cursor-pointer shadow-sm overflow-hidden" />
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="w-full sm:flex-1 py-4 px-4 border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors active:bg-gray-100 uppercase text-xs tracking-widest"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveAccount}
                  className="w-full sm:flex-1 py-4 px-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 uppercase text-xs tracking-widest"
                >
                  {isEditing ? 'Atualizar Conta' : 'Salvar Conta'}
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