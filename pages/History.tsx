import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, FileDown, Loader2, AlertCircle, Check, RefreshCw, Calendar, Tag, Landmark, User, ArrowRight, Trash, X } from 'lucide-react';
import * as XLSX from 'xlsx';

import { Transaction, TransactionType, BankAccount } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { HistoryUtils, EPS } from '../lib/historyUtils';
import { DateUtils } from '../lib/dateUtils';
import { FinanceService } from '../services/finance.service';

// Modular Components
import { HistoryFilters } from '../components/history/HistoryFilters';
import { TransactionTable } from '../components/history/TransactionTable';
import { PaymentModal } from '../components/history/PaymentModal';
import { AddTransactionModal } from '../components/history/AddTransactionModal';
import { SeriesScopeModal, SeriesScope } from '../components/SeriesScopeModal';
import { HistoryCharts } from '../components/history/HistoryCharts';
import { ArrowDownRight, ArrowUpRight, Wallet } from 'lucide-react';

// Initial fallback categories
const DEFAULT_CATEGORIES = [
  'Alimentação', 'Assinaturas', 'Cartão de Crédito', 'Conciliação',
  'Educação', 'Estorno', 'Extra', 'Farmácia', 'Investimento',
  'Lazer', 'Mercado', 'Moradia', 'Outros', 'Pagamentos',
  'Restaurante', 'Salário', 'Saúde', 'Transporte', 'Vendas'
].sort();

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
      ownerName: string;
    };
  };

