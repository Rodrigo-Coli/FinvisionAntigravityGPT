// "Ferramentas" (function calling) que a IA financeira (chat do site e WhatsApp) pode
// chamar sob demanda, uma por área do sistema, em vez de receber um resumo fixo e
// incompleto em todo prompt. Cada tool busca só o que a pergunta precisa, direto nas
// tabelas certas, reaproveitando a MESMA lógica de negócio já correta no resto do app
// (mês de vencimento da fatura, soma split-aware por categoria) — assim a resposta da
// IA nunca diverge do que a tela mostra.
//
// Usado por api/_lib/finvision-chat.ts (chat do site) e por
// api/_lib/whatsapp-webhook.ts (intent QUERY do WhatsApp).

import { GoogleGenAI, Type } from '@google/genai';
import { HistoryUtils } from '../../lib/historyUtils.js';
import { DateUtils } from '../../lib/dateUtils.js';
import { buildInvestmentsContextSection } from './investments-context.js';

const fmt = (v: number) => Number(v || 0).toFixed(2);

// ── Declarações das ferramentas (o "prompt pequeno e completo" de cada área) ──
// A `description` de cada uma é o que a IA lê para decidir QUANDO chamar aquela
// ferramenta — precisa ser específica o bastante pra IA saber "essa é a área certa"
// sem precisar de um prompt gigante explicando tudo de antemão.
export const FINANCIAL_TOOL_DECLARATIONS = [
  {
    name: 'get_card_statements',
    description:
      'Retorna as FATURAS de cartão de crédito (uma por cartão) com vencimento dentro do período informado: valor total, quanto já foi pago, quanto falta pagar e o status (PAID/OPEN). ' +
      'Use SEMPRE que o usuário perguntar sobre fatura de cartão, "quanto tenho a pagar no cartão", "cartões pagos e a pagar", limite/valor de fatura por mês, ou pedir o total somando vários cartões (inclusive adicionais). ' +
      'NÃO use para listar as compras dentro da fatura — para isso use get_transactions.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        startDate: { type: Type.STRING, description: 'Data inicial do vencimento da fatura, formato YYYY-MM-DD.' },
        endDate: { type: Type.STRING, description: 'Data final do vencimento da fatura, formato YYYY-MM-DD.' },
      },
      required: ['startDate', 'endDate'],
    },
  },
  {
    name: 'get_transactions',
    description:
      'Busca o extrato de lançamentos (conta bancária + compras de cartão) dentro de um período, com filtros opcionais. ' +
      'Use para perguntas sobre lançamentos específicos, "quanto gastei com X", "quais foram minhas compras em Y", contas pendentes/pagas fora de fatura de cartão, ou qualquer busca por descrição/categoria. ' +
      'Cada compra de cartão já vem classificada no mês de VENCIMENTO da fatura (não no mês da compra).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        startDate: { type: Type.STRING, description: 'Data inicial, formato YYYY-MM-DD.' },
        endDate: { type: Type.STRING, description: 'Data final, formato YYYY-MM-DD.' },
        type: { type: Type.STRING, description: 'Filtrar por tipo: INCOME (receita), EXPENSE (despesa) ou TRANSFER (transferência). Omitir para todos.' },
        status: { type: Type.STRING, description: 'Filtrar por status: PAID (pago), PENDING (pendente) ou ALL. Omitir para todos.' },
        category: { type: Type.STRING, description: 'Filtrar por nome exato de categoria (opcional).' },
        searchText: { type: Type.STRING, description: 'Texto livre para buscar na descrição, categoria ou subcategoria (opcional).' },
        limit: { type: Type.INTEGER, description: 'Máximo de lançamentos a retornar (padrão 100, máximo 300).' },
      },
      required: ['startDate', 'endDate'],
    },
  },
  {
    name: 'get_category_breakdown',
    description:
      'Retorna o total gasto (ou recebido) por CATEGORIA dentro de um período, já somado e ordenado do maior para o menor. ' +
      'Use para perguntas tipo "onde eu mais gasto", "quanto gastei em Alimentação esse mês", ranking de categorias, ou comparação entre categorias. ' +
      'Lançamentos divididos em várias categorias já entram separados por pedaço.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        startDate: { type: Type.STRING, description: 'Data inicial, formato YYYY-MM-DD.' },
        endDate: { type: Type.STRING, description: 'Data final, formato YYYY-MM-DD.' },
        type: { type: Type.STRING, description: 'INCOME ou EXPENSE. Padrão: EXPENSE.' },
      },
      required: ['startDate', 'endDate'],
    },
  },
  {
    name: 'get_account_and_net_worth_summary',
    description:
      'Retorna o saldo de cada conta bancária, o total em bens (patrimônio físico), o total de dívidas e o patrimônio líquido consolidado (bens + saldo - dívidas). ' +
      'Use para perguntas sobre saldo atual, patrimônio líquido, "quanto eu tenho", ou visão geral financeira sem filtro de período.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'get_investments_summary',
    description:
      'Retorna todos os investimentos do usuário: saldo por ativo, tipo, vencimento, liquidez (D+), Imposto de Renda estimado e a nota/plano que o usuário deixou para cada um. ' +
      'Use para qualquer pergunta sobre investimentos, "de onde eu tiro dinheiro para pagar algo em uma data futura", ou vencimento de aplicações.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'get_goals_and_budgets',
    description:
      'Retorna as metas financeiras (valor alvo, valor atual, prazo) e os orçamentos/limites mensais ativos por categoria. ' +
      'Use para perguntas sobre metas, progresso de metas, ou se o usuário está dentro do orçamento de alguma categoria.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'get_liabilities_detail',
    description:
      'Retorna as dívidas/passivos detalhados: financiamentos, empréstimos, parcelas restantes, taxa de juros e saldo devedor de cada um. ' +
      'Use para perguntas sobre dívidas, financiamentos, estratégia de quitação (bola de neve / avalanche), ou alavancagem.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'search_market_data',
    description:
      'Pesquisa na internet dados de mercado em tempo real (Selic, CDI, IPCA, cotação de dólar/euro/ações, notícias financeiras recentes, regras fiscais vigentes no Brasil). ' +
      'Use SOMENTE para dados macroeconômicos/mercado externos ao Zyvion — nunca para dados pessoais do usuário, que já estão nas outras ferramentas.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'O que pesquisar, em texto claro (ex: "taxa Selic atual", "cotação do dólar hoje").' },
      },
      required: ['query'],
    },
  },
];

