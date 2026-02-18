import React, { useState, useEffect, useCallback } from 'react';
import { Plus, FileDown, Loader2, AlertCircle } from 'lucide-react';
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
    const base = "px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border";
    if (s === 'PAID') return <span className={`${base} bg-emerald-50 text-emerald-700 border-emerald-100`}>Pago</span>;
    if (s === 'PARTIAL') return <span className={`${base} bg-amber-50 text-amber-700 border-amber-100`}>Parcial</span>;
    return <span className={`${base} bg-slate-50 text-slate-500 border-slate-100`}>Pendente</span>;
  };

  const filtered = transactions.filter(t => t.description.toLowerCase().includes(search.toLowerCase()) || t.accountName.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-7xl mx-auto py-6 sm:py-10 px-4 sm:px-6 lg:px-8 space-y-8 sm:space-y-10 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl sm:text-4xl font-display font-black text-slate-900 tracking-tight dark:text-white">
            Histórico <span className="text-brand-600 italic">Financeiro</span>
          </h1>
          <p className="text-slate-500 font-medium text-base sm:text-lg">Gestão detalhada e conciliação de lançamentos</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button onClick={() => setAddModal({ open: true, isSubmitting: false, form: { date: new Date().toISOString().slice(0, 10), description: '', type: 'EXPENSE', amount: '', accountId: accounts[0]?.id || '', category: 'Outros' } })}
            className="px-6 py-4 bg-brand-600 text-white rounded-[16px] sm:rounded-[20px] font-black text-xs uppercase tracking-widest shadow-xl shadow-brand-500/20 hover:bg-brand-700 transition-all active:scale-95 flex items-center justify-center gap-2">
            <Plus size={18} /> Novo Lançamento
          </button>
          <div className="flex gap-2">
            <button onClick={() => exportToXlsx('xlsx')} className="flex-grow sm:flex-none p-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[16px] sm:rounded-2xl text-slate-500 hover:text-brand-600 shadow-sm transition-all flex items-center justify-center">
              <FileDown size={20} />
            </button>
          </div>
        </div>
      </header>

      <HistoryFilters
        search={search} setSearch={setSearch} showFilters={showFilters} setShowFilters={setShowFilters}
        filterType={filterType} setFilterType={setFilterType} filterAccount={filterAccount} setFilterAccount={setFilterAccount}
        filterCategory={filterCategory} setFilterCategory={setFilterCategory} startDate={startDate} setStartDate={setStartDate}
        endDate={endDate} setEndDate={setEndDate} minPrice={minPrice} setMinPrice={setMinPrice} maxPrice={maxPrice} setMaxPrice={setMaxPrice}
        categories={CATEGORIES} accounts={accounts} resetFilters={resetFilters}
      />

      <TransactionTable
        transactions={filtered} isLoading={isLoading} accounts={accounts} categories={CATEGORIES}
        editingRow={editingRow} setEditingRow={setEditingRow} editValue={editValue} setEditValue={setEditValue}
        savingId={savingId} handleUpdate={handleUpdate} handleDelete={handleDelete} statusBadge={statusBadge}
        formatCurrency={HistoryUtils.formatCurrency} getAmount={HistoryUtils.getAmount} getPaidAmount={HistoryUtils.getPaidAmount}
        getRemaining={HistoryUtils.getRemaining} getStatus={HistoryUtils.getStatus} openPayModal={openPayModal}
        reopenTransaction={(t) => supabase && supabase.rpc('reopen_transaction', { p_transaction_id: t.id }).then(() => fetchData())}
      />

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
