import React, { useState, useEffect, useCallback } from 'react';
import { Plus, FileDown, Loader2, AlertCircle, Calendar, Hash, MoreHorizontal, Filter, Search, X } from 'lucide-react';
import * as XLSX from 'xlsx';

import { Transaction, TransactionType, BankAccount } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { HistoryUtils, EPS } from '../lib/historyUtils';

// Modular Components
import { HistoryFilters } from '../components/history/HistoryFilters';
import { TransactionTable } from '../components/history/TransactionTable';
import { PaymentModal } from '../components/history/PaymentModal';
import { AddTransactionModal } from '../components/history/AddTransactionModal';

const CATEGORIES = [
  'Salário', 'Moradia', 'Investimento', 'Cartão de Crédito',
  'Extra', 'Alimentação', 'Transporte', 'Lazer', 'Saúde',
  'Educação', 'Outros', 'Conciliação'
];

type PayModalState =
  | { open: false }
  | {
    open: true;
    tx: Transaction;
    remaining: number;
    payAmount: string;
    splitRemainder: boolean;
    isSubmitting: boolean;
    error?: string | null;
  };

type AddModalState =
  | { open: false }
  | {
    open: true;
    isSubmitting: boolean;
    error?: string | null;
    form: {
      date: string;
      description: string;
      type: 'INCOME' | 'EXPENSE';
      amount: string;
      accountId: string;
      category: string;
    };
  };

