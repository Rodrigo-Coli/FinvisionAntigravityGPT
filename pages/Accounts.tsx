import React, { useState } from 'react';
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
      if (!user) return;
      const payload: any = { institution, type, initial_balance: initialBalance, limit, currency, color, include_in_dashboard: includeInDashboard };
      if (isEditing) {
        await supabase.from('accounts').update(payload).eq('id', isEditing).eq('user_id', user.id);
      } else {
        await supabase.from('accounts').insert([{ ...payload, user_id: user.id, current_balance: initialBalance }]);
      }
      setShowModal(false);
      resetForm();
      fetchAccounts();
    } catch (err: any) { console.error(err); }
  };

  const handleArchiveAccount = async (id: string, current: boolean) => {
    if (!supabase) return;
    try {
      await supabase.from('accounts').update({ is_archived: !current }).eq('id', id);
      fetchAccounts();
    } catch (err) { console.error(err); }
  };

  const handleEditInitialBalance = async (acc: BankAccount) => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { count } = await supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('account_id', acc.id);
      const hasTxs = (count || 0) > 0;
      setHasTransactions(hasTxs);
      setAdjustAccount(acc);
      setAdjustValue(hasTxs ? acc.currentBalance : acc.initialBalance);
      setAdjustMode(hasTxs ? 'transaction' : 'initial');
      setAdjustDate(new Date().toISOString().split('T')[0]);
      setShowAdjustModal(true);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleSaveAdjustment = async () => {
    if (!supabase || !adjustAccount) return;
    setIsSavingAdjust(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (adjustMode === 'initial') {
        const delta = adjustValue - adjustAccount.initialBalance;
        await supabase.from('accounts').update({ initial_balance: adjustValue, current_balance: adjustAccount.currentBalance + delta }).eq('id', adjustAccount.id);
      } else {
        const delta = adjustValue - adjustAccount.currentBalance;
        if (delta !== 0) {
          await supabase.from('transactions').insert({ user_id: user.id, account_id: adjustAccount.id, account_name: adjustAccount.institution, date: adjustDate, description: adjustDesc, category: adjustCat, type: delta > 0 ? 'INCOME' : 'EXPENSE', amount: Math.abs(delta) });
          await supabase.from('accounts').update({ current_balance: adjustValue }).eq('id', adjustAccount.id);
        }
      }
      setShowAdjustModal(false);
      fetchAccounts();
    } catch (err) { console.error(err); } finally { setIsSavingAdjust(false); }
  };

  const resetForm = () => {
    setIsEditing(null); setInstitution(''); setType('CHECKING'); setInitialBalance(0); setLimit(0); setCurrency('BRL'); setColor('#3b82f6'); setIncludeInDashboard(true);
  };

  const formatCurrency = (val: number, cur: string = 'BRL') => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cur }).format(val);

  const getIcon = (type: AccountType) => {
    switch (type) {
      case 'CASH': return <Wallet size={18} />;
      case 'INVESTMENT': return <TrendingUp size={18} />;
      default: return <Landmark size={18} />;
    }
  };

  const filteredAccounts = accounts.filter(acc => {
    const matchesSearch = acc.institution.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || (filterStatus === 'ACTIVE' ? !acc.isArchived : acc.isArchived);
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="max-w-6xl mx-auto py-8 sm:py-10 px-6 sm:px-8 space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Contas e <span className="text-brand-600">Carteiras</span></h1>
          <p className="text-slate-500 text-sm">{accounts.length} fontes de liquidez conectadas.</p>
        </div>
        <button onClick={() => { resetForm(); setShowModal(true); }} className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-md flex items-center gap-2 self-start">
          <Plus size={16} /> Nova Conta
        </button>
      </header>

      <div className="flex gap-4">
        <div className="relative flex-grow">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
          <input type="text" placeholder="Pesquisar instituição..." className="w-full h-11 pl-11 pr-4 bg-white border border-slate-100 rounded-xl outline-none text-sm font-bold text-slate-900 shadow-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <button onClick={() => setFilterStatus(filterStatus === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED')} className={`px-5 h-11 rounded-xl font-bold text-[9px] uppercase tracking-widest border transition-all flex items-center gap-2 ${filterStatus === 'ARCHIVED' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-400 border-slate-100'}`}>
          <Archive size={16} /> {filterStatus === 'ARCHIVED' ? 'Ativas' : 'Arquivos'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? Array(3).fill(0).map((_, i) => <div key={i} className="h-48 bg-slate-50 rounded-2xl animate-pulse" />) : (
          filteredAccounts.map(acc => (
            <div key={acc.id} className={`bg-white rounded-2xl border border-slate-100 p-6 flex flex-col justify-between min-h-[180px] shadow-sm hover:border-slate-200 transition-all ${acc.isArchived ? 'opacity-50 grayscale' : ''}`}>
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: acc.color }} />
                      <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">{acc.type}</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 truncate max-w-[140px] leading-tight">{acc.institution || acc.name}</h3>
                  </div>
                  <div className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 border border-slate-100">
                    {getIcon(acc.type)}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Saldo Atual</p>
                  <p className="text-2xl font-black text-slate-900 tracking-tighter">{formatCurrency(acc.currentBalance)}</p>
                </div>
              </div>
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-50">
                <div className="flex gap-2">
                  <button onClick={() => handleEditInitialBalance(acc)} className="p-2 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-lg border border-slate-100 transition-all"><RefreshCw size={14} /></button>
                  <button onClick={() => handleEditAccount(acc)} className="p-2 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-lg border border-slate-100 transition-all"><Edit2 size={14} /></button>
                </div>
                <button onClick={() => handleArchiveAccount(acc.id, acc.isArchived)} className="p-2 text-slate-300 hover:text-amber-600"><Archive size={16} /></button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Rescaled */}
      {showModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowModal(false)}></div>
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl p-8 space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">{isEditing ? 'Editar Conta' : 'Nova Conta'}</h2>
              <button onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <input type="text" placeholder="Instituição" value={institution} onChange={e => setInstitution(e.target.value)} className="w-full h-11 border border-slate-100 rounded-xl px-4 text-sm font-bold" />
              <select value={type} onChange={e => setType(e.target.value as any)} className="w-full h-11 border border-slate-100 rounded-xl px-4 text-sm font-bold">
                <option value="CHECKING">Conta Corrente</option>
                <option value="SAVINGS">Poupança</option>
                <option value="INVESTMENT">Investimento</option>
                <option value="CASH">Dinheiro</option>
              </select>
              <input type="number" placeholder="Saldo Inicial" value={initialBalance} onChange={e => setInitialBalance(Number(e.target.value))} className="w-full h-11 border border-slate-100 rounded-xl px-4 text-sm font-bold" />
              <button onClick={handleSaveAccount} className="w-full h-12 bg-slate-900 text-white rounded-xl font-bold uppercase text-[10px] tracking-widest mt-4">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Accounts;