const HistoryPage: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [chartTransactions, setChartTransactions] = useState<Transaction[]>([]); // full set for charts (no pagination)
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [categoryObjects, setCategoryObjects] = useState<{ name: string, type?: 'INCOME' | 'EXPENSE' }[]>(DEFAULT_CATEGORIES.map(c => ({ name: c })));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'ALL' | 'SETTLED'>('ALL');

  // Pagination & Sorting
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const PAGE_SIZE = 500;

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterAccount, setFilterAccount] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string[]>([]);

  // (no longer used for pills, kept empty to avoid breaking HistoryCharts prop)
  const [selectedTimelineCategories] = useState<string[]>([]);
  const setSelectedTimelineCategories = (_v: any) => { };

  // Default to current month
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const [startDate, setStartDate] = useState<string>(DateUtils.formatToISODate(firstDay));
  const [endDate, setEndDate] = useState<string>(DateUtils.formatToISODate(lastDay));

  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [filterOwner, setFilterOwner] = useState<string>('ALL');
  const [owners, setOwners] = useState<string[]>(['Pessoal']);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const lastRequestId = useRef(0);

  // Selection & Bulk Edit
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDescription, setBulkDescription] = useState('');
  const [bulkAccount, setBulkAccount] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkOwner, setBulkOwner] = useState('');
  const [bulkCounterAccount, setBulkCounterAccount] = useState('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

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

  // Debounce search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const normalize = (str: string) => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  };

  const getAccentRegex = (s: string) => {
    if (!s) return '';
    // Escapar caracteres especiais de Regex
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const map: Record<string, string> = {
      'a': '[aáàãâä]', 'e': '[eéèêë]', 'i': '[iíìîï]', 'o': '[oóòõôö]', 'u': '[uúùûü]', 'c': '[cç]'
    };
    return escaped.toLowerCase().split('').map(c => map[c] || c).join('').replace(/\s+/g, '.*');
  };

  const fetchData = useCallback(async () => {
    const requestId = ++lastRequestId.current;
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

      const { data: catData, error: catErr } = await supabase.from('categories').select('name, type').eq('user_id', user.id).eq('is_archived', false).order('name');
      if (!catErr && catData) {
        const dbCategories = catData.map((c: any) => c.name);
        // Garantir nomes essenciais
        const essential = ['Outros', 'Conciliação'];
        const mergedCategories = Array.from(new Set([...DEFAULT_CATEGORIES, ...dbCategories, ...essential])).sort((a, b) => a.localeCompare(b));
        setAvailableCategories(mergedCategories);

        // Build the objects combining defaults + DB
        const catMap = new Map<string, { name: string, type?: 'INCOME' | 'EXPENSE' }>();
        DEFAULT_CATEGORIES.forEach((c: string) => catMap.set(c, { name: c })); // Default has no type
        catData.forEach((c: any) => catMap.set(c.name, c)); // DB might have type
        setCategoryObjects(Array.from(catMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
      }

      // ── Paginated query for the visible table ──
      let query: any = supabase.from('transactions').select('*', { count: 'exact' }).eq('user_id', user.id).eq('is_deleted', false).order(sortField, { ascending: sortDirection === 'asc' });
      if (sortField !== 'date') {
        query = query.order('date', { ascending: false }); // secondary sort fallback
      }
      if (filterType !== 'ALL') query = query.eq('type', filterType);
      if (filterAccount !== 'ALL') query = query.eq('account_id', filterAccount);
      if (filterCategory.length > 0) query = query.in('category', filterCategory);
      if (startDate) query = query.gte('date', startDate);
      if (endDate) query = query.lte('date', endDate);
      if (minPrice !== '') query = query.gte('amount', Number(minPrice));
      if (maxPrice !== '') query = query.lte('amount', Number(maxPrice));
      if (filterOwner !== 'ALL') query = query.eq('owner_name', filterOwner);

      // Global Search in DB (Server-side Regex for accent-insensitivity)
      if (debouncedSearch) {
        const pattern = getAccentRegex(debouncedSearch.trim());
        // IMPORTANT: No double quotes around the pattern for iregex in Postgrest strings
        query = query.or(`description.iregex.${pattern},account_name.iregex.${pattern},category.iregex.${pattern},owner_name.iregex.${pattern}`);
      }

      query = query.range(page * PAGE_SIZE, (page * PAGE_SIZE) + PAGE_SIZE);

      // ── Aggregation query for charts — same filters, no pagination, minimal columns ──
      let chartQuery: any = supabase.from('transactions')
        .select('id, date, type, amount, category, is_amortization, account_id, owner_name')
        .eq('user_id', user.id).eq('is_deleted', false)
        .order('date', { ascending: false });
      if (filterType !== 'ALL') chartQuery = chartQuery.eq('type', filterType);
      if (filterAccount !== 'ALL') chartQuery = chartQuery.eq('account_id', filterAccount);
      if (filterCategory.length > 0) chartQuery = chartQuery.in('category', filterCategory);
      if (startDate) chartQuery = chartQuery.gte('date', startDate);
      if (endDate) chartQuery = chartQuery.lte('date', endDate);
      if (minPrice !== '') chartQuery = chartQuery.gte('amount', Number(minPrice));
      if (maxPrice !== '') chartQuery = chartQuery.gte('amount', Number(maxPrice));
      if (filterOwner !== 'ALL') chartQuery = chartQuery.eq('owner_name', filterOwner);

      if (debouncedSearch) {
        const pattern = getAccentRegex(debouncedSearch.trim()).replace(/\s+/g, '.*');
        chartQuery = chartQuery.or(`description.iregex.${pattern},account_name.iregex.${pattern},category.iregex.${pattern},owner_name.iregex.${pattern}`);
      }

      const [{ data, count, error: fetchError }, { data: chartData }, dbEntities] = await Promise.all([
        query,
        chartQuery,
        FinanceService.getEntities()
      ]);
      if (requestId !== lastRequestId.current) return;
      if (fetchError) throw fetchError;
      setOwners(dbEntities);

      // Store chart transactions (minimal mapping, no pagination)
      setChartTransactions((chartData || []).map((t: any) => ({
        id: t.id,
        description: '',
        amount: Number(t.amount || 0),
        date: t.date,
        type: t.type as TransactionType,
        accountId: t.account_id,
        accountName: '',
        category: t.category ?? 'Outros',
        owner_name: t.owner_name ?? 'Pessoal',
        isDeleted: false,
        isReconciled: false,
        isPaid: false,
        paidAmount: 0,
        paidAt: undefined,
        parentId: null,
        metadata: {},
        is_amortization: t.is_amortization ?? false,
        is_incomplete: false
      })));

      if (count !== null) setTotalCount(count);

      let fetchedData = data || [];
      const hasMoreData = fetchedData.length > PAGE_SIZE;
      if (hasMoreData) fetchedData.pop();
      setHasMore(hasMoreData);

      setTransactions(fetchedData.map((t: any) => {
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
  }, [filterType, filterAccount, filterCategory, startDate, endDate, minPrice, maxPrice, filterOwner, page, sortField, sortDirection, debouncedSearch]);

  // Reset page to 0 when filters change
  useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
  }, [filterType, filterAccount, JSON.stringify(filterCategory), startDate, endDate, minPrice, maxPrice, filterOwner, sortField, sortDirection, debouncedSearch]);

  useEffect(() => {
    if (isSupabaseConfigured) fetchData();
    window.addEventListener('offline-sync-completed', fetchData);
    return () => window.removeEventListener('offline-sync-completed', fetchData);
  }, [fetchData]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc'); // Default to sorting descending when clicking a new field
    }
  };

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
      let patch: any = { [field]: value };

      // Handle metadata fields
      if (field === 'counter_account_id') {
        patch = {
          type: 'TRANSFER',
          metadata: { ...(tx?.metadata || {}), is_transfer: true, counter_account_id: value }
        };
      }

      if (field === 'account_id') {
        const acc = accounts.find(a => a.id === value);
        if (acc) patch.account_name = acc.institution;
      }
      if (field === 'owner_name' && value) {
        await FinanceService.ensureEntityExists(value);
      }

      if (!confirmedScope || confirmedScope === 'ONLY_THIS') {
        // Otimização de UI: atualiza a tela instantaneamente para não dar reload na tabela toda
        setTransactions(prev => prev.map(t => {
          if (t.id === id) {
            let updated = { ...t, [field]: value };
            if (field === 'counter_account_id') {
              updated = {
                ...t,
                type: 'TRANSFER' as TransactionType,
                metadata: { ...(t.metadata || {}), is_transfer: true, counter_account_id: value }
              };
            }
            if (field === 'account_id') {
              const acc = accounts.find(a => a.id === value);
              if (acc) updated.accountName = acc.institution;
            }
            return updated;
          }
          return t;
        }));

        const { error: err } = await supabase.from('transactions').update(patch).eq('id', id);
        if (err) {
          await fetchData(); // rollback visual em caso de erro no banco
          throw err;
        }
      } else {
        const groupId = tx?.metadata?.installment_group_id || tx?.metadata?.recurrence_group_id;
        let query = supabase.from('transactions').update(patch).filter('metadata->>' + (tx?.metadata?.installment_group_id ? 'installment_group_id' : 'recurrence_group_id'), 'eq', groupId);
        if (confirmedScope === 'THIS_AND_FUTURE') query = query.gte('date', tx?.date);
        const { error: err } = await query;
        if (err) throw err;

        // Reload completo só quando altera parcelas e assinaturas (múltiplas linhas)
        await fetchData();
      }

      if (tx && (HistoryUtils.getStatus(tx) !== 'PENDING') && (field === 'amount' || field === 'type' || field === 'account_id')) {
        await supabase.rpc('recalculate_account_balance', { p_account_id: field === 'account_id' ? value : tx.accountId });
        if (field === 'account_id' && tx.accountId !== value) await supabase.rpc('recalculate_account_balance', { p_account_id: tx.accountId });
      }
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
    setFilterType('ALL'); setFilterAccount('ALL'); setFilterCategory([]);
    setStartDate(DateUtils.formatToISODate(firstDay));
    setEndDate(DateUtils.formatToISODate(lastDay));
    setMinPrice(''); setMaxPrice(''); setFilterOwner('ALL');
    setSearch('');
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(transactions.map(t => t.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleBulkUpdate = async () => {
    if (selectedIds.size === 0 || !supabase) return;
    if (!bulkDescription && !bulkAccount && !bulkCategory && !bulkOwner) {
      return alert("Preencha ao menos um campo para editar em lote.");
    }

    if (!window.confirm(`Deseja atualizar ${selectedIds.size} lançamentos?`)) return;

    setIsBulkUpdating(true);
    try {
      const patch: any = {};
      if (bulkDescription) patch.description = bulkDescription;
      if (bulkAccount) {
        const acc = accounts.find(a => a.id === bulkAccount);
        if (acc) {
          patch.account_id = bulkAccount;
          patch.account_name = acc.institution;
        }
      }
      if (bulkCategory) patch.category = bulkCategory;
      if (bulkOwner) patch.owner_name = bulkOwner;

      const ids = Array.from(selectedIds);

      const isTransfer = bulkCategory.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer');

      if (isTransfer && bulkCounterAccount) {
        patch.type = 'TRANSFER';
        for (const id of ids) {
          const tx = transactions.find(t => t.id === id);
          const currentMetadata = tx?.metadata || {};
          await supabase.from('transactions').update({
            ...patch,
            metadata: {
              ...currentMetadata,
              is_transfer: true,
              counter_account_id: bulkCounterAccount
            }
          }).eq('id', id);
        }
      } else {
        const { error: err } = await supabase.from('transactions').update(patch).in('id', ids);
        if (err) throw err;
      }

      await fetchData();
      setSelectedIds(new Set());
      setBulkDescription(''); setBulkAccount(''); setBulkCategory(''); setBulkOwner(''); setBulkCounterAccount('');
      alert("Lote atualizado com sucesso!");
    } catch (err) {
      alert("Erro ao atualizar lote");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !supabase) return;
    if (!window.confirm(`Excluir ${selectedIds.size} lançamentos permanentemente?`)) return;

    setIsBulkUpdating(true);
    try {
      const ids = Array.from(selectedIds);
      const { error: err } = await supabase.from('transactions').update({ is_deleted: true }).in('id', ids);
      if (err) throw err;

      await fetchData();
      setSelectedIds(new Set());
      alert("Lançamentos excluídos com sucesso!");
    } catch (err) {
      alert("Erro ao excluir lote");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const exportToXlsx = (format: 'xlsx' | 'csv') => {
    const rows = transactions.map(t => ({
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
          account_id: f.accountId, category: f.category, is_paid: false, paid_amount: 0,
          owner_name: f.ownerName === 'Pessoal' ? null : f.ownerName
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
          owner_name: f.ownerName === 'Pessoal' ? null : f.ownerName,
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

  const viewFiltered = viewMode === 'SETTLED'
    ? transactions.filter(t => HistoryUtils.getStatus(t) === 'PAID')
    : transactions;

  const chartViewFiltered = viewMode === 'SETTLED'
    ? chartTransactions.filter(t => HistoryUtils.getStatus(t) === 'PAID')
    : chartTransactions;

  const handleCreateCategory = async (name: string, type: 'INCOME' | 'EXPENSE') => {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('categories').insert({ user_id: user.id, name, type, color: 'bg-brand-50 text-brand-600' });
      await fetchData(); // Refetch the list
    } catch (err) { alert('Erro ao criar categoria inline'); }
  };

  // Summary Calculations based on chartViewFiltered (respects 'Pagos & Recebidos' toggle)
  const summary = chartViewFiltered.reduce((acc, t) => {
    if (t.is_amortization || t.type === 'TRANSFER') return acc;
    if (t.type === 'INCOME') acc.income += Number(t.amount);
    else if (t.type === 'EXPENSE' || t.type === 'BILL_PAYMENT') acc.expense += Math.abs(Number(t.amount));
    return acc;
  }, { income: 0, expense: 0 });
  const balance = summary.income - summary.expense;

  const setDatePreset = (days: number | 'MONTH' | 'ALL') => {
    const d = new Date();
    if (days === 'ALL') {
      setStartDate('');
      setEndDate('');
    } else if (days === 'MONTH') {
      setStartDate(DateUtils.formatToISODate(new Date(d.getFullYear(), d.getMonth(), 1)));
      setEndDate(DateUtils.formatToISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
    } else {
      const start = new Date(d);
      start.setDate(d.getDate() - days);
      setStartDate(DateUtils.formatToISODate(start));
      setEndDate(DateUtils.formatToISODate(d));
    }
    setPage(0);
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 animate-in fade-in duration-500 min-w-0">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Histórico Financeiro</h1>
          <p className="text-sm text-slate-400 font-medium">Gestão detalhada e conciliação de lançamentos.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={fetchData}
            className="p-3 bg-white border border-slate-100 text-slate-400 rounded-xl hover:text-brand-600 transition-all shadow-sm"
            title="Recarregar Dados"
          >
            <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setAddModal({
              open: true,
              isSubmitting: false,
              form: { date: DateUtils.formatToISODate(), description: '', type: 'EXPENSE', amount: '', accountId: accounts[0]?.id || '', category: 'Outros', ownerName: 'Pessoal', isInstallment: false, installmentsCount: 2, isRecurring: false, recurrencePeriod: 'monthly', recurrenceDaysInterval: 30 }
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

      {/* BARRA DE EDIÇÃO EM LOTE - Estilo Conciliação (AGORA NO TOPO PARA VISIBILIDADE) */}
      {selectedIds.size > 0 && (
        <div className="sticky top-4 z-[100] flex flex-wrap items-center gap-3 p-4 bg-slate-900 rounded-[30px] shadow-2xl animate-in fade-in slide-in-from-top-4 duration-500 border border-slate-800 mb-6">
          <div className="flex items-center gap-3 px-4 border-r border-slate-700 mr-2">
            <div className="w-8 h-8 bg-brand-500 rounded-full flex items-center justify-center text-white text-xs font-black">
              {selectedIds.size}
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Selecionados</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 flex-1">
            <input
              type="text"
              value={bulkDescription}
              onChange={(e) => setBulkDescription(e.target.value)}
              placeholder="Nova Descrição..."
              className="bg-slate-800 text-white text-[10px] font-bold uppercase py-2.5 px-4 rounded-xl outline-none focus:ring-2 focus:ring-brand-500/50 w-full md:w-48 placeholder:text-slate-500"
            />

            <div className="relative w-full md:w-44">
              <Landmark size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                value={bulkAccount}
                onChange={(e) => setBulkAccount(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-800 text-white text-[10px] font-bold uppercase rounded-xl outline-none focus:ring-2 focus:ring-brand-500/50 appearance-none cursor-pointer"
              >
                <option value="">Trocar Conta...</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.institution}</option>
                ))}
              </select>
            </div>

            <div className="relative w-full md:w-44">
              <Tag size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-800 text-white text-[10px] font-bold uppercase rounded-xl outline-none focus:ring-2 focus:ring-brand-500/50 appearance-none cursor-pointer"
              >
                <option value="">Trocar Categoria...</option>
                {availableCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="relative w-full md:w-44">
              <User size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                value={bulkOwner}
                onChange={(e) => setBulkOwner(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-800 text-white text-[10px] font-bold uppercase rounded-xl outline-none focus:ring-2 focus:ring-brand-500/50 appearance-none cursor-pointer"
              >
                <option value="">Trocar Entidade...</option>
                {owners.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            {bulkCategory.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer') && (
              <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-300">
                <ArrowRight size={14} className="text-brand-400" />
                <div className="relative w-full md:w-44">
                  <Landmark size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <select
                    value={bulkCounterAccount}
                    onChange={(e) => setBulkCounterAccount(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-800 text-brand-400 border border-brand-500/30 text-[10px] font-bold uppercase rounded-xl outline-none focus:ring-2 focus:ring-brand-500/50 appearance-none cursor-pointer"
                  >
                    <option value="">Destino Transf...</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.institution}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleBulkUpdate}
              disabled={isBulkUpdating}
              className="flex items-center gap-2 px-6 py-2.5 bg-brand-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-brand-500 transition-all active:scale-95 disabled:opacity-50"
            >
              {isBulkUpdating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Aplicar Lote
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={isBulkUpdating}
              className="p-2.5 bg-slate-800 text-slate-500 rounded-xl hover:bg-rose-600 hover:text-white transition-all active:scale-95"
              title="Excluir Lote"
            >
              <Trash size={14} />
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="p-2.5 bg-slate-800 text-slate-500 rounded-xl hover:bg-slate-700 transition-all"
              title="Limpar Seleção"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <HistoryFilters
        search={search} setSearch={setSearch} showFilters={showFilters} setShowFilters={setShowFilters}
        filterType={filterType} setFilterType={setFilterType} filterAccount={filterAccount} setFilterAccount={setFilterAccount}
        filterCategory={filterCategory} setFilterCategory={setFilterCategory} startDate={startDate} setStartDate={setStartDate}
        endDate={endDate} setEndDate={setEndDate} minPrice={minPrice} setMinPrice={setMinPrice} maxPrice={maxPrice} setMaxPrice={setMaxPrice}
        filterOwner={filterOwner} setFilterOwner={setFilterOwner} owners={owners}
        categories={availableCategories} accounts={accounts} resetFilters={resetFilters}
      />

      {/* QUICK DATE FILTERS + CUSTOM RANGE + VIEW MODE TOGGLE */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
        {/* Date presets */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setDatePreset('MONTH')} className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${startDate === DateUtils.formatToISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>Este Mês</button>
          <button onClick={() => setDatePreset(30)} className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all bg-slate-50 text-slate-500 hover:bg-slate-100`}>30 Dias</button>
          <button onClick={() => setDatePreset(90)} className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all bg-slate-50 text-slate-500 hover:bg-slate-100`}>3 Meses</button>
          <button onClick={() => setDatePreset('ALL')} className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${!startDate && !endDate ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>Tudo</button>
        </div>

        {/* Custom Range picker always visible */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100">
          <Calendar size={14} className="text-slate-400" />
          <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(0); }} className="bg-transparent text-[11px] font-bold outline-none w-28" />
          <span className="text-slate-300">/</span>
          <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(0); }} className="bg-transparent text-[11px] font-bold outline-none w-28" />
        </div>

        {/* Spacer */}
        <div className="hidden lg:block flex-1" />

        {/* View mode toggle */}
        <div className="flex bg-slate-100 p-1 rounded-xl gap-1 w-full lg:w-auto">
          <button
            onClick={() => setViewMode('ALL')}
            className={`flex-1 lg:flex-none px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${viewMode === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Todos os Lançamentos
          </button>
          <button
            onClick={() => setViewMode('SETTLED')}
            className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${viewMode === 'SETTLED' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Check size={12} /> Pagos & Recebidos
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Receitas</p>
            <h3 className="text-xl font-bold text-emerald-500">{HistoryUtils.formatCurrency(summary.income)}</h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
            <ArrowUpRight size={20} />
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Despesas</p>
            <h3 className="text-xl font-bold text-rose-500">{HistoryUtils.formatCurrency(-summary.expense)}</h3>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center">
            <ArrowDownRight size={20} />
          </div>
        </div>
        <div className={`bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between ${balance >= 0 ? 'border-b-4 border-b-emerald-500' : 'border-b-4 border-b-rose-500'}`}>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Balanço do Período</p>
            <h3 className={`text-xl font-bold ${balance >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{HistoryUtils.formatCurrency(balance)}</h3>
          </div>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${balance >= 0 ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'}`}>
            <Wallet size={20} />
          </div>
        </div>
      </div>

      <HistoryCharts
        transactions={chartViewFiltered}
        selectedTimelineCategories={selectedTimelineCategories}
        setSelectedTimelineCategories={setSelectedTimelineCategories}
        startDate={startDate}
        endDate={endDate}
      />

      <div />

      <TransactionTable
        transactions={viewFiltered} isLoading={isLoading} accounts={accounts}
        categoryObjects={categoryObjects} onCreateCategory={handleCreateCategory}
        editingRow={editingRow} setEditingRow={setEditingRow} editValue={editValue} setEditValue={setEditValue}
        savingId={savingId} handleUpdate={handleUpdate} handleDelete={handleDelete} statusBadge={statusBadge}
        sortField={sortField} sortDirection={sortDirection} onSort={handleSort}
        formatCurrency={HistoryUtils.formatCurrency} getAmount={HistoryUtils.getAmount} getPaidAmount={HistoryUtils.getPaidAmount}
        getRemaining={HistoryUtils.getRemaining} getStatus={HistoryUtils.getStatus} openPayModal={openPayModal}
        owners={owners}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onSelectAll={handleSelectAll}
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

      {/* PAGINATION CONTROLS */}
      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between px-6 py-4 bg-white border border-slate-100 rounded-[24px] shadow-sm overflow-x-auto gap-4">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0 || isLoading}
            className="px-6 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors shrink-0"
          >
            Anterior
          </button>

          <div className="flex items-center gap-2">
            {Array.from({ length: Math.ceil(totalCount / PAGE_SIZE) }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-10 h-10 rounded-xl text-sm font-bold flex items-center justify-center transition-all shrink-0 ${page === i
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <button
            onClick={() => setPage(p => p + 1)}
            disabled={!hasMore || isLoading}
            className="px-6 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors shrink-0"
          >
            Próxima
          </button>
        </div>
      )}

      <PaymentModal show={payModal.open} onClose={() => setPayModal({ open: false })} onSubmit={submitPayment}
        tx={payModal.open ? payModal.tx : null} remaining={payModal.open ? payModal.remaining : 0}
        payAmount={payModal.open ? payModal.payAmount : ''} setPayAmount={(v) => setPayModal(prev => prev.open ? { ...prev, payAmount: v } : prev)}
        splitRemainder={payModal.open ? payModal.splitRemainder : false} setSplitRemainder={(v) => setPayModal(prev => prev.open ? { ...prev, splitRemainder: v } : prev)}
        isSubmitting={payModal.open ? payModal.isSubmitting : false} error={payModal.open ? payModal.error : null} formatCurrency={HistoryUtils.formatCurrency}
      />

      <AddTransactionModal show={addModal.open} onClose={() => setAddModal({ open: false })} onSubmit={createManualTransaction}
        isSubmitting={addModal.open ? addModal.isSubmitting : false} error={addModal.open ? addModal.error : null}
        form={addModal.open ? addModal.form : {} as any} setAddField={(f, v) => setAddModal(prev => prev.open ? { ...prev, form: { ...prev.form, [f]: v } } : prev)}
        accounts={accounts} owners={owners} categoryObjects={categoryObjects} onCreateCategory={handleCreateCategory}
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