const HistoryPage: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterAccount, setFilterAccount] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  // Inline Editing
  const [editingRow, setEditingRow] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<any>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Modals
  const [payModal, setPayModal] = useState<PayModalState>({ open: false });
  const [addModal, setAddModal] = useState<AddModalState>({ open: false });

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setIsLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data: accData, error: accErr } = await supabase.from('accounts').select('*').eq('is_archived', false);
      if (accErr) throw accErr;
      setAccounts((accData || []).map((a: any) => ({
        id: a.id,
        institution: a.institution,
        type: a.type,
        currency: a.currency,
        initialBalance: Number(a.initial_balance),
        currentBalance: Number(a.current_balance),
        limit: Number(a.limit),
        color: a.color,
        isArchived: a.is_archived,
        includeInDashboard: a.include_in_dashboard,
        lastSync: a.last_sync
      })));

      let query: any = supabase.from('transactions').select('*').eq('user_id', user.id).eq('is_deleted', false).order('date', { ascending: false });
      if (filterType !== 'ALL') query = query.eq('type', filterType);
      if (filterAccount !== 'ALL') query = query.eq('account_id', filterAccount);
      if (filterCategory !== 'ALL') query = query.eq('category', filterCategory);
      if (startDate) query = query.gte('date', startDate);
      if (endDate) query = query.lte('date', endDate);
      if (minPrice !== '') query = query.gte('amount', Number(minPrice));
      if (maxPrice !== '') query = query.lte('amount', Number(maxPrice));

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      setTransactions((data || []).map((t: any) => ({
        id: t.id,
        description: t.description ?? '',
        amount: Number(t.amount),
        date: t.date,
        type: t.type as TransactionType,
        accountId: t.account_id,
        accountName: t.account_name ?? '',
        category: t.category ?? 'Outros',
        isDeleted: t.is_deleted,
        isReconciled: t.is_reconciled,
        isPaid: t.is_paid ?? false,
        paidAmount: Number(t.paid_amount ?? 0),
        paidAt: t.paid_at ?? undefined,
        parentId: t.parent_id ?? null
      })));
    } catch (err) {
      setError('Erro ao carregar dados.');
    } finally {
      setIsLoading(false);
    }
  }, [filterType, filterAccount, filterCategory, startDate, endDate, minPrice, maxPrice]);

  useEffect(() => {
    if (isSupabaseConfigured) fetchData();
  }, [fetchData]);

  const handleUpdate = async (id: string, field: string, value: any) => {
    if (!supabase) return;
    setSavingId(id);
    try {
      const patch: any = { [field]: value };
      if (field === 'account_id') {
        const acc = accounts.find(a => a.id === value);
        if (acc) patch.account_name = acc.institution;
      }
      const { error: err } = await supabase.from('transactions').update(patch).eq('id', id);
      if (err) throw err;

      const before = transactions.find(t => t.id === id);
      if (before && (HistoryUtils.getStatus(before) !== 'PENDING') && (field === 'amount' || field === 'type' || field === 'account_id')) {
        await supabase.rpc('recalculate_account_balance', { p_account_id: field === 'account_id' ? value : before.accountId });
        if (field === 'account_id' && before.accountId !== value) await supabase.rpc('recalculate_account_balance', { p_account_id: before.accountId });
      }

      setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...patch, accountId: patch.account_id || t.accountId, accountName: patch.account_name || t.accountName } : t));
    } catch (err) {
      alert('Erro ao salvar alteração');
    } finally {
      setSavingId(null);
      setEditingRow(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!supabase || !window.confirm('Excluir transação?')) return;
    try {
      const tx = transactions.find(t => t.id === id);
      await supabase.from('transactions').update({ is_deleted: true }).eq('id', id);
      setTransactions(prev => prev.filter(t => t.id !== id));
      if (tx && HistoryUtils.getStatus(tx) !== 'PENDING') await supabase.rpc('recalculate_account_balance', { p_account_id: tx.accountId });
    } catch (err) {
      alert('Erro ao excluir');
    }
  };

  const resetFilters = () => {
    setFilterType('ALL'); setFilterAccount('ALL'); setFilterCategory('ALL');
    setStartDate(''); setEndDate(''); setMinPrice(''); setMaxPrice('');
    setSearch('');
  };

  const exportToXlsx = (format: 'xlsx' | 'csv') => {
    const rows = filtered.map(t => ({
      Data: t.date ? new Date(t.date).toLocaleDateString('pt-BR') : '',
      Descrição: t.description,
      Conta: t.accountName,
      Categoria: t.category,
      Tipo: t.type,
      Valor: (t.type === 'EXPENSE' ? -1 : 1) * t.amount,
      Status: HistoryUtils.getStatus(t)
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Histórico');
    if (format === 'xlsx') XLSX.writeFile(wb, `historico-${new Date().toISOString().slice(0, 10)}.xlsx`);
    else {
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `historico-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
    }
  };

  const openPayModal = (tx: Transaction) => {
    const remaining = HistoryUtils.getRemaining(tx);
    setPayModal({ open: true, tx, remaining, payAmount: String(remaining.toFixed(2)), splitRemainder: false, isSubmitting: false });
  };

  const submitPayment = async () => {
    if (!supabase || !payModal.open) return;
    const amount = Number(payModal.payAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0 || amount > payModal.remaining + EPS) return;
    setPayModal(prev => prev.open ? { ...prev, isSubmitting: true } : prev);
    try {
      await supabase.rpc('pay_transaction', { p_transaction_id: payModal.tx.id, p_amount: amount, p_split_remainder: payModal.splitRemainder });
      await supabase.rpc('recalculate_account_balance', { p_account_id: payModal.tx.accountId });
      setPayModal({ open: false });
      await fetchData();
    } catch (err) {
      setPayModal(prev => prev.open ? { ...prev, isSubmitting: false, error: 'Erro ao processar pagamento.' } : prev);
    }
  };

  const createManualTransaction = async () => {
    if (!supabase || !addModal.open) return;
    const f = addModal.form;
    const amount = Math.abs(Number(f.amount.replace(',', '.')));
    if (!f.description || !f.accountId || isNaN(amount)) return;
    setAddModal(prev => prev.open ? { ...prev, isSubmitting: true } : prev);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('transactions').insert({
        user_id: user.id, date: f.date, description: f.description, amount, type: f.type,
        account_id: f.accountId, category: f.category, is_paid: false, paid_amount: 0
      });
      setAddModal({ open: false });
      await fetchData();
    } catch (err) {
      setAddModal(prev => prev.open ? { ...prev, isSubmitting: false, error: 'Erro ao adicionar transação.' } : prev);
    }
  };

  const statusBadge = (t: Transaction) => {
    const s = HistoryUtils.getStatus(t);
    const base = "px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-widest border";
    if (s === 'PAID') return <span className={`${base} bg-emerald-50 text-emerald-600 border-emerald-100`}>Pago</span>;
    if (s === 'PARTIAL') return <span className={`${base} bg-amber-50 text-amber-600 border-amber-100`}>Parcial</span>;
    return <span className={`${base} bg-slate-50 text-slate-400 border-slate-100`}>Pendente</span>;
  };

  const filtered = transactions.filter(t => t.description.toLowerCase().includes(search.toLowerCase()) || t.accountName.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto py-8 sm:py-10 px-6 sm:px-8 space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Histórico <span className="text-brand-600">Financeiro</span></h1>
          <p className="text-slate-500 text-sm">{transactions.length} registros processados no vault.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAddModal({ open: true, isSubmitting: false, form: { date: new Date().toISOString().slice(0, 10), description: '', type: 'EXPENSE', amount: '', accountId: accounts[0]?.id || '', category: 'Outros' } })}
            className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-md flex items-center gap-2"
          >
            <Plus size={16} /> Novo Lançamento
          </button>
          <button
            onClick={() => exportToXlsx('xlsx')}
            className="p-3 bg-white border border-slate-100 rounded-xl text-slate-400 hover:text-slate-900 shadow-sm transition-all"
            title="Exportar"
          >
            <FileDown size={18} />
          </button>
        </div>
      </header>

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
        <div className="relative flex-grow group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
          <input
            type="text"
            placeholder="Pesquisar registros..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-11 pr-4 bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-1 focus:ring-slate-200"
          />
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className={`p-3 rounded-xl border transition-all ${showFilters ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
          <Filter size={18} />
        </button>
      </div>

      {showFilters && (
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-in slide-in-from-top-2">
          {/* Filter inputs scaled down... */}
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="h-10 px-3 bg-white border border-slate-100 rounded-lg text-[10px] font-bold uppercase tracking-widest">
            <option value="ALL">TODOS TIPOS</option>
            <option value="INCOME">ENTRADAS</option>
            <option value="EXPENSE">SAÍDAS</option>
          </select>
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className="h-10 px-3 bg-white border border-slate-100 rounded-lg text-[10px] font-bold uppercase tracking-widest">
            <option value="ALL">TODAS CONTAS</option>
            {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.institution}</option>)}
          </select>
          <button onClick={resetFilters} className="h-10 px-6 text-[9px] font-bold text-slate-400 bg-white border border-slate-100 rounded-lg uppercase tracking-widest hover:text-rose-500 hover:border-rose-100 transition-all">Limpar Filtros</button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <TransactionTable
          transactions={filtered} isLoading={isLoading} accounts={accounts} categories={CATEGORIES}
          editingRow={editingRow} setEditingRow={setEditingRow} editValue={editValue} setEditValue={setEditValue}
          savingId={savingId} handleUpdate={handleUpdate} handleDelete={handleDelete} statusBadge={statusBadge}
          formatCurrency={HistoryUtils.formatCurrency} getAmount={HistoryUtils.getAmount} getPaidAmount={HistoryUtils.getPaidAmount}
          getRemaining={HistoryUtils.getRemaining} getStatus={HistoryUtils.getStatus} openPayModal={openPayModal}
          reopenTransaction={(t) => supabase && supabase.rpc('reopen_transaction', { p_transaction_id: t.id }).then(() => fetchData())}
        />
      </div>

      <PaymentModal show={payModal.open} onClose={() => setPayModal({ open: false })} onSubmit={submitPayment}
        tx={payModal.open ? payModal.tx : null} remaining={payModal.open ? payModal.remaining : 0}
        payAmount={payModal.open ? payModal.payAmount : ''} setPayAmount={(v) => setPayModal(prev => prev.open ? { ...prev, payAmount: v } : prev)}
        splitRemainder={payModal.open ? payModal.splitRemainder : false} setSplitRemainder={(v) => setPayModal(prev => prev.open ? { ...prev, splitRemainder: v } : prev)}
        isSubmitting={payModal.open ? payModal.isSubmitting : false} error={payModal.open ? payModal.error : null} formatCurrency={HistoryUtils.formatCurrency}
      />

      <AddTransactionModal show={addModal.open} onClose={() => setAddModal({ open: false })} onSubmit={createManualTransaction}
        isSubmitting={addModal.open ? addModal.isSubmitting : false} error={addModal.open ? addModal.error : null}
        form={addModal.open ? addModal.form : {} as any} setAddField={(f, v) => setAddModal(prev => prev.open ? { ...prev, form: { ...prev.form, [f]: v } } : prev)}
        accounts={accounts} categories={CATEGORIES}
      />
    </div>
  );
};

export default HistoryPage;