// Reimplementação server-side de SplitTransactionService.getSplitsForSources (o
// original vive em services/ e usa o cliente Supabase do BROWSER — não dá pra
// importar aqui, então o mesmo select simples é replicado com o cliente admin).
async function fetchSplitsMap(supabase: any, sourceType: 'transaction' | 'card_transaction', ids: string[]): Promise<Record<string, any[]>> {
  const map: Record<string, any[]> = {};
  if (ids.length === 0) return map;
  const { data } = await supabase.from('transaction_splits').select('*').eq('source_type', sourceType).in('source_id', ids);
  (data || []).forEach((row: any) => {
    if (!map[row.source_id]) map[row.source_id] = [];
    map[row.source_id].push(row);
  });
  return map;
}

// Carrega cartões + faturas do usuário uma vez, monta os helpers de competência
// (mesma regra usada em pages/Reports.tsx e pages/History.tsx) para classificar uma
// compra de cartão no mês de VENCIMENTO da fatura, não no mês da compra.
async function loadCardCompetenceHelpers(supabase: any, userId: string) {
  const [cardsRes, stmtRes] = await Promise.all([
    supabase.from('cards').select('id, name, closing_day, due_day, is_additional, parent_card_id, sums_into_invoice, is_archived').eq('user_id', userId),
    supabase.from('card_statements').select('id, due_date').eq('user_id', userId),
  ]);
  const cards = cardsRes.data || [];
  const cardMetaById = new Map<string, any>();
  cards.forEach((c: any) => cardMetaById.set(c.id, {
    closingDay: c.closing_day, dueDay: c.due_day, isAdditional: !!c.is_additional,
    parentId: c.parent_card_id || undefined, sumsIntoInvoice: c.sums_into_invoice !== false,
  }));
  const stmtDueById = new Map<string, string>();
  (stmtRes.data || []).forEach((s: any) => { if (s?.id && s?.due_date) stmtDueById.set(s.id, String(s.due_date).split('T')[0]); });
  const cardNameById = new Map(cards.map((c: any) => [c.id, c.name]));

  const getCompetenceDate = (ct: any): string => {
    if (ct.statement_id && stmtDueById.has(ct.statement_id)) return stmtDueById.get(ct.statement_id)!;
    const meta = cardMetaById.get(ct.card_id);
    if (!meta || meta.closingDay == null || meta.dueDay == null) return ct.date;
    return HistoryUtils.getCardCompetenceDate(ct.date, meta.closingDay, meta.dueDay);
  };
  return { cards, cardNameById, getCompetenceDate };
}

