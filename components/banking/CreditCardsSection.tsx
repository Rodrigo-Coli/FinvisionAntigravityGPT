import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Loader2, Edit2, Archive, Trash2, Info, Filter, X as XIcon } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase/client';
import { FinanceService } from '../../services/finance.service';
import { offlineQueue } from '../../lib/offlineQueue.service';
import { isProbablyOffline } from '../../lib/connectivity';
import { parseTags, collectTags } from '../../lib/tagUtils';
import { useReconnectRefresh } from '../../lib/useReconnectRefresh';
import { ReconciliationService } from '../../services/reconciliation.service';
import { DateUtils } from '../../lib/dateUtils';
import { findCloseMatch } from '../../lib/stringUtils';

// Modular Components
import { CardList } from '../cards/CardList';
import { StatementSummary } from '../cards/StatementSummary';
import { TransactionList } from '../cards/TransactionList';
import { AddCardModal } from '../cards/AddCardModal';
import { ManualTransactionModal } from '../cards/ManualTransactionModal';
import { StatementPicker } from '../cards/StatementPicker';
import { useSubscription } from '../../contexts/SubscriptionContext';
import PlanUpgradeModal from '../subscription/PlanUpgradeModal';
import { PayStatementModal } from '../cards/PayStatementModal';
import { SeriesScopeModal, SeriesScope } from '../SeriesScopeModal';
import { useToast } from '../../contexts/ToastContext';
import { SplitTransactionService, SplitDraft } from '../../services/splitTransaction.service';

type Account = {
  id: string;
  institution?: string | null;
  name?: string | null;
  bank_name?: string | null;
};

