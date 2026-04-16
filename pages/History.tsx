import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, FileDown, Loader2, AlertCircle, Check, RefreshCw, Calendar, Tag, Landmark, User, ArrowRight, Trash, X, Sparkles } from 'lucide-react';
import * as XLSX from 'xlsx';

import { Transaction, TransactionType, BankAccount } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { offlineQueue } from '../lib/offlineQueue.service';
import { HistoryUtils, EPS } from '../lib/historyUtils';
import { DateUtils } from '../lib/dateUtils';
import { FinanceService } from '../services/finance.service';
import { ReconciliationService } from '../services/reconciliation.service';

// Modular Components
import { HistoryFilters } from '../components/history/HistoryFilters';
import { TransactionTable } from '../components/history/TransactionTable';
import { PaymentModal } from '../components/history/PaymentModal';
import { AddTransactionModal } from '../components/history/AddTransactionModal';
import { SeriesScopeModal, SeriesScope } from '../components/SeriesScopeModal';
import { HistoryCharts } from '../components/history/HistoryCharts';
import { DreReportModal } from '../components/history/DreReportModal';
import { DreUtils, DreReport } from '../lib/dreUtils';
import ContextualHelp from '../components/ContextualHelp';
import { ArrowDownRight, ArrowUpRight, Wallet, Building2 } from 'lucide-react';

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
      subcategory: string;
      isInstallment: boolean;
      installmentsCount: number;
      isRecurring: boolean;
      recurrencePeriod: 'weekly' | 'monthly' | 'yearly' | 'biweekly' | 'custom';
      recurrenceDaysInterval: number;
      ownerName: string;
      destinationAccountId?: string;
      documentId?: string;
      files?: File[];
    };
  };