async function toolGetCardStatements(supabase: any, userId: string, args: any) {
  const { startDate, endDate } = args;
  const { data, error } = await supabase
    .from('card_statements')
    .select('id, due_date, total_amount, paid_amount, status, cards(name, is_additional, parent_card_id)')
    .eq('user_id', userId)
    .gte('due_date', startDate)
    .lte('due_date', endDate)
    .order('due_date', { ascending: true });
  if (error) return { error: error.message };

  const statements = (data || []).map((s: any) => ({
    card: s.cards?.name || 'Cartão',
    isAdditional: !!s.cards?.is_additional,
    dueDate: s.due_date,
    totalAmount: Number(s.total_amount || 0),
    paidAmount: Number(s.paid_amount || 0),
    pendingAmount: Math.max(0, Number(s.total_amount || 0) - Number(s.paid_amount || 0)),
    status: s.status,
  }));
  const totals = statements.reduce((acc: any, s: any) => {
    acc.totalAmount += s.totalAmount;
    acc.totalPaid += s.status === 'PAID' ? s.totalAmount : s.paidAmount;
    acc.totalPending += s.status === 'PAID' ? 0 : s.pendingAmount;
    return acc;
  }, { totalAmount: 0, totalPaid: 0, totalPending: 0 });

  return {
    period: { startDate, endDate },
    statements,
    totals: { totalAmount: fmt(totals.totalAmount), totalPaid: fmt(totals.totalPaid), totalPending: fmt(totals.totalPending) },
  };
}

