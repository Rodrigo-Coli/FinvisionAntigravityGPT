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
        parentId: t.parent_id ?? null,
        metadata: t.metadata ?? {}
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
        // Lógica de série
        const groupId = tx?.metadata?.installment_group_id || tx?.metadata?.recurrence_group_id;
        const groupField = tx?.metadata?.installment_group_id ? 'metadata->>installment_group_id' : 'metadata->>recurrence_group_id';

        let query = supabase.from('transactions').update(patch).filter('metadata->>' + (tx?.metadata?.installment_group_id ? 'installment_group_id' : 'recurrence_group_id'), 'eq', groupId);

        if (confirmedScope === 'THIS_AND_FUTURE') {
          query = query.gte('date', tx?.date);
        }

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
      setSeriesModal({
        show: true,
        tx: tx || null,
        pendingAction: 'DELETE'
      });
      return;
    }

    if (!confirmedScope && !window.confirm('Excluir transação?')) return;

    try {
      if (!confirmedScope || confirmedScope === 'ONLY_THIS') {
        await supabase.from('transactions').update({ is_deleted: true }).eq('id', id);
      } else {
        const groupId = tx?.metadata?.installment_group_id || tx?.metadata?.recurrence_group_id;
        let query = supabase.from('transactions').update({ is_deleted: true }).filter('metadata->>' + (tx?.metadata?.installment_group_id ? 'installment_group_id' : 'recurrence_group_id'), 'eq', groupId);

        if (confirmedScope === 'THIS_AND_FUTURE') {
          query = query.gte('date', tx?.date);
        }

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
  };

  const exportToXlsx = (format: 'xlsx' | 'csv') => {
    const rows = filtered.map(t => ({
      Data: DateUtils.formatDisplayDate(t.date),
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
        // Fallback direto se o RPC falhar
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
        // Simple insertion
        await supabase.from('transactions').insert({
          user_id: user.id, date: f.date, description: f.description, amount, type: f.type,
          account_id: f.accountId, category: f.category, is_paid: false, paid_amount: 0
        });
      } else {
        const { TransactionSeriesUtils } = await import('../lib/transactionSeriesUtils');
        const series = TransactionSeriesUtils.generateSeries(
          {
            description: f.description,
            amount: amount,
            category: f.category,
            accountId: f.accountId,
            type: f.type
          },
          {
            type: f.isInstallment ? 'INSTALLMENT' : 'RECURRING',
            count: f.installmentsCount,
            period: f.recurrencePeriod,
            daysInterval: f.recurrenceDaysInterval,
            startDate: f.date,
            totalAmount: f.isInstallment ? amount : undefined
          }
        );

        const groupId = crypto.randomUUID();
        const inserts = series.map(item => ({
          user_id: user.id,
          date: item.date,
          description: item.description,
          amount: item.amount,
          type: item.type,
          account_id: item.accountId,
          category: item.category,
          is_paid: false,
          paid_amount: 0,
          metadata: {
            ...(f.isInstallment ? { installment_group_id: groupId, installment_number: (item as any).installmentNumber, installment_total: f.installmentsCount } : { recurrence_group_id: groupId })
          }
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
    const base = "px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border";
    if (s === 'PAID') return <span className={`${base} bg-emerald-50 text-emerald-700 border-emerald-100`}>PAGO</span>;
    if (s === 'PARTIAL') return <span className={`${base} bg-amber-50 text-amber-700 border-amber-100`}>PARCIAL</span>;
    return <span className={`${base} bg-slate-50 text-slate-500 border-slate-100`}>PENDENTE</span>;
  };

  const filtered = transactions.filter(t => t.description.toLowerCase().includes(search.toLowerCase()) || t.accountName.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="w-full flex justify-center py-6 sm:py-10 px-4 sm:px-6 lg:px-8 animate-in fade-in duration-700">
      <div className="inline-block min-w-min max-w-full space-y-8 sm:space-y-10">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-3xl sm:text-4xl font-display font-black text-slate-900 tracking-tight dark:text-white">
              Histórico <span className="text-brand-600 italic">Financeiro</span>
            </h1>
            <p className="text-slate-500 font-medium text-base sm:text-lg">Gestão detalhada e conciliação de lançamentos</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button onClick={() => setAddModal({
              open: true,
              isSubmitting: false,
              form: {
                date: DateUtils.formatToISODate(),
                description: '',
                type: 'EXPENSE',
                amount: '',
                accountId: accounts[0]?.id || '',
                category: 'Outros',
                isInstallment: false,
                installmentsCount: 2,
                isRecurring: false,
                recurrencePeriod: 'monthly',
                recurrenceDaysInterval: 30
              }
            })}
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
          reopenTransaction={async (t) => {
            if (!supabase || !window.confirm('Deseja reabrir este lançamento? O saldo da conta será atualizado e o lançamento ficará pendente de pagamento novamente.')) return;
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;

              // 1. Se for pagamento de cartão, tentar reabrir a fatura
              const isCardPayment = t.type === 'BILL_PAYMENT' || t.description.toLowerCase().includes('pagamento cartão');

              if (isCardPayment) {
                const statementId = (t as any).metadata?.statement_id;
                let targetId = statementId;
                if (!targetId) {
                  // Busca por aproximação: busca o cartão e depois o statement que tenha pagamentos ou seja o mais recente
                  const { data: card } = await supabase.from('cards').select('id').ilike('name', `%${t.description.split(':').pop()?.trim()}%`).limit(1);
                  if (card?.[0]) {
                    // Tenta primeiro um statement que tenha algum valor pago (provavelmente o que estamos reabrindo)
                    const { data: stmCandidate } = await supabase.from('card_statements')
                      .select('id')
                      .eq('card_id', card[0].id)
                      .gt('paid_amount', 0)
                      .order('due_date', { ascending: false })
                      .limit(1);

                    if (stmCandidate?.[0]) {
                      targetId = stmCandidate[0].id;
                    } else {
                      // Fallback para o mais recente se nenhum tiver pagamento
                      const { data: stmLast } = await supabase.from('card_statements')
                        .select('id')
                        .eq('card_id', card[0].id)
                        .order('due_date', { ascending: false })
                        .limit(1);
                      if (stmLast?.[0]) targetId = stmLast[0].id;
                    }
                  }
                }

                if (targetId) {
                  const { data: stmCur, error: fetchErr } = await supabase.from('card_statements').select('paid_amount, total_amount').eq('id', targetId).maybeSingle();
                  if (stmCur && !fetchErr) {
                    const txAmount = Math.abs(t.amount || 0);
                    const currentPaid = Number(stmCur.paid_amount || 0);
                    const newPaid = Math.max(0, currentPaid - txAmount);

                    const { error: updErr } = await supabase.from('card_statements').update({
                      status: 'OPEN',
                      paid_amount: newPaid
                    }).eq('id', targetId);

                    if (updErr) console.error('Erro ao atualizar fatura:', updErr);
                  }
                }
              }

              // 2. Se veio de conciliação, restaurar na fila
              const importedId = (t as any).metadata?.imported_transaction_id;
              if (importedId) {
                await supabase.from('imported_transactions').update({ status: 'READY_TO_RECONCILE' }).eq('id', importedId);
              }

              // 3. Diferenciar lógica de saída do histórico
              if (isCardPayment) {
                // Pagamentos de cartão são deletados para permitir novo pagamento com valor atualizado
                const { error } = await supabase.from('transactions').update({ is_deleted: true }).eq('id', t.id);
                if (error) throw error;
              } else {
                // Outras transações permanecem no histórico mas voltam a ficar pendentes
                const { error } = await supabase.from('transactions').update({
                  is_paid: false,
                  paid_amount: 0,
                  paid_at: null
                }).eq('id', t.id);
                if (error) throw error;
              }

              // 4. Forçar recálculo do saldo
              await supabase.rpc('recalculate_account_balance', { p_account_id: t.accountId });

              await fetchData();
            } catch (e) {
              console.error(e);
              alert('Erro ao reabrir transação');
            }
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
          show={seriesModal.show}
          onClose={() => setSeriesModal({ show: false, tx: null, pendingAction: 'DELETE' })}
          onConfirm={(scope) => {
            if (seriesModal.pendingAction === 'DELETE') {
              handleDelete(seriesModal.tx!.id, scope);
            } else {
              handleUpdate(seriesModal.tx!.id, seriesModal.pendingPatch!.field, seriesModal.pendingPatch!.value, scope);
            }
          }}
          title={seriesModal.pendingAction === 'DELETE' ? 'Excluir Lançamento' : 'Editar Lançamento'}
          actionLabel={seriesModal.pendingAction === 'DELETE' ? 'Excluir' : 'Salvar'}
          type={seriesModal.tx?.metadata?.recurrence_group_id ? 'RECURRING' : 'INSTALLMENT'}
        />
      </div>
    </div>
  );
};

export default HistoryPage;
