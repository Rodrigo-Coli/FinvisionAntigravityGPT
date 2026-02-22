import React, { useState, useEffect, useCallback } from 'react';
import { Plus, FileDown, Loader2, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

import { Transaction, TransactionType, BankAccount } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { HistoryUtils, EPS } from '../lib/historyUtils';
import { DateUtils } from '../lib/dateUtils';

// Modular Components
import { HistoryFilters } from '../components/history/HistoryFilters';
import { TransactionTable } from '../components/history/TransactionTable';
import { PaymentModal } from '../components/history/PaymentModal';
import { AddTransactionModal } from '../components/history/AddTransactionModal';
import { SeriesScopeModal, SeriesScope } from '../components/SeriesScopeModal';

const CATEGORIES = [
  'Salário', 'Moradia', 'Investimento', 'Cartão de Crédito',
  'Extra', 'Alimentação', 'Transporte', 'Lazer', 'Saúde',
  'Educação', 'Outros', 'Conciliação', 'Pagamentos', 'Transferência',
  'Mercado', 'Assinaturas', 'Farmácia', 'Restaurante', 'Vendas', 'Estorno'
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
      isInstallment: boolean;
      installmentsCount: number;
      isRecurring: boolean;
      recurrencePeriod: 'weekly' | 'monthly' | 'yearly' | 'biweekly' | 'custom';
      recurrenceDaysInterval: number;
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
  const [filterOwner, setFilterOwner] = useState<string>('ALL');
  const [owners, setOwners] = useState<string[]>(['Pessoal']);

  // Inline Editing
  const [editingRow, setEditingRow] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<any>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Modals
  const [payModal, setPayModal] = useState<PayModalState>({ open: false });
  const [addModal, setAddModal] = useState<AddModalState>({ open: false });

  // Series Scope Modal State
  const [seriesModal, setSeriesModal] = useState<{
    show: boolean;
    tx: Transaction | null;
    pendingAction: 'UPDATE' | 'DELETE';
    pendingPatch?: { field: string, value: any };
  }>({ show: false, tx: null, pendingAction: 'DELETE' });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!supabase) return;

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
      if (filterOwner !== 'ALL') query = query.eq('owner_name', filterOwner);

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      // Extract unique owners for the filter
      const uniqueOwners = ['Pessoal', ...new Set((data || []).map((t: any) => t.owner_name).filter(Boolean))];
      setOwners(uniqueOwners as string[]);

      setTransactions((data || []).map((t: any) => {
        // Marcamos como incompleto se faltar algum campo que agora consideramos essencial
        // mas que no passado podia ser nulo. Isso não trava o sistema, apenas informa a UI.
        const isIncomplete = !t.description || !t.account_name || !t.category || !t.owner_name;

        return {
          id: t.id,
          description: t.description ?? 'Sem descrição',
          amount: Number(t.amount || 0),
          date: t.date,
          type: t.type as TransactionType,
          accountId: t.account_id,
          accountName: t.account_name ?? 'Conta antiga',
          category: t.category ?? 'Outros',
          owner_name: t.owner_name ?? 'Pessoal',
          isDeleted: t.is_deleted,
          isReconciled: t.is_reconciled,
          isPaid: t.is_paid ?? false,
          paidAmount: Number(t.paid_amount ?? 0),
          paidAt: t.paid_at ?? undefined,
          parentId: t.parent_id ?? null,
          metadata: t.metadata ?? {},
          is_incomplete: isIncomplete
        };
      }));
    } catch (err) {
      setError('Erro ao carregar dados.');
    } finally {
      setIsLoading(false);
    }
  }, [filterType, filterAccount, filterCategory, startDate, endDate, minPrice, maxPrice, filterOwner]);

  useEffect(() => {
    if (isSupabaseConfigured) fetchData();
  }, [fetchData]);

  const handleUpdate = async (id: string, field: string, value: any, confirmedScope?: SeriesScope) => {
    if (!supabase) return;

    const tx = transactions.find(t => t.id === id);
    const isSeries = tx?.metadata?.installment_group_id || tx?.metadata?.recurrence_group_id;

    if (isSeries && !confirmedScope) {
      setSeriesModal({
        show: true,
        tx: tx || null,
        pendingAction: 'UPDATE',
        pendingPatch: { field, value }
      });
      return;
    }

    setSavingId(id);
    try {
      const patch: any = { [field]: value };
      if (field === 'account_id') {
        const acc = accounts.find(a => a.id === value);
        if (acc) patch.account_name = acc.institution;
      }

      if (!confirmedScope || confirmedScope === 'ONLY_THIS') {
        const { error: err } = await supabase.from('transactions').update(patch).eq('id', id);
        if (err) throw err;
      } else {
        const groupId = tx?.metadata?.installment_group_id || tx?.metadata?.recurrence_group_id;
        let query = supabase.from('transactions').update(patch).filter('metadata->>' + (tx?.metadata?.installment_group_id ? 'installment_group_id' : 'recurrence_group_id'), 'eq', groupId);
        if (confirmedScope === 'THIS_AND_FUTURE') query = query.gte('date', tx?.date);
        const { error: err } = await query;
        if (err) throw err;
      }

      if (tx && (HistoryUtils.getStatus(tx) !== 'PENDING') && (field === 'amount' || field === 'type' || field === 'account_id')) {
        await supabase.rpc('recalculate_account_balance', { p_account_id: field === 'account_id' ? value : tx.accountId });
        if (field === 'account_id' && tx.accountId !== value) await supabase.rpc('recalculate_account_balance', { p_account_id: tx.accountId });
      }

      await fetchData();
    } catch (err) {
      alert('Erro ao salvar alteração');
    } finally {
      setSavingId(null);
      setEditingRow(null);
      setSeriesModal({ show: false, tx: null, pendingAction: 'DELETE' });
    }
  };

  const handleDelete = async (id: string, confirmedScope?: SeriesScope) => {
    if (!supabase) return;

    const tx = transactions.find(t => t.id === id);
    const isSeries = tx?.metadata?.installment_group_id || tx?.metadata?.recurrence_group_id;

    if (isSeries && !confirmedScope) {
      setSeriesModal({ show: true, tx: tx || null, pendingAction: 'DELETE' });
      return;
    }

    if (!confirmedScope && !window.confirm('Excluir transação?')) return;

    try {
      if (!confirmedScope || confirmedScope === 'ONLY_THIS') {
        await supabase.from('transactions').update({ is_deleted: true }).eq('id', id);
      } else {
        const groupId = tx?.metadata?.installment_group_id || tx?.metadata?.recurrence_group_id;
        let query = supabase.from('transactions').update({ is_deleted: true }).filter('metadata->>' + (tx?.metadata?.installment_group_id ? 'installment_group_id' : 'recurrence_group_id'), 'eq', groupId);
        if (confirmedScope === 'THIS_AND_FUTURE') query = query.gte('date', tx?.date);
        const { error } = await query;
        if (error) throw error;
      }

      if (tx && HistoryUtils.getStatus(tx) !== 'PENDING') {
        await supabase.rpc('recalculate_account_balance', { p_account_id: tx.accountId });
      }

      await fetchData();
    } catch (err) {
      alert('Erro ao excluir');
    } finally {
      setSeriesModal({ show: false, tx: null, pendingAction: 'DELETE' });
    }
  };

  const resetFilters = () => {
    setFilterType('ALL'); setFilterAccount('ALL'); setFilterCategory('ALL');
    setStartDate(''); setEndDate(''); setMinPrice(''); setMaxPrice('');
    setSearch('');
    setFilterOwner('ALL');
  };

  const exportToXlsx = (format: 'xlsx' | 'csv') => {
    const rows = filtered.map(t => ({
      Data: DateUtils.formatDisplayDate(t.date),
      Descrição: t.description,
      Conta: t.accountName,
      Categoria: t.category,
      Entidade: t.owner_name || 'Pessoal',
      Tipo: t.type,
      Valor: (t.type === 'EXPENSE' ? -1 : 1) * t.amount,
      Status: HistoryUtils.getStatus(t)
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Histórico');
    if (format === 'xlsx') XLSX.writeFile(wb, `historico-${DateUtils.formatToISODate()}.xlsx`);
    else {
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `historico-${DateUtils.formatToISODate()}.csv`;
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
      const { error } = await supabase.rpc('pay_transaction', { p_transaction_id: payModal.tx.id, p_amount: amount, p_split_remainder: payModal.splitRemainder });
      if (error) {
        await supabase.from('transactions').update({
          is_paid: amount >= payModal.remaining - EPS,
          paid_amount: (payModal.tx.paidAmount || 0) + amount,
          paid_at: DateUtils.getNow().toISOString()
        }).eq('id', payModal.tx.id);
      }
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

      if (!f.isInstallment && !f.isRecurring) {
        await supabase.from('transactions').insert({
          user_id: user.id, date: f.date, description: f.description, amount, type: f.type,
          account_id: f.accountId, category: f.category, is_paid: false, paid_amount: 0
        });
      } else {
        const { TransactionSeriesUtils } = await import('../lib/transactionSeriesUtils');
        const series = TransactionSeriesUtils.generateSeries(
          { description: f.description, amount, category: f.category, accountId: f.accountId, type: f.type },
          { type: f.isInstallment ? 'INSTALLMENT' : 'RECURRING', count: f.installmentsCount, period: f.recurrencePeriod, daysInterval: f.recurrenceDaysInterval, startDate: f.date, totalAmount: f.isInstallment ? amount : undefined }
        );
        const groupId = crypto.randomUUID();
        const inserts = series.map(item => ({
          user_id: user.id, date: item.date, description: item.description, amount: item.amount, type: item.type, account_id: item.accountId, category: item.category, is_paid: false, paid_amount: 0,
          metadata: { ...(f.isInstallment ? { installment_group_id: groupId, installment_number: (item as any).installmentNumber, installment_total: f.installmentsCount } : { recurrence_group_id: groupId }) }
        }));
        const { error } = await supabase.from('transactions').insert(inserts);
        if (error) throw error;
      }
      setAddModal({ open: false });
      await fetchData();
    } catch (err) {
      setAddModal(prev => prev.open ? { ...prev, isSubmitting: false, error: 'Erro ao adicionar transação.' } : prev);
    }
  };

  const statusBadge = (t: Transaction) => {
    const s = HistoryUtils.getStatus(t);
    const base = "px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest border";
    if (s === 'PAID') return <span className={`${base} bg-emerald-50 text-emerald-600 border-emerald-100`}>PAGO</span>;
    if (s === 'PARTIAL') return <span className={`${base} bg-amber-50 text-amber-600 border-amber-100`}>PARCIAL</span>;
    return <span className={`${base} bg-slate-50 text-slate-400 border-slate-100`}>PENDENTE</span>;
  };

  const filtered = transactions.filter(t => t.description.toLowerCase().includes(search.toLowerCase()) || t.accountName.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-10 py-8 space-y-8 animate-in fade-in duration-500">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Histórico Financeiro</h1>
          <p className="text-sm text-slate-400 font-medium">Gestão detalhada e conciliação de lançamentos.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => setAddModal({
              open: true,
              isSubmitting: false,
              form: { date: DateUtils.formatToISODate(), description: '', type: 'EXPENSE', amount: '', accountId: accounts[0]?.id || '', category: 'Outros', isInstallment: false, installmentsCount: 2, isRecurring: false, recurrencePeriod: 'monthly', recurrenceDaysInterval: 30 }
            })}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform active:scale-95"
          >
            <Plus size={18} /> Novo Lançamento
          </button>
          <button onClick={() => exportToXlsx('xlsx')} className="p-3 bg-white border border-slate-100 text-slate-400 rounded-xl hover:text-slate-900 transition-all shadow-sm">
            <FileDown size={20} />
          </button>
        </div>
      </div>

      <HistoryFilters
        search={search} setSearch={setSearch} showFilters={showFilters} setShowFilters={setShowFilters}
        filterType={filterType} setFilterType={setFilterType} filterAccount={filterAccount} setFilterAccount={setFilterAccount}
        filterCategory={filterCategory} setFilterCategory={setFilterCategory} startDate={startDate} setStartDate={setStartDate}
        endDate={endDate} setEndDate={setEndDate} minPrice={minPrice} setMinPrice={setMinPrice} maxPrice={maxPrice} setMaxPrice={setMaxPrice}
        filterOwner={filterOwner} setFilterOwner={setFilterOwner} owners={owners}
        categories={CATEGORIES} accounts={accounts} resetFilters={resetFilters}
      />

      <TransactionTable
        transactions={filtered} isLoading={isLoading} accounts={accounts} categories={CATEGORIES}
        editingRow={editingRow} setEditingRow={setEditingRow} editValue={editValue} setEditValue={setEditValue}
        savingId={savingId} handleUpdate={handleUpdate} handleDelete={handleDelete} statusBadge={statusBadge}
        formatCurrency={HistoryUtils.formatCurrency} getAmount={HistoryUtils.getAmount} getPaidAmount={HistoryUtils.getPaidAmount}
        getRemaining={HistoryUtils.getRemaining} getStatus={HistoryUtils.getStatus} openPayModal={openPayModal}
        reopenTransaction={async (t) => {
          if (!supabase || !window.confirm('Deseja reabrir este lançamento?')) return;
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const isCardPayment = t.type === 'BILL_PAYMENT' || t.description.toLowerCase().includes('pagamento cartão');
            if (isCardPayment) {
              const statementId = (t as any).metadata?.statement_id;
              if (statementId) {
                const { data: stmCur } = await supabase.from('card_statements').select('paid_amount').eq('id', statementId).maybeSingle();
                if (stmCur) {
                  await supabase.from('card_statements').update({ status: 'OPEN', paid_amount: Math.max(0, Number(stmCur.paid_amount) - Math.abs(t.amount)) }).eq('id', statementId);
                }
              }
              await supabase.from('transactions').update({ is_deleted: true }).eq('id', t.id);
            } else {
              await supabase.from('transactions').update({ is_paid: false, paid_amount: 0, paid_at: null }).eq('id', t.id);
            }
            await supabase.rpc('recalculate_account_balance', { p_account_id: t.accountId });
            await fetchData();
          } catch (e) { console.error(e); alert('Erro ao reabrir'); }
        }}
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

      <SeriesScopeModal
        show={seriesModal.show} onClose={() => setSeriesModal({ show: false, tx: null, pendingAction: 'DELETE' })}
        onConfirm={(scope) => seriesModal.pendingAction === 'DELETE' ? handleDelete(seriesModal.tx!.id, scope) : handleUpdate(seriesModal.tx!.id, seriesModal.pendingPatch!.field, seriesModal.pendingPatch!.value, scope)}
        title={seriesModal.pendingAction === 'DELETE' ? 'Excluir Lançamento' : 'Editar Lançamento'}
        actionLabel={seriesModal.pendingAction === 'DELETE' ? 'Excluir' : 'Salvar'}
        type={seriesModal.tx?.metadata?.recurrence_group_id ? 'RECURRING' : 'INSTALLMENT'}
      />
    </div>
  );
};

export default HistoryPage;