async function toolGetTransactions(supabase: any, userId: string, args: any) {
  const { startDate, endDate, type, status, category, searchText } = args;
  const limit = Math.min(Number(args.limit) || 100, 300);

  const { cardNameById, getCompetenceDate } = await loadCardCompetenceHelpers(supabase, userId);
  const accRes = await supabase.from('accounts').select('id, institution').eq('user_id', userId);
  const accountNameById = new Map((accRes.data || []).map((a: any) => [a.id, a.institution]));

  const [txRes, cardRes] = await Promise.all([
    supabase.from('transactions')
      .select('id, date, description, category, subcategory, type, amount, is_paid, account_id, owner_name, metadata, has_splits')
      .eq('user_id', userId).eq('is_deleted', false)
      .gte('date', startDate).lte('date', endDate)
      .order('date', { ascending: false }),
    // Janela alargada: a compra pode ter sido feita até ~62 dias antes do vencimento
    // da fatura (regra de fechamento/vencimento) — 92 dias de folga cobre com sobra.
    // O recorte exato pela data de VENCIMENTO acontece depois, via getCompetenceDate.
    supabase.from('card_transactions')
      .select('id, date, description, category, subcategory, amount, card_id, statement_id, owner_name, has_splits, categories(name)')
      .eq('user_id', userId)
      .gte('date', DateUtils.addDaysISO(startDate, -92))
      .lte('date', endDate),
  ]);

  const bankTxs = (txRes.data || []).filter((t: any) =>
    !(t.metadata?.isCapitalized === true || t.metadata?.type === 'asset_purchase') && t.type !== 'BILL_PAYMENT'
  );
  const cardTxs = (cardRes.data || []).filter((c: any) => {
    const comp = getCompetenceDate(c);
    return comp >= startDate && comp <= endDate;
  });

  const splitBankIds = bankTxs.filter((t: any) => t.has_splits).map((t: any) => t.id);
  const splitCardIds = cardTxs.filter((c: any) => c.has_splits).map((c: any) => c.id);
  const [bankSplits, cardSplits] = await Promise.all([
    fetchSplitsMap(supabase, 'transaction', splitBankIds),
    fetchSplitsMap(supabase, 'card_transaction', splitCardIds),
  ]);

  const round2 = (v: any) => Math.round(Number(v || 0) * 100) / 100;
  const isoDate = (d: any) => String(d || '').split('T')[0];

  let rows = [
    ...bankTxs.map((t: any) => ({
      date: isoDate(t.date), description: t.description, amount: round2(t.amount),
      type: t.type, category: t.category || 'Sem categoria', subcategory: t.subcategory || undefined,
      status: t.is_paid ? 'PAID' : 'PENDING', origin: accountNameById.get(t.account_id) || 'Conta',
      owner: t.owner_name || 'Pessoal',
      splits: (bankSplits[t.id] || []).map((p: any) => ({ category: p.category, subcategory: p.subcategory, amount: round2(p.amount) })),
    })),
    ...cardTxs.map((c: any) => ({
      date: isoDate(c.date), description: c.description, amount: round2(c.amount),
      type: Number(c.amount) < 0 ? 'INCOME' : 'EXPENSE',
      category: c.categories?.name || c.category || 'Sem categoria', subcategory: c.subcategory || undefined,
      status: 'PAID', origin: cardNameById.get(c.card_id) || 'Cartão',
      owner: c.owner_name || 'Pessoal',
      splits: (cardSplits[c.id] || []).map((p: any) => ({ category: p.category, subcategory: p.subcategory, amount: round2(p.amount) })),
    })),
  ];

  if (type) rows = rows.filter(r => r.type === type);
  if (status && status !== 'ALL') rows = rows.filter(r => r.status === status);
  if (category) rows = rows.filter(r => r.category === category || r.splits.some((s: any) => s.category === category));
  if (searchText) {
    const q = String(searchText).toLowerCase();
    rows = rows.filter(r =>
      r.description?.toLowerCase().includes(q) || r.category?.toLowerCase().includes(q) || (r.subcategory || '').toLowerCase().includes(q)
    );
  }

  rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const total = rows.length;
  rows = rows.slice(0, limit);

  return { period: { startDate, endDate }, totalMatched: total, returned: rows.length, transactions: rows };
}

async function toolGetCategoryBreakdown(supabase: any, userId: string, args: any) {
  const { startDate, endDate } = args;
  const type = args.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
  const result = await toolGetTransactions(supabase, userId, { startDate, endDate, type, limit: 5000 });

  const totals = new Map<string, number>();
  (result.transactions || []).forEach((r: any) => {
    if (r.splits && r.splits.length > 0) {
      r.splits.forEach((p: any) => totals.set(p.category || 'Sem categoria', (totals.get(p.category || 'Sem categoria') || 0) + Number(p.amount)));
    } else {
      totals.set(r.category, (totals.get(r.category) || 0) + Math.abs(r.amount));
    }
  });
  const breakdown = Array.from(totals.entries())
    .map(([category, total]) => ({ category, total: fmt(total) }))
    .sort((a, b) => Number(b.total) - Number(a.total));

  return { period: { startDate, endDate }, type, breakdown };
}

