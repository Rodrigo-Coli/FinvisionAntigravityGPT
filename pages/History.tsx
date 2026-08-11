import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, FileDown, Loader2, AlertCircle, Check, RefreshCw, Calendar, Tag, Landmark, User, ArrowRight, Trash, X, Sparkles, Clock } from 'lucide-react';
import * as XLSX from 'xlsx';

import { Transaction, TransactionType, BankAccount, TransactionSplit } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { offlineQueue } from '../lib/offlineQueue.service';
import { HistoryUtils, EPS, isCapitalizedMovement, projectChartMetadata } from '../lib/historyUtils';
import { DateUtils } from '../lib/dateUtils';
import { FinanceService } from '../services/finance.service';
import { ReconciliationService } from '../services/reconciliation.service';
import { SplitTransactionService } from '../services/splitTransaction.service';
import { findCloseMatch } from '../lib/stringUtils';
import { useToast } from '../contexts/ToastContext';

// Modular Components
import { HistoryFilters } from '../components/history/HistoryFilters';
import { TransactionTable } from '../components/history/TransactionTable';
import { PaymentModal } from '../components/history/PaymentModal';
import { AddTransactionModal } from '../components/history/AddTransactionModal';
import { SeriesScopeModal, SeriesScope } from '../components/SeriesScopeModal';
import { HistoryCharts } from '../components/history/HistoryCharts';
import { DreReportModal } from '../components/history/DreReportModal';
import ContextualHelp from '../components/ContextualHelp';
import { ArrowDownRight, ArrowUpRight, Wallet, Building2 } from 'lucide-react';

// Initial fallback categories
const DEFAULT_CATEGORIES = [
  'Alimentação', 'Assinaturas', 'Cartão de Crédito', 'Conciliação',
  'Educação', 'Estorno', 'Extra', 'Farmácia', 'Investimento',
  'Lazer', 'Mercado', 'Moradia', 'Outros', 'Pagamentos',
  'Restaurante', 'Salário', 'Saúde', 'Sem categoria', 'Transporte', 'Vendas'
].sort();