const HistoryPage: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [chartTransactions, setChartTransactions] = useState<Transaction[]>([]); // full set for charts (no pagination)
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [categoryObjects, setCategoryObjects] = useState<{ name: string, type?: 'INCOME' | 'EXPENSE' }[]>(DEFAULT_CATEGORIES.map(c => ({ name: c })));
  const [subcategories, setSubcategories] = useState<{ id: string; name: string; category_name?: string }[]>([]);
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
  const [showDreModal, setShowDreModal] = useState(false);
  const [dreReport, setDreReport] = useState<DreReport | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterAccount, setFilterAccount] = useState<string[]>([]);
  const [filterCategory, setFilterCategory] = useState<string[]>([]);
  const [filterSubcategory, setFilterSubcategory] = useState<string[]>([]);
  const [filterOwner, setFilterOwner] = useState<string[]>([]);

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
  const [owners, setOwners] = useState<string[]>(['Pessoal']);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const lastRequestId = useRef(0);

  // Selection & Bulk Edit
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDescription, setBulkDescription] = useState('');
  const [bulkAccount, setBulkAccount] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkSubcategory, setBulkSubcategory] = useState('');
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

  const location = useLocation();
  const navigate = useNavigate();

  // Read initial category or account from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const cat = params.get('category');
    const acc = params.get('account');

    let hasChanged = false;
    if (cat) {
      setFilterCategory([cat]);
      hasChanged = true;
    }

    if (acc) {
      setFilterAccount([acc]);
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
      setStartDate(DateUtils.formatToISODate(tenYearsAgo));
      setEndDate(DateUtils.formatToISODate(new Date()));
      hasChanged = true;
    }

    if (hasChanged) {
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash.split('?')[0]);
    }
  }, [location.search]);

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

  // Build ilike pattern from search text for Supabase queries
  // Generates accent variants so 'mae' matches 'mãe'
  const buildSearchFilter = (s: string): string => {
    if (!s) return '';
    const term = s.trim();
    if (!term) return '';

    // Generate accent variant of the search term
    const accentMap: Record<string, string[]> = {
      'a': ['a', 'á', 'à', 'ã', 'â', 'ä'], 'e': ['e', 'é', 'è', 'ê', 'ë'],
      'i': ['i', 'í', 'ì', 'î', 'ï'], 'o': ['o', 'ó', 'ò', 'õ', 'ô', 'ö'],
      'u': ['u', 'ú', 'ù', 'û', 'ü'], 'c': ['c', 'ç']
    };

    // Generate the accented version of the term
    const generateVariants = (text: string): string[] => {
      const lower = text.toLowerCase();
      const variants = new Set<string>([`%${lower}%`]);

      // For each character that has accent variants, generate the accented version
      let accented = '';
      for (const ch of lower) {
        const alternatives = accentMap[ch];
        if (alternatives && alternatives.length > 1) {
          // Add the most common accent for this character
          accented += alternatives[1]; // e.g., 'a' -> 'á'
        } else {
          accented += ch;
        }
      }
      if (accented !== lower) variants.add(`%${accented}%`);

      // Also try common Portuguese accent patterns
      const ptVariants: Record<string, string> = {
        'mae': 'mãe', 'cao': 'cão', 'nao': 'não', 'sao': 'são',
        'acai': 'açaí', 'cafe': 'café', 'voce': 'você',
        'transferencia': 'transferência', 'servico': 'serviço',
        'alimentacao': 'alimentação', 'educacao': 'educação',
        'habitacao': 'habitação', 'prestacao': 'prestação',
        'assinatura': 'assinatura', 'moradia': 'moradia'
      };
      const ptMatch = ptVariants[lower];
      if (ptMatch) variants.add(`%${ptMatch}%`);

      return Array.from(variants);
    };

    const patterns = generateVariants(term);
    const fields = ['description', 'account_name', 'category', 'owner_name'];
    const clauses: string[] = [];

    for (const pattern of patterns) {
      for (const field of fields) {
        clauses.push(`${field}.ilike.${pattern}`);
      }
    }

    return clauses.join(',');
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
      })).sort((a: any, b: any) => a.institution.localeCompare(b.institution)));

      const { data: catData, error: catErr } = await supabase.from('categories').select('id, name, type').eq('user_id', user.id).eq('is_archived', false).order('name');

      let subData: any[] = [];
      try {
        const { data: sData } = await supabase.from('subcategories').select('*').eq('user_id', user.id).order('name');
        subData = sData || [];
      } catch (e) {
        console.warn("Subcategories table not found", e);
      }

      if (!catErr && catData) {
        const mappedSubcats = subData.map(sub => {
          const parentCat = catData.find((c: any) => c.id === sub.category_id);
          return { ...sub, category_name: parentCat?.name };
        });
        setSubcategories(mappedSubcats);

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
      // Default sorting: if sorting by amount, use our database view or raw columns
      let query: any = supabase.from('transactions').select('*, attachments:documents!documents_transaction_id_fkey(*)', { count: 'exact' }).eq('user_id', user.id).eq('is_deleted', false);

      // We handle 'amount' sorting specially in JS if it can't be done perfectly in Supabase 
      // but Postgrest doesn't let us sort by calculated case when statement without a RPC or View.
      // So if 'amount' is sorted, we'll sort the DB normally and then refine it in memory if needed, 
      // or we can sort by 'amount' directly (Note: amount in DB is usually stored absolute).
      query = query.order(sortField, { ascending: sortDirection === 'asc' });

      if (sortField !== 'date') {
        query = query.order('date', { ascending: false }); // secondary sort fallback
      }
      if (filterType !== 'ALL') query = query.eq('type', filterType);
      if (filterAccount.length > 0) query = query.in('account_id', filterAccount);
      if (filterCategory.length > 0) query = query.in('category', filterCategory);
      if (filterSubcategory.length > 0) query = query.in('subcategory', filterSubcategory);
      const todayRaw = new Date();
      const sixtyDaysAhead = new Date(todayRaw.getFullYear(), todayRaw.getMonth(), todayRaw.getDate() + 60);
      const futureLimit = sixtyDaysAhead.toISOString().split('T')[0];

      if (startDate && endDate) {
        // Broaden query to include future provisions, then filter in JS if needed or use complex OR
        // For simplicity and pagination, we expand the range slightly for provisions
        query = query.or(`and(date.gte.${startDate},date.lte.${endDate}),and(metadata->>is_provision.eq.true,date.gte.${startDate},date.lte.${futureLimit})`);
      } else {
        if (startDate) query = query.gte('date', startDate);
        if (endDate) query = query.lte('date', endDate);
      }
      if (filterOwner.length > 0) query = query.in('owner_name', filterOwner);

      // Global Search: use ilike for reliable Supabase/PostgREST compatibility
      if (debouncedSearch) {
        const filterClause = buildSearchFilter(debouncedSearch);
        if (filterClause) query = query.or(filterClause);
      }

      query = query.range(page * PAGE_SIZE, (page * PAGE_SIZE) + PAGE_SIZE);

      // ── Aggregation query for charts — same filters, no pagination, minimal columns ──
      let chartQuery: any = supabase.from('transactions')
        .select('id, date, type, amount, category, subcategory, is_amortization, account_id, owner_name, description, is_paid, paid_amount, attachments:documents!documents_transaction_id_fkey(*)')
        .eq('user_id', user.id).eq('is_deleted', false)
        .order('date', { ascending: false });
      if (filterType !== 'ALL') chartQuery = chartQuery.eq('type', filterType);
      if (filterAccount.length > 0) chartQuery = chartQuery.in('account_id', filterAccount);
      if (filterCategory.length > 0) chartQuery = chartQuery.in('category', filterCategory);
      if (filterSubcategory.length > 0) chartQuery = chartQuery.in('subcategory', filterSubcategory);
      if (startDate && endDate) {
        chartQuery = chartQuery.or(`and(date.gte.${startDate},date.lte.${endDate}),and(metadata->>is_provision.eq.true,date.gte.${startDate},date.lte.${futureLimit})`);
      } else {
        if (startDate) chartQuery = chartQuery.gte('date', startDate);
        if (endDate) chartQuery = chartQuery.lte('date', endDate);
      }
      if (filterOwner.length > 0) chartQuery = chartQuery.in('owner_name', filterOwner);

      if (debouncedSearch) {
        const filterClause = buildSearchFilter(debouncedSearch);
        if (filterClause) chartQuery = chartQuery.or(filterClause);
      }

      // NEW: Additional query for card transactions for the charts
      let cardChartQuery: any = supabase.from('card_transactions')
        .select('id, date, amount, description, categories(name)')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (startDate) cardChartQuery = cardChartQuery.gte('date', startDate);
      if (endDate) cardChartQuery = cardChartQuery.lte('date', endDate);
      // For card transactions, we only apply category filter if the user selected one
      // Since card_transactions uses ID, we'd need more logic to filter by name here, 
      // but for now we'll fetch all in the date range and filter in JS to keep it simple and consistent.

      const [{ data, count, error: fetchError }, { data: chartData }, { data: cardChartData }, dbEntities] = await Promise.all([
        query,
        chartQuery,
        cardChartQuery,
        FinanceService.getEntities()
      ]);
      if (requestId !== lastRequestId.current) return;
      if (fetchError) throw fetchError;
      setOwners((dbEntities || []).sort((a, b) => a.localeCompare(b)));

      // ── Post-process Data for Amount Sorting and Filtering ──
      // Because Supabase 'amount' is stored as positive, mathematical filtering (-R$ 50 to R$ 100) 
      // and sorting (highest to lowest true value) needs to be handled.
      const applyTrueAmount = (t: any) => ({
        ...t,
        _trueAmount: (t.type === 'EXPENSE' || t.type === 'BILL_PAYMENT' || (t.type === 'TRANSFER' && t.amount > 0)) ? -Math.abs(Number(t.amount || 0)) : Math.abs(Number(t.amount || 0))
      });

      // Normalize card transactions
      const normalizedCardChartData = (cardChartData || []).map((ct: any) => ({
        id: ct.id,
        date: ct.date,
        type: 'EXPENSE',
        amount: Number(ct.amount),
        category: ct.categories?.name || 'Cartão de Crédito',
        description: ct.description,
        is_paid: true,
        paid_amount: Number(ct.amount),
        is_amortization: false,
        metadata: {}
      }));

      let processedChartData = [...(chartData || []), ...normalizedCardChartData].map(applyTrueAmount);
      let processedTableData = (data || []).map(applyTrueAmount);

      // Apply Filter Category to card transactions too (if selected)
      if (filterCategory.length > 0) {
        processedChartData = processedChartData.filter((t: any) => filterCategory.includes(t.category));
      }

      // 1. Appy Min/Max Filters
      if (minPrice !== '') {
        const minVal = Number(minPrice);
        processedChartData = processedChartData.filter((t: any) => t._trueAmount >= minVal);
        processedTableData = processedTableData.filter((t: any) => t._trueAmount >= minVal);
      }
      if (maxPrice !== '') {
        const maxVal = Number(maxPrice);
        processedChartData = processedChartData.filter((t: any) => t._trueAmount <= maxVal);
        processedTableData = processedTableData.filter((t: any) => t._trueAmount <= maxVal);
      }

      // 2. Apply complex Amount sorting in-memory if needed
      if (sortField === 'amount') {
        processedTableData.sort((a: any, b: any) => {
          if (sortDirection === 'asc') return a._trueAmount - b._trueAmount;
          return b._trueAmount - a._trueAmount;
        });
      }

      setChartTransactions(processedChartData.map((t: any) => ({
        id: t.id,
        description: t.description || '',
        amount: Number(t.amount || 0),
        date: t.date,
        type: t.type as TransactionType,
        accountId: t.account_id,
        accountName: t.account_name ?? '',
        category: t.category ?? 'Outros',
        subcategory: t.subcategory ?? undefined,
        owner_name: t.owner_name ?? 'Pessoal',
        isDeleted: !!t.is_deleted,
        isReconciled: !!t.is_reconciled,
        isPaid: !!t.is_paid,
        paidAmount: Number(t.paid_amount || 0),
        is_amortization: !!t.is_amortization,
        metadata: t.metadata || {}
      })));

      if (count !== null) setTotalCount(processedTableData.length > 0 ? processedTableData.length : count); // Adjust count roughly

      setHasMore(false); // Disable infinite scroll if we sort/filter in JS

      setTransactions(processedTableData.slice(0, PAGE_SIZE).map((t: any) => {
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
          subcategory: t.subcategory ?? undefined,
          owner_name: t.owner_name ?? 'Pessoal',
          isDeleted: t.is_deleted,
          isReconciled: t.is_reconciled,
          isPaid: t.is_paid ?? false,
          paidAmount: Number(t.paid_amount ?? 0),
          paidAt: t.paid_at ?? undefined,
          parentId: t.parent_id ?? null,
          metadata: t.metadata ?? {},
          is_incomplete: isIncomplete,
          attachments: t.attachments || []
        };
      }));
    } catch (err) {
      setError('Erro ao carregar dados.');
    } finally {
      setIsLoading(false);
    }
  }, [filterType, filterAccount, filterCategory, filterSubcategory, startDate, endDate, minPrice, maxPrice, filterOwner, page, sortField, sortDirection, debouncedSearch]);

  // Reset page to 0 when filters change
  useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
  }, [filterType, JSON.stringify(filterAccount), JSON.stringify(filterCategory), JSON.stringify(filterSubcategory), startDate, endDate, minPrice, maxPrice, JSON.stringify(filterOwner), sortField, sortDirection, debouncedSearch]);

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

      if (field === 'amount') {
        let parsedAmt = typeof value === 'string'
          ? Number(value.replace(/\./g, '').replace(',', '.'))
          : Number(value);
        if (isNaN(parsedAmt)) parsedAmt = 0;

        const isNegative = parsedAmt < 0;
        patch = { amount: Math.abs(parsedAmt) };

        if (tx && tx.type === 'TRANSFER') {
          patch.metadata = {
            ...(tx.metadata || {}),
            transfer_side: isNegative ? 'SOURCE' : 'DESTINATION'
          };
        } else {
          patch.type = isNegative ? 'EXPENSE' : 'INCOME';
        }
      }

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
        if (navigator.onLine) await FinanceService.ensureEntityExists(value);
      }
      if (field === 'category' && value) {
        if (navigator.onLine) await ReconciliationService.ensureCategoryExists(value);
      }
      if (field === 'subcategory' && value && tx?.category) {
        if (navigator.onLine) {
          const catId = await ReconciliationService.ensureCategoryExists(tx.category);
          if (catId) await (ReconciliationService as any).ensureSubcategoryExists(catId, value);
        }
      }

      if (!navigator.onLine && confirmedScope && confirmedScope !== 'ONLY_THIS') {
        alert("Atenção: Edição de histórico em série (Múltiplos Lançamentos) está indisponível offline.");
        return;
      }

      if (!confirmedScope || confirmedScope === 'ONLY_THIS') {
        // Otimização de UI: atualiza a tela instantaneamente para não dar reload na tabela toda
        setTransactions(prev => prev.map(t => {
          if (t.id === id) {
            let updated = { ...t, ...patch };
            if (field === 'counter_account_id') {
              updated = {
                ...t,
                type: 'TRANSFER' as TransactionType,
                metadata: { ...(t.metadata || {}), is_transfer: true, counter_account_id: value }
              };
            }
            if (field === 'account_id') {
              updated.accountId = value;
              const acc = accounts.find(a => a.id === value);
              if (acc) updated.accountName = acc.institution;
            }
            return updated;
          }
          return t;
        }));

        if (!navigator.onLine) {
          await FinanceService.updateTransaction(id, patch);
          setSavingId(null);
          setEditingRow(null);
          return;
        }

        await FinanceService.updateTransaction(id, patch);
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

    if (!navigator.onLine && confirmedScope && confirmedScope !== 'ONLY_THIS') {
      alert("Atenção: Exclusão em série (Múltiplos Lançamentos) está indisponível offline.");
      return;
    }

    try {
      if (!confirmedScope || confirmedScope === 'ONLY_THIS') {
        if (!navigator.onLine) {
          await FinanceService.deleteTransaction(id);
          setTransactions(prev => prev.filter(t => t.id !== id));
          setSeriesModal({ show: false, tx: null, pendingAction: 'DELETE' });
          return;
        }

        await FinanceService.deleteTransaction(id);

        // Deletar também a contraparte se for transferência
        if (tx?.metadata?.is_transfer && tx.metadata?.counter_account_id) {
          const { data: counterTxs } = await supabase.from('transactions')
            .select('id, account_id')
            .eq('date', tx.date)
            .eq('amount', tx.amount)
            .eq('description', tx.description)
            .eq('account_id', tx.metadata.counter_account_id)
            .eq('is_deleted', false)
            .limit(1);

          if (counterTxs && counterTxs.length > 0) {
            await supabase.from('transactions').update({ is_deleted: true }).eq('id', counterTxs[0].id);
            if (HistoryUtils.getStatus(tx) !== 'PENDING') {
              await supabase.rpc('recalculate_account_balance', { p_account_id: counterTxs[0].account_id });
            }
          }
        }
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

  const handleUploadAttachment = async (id: string, file: File) => {
    setSavingId(id);
    try {
      await FinanceService.uploadAttachment(file, id, false);
      await fetchData();
    } catch (err: any) {
      alert(`Erro ao fazer upload: ${err.message}`);
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteAttachment = async (txId: string, documentId: string) => {
    if (!txId || !documentId) return;
    if (!window.confirm('Excluir este anexo?')) return;

    setSavingId(txId);
    try {
      await FinanceService.deleteAttachment(documentId);
      await fetchData();
    } catch (err: any) {
      alert(`Erro ao excluir anexo: ${err.message}`);
    } finally {
      setSavingId(txId); // mantenho para feedback visual
      setTimeout(() => setSavingId(null), 500);
    }
  };

  const handleViewAttachment = async (documentId: string) => {
    try {
      const url = await FinanceService.getAttachmentUrl(documentId);
      if (url) {
        window.open(url, '_blank');
      } else {
        alert('Anexo não encontrado');
      }
    } catch (err: any) {
      alert(`Erro ao abrir anexo: ${err.message}`);
    }
  };

  const resetFilters = () => {
    setFilterType('ALL'); setFilterAccount([]); setFilterCategory([]);
    setStartDate(DateUtils.formatToISODate(firstDay));
    setEndDate(DateUtils.formatToISODate(lastDay));
    setMinPrice(''); setMaxPrice(''); setFilterOwner([]);
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

  const [isCategorizingAI, setIsCategorizingAI] = useState(false);

  const handleSmartCategorize = async () => {
    if (selectedIds.size === 0 || !supabase) return;
    if (!navigator.onLine) {
      alert("Auto-Categorizar por IA exige conexão com a internet.");
      return;
    }

    setIsCategorizingAI(true);
    try {
      const selectedTxs = transactions.filter(t => selectedIds.has(t.id));
      const needsCategory = selectedTxs.filter(t => !t.category || t.category === '' || t.category === 'Outros' || t.category === 'Conciliação');
      const uniqueDescriptions = Array.from(new Set(needsCategory.map(t => t.description)));

      if (uniqueDescriptions.length === 0) {
        alert("As transações selecionadas já possuem categorias específicas definidas. Selecione transações sem categoria.");
        return;
      }

      const res = await fetch('/api/categorize-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descriptions: uniqueDescriptions, categories: subcategories })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message);

      const mapping = new Map(data.data.map((d: any) => [d.description, d]));
      
      let updatedCount = 0;
      for (const tx of needsCategory) {
        const match = mapping.get(tx.description);
        if (match && (match as any).category) {
          const patch = { category: (match as any).category, subcategory: (match as any).subcategory || '' };
          await supabase.from('transactions').update(patch).eq('id', tx.id);
          updatedCount++;
        }
      }

      await fetchData();
      setSelectedIds(new Set());
      alert(`IA categorizou ${updatedCount} transações aplicando seus padrões.`);
    } catch (err: any) {
      console.error(err);
      alert("Erro na IA: " + err.message);
    } finally {
      setIsCategorizingAI(false);
    }
  };

  const handleBulkUpdate = async () => {
    if (selectedIds.size === 0 || !supabase) return;

    if (!navigator.onLine) {
      alert("A edição em lote está indisponível sem conexão com a internet.");
      return;
    }

    if (!bulkDescription && !bulkAccount && !bulkCategory && !bulkOwner) {
      return alert("Preencha ao menos um campo para editar em lote.");
    }

    if (!window.confirm(`Deseja atualizar ${selectedIds.size} lançamentos?`)) return;

    setIsBulkUpdating(true);
    try {
      if (navigator.onLine) {
        if (bulkOwner && bulkOwner !== 'Pessoal') await FinanceService.ensureEntityExists(bulkOwner);
        if (bulkCategory) {
          const catId = await ReconciliationService.ensureCategoryExists(bulkCategory);
          if (catId && bulkSubcategory) await (ReconciliationService as any).ensureSubcategoryExists(catId, bulkSubcategory);
        }
      }

      const patch: any = {};
      if (bulkDescription) patch.description = bulkDescription;
      if (bulkAccount) {
        const acc = accounts.find(a => a.institution === bulkAccount || a.id === bulkAccount);
        if (acc) {
          patch.account_id = acc.id;
          patch.account_name = acc.institution;
        }
      }
      if (bulkCategory) patch.category = bulkCategory;
      if (bulkSubcategory) patch.subcategory = bulkSubcategory;
      if (bulkOwner) patch.owner_name = bulkOwner;

      const ids = Array.from(selectedIds);

      const isTransfer = bulkCategory.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer');

      if (isTransfer && bulkCounterAccount) {
        patch.type = 'TRANSFER';
        const counterAcc = accounts.find(a => a.institution === bulkCounterAccount || a.id === bulkCounterAccount);
        for (const id of ids) {
          const tx = transactions.find(t => t.id === id);
          const currentMetadata = tx?.metadata || {};
          await supabase.from('transactions').update({
            ...patch,
            metadata: {
              ...currentMetadata,
              is_transfer: true,
              counter_account_id: counterAcc ? counterAcc.id : bulkCounterAccount
            }
          }).eq('id', id);
        }
      } else {
        const { error: err } = await supabase.from('transactions').update(patch).in('id', ids);
        if (err) throw err;
      }

      await fetchData();
      setSelectedIds(new Set());
      setBulkDescription(''); setBulkAccount(''); setBulkCategory(''); setBulkSubcategory(''); setBulkOwner(''); setBulkCounterAccount('');
      alert("Lote atualizado com sucesso!");
    } catch (err) {
      alert("Erro ao atualizar lote");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !supabase) return;

    if (!navigator.onLine) {
      alert("A exclusão em lote está indisponível sem conexão com a internet.");
      return;
    }

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
    if (format === 'xlsx') XLSX.writeFile(wb, `historico_finvision_${new Date().getTime()}.xlsx`);
    else {
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `historico_finvision_${new Date().getTime()}.csv`;
      link.click();
    }
  };

  const handleGenerateDre = () => {
    // Generate the DRE report using the currently filtered transactions mapped
    const report = DreUtils.generateDreFromTransactions(transactions, startDate, endDate);
    setDreReport(report);
    setShowDreModal(true);
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
    
    // Improved Validation
    if (!f.description.trim()) {
      setAddModal(prev => prev.open ? { ...prev, error: 'A descrição é obrigatória.' } : prev);
      return;
    }
    if (!f.accountId) {
      setAddModal(prev => prev.open ? { ...prev, error: 'Selecione uma conta bancária.' } : prev);
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      setAddModal(prev => prev.open ? { ...prev, error: 'O valor deve ser um número válido maior que zero.' } : prev);
      return;
    }

    setAddModal(prev => prev.open ? { ...prev, isSubmitting: true, error: null } : prev);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'offline-user';

      if (navigator.onLine) {
        if (f.ownerName && f.ownerName !== 'Pessoal') await FinanceService.ensureEntityExists(f.ownerName);
        if (f.category) {
          const catId = await ReconciliationService.ensureCategoryExists(f.category);
          if (catId && f.subcategory) await (ReconciliationService as any).ensureSubcategoryExists(catId, f.subcategory);
        }
      }

      const isTransfer = f.category.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer') || f.description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer');
      let createdTxId: string | null = null;

      if (!f.isInstallment && !f.isRecurring) {
        if (!navigator.onLine) {
          const newTx = {
            date: f.date, description: f.description, amount, type: f.type,
            account_id: f.accountId, category: f.category, subcategory: f.subcategory || null, is_paid: false, paid_amount: 0,
            owner_name: f.ownerName === 'Pessoal' ? null : f.ownerName
          };
          const saved = await FinanceService.saveTransaction(newTx);
          setTransactions(prev => [saved as any, ...prev]);
          setAddModal({ open: false });
          return;
        }

        if (isTransfer && f.destinationAccountId) {
          const accDest = accounts.find(a => a.id === f.destinationAccountId);
          const accSrc = accounts.find(a => a.id === f.accountId);
          const { data, error: insertErr } = await supabase.from('transactions').insert([
            {
              user_id: user?.id, date: f.date, description: `[TRANSF] ${f.description}`, amount, type: 'TRANSFER',
              account_id: f.accountId, account_name: accSrc?.institution || 'Conta', category: f.category, subcategory: f.subcategory || null, is_paid: true, paid_amount: amount, paid_at: f.date,
              owner_name: f.ownerName === 'Pessoal' ? null : f.ownerName,
              metadata: { is_transfer: true, transfer_side: 'SOURCE', counter_account_id: f.destinationAccountId }
            },
            {
              user_id: user?.id, date: f.date, description: `[TRANSF] ${f.description}`, amount, type: 'TRANSFER',
              account_id: f.destinationAccountId, account_name: accDest?.institution || 'Conta Destino', category: f.category, subcategory: f.subcategory || null, is_paid: true, paid_amount: amount, paid_at: f.date,
              owner_name: f.ownerName === 'Pessoal' ? null : f.ownerName,
              metadata: { is_transfer: true, transfer_side: 'DESTINATION', counter_account_id: f.accountId }
            }
          ]).select('id');
          if (insertErr) throw insertErr;
          createdTxId = data?.[0]?.id;
        } else {
          const { data, error: insertErr } = await supabase.from('transactions').insert({
            user_id: user?.id, date: f.date, description: f.description, amount, type: f.type,
            account_id: f.accountId, category: f.category, subcategory: f.subcategory || null, is_paid: false, paid_amount: 0,
            owner_name: f.ownerName === 'Pessoal' ? null : f.ownerName
          }).select('id');
          if (insertErr) throw insertErr;
          createdTxId = data?.[0]?.id;
        }
      } else {
        const { TransactionSeriesUtils } = await import('../lib/transactionSeriesUtils');
        const series = TransactionSeriesUtils.generateSeries(
          { description: f.description, amount, category: f.category, subcategory: f.subcategory || undefined, accountId: f.accountId, type: f.type },
          { type: f.isInstallment ? 'INSTALLMENT' : 'RECURRING', count: f.installmentsCount, period: f.recurrencePeriod, daysInterval: f.recurrenceDaysInterval, startDate: f.date, totalAmount: f.isInstallment ? amount : undefined }
        );
        const groupId = crypto.randomUUID();
        const inserts = series.map(item => ({
          user_id: userId, date: item.date, description: item.description, amount: item.amount, type: item.type, account_id: item.accountId, category: item.category, subcategory: item.subcategory, is_paid: false, paid_amount: 0,
          owner_name: f.ownerName === 'Pessoal' ? null : f.ownerName,
          metadata: { ...(f.isInstallment ? { installment_group_id: groupId, installment_number: (item as any).installmentNumber, installment_total: f.installmentsCount } : { recurrence_group_id: groupId }) }
        }));

        if (!navigator.onLine) {
          inserts.forEach(tx => {
            const fakeId = 'offline-' + crypto.randomUUID();
            offlineQueue.addAction('CREATE_TRANSACTION', { ...tx, id: fakeId });
          });
          setTransactions(prev => [...inserts.map(tx => ({ ...tx, id: 'offline-' + crypto.randomUUID(), account_name: accounts.find(a => a.id === tx.account_id)?.institution || 'Conta' })) as any, ...prev]);
          setAddModal({ open: false });
          return;
        }

        const { data, error: insertErr } = await supabase.from('transactions').insert(inserts).select('id');
        if (insertErr) throw insertErr;
        createdTxId = data?.[0]?.id;
      }

      // Handle Attachments (Multi-upload)
      if (createdTxId && f.files && f.files.length > 0) {
        for (const file of f.files) {
          try {
            await FinanceService.uploadAttachment(file, createdTxId, false);
          } catch (uploadErr) {
            console.error(`Erro ao subir anexo ${file.name}:`, uploadErr);
          }
        }
      }

      setAddModal({ open: false });
      await fetchData();
    } catch (err: any) {
      setAddModal(prev => prev.open ? { ...prev, isSubmitting: false, error: err.message || 'Erro ao adicionar transação.' } : prev);
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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">Histórico Financeiro</h1>
            <ContextualHelp 
              title="Gestão de Lançamentos" 
              description="Nesta tela você pode filtrar transações por categoria, conta ou período. Clique em 'Novo Lançamento' para adicionar manualmente ou use o 'Conciliador' no menu lateral para importar extratos bancários de forma massiva."
            />
          </div>
          <p className="text-sm text-slate-400 font-medium">Gestão detalhada e conciliação de lançamentos.</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <button
            onClick={fetchData}
            className="p-3 bg-white border border-slate-100 text-slate-400 rounded-xl hover:text-brand-600 transition-all shadow-sm shrink-0"
            title="Recarregar Dados"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setAddModal({
              open: true,
              isSubmitting: false,
              form: {
                date: DateUtils.formatToISODate(),
                description: '',
                type: 'EXPENSE',
                amount: '',
                accountId: accounts.length > 0 ? accounts[0].id : '',
                category: 'Outros',
                subcategory: '',
                ownerName: 'Pessoal',
                isInstallment: false,
                installmentsCount: 2,
                isRecurring: false,
                recurrencePeriod: 'monthly',
                recurrenceDaysInterval: 30,
                destinationAccountId: '',
                files: []
              }
            })}
            className="flex-1 min-w-[140px] sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-brand-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform active:scale-95"
          >
            <Plus size={18} />
            <span>Novo Lançamento</span>
          </button>

          <div className="flex bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden shrink-0">
            <button
              onClick={handleGenerateDre}
              className="px-3 py-3 text-slate-600 hover:text-brand-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5 font-bold text-xs border-r border-slate-100"
              title="Exportar DRE"
            >
              <Building2 size={16} />
              <span className="hidden md:inline">DRE</span>
            </button>
            <button
              onClick={() => exportToXlsx('xlsx')}
              className="px-3 py-3 text-slate-600 hover:text-emerald-600 hover:bg-slate-50 transition-colors"
              title="Exportar Excel"
            >
              <FileDown size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* BARRA DE EDIÇÃO EM LOTE - Estilo Conciliação (AGORA NO TOPO PARA VISIBILIDADE) */}
      {selectedIds.size > 0 && (
        <div className="sticky top-4 z-[100] flex flex-wrap items-center gap-3 p-4 bg-brand-900 rounded-[30px] shadow-2xl animate-in fade-in slide-in-from-top-4 duration-500 border border-slate-800 mb-6">
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
              <input
                list="bulk-accounts-list"
                value={bulkAccount}
                onChange={(e) => setBulkAccount(e.target.value)}
                placeholder="Trocar Conta..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-800 text-white text-[10px] font-bold uppercase rounded-xl outline-none focus:ring-2 focus:ring-brand-500/50 appearance-none cursor-pointer"
              />
              <datalist id="bulk-accounts-list">
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.institution} />
                ))}
              </datalist>
            </div>

            <div className="relative w-full md:w-44">
              <Tag size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                list="bulk-categories-list"
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                placeholder="Trocar Categoria..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-800 text-white text-[10px] font-bold uppercase rounded-xl outline-none focus:ring-2 focus:ring-brand-500/50 appearance-none cursor-pointer"
              />
              <datalist id="bulk-categories-list">
                {availableCategories.map(cat => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>

            {bulkCategory && (
              <div className="relative w-full md:w-44 animate-in zoom-in-95 duration-200">
                <Tag size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  list="bulk-subcategories-list"
                  value={bulkSubcategory}
                  onChange={(e) => setBulkSubcategory(e.target.value)}
                  placeholder="Trocar Subcat..."
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-800 text-white text-[10px] font-bold uppercase rounded-xl outline-none focus:ring-2 focus:ring-brand-500/50 appearance-none cursor-pointer"
                />
                <datalist id="bulk-subcategories-list">
                  {subcategories
                    .filter(s => s.category_name === bulkCategory)
                    .map(s => (
                      <option key={s.id} value={s.name} />
                    ))}
                </datalist>
              </div>
            )}

            <div className="relative w-full md:w-44">
              <User size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                list="bulk-owners-list"
                value={bulkOwner}
                onChange={(e) => setBulkOwner(e.target.value)}
                placeholder="Trocar Entidade..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-800 text-white text-[10px] font-bold uppercase rounded-xl outline-none focus:ring-2 focus:ring-brand-500/50 appearance-none cursor-pointer"
              />
              <datalist id="bulk-owners-list">
                {owners.map(o => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </div>

            {(bulkCategory.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes('transferencia') || bulkCategory.toLowerCase().includes('transfer')) && (
              <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-300">
                <ArrowRight size={14} className="text-brand-400" />
                <div className="relative w-full md:w-44">
                  <Landmark size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
                  <input
                    list="bulk-counteraccounts-list"
                    value={bulkCounterAccount}
                    onChange={(e) => setBulkCounterAccount(e.target.value)}
                    placeholder="Destino Transf..."
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-800 text-brand-400 border border-brand-500/30 text-[10px] font-bold uppercase rounded-xl outline-none focus:ring-2 focus:ring-brand-500/50 appearance-none cursor-pointer"
                  />
                  <datalist id="bulk-counteraccounts-list">
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.institution} />
                    ))}
                  </datalist>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleSmartCategorize}
              disabled={isCategorizingAI || isBulkUpdating}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-brand-600 to-indigo-600 border border-indigo-500/30 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:shadow-[0_0_15px_rgba(79,70,229,0.4)] transition-all active:scale-95 disabled:opacity-50"
            >
              {isCategorizingAI ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {isCategorizingAI ? 'Analisando...' : 'IA Auto-Categorizar'}
            </button>
            <button
              onClick={handleBulkUpdate}
              disabled={isBulkUpdating || isCategorizingAI}
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
        filterCategory={filterCategory} setFilterCategory={setFilterCategory} filterSubcategory={filterSubcategory} setFilterSubcategory={setFilterSubcategory} startDate={startDate} setStartDate={setStartDate}
        endDate={endDate} setEndDate={setEndDate} minPrice={minPrice} setMinPrice={setMinPrice} maxPrice={maxPrice} setMaxPrice={setMaxPrice}
        filterOwner={filterOwner} setFilterOwner={setFilterOwner} owners={owners}
        categories={availableCategories} subcategories={subcategories.map(s => s.name)} accounts={accounts} resetFilters={resetFilters}
      />

      {/* QUICK DATE FILTERS + CUSTOM RANGE + VIEW MODE TOGGLE */}
      <div className="flex flex-col gap-3 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
        {/* Row 1: Date presets + View mode toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Date presets */}
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setDatePreset('MONTH')} className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${startDate === DateUtils.formatToISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>Este Mês</button>
            <button onClick={() => setDatePreset(30)} className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all bg-slate-50 text-slate-500 hover:bg-slate-100`}>30 Dias</button>
            <button onClick={() => setDatePreset(90)} className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all bg-slate-50 text-slate-500 hover:bg-slate-100`}>3 Meses</button>
            <button onClick={() => setDatePreset('ALL')} className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${!startDate && !endDate ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>Tudo</button>
          </div>

          {/* Spacer */}
          <div className="hidden sm:block flex-1" />

          {/* View mode toggle - goes to second row on very small screens */}
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1 w-full sm:w-auto">
            <button
              onClick={() => setViewMode('ALL')}
              className={`flex-1 sm:flex-none px-3 sm:px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${viewMode === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Todos
            </button>
            <button
              onClick={() => setViewMode('SETTLED')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${viewMode === 'SETTLED' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Check size={12} />
              <span className="hidden xs:inline">Pagos &</span> Recebidos
            </button>
          </div>
        </div>

        {/* Row 2: Custom date range picker */}
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-100 w-full sm:w-auto">
          <Calendar size={14} className="text-slate-400 shrink-0" />
          <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(0); }} className="bg-transparent text-[11px] font-bold outline-none flex-1 min-w-0" />
          <span className="text-slate-300 shrink-0">–</span>
          <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(0); }} className="bg-transparent text-[11px] font-bold outline-none flex-1 min-w-0" />
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
        onCategoryClick={(cat) => {
          setFilterCategory([cat]);
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }}
      />

      <div />

      <TransactionTable
        transactions={viewFiltered} isLoading={isLoading} accounts={accounts}
        categoryObjects={categoryObjects} subcategories={subcategories} onCreateCategory={handleCreateCategory}
        editingRow={editingRow} setEditingRow={setEditingRow} editValue={editValue} setEditValue={setEditValue}
        savingId={savingId} handleUpdate={handleUpdate} handleDelete={handleDelete} statusBadge={statusBadge}
        sortField={sortField} sortDirection={sortDirection} onSort={handleSort}
        formatCurrency={HistoryUtils.formatCurrency} getAmount={HistoryUtils.getAmount} getPaidAmount={HistoryUtils.getPaidAmount}
        getRemaining={HistoryUtils.getRemaining} getStatus={HistoryUtils.getStatus} openPayModal={openPayModal}
        owners={owners}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onSelectAll={handleSelectAll}
        onUploadAttachment={handleUploadAttachment}
        onDeleteAttachment={handleDeleteAttachment}
        onViewAttachment={handleViewAttachment}
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
              await supabase.from('transactions').update({ is_paid: false, paid_amount: 0, paid_at: null }).eq('id', t.id);
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
        accounts={accounts} owners={owners} categoryObjects={categoryObjects} subcategories={subcategories} onCreateCategory={handleCreateCategory}
      />

      <SeriesScopeModal
        show={seriesModal.show} onClose={() => setSeriesModal({ show: false, tx: null, pendingAction: 'DELETE' })}
        onConfirm={(scope) => seriesModal.pendingAction === 'DELETE' ? handleDelete(seriesModal.tx!.id, scope) : handleUpdate(seriesModal.tx!.id, seriesModal.pendingPatch!.field, seriesModal.pendingPatch!.value, scope)}
        title={seriesModal.pendingAction === 'DELETE' ? 'Excluir Lançamento' : 'Editar Lançamento'}
        actionLabel={seriesModal.pendingAction === 'DELETE' ? 'Excluir' : 'Salvar'}
        type={seriesModal.tx?.metadata?.recurrence_group_id ? 'RECURRING' : 'INSTALLMENT'}
      />

      {showDreModal && dreReport && (
        <DreReportModal
          report={dreReport}
          onClose={() => setShowDreModal(false)}
        />
      )}
    </div>
  );
};

export default HistoryPage;