async function toolGetAccountAndNetWorthSummary(supabase: any, userId: string) {
  const [accRes, assetsRes, liabRes] = await Promise.all([
    supabase.from('accounts').select('institution, type, current_balance').eq('user_id', userId).eq('is_archived', false),
    supabase.from('physical_assets').select('estimated_value').eq('user_id', userId),
    supabase.from('liabilities').select('remaining_balance').eq('user_id', userId).eq('is_archived', false),
  ]);
  const accounts = accRes.data || [];
  const totalBalance = accounts.reduce((s: number, a: any) => s + Number(a.current_balance || 0), 0);
  const totalAssets = (assetsRes.data || []).reduce((s: number, a: any) => s + Number(a.estimated_value || 0), 0);
  const totalDebt = (liabRes.data || []).reduce((s: number, l: any) => s + Number(l.remaining_balance || 0), 0);
  return {
    accounts: accounts.map((a: any) => ({ institution: a.institution, type: a.type, balance: fmt(a.current_balance) })),
    totalBalance: fmt(totalBalance),
    totalPhysicalAssets: fmt(totalAssets),
    totalDebt: fmt(totalDebt),
    netWorth: fmt(totalBalance + totalAssets - totalDebt),
  };
}

async function toolGetGoalsAndBudgets(supabase: any, userId: string) {
  const [goalsRes, budgetsRes] = await Promise.all([
    supabase.from('goals').select('name, target_amount, current_amount, deadline, is_completed').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('budgets').select('category, monthly_limit').eq('user_id', userId).eq('is_active', true),
  ]);
  return {
    goals: (goalsRes.data || []).map((g: any) => ({
      name: g.name, targetAmount: fmt(g.target_amount), currentAmount: fmt(g.current_amount),
      deadline: g.deadline, completed: !!g.is_completed,
    })),
    budgets: (budgetsRes.data || []).map((b: any) => ({ category: b.category, monthlyLimit: fmt(b.monthly_limit) })),
  };
}

async function toolGetLiabilitiesDetail(supabase: any, userId: string) {
  const { data } = await supabase
    .from('liabilities')
    .select('name, type, total_amount, remaining_balance, interest_rate, installment_amount, installments_remaining, due_day, metadata')
    .eq('user_id', userId).eq('is_archived', false);
  return {
    liabilities: (data || []).map((l: any) => ({
      name: l.name, type: l.type, totalAmount: fmt(l.total_amount), remainingBalance: fmt(l.remaining_balance),
      interestRatePercent: l.interest_rate ?? null,
      installmentAmount: l.installment_amount != null ? fmt(l.installment_amount) : null,
      installmentsRemaining: l.installments_remaining ?? null,
      dueDay: l.due_day ?? null,
    })),
  };
}

async function toolSearchMarketData(args: any, geminiKey: string) {
  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: String(args.query || '') }] }],
    config: { tools: [{ googleSearch: {} }], temperature: 0.2 },
  });
  const text = (response as any).text || (response as any).candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { result: text || 'Nenhum dado encontrado.' };
}

// Executor central: recebe o nome da tool que o Gemini pediu e roda a query certa.
// Nunca lança para fora — erro vira { error } no resultado, pra IA poder explicar ao
// usuário em vez de a chamada inteira quebrar.
export async function executeFinancialTool(supabase: any, userId: string, geminiKey: string, name: string, args: any): Promise<any> {
  try {
    switch (name) {
      case 'get_card_statements': return await toolGetCardStatements(supabase, userId, args || {});
      case 'get_transactions': return await toolGetTransactions(supabase, userId, args || {});
      case 'get_category_breakdown': return await toolGetCategoryBreakdown(supabase, userId, args || {});
      case 'get_account_and_net_worth_summary': return await toolGetAccountAndNetWorthSummary(supabase, userId);
      case 'get_investments_summary': return { summary: (await buildInvestmentsContextSection(supabase, userId)) || 'Nenhum investimento cadastrado.' };
      case 'get_goals_and_budgets': return await toolGetGoalsAndBudgets(supabase, userId);
      case 'get_liabilities_detail': return await toolGetLiabilitiesDetail(supabase, userId);
      case 'search_market_data': return await toolSearchMarketData(args || {}, geminiKey);
      default: return { error: `Ferramenta desconhecida: ${name}` };
    }
  } catch (e: any) {
    return { error: e?.message || 'Erro ao buscar os dados.' };
  }
}