type PayModalState =
  | { open: false }
  | {
    open: true;
    tx: Transaction;
    remaining: number;
    payAmount: string;
    payAccountId: string;
    payDate: string;
    payRemainderDate: string;
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

const detectLegacySeries = (t: any) => {
  const baseMetadata = {
    ...(t.metadata || {}),
    installment_group_id: t.metadata?.installment_group_id || t.installment_group_id,
    recurrence_group_id: t.metadata?.recurrence_group_id || t.recurrence_group_id,
    installment_number: t.metadata?.installment_number || t.installment_number || t.metadata?.installment,
    installment_total: t.metadata?.installment_total || t.installment_total,
    is_installment: t.metadata?.is_installment || t.is_installment || !!(t.metadata?.installment_group_id || t.installment_group_id),
    is_recurring: t.metadata?.is_recurring || t.is_recurring || !!(t.metadata?.recurrence_group_id || t.recurrence_group_id)
  };

  if (baseMetadata.installment_group_id || baseMetadata.recurrence_group_id) {
    return baseMetadata;
  }

  // Treat asset-linked transactions (rental, condo, iptu) as virtual recurrence series
  if (baseMetadata.linked_asset_id) {
    const desc = t.description || '';
    const typeSuffix = desc.toLowerCase().includes('aluguel') 
      ? 'rental' 
      : (desc.toLowerCase().includes('condomínio') || desc.toLowerCase().includes('condominio') || desc.toLowerCase().includes('condo') 
        ? 'condo' 
        : (desc.toLowerCase().includes('iptu') 
          ? 'iptu' 
          : 'other'));
    const virtualGroupId = `virtual-asset-${baseMetadata.linked_asset_id}-${typeSuffix}`;
    return {
      ...baseMetadata,
      is_recurring: true,
      recurrence_group_id: virtualGroupId
    };
  }

  const desc = t.description || '';
  const match = desc.match(/^(.+?)\s+(\d+)\/(\d+)\s+-\s+(.+)$/i);
  if (match) {
    const prefix = match[1].trim();
    const instNum = parseInt(match[2], 10);
    const instTotal = parseInt(match[3], 10);
    const assetName = match[4].trim();
    const virtualGroupId = `virtual-${prefix.toLowerCase().replace(/\s+/g, '-')}-${assetName.toLowerCase().replace(/\s+/g, '-')}`;

    return {
      ...baseMetadata,
      is_installment: true,
      installment_group_id: virtualGroupId,
      installment_number: instNum,
      installment_total: instTotal
    };
  }

  return baseMetadata;
};

const buildSeriesFilter = (query: any, tx: any) => {
  const groupId = tx?.metadata?.installment_group_id || tx?.metadata?.recurrence_group_id;
  const colName = tx?.metadata?.installment_group_id ? 'installment_group_id' : 'recurrence_group_id';

  if (groupId && String(groupId).startsWith('virtual-asset-')) {
    const parts = String(groupId).split('-');
    const typeSuffix = parts[parts.length - 1];
    const linkedAssetId = parts.slice(2, parts.length - 1).join('-');
    
    query = query.eq('metadata->>linked_asset_id', linkedAssetId);
    
    if (typeSuffix === 'rental') {
      query = query.ilike('description', '%aluguel%');
    } else if (typeSuffix === 'condo') {
      query = query.or('description.ilike.%condomínio%,description.ilike.%condominio%,description.ilike.%condo%');
    } else if (typeSuffix === 'iptu') {
      query = query.ilike('description', '%iptu%');
    }
  } else if (groupId && String(groupId).startsWith('virtual-')) {
    const desc = tx.description || '';
    const match = desc.match(/^(.+?)\s+(\d+)\/(\d+)\s+-\s+(.+)$/i);
    if (match) {
      const prefix = match[1].trim();
      const assetName = match[4].trim();
      query = query.ilike('description', `${prefix} % - ${assetName}`);
    } else {
      query = query.eq('id', tx.id);
    }
  } else {
    query = query.or(`${colName}.eq.${groupId},metadata->>${colName}.eq.${groupId}`);
  }
  return query;
};

// Filtro de CONTA. Um lançamento sem conta e sem cartão (ex.: parcelas de passivo /
// financiamento geradas em Patrimônio, que nascem sem conta vinculada) não pertence a
// nenhuma conta — então nenhum conjunto de contas selecionadas o representa e ele sumia
// da tela assim que o filtro padrão de contas era inicializado. Regra: quem não tem
// conta nem cartão passa sempre; quem tem, só passa se estiver na seleção.
const matchesAccountFilter = (t: any, selected: string[]): boolean => {
  const accountId = t?.account_id;
  const cardId = t?.metadata?.card_id || t?.card_id;
  if (!accountId && !cardId) return true;
  return (!!accountId && selected.includes(accountId)) || (!!cardId && selected.includes(cardId));
};

// isCapitalizedMovement (lançamentos de patrimônio que ficam fora dos gráficos/totais) foi
// movido para lib/historyUtils.ts e é importado no topo — mesma regra do Painel e Relatórios.

const getQueryParam = (name: string): string | null => {
  let search = window.location.search;
  if (!search && window.location.hash) {
    const idx = window.location.hash.indexOf('?');
    if (idx !== -1) {
      search = window.location.hash.substring(idx);
    }
  }
  const params = new URLSearchParams(search);
  return params.get(name);
};

const HistoryPage: React.FC = () => {
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonSlots, setComparisonSlots] = useState<{ id: string; name: string; startDate: string; endDate: string }[]>([]);
  const [comparisonResults, setComparisonResults] = useState<Record<string, { income: number; expense: number; balance: number }>>({});
  const [isComparing, setIsComparing] = useState(false);
  const [chartTransactions, setChartTransactions] = useState<Transaction[]>([]); // full set for charts (no pagination)
  const [chartCategoryTransactions, setChartCategoryTransactions] = useState<Transaction[]>([]); // banco + cartão combinados, só para o gráfico de categorias
  // Base completa (banco + compras de cartão sempre itemizadas, nunca a fatura resumida) do
  // período selecionado, sem paginação e sem os filtros da tela (tipo/conta/categoria/etc) —
  // o DRE tem seus próprios filtros (ver DreReportModal) e precisa sempre partir do total real.
  const [dreSourceTransactions, setDreSourceTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [cards, setCards] = useState<{ id: string; name: string; last4?: string; closingDay?: number; dueDay?: number; isAdditional?: boolean; parentCardId?: string; sumsIntoInvoice?: boolean; isArchived?: boolean }[]>([]);
  // Todos os cartões (inclusive arquivados) — só para o cálculo de competência.
  const [allCardMeta, setAllCardMeta] = useState<{ id: string; name: string; closingDay?: number; dueDay?: number; isAdditional?: boolean; parentCardId?: string; sumsIntoInvoice?: boolean; isArchived?: boolean }[]>([]);
  const [cardStatements, setCardStatements] = useState<{ id: string; due_date: string }[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [categoryObjects, setCategoryObjects] = useState<{ name: string, type?: 'INCOME' | 'EXPENSE' }[]>(DEFAULT_CATEGORIES.map(c => ({ name: c })));
  const [subcategories, setSubcategories] = useState<{ id: string; name: string; category_name?: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'ALL' | 'SETTLED' | 'PENDING'>(() => {
    const statusParam = getQueryParam('status');
    if (statusParam === 'PENDING' || statusParam === 'ABERTOS') return 'PENDING';
    if (statusParam === 'SETTLED' || statusParam === 'PAGOS') return 'SETTLED';
    return 'ALL';
  });

  // Pagination & Sorting
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const PAGE_SIZE = 500;

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);
  const [showDreModal, setShowDreModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>(() => {
    const typeParam = getQueryParam('type');
    if (typeParam === 'INCOME' || typeParam === 'EXPENSE') return typeParam;
    return 'ALL';
  });
  const [filterAccount, setFilterAccount] = useState<string[]>(() => {
    const acc = getQueryParam('account');
    return acc ? [acc] : [];
  });
  const [filterCategory, setFilterCategory] = useState<string[]>(() => {
    const cat = getQueryParam('category');
    return cat ? [cat] : [];
  });
  const [filterSubcategory, setFilterSubcategory] = useState<string[]>([]);
  const [filterOwner, setFilterOwner] = useState<string[]>([]);
  // Origem: 'ALL' (conta + cartão, padrão) | 'ACCOUNT' (só conta) | 'CARD' (só cartão)
  // Padrão "Conta": é a única aba que mostra a linha resumida "Fatura Cartão: valor
  // total" (as outras escondem ela de propósito pra não contar a fatura em dobro com
  // as compras individuais do cartão) — assim o usuário já vê fatura a vencer ao abrir a tela.
  const [filterOrigin, setFilterOrigin] = useState<'ALL' | 'ACCOUNT' | 'CARD'>('ACCOUNT');

  // (no longer used for pills, kept empty to avoid breaking HistoryCharts prop)
  const [selectedTimelineCategories] = useState<string[]>([]);
  const setSelectedTimelineCategories = (_v: any) => { };

  // Default to current month
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const [startDate, setStartDate] = useState<string>(() => {
    const startParam = getQueryParam('startDate');
    if (startParam) return startParam;
    return DateUtils.formatToISODate(firstDay);
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const endParam = getQueryParam('endDate');
    if (endParam) return endParam;
    return DateUtils.formatToISODate(lastDay);
  });

  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [owners, setOwners] = useState<string[]>(['Pessoal']);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const lastRequestId = useRef(0);
  const isFirstLoad = useRef(true);

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
  const [addModal, setAddModal] = useState<AddModalState>(() => {
    const addParam = getQueryParam('add');
    if (addParam === 'true') {
      return {
        open: true,
        isSubmitting: false,
        form: {
          date: DateUtils.formatToISODate(new Date()),
          description: '',
          type: 'EXPENSE',
          amount: '',
          accountId: '',
          category: '',
          subcategory: '',
          isInstallment: false,
          installmentsCount: 2,
          isRecurring: false,
          recurrencePeriod: 'monthly',
          recurrenceDaysInterval: 30,
          ownerName: 'Pessoal'
        }
      };
    }
    return { open: false };
  });

  // Series Scope Modal State
  const [seriesModal, setSeriesModal] = useState<{
    show: boolean;
    tx: Transaction | null;
    pendingAction: 'UPDATE' | 'DELETE';
    pendingPatch?: { field: string, value: any };
  }>({ show: false, tx: null, pendingAction: 'DELETE' });

  const location = useLocation();
  const navigate = useNavigate();

  // Read initial category, account or actions from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const cat = params.get('category');
    const acc = params.get('account');
    const addParam = params.get('add');
    const startParam = params.get('startDate');
    const endParam = params.get('endDate');
    const statusParam = params.get('status');
    const typeParam = params.get('type');

    let hasChanged = false;
    if (cat) {
      setFilterCategory([cat]);
      hasChanged = true;
    }

    if (acc) {
      setFilterAccount([acc]);
      hasChanged = true;
    }

    if (startParam) {
      setStartDate(startParam);
      hasChanged = true;
    }

    if (endParam) {
      setEndDate(endParam);
      hasChanged = true;
    }

    if (statusParam) {
      if (statusParam === 'PENDING' || statusParam === 'ABERTOS') {
        setViewMode('PENDING');
      } else if (statusParam === 'SETTLED' || statusParam === 'PAGOS') {
        setViewMode('SETTLED');
      } else if (statusParam === 'ALL' || statusParam === 'TODOS') {
        setViewMode('ALL');
      }
      hasChanged = true;
    }

    if (typeParam) {
      if (typeParam === 'INCOME' || typeParam === 'EXPENSE') {
        setFilterType(typeParam);
      } else if (typeParam === 'ALL' || typeParam === 'TODOS') {
        setFilterType('ALL');
      }
      hasChanged = true;
    }

    if (addParam === 'true') {
      setAddModal({
        open: true,
        isSubmitting: false,
        form: {
          date: DateUtils.formatToISODate(new Date()),
          description: '',
          type: 'EXPENSE',
          amount: '',
          accountId: '',
          category: '',
          subcategory: '',
          isInstallment: false,
          installmentsCount: 2,
          isRecurring: false,
          recurrencePeriod: 'monthly',
          recurrenceDaysInterval: 30,
          ownerName: 'Pessoal'
        }
      });
      hasChanged = true;
    }

    if (hasChanged) {
      navigate('/history', { replace: true });
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

  const fetchData = useCallback(async (isSilent: boolean = false) => {
    const requestId = ++lastRequestId.current;
    // Verifica se existe cache de transações para qualquer usuário (chave dinâmica por user ID)
    const hasAnyCachedTxs = Object.keys(localStorage).some(k => k.startsWith('finvision_cached_raw_txs_'));
    if (!isSilent && !hasAnyCachedTxs) {
      setIsLoading(true);
    }
    setError(null);

    try {
      if (!supabase) return;

      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        setIsLoading(false);
        return;
      }
      setUserId(user.id);

      let accData: any[] = [];
      let cardDefsData: any[] = [];
      let catData: any[] = [];
      let subData: any[] = [];
      let dbEntities: any[] = [];
      let entityObjsRes: any[] = [];
      let transactionsData: any[] = [];
      let cardTxsData: any[] = [];
      let cardStatementsData: any[] = [];

      const renderData = async (
        accs: any[],
        cardDefs: any[],
        cats: any[],
        subs: any[],
        entities: any[],
        entityObjs: any[],
        txs: any[],
        cardTxs: any[],
        cardStatements: any[]
      ) => {
        if (requestId !== lastRequestId.current) return;

        // Deduplica por ID (não por nome do banco): duas contas na mesma instituição
        // (ex: conta corrente + caixinha no Nubank) são contas diferentes. A dedup
        // antiga por nome descartava a segunda — ela sumia do filtro de contas e,
        // pior, os lançamentos dela eram OCULTADOS quando o filtro padrão de contas
        // era inicializado só com os IDs sobreviventes.
        const uniqueAccData: any[] = [];
        const seenAccIds = new Set<string>();
        for (const a of (accs || [])) {
          if (a?.id && !seenAccIds.has(a.id)) {
            seenAccIds.add(a.id);
            uniqueAccData.push(a);
          }
        }

        setAccounts(uniqueAccData.map((a: any) => {
          const institution = a.institution || a.name || a.bank_name || 'Conta';
          const initialBalance = a.initial_balance !== undefined ? Number(a.initial_balance) : (a.initialBalance !== undefined ? Number(a.initialBalance) : 0);
          const currentBalance = a.current_balance !== undefined ? Number(a.current_balance) : (a.currentBalance !== undefined ? Number(a.currentBalance) : 0);
          const limit = a.limit !== undefined ? Number(a.limit) : (a.overdraft_limit !== undefined ? Number(a.overdraft_limit) : (a.limitBalance !== undefined ? Number(a.limitBalance) : 0));
          const isArchived = a.is_archived !== undefined ? !!a.is_archived : (a.isArchived !== undefined ? !!a.isArchived : false);
          const includeInDashboard = a.include_in_dashboard !== undefined ? !!a.include_in_dashboard : (a.includeDashboard !== undefined ? !!a.includeDashboard : (a.includeInDashboard !== undefined ? !!a.includeInDashboard : true));
          
          return {
            id: a.id,
            institution,
            type: a.type,
            currency: a.currency || 'BRL',
            initialBalance,
            currentBalance,
            limit,
            color: a.color || '#3b82f6',
            isArchived,
            includeInDashboard,
            lastSync: a.last_sync || a.lastSync
          };
        }).sort((a: any, b: any) => a.institution.localeCompare(b.institution)));

        // Cartões (definições, não as compras) — usados para o filtro "Conta" também
        // listar cartões, e para o filtro padrão não excluir compras de cartão que
        // não têm conta bancária vinculada (cartão avulso, sem account_id).
        const uniqueCardDefs: any[] = [];
        const seenCardIds = new Set<string>();
        for (const c of (cardDefs || [])) {
          if (c?.id && !seenCardIds.has(c.id)) {
            seenCardIds.add(c.id);
            uniqueCardDefs.push(c);
          }
        }
        // A lista da UI (filtro "Conta") mostra só cartões ativos; o estado
        // completo (allCardMeta) guarda TODOS — inclusive arquivados — porque o
        // cálculo de competência precisa do fechamento/vencimento deles também.
        const mapCardDef = (c: any) => ({
          id: c.id,
          name: c.name || 'Cartão',
          last4: c.last4,
          closingDay: c.closing_day,
          dueDay: c.due_day,
          isAdditional: !!c.is_additional,
          parentCardId: c.parent_card_id || undefined,
          sumsIntoInvoice: c.sums_into_invoice !== false,
          isArchived: !!c.is_archived
        });
        setCards(uniqueCardDefs.filter((c: any) => !c.is_archived).map(mapCardDef).sort((a, b) => a.name.localeCompare(b.name)));
        setAllCardMeta(uniqueCardDefs.map(mapCardDef));
        setCardStatements((cardStatements || []).map((s: any) => ({ id: s.id, due_date: String(s.due_date || '').split('T')[0] })));

        const deduplicatedOwners = Array.from(new Set((entities || []).map((o: string) => o.trim()))).filter(Boolean);
        setOwners(deduplicatedOwners.sort((a, b) => a.localeCompare(b)));

        // Initialize filters on first load (owner profiles and accounts)
        if (isFirstLoad.current) {
          let didInitializeFilters = false;

          // 1. Initialize filterAccount if the default setting is NOT to include non-summing accounts
          const defaultIncludeNonSumming = localStorage.getItem('finvision_default_include_non_summing') === 'true';
          if (filterAccount.length === 0 && !defaultIncludeNonSumming) {
            const summingAccountIds = uniqueAccData
              .filter((a: any) => {
                const inc = a.include_in_dashboard !== undefined ? !!a.include_in_dashboard : (a.includeDashboard !== undefined ? !!a.includeDashboard : (a.includeInDashboard !== undefined ? !!a.includeInDashboard : true));
                return inc;
              })
              .map((a: any) => a.id);
            // Cartões não têm a flag "include_in_dashboard" — entram sempre por padrão,
            // senão compras de cartão (principalmente cartões sem conta vinculada) somem
            // das telas de Cartão/Tudo assim que o filtro de Conta é inicializado.
            // Arquivados ficam de fora do filtro padrão (a query agora traz todos).
            const allCardIds = uniqueCardDefs.filter((c: any) => !c.is_archived).map((c: any) => c.id);
            const summingIds = [...summingAccountIds, ...allCardIds];

            if (summingIds.length > 0) {
              setFilterAccount(summingIds);
              didInitializeFilters = true;
            }
          }

          // 2. Initialize filterOwner if there are excluded profiles
          if (filterOwner.length === 0) {
            const excludedSet = new Set((entityObjs || []).filter((e: any) => e.include_in_totals === false).map((e: any) => e.name));
            if (excludedSet.size > 0) {
              const defaultOwners = deduplicatedOwners.filter((name: string) => !excludedSet.has(name));
              setFilterOwner(defaultOwners);
              didInitializeFilters = true;
            }
          }

          if (didInitializeFilters) {
            isFirstLoad.current = false;
            setIsLoading(false);
            return;
          }
          isFirstLoad.current = false;
        }

        const mappedSubcats = (subs || []).map(sub => {
          const parentCat = (cats || []).find((c: any) => c.id === sub.category_id);
          return { ...sub, category_name: parentCat?.name || sub.category_name };
        });

        // Deduplicate subcategories by name and category name
        const uniqueSubcats: typeof mappedSubcats = [];
        const seenSubcats = new Set<string>();
        for (const sub of mappedSubcats) {
          const key = `${sub.name?.toLowerCase().trim()}::${sub.category_name?.toLowerCase().trim()}`;
          if (!seenSubcats.has(key)) {
            seenSubcats.add(key);
            uniqueSubcats.push(sub);
          }
        }
        setSubcategories(uniqueSubcats);

        const dbCategories = Array.from(new Set((cats || []).map((c: any) => c.name.trim()))).filter(Boolean);
        const essential = ['Outros', 'Conciliação'];
        const mergedCategories = Array.from(new Set([...DEFAULT_CATEGORIES, ...dbCategories, ...essential])).sort((a, b) => a.localeCompare(b));
        setAvailableCategories(mergedCategories);

        const catMap = new Map<string, { name: string, type?: 'INCOME' | 'EXPENSE' }>();
        DEFAULT_CATEGORIES.forEach((c: string) => catMap.set(c.toLowerCase().trim(), { name: c }));
        (cats || []).forEach((c: any) => {
          if (c.name) {
            catMap.set(c.name.toLowerCase().trim(), { name: c.name.trim(), type: c.type });
          }
        });
        setCategoryObjects(Array.from(catMap.values()).sort((a, b) => a.name.localeCompare(b.name)));

        // In-memory processor
        const applyTrueAmount = (t: any) => ({
          ...t,
          _trueAmount: (t.type === 'EXPENSE' || t.type === 'BILL_PAYMENT' || (t.type === 'TRANSFER' && t.amount > 0)) ? -Math.abs(Number(t.amount || 0)) : Math.abs(Number(t.amount || 0))
        });

        // ── Mês de VENCIMENTO da fatura por compra de cartão ──
        // Regra pedida pelo usuário: uma compra de cartão deve contar no mês em que
        // a fatura dela vence (independente do dia da compra em si). Prioridade:
        // 1) due_date real do card_statements vinculado (statement_id);
        // 2) se a compra ainda não tem fatura gerada, recalcula com a mesma
        //    aritmética de fechamento/vencimento usada em getOrCreateStatement
        //    (services/finance.service.ts), resolvendo cartão adicional pro titular.
        const cardMetaById = new Map<string, { closingDay: number; dueDay: number; isAdditional: boolean; parentId?: string; sumsIntoInvoice: boolean }>();
        (cardDefs || []).forEach((c: any) => {
          cardMetaById.set(c.id, {
            closingDay: c.closing_day,
            dueDay: c.due_day,
            isAdditional: !!c.is_additional,
            parentId: c.parent_card_id || undefined,
            sumsIntoInvoice: c.sums_into_invoice !== false
          });
        });
        const getEffectiveCardMeta = (cardId?: string) => {
          if (!cardId) return undefined;
          const meta = cardMetaById.get(cardId);
          if (!meta) return undefined;
          if (meta.isAdditional && meta.sumsIntoInvoice && meta.parentId) {
            return cardMetaById.get(meta.parentId) || meta;
          }
          return meta;
        };
        const stmtDueById = new Map<string, string>();
        (cardStatements || []).forEach((s: any) => {
          if (s?.id && s?.due_date) stmtDueById.set(s.id, String(s.due_date).split('T')[0]);
        });
        const getCompetenceDate = (ct: any): string => {
          if (ct.statement_id && stmtDueById.has(ct.statement_id)) {
            return stmtDueById.get(ct.statement_id)!;
          }
          const meta = getEffectiveCardMeta(ct.card_id);
          if (!meta || meta.closingDay == null || meta.dueDay == null) return ct.date;
          return HistoryUtils.getCardCompetenceDate(ct.date, meta.closingDay, meta.dueDay);
        };

        // Normalize card transactions
        const normalizedCardTxs = (cardTxs || []).map((ct: any) => ({
          id: ct.id,
          date: ct.date,
          competenceDate: getCompetenceDate(ct),
          // card_transactions não tem coluna "type": amount negativo é estorno/crédito
          // (abate a fatura), então aqui vira INCOME pra não ser tratado como mais uma despesa.
          type: Number(ct.amount) < 0 ? 'INCOME' : 'EXPENSE',
          amount: Number(ct.amount),
          // Compra de cartão SEM categoria não pode cair em "Cartão de Crédito": nos
          // gráficos o cartão não é categoria — o que aparece são as operações feitas
          // nele (Mercado, Lazer...). Usar o nome do cartão como categoria fazia a
          // linha "Cartão de Crédito" reaparecer no gráfico de Categorias.
          category: ct.categories?.name || ct.category || 'Sem categoria',
          subcategory: ct.subcategory || undefined,
          description: ct.description,
          account_id: ct.cards?.account_id || undefined,
          account_name: ct.cards?.name || accs.find(a => a.id === ct.cards?.account_id)?.institution || 'Cartão de Crédito',
          owner_name: ct.owner_name || 'Pessoal',
          notes: ct.notes || '',
          tags: ct.tags || [],
          is_paid: true,
          paid_amount: Number(ct.amount),
          is_amortization: false,
          is_installment: ct.is_installment,
          installment_number: ct.installment_number,
          installment_total: ct.installment_total,
          installment_group_id: ct.installment_group_id,
          is_recurring: ct.is_recurring,
          recurrence_period: ct.recurrence_period,
          recurrence_group_id: ct.recurrence_group_id,
          has_splits: !!ct.has_splits,
          metadata: {
            is_card: true,
            card_id: ct.card_id,
            installment_number: ct.installment_number,
            installment_total: ct.installment_total,
            installment_group_id: ct.installment_group_id,
            recurrence_group_id: ct.recurrence_group_id
          }
        }));

        // Recorte por período correto (mês de vencimento) pras compras de cartão —
        // usado tanto no dataset combinado banco+cartão quanto no "Tudo"/"Cartão".
        // As transações de banco continuam recortadas pela própria data (já vem
        // filtrado do banco de dados).
        const normalizedCardTxsInRange = (startDate && endDate)
          ? normalizedCardTxs.filter((ct: any) => ct.competenceDate >= startDate && ct.competenceDate <= endDate)
          : normalizedCardTxs;

        // Pedaços dos lançamentos divididos (has_splits) visíveis nesta carga -
        // usados para o filtro de categoria/subcategoria da tela enxergar cada
        // pedaço, não só a categoria única do lançamento pai. Sem isso, um
        // lançamento dividido em Veículo+Alimentação sumia da lista ao filtrar
        // por "Alimentação" se a categoria original dele fosse "Veículo".
        const splitBankIds = (txs || []).filter((t: any) => t.has_splits).map((t: any) => t.id);
        const splitCardIds = normalizedCardTxsInRange.filter((ct: any) => ct.has_splits).map((ct: any) => ct.id);
        const [bankSplitsMap, cardSplitsMap]: [Record<string, TransactionSplit[]>, Record<string, TransactionSplit[]>] = await Promise.all([
          splitBankIds.length ? SplitTransactionService.getSplitsForSources('transaction', splitBankIds) : Promise.resolve({}),
          splitCardIds.length ? SplitTransactionService.getSplitsForSources('card_transaction', splitCardIds) : Promise.resolve({})
        ]);
        const splitsMap: Record<string, TransactionSplit[]> = { ...bankSplitsMap, ...cardSplitsMap };
        if (requestId !== lastRequestId.current) return;

        const matchesSplitAwareFilter = (t: any, list: string[], field: 'category' | 'subcategory') => {
          if (list.length === 0) return true;
          if (t.has_splits) {
            const pieces = splitsMap[t.id] || [];
            return pieces.some(p => list.includes((p[field] as string) || (field === 'subcategory' ? 'Diversos' : 'Sem categoria')));
          }
          return list.includes(t[field]);
        };

        // ── Base banco + cartão sempre itemizada (nunca a fatura resumida) ──
        // Objetivo: banco + cartão somados por categoria (ex: Mercado do débito +
        // Mercado do cartão), sem contar a fatura como um gasto duplicado. Por isso
        // excluímos aqui só o lançamento de "pagamento de fatura" (metadata.is_provision
        // === true, criado em syncStatementToHistory) e somamos as compras individuais
        // do cartão no lugar dele. Isso NÃO altera a tabela de lançamentos nem os totais
        // do topo da página — alimenta o gráfico de categorias E o DRE.
        const dreRaw = [
          ...(txs || []).filter((t: any) => !(t?.metadata?.is_provision === true)),
          ...normalizedCardTxsInRange
        ].map(applyTrueAmount);

        // DRE: sempre a base completa do período (banco + cartão itemizado), sem os
        // filtros da tela de Transações — o DRE tem seus próprios filtros de Tipo/
        // Categoria/Subcategoria (ver DreReportModal), e não pode ser cortado pela
        // paginação nem pelo filtro de Origem (que por padrão esconde compras
        // individuais de cartão em favor da linha resumida "Fatura Cartão").
        setDreSourceTransactions(dreRaw.map((t: any) => ({
          id: t.id,
          description: t.description || '',
          amount: Number(t.amount || 0),
          date: t.date,
          type: t.type as TransactionType,
          accountId: t.account_id,
          accountName: t.account_name ?? '',
          category: t.category ?? 'Sem categoria',
          subcategory: t.subcategory ?? undefined,
          owner_name: t.owner_name ?? 'Pessoal',
          notes: t.notes ?? '',
          tags: t.tags ?? [],
          isDeleted: !!t.is_deleted,
          isReconciled: !!t.is_reconciled,
          isPaid: !!t.is_paid,
          paidAmount: Number(t.paid_amount || 0),
          is_amortization: !!t.is_amortization,
          hasSplits: !!t.has_splits,
          metadata: t.metadata
        })));

        let combinedForChart = [...dreRaw];
        if (filterType !== 'ALL') {
          combinedForChart = combinedForChart.filter((t: any) => t.type === filterType);
        }
        if (filterAccount.length > 0) {
          // Compras de cartão são identificadas pelo card_id (metadata), não pelo
          // account_id (que é a conta bancária vinculada ao cartão, quando existe).
          combinedForChart = combinedForChart.filter((t: any) => matchesAccountFilter(t, filterAccount));
        }
        if (filterSubcategory.length > 0) {
          combinedForChart = combinedForChart.filter((t: any) => matchesSplitAwareFilter(t, filterSubcategory, 'subcategory'));
        }
        if (filterOwner.length > 0) {
          combinedForChart = combinedForChart.filter((t: any) => filterOwner.includes(t.owner_name));
        }
        if (minPrice !== '') {
          combinedForChart = combinedForChart.filter((t: any) => t._trueAmount >= Number(minPrice));
        }
        if (maxPrice !== '') {
          combinedForChart = combinedForChart.filter((t: any) => t._trueAmount <= Number(maxPrice));
        }
        if (debouncedSearch) {
          const searchNormalized = normalize(debouncedSearch);
          combinedForChart = combinedForChart.filter((t: any) =>
            normalize(t.description || '').includes(searchNormalized) ||
            normalize(t.category || '').includes(searchNormalized) ||
            normalize(t.subcategory || '').includes(searchNormalized) ||
            normalize(t.account_name || '').includes(searchNormalized) ||
            normalize(t.owner_name || '').includes(searchNormalized) ||
            normalize(t.notes || '').includes(searchNormalized) ||
            (t.tags || []).some((tag: string) => normalize(tag).includes(searchNormalized))
          );
        }
        setChartCategoryTransactions(combinedForChart.map((t: any) => ({
          id: t.id,
          description: t.description || '',
          amount: Number(t.amount || 0),
          date: t.date,
          // Cartão: agrupa pelo mês de VENCIMENTO da fatura (competenceDate), não
          // pelo mês da compra. Banco: sem competenceDate, cai no fallback = date.
          competenceDate: t.competenceDate ?? t.date,
          type: t.type as TransactionType,
          accountId: t.account_id,
          accountName: t.account_name ?? '',
          category: t.category ?? 'Outros',
          subcategory: t.subcategory ?? undefined,
          owner_name: t.owner_name ?? 'Pessoal',
          notes: t.notes ?? '',
          tags: t.tags ?? [],
          isDeleted: !!t.is_deleted,
          isReconciled: !!t.is_reconciled,
          isPaid: !!t.is_paid,
          paidAmount: Number(t.paid_amount || 0),
          is_amortization: !!t.is_amortization,
          hasSplits: !!t.has_splits,
          // projectChartMetadata preserva isCapitalized/type — sem isso o filtro de
          // movimentos capitalizados (operationalChartCategoryTxs) nunca dá verdadeiro.
          metadata: projectChartMetadata(t)
        })));

        // Origem define qual fonte entra no combined.
        //   CARD    → só compras do cartão (card_transactions)
        //   ACCOUNT → só movimentações bancárias (transactions), inclui o lançamento de pagamento de fatura
        //   ALL     → banco + cartão combinados de verdade: pega as movimentações bancárias
        //             MENOS o lançamento de pagamento de fatura (metadata.is_provision === true,
        //             criado em syncStatementToHistory) e soma no lugar as compras individuais
        //             do cartão — assim "Tudo" mostra o gasto real por lançamento, sem contar a
        //             fatura duas vezes (uma como fatura, outra como cada compra).
        // Esta mesma lógica também alimenta chartCategoryTransactions (usado só pelo gráfico),
        // então o comportamento entre lista e gráfico ficou consistente.
        // v2026.07.17.1830
        let combined = (
          filterOrigin === 'CARD' ? normalizedCardTxsInRange :
          filterOrigin === 'ACCOUNT' ? (txs || []) :
          [
            ...(txs || []).filter((t: any) => !(t?.metadata?.is_provision === true)),
            ...normalizedCardTxsInRange
          ]
        ).map(applyTrueAmount);
        if (filterType !== 'ALL') {
          combined = combined.filter((t: any) => t.type === filterType);
        }
        if (filterAccount.length > 0) {
          // Idem: compras de cartão casam pelo card_id, não pelo account_id.
          combined = combined.filter((t: any) => matchesAccountFilter(t, filterAccount));
        }
        if (filterCategory.length > 0) {
          combined = combined.filter((t: any) => matchesSplitAwareFilter(t, filterCategory, 'category'));
        }
        if (filterSubcategory.length > 0) {
          combined = combined.filter((t: any) => matchesSplitAwareFilter(t, filterSubcategory, 'subcategory'));
        }
        if (filterOwner.length > 0) {
          combined = combined.filter((t: any) => filterOwner.includes(t.owner_name));
        }
        if (minPrice !== '') {
          combined = combined.filter((t: any) => t._trueAmount >= Number(minPrice));
        }
        if (maxPrice !== '') {
          combined = combined.filter((t: any) => t._trueAmount <= Number(maxPrice));
        }
        if (debouncedSearch) {
          const searchNormalized = normalize(debouncedSearch);
          combined = combined.filter((t: any) => 
            normalize(t.description || '').includes(searchNormalized) ||
            normalize(t.category || '').includes(searchNormalized) ||
            normalize(t.subcategory || '').includes(searchNormalized) ||
            normalize(t.account_name || '').includes(searchNormalized) ||
            normalize(t.owner_name || '').includes(searchNormalized) ||
            normalize(t.notes || '').includes(searchNormalized) ||
            (t.tags || []).some((tag: string) => normalize(tag).includes(searchNormalized))
          );
        }

        // Sort combined
        combined.sort((a: any, b: any) => {
          let valA = a[sortField];
          let valB = b[sortField];
          
          if (sortField === 'amount') {
            valA = a._trueAmount;
            valB = b._trueAmount;
          }
          
          if (typeof valA === 'string') {
            const cmp = valA.localeCompare(valB || '');
            return sortDirection === 'asc' ? cmp : -cmp;
          } else {
            const numA = Number(valA || 0);
            const numB = Number(valB || 0);
            if (numA === numB) {
              return new Date(b.date).getTime() - new Date(a.date).getTime();
            }
            return sortDirection === 'asc' ? numA - numB : numB - numA;
          }
        });

        // Update state for chartTransactions (filtered but not paginated)
        setChartTransactions(combined.map((t: any) => ({
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
          notes: t.notes ?? '',
          tags: t.tags ?? [],
          isDeleted: !!t.is_deleted,
          isReconciled: !!t.is_reconciled,
          isPaid: !!t.is_paid,
          paidAmount: Number(t.paid_amount || 0),
          is_amortization: !!t.is_amortization,
          hasSplits: !!t.has_splits,
          metadata: detectLegacySeries(t)
        })));

        // Paginate table transactions
        const paginated = combined.slice(page * PAGE_SIZE, (page * PAGE_SIZE) + PAGE_SIZE);
        
        setTotalCount(combined.length);
        setHasMore(combined.length > (page + 1) * PAGE_SIZE);

        setTransactions(paginated.map((t: any) => {
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
            notes: t.notes ?? '',
            tags: t.tags ?? [],
            isDeleted: t.is_deleted,
            isReconciled: t.is_reconciled,
            isPaid: t.is_paid ?? false,
            paidAmount: Number(t.paid_amount ?? 0),
            paidAt: t.paid_at ?? undefined,
            parentId: t.parent_id ?? null,
            is_incomplete: isIncomplete,
            attachments: t.attachments || [],
            hasSplits: !!t.has_splits,
            metadata: detectLegacySeries(t)
          };
        }));
      };

      // Assinatura do período atual: o cache só é válido se foi gerado para o MESMO intervalo de datas,
      // pois a busca no banco é filtrada por data. Sem isso, ao trocar de período/voltar à página
      // os totais de receita/despesa "piscam" com valores antigos (dados fantasma) antes de corrigir.
      const currentCacheSig = JSON.stringify({ startDate: startDate || '', endDate: endDate || '' });

      // 1. Tentar ler do cache local primeiro para carregar instantaneamente
      let hasCache = false;
      try {
        const cachedSig = localStorage.getItem(`finvision_cached_raw_sig_${user.id}`);
        const cachedRawTxs = localStorage.getItem(`finvision_cached_raw_txs_${user.id}`);
        if (cachedRawTxs && cachedSig === currentCacheSig) {
          accData = JSON.parse(
            localStorage.getItem('finvision_cached_accounts') ||
            localStorage.getItem('finvision_cached_accounts_full') ||
            localStorage.getItem('finvision_cached_accounts_cc') ||
            '[]'
          );
          cardDefsData = JSON.parse(localStorage.getItem('finvision_cached_card_defs') || '[]');
          catData = JSON.parse(
            localStorage.getItem('finvision_cached_categories') ||
            localStorage.getItem('finvision_cached_categories_cc') ||
            '[]'
          );
          subData = JSON.parse(
            localStorage.getItem('finvision_cached_subcategories') ||
            localStorage.getItem('finvision_cached_subcategories_cc') ||
            '[]'
          );
          dbEntities = JSON.parse(
            localStorage.getItem('finvision_cached_owners') ||
            localStorage.getItem('finvision_cached_owners_cc') ||
            '[]'
          );
          entityObjsRes = JSON.parse(
            localStorage.getItem('finvision_cached_owners_objs') ||
            '[]'
          );
          transactionsData = JSON.parse(cachedRawTxs);
          cardTxsData = JSON.parse(localStorage.getItem(`finvision_cached_raw_card_txs_${user.id}`) || '[]');
          cardStatementsData = JSON.parse(localStorage.getItem(`finvision_cached_card_statements_${user.id}`) || '[]');
          hasCache = true;
        }
      } catch (cacheErr) {
        console.warn("History: Falha ao ler cache inicial", cacheErr);
      }

      if (hasCache) {
        renderData(accData, cardDefsData, catData, subData, dbEntities, entityObjsRes, transactionsData, cardTxsData, cardStatementsData);
        setIsLoading(false);
      } else if (!isSilent) {
        setIsLoading(true);
      }

      // Se estiver offline, finaliza de forma segura com os dados locais
      if (!navigator.onLine) {
        return;
      }

      // 2. Busca online atualizada em segundo plano (silent refresh)
      const [accRes, cardDefsRes, catRes, subRes, entitiesRes, entityObjs, cardStatementsRes] = await Promise.all([
        supabase.from('accounts').select('*').eq('is_archived', false),
        // Traz TODOS os cartões (inclusive arquivados): o cálculo de competência
        // (mês de vencimento) precisa do closing_day/due_day mesmo de cartão
        // arquivado, senão as compras antigas dele voltariam a contar pela data
        // da compra. A UI de filtro continua listando só os ativos (renderData).
        supabase.from('cards').select('id, name, last4, closing_day, due_day, is_additional, parent_card_id, sums_into_invoice, is_archived').eq('user_id', user.id),
        supabase.from('categories').select('id, name, type').eq('user_id', user.id).eq('is_archived', false).order('name'),
        supabase.from('subcategories').select('*').eq('user_id', user.id).order('name'),
        FinanceService.getEntities(),
        FinanceService.getEntityObjects(),
        // Vencimento real de cada fatura já criada — usado pra saber em qual mês
        // uma compra de cartão deve contar (mês de vencimento, não mês da compra).
        supabase.from('card_statements').select('id, due_date').eq('user_id', user.id)
      ]);

      if (accRes.error) throw accRes.error;
      if (cardDefsRes.error) throw cardDefsRes.error;
      if (catRes.error) throw catRes.error;
      if (subRes.error) throw subRes.error;

      accData = accRes.data || [];
      cardDefsData = cardDefsRes.data || [];
      catData = catRes.data || [];
      subData = subRes.data || [];
      dbEntities = entitiesRes || [];
      entityObjsRes = entityObjs || [];
      cardStatementsData = cardStatementsRes.data || [];

      // Busca paginada (o Supabase limita o número de linhas por requisição).
      //
      // Antes: um `while` que pedia um bloco, ESPERAVA a resposta, pedia o próximo. Com
      // ~5 mil lançamentos isso virava 5 idas e voltas em fila, e a lista só aparecia
      // depois da última. Pior: o bloco de cartão só começava depois de TODO o de
      // transações terminar. Agora os blocos restantes vão em paralelo e as duas
      // tabelas são carregadas ao mesmo tempo.
      const PAGE = 1000;
      const PARALLEL = 4;

      // Busca TODAS as linhas, com a contagem do servidor como referência e conferência
      // no fim. O ganho é só de tempo: o conjunto de dados devolvido é o completo.
      //
      // Três motivos para não confiar na heurística de "parou de vir bloco cheio":
      //
      // 1) Paginação por faixa (range) só é determinística com ordem explícita. Sem
      //    ORDER BY, o banco não promete a mesma ordem entre duas requisições, então
      //    uma linha pode aparecer em dois blocos ou em nenhum. Por isso toda consulta
      //    aqui ordena por (date, id) — id é a chave primária e serve de critério de
      //    desempate estável.
      // 2) Se um bloco do meio voltasse incompleto, parar ali descartaria os blocos
      //    seguintes junto com os dados deles.
      // 3) Se o servidor limitar a resposta a menos linhas do que pedimos, TODO bloco
      //    chega "incompleto" e a busca terminaria no primeiro — perdendo o resto do
      //    histórico silenciosamente.
      //
      // Com a contagem exata em mãos sabemos quantas linhas têm de chegar, quantos
      // blocos pedir e, no fim, se veio tudo. Nada é inferido.
      const fetchAllRows = async (
        label: string,
        buildQuery: (opts: { from: number; to: number; withCount?: boolean }) => any
      ): Promise<any[]> => {
        // O primeiro bloco já vem com a contagem total no cabeçalho da resposta, então
        // saber o total NÃO custa uma requisição extra. Ele também revela o tamanho de
        // página que o servidor de fato devolve, caso haja um teto menor que o pedido.
        const firstRes = await buildQuery({ from: 0, to: PAGE - 1, withCount: true });
        if (firstRes.error) {
          console.error(`Erro na query de ${label}:`, firstRes.error);
          throw firstRes.error;
        }
        const first = firstRes.data || [];
        const total = firstRes.count ?? first.length;
        const out: any[] = [...first];

        const effectivePage = first.length;
        if (total === 0 || effectivePage === 0 || out.length >= total) return out;

        const pages: number[] = [];
        for (let from = effectivePage; from < total; from += effectivePage) pages.push(from);

        // Os blocos restantes vão em paralelo, de PARALLEL em PARALLEL.
        for (let i = 0; i < pages.length; i += PARALLEL) {
          const slice = pages.slice(i, i + PARALLEL);
          const results = await Promise.all(
            slice.map((from: number) => buildQuery({ from, to: from + effectivePage - 1 }))
          );
          for (const res of results) {
            if (res.error) {
              console.error(`Erro na query de ${label}:`, res.error);
              throw res.error;
            }
            out.push(...(res.data || []));
          }
        }

        // Conferência final. Divergência aqui significa dado faltando ou repetido —
        // preferimos avisar no console a seguir em silêncio com a tela errada.
        if (out.length !== total) {
          console.warn(
            `[History] ${label}: esperado ${total} registro(s), recebido ${out.length}. ` +
            `Refazendo a busca em sequência para garantir que nada ficou de fora.`
          );
          const fallback: any[] = [];
          for (let from = 0; from < total; from += effectivePage) {
            const res = await buildQuery({ from, to: from + effectivePage - 1 });
            if (res.error) throw res.error;
            const rows = res.data || [];
            if (rows.length === 0) break;
            fallback.push(...rows);
          }
          return fallback;
        }

        return out;
      };

      const [allTxs, allCardTxs] = await Promise.all([
        fetchAllRows('transactions', ({ from, to, withCount }) => {
          let q = supabase!.from('transactions')
            .select(
              '*, attachments:documents!documents_transaction_id_fkey(*)',
              withCount ? { count: 'exact' } : undefined
            )
            .eq('user_id', user.id)
            .eq('is_deleted', false);

          if (startDate && endDate) {
            // Fatura em aberto (is_provision) só entra no mês exato do seu vencimento —
            // antes havia uma folga de 60 dias que deixava faturas de outros meses
            // (ex. agosto) aparecerem misturadas na lista/total de julho.
            q = q.gte('date', startDate).lte('date', endDate);
          } else {
            if (startDate) q = q.gte('date', startDate);
            if (endDate) q = q.lte('date', endDate);
          }

          // Ordem explícita: sem ela a paginação por faixa não é determinística e uma
          // linha pode se repetir num bloco ou não aparecer em nenhum.
          return q.order('date', { ascending: false }).order('id', { ascending: true })
                  .range(from, to);
        }),
        fetchAllRows('card_transactions', ({ from, to, withCount }) => {
          // O recorte por período correto (mês de VENCIMENTO da fatura) é aplicado
          // em memória via HistoryUtils.getCardCompetenceDate/card_statements — não
          // pela data da compra. Mas dá pra limitar a busca com uma janela segura:
          // o vencimento nunca é anterior à compra e fica no máximo ~62 dias depois
          // (compra logo após o fechamento + due_day < closing_day vira 2 meses).
          // Então compras com vencimento dentro de [start, end] têm data de compra
          // dentro de [start - 92 dias, end] — folga de 92 dias cobre com sobra,
          // sem precisar baixar o histórico inteiro do usuário a cada carga.
          let q = supabase!.from('card_transactions')
            .select(
              'id, date, amount, description, card_id, statement_id, category_id, category, subcategory, owner_name, notes, tags, is_installment, installment_number, installment_total, installment_group_id, is_recurring, recurrence_period, recurrence_group_id, has_splits, categories(name), cards(account_id, name)',
              withCount ? { count: 'exact' } : undefined
            )
            .eq('user_id', user.id);

          if (startDate) q = q.gte('date', DateUtils.addDaysISO(startDate, -92));
          if (endDate) q = q.lte('date', endDate);

          return q.order('date', { ascending: false }).order('id', { ascending: true })
                  .range(from, to);
        })
      ]);

      transactionsData = allTxs;
      cardTxsData = allCardTxs;

      // Salvar caches atualizados de forma segura
      try {
        localStorage.setItem('finvision_cached_accounts', JSON.stringify(accData));
        localStorage.setItem('finvision_cached_card_defs', JSON.stringify(cardDefsData));
        localStorage.setItem('finvision_cached_categories', JSON.stringify(catData));
        localStorage.setItem('finvision_cached_subcategories', JSON.stringify(subData));
        localStorage.setItem('finvision_cached_owners', JSON.stringify(dbEntities));
        localStorage.setItem('finvision_cached_owners_objs', JSON.stringify(entityObjsRes));
        localStorage.setItem(`finvision_cached_raw_txs_${user.id}`, JSON.stringify(transactionsData));
        localStorage.setItem(`finvision_cached_raw_card_txs_${user.id}`, JSON.stringify(cardTxsData));
        localStorage.setItem(`finvision_cached_card_statements_${user.id}`, JSON.stringify(cardStatementsData));
        localStorage.setItem(`finvision_cached_raw_sig_${user.id}`, currentCacheSig);
      } catch (cacheErr) {
        console.warn("Falha ao salvar cache no localStorage:", cacheErr);
      }

      renderData(accData, cardDefsData, catData, subData, dbEntities, entityObjsRes, transactionsData, cardTxsData, cardStatementsData);
    } catch (err) {
      console.error(err);
      setError('Erro ao carregar dados.');
    } finally {
      setIsLoading(false);
    }
  }, [filterType, filterAccount, filterCategory, filterSubcategory, startDate, endDate, minPrice, maxPrice, filterOwner, filterOrigin, page, sortField, sortDirection, debouncedSearch]);

  const refreshCharts = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  // Reset page to 0 when filters change
  useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
  }, [filterType, JSON.stringify(filterAccount), JSON.stringify(filterCategory), JSON.stringify(filterSubcategory), startDate, endDate, minPrice, maxPrice, JSON.stringify(filterOwner), sortField, sortDirection, debouncedSearch]);

  useEffect(() => {
    if (isSupabaseConfigured) fetchData();
    const handleSyncComplete = () => fetchData();
    window.addEventListener('offline-sync-completed', handleSyncComplete);
    return () => window.removeEventListener('offline-sync-completed', handleSyncComplete);
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

    if (field === 'tags' && typeof value === 'string') {
      value = value.split(',').map(s => s.trim()).filter(s => s !== '');
    }

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
      let cleanValue = value;
      const tx = transactions.find(t => t.id === id);
      if (!tx) return;

      if (field === 'owner_name' && value) {
        const matched = findCloseMatch(value, owners);
        if (matched) cleanValue = matched;
        if (navigator.onLine) {
          cleanValue = await FinanceService.ensureEntityExists(cleanValue);
        }
      }
      if (field === 'category' && value) {
        const names = categoryObjects.map(c => c.name);
        const matched = findCloseMatch(value, names);
        if (matched) cleanValue = matched;
        if (navigator.onLine) await ReconciliationService.ensureCategoryExists(cleanValue);
      }
      if (field === 'subcategory' && value && tx?.category) {
        const subcatNames = subcategories.filter(s => s.category_name === tx.category).map(s => s.name);
        const matched = findCloseMatch(value, subcatNames);
        if (matched) cleanValue = matched;
        if (navigator.onLine) {
          const catId = await ReconciliationService.ensureCategoryExists(tx.category);
          if (catId) await (ReconciliationService as any).ensureSubcategoryExists(catId, cleanValue);
        }
      }

      let patch: any = { [field]: cleanValue };

      if (field === 'amount') {
        let parsedAmt = typeof value === 'string'
          ? Number(value.replace(/\./g, '').replace(',', '.'))
          : Number(value);
        if (isNaN(parsedAmt)) parsedAmt = 0;

        const isNegative = parsedAmt < 0;
        patch = { amount: Math.abs(parsedAmt) };

        // Lançamento TOTALMENTE pago que teve o valor editado: o valor pago acompanha
        // o novo valor. Sem isso, ficava "PAGO R$ 75" com paid_amount 50 e o saldo da
        // conta parado em -50 (o trigger de saldo soma paid_amount, não amount).
        // Parcialmente pago não é tocado (a diferença continua em aberto).
        if (tx && (tx as any).isPaid && !tx.metadata?.is_card) {
          const rawPaid = Number((tx as any).paidAmount || 0);
          const oldAmt = Math.abs(Number(tx.amount || 0));
          const wasFullyPaid = rawPaid <= 0.005 || Math.abs(rawPaid - oldAmt) < 0.005;
          if (wasFullyPaid) {
            patch.paid_amount = Math.abs(parsedAmt);
          }
        }

        if (tx && tx.type === 'TRANSFER') {
          patch.metadata = {
            ...(tx.metadata || {}),
            transfer_side: isNegative ? 'SOURCE' : 'DESTINATION'
          };
        } else if (tx && tx.type !== 'TRANSFER') {
          // Apenas muda o tipo se o usuário explicitamente digitou sinal contrário ao tipo atual
          const currentIsExpense = tx.type === 'EXPENSE';
          if (isNegative && !currentIsExpense) {
            patch.type = 'EXPENSE'; // Usuário quer mudar de receita para despesa
          } else if (!isNegative && currentIsExpense && parsedAmt !== 0) {
            patch.type = 'INCOME'; // Usuário quer mudar de despesa para receita
          }
          // Se isNegative === currentIsExpense: mantém tipo atual, sem mudança
        } else if (!tx) {
          patch.type = isNegative ? 'EXPENSE' : 'INCOME';
        }
      }

      // Handle metadata fields
      if (field === 'counter_account_id') {
        patch = {
          type: 'TRANSFER',
          metadata: { ...(tx?.metadata || {}), is_transfer: true, counter_account_id: cleanValue }
        };
      }

      if (field === 'account_id') {
        const acc = accounts.find(a => a.id === cleanValue);
        if (acc) patch.account_name = acc.institution;
      }

      if (!navigator.onLine && confirmedScope && confirmedScope !== 'ONLY_THIS') {
        toast("Edição em série indisponível offline.", 'warning');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      if (!confirmedScope || confirmedScope === 'ONLY_THIS') {
        // Otimização de UI: atualiza a tela instantaneamente para não dar reload na tabela toda
        setTransactions(prev => prev.map(t => {
          if (t.id === id) {
            let updated = { ...t, ...patch };
            if (field === 'counter_account_id') {
              updated = {
                ...t,
                type: 'TRANSFER' as TransactionType,
                metadata: { ...(t.metadata || {}), is_transfer: true, counter_account_id: cleanValue }
              };
            }
            if (field === 'account_id') {
              updated.accountId = cleanValue;
              const acc = accounts.find(a => a.id === cleanValue);
              if (acc) updated.accountName = acc.institution;
            }
            return updated;
          }
          return t;
        }));

        if (!navigator.onLine) {
          if (tx?.metadata?.is_card) {
            const { offlineQueue } = await import('../lib/offlineQueue.service');
            offlineQueue.addAction('UPDATE_CARD_TRANSACTION', { id, updates: patch });
          } else {
            await FinanceService.updateTransaction(id, patch);
          }
          setSavingId(null);
          setEditingRow(null);
          return;
        }

        if (tx?.metadata?.is_card) {
          let cardPatch = { ...patch };
          if (field === 'category') {
            const { data: catRecord } = await supabase
              .from('categories')
              .select('id')
              .eq('user_id', user.id)
              .ilike('name', cleanValue)
              .maybeSingle();
            if (catRecord) {
              cardPatch.category_id = catRecord.id;
              cardPatch.category = cleanValue;
            }
          }
          const { error } = await supabase.from('card_transactions').update(cardPatch).eq('id', id).eq('user_id', user.id);
          if (error) throw error;

          if (tx.metadata?.statement_id) {
            await FinanceService.syncStatementToHistory(tx.metadata.statement_id);
          }
        } else {
          await FinanceService.updateTransaction(id, patch);

          // Sync counterparts of transfer
          if (tx && tx.type === 'TRANSFER' && tx.metadata?.is_transfer) {
            const otherSide = tx.metadata.transfer_side === 'SOURCE' ? 'DESTINATION' : 'SOURCE';
            const { data: counterparts } = await supabase
              .from('transactions')
              .select('id, account_id')
              .eq('date', tx.date)
              .eq('amount', tx.amount)
              .eq('type', 'TRANSFER')
              .eq('description', tx.description)
              .eq('metadata->>is_transfer', 'true')
              .eq('metadata->>transfer_side', otherSide)
              .eq('account_id', tx.metadata.counter_account_id)
              .eq('is_deleted', false)
              .limit(1);

            if (counterparts && counterparts.length > 0) {
              const counterpartId = counterparts[0].id;
              let counterpartPatch: any = {};
              if (field === 'amount') {
                let parsedAmt = typeof value === 'string'
                  ? Number(value.replace(/\./g, '').replace(',', '.'))
                  : Number(value);
                const absAmt = isNaN(parsedAmt) ? 0 : Math.abs(parsedAmt);
                counterpartPatch = { amount: absAmt, paid_amount: absAmt };
              } else if (field === 'date') {
                counterpartPatch = { date: cleanValue };
              } else if (field === 'description') {
                counterpartPatch = { description: cleanValue };
              }

              if (Object.keys(counterpartPatch).length > 0) {
                await supabase.from('transactions').update(counterpartPatch).eq('id', counterpartId);
                if (field === 'amount') {
                  await supabase.rpc('recalculate_account_balance', { p_account_id: counterparts[0].account_id });
                }
                setTransactions(prev => prev.map(t => {
                  if (t.id === counterpartId) {
                    let updated = { ...t, ...counterpartPatch };
                    if (field === 'amount') {
                      updated.amount = counterpartPatch.amount;
                      updated.paidAmount = counterpartPatch.paid_amount;
                    }
                    return updated;
                  }
                  return t;
                }));
              }
            }
          }
        }

        // Update Local Cache in localStorage
        try {
          if (tx?.metadata?.is_card) {
            const cacheKey = `finvision_cached_raw_card_txs_${user.id}`;
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
              const list = JSON.parse(cached);
              const updatedList = list.map((item: any) => {
                if (item.id === id) {
                  let updatedItem = { ...item, ...patch };
                  if (field === 'category') {
                    updatedItem.category = cleanValue;
                  }
                  return updatedItem;
                }
                return item;
              });
              localStorage.setItem(cacheKey, JSON.stringify(updatedList));
            }
          } else {
            const cacheKey = `finvision_cached_raw_txs_${user.id}`;
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
              const list = JSON.parse(cached);
              const updatedList = list.map((item: any) => {
                if (item.id === id) {
                  return { ...item, ...patch };
                }
                return item;
              });
              localStorage.setItem(cacheKey, JSON.stringify(updatedList));
            }
          }
        } catch (cacheErr) {
          console.warn("Error updating local storage cache on update:", cacheErr);
        }
      } else {
        if (field === 'date') {
          // Fetch the transactions to update first
          let selectQuery = supabase.from('transactions').select('*').eq('is_deleted', false);
          selectQuery = buildSeriesFilter(selectQuery, tx);
          if (confirmedScope === 'THIS_AND_FUTURE') {
            selectQuery = selectQuery.gte('date', tx?.date);
          }
          
          const { data: txsToUpdate, error: fetchErr } = await selectQuery;
          if (fetchErr) throw fetchErr;
          
          if (txsToUpdate && txsToUpdate.length > 0) {
            const parseDate = (dStr: string) => {
              if (dStr) {
                const clean = dStr.split(/[ T]/)[0]; // get 'YYYY-MM-DD'
                const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
                if (match) {
                  return {
                    year: parseInt(match[1], 10),
                    month: parseInt(match[2], 10),
                    day: parseInt(match[3], 10)
                  };
                }
              }
              const dateObj = new Date(dStr);
              if (!isNaN(dateObj.getTime())) {
                return {
                  year: dateObj.getUTCFullYear(),
                  month: dateObj.getUTCMonth() + 1,
                  day: dateObj.getUTCDate()
                };
              }
              return { year: 2026, month: 6, day: 6 };
            };
            
            const origParsed = parseDate(tx.date);
            const newParsed = parseDate(value);
            const targetDay = newParsed.day;
            
            // Ordenar todas as transações da série cronologicamente por data original
            const sortedTxs = [...txsToUpdate].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            
            // Achar o índice da transação atual na lista ordenada
            const txIndex = sortedTxs.findIndex(t => t.id === tx.id);
            
            if (txIndex !== -1) {
              const updatePromises = sortedTxs.map((t: any, idx: number) => {
                // Se a transação já estiver paga, ela NUNCA deve ser alterada (retroativas ou futuras)
                if (t.is_paid) return Promise.resolve(null);
                
                const offsetMonths = idx - txIndex;
                
                if (offsetMonths === 0) {
                  // É a própria transação editada. Atualiza com a nova data 'value'.
                  const finalDateStr = `${value} 00:00:00+00`;
                  return supabase.from('transactions').update({ date: finalDateStr }).eq('id', t.id);
                } else {
                  // Transações futuras ou passadas (offsetMonths !== 0) se não pagas:
                  // calcula 'value' + offsetMonths meses
                  let newMonth = newParsed.month + offsetMonths;
                  let newYear = newParsed.year;
                  
                  while (newMonth > 12) {
                    newMonth -= 12;
                    newYear += 1;
                  }
                  while (newMonth < 1) {
                    newMonth += 12;
                    newYear -= 1;
                  }
                  
                  let newDay;
                  if (newMonth === 2 && targetDay >= 29) {
                    newDay = 28;
                  } else {
                    const lastDay = new Date(Date.UTC(newYear, newMonth, 0)).getUTCDate();
                    newDay = Math.min(targetDay, lastDay);
                  }
                  
                  const pad = (n: number) => String(n).padStart(2, '0');
                  const newDateStr = `${newYear}-${pad(newMonth)}-${pad(newDay)}`;
                  const finalDateStr = `${newDateStr} 00:00:00+00`;
                  
                  return supabase.from('transactions').update({ date: finalDateStr }).eq('id', t.id);
                }
              });
              
              const results = await Promise.all(updatePromises);
              const errorResult = results.find(r => r && r.error);
              if (errorResult && errorResult.error) throw errorResult.error;
            }
          }
        } else {
          let updateQuery = supabase.from('transactions').update(patch).eq('is_deleted', false);
          updateQuery = buildSeriesFilter(updateQuery, tx);
          if (confirmedScope === 'THIS_AND_FUTURE') {
            updateQuery = updateQuery.gte('date', tx?.date);
          }
          const { error: err } = await updateQuery;
          if (err) throw err;
        }

        // Reload completo só quando altera parcelas e assinaturas (múltiplas linhas)
        await fetchData(true);
      }

      if (tx && (HistoryUtils.getStatus(tx) !== 'PENDING') && (field === 'amount' || field === 'type' || field === 'account_id')) {
        await supabase.rpc('recalculate_account_balance', { p_account_id: field === 'account_id' ? value : tx.accountId });
        if (field === 'account_id' && tx.accountId !== value) await supabase.rpc('recalculate_account_balance', { p_account_id: tx.accountId });
      }
    } catch (err) {
      toast('Erro ao salvar alteração. Tente novamente.', 'error');
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
      toast("Exclusão em série indisponível offline.", 'warning');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      if (tx?.metadata?.is_card) {
        if (!navigator.onLine) {
          const { offlineQueue } = await import('../lib/offlineQueue.service');
          offlineQueue.addAction('DELETE_CARD_TRANSACTION', { id });
          setTransactions(prev => prev.filter(t => t.id !== id));
          setSeriesModal({ show: false, tx: null, pendingAction: 'DELETE' });
          return;
        }

        if (!confirmedScope || confirmedScope === 'ONLY_THIS') {
          const { error } = await supabase.from('card_transactions').delete().eq('id', id).eq('user_id', user.id);
          if (error) throw error;
        } else {
          const groupId = tx?.metadata?.installment_group_id || tx?.metadata?.recurrence_group_id;
          let query = supabase.from('card_transactions').delete().eq('user_id', user.id);

          if (tx?.metadata?.installment_group_id) query = query.eq('installment_group_id', groupId);
          else query = query.eq('recurrence_group_id', groupId);

          if (confirmedScope === 'THIS_AND_FUTURE') {
            query = query.gte('date', tx?.date);
          }

          const { error } = await query;
          if (error) throw error;
        }

        if (tx.metadata?.statement_id) {
          await FinanceService.syncStatementToHistory(tx.metadata.statement_id);
        }
      } else {
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
          let query = supabase.from('transactions').update({ is_deleted: true });
          query = buildSeriesFilter(query, tx);
          if (confirmedScope === 'THIS_AND_FUTURE') query = query.gte('date', tx?.date);
          const { error } = await query;
          if (error) throw error;
        }

        if (tx && HistoryUtils.getStatus(tx) !== 'PENDING') {
          await supabase.rpc('recalculate_account_balance', { p_account_id: tx.accountId });
        }
      }

      // Update Local Cache in localStorage
      try {
        if (tx?.metadata?.is_card) {
          const cacheKey = `finvision_cached_raw_card_txs_${user.id}`;
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const list = JSON.parse(cached);
            const updatedList = list.filter((item: any) => item.id !== id);
            localStorage.setItem(cacheKey, JSON.stringify(updatedList));
          }
        } else {
          const cacheKey = `finvision_cached_raw_txs_${user.id}`;
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const list = JSON.parse(cached);
            const updatedList = list.filter((item: any) => item.id !== id);
            localStorage.setItem(cacheKey, JSON.stringify(updatedList));
          }
        }
      } catch (cacheErr) {
        console.warn("Error updating local storage cache on delete:", cacheErr);
      }

      await fetchData();
    } catch (err) {
      toast('Erro ao excluir. Tente novamente.', 'error');
    } finally {
      setSeriesModal({ show: false, tx: null, pendingAction: 'DELETE' });
    }
  };

  const handleUploadAttachment = async (id: string, file: File) => {
    setSavingId(id);
    try {
      if (!supabase) return;
      await FinanceService.uploadAttachment(file, id, false);
      
      // Fetch specifically the new attachments for this transaction to avoid full reload
      const { data: newAttachments } = await supabase
        .from('documents')
        .select('*')
        .eq('transaction_id', id);

      if (newAttachments) {
        setTransactions(prev => prev.map(t => 
          t.id === id ? { ...t, attachments: newAttachments } : t
        ));
      }
    } catch (err: any) {
      toast(`Erro ao fazer upload: ${err.message}`, 'error');
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
      
      // Update local state by removing the attachment
      setTransactions(prev => prev.map(t => 
        t.id === txId 
          ? { ...t, attachments: t.attachments?.filter((a: any) => a.id !== documentId) } 
          : t
      ));
    } catch (err: any) {
      toast(`Erro ao excluir anexo: ${err.message}`, 'error');
    } finally {
      setTimeout(() => setSavingId(null), 500);
    }
  };

  const handleViewAttachment = async (documentId: string) => {
    try {
      const url = await FinanceService.getAttachmentUrl(documentId);
      if (url) {
        window.open(url, '_blank');
      } else {
        toast('Anexo não encontrado.', 'error');
      }
    } catch (err: any) {
      toast(`Erro ao abrir anexo: ${err.message}`, 'error');
    }
  };

  const resetFilters = () => {
    setFilterType('ALL'); setFilterCategory([]);
    setFilterSubcategory([]); setFilterOrigin('ALL');
    setStartDate(DateUtils.formatToISODate(firstDay));
    setEndDate(DateUtils.formatToISODate(lastDay));
    setMinPrice(''); setMaxPrice('');
    setSearch('');

    const defaultIncludeNonSumming = localStorage.getItem('finvision_default_include_non_summing') === 'true';
    if (!defaultIncludeNonSumming) {
      const summingAccountIds = accounts.filter(a => a.includeInDashboard).map(a => a.id);
      // Cartões não têm flag "includeInDashboard" — sempre entram, senão o reset de
      // filtros volta a esconder as compras de cartão (mesmo bug do carregamento inicial).
      setFilterAccount([...summingAccountIds, ...cards.map(c => c.id)]);
    } else {
      setFilterAccount([]);
    }

    const cachedObjs = localStorage.getItem('finvision_cached_owners_objs');
    if (cachedObjs) {
      try {
        const objs = JSON.parse(cachedObjs);
        const excludedSet = new Set(objs.filter((e: any) => e.include_in_totals === false).map((e: any) => e.name));
        if (excludedSet.size > 0) {
          const activeOwners = owners.filter(name => !excludedSet.has(name));
          setFilterOwner(activeOwners);
          return;
        }
      } catch (e) {}
    }
    setFilterOwner([]);
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
      toast("Categorização por IA requer conexão com a internet.", 'warning');
      return;
    }

    setIsCategorizingAI(true);
    try {
      const selectedTxs = transactions.filter(t => selectedIds.has(t.id));
      const needsCategory = selectedTxs.filter(t => !t.category || t.category === '' || t.category === 'Outros' || t.category === 'Conciliação');
      const uniqueDescriptions = Array.from(new Set(needsCategory.map(t => t.description)));

      if (uniqueDescriptions.length === 0) {
        toast("Transações selecionadas já possuem categorias. Selecione outras.", 'info');
        return;
      }

      const res = await fetch('/api/categorize-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descriptions: uniqueDescriptions, categories: availableCategories, userId })
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
      toast(`IA categorizou ${updatedCount} transação(ões) com sucesso.`, 'success');
    } catch (err: any) {
      console.error(err);
      toast("Erro na IA: " + err.message, 'error');
    } finally {
      setIsCategorizingAI(false);
    }
  };

  const handleBulkUpdate = async () => {
    if (selectedIds.size === 0 || !supabase) return;

    if (!navigator.onLine) {
      toast("Edição em lote indisponível sem conexão.", 'warning');
      return;
    }

    if (!bulkDescription && !bulkAccount && !bulkCategory && !bulkSubcategory && !bulkOwner) {
      { toast("Preencha ao menos um campo para editar em lote.", 'warning'); return; };
    }

    if (!window.confirm(`Deseja atualizar ${selectedIds.size} lançamentos?`)) return;

    setIsBulkUpdating(true);
    try {
      let cleanOwner = bulkOwner;
      let cleanCategory = bulkCategory;
      let cleanSubcategory = bulkSubcategory;

      if (bulkOwner && bulkOwner !== 'Pessoal') {
        const matched = findCloseMatch(bulkOwner, owners);
        if (matched) cleanOwner = matched;
        if (navigator.onLine) cleanOwner = await FinanceService.ensureEntityExists(cleanOwner);
      }
      if (bulkCategory) {
        const matched = findCloseMatch(bulkCategory, availableCategories);
        if (matched) cleanCategory = matched;
        if (navigator.onLine) {
          const catId = await ReconciliationService.ensureCategoryExists(cleanCategory);
          if (catId && cleanSubcategory) {
            const subcatNames = subcategories.filter(s => s.category_name === cleanCategory).map(s => s.name);
            const subMatched = findCloseMatch(cleanSubcategory, subcatNames);
            if (subMatched) cleanSubcategory = subMatched;
            await ReconciliationService.ensureSubcategoryExists(catId, cleanSubcategory);
          }
        }
      } else if (cleanSubcategory) {
        // Editando só a subcategoria (sem trocar a categoria): os itens selecionados podem
        // ter categorias diferentes entre si, então só corrigimos a digitação comparando com
        // todas as subcategorias já cadastradas, sem tentar registrar/criar (isso é feito por
        // categoria e aqui não temos uma única categoria de referência).
        const allSubcatNames = subcategories.map(s => s.name);
        const subMatched = findCloseMatch(cleanSubcategory, allSubcatNames);
        if (subMatched) cleanSubcategory = subMatched;
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
      if (cleanCategory) patch.category = cleanCategory;
      if (cleanSubcategory) patch.subcategory = cleanSubcategory;
      if (cleanOwner) patch.owner_name = cleanOwner;

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
      toast("Lote atualizado com sucesso!", 'success');
    } catch (err) {
      toast("Erro ao atualizar lote. Tente novamente.", 'error');
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !supabase) return;

    if (!navigator.onLine) {
      toast('A exclusão em lote está indisponível sem conexão com a internet.', 'warning');
      return;
    }

    if (!window.confirm(`Excluir ${selectedIds.size} lançamentos permanentemente?`)) return;

    setIsBulkUpdating(true);
    try {
      const ids = Array.from(selectedIds);
      const cardIds = ids.filter(id => transactions.find(t => t.id === id)?.metadata?.is_card);
      const bankIds = ids.filter(id => !transactions.find(t => t.id === id)?.metadata?.is_card);

      if (bankIds.length > 0) {
        const { error: err } = await supabase.from('transactions').update({ is_deleted: true }).in('id', bankIds);
        if (err) throw err;
      }
      if (cardIds.length > 0) {
        const { error: errCard } = await supabase.from('card_transactions').delete().in('id', cardIds);
        if (errCard) throw errCard;
      }

      await fetchData();
      setSelectedIds(new Set());
      toast(`${ids.length} lançamento(s) excluído(s) com sucesso.`, 'success');
    } catch (err) {
      toast('Erro ao excluir lote. Tente novamente.', 'error');
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
      Perfil: t.owner_name || 'Pessoal',
      Tipo: t.type,
      Valor: (t.type === 'EXPENSE' ? -1 : 1) * t.amount,
      Status: HistoryUtils.getStatus(t)
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transações');
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
    setShowDreModal(true);
  };

  const openPayModal = (tx: Transaction) => {
    const remaining = HistoryUtils.getRemaining(tx);
    setPayModal({
      open: true,
      tx,
      remaining,
      payAmount: String(remaining.toFixed(2)),
      payAccountId: tx.accountId,
      payDate: (tx.date || '').split('T')[0] || DateUtils.formatToISODate(),
      payRemainderDate: DateUtils.formatToISODate(),
      splitRemainder: false,
      isSubmitting: false
    });
  };

  const submitPayment = async () => {
    if (!supabase || !payModal.open) return;
    const amount = Number(payModal.payAmount.replace(',', '.'));
    
    if (isNaN(amount) || amount <= 0) {
      setPayModal(prev => prev.open ? { ...prev, error: 'Por favor, insira um valor válido maior que zero (ex: 120,50).' } : prev);
      return;
    }
    if (amount > payModal.remaining + EPS) {
      setPayModal(prev => prev.open ? { ...prev, error: 'O valor do pagamento não pode ser maior que o saldo restante.' } : prev);
      return;
    }

    setPayModal(prev => prev.open ? { ...prev, isSubmitting: true, error: null } : prev);
    try {
      const chosenDate = payModal.payDate || payModal.tx.date || DateUtils.formatToISODate();
      const payAccId = payModal.payAccountId || payModal.tx.accountId;
      const payAcc = accounts.find(a => a.id === payAccId);
      const accountName = payAcc ? (payAcc.institution || '') : '';
      
      const isPartial = amount < payModal.remaining - EPS;
      
      if (isPartial && payModal.splitRemainder) {
        // --- NOVO FLUXO DE PAGAMENTO PARCIAL COM DIVISÃO ---
        const groupId = payModal.tx.metadata?.partial_payment_group_id || 'group-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
        const newPayment = {
          date: chosenDate,
          account_name: accountName,
          amount: amount
        };
        const oldHistory = Array.isArray(payModal.tx.metadata?.payment_history) ? payModal.tx.metadata.payment_history : [];
        const newHistory = [...oldHistory, newPayment];
        
        // 1. Atualizar a transação atual Tx A
        const updatedMeta = {
          ...(payModal.tx.metadata || {}),
          partial_payment_group_id: groupId,
          payment_history: newHistory
        };
        
        await supabase.from('transactions').update({
          amount: amount,
          is_paid: true,
          paid_amount: amount,
          paid_at: chosenDate,
          date: chosenDate,
          account_id: payAccId,
          account_name: accountName,
          metadata: updatedMeta
        }).eq('id', payModal.tx.id);
        
        // 2. Inserir a nova transação do restante Tx B
        const remainderAmount = payModal.remaining - amount;
        const remainderMeta = {
          ...(payModal.tx.metadata || {}),
          partial_payment_group_id: groupId,
          payment_history: newHistory
        };
        
        await supabase.from('transactions').insert([{
          user_id: payModal.tx.user_id || null,
          description: payModal.tx.description,
          amount: remainderAmount,
          date: payModal.payRemainderDate || DateUtils.formatToISODate(),
          type: payModal.tx.type,
          category: payModal.tx.category,
          category_id: payModal.tx.category_id || null,
          subcategory: payModal.tx.subcategory || null,
          account_id: payModal.tx.accountId,
          account_name: payModal.tx.accountName || '',
          owner_name: payModal.tx.owner_name || null,
          notes: payModal.tx.notes || '',
          tags: payModal.tx.tags || [],
          attachments: payModal.tx.attachments || [],
          liability_id: payModal.tx.liability_id || null,
          is_paid: false,
          paid_amount: 0,
          paid_at: null,
          metadata: remainderMeta
        }]);
        
        // 3. Atualizar o histórico em todas as transações do mesmo grupo
        const { data: groupTxs } = await supabase
          .from('transactions')
          .select('id, metadata')
          .eq('metadata->>partial_payment_group_id', groupId);
          
        if (groupTxs && groupTxs.length > 0) {
          for (const gTx of groupTxs) {
            if (gTx.id !== payModal.tx.id) {
              const gUpdatedMeta = {
                ...(gTx.metadata || {}),
                payment_history: newHistory
              };
              await supabase.from('transactions').update({ metadata: gUpdatedMeta }).eq('id', gTx.id);
            }
          }
        }
      } else {
        // --- FLUXO DE PAGAMENTO CONVENCIONAL ---
        const isFullyPaid = amount >= payModal.remaining - EPS;
        const newPaidAmount = (payModal.tx.paidAmount || 0) + amount;
        
        const groupId = payModal.tx.metadata?.partial_payment_group_id || 'group-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
        const newPayment = {
          date: chosenDate,
          account_name: accountName,
          amount: amount
        };
        const oldHistory = Array.isArray(payModal.tx.metadata?.payment_history) ? payModal.tx.metadata.payment_history : [];
        const newHistory = [...oldHistory, newPayment];
        
        const updatedMeta = {
          ...(payModal.tx.metadata || {}),
          partial_payment_group_id: groupId,
          payment_history: newHistory
        };
        
        await supabase.from('transactions').update({
          is_paid: isFullyPaid,
          paid_amount: isFullyPaid ? payModal.tx.amount : newPaidAmount,
          paid_at: chosenDate,
          date: chosenDate,
          account_id: payAccId,
          account_name: accountName,
          metadata: updatedMeta
        }).eq('id', payModal.tx.id);
        
        // Sincronizar o histórico de pagamentos para o grupo se pertencer a um grupo
        const { data: groupTxs } = await supabase
          .from('transactions')
          .select('id, metadata')
          .eq('metadata->>partial_payment_group_id', groupId);
          
        if (groupTxs && groupTxs.length > 0) {
          for (const gTx of groupTxs) {
            if (gTx.id !== payModal.tx.id) {
              const gUpdatedMeta = {
                ...(gTx.metadata || {}),
                payment_history: newHistory
              };
              await supabase.from('transactions').update({ metadata: gUpdatedMeta }).eq('id', gTx.id);
            }
          }
        }
      }
      
      // Recalcular saldo das contas
      if (payAccId !== payModal.tx.accountId) {
        await supabase.rpc('recalculate_account_balance', { p_account_id: payModal.tx.accountId });
      }
      await supabase.rpc('recalculate_account_balance', { p_account_id: payAccId });
      
      // Sincronização Bidirecional: Se for pagamento de fatura, atualiza o status na tabela de cartões
      if (payModal.tx.type === 'BILL_PAYMENT') {
        const stmtId = payModal.tx.metadata?.card_statement_id || payModal.tx.metadata?.statement_id;
        if (stmtId) {
          const isFullyPaid = amount >= payModal.remaining - 0.01;
          const { data: stmt } = await supabase.from('card_statements').select('paid_amount').eq('id', stmtId).maybeSingle();
          await supabase.from('card_statements').update({
            status: isFullyPaid ? 'PAID' : 'OPEN',
            paid_amount: (stmt?.paid_amount || 0) + amount
          }).eq('id', stmtId);
        }
      }

      setPayModal({ open: false });
      await fetchData(true); // Silent refresh
    } catch (err) {
      console.error(err);
      setPayModal(prev => prev.open ? { ...prev, isSubmitting: false, error: 'Erro ao processar pagamento.' } : prev);
    }
  };

  const createManualTransaction = async (formData: any) => {
    if (!supabase) return;
    const f = formData;
    const amount = Math.abs(Number(f.amount.replace(',', '.')));
    
    // Improved Validation
    if (!f.description.trim()) {
      setAddModal(prev => ({ ...prev, error: 'A descrição é obrigatória.' }));
      return;
    }
    if (!f.accountId) {
      setAddModal(prev => ({ ...prev, error: 'Selecione uma conta bancária.' }));
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      setAddModal(prev => ({ ...prev, error: 'O valor deve ser um número válido maior que zero.' }));
      return;
    }

    setAddModal(prev => ({ ...prev, isSubmitting: true, error: null }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      const userId = user?.id || 'offline-user';

      // Typo correction for manual insertion
      if (f.ownerName && f.ownerName !== 'Pessoal') {
        const matched = findCloseMatch(f.ownerName, owners);
        if (matched) f.ownerName = matched;
      }
      if (f.category) {
        const matched = findCloseMatch(f.category, availableCategories);
        if (matched) f.category = matched;
      }
      if (f.subcategory && f.category) {
        const subcatNames = subcategories.filter(s => s.category_name === f.category).map(s => s.name);
        const matched = findCloseMatch(f.subcategory, subcatNames);
        if (matched) f.subcategory = matched;
      }

      if (navigator.onLine) {
        if (f.ownerName && f.ownerName !== 'Pessoal') await FinanceService.ensureEntityExists(f.ownerName);
        if (f.category) {
          const catId = await ReconciliationService.ensureCategoryExists(f.category);
          if (catId && f.subcategory) await (ReconciliationService as any).ensureSubcategoryExists(catId, f.subcategory);
        }
      }

      const isTransfer = (f.category?.toLowerCase() || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer') || (f.description?.toLowerCase() || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('transfer');
      let createdTxId: string | null = null;
      const targetAcc = accounts.find(a => a.id === f.accountId);
      const accountName = targetAcc?.institution || 'Conta';

      if (!f.isInstallment && !f.isRecurring) {
        if (!navigator.onLine) {
          const newTx = {
            date: f.date, description: f.description, amount, type: f.type,
            account_id: f.accountId, category: f.category, subcategory: f.subcategory || null, is_paid: false, paid_amount: 0,
            owner_name: f.ownerName === 'Pessoal' ? null : f.ownerName,
            notes: f.notes || '',
            tags: f.tags || []
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
              notes: f.notes || '',
              tags: f.tags || [],
              metadata: { is_transfer: true, transfer_side: 'SOURCE', counter_account_id: f.destinationAccountId }
            },
            {
              user_id: user?.id, date: f.date, description: `[TRANSF] ${f.description}`, amount, type: 'TRANSFER',
              account_id: f.destinationAccountId, account_name: accDest?.institution || 'Conta Destino', category: f.category, subcategory: f.subcategory || null, is_paid: true, paid_amount: amount, paid_at: f.date,
              owner_name: f.ownerName === 'Pessoal' ? null : f.ownerName,
              notes: f.notes || '',
              tags: f.tags || [],
              metadata: { is_transfer: true, transfer_side: 'DESTINATION', counter_account_id: f.accountId }
            }
          ]).select('id');
          if (insertErr) throw insertErr;
          createdTxId = data?.[0]?.id;
        } else {
          const { data, error: insertErr } = await supabase.from('transactions').insert({
            user_id: user?.id, date: f.date, description: f.description, amount, type: f.type,
            account_id: f.accountId, category: f.category, subcategory: f.subcategory || null,
            is_paid: f.isPaidNow === true,
            paid_amount: f.isPaidNow === true ? amount : 0,
            paid_at: f.isPaidNow === true ? f.date : null,
            owner_name: f.ownerName === 'Pessoal' ? null : f.ownerName,
            notes: f.notes || '',
            tags: f.tags || []
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
          notes: f.notes || '',
          tags: f.tags || [],
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

      // Divisão em categorias, quando o usuário preencheu os pedaços no formulário
      if (createdTxId && f.splits && f.splits.length > 0) {
        try {
          await SplitTransactionService.saveSplits('transaction', createdTxId, f.splits);
        } catch (splitErr: any) {
          console.error('Erro ao salvar divisão do lançamento:', splitErr);
          toast('Lançamento criado, mas não foi possível salvar a divisão. Abra o lançamento e divida de novo.', 'error');
        }
      }

      setAddModal({ open: false });
      
      // Optimistic UI for simple transactions
      if (!f.isInstallment && !f.isRecurring && createdTxId) {
        const newLocalTx: Transaction = {
          id: createdTxId,
          description: f.description,
          amount: amount,
          date: f.date,
          type: f.type,
          accountId: f.accountId,
          accountName: accountName,
          category: f.category,
          subcategory: f.subcategory,
          owner_name: f.ownerName,
          notes: f.notes || '',
          tags: f.tags || [],
          isPaid: false,
          paidAmount: 0,
          hasSplits: !!(f.splits && f.splits.length > 0),
          metadata: { is_transfer: isTransfer },
          attachments: []
        };
        setTransactions(prev => [newLocalTx, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        await fetchData(true); // Silent refresh
      } else {
        await fetchData(true);
      }
    } catch (err: any) {
      setAddModal(prev => ({ ...prev, isSubmitting: false, error: err.message || 'Erro ao criar transação.' }));
    }
  };

  const statusBadge = (t: Transaction) => {
    const s = HistoryUtils.getStatus(t);
    const base = "px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest border";
    if (s === 'PAID') return <span className={`${base} bg-emerald-50 text-emerald-600 border-emerald-100`}>PAGO</span>;
    if (s === 'PARTIAL') return <span className={`${base} bg-amber-50 text-amber-600 border-amber-100`}>PARCIAL</span>;
    return <span className={`${base} bg-slate-50 text-slate-400 border-slate-100`}>PENDENTE</span>;
  };

  const viewFilteredBase = viewMode === 'SETTLED'
    ? transactions.filter(t => HistoryUtils.getStatus(t) === 'PAID')
    : viewMode === 'PENDING'
      ? transactions.filter(t => HistoryUtils.getStatus(t) !== 'PAID')
      : transactions;

  // Filtro opcional "só possíveis duplicados" (marcados na importação por Diversos).
  const viewFiltered = showOnlyDuplicates
    ? viewFilteredBase.filter(t => (t.metadata as any)?.potential_duplicate)
    : viewFilteredBase;

  // Quantos possíveis duplicados existem na lista atual (pra mostrar no botão do filtro).
  const duplicateCount = transactions.filter(t => (t.metadata as any)?.potential_duplicate).length;

  // Exclui movimentos de patrimônio capitalizados dos gráficos/resumo (mesma regra do Painel e Relatórios)
  const operationalChartTxs = chartTransactions.filter(t => !isCapitalizedMovement(t));
  const chartViewFiltered = viewMode === 'SETTLED'
    ? operationalChartTxs.filter(t => HistoryUtils.getStatus(t) === 'PAID')
    : viewMode === 'PENDING'
      ? operationalChartTxs.filter(t => HistoryUtils.getStatus(t) !== 'PAID')
      : operationalChartTxs;

  // Mesma regra acima, mas para o dataset combinado (banco + cartão) do gráfico de categorias
  const operationalChartCategoryTxs = chartCategoryTransactions.filter(t => !isCapitalizedMovement(t));
  const chartCategoryViewFiltered = viewMode === 'SETTLED'
    ? operationalChartCategoryTxs.filter(t => HistoryUtils.getStatus(t) === 'PAID')
    : viewMode === 'PENDING'
      ? operationalChartCategoryTxs.filter(t => HistoryUtils.getStatus(t) !== 'PAID')
      : operationalChartCategoryTxs;

  const handleCreateCategory = async (name: string, type: 'INCOME' | 'EXPENSE') => {
    if (!supabase) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;
      await supabase.from('categories').insert({ user_id: user.id, name, type, color: 'bg-brand-50 text-brand-600' });
      await fetchData(); // Refetch the list
    } catch (err) { toast('Erro ao criar categoria inline.', 'error'); }
  };

  const fetchSlotTotals = async (start: string, end: string) => {
    let rawTxs: any[] = [];
    let rawCardTxs: any[] = [];
    // Cartões/faturas para o cálculo de competência: busca fresco quando online
    // (o usuário pode abrir "Comparar Períodos" antes do fetchData principal
    // terminar de preencher os estados — sem isso, os totais dos slots contariam
    // as compras pelo mês da compra em vez do vencimento). Offline: usa o estado.
    let slotCardDefs: any[] = allCardMeta;
    let slotStatements: { id: string; due_date: string }[] = cardStatements;
    if (navigator.onLine && supabase && userId) {
      try {
        const [txsRes, cardTxsRes, cardsRes, stmtsRes] = await Promise.all([
          supabase
            .from('transactions')
            .select('*')
            .eq('user_id', userId)
            .eq('is_deleted', false)
            .gte('date', start)
            .lte('date', end),
          // Janela segura: vencimento nunca é anterior à compra e no máximo ~62
          // dias depois — 92 dias de folga cobre; recorte exato vem abaixo.
          supabase
            .from('card_transactions')
            .select('*, categories(name), cards(account_id, name)')
            .eq('user_id', userId)
            .gte('date', DateUtils.addDaysISO(start, -92))
            .lte('date', end),
          // Inclui arquivados: competência precisa do fechamento/vencimento deles.
          supabase
            .from('cards')
            .select('id, closing_day, due_day, is_additional, parent_card_id, sums_into_invoice')
            .eq('user_id', userId),
          supabase
            .from('card_statements')
            .select('id, due_date')
            .eq('user_id', userId)
        ]);
        rawTxs = txsRes.data || [];
        rawCardTxs = cardTxsRes.data || [];
        if (cardsRes.data) {
          slotCardDefs = cardsRes.data.map((c: any) => ({
            id: c.id,
            closingDay: c.closing_day,
            dueDay: c.due_day,
            isAdditional: !!c.is_additional,
            parentCardId: c.parent_card_id || undefined,
            sumsIntoInvoice: c.sums_into_invoice !== false
          }));
        }
        if (stmtsRes.data) {
          slotStatements = stmtsRes.data.map((s: any) => ({ id: s.id, due_date: String(s.due_date || '').split('T')[0] }));
        }
      } catch (err) {
        console.error("Online fetch failed for comparison slot, falling back to cache:", err);
      }
    }

    // Fallback/offline logic: read from local cached full sets
    if (rawTxs.length === 0 && userId) {
      try {
        const cachedRawTxs = localStorage.getItem(`finvision_cached_raw_txs_${userId}`);
        if (cachedRawTxs) {
          const parsed = JSON.parse(cachedRawTxs);
          rawTxs = parsed.filter((t: any) => t.date >= start && t.date <= end && !t.is_deleted);
        }
      } catch (e) {}
    }
    if (rawCardTxs.length === 0 && userId) {
      try {
        const cachedCardTxs = localStorage.getItem(`finvision_cached_raw_card_txs_${userId}`);
        if (cachedCardTxs) {
          rawCardTxs = JSON.parse(cachedCardTxs);
        }
      } catch (e) {}
    }

    // Mês de vencimento da fatura por compra (mesma regra do fetchData principal).
    const cardMetaById = new Map<string, { closingDay?: number; dueDay?: number; isAdditional?: boolean; parentCardId?: string; sumsIntoInvoice?: boolean }>();
    slotCardDefs.forEach(c => cardMetaById.set(c.id, c));
    const getEffectiveCardMeta = (cardId?: string) => {
      if (!cardId) return undefined;
      const meta = cardMetaById.get(cardId);
      if (!meta) return undefined;
      if (meta.isAdditional && meta.sumsIntoInvoice && meta.parentCardId) {
        return cardMetaById.get(meta.parentCardId) || meta;
      }
      return meta;
    };
    const stmtDueById = new Map<string, string>();
    slotStatements.forEach(s => { if (s.id && s.due_date) stmtDueById.set(s.id, s.due_date); });
    const getCompetenceDate = (ct: any): string => {
      if (ct.statement_id && stmtDueById.has(ct.statement_id)) return stmtDueById.get(ct.statement_id)!;
      const meta = getEffectiveCardMeta(ct.card_id);
      if (!meta || meta.closingDay == null || meta.dueDay == null) return ct.date;
      return HistoryUtils.getCardCompetenceDate(ct.date, meta.closingDay, meta.dueDay);
    };
    rawCardTxs = rawCardTxs.filter((ct: any) => {
      const competence = getCompetenceDate(ct);
      return competence >= start && competence <= end;
    });

    const accs = accounts;
    const normalizedCardTxs = rawCardTxs.map((ct: any) => ({
      id: ct.id,
      date: ct.date,
      // Idem ao fetchData principal: amount negativo em card_transactions é estorno/crédito.
      type: Number(ct.amount) < 0 ? 'INCOME' : 'EXPENSE',
      amount: Number(ct.amount),
      category: ct.categories?.name || ct.category || 'Sem categoria',
      subcategory: ct.subcategory || undefined,
      description: ct.description,
      account_id: ct.account_id || ct.cards?.account_id || undefined,
      account_name: ct.account_name || ct.cards?.name || accs.find(a => a.id === (ct.account_id || ct.cards?.account_id))?.institution || 'Cartão de Crédito',
      card_id: ct.card_id,
      owner_name: ct.owner_name || 'Pessoal',
      notes: ct.notes || '',
      tags: ct.tags || [],
      is_paid: true,
      paid_amount: Number(ct.amount)
    }));

    let combined = [...rawTxs, ...normalizedCardTxs];

    // Apply JS Filters
    if (filterType !== 'ALL') {
      combined = combined.filter((t: any) => t.type === filterType);
    }
    if (filterAccount.length > 0) {
      // Compras de cartão casam pelo card_id, não pelo account_id (que é a conta
      // bancária vinculada ao cartão, quando existe).
      combined = combined.filter((t: any) => matchesAccountFilter(t, filterAccount));
    }
    if (filterCategory.length > 0) {
      combined = combined.filter((t: any) => filterCategory.includes(t.category));
    }
    if (filterSubcategory.length > 0) {
      combined = combined.filter((t: any) => filterSubcategory.includes(t.subcategory));
    }
    if (filterOwner.length > 0) {
      combined = combined.filter((t: any) => filterOwner.includes(t.owner_name));
    }
    if (minPrice !== '') {
      combined = combined.filter((t: any) => Math.abs(Number(t.amount || 0)) >= Number(minPrice));
    }
    if (maxPrice !== '') {
      combined = combined.filter((t: any) => Math.abs(Number(t.amount || 0)) <= Number(maxPrice));
    }
    if (debouncedSearch) {
      const searchNormalized = debouncedSearch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      combined = combined.filter((t: any) => 
        (t.description || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(searchNormalized) ||
        (t.category || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(searchNormalized) ||
        (t.subcategory || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(searchNormalized) ||
        (t.account_name || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(searchNormalized) ||
        (t.owner_name || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(searchNormalized) ||
        (t.notes || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(searchNormalized)
      );
    }

    if (viewMode === 'SETTLED') {
      combined = combined.filter(t => t.is_paid || t.isPaid);
    } else if (viewMode === 'PENDING') {
      combined = combined.filter(t => !t.is_paid && !t.isPaid);
    }

    let income = 0;
    let expense = 0;
    combined.forEach((t: any) => {
      if (t.type === 'TRANSFER') return;
      if (isCapitalizedMovement(t)) return;
      if (t.type === 'INCOME') income += Number(t.amount || 0);
      else if (t.type === 'EXPENSE' || t.type === 'BILL_PAYMENT') expense += Math.abs(Number(t.amount || 0));
    });

    return {
      income,
      expense,
      balance: income - expense
    };
  };

  const addComparisonSlot = () => {
    const nextLetter = String.fromCharCode(65 + comparisonSlots.length);
    const d = new Date();
    const start = DateUtils.formatToISODate(new Date(d.getFullYear(), d.getMonth(), 1));
    const end = DateUtils.formatToISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    setComparisonSlots(prev => [
      ...prev,
      { id: nextLetter, name: `Período ${nextLetter}`, startDate: start, endDate: end }
    ]);
  };

  const removeComparisonSlot = (id: string) => {
    setComparisonSlots(prev => prev.filter(s => s.id !== id));
    setComparisonResults(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const updateComparisonSlot = (id: string, field: 'name' | 'startDate' | 'endDate', value: string) => {
    setComparisonSlots(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  // Pre-initialize default slots on open
  useEffect(() => {
    if (showComparison && comparisonSlots.length === 0) {
      const d = new Date();
      const thisMonthStart = DateUtils.formatToISODate(new Date(d.getFullYear(), d.getMonth(), 1));
      const thisMonthEnd = DateUtils.formatToISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      const prevMonthStart = DateUtils.formatToISODate(new Date(d.getFullYear(), d.getMonth() - 1, 1));
      const prevMonthEnd = DateUtils.formatToISODate(new Date(d.getFullYear(), d.getMonth(), 0));

      setComparisonSlots([
        { id: 'A', name: 'Período A (Este Mês)', startDate: thisMonthStart, endDate: thisMonthEnd },
        { id: 'B', name: 'Período B (Mês Anterior)', startDate: prevMonthStart, endDate: prevMonthEnd }
      ]);
    }
  }, [showComparison]);

  useEffect(() => {
    if (!showComparison || comparisonSlots.length === 0) return;

    let active = true;
    const runCalculation = async () => {
      setIsComparing(true);
      const results: Record<string, { income: number; expense: number; balance: number }> = {};
      for (const slot of comparisonSlots) {
        if (!slot.startDate || !slot.endDate) continue;
        const res = await fetchSlotTotals(slot.startDate, slot.endDate);
        if (active) {
          results[slot.id] = res;
        }
      }
      if (active) {
        setComparisonResults(results);
        setIsComparing(false);
      }
    };

    runCalculation();
    return () => {
      active = false;
    };
  }, [showComparison, comparisonSlots, filterType, filterAccount, filterCategory, filterSubcategory, filterOwner, minPrice, maxPrice, debouncedSearch, viewMode, accounts, userId]);

  // Summary Calculations based on chartViewFiltered (respects 'Pagos & Recebidos' toggle)
  const summary = chartViewFiltered.reduce((acc, t) => {
    if (t.type === 'TRANSFER') return acc;
    if (t.type === 'INCOME') acc.income += Number(t.amount);
    else if (t.type === 'EXPENSE' || t.type === 'BILL_PAYMENT') acc.expense += Math.abs(Number(t.amount));
    return acc;
  }, { income: 0, expense: 0 });
  const balance = summary.income - summary.expense;

  const setDatePreset = (days: number | 'MONTH' | 'PREV_MONTH' | 'ALL') => {
    const d = new Date();
    if (days === 'ALL') {
      setStartDate('0001-01-01');
      setEndDate('9999-12-31');
    } else if (days === 'MONTH') {
      setStartDate(DateUtils.formatToISODate(new Date(d.getFullYear(), d.getMonth(), 1)));
      setEndDate(DateUtils.formatToISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
    } else if (days === 'PREV_MONTH') {
      setStartDate(DateUtils.formatToISODate(new Date(d.getFullYear(), d.getMonth() - 1, 1)));
      setEndDate(DateUtils.formatToISODate(new Date(d.getFullYear(), d.getMonth(), 0)));
    } else {
      const start = new Date(d);
      start.setDate(d.getDate() - days);
      setStartDate(DateUtils.formatToISODate(start));
      setEndDate(DateUtils.formatToISODate(d));
    }
    setPage(0);
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-8 py-6 sm:py-8 pb-36 space-y-6 sm:space-y-8 animate-in fade-in duration-500 min-w-0">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">Transações Financeiras</h1>
            <ContextualHelp 
              title="Gestão de Lançamentos" 
              description="Nesta tela você pode filtrar transações por categoria, conta ou período. Clique em 'Novo Lançamento' para adicionar manualmente ou use o 'Conciliador' no menu lateral para importar extratos bancários de forma massiva."
            />
          </div>
          <p className="text-sm text-slate-400 font-medium">Gestão detalhada e conciliação de lançamentos.</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <button
            onClick={() => fetchData()}
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
            className="flex flex-1 min-w-[140px] sm:flex-none items-center justify-center gap-2 px-4 py-3 bg-brand-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-brand-500/20 hover:scale-105 transition-transform active:scale-95"
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

            <div className="relative w-full md:w-44">
              <Tag size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                list="bulk-subcategories-list"
                value={bulkSubcategory}
                onChange={(e) => setBulkSubcategory(e.target.value)}
                placeholder="Trocar Subcat..."
                className="w-full pl-9 pr-4 py-2.5 bg-slate-800 text-white text-[10px] font-bold uppercase rounded-xl outline-none focus:ring-2 focus:ring-brand-500/50 appearance-none cursor-pointer"
              />
              <datalist id="bulk-subcategories-list">
                {/* Sem categoria escolhida no lote, sugere todas (os itens selecionados podem
                    ter categorias diferentes); com categoria escolhida, filtra por ela. */}
                {(bulkCategory
                  ? subcategories.filter(s => s.category_name === bulkCategory)
                  : subcategories
                )
                  .filter((s, idx, arr) => arr.findIndex(x => x.name === s.name) === idx)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(s => (
                    <option key={s.id} value={s.name} />
                  ))}
              </datalist>
            </div>

            <div className="relative w-full md:w-44">
              <User size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                list="bulk-owners-list"
                value={bulkOwner}
                onChange={(e) => setBulkOwner(e.target.value)}
                placeholder="Pessoa ou Empresa..."
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
        filterOrigin={filterOrigin} setFilterOrigin={setFilterOrigin}
        categories={availableCategories} subcategories={Array.from(new Set(subcategories.map(s => s.name?.trim()))).filter(Boolean).sort()} accounts={accounts} cards={cards} resetFilters={resetFilters}
      />

      {/* QUICK DATE FILTERS + CUSTOM RANGE + VIEW MODE TOGGLE */}
      <div className="flex flex-col gap-3 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
        {/* Row 1: Date presets + View mode toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Date presets */}
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setDatePreset('MONTH')} className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${startDate === DateUtils.formatToISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) && endDate === DateUtils.formatToISODate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)) ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>Este Mês</button>
            <button onClick={() => setDatePreset('PREV_MONTH')} className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${startDate === DateUtils.formatToISODate(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)) && endDate === DateUtils.formatToISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 0)) ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>Mês Anterior</button>
            <button onClick={() => setDatePreset(30)} className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all bg-slate-50 text-slate-500 hover:bg-slate-100`}>30 Dias</button>
            <button onClick={() => setDatePreset(90)} className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all bg-slate-50 text-slate-500 hover:bg-slate-100`}>3 Meses</button>
            <button onClick={() => setDatePreset('ALL')} className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${startDate === '0001-01-01' && endDate === '9999-12-31' ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>Tudo</button>
            <button onClick={() => setShowComparison(prev => !prev)} className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${showComparison ? 'bg-indigo-650 text-white shadow-sm' : 'bg-slate-100 text-indigo-600 hover:bg-indigo-50 border border-indigo-100'}`}>Comparar Períodos</button>
            {duplicateCount > 0 && (
              <button onClick={() => setShowOnlyDuplicates(prev => !prev)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border ${showOnlyDuplicates ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}>
                <AlertCircle size={13} /> {showOnlyDuplicates ? 'Mostrando duplicados' : `Possíveis duplicados (${duplicateCount})`}
              </button>
            )}
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
            <button
              onClick={() => setViewMode('PENDING')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${viewMode === 'PENDING' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Clock size={12} />
              Abertos
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

      {/* COMPARADOR DE PERÍODOS */}
      {showComparison && (
        <div className="bg-white p-6 rounded-[24px] sm:rounded-[32px] border border-indigo-100 shadow-sm space-y-6 animate-in slide-in-from-top-4 duration-300">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                Comparador de Períodos Múltiplos
              </h4>
              <p className="text-[10px] text-slate-500 mt-1">Defina quantos períodos desejar para comparar receitas, despesas e saldos consolidando com os filtros ativos.</p>
            </div>
            <button 
              onClick={addComparisonSlot} 
              className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5"
            >
              <Plus size={14} />
              Adicionar Período
            </button>
          </div>

          {/* List of slots */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {comparisonSlots.map(slot => (
              <div key={slot.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 relative space-y-3 group/slot">
                <div className="flex justify-between items-center">
                  <input 
                    type="text" 
                    value={slot.name} 
                    onChange={e => updateComparisonSlot(slot.id, 'name', e.target.value)} 
                    className="bg-transparent font-bold text-xs text-slate-900 border-b border-transparent focus:border-slate-300 outline-none w-2/3"
                  />
                  {comparisonSlots.length > 1 && (
                    <button 
                      onClick={() => removeComparisonSlot(slot.id)} 
                      className="text-slate-400 hover:text-rose-500 transition-colors p-1"
                      title="Remover Período"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <input 
                    type="date" 
                    value={slot.startDate} 
                    onChange={e => updateComparisonSlot(slot.id, 'startDate', e.target.value)} 
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-medium outline-none focus:border-indigo-400"
                  />
                  <span className="text-slate-400">–</span>
                  <input 
                    type="date" 
                    value={slot.endDate} 
                    onChange={e => updateComparisonSlot(slot.id, 'endDate', e.target.value)} 
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-medium outline-none focus:border-indigo-400"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Table Results */}
          <div className="w-full overflow-x-auto border border-slate-100 rounded-2xl">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left">Período / Slot</th>
                  <th className="px-4 py-3 text-right">Receitas</th>
                  <th className="px-4 py-3 text-right">Despesas</th>
                  <th className="px-4 py-3 text-right font-black">Saldo</th>
                  <th className="px-4 py-3 text-left pl-6">Comparativo Visual (Saldo)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {comparisonSlots.map(slot => {
                  const res = comparisonResults[slot.id] || { income: 0, expense: 0, balance: 0 };
                  
                  // Calculate a visual progress bar based on balance relative to maximum balance in slots
                  const maxBalance = Math.max(1, ...comparisonSlots.map(s => Math.abs(comparisonResults[s.id]?.balance || 0)));
                  const pct = Math.min(100, Math.round((Math.abs(res.balance) / maxBalance) * 100));
                  const isPos = res.balance >= 0;

                  return (
                    <tr key={slot.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-800">
                        {slot.name}
                        <div className="text-[10px] text-slate-400 font-medium">{DateUtils.formatDisplayDate(slot.startDate)} a {DateUtils.formatDisplayDate(slot.endDate)}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                        {isComparing ? '...' : HistoryUtils.formatCurrency(res.income)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-rose-500">
                        {isComparing ? '...' : HistoryUtils.formatCurrency(-res.expense)}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${isPos ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isComparing ? '...' : HistoryUtils.formatCurrency(res.balance)}
                      </td>
                      <td className="px-4 py-3 pl-6 w-1/3">
                        {isComparing ? (
                          <div className="h-2 bg-slate-100 rounded-full animate-pulse w-24"></div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden flex justify-end">
                              <div 
                                className={`h-full rounded-full ${isPos ? 'bg-emerald-500' : 'bg-rose-500'}`} 
                                style={{ width: `${pct}%`, marginLeft: isPos ? '0' : 'auto', marginRight: isPos ? 'auto' : '0' }}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-slate-500">{pct}%</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
        transactions={chartCategoryViewFiltered}
        selectedTimelineCategories={selectedTimelineCategories}
        setSelectedTimelineCategories={setSelectedTimelineCategories}
        startDate={startDate}
        endDate={endDate}
        onCategoryClick={(cat) => {
          setFilterCategory([cat]);
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }}
        onMonthClick={(month, year) => {
          const first = new Date(year, parseInt(month, 10) - 1, 1);
          const last = new Date(year, parseInt(month, 10), 0);
          setStartDate(DateUtils.formatToISODate(first));
          setEndDate(DateUtils.formatToISODate(last));
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
        onSplitChanged={(id, hasSplits) => {
          setTransactions(prev => prev.map(t => t.id === id ? { ...t, hasSplits } : t));
          setChartTransactions(prev => prev.map(t => t.id === id ? { ...t, hasSplits } : t));
          setChartCategoryTransactions(prev => prev.map(t => t.id === id ? { ...t, hasSplits } : t));
        }}
        reopenTransaction={async (t) => {
          if (!supabase || !window.confirm('Deseja reabrir este lançamento?')) return;
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            if (!user) return;
            const isCardPayment = t.type === 'BILL_PAYMENT' || t.description.toLowerCase().includes('pagamento cartão');
            if (isCardPayment) {
              const statementId = (t as any).metadata?.card_statement_id || (t as any).metadata?.statement_id;
              if (statementId) {
                const { data: stmCur } = await supabase.from('card_statements').select('paid_amount').eq('id', statementId).maybeSingle();
                if (stmCur) {
                  await supabase.from('card_statements').update({ 
                    status: 'OPEN', 
                    paid_amount: Math.max(0, Number(stmCur.paid_amount) - Math.abs(t.amount)) 
                  }).eq('id', statementId);
                }
              }
              await supabase.from('transactions').update({ is_paid: false, paid_amount: 0, paid_at: null }).eq('id', t.id);
            } else {
              await supabase.from('transactions').update({ is_paid: false, paid_amount: 0, paid_at: null }).eq('id', t.id);
            }
            await supabase.rpc('recalculate_account_balance', { p_account_id: t.accountId });
            await fetchData();
          } catch (e) { console.error(e); toast('Erro ao reabrir. Tente novamente.', 'error'); }
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
        payAccountId={payModal.open ? payModal.payAccountId : ''} setPayAccountId={(v) => setPayModal(prev => prev.open ? { ...prev, payAccountId: v } : prev)}
        payDate={payModal.open ? payModal.payDate : ''} setPayDate={(v) => setPayModal(prev => prev.open ? { ...prev, payDate: v } : prev)}
        payRemainderDate={payModal.open ? payModal.payRemainderDate : ''} setPayRemainderDate={(v) => setPayModal(prev => prev.open ? { ...prev, payRemainderDate: v } : prev)}
        accounts={accounts}
        splitRemainder={payModal.open ? payModal.splitRemainder : false} setSplitRemainder={(v) => setPayModal(prev => prev.open ? { ...prev, splitRemainder: v } : prev)}
        isSubmitting={payModal.open ? payModal.isSubmitting : false} error={payModal.open ? payModal.error : null} formatCurrency={HistoryUtils.formatCurrency}
      />

      <AddTransactionModal show={addModal.open} onClose={() => setAddModal({ open: false })} onSubmit={createManualTransaction}
        isSubmitting={addModal.open ? addModal.isSubmitting : false} error={addModal.open ? addModal.error : null}
        initialForm={addModal.open ? addModal.form : {} as any}
        accounts={accounts} owners={owners} categoryObjects={categoryObjects} subcategories={subcategories} onCreateCategory={handleCreateCategory}
      />

      <SeriesScopeModal
        show={seriesModal.show} onClose={() => setSeriesModal({ show: false, tx: null, pendingAction: 'DELETE' })}
        onConfirm={(scope) => seriesModal.pendingAction === 'DELETE' ? handleDelete(seriesModal.tx!.id, scope) : handleUpdate(seriesModal.tx!.id, seriesModal.pendingPatch!.field, seriesModal.pendingPatch!.value, scope)}
        title={seriesModal.pendingAction === 'DELETE' ? 'Excluir Lançamento' : 'Editar Lançamento'}
        actionLabel={seriesModal.pendingAction === 'DELETE' ? 'Excluir' : 'Salvar'}
        type={seriesModal.tx?.metadata?.recurrence_group_id ? 'RECURRING' : 'INSTALLMENT'}
      />

      {showDreModal && (
        <DreReportModal
          transactions={dreSourceTransactions}
          startDate={startDate}
          endDate={endDate}
          onClose={() => setShowDreModal(false)}
        />
      )}
    </div>
  );
};

export default HistoryPage;