const CreditCardsSection: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [cards, setCards] = useState<any[]>(() => {
    const cached = localStorage.getItem('finvision_cached_cards');
    return cached ? JSON.parse(cached) : [];
  });
  const [selectedCard, setSelectedCard] = useState<any | null>(() => {
    const cached = localStorage.getItem('finvision_cached_cards');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.length === 0) return null;
      return parsed.find((c: any) => c.is_default) || parsed[0];
    }
    return null;
  });
  const [statements, setStatements] = useState<any[]>([]);
  const [selectedStatementId, setSelectedStatementId] = useState<string | 'ALL'>('CURRENT');
  // Quando não-nulo, estamos na visão consolidada (titular + adicionais somados) de
  // uma "família" de cartões. selectedCard continua sendo o cartão titular (usado
  // para editar/arquivar/etc.), mas statements/transactions passam a agregar todos
  // os ids desta lista, ignorando o antigo sums_into_invoice.
  const [combinedCardIds, setCombinedCardIds] = useState<string[] | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  // Histórico recente de lançamentos do cartão (para sugestões de descrição que preenchem categoria/subcategoria)
  const [recentTxs, setRecentTxs] = useState<any[]>([]);
  const [currentStatement, setCurrentStatement] = useState<any | null>(null);
  // Guarda a fatura ATUAL "de verdade" (calculada por data/fechamento).
  // Não é sobrescrita quando o usuário navega por outras faturas, ao contrário de currentStatement.
  const [realCurrentStatement, setRealCurrentStatement] = useState<any | null>(null);

  const [loading, setLoading] = useState(() => {
    const cached = localStorage.getItem('finvision_cached_cards');
    return !cached;
  });
  const [loadingTxs, setLoadingTxs] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const { subscription } = useSubscription();
  const maxCards = subscription?.plans?.max_cards !== undefined ? subscription.plans.max_cards : -1;
  const isCardsLocked = maxCards !== -1 && cards.length >= maxCards;

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterSubcategory, setFilterSubcategory] = useState('ALL');
  const [filterOwner, setFilterOwner] = useState('ALL');
  const [minValue, setMinValue] = useState('');
  const [maxValue, setMaxValue] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // categories + inline edit + manual tx modal
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(() => {
    const cached = localStorage.getItem('finvision_cached_categories_cc') ||
                   localStorage.getItem('finvision_cached_categories');
    return cached ? JSON.parse(cached) : [];
  });
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  const [showAddTxModal, setShowAddTxModal] = useState(false);
  const [txDate, setTxDate] = useState<string>(() => DateUtils.formatToISODate());
  const [txDescription, setTxDescription] = useState('');
  const [txAmount, setTxAmount] = useState<number | string>('');
  const [txCategory, setTxCategory] = useState<string>('');
  const [txSubcategory, setTxSubcategory] = useState<string>('');
  const [subcategories, setSubcategories] = useState<{ id: string, name: string, category_name?: string }[]>(() => {
    const cached = localStorage.getItem('finvision_cached_subcategories_cc') ||
                   localStorage.getItem('finvision_cached_subcategories');
    return cached ? JSON.parse(cached) : [];
  });
  const [txCardId, setTxCardId] = useState<string>('');
  const [txNotes, setTxNotes] = useState('');
  const [txTags, setTxTags] = useState<string[]>([]);
  const [txIsDividing, setTxIsDividing] = useState(false);
  const [txSplits, setTxSplits] = useState<SplitDraft[] | null>(null);

  // New Series States
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentsCount, setInstallmentsCount] = useState<number | string>('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePeriod, setRecurrencePeriod] = useState<'weekly' | 'monthly' | 'yearly' | 'biweekly' | 'custom'>('monthly');
  const [recurrenceDaysInterval, setRecurrenceDaysInterval] = useState(1);
  const [txFiles, setTxFiles] = useState<File[]>([]);

  // PAY STATEMENT
  const [accounts, setAccounts] = useState<Account[]>(() => {
    const cached = localStorage.getItem('finvision_cached_accounts_cc') ||
                   localStorage.getItem('finvision_cached_accounts') ||
                   localStorage.getItem('finvision_cached_accounts_full');
    return cached ? JSON.parse(cached) : [];
  });
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAccountId, setPayAccountId] = useState<string>(() => {
    const cached = localStorage.getItem('finvision_cached_accounts_cc') ||
                   localStorage.getItem('finvision_cached_accounts') ||
                   localStorage.getItem('finvision_cached_accounts_full');
    if (cached) {
      const parsed = JSON.parse(cached);
      return parsed.length > 0 ? parsed[0].id : '';
    }
    return '';
  });
  const [payDate, setPayDate] = useState<string>(() => DateUtils.formatToISODate());
  const [payAmount, setPayAmount] = useState<number | string>('');
  const [isPaying, setIsPaying] = useState(false);

  // Form states for new card
  const [newName, setNewName] = useState('');
  const [newBrand, setNewBrand] = useState('Visa');
  const [newLast4, setNewLast4] = useState('');
  const [newLimit, setNewLimit] = useState<number | string>('');
  const [newClosingDay, setNewClosingDay] = useState<number>(5);
  const [newDueDay, setNewDueDay] = useState<number>(15);
  const [isAdditional, setIsAdditional] = useState(false);
  const [parentCardId, setParentCardId] = useState('');
  const [additionalLabel, setAdditionalLabel] = useState('');
  const [sumsIntoInvoice, setSumsIntoInvoice] = useState(true);
  const [isDefaultCard, setIsDefaultCard] = useState(false);
  const [defaultCategory, setDefaultCategory] = useState('Pessoal');
  const [defaultSubcategory, setDefaultSubcategory] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [defaultOwner, setDefaultOwner] = useState('Pessoal');
  const [owners, setOwners] = useState<string[]>(() => {
    const cached = localStorage.getItem('finvision_cached_owners_cc') ||
                   localStorage.getItem('finvision_cached_owners');
    return cached ? JSON.parse(cached) : ['Pessoal'];
  });

  // Series Scope Modal State
  const [seriesModal, setSeriesModal] = useState<{
    show: boolean;
    tx: any | null;
    pendingAction: 'UPDATE' | 'DELETE';
    pendingPatch?: any;
  }>({ show: false, tx: null, pendingAction: 'DELETE' });

  const isAnyModalBusy = isSaving || isPaying;

  useEffect(() => {
    const hasCache = !!localStorage.getItem('finvision_cached_cards');
    if (isSupabaseConfigured) {
      fetchCards(hasCache);
      fetchCategories();
      fetchSubcategories();
      fetchAccounts();
      fetchOwners();
    }

    const handleSyncCompleted = () => {
      if (isSupabaseConfigured) {
        fetchCards(true);
        fetchCategories();
        fetchSubcategories();
        fetchAccounts();
        fetchOwners();
        setSelectedCard((prev: any) => {
          if (prev?.id) {
            loadCardContext(prev.id);
          }
          return prev;
        });
      }
    };
    window.addEventListener('offline-sync-completed', handleSyncCompleted);
    return () => {
      window.removeEventListener('offline-sync-completed', handleSyncCompleted);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('add') === 'true') {
      setShowAddTxModal(true);
      navigate('/banking?tab=cards', { replace: true });
    }
  }, [location.search]);

  // Guarda o cartão que estava aberto para distinguir "troquei de cartão" de "o mesmo
  // cartão foi recarregado". Só a troca de verdade zera a fatura escolhida — num
  // recarregamento (depois de salvar um lançamento, por exemplo) a sua escolha fica.
  const prevCardIdRef = useRef<string | null>(null);
  // Idem para o modo consolidado: alternar entre "Tudo" e um cartão individual da
  // mesma família também conta como troca de contexto (zera fatura escolhida).
  const prevCombinedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedCard) return;

    const combinedKey = combinedCardIds ? [...combinedCardIds].sort().join(',') : null;
    const cardChanged =
      (prevCardIdRef.current !== null && prevCardIdRef.current !== selectedCard.id) ||
      (prevCombinedKeyRef.current !== null && prevCombinedKeyRef.current !== combinedKey) ||
      (prevCombinedKeyRef.current === null && combinedKey !== null && prevCardIdRef.current !== null);
    prevCardIdRef.current = selectedCard.id;
    prevCombinedKeyRef.current = combinedKey;

    setTxCardId(selectedCard.id);
    if (cardChanged) {
      // Volta para "Fatura Atual" do cartão/família novo(a). O forcedStatementId é
      // necessário porque setSelectedStatementId só vale no próximo render — sem
      // ele, loadCardContext ainda leria a fatura do contexto anterior.
      setSelectedStatementId('CURRENT');
      // Zera o que está na tela: enquanto a busca do contexto novo não volta, os
      // lançamentos e o total do contexto anterior continuariam visíveis, dando a
      // impressão de que a fatura de outro cartão/família "grudou".
      setTransactions([]);
      setCurrentStatement(null);
      loadCardContext(selectedCard.id, 'CURRENT');
    } else {
      loadCardContext(selectedCard.id);
    }
    fetchRecentTxs();
  }, [selectedCard, combinedCardIds]);

  // Clique no cartão titular no topo da carteira: entra na visão "Tudo" (titular +
  // todos os adicionais somados). Cartão sem adicional cai direto na visão individual.
  const handleSelectFamily = (mainCard: any) => {
    const additionalIds = cards.filter((c: any) => c.is_additional && c.parent_card_id === mainCard.id).map((c: any) => c.id);
    setSelectedCard(mainCard);
    setCombinedCardIds(additionalIds.length > 0 ? [mainCard.id, ...additionalIds] : null);
  };

  // Clique num cartão específico da família (titular ou um adicional) na lista de
  // baixo: sai do consolidado e mostra só as operações/valor daquele cartão.
  const handleSelectIndividual = (card: any) => {
    setSelectedCard(card);
    setCombinedCardIds(null);
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val || 0));

  const formatDateBR = (d?: string) => {
    if (!d) return '-';
    return DateUtils.formatDisplayDate(d);
  };

  const getCardColor = (brand: string) => {
    const b = (brand || '').toLowerCase();
    if (b.includes('visa')) return 'bg-brand-600';
    if (b.includes('master')) return 'bg-brand-900';
    if (b.includes('elo')) return 'bg-orange-500';
    if (b.includes('amex')) return 'bg-emerald-600';
    return 'bg-slate-600';
  };

  const safeNumber = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const getCalculatedTotal = () => {
    // Sempre somamos as transações carregadas para garantir que lançamentos manuais
    // e conciliações recentes (que podem não ter atualizado o total_amount na DB) sejam considerados.
    // Soma pelo valor com sinal (não abs): estornos/créditos ficam negativos e abatem a
    // fatura, em vez de somar como se fossem mais uma compra.
    return transactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  };

  const statementTotal = Math.round(getCalculatedTotal() * 100) / 100;
  const statementPaid = selectedStatementId === 'ALL' ? 0 : Math.round(safeNumber(currentStatement?.paid_amount) * 100) / 100;

  // A fatura está pendente se o total calculado for maior que o já pago
  const statementOpen = Math.round(Math.max(0, statementTotal - statementPaid) * 100) / 100;

  const fetchCards = async (silent = false) => {
    if (!supabase) return;
    if (!silent) setLoading(true);
    try {
      if (navigator.onLine) {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;
        const { data, error } = await supabase
          .from('cards')
          .select('*')
          .eq('user_id', user.id);

        if (error) throw error;

        const activeCards = (data || []).filter((c: any) => c.is_archived !== true && c.status !== 'archived');
        setCards(activeCards);
        localStorage.setItem('finvision_cached_cards', JSON.stringify(activeCards));

        if (activeCards.length > 0) {
          setSelectedCard((prev: any) => prev || activeCards.find((c: any) => c.is_default) || activeCards[0]);
        }
      } else {
        const cached = localStorage.getItem('finvision_cached_cards');
        if (cached) {
          const parsed = JSON.parse(cached);
          setCards(parsed);
          if (parsed.length > 0) {
            setSelectedCard((prev: any) => prev || parsed.find((c: any) => c.is_default) || parsed[0]);
          }
        }
      }
    } catch (err) {
      console.error('Erro ao buscar cartões, fallback cache:', err);
      const cached = localStorage.getItem('finvision_cached_cards');
      if (cached) {
        const parsed = JSON.parse(cached);
        setCards(parsed);
        if (parsed.length > 0) {
          setSelectedCard((prev: any) => prev || parsed.find((c: any) => c.is_default) || parsed[0]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    if (!supabase) return;
    try {
      if (navigator.onLine) {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;
        const { data, error } = await supabase
          .from('categories')
          .select('id, name')
          .eq('user_id', user.id)
          .order('name', { ascending: true });
        if (error) throw error;

        // Deduplicate categories by name
        const rawList = data || [];
        const uniqueCategories: any[] = [];
        const seenCategories = new Set<string>();
        for (const c of rawList) {
          if (!c.name) continue;
          const nameTrimmed = c.name.trim().toLowerCase();
          if (!seenCategories.has(nameTrimmed)) {
            seenCategories.add(nameTrimmed);
            uniqueCategories.push(c);
          }
        }

        setCategories(uniqueCategories);
        localStorage.setItem('finvision_cached_categories_cc', JSON.stringify(uniqueCategories));
      } else {
        const cached = localStorage.getItem('finvision_cached_categories_cc') ||
                       localStorage.getItem('finvision_cached_categories');
        if (cached) {
          const rawList = JSON.parse(cached);
          const uniqueCategories: any[] = [];
          const seenCategories = new Set<string>();
          for (const c of rawList) {
            if (!c.name) continue;
            const nameTrimmed = c.name.trim().toLowerCase();
            if (!seenCategories.has(nameTrimmed)) {
              seenCategories.add(nameTrimmed);
              uniqueCategories.push(c);
            }
          }
          setCategories(uniqueCategories);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar categorias, fallback cache:', err);
      const cached = localStorage.getItem('finvision_cached_categories_cc') ||
                     localStorage.getItem('finvision_cached_categories');
      if (cached) {
        try {
          const rawList = JSON.parse(cached);
          const uniqueCategories: any[] = [];
          const seenCategories = new Set<string>();
          for (const c of rawList) {
            if (!c.name) continue;
            const nameTrimmed = c.name.trim().toLowerCase();
            if (!seenCategories.has(nameTrimmed)) {
              seenCategories.add(nameTrimmed);
              uniqueCategories.push(c);
            }
          }
          setCategories(uniqueCategories);
        } catch (e) {
          setCategories([]);
        }
      }
    }
  };

  const handleCreateCategory = async (name: string) => {
    if (!supabase) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;
      
      const { data, error } = await supabase
        .from('categories')
        .insert({ user_id: user.id, name, type: 'EXPENSE', color: 'bg-brand-50 text-brand-600' })
        .select('id, name')
        .single();
      
      if (error) throw error;
      
      await fetchCategories();
      return data;
    } catch (err) {
      console.error('Erro ao criar categoria inline:', err);
      toast('Erro ao criar categoria inline', 'error');
    }
  };

  const fetchSubcategories = async () => {
    if (!supabase) return;
    try {
      if (navigator.onLine) {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;
        const { data, error } = await supabase
          .from('subcategories')
          .select('id, name, categories(name)')
          .eq('user_id', user.id)
          .order('name', { ascending: true });
        if (error) throw error;
        const mapped = (data || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          category_name: s.categories?.name
        }));

        // Deduplicate subcategories by name and category name
        const uniqueSubcats: any[] = [];
        const seenSubcats = new Set<string>();
        for (const sub of mapped) {
          const key = `${sub.name?.toLowerCase().trim()}::${sub.category_name?.toLowerCase().trim()}`;
          if (!seenSubcats.has(key)) {
            seenSubcats.add(key);
            uniqueSubcats.push(sub);
          }
        }

        setSubcategories(uniqueSubcats);
        localStorage.setItem('finvision_cached_subcategories_cc', JSON.stringify(uniqueSubcats));
      } else {
        const cached = localStorage.getItem('finvision_cached_subcategories_cc') ||
                       localStorage.getItem('finvision_cached_subcategories');
        if (cached) {
          const raw = JSON.parse(cached);
          const catsCached = localStorage.getItem('finvision_cached_categories_cc') || localStorage.getItem('finvision_cached_categories');
          const cats = catsCached ? JSON.parse(catsCached) : [];
          const mapped = raw.map((s: any) => {
            let catName = s.category_name;
            if (!catName && s.category_id && cats.length > 0) {
              const matched = cats.find((c: any) => c.id === s.category_id);
              if (matched) catName = matched.name;
            }
            return {
              id: s.id,
              name: s.name,
              category_name: catName
            };
          });

          const uniqueSubcats: any[] = [];
          const seenSubcats = new Set<string>();
          for (const sub of mapped) {
            const key = `${sub.name?.toLowerCase().trim()}::${sub.category_name?.toLowerCase().trim()}`;
            if (!seenSubcats.has(key)) {
              seenSubcats.add(key);
              uniqueSubcats.push(sub);
            }
          }
          setSubcategories(uniqueSubcats);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar subcategorias, fallback cache:', err);
      const cached = localStorage.getItem('finvision_cached_subcategories_cc') ||
                     localStorage.getItem('finvision_cached_subcategories');
      if (cached) {
        try {
          const raw = JSON.parse(cached);
          const catsCached = localStorage.getItem('finvision_cached_categories_cc') || localStorage.getItem('finvision_cached_categories');
          const cats = catsCached ? JSON.parse(catsCached) : [];
          const mapped = raw.map((s: any) => {
            let catName = s.category_name;
            if (!catName && s.category_id && cats.length > 0) {
              const matched = cats.find((c: any) => c.id === s.category_id);
              if (matched) catName = matched.name;
            }
            return {
              id: s.id,
              name: s.name,
              category_name: catName
            };
          });

          const uniqueSubcats: any[] = [];
          const seenSubcats = new Set<string>();
          for (const sub of mapped) {
            const key = `${sub.name?.toLowerCase().trim()}::${sub.category_name?.toLowerCase().trim()}`;
            if (!seenSubcats.has(key)) {
              seenSubcats.add(key);
              uniqueSubcats.push(sub);
            }
          }
          setSubcategories(uniqueSubcats);
        } catch (e) {
          setSubcategories([]);
        }
      }
    }
  };

  const fetchAccounts = async () => {
    if (!supabase) return;
    try {
      if (navigator.onLine) {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;
        const { data, error } = await supabase
          .from('accounts')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_archived', false)
          .order('created_at', { ascending: true });
        if (error) throw error;
        const list = (data || []) as Account[];

        // Deduplicate accounts by institution name
        const uniqueAccounts: Account[] = [];
        const seenAccs = new Set<string>();
        for (const acc of list) {
          const name = (acc.institution || acc.name || acc.bank_name || 'Conta').trim().toLowerCase();
          if (!seenAccs.has(name)) {
            seenAccs.add(name);
            uniqueAccounts.push(acc);
          }
        }

        setAccounts(uniqueAccounts);
        localStorage.setItem('finvision_cached_accounts_cc', JSON.stringify(uniqueAccounts));
        if (!payAccountId && uniqueAccounts.length > 0) {
          setPayAccountId(uniqueAccounts[0].id);
        }
      } else {
        const cached = localStorage.getItem('finvision_cached_accounts_cc') ||
                       localStorage.getItem('finvision_cached_accounts') ||
                       localStorage.getItem('finvision_cached_accounts_full');
        if (cached) {
          const rawList = JSON.parse(cached);
          const list = rawList.map((a: any) => ({
            id: a.id,
            institution: a.institution || a.name || a.bank_name || `Conta ${a.id.slice(0, 6)}`,
            name: a.name || a.institution || a.bank_name,
            bank_name: a.bank_name || a.institution || a.name
          }));

          const uniqueAccounts: any[] = [];
          const seenAccs = new Set<string>();
          for (const acc of list) {
            const name = (acc.institution || acc.name || acc.bank_name || 'Conta').trim().toLowerCase();
            if (!seenAccs.has(name)) {
              seenAccs.add(name);
              uniqueAccounts.push(acc);
            }
          }

          setAccounts(uniqueAccounts);
          if (!payAccountId && uniqueAccounts.length > 0) {
            setPayAccountId(uniqueAccounts[0].id);
          }
        }
      }
    } catch (err) {
      console.error('Erro ao buscar contas, fallback cache:', err);
      const cached = localStorage.getItem('finvision_cached_accounts_cc') ||
                     localStorage.getItem('finvision_cached_accounts') ||
                     localStorage.getItem('finvision_cached_accounts_full');
      if (cached) {
        try {
          const rawList = JSON.parse(cached);
          const list = rawList.map((a: any) => ({
            id: a.id,
            institution: a.institution || a.name || a.bank_name || `Conta ${a.id.slice(0, 6)}`,
            name: a.name || a.institution || a.bank_name,
            bank_name: a.bank_name || a.institution || a.name
          }));

          const uniqueAccounts: any[] = [];
          const seenAccs = new Set<string>();
          for (const acc of list) {
            const name = (acc.institution || acc.name || acc.bank_name || 'Conta').trim().toLowerCase();
            if (!seenAccs.has(name)) {
              seenAccs.add(name);
              uniqueAccounts.push(acc);
            }
          }

          setAccounts(uniqueAccounts);
          if (!payAccountId && uniqueAccounts.length > 0) {
            setPayAccountId(uniqueAccounts[0].id);
          }
        } catch (e) {
          setAccounts([]);
        }
      }
    }
  };

  const fetchOwners = async () => {
    if (!supabase) return;
    try {
      if (navigator.onLine) {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;
        const { data, error } = await supabase.from('entities').select('name').eq('user_id', user.id).eq('is_archived', false);
        if (error) throw error;
        const ownersList = ['Pessoal', ...(data || []).map((o: any) => o.name)];

        // Deduplicate owners
        const uniqueOwners = Array.from(new Set(ownersList.map((o: string) => o.trim()))).filter(Boolean) as string[];

        setOwners(uniqueOwners);
        localStorage.setItem('finvision_cached_owners_cc', JSON.stringify(uniqueOwners));
      } else {
        const cached = localStorage.getItem('finvision_cached_owners_cc') ||
                       localStorage.getItem('finvision_cached_owners');
        if (cached) {
          const parsed = JSON.parse(cached) as string[];
          const uniqueOwners = Array.from(new Set(parsed.map((o: string) => o.trim()))).filter(Boolean) as string[];
          setOwners(uniqueOwners);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar proprietários, fallback cache:', err);
      const cached = localStorage.getItem('finvision_cached_owners_cc') ||
                     localStorage.getItem('finvision_cached_owners');
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as string[];
          const uniqueOwners = Array.from(new Set(parsed.map((o: string) => o.trim()))).filter(Boolean) as string[];
          setOwners(uniqueOwners);
        } catch (e) {
          setOwners(['Pessoal']);
        }
      }
    }
  };

  const getAccountLabel = (a: Account) => {
    return a.institution || a.name || a.bank_name || `Conta ${a.id.slice(0, 6)}`;
  };

  // Voltou a internet (ou a fila offline subiu): recarrega a fatura do cartão
  // aberto, em vez de deixar na tela o retrato antigo do cache.
  useReconnectRefresh(() => { if (selectedCard?.id) loadCardContext(selectedCard.id); });

  // forcedStatementId: usado ao TROCAR de cartão, para ignorar a fatura que estava
  // selecionada no cartão anterior. Sem isso o valor antigo continuava valendo e a
  // tela do novo cartão carregava a fatura do cartão que você acabou de deixar.
  const loadCardContext = async (cardId: string, forcedStatementId?: string) => {
    try {
      const allStatements = await fetchStatements(cardId);
      setStatements(allStatements);

      // 1. Determinar o período de postagem "alvo" (Baseado em hoje + dia de fechamento)
      // Priorizamos o selectedCard se o ID bater, para evitar falha se o array 'cards' ainda estiver carregando
      const card = (selectedCard?.id === cardId ? selectedCard : cards.find(c => c.id === cardId));

      const now = new Date();
      const localDay = now.getDate();
      let localMonth = now.getMonth(); // 0-indexed (Fev = 1)
      let localYear = now.getFullYear();

      // Regra de Fechamento: Se passou do dia de fechamento, a compra cai na próxima fatura
      if (card?.closing_day && localDay > card.closing_day) {
        localMonth++;
        if (localMonth > 11) {
          localMonth = 0;
          localYear++;
        }
      }

      const targetMonth = localMonth + 1; // 1-indexed para o banco
      const targetYear = localYear;



      // 2. Tentar encontrar a fatura que corresponde EXATAMENTE a este período de uso
      let current = allStatements.find((s: any) => s.month === targetMonth && s.year === targetYear);

      // 3. Fallback inteligente: Se não houver fatura do mês atual, pega a fatura aberta mais antiga/próxima (a que deve ser paga logo)
      if (!current) {
        const openStatements = [...allStatements]
          .filter(s => ['OPEN', 'DUE', 'PENDING'].includes(s.status))
          .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
        current = openStatements[0];
      }

      // 4. Último recurso: A fatura mais recente do banco
      if (!current) {
        current = allStatements[0];
      }

      setCurrentStatement(current || null);
      // Memoriza a fatura atual "de verdade" para o seletor sempre conseguir voltar a ela
      setRealCurrentStatement(current || null);

      // Se não houver seleção manual, focar na atual
      const effectiveSelection = forcedStatementId ?? selectedStatementId;
      const targetId = effectiveSelection === 'CURRENT' ? current?.id : effectiveSelection;
      await fetchTransactions(cardId, targetId === 'ALL' ? null : targetId, allStatements);
    } catch (e) {
      console.error('Erro ao carregar contexto do cartão:', e);
      setCurrentStatement(null);
      await fetchTransactions(cardId);
    }
  };

  // Agrupa faturas de vários cartões (titular + adicionais) por mês/ano numa fatura
  // "virtual" só de soma - nunca é gravada no banco, existe só pra tela consolidada.
  const buildCombinedStatements = (rows: any[], rootCardId: string) => {
    const groups = new Map<string, any>();
    for (const s of rows) {
      const key = `${s.year}-${s.month}`;
      if (!groups.has(key)) {
        groups.set(key, {
          id: `combined:${key}`,
          card_id: null,
          month: s.month,
          year: s.year,
          due_date: s.due_date,
          closing_date: s.closing_date,
          total_amount: 0,
          paid_amount: 0,
          status: 'OPEN',
          is_combined: true,
          memberStatementIds: [] as string[]
        });
      }
      const g = groups.get(key);
      g.total_amount = Math.round((g.total_amount + Number(s.total_amount || 0)) * 100) / 100;
      g.paid_amount = Math.round((g.paid_amount + Number(s.paid_amount || 0)) * 100) / 100;
      g.memberStatementIds.push(s.id);
      // Preferir data/vencimento do cartão titular quando disponível (ele é quem
      // "manda" no período consolidado, já que os adicionais seguem o mesmo ciclo).
      if (s.card_id === rootCardId) {
        g.due_date = s.due_date;
        g.closing_date = s.closing_date;
      }
    }
    return Array.from(groups.values())
      .map(g => ({ ...g, status: g.total_amount > 0 && g.paid_amount >= g.total_amount ? 'PAID' : 'OPEN' }))
      .sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime());
  };

  const fetchStatements = async (cardId: string) => {
    const familyIds = combinedCardIds;
    const cacheKey = familyIds ? `finvision_cached_statements_combined_${[...familyIds].sort().join('-')}` : `finvision_cached_statements_${cardId}`;
    const cached = localStorage.getItem(cacheKey);
    const cachedData = cached ? JSON.parse(cached) : [];
    if (cachedData.length > 0) {
      setStatements(cachedData);
    }

    if (!supabase || !navigator.onLine) return cachedData;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return cachedData;

      let query = supabase.from('card_statements').select('*').eq('user_id', user.id).order('due_date', { ascending: false });
      query = familyIds ? query.in('card_id', familyIds) : query.eq('card_id', cardId);
      const { data, error } = await query;

      if (error) throw error;
      const result = familyIds ? buildCombinedStatements(data || [], cardId) : (data || []);
      localStorage.setItem(cacheKey, JSON.stringify(result));
      setStatements(result);
      return result;
    } catch (err) {
      console.error('Erro ao buscar faturas, fallback cache:', err);
      return cachedData;
    }
  };

  // Carrega lançamentos recentes do usuário (todos os cartões) para sugerir descrições,
  // preenchendo categoria/subcategoria/pessoa automaticamente — igual às transações.
  const fetchRecentTxs = async () => {
    if (!supabase || !navigator.onLine) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;
      const { data, error } = await supabase
        .from('card_transactions')
        .select('description, category_id, subcategory, owner_name, categories(name)')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(300);
      if (error) throw error;

      // Mantém apenas o lançamento mais recente por descrição (deduplica)
      const seen = new Set<string>();
      const unique: any[] = [];
      for (const t of (data || [])) {
        const key = (t.description || '').toLowerCase().trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push({
          description: t.description,
          category_id: t.category_id,
          category: (t as any).categories?.name || '',
          subcategory: t.subcategory || '',
          owner_name: t.owner_name || ''
        });
      }
      setRecentTxs(unique);
    } catch (err) {
      console.error('Erro ao buscar lançamentos recentes do cartão:', err);
    }
  };

  const fetchTransactions = async (cardId: string, statementId?: string | null, statementsOverride?: any[]) => {
    const familyIds = combinedCardIds;
    const dynamicKey = familyIds
      ? `finvision_cached_card_transactions_combined_${[...familyIds].sort().join('-')}_${statementId || 'all'}`
      : `finvision_cached_card_transactions_${cardId}_${statementId || 'all'}`;
    const cached = localStorage.getItem(dynamicKey);
    const cachedData = cached ? JSON.parse(cached) : [];
    if (cachedData.length > 0) {
      setTransactions(cachedData);
      setLoadingTxs(false);
    } else {
      setLoadingTxs(true);
    }

    // Update currentStatement to the one being viewed if it's a specific one
    if (statementId) {
      const pool = statementsOverride || statements;
      const selected = pool.find(s => s.id === statementId);
      if (selected) setCurrentStatement(selected);
    }

    if (!supabase || !navigator.onLine) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      // Join com categories(name): sem isso, tx.category vem undefined (a coluna real
      // é category_id) e tanto o campo de categoria quanto a sugestão de subcategoria
      // (filtrada por tx.category) ficam sem nada pra mostrar depois de todo recarregamento.
      let query = supabase.from('card_transactions').select('*, categories(name)').eq('user_id', user.id).order('date', { ascending: false });

      if (familyIds) {
        // Visão consolidada: titular + TODOS os adicionais da família, sem olhar
        // sums_into_invoice (que só valia pro cálculo antigo, por cartão isolado).
        query = query.in('card_id', familyIds);
        if (statementId) {
          const pool = statementsOverride || statements;
          const combinedStmt = pool.find(s => s.id === statementId);
          const memberIds = combinedStmt?.memberStatementIds;
          query = memberIds && memberIds.length > 0 ? query.in('statement_id', memberIds) : query.eq('statement_id', statementId);
        }
      } else {
        // O filtro por cartão vale SEMPRE, inclusive quando há uma fatura escolhida.
        // Antes, com fatura selecionada, a busca ia só pelo statement_id — então uma
        // seleção que sobrasse de outro cartão trazia os lançamentos daquele outro
        // cartão para a tela do atual. Como a fatura pertence a um cartão só, somar o
        // filtro de cartão não muda o resultado legítimo e fecha essa porta.
        query = query.eq('card_id', cardId);
        if (statementId) query = query.eq('statement_id', statementId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const mapped = (data || []).map((t: any) => ({ ...t, category: t.categories?.name || '' }));
      setTransactions(mapped);
      localStorage.setItem(dynamicKey, JSON.stringify(mapped));
    } catch (err) {
      console.error('Erro ao buscar transações de cartão, fallback cache:', err);
    } finally {
      setLoadingTxs(false);
    }
  };

  const updateTxLocal = (id: string, patch: any) => {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const saveTxPatch = async (id: string, patch: any, confirmedScope?: SeriesScope) => {
    if (!supabase) return;

    // `tags` é uma coluna text[]: precisa virar array SEMPRE que o campo veio na
    // edição. A guarda anterior era `if (patch.tags && ...)`, e `''` é falso —
    // então APAGAR as tags pulava a conversão e mandava a string vazia para o
    // banco, que recusa `''` num text[]. O erro caía no console e o usuário só
    // via a tag voltar do jeito que estava.
    if ('tags' in patch) {
      patch.tags = parseTags(patch.tags);
    }

    const tx = transactions.find(t => t.id === id);
    const isSeries = tx?.installment_group_id || tx?.recurrence_group_id;

    if (isSeries && !confirmedScope) {
      setSeriesModal({
        show: true,
        tx: tx || null,
        pendingAction: 'UPDATE',
        pendingPatch: patch
      });
      return;
    }

    setSavingRowId(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      if (!confirmedScope || confirmedScope === 'ONLY_THIS') {
        const { error } = await supabase.from('card_transactions').update(patch).eq('id', id).eq('user_id', user.id);
        if (error) throw error;
      } else {
        const groupId = tx?.installment_group_id || tx?.recurrence_group_id;
        let query = supabase.from('card_transactions').update(patch).eq('user_id', user.id);

        if (tx?.installment_group_id) query = query.eq('installment_group_id', groupId);
        else query = query.eq('recurrence_group_id', groupId);

        if (confirmedScope === 'THIS_AND_FUTURE') {
          query = query.gte('date', tx?.date);
        }

        const { error } = await query;
        if (error) throw error;
      }
    } catch (err: any) {
      // Antes isso morria só no console: a edição não era gravada e a tela
      // recarregava com o valor antigo, sem nenhum aviso. Quem editava uma tag
      // via o campo "voltar sozinho" e concluía que o app não salvava.
      console.error('Erro ao salvar transação:', err);
      toast('Não foi possível salvar a alteração: ' + (err?.message || 'erro desconhecido'), 'error');
    } finally {
      setSavingRowId(null);
      setSeriesModal({ show: false, tx: null, pendingAction: 'DELETE' });
      if (selectedCard?.id) loadCardContext(selectedCard.id);
      if (tx?.statement_id) await FinanceService.syncStatementToHistory(tx.statement_id);
    }
  };

  // Digitação inteligente (autocomplete) da categoria na tabela de lançamentos:
  // o campo é texto livre com sugestões (datalist), então aqui resolvemos o nome
  // pra um category_id existente (com correção de digitação) ou cria a categoria
  // na hora, igual já acontece em Conciliação e em Transações.
  //
  // IMPORTANTE: cada salvamento de campo (saveTxPatch) recarrega TODA a lista de
  // lançamentos no final (loadCardContext). Se esse commit ficar esperando uma
  // chamada de rede extra antes de chamar saveTxPatch, o usuário tem tempo de editar
  // outra linha/campo enquanto isso — e quando o loadCardContext daquele outro campo
  // termina primeiro, ele sobrescreve esta edição (que ainda não tinha sido salva)
  // com o valor antigo do banco, dando a impressão de que a categoria "voltou sozinha".
  // Por isso resolvemos pela lista já carregada em memória (categories/subcategories)
  // sempre que possível, e só fazemos uma chamada de rede bloqueante quando é
  // realmente uma categoria/subcategoria nova.
  const handleCategoryCommit = async (id: string, rawValue: string) => {
    const value = rawValue.trim();
    if (!value) {
      updateTxLocal(id, { category: '', category_id: null });
      saveTxPatch(id, { category_id: null });
      return;
    }
    const matchedName = findCloseMatch(value, categories.map(c => c.name));
    const existing = matchedName ? categories.find(c => c.name === matchedName) : undefined;
    if (existing) {
      updateTxLocal(id, { category: existing.name, category_id: existing.id });
      saveTxPatch(id, { category_id: existing.id });
      return;
    }
    // Categoria nova: só aqui precisamos esperar a criação no banco.
    const catId = await ReconciliationService.ensureCategoryExists(value);
    if (catId) {
      updateTxLocal(id, { category: value, category_id: catId });
      saveTxPatch(id, { category_id: catId });
      fetchCategories();
    }
  };

  const handleSubcategoryCommit = (id: string, rawValue: string) => {
    const value = rawValue.trim();
    const tx = transactions.find(t => t.id === id);
    if (!value) {
      updateTxLocal(id, { subcategory: '' });
      saveTxPatch(id, { subcategory: null });
      return;
    }
    const catName = tx?.category || '';
    const subcatNames = subcategories.filter(s => s.category_name === catName).map(s => s.name);
    const matchedName = findCloseMatch(value, subcatNames) || value;
    // Salva o campo imediatamente, sem esperar nenhuma chamada de rede.
    updateTxLocal(id, { subcategory: matchedName });
    saveTxPatch(id, { subcategory: matchedName });
    // Registrar a subcategoria nova (pra virar sugestão futura) roda em segundo
    // plano, sem atrasar o salvamento do campo em si.
    if (catName && !subcatNames.includes(matchedName)) {
      (async () => {
        const catId = tx?.category_id || await ReconciliationService.ensureCategoryExists(catName);
        if (catId) {
          await (ReconciliationService as any).ensureSubcategoryExists(catId, matchedName);
          fetchSubcategories();
        }
      })();
    }
  };

  const handleDeleteTx = async (id: string, confirmedScope?: SeriesScope) => {
    if (currentStatement?.status === 'PAID') {
      toast("Fatura paga. Reabra a fatura para remover transações.", 'warning');
      return;
    }
    if (!supabase) return;

    const tx = transactions.find(t => t.id === id);
    const isSeries = tx?.installment_group_id || tx?.recurrence_group_id;

    if (isSeries && !confirmedScope) {
      setSeriesModal({
        show: true,
        tx: tx || null,
        pendingAction: 'DELETE'
      });
      return;
    }

    if (!confirmedScope && !confirm('Excluir esta transação?')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      if (!confirmedScope || confirmedScope === 'ONLY_THIS') {
        const { error } = await supabase.from('card_transactions').delete().eq('id', id).eq('user_id', user.id);
        if (error) throw error;
      } else {
        const groupId = tx?.installment_group_id || tx?.recurrence_group_id;
        let query = supabase.from('card_transactions').delete().eq('user_id', user.id);

        if (tx?.installment_group_id) query = query.eq('installment_group_id', groupId);
        else query = query.eq('recurrence_group_id', groupId);

        if (confirmedScope === 'THIS_AND_FUTURE') {
          query = query.gte('date', tx?.date);
        }

        const { error } = await query;
        if (error) throw error;
      }

      if (selectedCard?.id) loadCardContext(selectedCard.id);
      if (tx?.statement_id) await FinanceService.syncStatementToHistory(tx.statement_id);
    } catch (err) {
      console.error('Erro ao excluir transação:', err);
    } finally {
      setSeriesModal({ show: false, tx: null, pendingAction: 'DELETE' });
    }
  };

  const handleUploadAttachment = async (id: string, file: File) => {
    try {
      setSavingRowId(id);
      const documentId = await FinanceService.uploadAttachment(file, 'card');
      const { error } = await supabase!.from('card_transactions').update({ document_id: documentId }).eq('id', id);
      if (error) throw error;
      setTransactions(prev => prev.map(t => t.id === id ? { ...t, document_id: documentId } : t));
    } catch (err) {
      console.error('Erro ao anexar arquivo:', err);
      toast('Erro ao anexar arquivo.', 'error');
    } finally {
      setSavingRowId(null);
    }
  };

  const handleDeleteAttachment = async (documentId: string, transactionId: string) => {
    if (!confirm('Remover este comprovante?')) return;
    try {
      setSavingRowId(transactionId);
      await FinanceService.deleteAttachment(documentId);
      const { error } = await supabase!.from('card_transactions').update({ document_id: null }).eq('id', transactionId);
      if (error) throw error;
      setTransactions(prev => prev.map(t => t.id === transactionId ? { ...t, document_id: null } : t));
    } catch (err) {
      console.error('Erro ao remover anexo:', err);
      toast('Erro ao remover anexo.', 'error');
    } finally {
      setSavingRowId(null);
    }
  };

  const handleViewAttachment = async (documentId: string) => {
    try {
      const url = await FinanceService.getAttachmentUrl(documentId);
      if (url) window.open(url, '_blank');
      else toast('Não foi possível carregar o comprovante.', 'error');
    } catch (err) {
      console.error('Erro ao visualizar anexo:', err);
    }
  };

  const handleAddManualTx = async () => {
    const parseNumeric = (val: any, fallback = 0): number => {
      if (typeof val === 'number') return val;
      const s = String(val || '').replace(',', '.').trim();
      const n = parseFloat(s);
      return isNaN(n) ? fallback : n;
    };

    if (!supabase || !txCardId) return;
    setIsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const cleanAmount = parseNumeric(txAmount);
      const cleanInstallments = parseNumeric(installmentsCount, 1);

      // Resolve categoryName (txCategory) to category_id, auto-creating if it doesn't exist
      let resolvedCategoryId: string | null = null;
      if (txCategory.trim()) {
        const catObj = categories.find(c => c.name.toLowerCase().trim() === txCategory.toLowerCase().trim());
        if (catObj) {
          resolvedCategoryId = catObj.id;
        } else {
          try {
            const { data: newCat, error: catError } = await supabase
              .from('categories')
              .insert({ user_id: user.id, name: txCategory.trim(), type: 'EXPENSE', color: 'bg-brand-50 text-brand-600' })
              .select('id')
              .single();
            if (!catError && newCat) {
              resolvedCategoryId = newCat.id;
              // Refresh categories list in background
              fetchCategories();
            }
          } catch (e) {
            console.error("Erro ao criar categoria sob demanda:", e);
          }
        }
      }

      let cleanSubcategory = txSubcategory || null;
      if (cleanSubcategory && txCategory.trim()) {
        const subcatNames = subcategories.filter(s => s.category_name?.toLowerCase().trim() === txCategory.toLowerCase().trim()).map(s => s.name);
        const matched = findCloseMatch(cleanSubcategory, subcatNames);
        if (matched) {
          cleanSubcategory = matched;
        } else if (resolvedCategoryId) {
          // Subcategoria nova: registra na tabela para virar opção futura (igual às transações).
          // O serviço já faz dedup interno, evitando duplicatas.
          try {
            await ReconciliationService.ensureSubcategoryExists(resolvedCategoryId, cleanSubcategory.trim());
            fetchSubcategories();
          } catch (e) {
            console.error('Erro ao salvar subcategoria nova do cartão:', e);
          }
        }
      }

      const cardObj = cards.find(c => c.id === txCardId);
      const defaultOwnerName = cardObj?.default_owner || 'Pessoal';

      if (!isInstallment && !isRecurring) {
        // Fluxo Simples
        const targetStmtId = await FinanceService.getOrCreateStatement(txCardId, txDate);
        const payload: any = {
          user_id: user.id,
          card_id: txCardId,
          statement_id: targetStmtId,
          date: txDate,
          description: txDescription,
          amount: cleanAmount,
          status: 'POSTED',
          source: 'MANUAL',
          is_manual: true,
          category_id: resolvedCategoryId || null,
          subcategory: cleanSubcategory,
          owner_name: defaultOwnerName,
          notes: txNotes || '',
          tags: parseTags(txTags)
        };

        const { data: txData, error } = await supabase.from('card_transactions').insert([payload]).select('id').single();
        if (error) throw error;

        // Captura os pedaços antes do resetTxForm() limpar o estado do formulário.
        const pendingSplits = txIsDividing ? txSplits : null;

        // OPTIMISTIC UI: Fechar modal e limpar campos IMEDIATAMENTE após o insert básico
        setShowAddTxModal(false);
        resetTxForm();
        loadCardContext(txCardId); // Background refresh

        // Processos em Background (sem await para não travar o fechamento do modal)
        (async () => {
          if (txData?.id && txFiles && txFiles.length > 0) {
            for (const file of txFiles) {
              try {
                await FinanceService.uploadAttachment(file, txData.id, true);
              } catch (e) { console.error("Erro background attachment:", e); }
            }
          }
          if (txData?.id && pendingSplits && pendingSplits.length > 0) {
            try {
              await SplitTransactionService.saveSplits('card_transaction', txData.id, pendingSplits);
              loadCardContext(txCardId);
            } catch (e) {
              console.error("Erro background divisão:", e);
              toast('Lançamento criado, mas não foi possível salvar a divisão. Abra o lançamento e divida de novo.', 'error');
            }
          }
          if (targetStmtId) {
            try {
              await FinanceService.syncStatementToHistory(targetStmtId);
            } catch (e) { console.error("Erro background sync:", e); }
          }
        })();

      } else {
        // Fluxo Série (Parcelado ou Recorrente)
        const type = isInstallment ? 'INSTALLMENT' : 'RECURRING';
        const { TransactionSeriesUtils } = await import('../../lib/transactionSeriesUtils');

        const series = TransactionSeriesUtils.generateSeries(
          {
            user_id: user.id,
            card_id: txCardId,
            description: txDescription,
            amount: cleanAmount,
            category_id: resolvedCategoryId || undefined,
            is_manual: true,
            source: 'MANUAL',
          },
          {
            type,
            count: cleanInstallments,
            period: recurrencePeriod,
            daysInterval: recurrenceDaysInterval,
            startDate: txDate,
            totalAmount: isInstallment ? cleanAmount : undefined
          }
        );

        const groupId = crypto.randomUUID();
        const inserts = [];
        for (const item of series) {
          const targetStmtId = await FinanceService.getOrCreateStatement(txCardId, item.date!);
          inserts.push({
            user_id: user.id,
            card_id: txCardId,
            statement_id: targetStmtId,
            date: item.date,
            description: item.description,
            amount: item.amount,
            status: 'POSTED',
            category_id: resolvedCategoryId || null,
            is_manual: true,
            source: 'MANUAL',
            is_installment: item.is_installment,
            installment_number: item.installment_number,
            installment_total: item.installment_total,
            installment_group_id: isInstallment ? groupId : null,
            is_recurring: item.is_recurring,
            recurrence_period: item.recurrence_period,
            recurrence_group_id: isRecurring ? groupId : null,
            subcategory: cleanSubcategory,
            owner_name: defaultOwnerName,
            notes: txNotes || '',
            tags: parseTags(txTags)
          });
        }
        
        const { data: insertsData, error } = await supabase.from('card_transactions').insert(inserts).select('id');
        if (error) throw error;

        // OPTIMISTIC UI para séries
        setShowAddTxModal(false);
        resetTxForm();
        loadCardContext(txCardId);

        (async () => {
          // Attachments
          if (insertsData?.[0]?.id && txFiles && txFiles.length > 0) {
            for (const file of txFiles) {
              try {
                await FinanceService.uploadAttachment(file, insertsData[0].id, true);
              } catch (e) { console.error("Erro background series attachment:", e); }
            }
          }
          // Sync all affected statements
          const uniqueStmtIds = Array.from(new Set(inserts.map(i => i.statement_id)));
          for (const sid of uniqueStmtIds) {
            if (sid) {
              try {
                await FinanceService.syncStatementToHistory(sid);
              } catch (e) { console.error("Erro background series sync:", e); }
            }
          }
        })();
      }
    } catch (err: any) {
      console.error('Erro crítico ao adicionar transação:', err);
      toast("Erro ao salvar lançamento: " + (err.message || "Erro desconhecido"), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const resetTxForm = () => {
    setTxDescription('');
    setTxAmount('');
    setTxDate(DateUtils.formatToISODate());
    setTxCategory('');
    setTxSubcategory('');
    setIsInstallment(false);
    setIsRecurring(false);
    setInstallmentsCount('');
    setTxFiles([]);
    setTxNotes('');
    setTxTags([]);
    setTxIsDividing(false);
    setTxSplits(null);
  };

  const handleEditClick = () => {
    if (!selectedCard) return;
    setNewName(selectedCard.name);
    setNewBrand(selectedCard.brand);
    setNewLast4(selectedCard.last4);
    setNewLimit(selectedCard.limit_total);
    setNewClosingDay(selectedCard.closing_day);
    setNewDueDay(selectedCard.due_day);
    setIsAdditional(selectedCard.is_additional);
    setParentCardId(selectedCard.parent_card_id || '');
    setAdditionalLabel(selectedCard.additional_label || '');
    setSumsIntoInvoice(selectedCard.sums_into_invoice !== false);
    setDefaultCategory(selectedCard.default_category || 'Pessoal');
    setDefaultSubcategory(selectedCard.default_subcategory || '');
    setDefaultOwner(selectedCard.default_owner || 'Pessoal');
    setIsDefaultCard(!!selectedCard.is_default);
    setIsEditing(true);
    setShowAddModal(true);
  };

  const handleArchiveCard = async () => {
    if (!selectedCard || !supabase) return;
    if (!confirm(`Arquivar o cartão "${selectedCard.name}"? Ele não aparecerá mais na lista ativa.`)) return;

    try {
      const { error } = await supabase
        .from('cards')
        .update({ is_archived: true, status: 'archived' })
        .eq('id', selectedCard.id);

      if (error) throw error;

      const updatedCards = cards.filter(c => c.id !== selectedCard.id);
      setCards(updatedCards);
      setSelectedCard(updatedCards.length > 0 ? updatedCards[0] : null);
    } catch (err) {
      console.error('Erro ao arquivar cartão:', err);
      toast('Erro ao arquivar cartão.', 'error');
    }
  };

  const handleDeleteCard = async () => {
    if (!selectedCard || !supabase) return;
    if (!confirm(`EXCLUIR PERMANENTEMENTE o cartão "${selectedCard.name}"? Isso removerá todas as faturas e transações vinculadas.`)) return;

    try {
      const { error } = await supabase
        .from('cards')
        .delete()
        .eq('id', selectedCard.id);

      if (error) throw error;

      const updatedCards = cards.filter(c => c.id !== selectedCard.id);
      setCards(updatedCards);
      setSelectedCard(updatedCards.length > 0 ? updatedCards[0] : null);
    } catch (err) {
      console.error('Erro ao excluir cartão:', err);
      toast('Erro ao excluir cartão. Verifique se há transações impedindo a exclusão.', 'error');
    }
  };

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    // Check for close matches to prevent duplicate card names on creation
    if (!isEditing) {
      const matched = findCloseMatch(newName, cards.map(c => c.name));
      if (matched) {
        if (!window.confirm(`Já existe um cartão com o nome semelhante "${matched}". Deseja continuar e criar este cartão assim mesmo?`)) {
          setShowAddModal(false);
          resetCardForm();
          return;
        }
      }
    }

    setIsSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      let correctedCategory = defaultCategory || 'Pessoal';
      let correctedSubcategory = defaultSubcategory || '';
      let correctedOwner = defaultOwner || 'Pessoal';

      if (defaultCategory) {
        const matched = findCloseMatch(defaultCategory, categories.map(c => c.name));
        if (matched) correctedCategory = matched;
      }
      if (defaultSubcategory && correctedCategory) {
        const subcatNames = subcategories.filter(s => s.category_name === correctedCategory).map(s => s.name);
        const matched = findCloseMatch(defaultSubcategory, subcatNames);
        if (matched) correctedSubcategory = matched;
      }
      if (defaultOwner) {
        const matched = findCloseMatch(defaultOwner, owners);
        if (matched) correctedOwner = matched;
      }

      const payload = {
        user_id: user.id,
        name: newName,
        brand: newBrand,
        last4: newLast4,
        limit_total: Number(newLimit),
        closing_day: newClosingDay,
        due_day: newDueDay,
        is_archived: false,
        is_additional: isAdditional,
        parent_card_id: isAdditional ? parentCardId : null,
        additional_label: isAdditional ? additionalLabel : null,
        sums_into_invoice: isAdditional ? sumsIntoInvoice : true,
        default_category: correctedCategory,
        default_subcategory: correctedSubcategory,
        default_owner: correctedOwner,
        is_default: isDefaultCard
      };

      // Só pode haver 1 cartão padrão por usuário (índice único no banco garante
      // isso) - limpa o antigo ANTES de marcar o novo, senão os dois batem juntos
      // e o índice rejeita o update/insert.
      if (isDefaultCard) {
        await supabase
          .from('cards')
          .update({ is_default: false })
          .eq('user_id', user.id)
          .eq('is_default', true);
      }

      if (isEditing && selectedCard) {
        const { data, error } = await supabase
          .from('cards')
          .update(payload)
          .eq('id', selectedCard.id)
          .select()
          .single();
        if (error) throw error;
        setCards((prev) => prev.map(c => c.id === data.id ? data : { ...c, is_default: isDefaultCard ? false : c.is_default }));
        setSelectedCard(data);
      } else {
        const { data, error } = await supabase.from('cards').insert([payload]).select().single();
        if (error) throw error;
        setCards((prev) => [...prev.map(c => ({ ...c, is_default: isDefaultCard ? false : c.is_default })), data]);
        if (!selectedCard) setSelectedCard(data);
      }

      setShowAddModal(false);
      setIsEditing(false);
      resetCardForm();
    } catch (err: any) {
      console.error('Erro ao salvar cartão:', err);
      toast('Erro ao salvar cartão: ' + (err.message || 'Verifique sua conexão.'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const resetCardForm = () => {
    setNewName('');
    setNewBrand('Visa');
    setNewLast4('');
    setNewLimit('');
    setNewClosingDay(5);
    setNewDueDay(15);
    setIsAdditional(false);
    setParentCardId('');
    setAdditionalLabel('');
    setSumsIntoInvoice(true);
    setDefaultCategory('Pessoal');
    setDefaultSubcategory('');
    setDefaultOwner('Pessoal');
    setIsDefaultCard(false);
  };

  const handleRedirectToAccounts = () => {
    setShowPayModal(false);
    navigate('/banking?tab=accounts', { state: { openModal: true } });
  };

  // Paga, numa tacada só, todas as faturas de uma família (titular + adicionais) do
  // período consolidado que está na tela. O valor digitado é distribuído entre os
  // cartões proporcionalmente ao que cada um tem em aberto; pagando o valor cheio
  // (ou mais), cada fatura membro é quitada integralmente.
  const handlePayCombinedStatement = async () => {
    if (!supabase || !currentStatement?.is_combined) return;
    const memberIds: string[] = currentStatement.memberStatementIds || [];
    if (memberIds.length === 0) return;

    const cleanPayAmount = Math.round(Number(payAmount || 0) * 100) / 100;
    if (isNaN(cleanPayAmount) || cleanPayAmount <= 0) {
      toast("Por favor, insira um valor de pagamento válido maior que zero.", 'warning');
      return;
    }
    if (!payAccountId) {
      toast("Por favor, selecione uma conta bancária para o pagamento.", 'warning');
      return;
    }

    setIsPaying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Usuário não autenticado.");

      const { data: members, error: fetchErr } = await supabase
        .from('card_statements')
        .select('id, total_amount, paid_amount')
        .in('id', memberIds)
        .eq('user_id', user.id);
      if (fetchErr) throw fetchErr;
      if (!members || members.length === 0) throw new Error("Faturas da família não encontradas.");

      const opens: { id: string; total: number; paid: number; open: number }[] = members.map((m: any) => ({
        id: m.id,
        total: Number(m.total_amount || 0),
        paid: Number(m.paid_amount || 0),
        open: Math.max(0, Math.round((Number(m.total_amount || 0) - Number(m.paid_amount || 0)) * 100) / 100)
      }));
      const totalOpen = opens.reduce((s: number, o) => s + o.open, 0);

      // Distribui o valor pago proporcionalmente ao que cada fatura membro tem em
      // aberto. Pagando o total (ou mais), cada uma recebe exatamente o seu aberto.
      let remaining = cleanPayAmount;
      const payments: { id: string; pay: number }[] = opens.map((o, idx) => {
        if (idx === opens.length - 1) return { id: o.id, pay: Math.round(remaining * 100) / 100 };
        const share = totalOpen > 0 ? Math.round((cleanPayAmount * (o.open / totalOpen)) * 100) / 100 : 0;
        const capped = cleanPayAmount >= totalOpen ? o.open : Math.min(share, remaining);
        remaining = Math.round((remaining - capped) * 100) / 100;
        return { id: o.id, pay: capped };
      });

      // Sem internet: enfileira o pagamento de cada fatura da família em vez de
      // falhar. A ordem importa — primeiro a fatura, depois o espelho no
      // Histórico, que é derivado dela.
      if (isProbablyOffline()) {
        for (const o of opens) {
          const p = payments.find((x: { id: string; pay: number }) => x.id === o.id)!;
          const nextPaid = Math.round((o.paid + p.pay) * 100) / 100;
          const newStatus = nextPaid >= o.total ? 'PAID' : 'OPEN';
          offlineQueue.addAction('UPDATE_CARD_STATEMENT', {
            id: o.id,
            updates: { paid_amount: nextPaid, status: newStatus }
          });
          offlineQueue.addAction('SYNC_STATEMENT_TO_HISTORY', {
            statementId: o.id, accountId: payAccountId, paid: true
          });
        }
        offlineQueue.addAction('RECALC_ACCOUNT_BALANCE', { accountId: payAccountId });

        setShowPayModal(false);
        toast('Sem internet: pagamento salvo e será enviado quando a conexão voltar.', 'success');
        navigate('/history');
        return;
      }

      for (const o of opens) {
        const p = payments.find((x: { id: string; pay: number }) => x.id === o.id)!;
        const nextPaid = Math.round((o.paid + p.pay) * 100) / 100;
        const newStatus = nextPaid >= o.total ? 'PAID' : 'OPEN';
        const { error: upErr } = await supabase
          .from('card_statements')
          .update({ paid_amount: nextPaid, status: newStatus })
          .eq('id', o.id)
          .eq('user_id', user.id);
        if (upErr) throw upErr;
        await FinanceService.syncStatementToHistory(o.id, payAccountId, true);
      }

      await supabase.rpc('recalculate_account_balance', { p_account_id: payAccountId });

      setShowPayModal(false);
      navigate('/history');
      if (selectedCard?.id) loadCardContext(selectedCard.id);
    } catch (err: any) {
      console.error('Erro ao pagar faturas consolidadas:', err);
      toast("Erro ao processar pagamento: " + (err.message || "Erro desconhecido"), 'error');
    } finally {
      setIsPaying(false);
    }
  };

  const handlePayStatement = async () => {
    if (currentStatement?.is_combined) { await handlePayCombinedStatement(); return; }
    if (!supabase || !selectedCard?.id) return;

    const amount = Number(payAmount);
    if (isNaN(amount) || amount <= 0) {
      toast("Por favor, insira um valor de pagamento válido maior que zero.", 'warning');
      return;
    }

    if (!payAccountId) {
      toast("Por favor, selecione uma conta bancária para o pagamento.", 'warning');
      return;
    }
    setIsPaying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Usuário não autenticado.");

      let targetStatementId = currentStatement?.id;

      // Sem internet: dá para pagar uma fatura que JÁ existe (é só marcar), mas
      // não dá para criar a fatura ad-hoc abaixo — ela precisa do id que o banco
      // gera para as etapas seguintes. Avisamos em vez de falhar em silêncio.
      if (isProbablyOffline()) {
        if (!targetStatementId) {
          toast('Sem internet não é possível criar uma fatura nova. Conecte-se e tente de novo.', 'warning');
          setIsPaying(false);
          return;
        }

        const currentPaidOff = safeNumber(currentStatement?.paid_amount);
        const cleanPayOff = Math.round(Number(payAmount || 0) * 100) / 100;
        const nextPaidOff = Math.round((currentPaidOff + Math.abs(cleanPayOff)) * 100) / 100;
        const statusOff = nextPaidOff >= statementTotal ? 'PAID' : 'OPEN';

        offlineQueue.addAction('UPDATE_CARD_STATEMENT', {
          id: targetStatementId,
          updates: { total_amount: statementTotal, paid_amount: nextPaidOff, status: statusOff }
        });
        offlineQueue.addAction('SYNC_STATEMENT_TO_HISTORY', {
          statementId: targetStatementId, accountId: payAccountId, paid: true
        });
        offlineQueue.addAction('RECALC_ACCOUNT_BALANCE', { accountId: payAccountId });

        setShowPayModal(false);
        toast('Sem internet: pagamento salvo e será enviado quando a conexão voltar.', 'success');
        navigate('/history');
        return;
      }

      // Se não houver fatura, criar uma "Ad-hoc" para o mês atual
      if (!targetStatementId) {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        // Calcular datas baseadas no cartão (tentando ser esperto com os dias de fechamento/vencimento)
        const closingDate = new Date(now.getFullYear(), now.getMonth(), selectedCard.closing_day).toISOString();
        const dueDate = new Date(now.getFullYear(), now.getMonth() + (selectedCard.due_day < selectedCard.closing_day ? 1 : 0), selectedCard.due_day).toISOString();

        const { data: newStmt, error: stmtErr } = await supabase
          .from('card_statements')
          .insert([{
            user_id: user.id,
            card_id: selectedCard.id,
            month: month,
            year: year,
            total_amount: statementTotal,
            paid_amount: 0,
            status: 'OPEN',
            closing_date: closingDate,
            due_date: dueDate
          }])
          .select()
          .single();

        if (stmtErr) throw stmtErr;
        targetStatementId = newStmt.id;

        // Atribuir as transações que estão "soltas" a esta nova fatura para consistência
        await supabase
          .from('card_transactions')
          .update({ statement_id: targetStatementId })
          .eq('card_id', selectedCard.id)
          .is('statement_id', null)
          .eq('user_id', user.id);
      }

      const currentPaid = currentStatement?.id === targetStatementId ? safeNumber(currentStatement.paid_amount) : 0;
      const cleanPayAmount = Math.round(Number(payAmount || 0) * 100) / 100;
      const nextPaid = Math.round((currentPaid + Math.abs(cleanPayAmount)) * 100) / 100;
      const total = statementTotal;
      const newStatus = nextPaid >= total ? 'PAID' : 'OPEN';

      const { error: upErr } = await supabase
        .from('card_statements')
        .update({
          total_amount: total,
          paid_amount: nextPaid,
          status: newStatus
        })
        .eq('id', targetStatementId)
        .eq('user_id', user.id);

      if (upErr) throw upErr;

      // --- SYNC WITH HISTORY (Confirming Payment) ---
      await FinanceService.syncStatementToHistory(targetStatementId, payAccountId, true);

      // --- NEW: Recalcular saldo após pagamento ---
      if (payAccountId) {
        await supabase.rpc('recalculate_account_balance', { p_account_id: payAccountId });
      }

      setShowPayModal(false);
      navigate('/history');

      // Se por algum motivo continuarmos na página, atualizamos em background
      if (selectedCard?.id) loadCardContext(selectedCard.id);
    } catch (err: any) {
      console.error('Erro ao pagar fatura:', err);
      toast("Erro ao processar pagamento: " + (err.message || "Erro desconhecido"), 'error');
    } finally {
      setIsPaying(false);
    }
  };

  // Reabre de uma vez todas as faturas membro de um período consolidado.
  const handleReopenCombinedStatement = async () => {
    if (!supabase || !currentStatement?.is_combined) return;
    const memberIds: string[] = currentStatement.memberStatementIds || [];
    if (memberIds.length === 0) return;
    if (!window.confirm("Deseja reabrir todas as faturas desta família (titular + adicionais)? Isso reverterá os pagamentos no histórico.")) return;

    setIsPaying(true);
    try {
      for (const statementId of memberIds) {
        const { error: upErr } = await supabase
          .from('card_statements')
          .update({ status: 'OPEN', paid_amount: 0 })
          .eq('id', statementId);
        if (upErr) throw upErr;

        await FinanceService.syncStatementToHistory(statementId, undefined, false);

        const { data: tx } = await supabase
          .from('transactions')
          .select('account_id')
          .eq('metadata->>card_statement_id', statementId)
          .eq('is_deleted', false)
          .maybeSingle();
        if (tx?.account_id) {
          await supabase.rpc('recalculate_account_balance', { p_account_id: tx.account_id });
        }
      }

      if (selectedCard?.id) await loadCardContext(selectedCard.id);
      toast("Faturas reabertas com sucesso!", 'success');
    } catch (err: any) {
      console.error('Erro ao reabrir faturas consolidadas:', err);
      toast("Erro ao reabrir faturas: " + (err.message || "Erro desconhecido"), 'error');
    } finally {
      setIsPaying(false);
    }
  };

  const handleReopenStatement = async (statementId: string) => {
    if (!supabase || !window.confirm("Deseja reabrir esta fatura? Isso reverterá o pagamento no histórico.")) return;

    setIsPaying(true);
    try {
      // 1. Resetar status e valor pago na fatura
      const { error: upErr } = await supabase
        .from('card_statements')
        .update({
          status: 'OPEN',
          paid_amount: 0
        })
        .eq('id', statementId);

      if (upErr) throw upErr;

      // 2. Sincronizar com histórico passando 'false' para o overridePaid
      // Isso garantirá que a transação de pagamento de fatura seja marcada como is_paid = false
      await FinanceService.syncStatementToHistory(statementId, undefined, false);

      // 3. Recalcular saldo (Se tivermos o ID da conta vinculado à transação original)
      const { data: tx } = await supabase
        .from('transactions')
        .select('account_id')
        .eq('metadata->>card_statement_id', statementId)
        .eq('is_deleted', false) // Use false aqui pois syncStatementToHistory acabou de restaurar
        .maybeSingle();
      
      if (tx?.account_id) {
        await supabase.rpc('recalculate_account_balance', { p_account_id: tx.account_id });
      }

      // 4. Atualizar context
      if (selectedCard?.id) await loadCardContext(selectedCard.id);
      
      toast("Fatura reaberta com sucesso!", 'success');
    } catch (err: any) {
      console.error('Erro ao reabrir fatura:', err);
      toast("Erro ao reabrir fatura: " + (err.message || "Erro desconhecido"), 'error');
    } finally {
      setIsPaying(false);
    }
  };

  const statementBadge = (() => {
    // Se o total calculado for maior que o pago, garantimos que mostre como "Aberta" ou "Pendente"
    // independente do que a DB diga (evita delay de sync)
    if (statementTotal > 0 && statementOpen > 0) {
      const base = 'px-2 py-0.5 rounded text-[9px] font-black uppercase border';
      return <span className={`${base} bg-brand-50 text-brand-600 border-brand-100`}>Aberta</span>;
    }

    const s = String(currentStatement?.status || '').toUpperCase();
    if (!s) return null;
    const base = 'px-2 py-0.5 rounded text-[9px] font-black uppercase border';
    if (s === 'PAID' || (statementTotal > 0 && statementOpen === 0)) return <span className={`${base} bg-emerald-50 text-emerald-700 border-emerald-100`}>Paga</span>;
    if (s === 'DUE') return <span className={`${base} bg-rose-50 text-rose-700 border-rose-100`}>Vencendo</span>;
    if (s === 'OPEN' || s === 'PENDING') return <span className={`${base} bg-brand-50 text-brand-600 border-brand-100`}>Aberta</span>;
    return <span className={`${base} bg-slate-50 text-slate-600 border-slate-100`}>{s}</span>;
  })();

  const otherOpenStatements = statements.filter(s => 
    s.id !== currentStatement?.id && 
    ['OPEN', 'DUE', 'PENDING'].includes(s.status) && 
    Number(s.total_amount || 0) > Number(s.paid_amount || 0)
  );

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-10 py-8 space-y-8 animate-in fade-in duration-500">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cartões de Crédito</h1>
          <p className="text-sm text-slate-400 font-medium">Controle de faturas, limites e gastos adicionais.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => {
              if (isCardsLocked) {
                setShowUpgradeModal(true);
              } else {
                setShowAddModal(true);
              }
            }}
            className="flex flex-1 sm:flex-none items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition-all active:scale-95"
          >
            <Plus size={18} />
            <span>Adicionar Cartão</span>
          </button>
          <button
            onClick={() => setShowAddTxModal(true)}
            className="flex flex-1 sm:flex-none items-center justify-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl font-semibold shadow-lg shadow-brand-500/20 hover:bg-brand-700 transition-all active:scale-95"
          >
            <Plus size={18} />
            <span>Lançamento</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
          <div className="w-10 h-10 border-2 border-slate-200 border-t-brand-600 rounded-full animate-spin" />
          <p className="text-slate-400 font-medium tracking-widest text-[10px] uppercase">Acessando seus cartões...</p>
        </div>
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] bg-white border border-slate-100 rounded-[32px] p-20 text-center space-y-6">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
            <Plus size={40} />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-slate-900">Carteira Vazia</h3>
            <p className="text-slate-400 font-medium">Cadastre seu primeiro cartão para começar o controle.</p>
          </div>
          <button
            onClick={() => {
              if (isCardsLocked) {
                setShowUpgradeModal(true);
              } else {
                setShowAddModal(true);
              }
            }}
            className="px-8 py-4 bg-brand-900 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-black transition-all"
          >
            Cadastrar Cartão
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          <div className="lg:col-span-4 xl:col-span-3">
            <CardList
              cards={cards}
              selectedCardId={selectedCard?.id}
              isCombinedView={!!combinedCardIds}
              onSelectFamily={handleSelectFamily}
              onSelectIndividual={handleSelectIndividual}
              getCardColor={getCardColor}
              formatCurrency={formatCurrency}
            />
          </div>

          <div className="lg:col-span-8 xl:col-span-9 space-y-6 sm:space-y-8">
            {selectedCard && (
              <div className="p-5 sm:p-8 bg-white dark:bg-slate-800 rounded-[24px] sm:rounded-[40px] border border-slate-100 dark:border-slate-700 shadow-sm space-y-6 sm:space-y-8">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-slate-50 dark:border-slate-700 pb-6 sm:pb-8">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{selectedCard.name}</h2>
                      {selectedCard.is_additional && (
                        <span className="px-2.5 py-1 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 rounded-lg text-[9px] font-black uppercase border border-brand-100 dark:border-brand-500/20">
                          Adicional
                        </span>
                      )}
                      {combinedCardIds && (
                        <span className="px-2.5 py-1 bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-lg text-[9px] font-black uppercase border border-violet-100 dark:border-violet-500/20">
                          Consolidado (titular + adicionais)
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 font-bold text-xs sm:text-sm flex flex-wrap items-center gap-2 uppercase tracking-tight">
                      {selectedCard.brand} <span className="opacity-30 hidden xs:inline">•</span> **** {selectedCard.last4}
                      {selectedCard.is_additional && <><span className="opacity-30 hidden xs:inline">•</span> Portador: {selectedCard.additional_label}</>}
                    </p>
                  </div>

                  <div className="flex gap-2 sm:gap-3 w-full sm:w-auto justify-end">
                    <button
                      onClick={handleEditClick}
                      className="p-2.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-xl transition-all"
                      title="Editar Cartão"
                      aria-label={`Editar cartão ${selectedCard.name}`}
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={handleArchiveCard}
                      className="p-2.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-xl transition-all"
                      title="Arquivar Cartão"
                      aria-label={`${selectedCard.is_archived ? 'Desarquivar' : 'Arquivar'} cartão ${selectedCard.name}`}
                    >
                      <Archive size={18} />
                    </button>
                    <button
                      onClick={handleDeleteCard}
                      className="p-2.5 text-rose-400 hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-all"
                      title="Excluir Cartão"
                      aria-label={`Excluir cartão ${selectedCard.name}`}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <StatementSummary
                  currentStatement={currentStatement}
                  statementTotal={statementTotal}
                  statementPaid={statementPaid}
                  statementOpen={statementOpen}
                  formatCurrency={formatCurrency}
                  formatDateBR={formatDateBR}
                  onRefresh={() => loadCardContext(selectedCard.id)}
                  onPay={() => { setPayAmount(statementOpen); setShowPayModal(true); }}
                  onReopen={() => {
                    if (currentStatement?.is_combined) handleReopenCombinedStatement();
                    else if (currentStatement?.id) handleReopenStatement(currentStatement.id);
                  }}
                  statementBadge={statementBadge}
                />

                {otherOpenStatements.length > 0 && (
                  <div className="p-5 bg-amber-50/60 border border-amber-100/70 rounded-3xl flex items-start gap-4 text-amber-800 animate-in fade-in zoom-in-95 duration-300">
                    <Info size={20} className="shrink-0 text-amber-500 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-black uppercase tracking-wider text-amber-600">Atenção: Faturas Anteriores Pendentes</p>
                      <p className="text-[11px] font-bold text-amber-600/90 leading-relaxed">
                        Existem faturas de períodos passados com saldos em aberto (por exemplo, {DateUtils.formatStatementLabel(otherOpenStatements[0])}).
                        Você pode alternar o seletor de <strong>Período</strong> abaixo para visualizar e pagar essas faturas.
                      </p>
                    </div>
                  </div>
                )}

                <div className="pt-6 border-t border-slate-50 dark:border-slate-700">
                  <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-8">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-black text-slate-900 dark:text-white">Lançamentos</h3>
                        <button
                          onClick={() => setShowFilters(!showFilters)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${showFilters ? 'bg-brand-50 border-brand-200 text-brand-600' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-brand-200 hover:text-brand-500'}`}
                          title="Alternar Filtros"
                        >
                          {showFilters ? <XIcon size={14} /> : <Filter size={14} />}
                          Filtros
                        </button>
                      </div>
                      <p className="text-slate-400 text-sm font-medium">Controle e filtre os gastos deste cartão</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                      {/* Statement Selector */}
                      <div className="flex flex-col gap-1 w-full sm:w-auto">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Período</span>
                        <StatementPicker
                          statements={statements}
                          value={selectedStatementId}
                          realCurrentStatementId={realCurrentStatement?.id || currentStatement?.id || null}
                          onChange={(val) => {
                            setSelectedStatementId(val);
                            if (val === 'ALL') {
                              fetchTransactions(selectedCard.id, null);
                            } else if (val === 'CURRENT') {
                              // Sempre volta para a fatura atual "de verdade", não para a que estava sendo vista
                              const realCurrent = realCurrentStatement || currentStatement;
                              if (realCurrent) setCurrentStatement(realCurrent);
                              fetchTransactions(selectedCard.id, realCurrent?.id || null);
                            } else {
                              fetchTransactions(selectedCard.id, val);
                            }
                          }}
                        />
                      </div>

                      {showFilters && (
                        <div className="flex flex-wrap items-end gap-3 animate-in slide-in-from-top-2 duration-300">
                          {/* Search */}
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Busca</span>
                            <div className="relative">
                              <input
                                type="text"
                                placeholder="O que procura?"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="bg-slate-50 dark:bg-brand-900 border border-slate-100 dark:border-slate-700 rounded-2xl pl-4 pr-10 py-3 text-xs font-bold outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all w-full xl:w-48"
                              />
                            </div>
                          </div>

                          {/* Category Filter */}
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Categoria</span>
                            <select
                              value={filterCategory}
                              onChange={(e) => { setFilterCategory(e.target.value); setFilterSubcategory('ALL'); }}
                              className="bg-slate-50 dark:bg-brand-900 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-widest outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all min-w-[140px]"
                            >
                              <option value="ALL">Todas</option>
                              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>

                          {/* Subcategory Filter */}
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Subcategoria</span>
                            <select
                              value={filterSubcategory}
                              onChange={(e) => setFilterSubcategory(e.target.value)}
                              className="bg-slate-50 dark:bg-brand-900 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-widest outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all min-w-[140px]"
                            >
                              <option value="ALL">Todas</option>
                              {Array.from(new Set(
                                subcategories
                                  .filter(s => {
                                    if (filterCategory === 'ALL') return true;
                                    const catName = categories.find(c => c.id === filterCategory)?.name;
                                    return !catName || s.category_name === catName;
                                  })
                                  .map(s => s.name)
                              )).sort((a, b) => a.localeCompare(b)).map(name => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                            </select>
                          </div>

                          {/* Owner Filter */}
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pessoa/Empresa</span>
                            <select
                              value={filterOwner}
                              onChange={(e) => setFilterOwner(e.target.value)}
                              className="bg-slate-50 dark:bg-brand-900 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-widest outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all min-w-[140px]"
                            >
                              <option value="ALL">Todas</option>
                              {owners.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>

                          {/* Value Range */}
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Faixa de Valor</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                placeholder="Min"
                                value={minValue}
                                onChange={(e) => setMinValue(e.target.value)}
                                className="bg-slate-50 dark:bg-brand-900 border border-slate-100 dark:border-slate-700 rounded-2xl px-3 py-3 text-xs font-bold outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all w-20"
                              />
                              <input
                                type="number"
                                placeholder="Max"
                                value={maxValue}
                                onChange={(e) => setMaxValue(e.target.value)}
                                className="bg-slate-50 dark:bg-brand-900 border border-slate-100 dark:border-slate-700 rounded-2xl px-3 py-3 text-xs font-bold outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all w-20"
                              />
                            </div>
                          </div>

                          {/* Clear */}
                          <button
                            type="button"
                            onClick={() => { setSearchQuery(''); setFilterCategory('ALL'); setFilterSubcategory('ALL'); setFilterOwner('ALL'); setMinValue(''); setMaxValue(''); }}
                            className="h-[42px] px-4 text-rose-500 font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 rounded-2xl transition-all"
                          >
                            Limpar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <TransactionList
                    transactions={transactions.filter(t => {
                      const q = searchQuery.toLowerCase();
                      const matchesSearch = !q
                        || t.description?.toLowerCase().includes(q)
                        || (t.subcategory || '').toLowerCase().includes(q)
                        || (t.owner_name || '').toLowerCase().includes(q)
                        || (t.notes || '').toLowerCase().includes(q);
                      const matchesCategory = filterCategory === 'ALL' || t.category_id === filterCategory;
                      const matchesSubcategory = filterSubcategory === 'ALL' || t.subcategory === filterSubcategory;
                      const matchesOwner = filterOwner === 'ALL' || (t.owner_name || 'Pessoal') === filterOwner;
                      const absVal = Math.abs(Number(t.amount || 0));
                      const matchesMin = minValue === '' || absVal >= Number(minValue);
                      const matchesMax = maxValue === '' || absVal <= Number(maxValue);
                      return matchesSearch && matchesCategory && matchesSubcategory && matchesOwner && matchesMin && matchesMax;
                    })}
                    loadingTxs={loadingTxs}
                    categories={categories}
                    subcategories={subcategories}
                    savingRowId={savingRowId}
                    onAddManualTx={() => setShowAddTxModal(true)}
                    onUpdateTxLocal={updateTxLocal}
                    onSaveTxPatch={saveTxPatch}
                    onCommitCategory={handleCategoryCommit}
                    onCommitSubcategory={handleSubcategoryCommit}
                    onDeleteTx={handleDeleteTx}
                    onUploadAttachment={handleUploadAttachment}
                    onDeleteAttachment={handleDeleteAttachment}
                    onViewAttachment={handleViewAttachment}
                    showStatementScope={selectedStatementId !== 'ALL'}
                    statements={statements}
                    isLocked={currentStatement?.status === 'PAID'}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <AddCardModal
        show={showAddModal}
        onClose={() => { setShowAddModal(false); setIsEditing(false); resetCardForm(); }}
        onSubmit={handleAddCard}
        title={isEditing ? 'Editar Cartão' : 'Novo Cartão'}
        buttonLabel={isEditing ? 'Salvar Alterações' : 'Salvar Cartão'}
        isSaving={isSaving}
        isAnyModalBusy={isAnyModalBusy}
        cards={cards}
        newName={newName}
        setNewName={setNewName}
        newBrand={newBrand}
        setNewBrand={setNewBrand}
        newLast4={newLast4}
        setNewLast4={setNewLast4}
        newLimit={newLimit}
        setNewLimit={(v) => setNewLimit(v === '' ? '' : v)}
        newClosingDay={newClosingDay}
        setNewClosingDay={setNewClosingDay}
        newDueDay={newDueDay}
        setNewDueDay={setNewDueDay}
        isAdditional={isAdditional}
        setIsAdditional={setIsAdditional}
        parentCardId={parentCardId}
        setParentCardId={setParentCardId}
        additionalLabel={additionalLabel}
        setAdditionalLabel={setAdditionalLabel}
        sumsIntoInvoice={sumsIntoInvoice}
        setSumsIntoInvoice={setSumsIntoInvoice}
        defaultCategory={defaultCategory}
        setDefaultCategory={setDefaultCategory}
        defaultSubcategory={defaultSubcategory}
        setDefaultSubcategory={setDefaultSubcategory}
        defaultOwner={defaultOwner}
        setDefaultOwner={setDefaultOwner}
        isDefaultCard={isDefaultCard}
        setIsDefaultCard={setIsDefaultCard}
        entities={owners}
        categories={categories}
        subcategories={subcategories}
      />

      <ManualTransactionModal
        show={showAddTxModal}
        onClose={() => setShowAddTxModal(false)}
        onSubmit={handleAddManualTx}
        isSaving={isSaving}
        isAnyModalBusy={isAnyModalBusy}
        cards={cards}
        categories={categories}
        subcategories={subcategories}
        recentTxs={recentTxs}
        txCardId={txCardId}
        setTxCardId={setTxCardId}
        txDate={txDate}
        setTxDate={setTxDate}
        txAmount={txAmount}
        setTxAmount={setTxAmount}
        txDescription={txDescription}
        setTxDescription={setTxDescription}
        txCategory={txCategory}
        setTxCategory={setTxCategory}
        txSubcategory={txSubcategory}
        setTxSubcategory={setTxSubcategory}
        isInstallment={isInstallment}
        setIsInstallment={setIsInstallment}
        installmentsCount={installmentsCount}
        setInstallmentsCount={setInstallmentsCount}
        isRecurring={isRecurring}
        setIsRecurring={setIsRecurring}
        recurrencePeriod={recurrencePeriod}
        setRecurrencePeriod={setRecurrencePeriod}
        recurrenceDaysInterval={recurrenceDaysInterval}
        setRecurrenceDaysInterval={setRecurrenceDaysInterval}
        txFiles={txFiles}
        setTxFiles={setTxFiles}
        txNotes={txNotes}
        setTxNotes={setTxNotes}
        txTags={txTags}
        setTxTags={setTxTags}
        availableTags={collectTags(transactions)}
        txIsDividing={txIsDividing}
        setTxIsDividing={setTxIsDividing}
        txSplits={txSplits}
        setTxSplits={setTxSplits}
        onCreateCategory={handleCreateCategory}
      />

      <PayStatementModal
        show={showPayModal}
        onClose={() => setShowPayModal(false)}
        onSubmit={handlePayStatement}
        isPaying={isPaying}
        selectedCardName={selectedCard?.name}
        statementOpen={statementOpen}
        formatCurrency={formatCurrency}
        accounts={accounts}
        payAccountId={payAccountId}
        setPayAccountId={setPayAccountId}
        payDate={payDate}
        setPayDate={setPayDate}
        payAmount={payAmount}
        setPayAmount={(v) => setPayAmount(v === '' ? '' : v)}
        getAccountLabel={getAccountLabel}
        onRedirectToAccounts={handleRedirectToAccounts}
      />

      <SeriesScopeModal
        show={seriesModal.show}
        onClose={() => setSeriesModal({ show: false, tx: null, pendingAction: 'DELETE' })}
        onConfirm={(scope) => {
          if (seriesModal.pendingAction === 'DELETE') {
            handleDeleteTx(seriesModal.tx.id, scope);
          } else {
            saveTxPatch(seriesModal.tx.id, seriesModal.pendingPatch, scope);
          }
        }}
        title={seriesModal.pendingAction === 'DELETE' ? 'Excluir Lançamento' : 'Editar Lançamento'}
        actionLabel={seriesModal.pendingAction === 'DELETE' ? 'Excluir' : 'Salvar'}
        type={seriesModal.tx?.recurrence_group_id ? 'RECURRING' : 'INSTALLMENT'}
      />
      {showUpgradeModal && (
        <PlanUpgradeModal
          currentPlanId={subscription?.plan_id}
          onClose={() => setShowUpgradeModal(false)}
        />
      )}
    </div>
  );
};

export default CreditCardsSection;

