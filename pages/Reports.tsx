import React, { useState, useEffect } from 'react';
import { FileDown, Calendar, Filter, FileSpreadsheet, FileText, CheckCircle2, Loader2, Tag, Landmark, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import { DateUtils } from '../lib/dateUtils';
import { HistoryUtils } from '../lib/historyUtils';
import { useToast } from '../contexts/ToastContext';

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

  // Filtros Avançados
  const [accounts, setAccounts] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [cardStatements, setCardStatements] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  // Gate: fetchStats só roda depois que cartões/faturas chegaram — sem isso, o
  // primeiro cálculo da tela rodava com `cards`/`cardStatements` vazios e somava
  // as compras de cartão pelo mês da COMPRA (comportamento antigo) em vez do mês
  // de vencimento, corrigindo sozinho só quando o usuário mexia em algum filtro.
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  // Lançamentos mesclados para exportação/impressão
  const [printTxs, setPrintTxs] = useState<any[]>([]);

  useEffect(() => {
    fetchFilters();
  }, []);

  useEffect(() => {
    if (!filtersLoaded) return;
    fetchStats();
  }, [dateRange, selectedAccountId, selectedCategory, filtersLoaded]);

  const fetchFilters = async () => {
    if (!supabase) { setFiltersLoaded(true); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const [accRes, cardRes, catRes, stmtRes] = await Promise.all([
        supabase.from('accounts').select('id, institution').eq('user_id', user.id).eq('is_archived', false),
        // Traz TODOS os cartões (inclusive arquivados): o cálculo de competência
        // precisa do fechamento/vencimento deles também. O dropdown filtra os ativos.
        supabase.from('cards').select('id, name, closing_day, due_day, is_additional, parent_card_id, sums_into_invoice, is_archived').eq('user_id', user.id),
        supabase.from('categories').select('name').eq('user_id', user.id).eq('is_archived', false),
        // Vencimento real das faturas — usado pra contar a compra de cartão no mês
        // em que a fatura vence, não no mês da compra.
        supabase.from('card_statements').select('id, due_date').eq('user_id', user.id)
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
    } catch (e) {
      console.error('Erro ao buscar filtros:', e);
    } finally {
      // Libera o cálculo de stats mesmo se algo falhar — melhor mostrar números
      // (no pior caso com fallback pela data da compra) do que tela vazia.
      setFiltersLoaded(true);
    }
  };

  const fetchStats = async () => {
    if (dateRange.start > dateRange.end) {
      setStats({
        totalIncome: 0,
        totalExpense: 0,
        transactionCount: 0,
        pendingCount: 0
      });
      setPrintTxs([]);
      return;
    }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      let txsPromise: Promise<{ data: any[] | null }> = Promise.resolve({ data: [] });
      let cardTxsPromise: Promise<{ data: any[] | null }> = Promise.resolve({ data: [] });

      const isCard = cards.some(c => c.id === selectedAccountId);
      const isBank = accounts.some(a => a.id === selectedAccountId);

      // Se nenhum destino foi selecionado, ou o destino é um banco, carrega transações bancárias
      if (!selectedAccountId || isBank) {
        let q = supabase
          .from('transactions')
          .select('date, description, category, type, amount, is_paid, account_id, metadata')
          .eq('user_id', user.id)
          .eq('is_deleted', false)
          .gte('date', dateRange.start)
          .lte('date', dateRange.end);
        
        if (selectedAccountId) {
          q = q.eq('account_id', selectedAccountId);
        }
        if (selectedCategory === 'Sem categoria') {
          // "Sem categoria" é rótulo, não valor gravado: precisa pegar também as
          // linhas com categoria nula/vazia, senão o filtro devolve menos do que o
          // próprio relatório mostra agrupado sob esse nome.
          q = q.or('category.is.null,category.eq.,category.eq.Sem categoria');
        } else if (selectedCategory) {
          q = q.eq('category', selectedCategory);
        }
        txsPromise = q as any;
      }

      // Relatórios é o único lugar que mostra análise POR CATEGORIA cruzando banco + cartão.
      // Regra para não ter conta dupla:
      //   TUDO selecionado    → banco SEM BILL_PAYMENT + card_transactions de todos os cartões
      //   Conta bancária      → só transactions daquela conta (sem cartão)
      //   Cartão específico   → só card_transactions daquele cartão (sem banco)
      //
      // O BILL_PAYMENT é excluído no modo TUDO porque as compras individuais do cartão
      // já entram via card_transactions. Se incluíssemos o BILL_PAYMENT junto, a fatura
      // seria contada duas vezes (uma como pagamento + uma via cada compra).
      if (!selectedAccountId || isCard) {
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
        let q = supabase
          .from('card_transactions')
          .select('date, description, category, amount, card_id, statement_id, categories(name)')
          .eq('user_id', user.id)
          .gte('date', DateUtils.addDaysISO(dateRange.start, -92))
          .lte('date', dateRange.end);

        if (isCard && selectedAccountId) {
          q = q.eq('card_id', selectedAccountId);
        }
        cardTxsPromise = q as any;
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

      const cardTxs = allCardTxs.filter((ct: any) => {
        const competence = getCompetenceDate(ct);
        if (competence < dateRange.start || competence > dateRange.end) return false;
        // Filtro de categoria do cartão em memória (ver comentário na query acima).
        if (selectedCategory && cardCategoryName(ct) !== selectedCategory) return false;
        return true;
      });

      // Exclui: capitalizados + BILL_PAYMENT (no modo TUDO, pois compras do cartão já entram via cardTxs)
      const excludeBillPayment = !selectedAccountId;
      const filteredTxs = txs.filter((t: any) =>
        !(t.metadata?.isCapitalized === true || t.metadata?.type === 'asset_purchase') &&
        !(excludeBillPayment && t.type === 'BILL_PAYMENT')
      );

      let income = 0;
      let expense = 0;
      let pending = 0;

      filteredTxs.forEach((t: any) => {
        if (t.type === 'INCOME') income += t.amount;
        else if (t.type === 'EXPENSE') expense += t.amount;
        if (!t.is_paid && t.type === 'EXPENSE') pending++;
      });

      cardTxs.forEach((c: any) => {
        expense += c.amount;
      });

      setStats({
        totalIncome: income,
        totalExpense: expense,
        transactionCount: filteredTxs.length + cardTxs.length,
        pendingCount: pending
      });

      // Mapeamento e unificação para impressão/exportação
      const accountsMap = new Map(accounts.map((a: any) => [a.id, a.institution]));
      const cardsMap = new Map(cards.map((c: any) => [c.id, c.name]));

      const formattedTxs = filteredTxs.map((t: any) => ({
        date: t.date,
        description: t.description,
        category: t.category || 'Sem categoria',
        type: t.type === 'INCOME' ? 'Receita' : (t.type === 'TRANSFER' ? 'Transferência' : 'Despesa'),
        amount: t.amount,
        status: t.is_paid ? 'Pago' : 'Pendente',
        origin: accountsMap.get(t.account_id) || 'Conta'
      }));

      const formattedCardTxs = cardTxs.map((c: any) => ({
        date: c.date,
        description: c.description,
        category: cardCategoryName(c),
        type: 'Despesa',
        amount: c.amount,
        status: 'Fatura/Postado',
        origin: cardsMap.get(c.card_id) || 'Cartão'
      }));

      const merged = [...formattedTxs, ...formattedCardTxs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setPrintTxs(merged);
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
      const headers = ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor', 'Status', 'Conta/Origem'];
      const rows = printTxs.map((t: any) => [
        t.date,
        `"${t.description.replace(/"/g, '""')}"`,
        t.category || '',
        t.type,
        t.amount.toFixed(2).replace('.', ','),
        t.status,
        t.origin
      ]);

      // Delimitador sep=; adicionado no topo para abertura limpa no Excel PT-BR
      const csvContent = 'sep=;\n' + [headers, ...rows].map(e => e.join(';')).join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
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

  const generatePDF = () => {
    if (printTxs.length === 0) {
      toast('Nenhuma transação encontrada no período para gerar PDF.', 'info');
      return;
    }
    window.print();
  };

  return (
    <div className="p-6 lg:p-12 max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500">
      {/* CSS embutido para controle estrito de impressão */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white !important; color: black !important; font-size: 11px !important; }
          .no-print, nav, aside, header button, .bg-brand-900, .grid-cols-2 { display: none !important; }
          .max-w-7xl { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
          .print-only { display: block !important; }
          .print-card { border: 1px solid #cbd5e1 !important; box-shadow: none !important; }
        }
        .print-only { display: none; }
      `}} />

      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 no-print">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Relatórios de Exportação</h1>
          <p className="text-slate-500 font-medium mt-2">Gere planilhas e demonstrativos do seu fluxo de caixa.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Filtro de Conta/Cartão */}
          <div className="flex flex-col bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-2.5">Conta / Cartão</span>
            <div className="flex items-center gap-1.5 px-2">
              <Landmark size={12} className="text-slate-400" />
              <select
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
                className="text-xs font-bold text-slate-900 outline-none bg-transparent cursor-pointer py-0.5 border-none"
              >
                <option value="">Todos os Destinos</option>
                <optgroup label="Contas Bancárias">
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.institution}</option>)}
                </optgroup>
                <optgroup label="Cartões de Crédito">
                  {cards.filter(c => !c.is_archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              </select>
            </div>
          </div>

          {/* Filtro de Categoria */}
          <div className="flex flex-col bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-2.5">Categoria</span>
            <div className="flex items-center gap-1.5 px-2">
              <Tag size={12} className="text-slate-400" />
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="text-xs font-bold text-slate-900 outline-none bg-transparent cursor-pointer py-0.5 border-none"
              >
                <option value="">Todas as Categorias</option>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
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
        </div>
      </header>

      {dateRange.start > dateRange.end && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl text-xs font-bold uppercase tracking-wider no-print">
          Atenção: A data de início não pode ser posterior à data de término.
        </div>
      )}

      {/* Atalhos Rápidos - no-print */}
      <div className="flex flex-wrap gap-2.5 no-print">
        <button onClick={() => handleQuickRange('thisMonth')} className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border border-slate-100">Este Mês</button>
        <button onClick={() => handleQuickRange('lastMonth')} className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border border-slate-100">Mês Passado</button>
        <button onClick={() => handleQuickRange('last3Months')} className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border border-slate-100">Últimos 3 Meses</button>
        <button onClick={() => handleQuickRange('thisYear')} className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border border-slate-100">Ano Atual</button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Entradas', value: stats.totalIncome, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Saídas', value: stats.totalExpense, color: 'text-rose-600', bg: 'bg-rose-50' },
          { label: 'Transações', value: stats.transactionCount, color: 'text-brand-600', bg: 'bg-brand-50', isPrice: false },
          { label: 'Contas Abertas', value: stats.pendingCount, color: 'text-amber-600', bg: 'bg-amber-50', isPrice: false },
        ].map((s, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group print-card">
            <div className={`absolute top-0 right-0 w-24 h-24 ${s.bg} rounded-full -mr-8 -mt-8 opacity-40 group-hover:scale-110 transition-transform no-print`} />
            <p className="relative z-10 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">{s.label}</p>
            <h3 className={`relative z-10 text-2xl font-black font-mono tabular-nums ${s.color}`}>
              {s.isPrice === false ? s.value : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.value)}
            </h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 no-print">
        {/* CSV Export */}
        <div className="bg-white rounded-[40px] border border-slate-100 p-10 flex flex-col items-center text-center shadow-xl shadow-slate-200/50">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-[32px] flex items-center justify-center mb-6">
            <FileSpreadsheet size={40} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Exportar Planilha (CSV)</h2>
          <p className="text-slate-500 font-medium mb-8 max-w-xs">Planilha otimizada compatível com Microsoft Excel (PT-BR) contendo todos os lançamentos.</p>
          <button 
            onClick={exportToCSV}
            disabled={exporting === 'csv' || loading}
            className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 active:scale-95 disabled:opacity-50"
          >
            {exporting === 'csv' ? <Loader2 className="animate-spin" /> : <FileDown size={18} />}
            Baixar Planilha
          </button>
        </div>

        {/* PDF Export (Real Print) */}
        <div className="bg-white rounded-[40px] border border-slate-100 p-10 flex flex-col items-center text-center shadow-xl shadow-slate-200/50 relative overflow-hidden">
          <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-[32px] flex items-center justify-center mb-6">
            <FileText size={40} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Relatório PDF Premium</h2>
          <p className="text-slate-500 font-medium mb-8 max-w-xs">Documento visual formatado com o extrato detalhado de lançamentos pronto para impressão.</p>
          <button 
            onClick={generatePDF}
            disabled={loading || printTxs.length === 0}
            className="w-full py-5 bg-rose-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 active:scale-95 disabled:opacity-50"
          >
            <FileText size={18} />
            Gerar PDF
          </button>
        </div>
      </div>

      {/* Tabela de Extrato Visível Apenas na Impressão/PDF */}
      <div className="print-only mt-12 space-y-6">
        <div className="border-b border-slate-300 pb-4">
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Demonstrativo de Extrato Zyvion</h2>
          <p className="text-xs text-slate-500 font-bold uppercase mt-1">Período: {DateUtils.formatDisplayDate(dateRange.start)} até {DateUtils.formatDisplayDate(dateRange.end)}</p>
        </div>

        <table className="w-full text-left text-[10px] border-collapse">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-100 text-slate-700 font-black uppercase">
              <th className="py-2.5 px-3">Data</th>
              <th className="py-2.5 px-3">Descrição</th>
              <th className="py-2.5 px-3">Categoria</th>
              <th className="py-2.5 px-3">Tipo</th>
              <th className="py-2.5 px-3 text-right">Valor</th>
              <th className="py-2.5 px-3">Conta/Origem</th>
            </tr>
          </thead>
          <tbody>
            {printTxs.map((t, idx) => (
              <tr key={idx} className="border-b border-slate-200">
                <td className="py-2 px-3 whitespace-nowrap">{DateUtils.formatDisplayDate(t.date)}</td>
                <td className="py-2 px-3 uppercase truncate max-w-[200px]">{t.description}</td>
                <td className="py-2 px-3">{t.category}</td>
                <td className="py-2 px-3">{t.type}</td>
                <td className="py-2 px-3 text-right font-mono font-bold tabular-nums">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                </td>
                <td className="py-2 px-3">{t.origin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-brand-900 rounded-[40px] p-10 text-white flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl overflow-hidden relative no-print">
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
        <div className="relative z-10">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-white/10 px-4 py-2 rounded-full border border-white/10">v1.3 Stable</span>
        </div>
      </div>
    </div>
  );
};

export default Reports;
