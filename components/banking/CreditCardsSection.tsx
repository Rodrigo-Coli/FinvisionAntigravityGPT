import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Loader2, Edit2, Archive, Trash2, Info } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase/client';
import { FinanceService } from '../../services/finance.service';
import { DateUtils } from '../../lib/dateUtils';
import { findCloseMatch } from '../../lib/stringUtils';

// Modular Components
import { CardList } from '../cards/CardList';
import { StatementSummary } from '../cards/StatementSummary';
import { TransactionList } from '../cards/TransactionList';
import { AddCardModal } from '../cards/AddCardModal';
import { ManualTransactionModal } from '../cards/ManualTransactionModal';
import { useSubscription } from '../../contexts/SubscriptionContext';
import PlanUpgradeModal from '../subscription/PlanUpgradeModal';
import { PayStatementModal } from '../cards/PayStatementModal';
import { SeriesScopeModal, SeriesScope } from '../SeriesScopeModal';

type Account = {
  id: string;
  institution?: string | null;
  name?: string | null;
  bank_name?: string | null;
};

const CreditCardsSection: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [cards, setCards] = useState<any[]>(() => {
    const cached = localStorage.getItem('finvision_cached_cards');
    return cached ? JSON.parse(cached) : [];
  });
  const [selectedCard, setSelectedCard] = useState<any | null>(() => {
    const cached = localStorage.getItem('finvision_cached_cards');
    if (cached) {
      const parsed = JSON.parse(cached);
      return parsed.length > 0 ? parsed[0] : null;
    }
    return null;
  });
  const [statements, setStatements] = useState<any[]>([]);
  const [selectedStatementId, setSelectedStatementId] = useState<string | 'ALL'>('CURRENT');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [currentStatement, setCurrentStatement] = useState<any | null>(null);

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

  useEffect(() => {
    if (selectedCard) {
      setTxCardId(selectedCard.id);
      loadCardContext(selectedCard.id);
    }
  }, [selectedCard]);

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
    return transactions.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
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
          setSelectedCard((prev: any) => prev || activeCards[0]);
        }
      } else {
        const cached = localStorage.getItem('finvision_cached_cards');
        if (cached) {
          const parsed = JSON.parse(cached);
          setCards(parsed);
          if (parsed.length > 0) {
            setSelectedCard((prev: any) => prev || parsed[0]);
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
          setSelectedCard((prev: any) => prev || parsed[0]);
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
      alert('Erro ao criar categoria inline');
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

  const loadCardContext = async (cardId: string) => {
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

      // Se não houver seleção manual, focar na atual
      const targetId = selectedStatementId === 'CURRENT' ? current?.id : selectedStatementId;
      await fetchTransactions(cardId, targetId === 'ALL' ? null : targetId);
    } catch (e) {
      console.error('Erro ao carregar contexto do cartão:', e);
      setCurrentStatement(null);
      await fetchTransactions(cardId);
    }
  };

  const fetchStatements = async (cardId: string) => {
    const cached = localStorage.getItem(`finvision_cached_statements_${cardId}`);
    const cachedData = cached ? JSON.parse(cached) : [];
    if (cachedData.length > 0) {
      setStatements(cachedData);
    }

    if (!supabase || !navigator.onLine) return cachedData;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return cachedData;

      const { data, error } = await supabase
        .from('card_statements')
        .select('*')
        .eq('user_id', user.id)
        .eq('card_id', cardId)
        .order('due_date', { ascending: false });

      if (error) throw error;
      localStorage.setItem(`finvision_cached_statements_${cardId}`, JSON.stringify(data || []));
      setStatements(data || []);
      return data || [];
    } catch (err) {
      console.error('Erro ao buscar faturas, fallback cache:', err);
      return cachedData;
    }
  };

  const fetchTransactions = async (cardId: string, statementId?: string | null) => {
    const dynamicKey = `finvision_cached_card_transactions_${cardId}_${statementId || 'all'}`;
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
      const selected = statements.find(s => s.id === statementId);
      if (selected) setCurrentStatement(selected);
    }

    if (!supabase || !navigator.onLine) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      // Cartões adicionais que SOMAM na fatura deste titular entram na mesma visão
      const additionalThatSum = cards
        .filter((c: any) => c.is_additional && c.parent_card_id === cardId && c.sums_into_invoice !== false)
        .map((c: any) => c.id);
      const cardIdsForInvoice = [cardId, ...additionalThatSum];

      let query = supabase.from('card_transactions').select('*').eq('user_id', user.id).order('date', { ascending: false });
      if (statementId) query = query.eq('statement_id', statementId);
      else query = query.in('card_id', cardIdsForInvoice);
      const { data, error } = await query;
      if (error) throw error;
      
      setTransactions(data || []);
      localStorage.setItem(dynamicKey, JSON.stringify(data || []));
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

    if (patch.tags && typeof patch.tags === 'string') {
      patch.tags = patch.tags.split(',').map((s: string) => s.trim()).filter((s: string) => s !== '');
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
    } catch (err) {
      console.error('Erro ao salvar transação:', err);
    } finally {
      setSavingRowId(null);
      setSeriesModal({ show: false, tx: null, pendingAction: 'DELETE' });
      if (selectedCard?.id) loadCardContext(selectedCard.id);
      if (tx?.statement_id) await FinanceService.syncStatementToHistory(tx.statement_id);
    }
  };

  const handleDeleteTx = async (id: string, confirmedScope?: SeriesScope) => {
    if (currentStatement?.status === 'PAID') {
      alert("Fatura paga. Reabra a fatura para remover transações.");
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
      alert('Erro ao anexar arquivo.');
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
      alert('Erro ao remover anexo.');
    } finally {
      setSavingRowId(null);
    }
  };

  const handleViewAttachment = async (documentId: string) => {
    try {
      const url = await FinanceService.getAttachmentUrl(documentId);
      if (url) window.open(url, '_blank');
      else alert('Não foi possível carregar o comprovante.');
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
        if (matched) cleanSubcategory = matched;
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
          tags: txTags || []
        };

        const { data: txData, error } = await supabase.from('card_transactions').insert([payload]).select('id').single();
        if (error) throw error;

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
            tags: txTags || []
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
      alert("Erro ao salvar lançamento: " + (err.message || "Erro desconhecido"));
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
      alert('Erro ao arquivar cartão.');
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
      alert('Erro ao excluir cartão. Verifique se há transações impedindo a exclusão.');
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
        default_owner: correctedOwner
      };

      if (isEditing && selectedCard) {
        const { data, error } = await supabase
          .from('cards')
          .update(payload)
          .eq('id', selectedCard.id)
          .select()
          .single();
        if (error) throw error;
        setCards((prev) => prev.map(c => c.id === data.id ? data : c));
        setSelectedCard(data);
      } else {
        const { data, error } = await supabase.from('cards').insert([payload]).select().single();
        if (error) throw error;
        setCards((prev) => [...prev, data]);
        if (!selectedCard) setSelectedCard(data);
      }

      setShowAddModal(false);
      setIsEditing(false);
      resetCardForm();
    } catch (err: any) {
      console.error('Erro ao salvar cartão:', err);
      alert('Erro ao salvar cartão: ' + (err.message || 'Verifique sua conexão.'));
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
  };

  const handleRedirectToAccounts = () => {
    setShowPayModal(false);
    navigate('/banking?tab=accounts', { state: { openModal: true } });
  };

  const handlePayStatement = async () => {
    if (!supabase || !selectedCard?.id) return;
    
    const amount = Number(payAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Por favor, insira um valor de pagamento válido maior que zero.");
      return;
    }
    
    if (!payAccountId) {
      alert("Por favor, selecione uma conta bancária para o pagamento.");
      return;
    }
    setIsPaying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Usuário não autenticado.");

      let targetStatementId = currentStatement?.id;

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
      alert("Erro ao processar pagamento: " + (err.message || "Erro desconhecido"));
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
      
      alert("Fatura reaberta com sucesso!");
    } catch (err: any) {
      console.error('Erro ao reabrir fatura:', err);
      alert("Erro ao reabrir fatura: " + (err.message || "Erro desconhecido"));
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
              onSelectCard={setSelectedCard}
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
                  onReopen={() => currentStatement?.id && handleReopenStatement(currentStatement.id)}
                  statementBadge={statementBadge}
                />

                {otherOpenStatements.length > 0 && (
                  <div className="p-5 bg-amber-50/60 border border-amber-100/70 rounded-3xl flex items-start gap-4 text-amber-800 animate-in fade-in zoom-in-95 duration-300">
                    <Info size={20} className="shrink-0 text-amber-500 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-black uppercase tracking-wider text-amber-600">Atenção: Faturas Anteriores Pendentes</p>
                      <p className="text-[11px] font-bold text-amber-600/90 leading-relaxed">
                        Existem faturas de períodos passados com saldos em aberto (por exemplo, {DateUtils.formatFullMonthYear(otherOpenStatements[0].year, otherOpenStatements[0].month)}). 
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
                          className={`p-2 rounded-xl border transition-all ${showFilters ? 'bg-brand-50 border-brand-200 text-brand-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                          title="Alternar Filtros"
                        >
                          <Plus size={16} className={showFilters ? 'rotate-45 transition-transform' : 'transition-transform'} />
                        </button>
                      </div>
                      <p className="text-slate-400 text-sm font-medium">Controle e filtre os gastos deste cartão</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                      {/* Statement Selector */}
                      <div className="flex flex-col gap-1 w-full sm:w-auto">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Período</span>
                        <select
                          value={selectedStatementId}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedStatementId(val);
                            if (val === 'ALL') {
                              fetchTransactions(selectedCard.id, null);
                            } else if (val === 'CURRENT') {
                              fetchTransactions(selectedCard.id, currentStatement?.id || null);
                            } else {
                              fetchTransactions(selectedCard.id, val);
                            }
                          }}
                          className="bg-slate-50 dark:bg-brand-900 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-widest outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all min-w-[200px]"
                        >
                          <option value="CURRENT">Fatura Atual</option>
                          <option value="ALL">Todo o Histórico</option>
                          {statements.length > 0 && (
                            <optgroup label="Faturas Anteriores">
                              {statements.map(s => (
                                <option key={s.id} value={s.id}>
                                  {DateUtils.formatFullMonthYear(s.year, s.month)}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
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
                              onChange={(e) => setFilterCategory(e.target.value)}
                              className="bg-slate-50 dark:bg-brand-900 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-widest outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all min-w-[140px]"
                            >
                              <option value="ALL">Todas</option>
                              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <TransactionList
                    transactions={transactions.filter(t => {
                      const matchesSearch = t.description?.toLowerCase().includes(searchQuery.toLowerCase());
                      const matchesCategory = filterCategory === 'ALL' || t.category_id === filterCategory;
                      return matchesSearch && matchesCategory;
                    })}
                    loadingTxs={loadingTxs}
                    categories={categories}
                    savingRowId={savingRowId}
                    onAddManualTx={() => setShowAddTxModal(true)}
                    onUpdateTxLocal={updateTxLocal}
                    onSaveTxPatch={saveTxPatch}
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

