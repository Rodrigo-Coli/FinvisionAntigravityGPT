import React, { useState, useEffect } from 'react';
import { FileDown, Calendar, Filter, FileSpreadsheet, FileText, CheckCircle2, Loader2, Search, X, ChevronDown, CreditCard, Tag, DollarSign, User, Sparkles, PieChart, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import { DateUtils } from '../lib/dateUtils';
import { HistoryUtils } from '../lib/historyUtils';
import { useToast } from '../contexts/ToastContext';
import { SplitTransactionService } from '../services/splitTransaction.service';
import { FinanceService } from '../services/finance.service';
import { TransactionSplit } from '../types';
import { SearchableMultiSelect } from '../components/history/HistoryFilters';
import { normalizeStr } from '../lib/stringUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const normalize = normalizeStr;
const fmtCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const Reports: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalIncome: 0,
    totalExpense: 0,
    transactionCount: 0,
    pendingCount: 0
  });

  // Padrão inicial = mês INTEIRO (igual ao atalho "Este Mês"). Antes terminava em
  // "hoje", o que deixava as contas a vencer (futuras) fora do intervalo e fazia o
  // card "Contas Abertas" mostrar 0 mesmo com pendências no mês.
  const [dateRange, setDateRange] = useState({
    start: DateUtils.formatToISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    end: DateUtils.formatToISODate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0))
  });

  // Filtros
  const [accounts, setAccounts] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [cardStatements, setCardStatements] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [owners, setOwners] = useState<string[]>(['Pessoal']);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [filterOrigin, setFilterOrigin] = useState<'ALL' | 'ACCOUNT' | 'CARD'>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'INCOME' | 'EXPENSE' | 'TRANSFER'>('ALL');
  const [viewStatus, setViewStatus] = useState<'ALL' | 'PAID' | 'PENDING'>('ALL');
  const [filterAccount, setFilterAccount] = useState<string[]>([]);
  const [filterCategory, setFilterCategory] = useState<string[]>([]);
  const [filterSubcategory, setFilterSubcategory] = useState<string[]>([]);
  const [filterOwner, setFilterOwner] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  // Gate: fetchStats só roda depois que cartões/faturas chegaram — sem isso, o
  // primeiro cálculo da tela rodava com `cards`/`cardStatements` vazios e somava
  // as compras de cartão pelo mês da COMPRA (comportamento antigo) em vez do mês
  // de vencimento, corrigindo sozinho só quando o usuário mexia em algum filtro.
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  // Lançamentos mesclados para exportação/impressão
  const [printTxs, setPrintTxs] = useState<any[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<{ category: string; total: number; pct: number }[]>([]);
  const [monthlyBreakdown, setMonthlyBreakdown] = useState<{ month: string; income: number; expense: number }[]>([]);

  useEffect(() => {
    fetchFilters();
  }, []);

  // Busca com pequeno atraso pra não recalcular tudo a cada letra digitada.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!filtersLoaded) return;
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dateRange, filtersLoaded, filterOrigin, filterType, viewStatus, minPrice, maxPrice, debouncedSearch,
    JSON.stringify(filterAccount), JSON.stringify(filterCategory), JSON.stringify(filterSubcategory), JSON.stringify(filterOwner)
  ]);

  const fetchFilters = async () => {
    if (!supabase) { setFiltersLoaded(true); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const [accRes, cardRes, catRes, stmtRes, subRes, ownersRes] = await Promise.all([
        supabase.from('accounts').select('id, institution').eq('user_id', user.id).eq('is_archived', false),
        // Traz TODOS os cartões (inclusive arquivados): o cálculo de competência
        // precisa do fechamento/vencimento deles também. O filtro mostra só os ativos.
        supabase.from('cards').select('id, name, closing_day, due_day, is_additional, parent_card_id, sums_into_invoice, is_archived').eq('user_id', user.id),
        supabase.from('categories').select('name').eq('user_id', user.id).eq('is_archived', false),
        // Vencimento real das faturas — usado pra contar a compra de cartão no mês
        // em que a fatura vence, não no mês da compra.
        supabase.from('card_statements').select('id, due_date').eq('user_id', user.id),
        supabase.from('subcategories').select('name').eq('user_id', user.id),
        FinanceService.getEntities()
      ]);

      if (accRes.data) setAccounts(accRes.data);
      if (cardRes.data) setCards(cardRes.data);
      if (stmtRes.data) setCardStatements(stmtRes.data);
      if (catRes.data) {
        // 'Sem categoria' não é uma linha da tabela de categorias — é o rótulo que o
        // app dá ao lançamento sem categoria definida. Sem ele na lista, dava para
        // ver o grupo no relatório mas não dava para filtrar por ele.
        const uniqueCats = Array.from(new Set([
          ...catRes.data.map((c: any) => c.name as string),
          'Sem categoria'
        ])) as string[];
        setCategories(uniqueCats.sort());
      }
      if (subRes.data) {
        const uniqueSubs = Array.from(new Set([
          ...subRes.data.map((s: any) => String(s.name || '').trim()).filter(Boolean),
          'Diversos'
        ])) as string[];
        setSubcategories(uniqueSubs.sort());
      }
      if (Array.isArray(ownersRes) && ownersRes.length > 0) setOwners(ownersRes);
    } catch (e) {
      console.error('Erro ao buscar filtros:', e);
    } finally {
      // Libera o cálculo de stats mesmo se algo falhar — melhor mostrar números
      // (no pior caso com fallback pela data da compra) do que tela vazia.
      setFiltersLoaded(true);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setFilterOrigin('ALL');
    setFilterType('ALL');
    setViewStatus('ALL');
    setFilterAccount([]);
    setFilterCategory([]);
    setFilterSubcategory([]);
    setFilterOwner([]);
    setMinPrice('');
    setMaxPrice('');
  };

  const fetchStats = async () => {
    if (dateRange.start > dateRange.end) {
      setStats({ totalIncome: 0, totalExpense: 0, transactionCount: 0, pendingCount: 0 });
      setPrintTxs([]);
      setCategoryBreakdown([]);
      setMonthlyBreakdown([]);
      return;
    }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      let txsPromise: Promise<{ data: any[] | null }> = Promise.resolve({ data: [] });
      let cardTxsPromise: Promise<{ data: any[] | null }> = Promise.resolve({ data: [] });

      // Relatórios é o único lugar que mostra análise POR CATEGORIA cruzando banco + cartão.
      // Regra para não ter conta dupla:
      //   TUDO/Conta   → banco (SEM BILL_PAYMENT quando TUDO, pois compras do cartão já entram via card_transactions)
      //   Cartão       → só card_transactions
      // A restrição por conta/cartão específico (filterAccount) roda em memória, não na
      // query, porque agora é multi-seleção (pode misturar contas e cartões ao mesmo tempo).
      if (filterOrigin !== 'CARD') {
        txsPromise = supabase
          .from('transactions')
          .select('id, date, description, category, subcategory, type, amount, is_paid, account_id, owner_name, metadata, has_splits')
          .eq('user_id', user.id)
          .eq('is_deleted', false)
          .gte('date', dateRange.start)
          .lte('date', dateRange.end) as any;
      }

      if (filterOrigin !== 'ACCOUNT') {
        // O recorte certo (mês de vencimento da fatura) é aplicado em memória,
        // mas dá pra limitar a busca com janela segura: o vencimento nunca é
        // anterior à compra e fica no máximo ~62 dias depois — 92 dias de folga
        // cobre com sobra, sem baixar o histórico inteiro.
        // Join com categories(name): a categoria real da compra de cartão mora em
        // category_id, não na coluna de texto `category` (que fica vazia na maioria
        // das linhas). Lendo só o texto, compra categorizada como Mercado/Alimentação
        // aparecia como "Cartão" no relatório — e o filtro por categoria não a
        // encontrava. Por isso o filtro de categoria do cartão é aplicado em memória
        // logo abaixo, sobre o nome já resolvido.
        cardTxsPromise = supabase
          .from('card_transactions')
          .select('id, date, description, category, subcategory, amount, card_id, statement_id, owner_name, has_splits, categories(name)')
          .eq('user_id', user.id)
          .gte('date', DateUtils.addDaysISO(dateRange.start, -92))
          .lte('date', dateRange.end) as any;
      }

      const [txsRes, cardRes] = await Promise.all([txsPromise, cardTxsPromise]);
      const txs = txsRes.data || [];
      const allCardTxs = cardRes.data || [];

      // Mês de vencimento da fatura por compra (due_date real, ou recalculado se a
      // fatura ainda não existe) — mesma regra de pages/History.tsx.
      const cardMetaById = new Map<string, { closingDay: number; dueDay: number; isAdditional: boolean; parentId?: string; sumsIntoInvoice: boolean }>();
      cards.forEach((c: any) => {
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
      cardStatements.forEach((s: any) => {
        if (s?.id && s?.due_date) stmtDueById.set(s.id, String(s.due_date).split('T')[0]);
      });
      const getCompetenceDate = (ct: any): string => {
        if (ct.statement_id && stmtDueById.has(ct.statement_id)) return stmtDueById.get(ct.statement_id)!;
        const meta = getEffectiveCardMeta(ct.card_id);
        if (!meta || meta.closingDay == null || meta.dueDay == null) return ct.date;
        return HistoryUtils.getCardCompetenceDate(ct.date, meta.closingDay, meta.dueDay);
      };
      // Nome da categoria resolvido uma vez só, na mesma ordem de prioridade do
      // History: relação categories(name) → coluna de texto → 'Sem categoria'.
      const cardCategoryName = (ct: any): string =>
        ct.categories?.name || ct.category || 'Sem categoria';

      const accountsMap = new Map(accounts.map((a: any) => [a.id, a.institution]));
      const cardsMap = new Map(cards.map((c: any) => [c.id, c.name]));

      const cardTxsInRange = allCardTxs.filter((ct: any) => {
        const competence = getCompetenceDate(ct);
        return competence >= dateRange.start && competence <= dateRange.end;
      });

      // Exclui: capitalizados + BILL_PAYMENT (na origem TUDO, pois compras do cartão já entram via cardTxs)
      const excludeBillPayment = filterOrigin === 'ALL';

      // ── Filtros "planos" (não dependem de divisão em categorias) ──
      const bankPassesOtherFilters = (t: any): boolean => {
        if (filterAccount.length > 0 && !filterAccount.includes(t.account_id)) return false;
        if (filterOwner.length > 0 && !filterOwner.includes(t.owner_name || 'Pessoal')) return false;
        if (filterType !== 'ALL' && t.type !== filterType) return false;
        if (viewStatus === 'PAID' && !t.is_paid) return false;
        if (viewStatus === 'PENDING' && t.is_paid) return false;
        const amt = Math.abs(Number(t.amount || 0));
        if (minPrice !== '' && amt < Number(minPrice)) return false;
        if (maxPrice !== '' && amt > Number(maxPrice)) return false;
        if (debouncedSearch) {
          const q = normalize(debouncedSearch);
          const hay = normalize([
            t.description, t.category || 'Sem categoria', t.subcategory || 'Diversos',
            t.owner_name || 'Pessoal', accountsMap.get(t.account_id) || ''
          ].join(' '));
          if (!hay.includes(q)) return false;
        }
        return true;
      };

      const cardPassesOtherFilters = (c: any): boolean => {
        if (filterAccount.length > 0 && !filterAccount.includes(c.card_id)) return false;
        if (filterOwner.length > 0 && !filterOwner.includes(c.owner_name || 'Pessoal')) return false;
        // Compra de cartão não tem coluna `type` — valor negativo é estorno/crédito.
        const cType = Number(c.amount) < 0 ? 'INCOME' : 'EXPENSE';
        if (filterType !== 'ALL' && filterType !== cType) return false;
        // Cartão não tem "pendente" por lançamento (a fatura inteira é que fica em
        // aberto) — só sai do filtro quando o usuário pede explicitamente "Pendente".
        if (viewStatus === 'PENDING') return false;
        const amt = Math.abs(Number(c.amount || 0));
        if (minPrice !== '' && amt < Number(minPrice)) return false;
        if (maxPrice !== '' && amt > Number(maxPrice)) return false;
        if (debouncedSearch) {
          const q = normalize(debouncedSearch);
          const hay = normalize([
            c.description, cardCategoryName(c), c.subcategory || 'Diversos',
            c.owner_name || 'Pessoal', cardsMap.get(c.card_id) || ''
          ].join(' '));
          if (!hay.includes(q)) return false;
        }
        return true;
      };

      const txsInRange = txs.filter((t: any) =>
        !(t.metadata?.isCapitalized === true || t.metadata?.type === 'asset_purchase') &&
        !(excludeBillPayment && t.type === 'BILL_PAYMENT') &&
        bankPassesOtherFilters(t)
      );
      const cardTxsFiltered = cardTxsInRange.filter(cardPassesOtherFilters);

      // Lançamentos divididos (has_splits) - carrega os pedaços ANTES de aplicar o
      // filtro de categoria/subcategoria, pra poder casar tanto pela categoria do
      // lançamento pai quanto pela de cada pedaço (um dividido em Veículo+Alimentação
      // precisa aparecer ao filtrar por "Alimentação" mesmo com categoria original "Veículo").
      const splitBankIds = txsInRange.filter((t: any) => t.has_splits).map((t: any) => t.id);
      const splitCardIds = cardTxsFiltered.filter((c: any) => c.has_splits).map((c: any) => c.id);
      const [bankSplitsMap, cardSplitsMap]: [Record<string, TransactionSplit[]>, Record<string, TransactionSplit[]>] = await Promise.all([
        splitBankIds.length ? SplitTransactionService.getSplitsForSources('transaction', splitBankIds) : Promise.resolve({}),
        splitCardIds.length ? SplitTransactionService.getSplitsForSources('card_transaction', splitCardIds) : Promise.resolve({})
      ]);

      const categoryMatches = (cat: string): boolean => {
        if (filterCategory.length === 0) return true;
        if (filterCategory.includes('Sem categoria') && (!cat || cat === 'Sem categoria')) return true;
        return filterCategory.includes(cat);
      };
      const subcategoryMatches = (sub: string): boolean => {
        if (filterSubcategory.length === 0) return true;
        if (filterSubcategory.includes('Diversos') && (!sub || sub === 'Diversos')) return true;
        return filterSubcategory.includes(sub);
      };
      const hasPieceFilter = filterCategory.length > 0 || filterSubcategory.length > 0;
      const pieceMatches = (p: TransactionSplit) =>
        categoryMatches(p.category || 'Sem categoria') && subcategoryMatches(p.subcategory || 'Diversos');

      // Um lançamento entra no filtro se a categoria/subcategoria dele (ou de QUALQUER
      // pedaço, quando dividido) bater com o filtro escolhido.
      const bankMatchesCatSub = (t: any) => t.has_splits
        ? (bankSplitsMap[t.id] || []).some(pieceMatches)
        : (categoryMatches(t.category || 'Sem categoria') && subcategoryMatches(t.subcategory || 'Diversos'));
      const cardMatchesCatSub = (c: any) => c.has_splits
        ? (cardSplitsMap[c.id] || []).some(pieceMatches)
        : (categoryMatches(cardCategoryName(c)) && subcategoryMatches(c.subcategory || 'Diversos'));

      const filteredTxs = txsInRange.filter(bankMatchesCatSub);
      const cardTxs = cardTxsFiltered.filter(cardMatchesCatSub);

      // Valor que efetivamente conta pra esse lançamento dentro do filtro atual: sem
      // filtro de categoria/subcategoria é o valor total (comportamento de sempre). Com
      // filtro ativo e lançamento dividido, é a soma só dos pedaços que baterem - senão
      // um gasto de R$500 filtrado por "Alimentação" (R$300 do pedaço) apareceria com
      // R$500 no total da categoria.
      const bankFilteredAmount = (t: any): number => {
        if (!hasPieceFilter || !t.has_splits) return Number(t.amount || 0);
        return (bankSplitsMap[t.id] || []).filter(pieceMatches).reduce((sum, p) => sum + Number(p.amount), 0);
      };
      const cardFilteredAmount = (c: any): number => {
        if (!hasPieceFilter || !c.has_splits) return Number(c.amount || 0);
        return (cardSplitsMap[c.id] || []).filter(pieceMatches).reduce((sum, p) => sum + Number(p.amount), 0);
      };

      let income = 0;
      let expense = 0;
      let pending = 0;

      filteredTxs.forEach((t: any) => {
        const amt = bankFilteredAmount(t);
        if (t.type === 'INCOME') income += amt;
        else if (t.type === 'EXPENSE') expense += amt;
        if (!t.is_paid && t.type === 'EXPENSE') pending++;
      });

      cardTxs.forEach((c: any) => {
        expense += cardFilteredAmount(c);
      });

      setStats({
        totalIncome: income,
        totalExpense: expense,
        transactionCount: filteredTxs.length + cardTxs.length,
        pendingCount: pending
      });

      // Lançamentos divididos viram uma linha por pedaço na exportação/impressão,
      // cada uma com sua própria categoria e valor. Quando há filtro de categoria ou
      // subcategoria ativo, só os pedaços que baterem entram (senão pedaços de outra
      // categoria apareceriam num relatório filtrado por uma categoria específica).
      const formattedTxs = filteredTxs.flatMap((t: any) => {
        const allPieces = t.has_splits ? (bankSplitsMap[t.id] || []) : undefined;
        const pieces = hasPieceFilter && allPieces ? allPieces.filter(pieceMatches) : allPieces;
        const base = {
          date: t.date,
          description: t.description,
          type: t.type === 'INCOME' ? 'Receita' : (t.type === 'TRANSFER' ? 'Transferência' : 'Despesa'),
          status: t.is_paid ? 'Pago' : 'Pendente',
          origin: accountsMap.get(t.account_id) || 'Conta',
          owner: t.owner_name || 'Pessoal'
        };
        if (pieces && pieces.length > 0) {
          return pieces.map(p => ({ ...base, category: p.category || 'Sem categoria', subcategory: p.subcategory || 'Diversos', amount: p.amount }));
        }
        return [{ ...base, category: t.category || 'Sem categoria', subcategory: t.subcategory || 'Diversos', amount: t.amount }];
      });

      const formattedCardTxs = cardTxs.flatMap((c: any) => {
        const allPieces = c.has_splits ? (cardSplitsMap[c.id] || []) : undefined;
        const pieces = hasPieceFilter && allPieces ? allPieces.filter(pieceMatches) : allPieces;
        const base = {
          date: c.date,
          description: c.description,
          type: 'Despesa',
          status: 'Fatura/Postado',
          origin: cardsMap.get(c.card_id) || 'Cartão',
          owner: c.owner_name || 'Pessoal'
        };
        if (pieces && pieces.length > 0) {
          return pieces.map(p => ({ ...base, category: p.category || 'Sem categoria', subcategory: p.subcategory || 'Diversos', amount: p.amount }));
        }
        return [{ ...base, category: cardCategoryName(c), subcategory: c.subcategory || 'Diversos', amount: c.amount }];
      });

      const merged = [...formattedTxs, ...formattedCardTxs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setPrintTxs(merged);

      // Resumo por categoria (só Despesa - é o que ajuda a enxergar "pra onde o dinheiro foi").
      const catTotals = new Map<string, number>();
      merged.forEach((t: any) => {
        if (t.type !== 'Despesa') return;
        catTotals.set(t.category, (catTotals.get(t.category) || 0) + Math.abs(Number(t.amount || 0)));
      });
      const totalDespesaAbs = Array.from(catTotals.values()).reduce((a, b) => a + b, 0) || 1;
      setCategoryBreakdown(
        Array.from(catTotals.entries())
          .map(([category, total]) => ({ category, total, pct: (total / totalDespesaAbs) * 100 }))
          .sort((a, b) => b.total - a.total)
      );

      // Resumo por mês (entradas x saídas), útil quando o período cobre vários meses.
      const monthTotals = new Map<string, { income: number; expense: number }>();
      merged.forEach((t: any) => {
        const ym = String(t.date).slice(0, 7);
        const cur = monthTotals.get(ym) || { income: 0, expense: 0 };
        const amt = Math.abs(Number(t.amount || 0));
        if (t.type === 'Receita') cur.income += amt;
        else if (t.type === 'Despesa') cur.expense += amt;
        monthTotals.set(ym, cur);
      });
      setMonthlyBreakdown(
        Array.from(monthTotals.entries())
          .map(([month, v]) => ({ month, ...v }))
          .sort((a, b) => a.month.localeCompare(b.month))
      );
    } catch (err) {
      console.error("Erro ao computar estatísticas de relatórios:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickRange = (range: 'thisMonth' | 'lastMonth' | 'last3Months' | 'thisYear') => {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    if (range === 'thisMonth') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (range === 'lastMonth') {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (range === 'last3Months') {
      start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (range === 'thisYear') {
      start = new Date(today.getFullYear(), 0, 1);
      end = new Date(today.getFullYear(), 11, 31);
    }

    setDateRange({
      start: DateUtils.formatToISODate(start),
      end: DateUtils.formatToISODate(end)
    });
  };

  const exportToCSV = () => {
    if (printTxs.length === 0) {
      toast('Nenhuma transação encontrada no período e filtros selecionados.', 'info');
      return;
    }

    setExporting('csv');
    try {
      const headers = ['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Tipo', 'Valor', 'Status', 'Conta/Origem', 'Pessoa/Empresa'];
      const rows = printTxs.map((t: any) => [
        t.date,
        `"${t.description.replace(/"/g, '""')}"`,
        t.category || '',
        t.subcategory || '',
        t.type,
        t.amount.toFixed(2).replace('.', ','),
        t.status,
        t.origin,
        t.owner || ''
      ]);

      // Delimitador sep=; adicionado no topo para abertura limpa no Excel PT-BR
      const csvContent = 'sep=;\n' + [headers, ...rows].map(e => e.join(';')).join('\n');
      const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Zyvion_Relatorio_${dateRange.start}_${dateRange.end}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setExporting(null);
    }
  };

  // Geração real de PDF via jsPDF/autoTable — substitui o antigo window.print(), que
  // dependia de CSS de impressão e vinha em branco em vários navegadores mobile.
  const generatePDF = () => {
    if (printTxs.length === 0) {
      toast('Nenhuma transação encontrada no período para gerar PDF.', 'info');
      return;
    }
    setExporting('pdf');
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.text('Zyvion — Relatório Financeiro', 40, 40);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text(`Período: ${DateUtils.formatDisplayDate(dateRange.start)} até ${DateUtils.formatDisplayDate(dateRange.end)}`, 40, 58);
      doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 40, 72);

      autoTable(doc, {
        startY: 90,
        head: [['Entradas', 'Saídas', 'Saldo', 'Transações', 'Contas Abertas']],
        body: [[
          fmtCurrency(stats.totalIncome),
          fmtCurrency(stats.totalExpense),
          fmtCurrency(stats.totalIncome - stats.totalExpense),
          String(stats.transactionCount),
          String(stats.pendingCount)
        ]],
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], halign: 'center' },
        styles: { fontSize: 9, halign: 'center' }
      });

      let nextY = (doc as any).lastAutoTable.finalY + 24;

      if (categoryBreakdown.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text('Gastos por Categoria', 40, nextY);
        autoTable(doc, {
          startY: nextY + 8,
          head: [['Categoria', 'Total', '% do período']],
          body: categoryBreakdown.map(c => [c.category, fmtCurrency(c.total), `${c.pct.toFixed(1)}%`]),
          theme: 'striped',
          headStyles: { fillColor: [225, 29, 72] },
          styles: { fontSize: 9 },
          margin: { left: 40, right: pageWidth - 340 }
        });
        nextY = (doc as any).lastAutoTable.finalY + 24;
      }

      if (nextY > pageHeight - 100) {
        doc.addPage();
        nextY = 40;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text('Extrato Detalhado', 40, nextY);
      autoTable(doc, {
        startY: nextY + 8,
        head: [['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Tipo', 'Valor', 'Status', 'Origem']],
        body: printTxs.map((t: any) => [
          DateUtils.formatDisplayDate(t.date),
          t.description,
          t.category,
          t.subcategory || '',
          t.type,
          fmtCurrency(t.amount),
          t.status,
          t.origin
        ]),
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 8 },
        columnStyles: { 5: { halign: 'right' } },
        margin: { left: 40, right: 40 },
        didDrawPage: () => {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(148, 163, 184);
          doc.text(`Zyvion • Página ${doc.getNumberOfPages()}`, pageWidth - 100, pageHeight - 20);
        }
      });

      doc.save(`Zyvion_Relatorio_${dateRange.start}_${dateRange.end}.pdf`);
    } catch (e) {
      console.error('Erro ao gerar PDF:', e);
      toast('Erro ao gerar o PDF. Tente novamente.', 'error');
    } finally {
      setExporting(null);
    }
  };

  const accountAndCardOptions = [
    ...accounts.map((a: any) => ({ id: a.id, label: a.institution })),
    ...cards.filter((c: any) => !c.is_archived).map((c: any) => ({ id: c.id, label: `${c.name} (Cartão)` }))
  ];
  const originOptions: { id: 'ALL' | 'ACCOUNT' | 'CARD'; label: string }[] = [
    { id: 'ALL', label: 'Tudo' },
    { id: 'ACCOUNT', label: 'Conta' },
    { id: 'CARD', label: 'Cartão' },
  ];
  const typeOptions: { id: 'ALL' | 'INCOME' | 'EXPENSE' | 'TRANSFER'; label: string }[] = [
    { id: 'ALL', label: 'Tudo' },
    { id: 'INCOME', label: 'Receita' },
    { id: 'EXPENSE', label: 'Despesa' },
    { id: 'TRANSFER', label: 'Transferência' },
  ];
  const statusOptions: { id: 'ALL' | 'PAID' | 'PENDING'; label: string }[] = [
    { id: 'ALL', label: 'Tudo' },
    { id: 'PAID', label: 'Pago' },
    { id: 'PENDING', label: 'Pendente' },
  ];

  const hasActiveFilters = search !== '' || filterOrigin !== 'ALL' || filterType !== 'ALL' || viewStatus !== 'ALL' ||
    filterAccount.length > 0 || filterCategory.length > 0 || filterSubcategory.length > 0 || filterOwner.length > 0 ||
    minPrice !== '' || maxPrice !== '';

  return (
    <div className="p-6 lg:p-12 max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Relatórios Completos</h1>
          <p className="text-slate-500 font-medium mt-2">Combine todos os filtros do sistema e exporte planilhas ou PDF do seu fluxo de caixa.</p>
        </div>

        {/* Date Picker */}
        <div className="flex bg-white p-2 rounded-2xl border border-slate-100 shadow-sm gap-2">
          <div className="flex flex-col px-3 border-r border-slate-50">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Início</span>
            <input
              type="date"
              value={dateRange.start}
              onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="text-xs font-bold text-slate-900 outline-none bg-transparent cursor-pointer"
            />
          </div>
          <div className="flex flex-col px-3">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Fim</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="text-xs font-bold text-slate-900 outline-none bg-transparent cursor-pointer"
            />
          </div>
        </div>
      </header>

      {dateRange.start > dateRange.end && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl text-xs font-bold uppercase tracking-wider">
          Atenção: A data de início não pode ser posterior à data de término.
        </div>
      )}

      {/* Atalhos Rápidos */}
      <div className="flex flex-wrap gap-2.5">
        <button onClick={() => handleQuickRange('thisMonth')} className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border border-slate-100">Este Mês</button>
        <button onClick={() => handleQuickRange('lastMonth')} className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border border-slate-100">Mês Passado</button>
        <button onClick={() => handleQuickRange('last3Months')} className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border border-slate-100">Últimos 3 Meses</button>
        <button onClick={() => handleQuickRange('thisYear')} className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border border-slate-100">Ano Atual</button>
      </div>

      {/* Painel de Filtros */}
      <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-grow">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Buscar por descrição, categoria, pessoa..."
              className="w-full pl-11 pr-4 h-12 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 text-sm font-medium transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1 shrink-0">
            {originOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => setFilterOrigin(opt.id)}
                title="Origem dos lançamentos"
                className={`px-4 h-10 self-center rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${filterOrigin === opt.id ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center justify-center gap-3 px-8 h-12 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${showFilters
              ? 'bg-brand-600 text-white shadow-lg'
              : 'bg-slate-50 text-slate-400 border border-slate-100 hover:bg-slate-100'
              }`}
          >
            <Filter size={16} />
            {showFilters ? 'Recolher' : 'Filtros Avançados'}
            {showFilters ? <X size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {showFilters && (
          <div className="space-y-6 pt-6 border-t border-slate-50 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <SearchableMultiSelect
                label="Conta ou Cartão"
                placeholder="Todas as Contas/Cartões"
                searchPlaceholder="Buscar conta ou cartão..."
                icon={<CreditCard size={12} />}
                options={accountAndCardOptions}
                selected={filterAccount}
                onChange={setFilterAccount}
              />
              <SearchableMultiSelect
                label="Categoria"
                placeholder="Todas Categorias"
                searchPlaceholder="Buscar categoria..."
                icon={<Tag size={12} />}
                options={categories.map(c => ({ id: c, label: c }))}
                selected={filterCategory}
                onChange={setFilterCategory}
              />
              <SearchableMultiSelect
                label="Subcategoria"
                placeholder="Todas Subcategorias"
                searchPlaceholder="Buscar subcategoria..."
                icon={<Tag size={12} />}
                options={subcategories.map(s => ({ id: s, label: s }))}
                selected={filterSubcategory}
                onChange={setFilterSubcategory}
              />
              <SearchableMultiSelect
                label="Pessoa ou Empresa"
                placeholder="Todas Pessoas/Empresas"
                searchPlaceholder="Buscar pessoa ou empresa..."
                icon={<User size={12} />}
                options={owners.map(o => ({ id: o, label: o }))}
                selected={filterOwner}
                onChange={setFilterOwner}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo</label>
                <div className="flex bg-slate-50 p-1 rounded-xl gap-1 border border-slate-100">
                  {typeOptions.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setFilterType(opt.id)}
                      className={`flex-1 h-9 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${filterType === opt.id ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</label>
                <div className="flex bg-slate-50 p-1 rounded-xl gap-1 border border-slate-100">
                  {statusOptions.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setViewStatus(opt.id)}
                      className={`flex-1 h-9 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${viewStatus === opt.id ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <DollarSign size={12} /> Faixa de Valor
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-grow flex gap-1">
                    <input type="number" placeholder="Min" value={minPrice} onChange={e => setMinPrice(e.target.value)} className="w-full h-11 px-3 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold outline-none" />
                    <input type="number" placeholder="Max" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} className="w-full h-11 px-3 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold outline-none" />
                  </div>
                  <button
                    onClick={resetFilters}
                    disabled={!hasActiveFilters}
                    className="h-11 px-4 text-rose-500 font-bold text-[10px] uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Limpar Filtros
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {[
          { label: 'Entradas', value: stats.totalIncome, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Saídas', value: stats.totalExpense, color: 'text-rose-600', bg: 'bg-rose-50' },
          { label: 'Saldo', value: stats.totalIncome - stats.totalExpense, color: (stats.totalIncome - stats.totalExpense) >= 0 ? 'text-emerald-600' : 'text-rose-600', bg: (stats.totalIncome - stats.totalExpense) >= 0 ? 'bg-emerald-50' : 'bg-rose-50' },
          { label: 'Transações', value: stats.transactionCount, color: 'text-brand-600', bg: 'bg-brand-50', isPrice: false },
          { label: 'Contas Abertas', value: stats.pendingCount, color: 'text-amber-600', bg: 'bg-amber-50', isPrice: false },
        ].map((s, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group">
            <div className={`absolute top-0 right-0 w-24 h-24 ${s.bg} rounded-full -mr-8 -mt-8 opacity-40 group-hover:scale-110 transition-transform`} />
            <p className="relative z-10 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">{s.label}</p>
            <h3 className={`relative z-10 text-2xl font-black font-mono tabular-nums ${s.color}`}>
              {s.isPrice === false ? s.value : fmtCurrency(s.value)}
            </h3>
          </div>
        ))}
      </div>

      {/* Resumo por Categoria + Resumo por Mês */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center"><PieChart size={18} /></div>
            <h2 className="text-lg font-black text-slate-900">Gastos por Categoria</h2>
          </div>
          {categoryBreakdown.length === 0 ? (
            <p className="text-sm text-slate-400 font-medium">Nenhuma despesa encontrada no período e filtros selecionados.</p>
          ) : (
            <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
              {categoryBreakdown.map(c => (
                <div key={c.category}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-bold text-slate-700 truncate pr-2">{c.category}</span>
                    <span className="font-mono font-black text-slate-900 tabular-nums shrink-0">{fmtCurrency(c.total)}</span>
                  </div>
                  <div className="h-2 bg-slate-50 rounded-full overflow-hidden">
                    <div className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.min(c.pct, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-brand-50 text-brand-600 rounded-2xl flex items-center justify-center"><Wallet size={18} /></div>
            <h2 className="text-lg font-black text-slate-900">Resumo por Mês</h2>
          </div>
          {monthlyBreakdown.length === 0 ? (
            <p className="text-sm text-slate-400 font-medium">Nenhum lançamento encontrado no período e filtros selecionados.</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
              {monthlyBreakdown.map(m => (
                <div key={m.month} className="flex items-center justify-between text-xs border-b border-slate-50 pb-3">
                  <span className="font-bold text-slate-700">{DateUtils.formatDisplayDate(`${m.month}-01`).slice(3)}</span>
                  <div className="flex items-center gap-4">
                    <span className="font-mono font-bold text-emerald-600 tabular-nums">{fmtCurrency(m.income)}</span>
                    <span className="font-mono font-bold text-rose-600 tabular-nums">{fmtCurrency(m.expense)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* CSV Export */}
        <div className="bg-white rounded-[40px] border border-slate-100 p-10 flex flex-col items-center text-center shadow-xl shadow-slate-200/50">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-[32px] flex items-center justify-center mb-6">
            <FileSpreadsheet size={40} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Exportar Planilha (CSV)</h2>
          <p className="text-slate-500 font-medium mb-8 max-w-xs">Planilha otimizada compatível com Microsoft Excel (PT-BR) contendo todos os lançamentos filtrados.</p>
          <button
            onClick={exportToCSV}
            disabled={exporting === 'csv' || loading || printTxs.length === 0}
            className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 active:scale-95 disabled:opacity-50"
          >
            {exporting === 'csv' ? <Loader2 className="animate-spin" /> : <FileDown size={18} />}
            Baixar Planilha
          </button>
        </div>

        {/* PDF Export */}
        <div className="bg-white rounded-[40px] border border-slate-100 p-10 flex flex-col items-center text-center shadow-xl shadow-slate-200/50 relative overflow-hidden">
          <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-[32px] flex items-center justify-center mb-6">
            <FileText size={40} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Relatório PDF Premium</h2>
          <p className="text-slate-500 font-medium mb-8 max-w-xs">Documento com resumo, gastos por categoria e o extrato detalhado dos lançamentos filtrados.</p>
          <button
            onClick={generatePDF}
            disabled={exporting === 'pdf' || loading || printTxs.length === 0}
            className="w-full py-5 bg-rose-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 active:scale-95 disabled:opacity-50"
          >
            {exporting === 'pdf' ? <Loader2 className="animate-spin" /> : <FileText size={18} />}
            Gerar PDF
          </button>
        </div>
      </div>

      <div className="bg-brand-900 rounded-[40px] p-10 text-white flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl" />
        <div className="flex items-center gap-6 relative z-10">
          <div className="w-16 h-16 bg-white/10 rounded-3xl flex items-center justify-center border border-white/20">
            <CheckCircle2 size={32} />
          </div>
          <div>
            <h4 className="text-xl font-bold">Auditoria Completa</h4>
            <p className="text-brand-200 text-sm font-medium pr-4">Suas exportações são processadas em tempo real com base nos filtros acima.</p>
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-2">
          <Sparkles size={14} className="text-brand-200" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-white/10 px-4 py-2 rounded-full border border-white/10">v2.0 Completo</span>
        </div>
      </div>
    </div>
  );
};

export default Reports;
