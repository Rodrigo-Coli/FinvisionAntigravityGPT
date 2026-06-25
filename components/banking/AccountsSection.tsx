import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  History as HistoryIcon,
  CreditCard,
  Building2,
  RefreshCw,
  Zap
} from 'lucide-react';
import { BankAccount, AccountType } from '../../types';
import { supabase, isSupabaseConfigured } from '../../lib/supabase/client';
import { DateUtils } from '../../lib/dateUtils';
import { findCloseMatch } from '../../lib/stringUtils';

const COLORS = [
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Purple', hex: '#9333ea' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Red', hex: '#ef4444' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Zinc', hex: '#18181b' },
];

const AccountsSection: React.FC = () => {
  const [accounts, setAccounts] = useState<BankAccount[]>(() => {
    const cached = localStorage.getItem('finvision_cached_accounts_full');
    return cached ? JSON.parse(cached) : [];
  });
  const [loading, setLoading] = useState(() => {
    const cached = localStorage.getItem('finvision_cached_accounts_full');
    return !cached;
  });
  const [showModal, setShowModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  // States for Balance Adjustment Modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustAccount, setAdjustAccount] = useState<BankAccount | null>(null);
  const [hasTransactions, setHasTransactions] = useState(false);
  const [adjustMode, setAdjustMode] = useState<'initial' | 'transaction'>('transaction');
  const [adjustValue, setAdjustValue] = useState<number | string>('');
  const [adjustDate, setAdjustDate] = useState(DateUtils.formatToISODate());
  const [adjustDesc, setAdjustDesc] = useState('Ajuste de Saldo');
  const [adjustCat, setAdjustCat] = useState('Ajustes');
  const [isSavingAdjust, setIsSavingAdjust] = useState(false);

  // States for New Account Form
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [institution, setInstitution] = useState('');
  const [type, setType] = useState<AccountType>('CHECKING');
  const [initialBalance, setInitialBalance] = useState<number | string>('');
  const [limit, setLimit] = useState<number | string>('');
  const [currency, setCurrency] = useState('BRL');
  const [color, setColor] = useState('#3b82f6');
  const [includeInDashboard, setIncludeInDashboard] = useState(true);

  // States for Filters
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ACTIVE' | 'ARCHIVED' | 'ALL'>('ACTIVE');
  const [filterCurrency, setFilterCurrency] = useState<string>('ALL');
  const [filterDashboard, setFilterDashboard] = useState<string>('ALL');

  useEffect(() => {
    const cached = localStorage.getItem('finvision_cached_accounts_full');
    fetchAccounts(!!cached);
    
    // Check for auto-open state from navigation
    const state = window.history.state?.usr;
    if (state?.openModal) {
      resetForm();
      if (state.defaultType) setType(state.defaultType);
      setShowModal(true);
      // Clear state to avoid reopening on refresh
      window.history.replaceState({}, document.title);
    }

    const handleSyncCompleted = () => {
      fetchAccounts(true);
    };
    window.addEventListener('offline-sync-completed', handleSyncCompleted);
    return () => {
      window.removeEventListener('offline-sync-completed', handleSyncCompleted);
    };
  }, []);

  const fetchAccounts = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (navigator.onLine) {
        if (!isSupabaseConfigured || !supabase) {
          setLoading(false);
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;

        const { data, error } = await supabase
          .from('accounts')
          .select('*')
          .eq('user_id', user.id);

        if (error) throw error;

        const rawMapped = (data || [])
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
          }));

        // Deduplicate accounts with identical institution names
        const mapped: typeof rawMapped = [];
        const seenAccs = new Set<string>();
        for (const acc of rawMapped) {
          const key = acc.institution.toLowerCase().trim();
          if (!seenAccs.has(key)) {
            seenAccs.add(key);
            mapped.push(acc);
          }
        }
        mapped.sort((a: any, b: any) => a.institution.localeCompare(b.institution));

        setAccounts(mapped);
        localStorage.setItem('finvision_cached_accounts_full', JSON.stringify(mapped));
      } else {
        // Offline load fallback
        const cached = localStorage.getItem('finvision_cached_accounts_full');
        if (cached) {
          setAccounts(JSON.parse(cached));
        }
      }
    } catch (err) {
      console.error('Error fetching accounts, falling back to cache:', err);
      const cached = localStorage.getItem('finvision_cached_accounts_full');
      if (cached) {
        setAccounts(JSON.parse(cached));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAccount = async () => {
    if (!supabase) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        alert('Usuário não autenticado');
        return;
      }

      // Check for close matches to prevent duplication on creation
      if (!isEditing) {
        const names = accounts.map(a => a.institution);
        const matched = findCloseMatch(institution, names);
        if (matched) {
          if (window.confirm(`Já existe uma conta com o nome semelhante "${matched}". Deseja utilizar a conta existente ao invés de criar uma duplicada?`)) {
            setShowModal(false);
            resetForm();
            return;
          }
        }
      }

      const payload: any = {
        institution,
        type,
        initial_balance: Number(initialBalance),
        limit: Number(limit),
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
            current_balance: Number(initialBalance)
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

  const handleSaveAdjustment = async () => {
    if (!supabase || !adjustAccount) return;
    setIsSavingAdjust(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Usuário não autenticado");

      // ── INVESTMENT accounts: saldo = caixa livre (initial_balance) + investimentos (auto-sync)
      // O ajuste aqui afeta SOMENTE o caixa livre para não sobrescrever o sync automático.
      if (adjustAccount.type === 'INVESTMENT') {
        // Busca a soma dos investimentos vinculados a esta corretora
        const { data: linkedInvests } = await supabase
          .from('physical_assets')
          .select('estimated_value, metadata')
          .eq('user_id', user.id)
          .eq('category', 'INVESTMENT')
          .eq('is_archived', false);

        const investedTotal = (linkedInvests || [])
          .filter((inv: any) =>
            inv.metadata?.brokerAccountId === adjustAccount.id &&
            inv.metadata?.status !== 'RESGATADO'
          )
          .reduce((sum: number, inv: any) => sum + Number(inv.estimated_value || 0), 0);

        if (adjustMode === 'initial') {
          // Modo Caixa Livre: o usuário define o novo valor de caixa não investido
          const newCash = Number(adjustValue);
          const newTotal = newCash + investedTotal;

          const { error } = await supabase
            .from('accounts')
            .update({ initial_balance: newCash, current_balance: newTotal })
            .eq('id', adjustAccount.id)
            .eq('user_id', user.id);

          if (error) throw error;
        } else {
          // Modo Ajuste Pontual: interpreta adjustValue como novo saldo TOTAL
          // O caixa livre = novo total - investimentos (protege o sync)
          const newTotal = Number(adjustValue);
          const newCash = newTotal - investedTotal;
          const currentCash = adjustAccount.initialBalance;
          const cashDelta = newCash - currentCash;

          if (Math.abs(cashDelta) < 0.01) {
            alert("O novo saldo é igual ao saldo atual. Informe um valor diferente.");
            setIsSavingAdjust(false);
            return;
          }

          const txType = cashDelta > 0 ? 'INCOME' : 'EXPENSE';
          const txAmount = Math.abs(cashDelta);

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
            .update({ initial_balance: newCash, current_balance: newTotal })
            .eq('id', adjustAccount.id)
            .eq('user_id', user.id);

          if (accError) throw accError;
        }
      } else {
        // ── Contas NÃO-INVESTMENT: lógica original preservada
        if (adjustMode === 'initial') {
          const transactionsSum = adjustAccount.currentBalance - adjustAccount.initialBalance;
          const newInitialBalance = Number(adjustValue) - transactionsSum;

          const { error } = await supabase
            .from('accounts')
            .update({ initial_balance: newInitialBalance, current_balance: adjustValue })
            .eq('id', adjustAccount.id)
            .eq('user_id', user.id);

          if (error) throw error;
        } else {
          const delta = Number(adjustValue) - adjustAccount.currentBalance;

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
            .update({ current_balance: adjustValue })
            .eq('id', adjustAccount.id)
            .eq('user_id', user.id);

          if (accError) throw accError;
        }
      }

      setShowAdjustModal(false);
      fetchAccounts();
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
    setInitialBalance('');
    setLimit('');
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

  const totalBalance = filteredAccounts
    .filter(acc => acc.includeInDashboard && !acc.isArchived)
    .reduce((sum, acc) => sum + acc.currentBalance, 0);

  const activeAccountsCount = accounts.filter(acc => !acc.isArchived).length;
  const investmentAccountsCount = accounts.filter(acc => acc.type === 'INVESTMENT' && !acc.isArchived).length;

  const activeFilterCount = (filterType !== 'ALL' ? 1 : 0) +
    (filterStatus !== 'ACTIVE' ? 1 : 0) +
    (filterCurrency !== 'ALL' ? 1 : 0) +
    (filterDashboard !== 'ALL' ? 1 : 0);

  // Para contas INVESTMENT: delta sempre vs saldo total atual (investido + caixa).
  // Para outras contas: delta vs saldo atual (modo transaction) ou saldo inicial (modo initial).
  const currentDelta = adjustAccount
    ? adjustAccount.type === 'INVESTMENT'
      ? Number(adjustValue) - adjustAccount.currentBalance
      : Number(adjustValue) - (adjustMode === 'initial' ? adjustAccount.initialBalance : adjustAccount.currentBalance)
    : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* HEADER ROW */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Contas e Carteiras</h1>
          <p className="text-sm text-slate-400 font-medium">Gerencie suas instituições financeiras e saldos.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="hidden sm:flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform active:scale-95 whitespace-nowrap"
        >
          <Plus size={18} /> Nova Conta
        </button>
      </div>

      {/* SUMMARY METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Saldo Consolidado</span>
            <p className={`text-lg font-black tracking-tight ${totalBalance < 0 ? 'text-rose-500' : 'text-slate-900 dark:text-white'}`}>
              {formatCurrency(totalBalance)}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-950/30 flex items-center justify-center text-brand-600 shrink-0">
            <TrendingUp size={20} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Contas Ativas</span>
            <p className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
              {activeAccountsCount}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center text-blue-600 shrink-0">
            <Landmark size={20} />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Investimentos</span>
            <p className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
              {investmentAccountsCount} {investmentAccountsCount === 1 ? 'instituição' : 'instituições'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center text-indigo-600 shrink-0">
            <Zap size={20} />
          </div>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-grow">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Pesquisar instituição..."
            className="w-full pl-11 pr-4 h-12 bg-white border border-slate-100 rounded-xl outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 text-sm font-medium transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-6 h-12 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${activeFilterCount > 0 ? 'bg-brand-600 text-white' : 'bg-white border border-slate-100 text-slate-400 hover:bg-slate-50'}`}
          >
            <Filter size={16} /> Filtros {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>
          <button
            onClick={() => setFilterStatus(filterStatus === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED')}
            className={`px-6 h-12 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${filterStatus === 'ARCHIVED' ? 'bg-amber-500 text-white' : 'bg-white border border-slate-100 text-slate-400 hover:bg-slate-50'}`}
          >
            <Archive size={16} /> {filterStatus === 'ARCHIVED' ? 'Ver Ativas' : 'Arquivadas'}
          </button>
        </div>
      </div>

      {/* CONTENT GRID */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
          <div className="w-10 h-10 border-2 border-slate-200 border-t-brand-600 rounded-full animate-spin" />
          <p className="text-slate-400 font-medium tracking-widest text-[10px] uppercase">Carregando Contas...</p>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] bg-white border border-slate-100 rounded-[32px] p-20 text-center space-y-6">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
            <Landmark size={40} />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-slate-900">Nenhuma conta encontrada</h3>
            <p className="text-slate-400 font-medium">Tente ajustar seus filtros ou cadastre uma nova instituição.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {filteredAccounts.map((acc) => (
            <div
              key={acc.id}
              className={`bg-white rounded-[24px] border border-slate-100 p-5 shadow-sm group hover:border-brand-200 transition-all duration-300 relative overflow-hidden ${acc.isArchived ? 'opacity-70 grayscale' : ''}`}
            >
              <div className="absolute top-0 right-0 w-20 h-20 bg-slate-50 rounded-bl-[80px] -translate-y-5 translate-x-5 opacity-0 group-hover:opacity-100 transition-all" />

              <div className="relative z-10 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg shadow-current/20"
                      style={{ backgroundColor: acc.color }}
                    >
                      {acc.type === 'CHECKING' ? <Building2 size={20} /> : <Wallet size={20} />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-slate-900 group-hover:text-brand-600 transition-colors uppercase tracking-tight truncate max-w-[150px]">{acc.institution}</h3>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{getTypeLabel(acc.type)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEditAccount(acc)}
                      className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all"
                      aria-label={`Editar conta do ${acc.institution}`}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleArchiveAccount(acc.id, acc.isArchived)}
                      className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                      aria-label={`${acc.isArchived ? 'Desarquivar' : 'Arquivar'} conta do ${acc.institution}`}
                    >
                      <Archive size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Saldo Atual</p>
                  <p className={`text-xl font-black tracking-tight ${acc.currentBalance < 0 ? 'text-rose-500' : 'text-slate-900'}`}>
                    {formatCurrency(acc.currentBalance)}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${acc.includeInDashboard ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                      {acc.includeInDashboard ? 'No Dashboard' : 'Privada'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/history?account=${acc.id}`)}
                      className="flex items-center justify-center p-2 bg-brand-50 hover:bg-brand-600 text-brand-600 hover:text-white rounded-lg transition-all shadow-sm"
                      title="Ver Extrato"
                      aria-label={`Ver extrato da conta do ${acc.institution}`}
                    >
                      <HistoryIcon size={12} />
                    </button>
                    <button
                      onClick={() => { setAdjustAccount(acc); setAdjustValue(acc.currentBalance); setAdjustMode('transaction'); setShowAdjustModal(true); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-brand-900 hover:text-white rounded-lg text-[8px] font-black uppercase tracking-widest transition-all"
                      aria-label={`Ajustar saldo da conta do ${acc.institution}`}
                    >
                      <RefreshCw size={10} /> Ajustar Saldo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* ADD CARD BUTTON (MOCK) */}
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="rounded-[24px] border-2 border-dashed border-slate-100 p-5 flex flex-col items-center justify-center gap-3 text-slate-300 hover:border-brand-200 hover:text-brand-600 hover:bg-brand-50/30 transition-all min-h-[150px] group"
          >
            <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center transition-colors group-hover:bg-brand-100">
              <Plus size={24} />
            </div>
            <div className="text-center">
              <p className="font-bold text-xs text-slate-500">Nova Instituição</p>
              <p className="text-[8px] font-medium uppercase tracking-widest">Conectar Banco ou Carteira</p>
            </div>
          </button>
        </div>
      )}

      {/* ADJUST MODAL */}
      {showAdjustModal && adjustAccount && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-900/40 backdrop-blur-sm" onClick={() => setShowAdjustModal(false)} />
          <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl relative overflow-hidden animate-in zoom-in duration-300">
            <div className="p-8 space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Ajustar Saldo</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{adjustAccount.institution}</p>
                </div>
                <button onClick={() => setShowAdjustModal(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-all"><X size={24} /></button>
              </div>

              {/* Banner informativo para contas de Investimento */}
              {adjustAccount.type === 'INVESTMENT' && (
                <div className="flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                  <Info size={15} className="text-indigo-500 mt-0.5 shrink-0" />
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">Corretora com Sync Automático</p>
                    <p className="text-[10px] text-indigo-600 leading-relaxed">
                      Saldo Total = <strong>Caixa Livre</strong> + <strong>Total Investido</strong> (calculado automaticamente pelo Patrimônio).
                      Aqui você ajusta apenas o caixa livre. Os investimentos são protegidos.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100">
                <button
                  onClick={() => { setAdjustMode('initial'); setAdjustValue(adjustAccount.type === 'INVESTMENT' ? adjustAccount.initialBalance : adjustAccount.currentBalance); }}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase transition-all ${adjustMode === 'initial' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400'}`}
                >
                  {adjustAccount.type === 'INVESTMENT' ? 'Caixa Livre' : 'Saldo Inicial'}
                </button>
                <button
                  onClick={() => { setAdjustMode('transaction'); setAdjustValue(adjustAccount.currentBalance); }}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase transition-all ${adjustMode === 'transaction' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400'}`}
                >
                  Ajuste Pontual
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                    {adjustAccount.type === 'INVESTMENT' && adjustMode === 'initial'
                      ? 'Caixa Livre (não investido)'
                      : 'Novo Saldo Total'
                    }
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={adjustValue}
                      onChange={e => {
                        const val = e.target.value;
                        setAdjustValue(val === '' ? '' : Number(val));
                      }}
                      className="w-full h-14 pl-12 pr-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-2xl text-slate-900 outline-none focus:ring-2 focus:ring-brand-500 transition-all"
                    />
                  </div>
                </div>

                {currentDelta !== 0 && (
                  <p className={`text-[10px] font-bold uppercase flex items-center gap-1 ${currentDelta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    <ArrowRight size={12} className={currentDelta >= 0 ? '-rotate-45' : 'rotate-45'} />
                    Variação: {formatCurrency(currentDelta)}
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowAdjustModal(false)} className="flex-1 py-4 text-slate-400 font-bold text-xs uppercase tracking-widest">Cancelar</button>
                <button
                  onClick={handleSaveAdjustment}
                  disabled={isSavingAdjust || currentDelta === 0}
                  className="flex-2 w-full py-4 bg-brand-900 text-white rounded-2xl font-bold uppercase text-xs shadow-xl transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSavingAdjust ? <Loader2 className="animate-spin h-4 w-4 mx-auto" /> : 'Confirmar Ajuste'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW ACCOUNT MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-900/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="bg-white rounded-[32px] sm:rounded-[40px] w-full max-w-lg shadow-2xl relative overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[95vh] sm:max-h-[90vh]">
            <div className="p-6 sm:p-8 lg:p-10 space-y-6 sm:space-y-8 overflow-y-auto">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">{isEditing ? 'Editar Conta' : 'Nova Conta'}</h2>
                <button onClick={() => setShowModal(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-all"><X size={24} /></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Instituição</label>
                  <input value={institution} onChange={e => setInstitution(e.target.value)} className="w-full h-12 px-4 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 font-medium text-sm transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tipo</label>
                  <select value={type} onChange={e => setType(e.target.value as AccountType)} className="w-full h-12 px-4 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 font-medium text-sm transition-all">
                    <option value="CHECKING">Conta Corrente</option>
                    <option value="SAVINGS">Poupança</option>
                    <option value="INVESTMENT">Investimento</option>
                    <option value="CASH">Dinheiro / Carteira</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Moeda</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)} className="w-full h-12 px-4 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 font-medium text-sm transition-all">
                    <option value="BRL">Real (BRL)</option>
                    <option value="USD">Dólar (USD)</option>
                    <option value="EUR">Euro (EUR)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Saldo Inicial</label>
                  <input
                    type="number"
                    value={initialBalance}
                    onChange={e => {
                      const val = e.target.value;
                      setInitialBalance(val === '' ? '' : Number(val));
                    }}
                    className="w-full h-12 px-4 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 font-medium text-sm transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-slate-900">Somar no Painel Geral</p>
                  <p className="text-xs text-slate-500">Inclui o saldo desta conta nos cálculos de Patrimônio do Dashboard.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIncludeInDashboard(!includeInDashboard)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${includeInDashboard ? 'bg-brand-500' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${includeInDashboard ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Identidade Visual</label>
                <div className="flex flex-wrap gap-3">
                  {COLORS.map(c => (
                    <button
                      key={c.hex}
                      onClick={() => setColor(c.hex)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${color === c.hex ? 'border-brand-500 scale-125 ring-2 ring-brand-100' : 'border-transparent opacity-60 hover:opacity-100'}`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                  <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-8 h-8 rounded-full border-0 p-0 overflow-hidden cursor-pointer" />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-2">
                <button onClick={() => setShowModal(false)} className="order-2 sm:order-1 flex-1 h-12 sm:h-14 text-slate-400 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 rounded-xl transition-all">Cancelar</button>
                <button
                  onClick={handleSaveAccount}
                  className="order-1 sm:order-2 flex-2 w-full h-12 sm:h-14 bg-brand-600 text-white rounded-xl sm:rounded-2xl font-bold uppercase text-xs shadow-xl shadow-brand-500/20 transition-all active:scale-95"
                >
                  {isEditing ? 'Atualizar Conta' : 'Salvar Conta'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FILTER MODAL */}
      {showFilters && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-900/40 backdrop-blur-sm" onClick={() => setShowFilters(false)} />
          <div className="bg-white rounded-[32px] w-full max-w-sm shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom-4 duration-300 p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Filtros Avançados</h3>
              <button onClick={() => setShowFilters(false)} className="p-2 text-slate-400"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Tipo de Conta</label>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-full h-11 px-4 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium">
                  <option value="ALL">Qualquer Tipo</option>
                  <option value="CHECKING">Conta Corrente</option>
                  <option value="SAVINGS">Poupança</option>
                  <option value="INVESTMENT">Investimento</option>
                  <option value="CASH">Dinheiro</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <button onClick={() => { setFilterType('ALL'); setShowFilters(false); }} className="flex-1 h-12 text-slate-400 font-bold text-xs uppercase">Limpar</button>
              <button onClick={() => setShowFilters(false)} className="flex-2 w-full h-12 bg-brand-900 text-white rounded-xl font-bold uppercase text-xs">Aplicar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountsSection;

