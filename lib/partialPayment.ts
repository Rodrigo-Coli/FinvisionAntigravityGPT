import { Transaction } from '../types';

/**
 * Pagamento parcial com "gerar diferença como nova pendência".
 *
 * Este arquivo existe por causa de um bug que derrubava TODO pagamento parcial
 * com divisão — em qualquer lançamento, não só os de veículo/ativo:
 *
 * A tela montava a linha da diferença espalhando campos do objeto de tela
 * (`Transaction`) direto no INSERT. Só que `attachments` NÃO é uma coluna de
 * `transactions`: é um relacionamento lido por join (`documents`). O PostgREST
 * recusa a requisição inteira quando o corpo traz uma coluna que não existe
 * (400 / PGRST204), e a diferença nunca era criada.
 *
 * Por isso a linha enviada ao banco é montada AQUI, a partir de uma lista
 * fechada de colunas reais. Campo que só existe na tela não tem como vazar para
 * o INSERT de novo — nem agora nem quando alguém acrescentar um campo novo ao
 * objeto de tela.
 */

/** Colunas que realmente existem em `public.transactions` e que este fluxo escreve. */
export const TRANSACTION_WRITABLE_COLUMNS = [
  'user_id',
  'account_id',
  'category_id',
  'amount',
  'type',
  'date',
  'description',
  'tags',
  'notes',
  'is_deleted',
  'is_paid',
  'account_name',
  'category',
  'metadata',
  'paid_amount',
  'paid_at',
  'owner_name',
  'liability_id',
  'is_amortization',
  'subcategory'
] as const;

export type TransactionWritableColumn = typeof TRANSACTION_WRITABLE_COLUMNS[number];

export type PaymentHistoryEventKind = 'account_change' | 'date_change' | 'amount_change' | 'reopen';

export interface PaymentHistoryEntry {
  date: string;
  account_name: string;
  amount: number;
  /**
   * Ausente (ou `payment`) = pagamento. Os demais são REGISTROS de alterações
   * feitas depois do pagamento: não são dinheiro (amount 0) e nunca entram em
   * soma nenhuma. `date` é o dia em que a alteração foi feita.
   */
  kind?: 'payment' | PaymentHistoryEventKind;
  /** `account_change`: a conta que estava antes da correção. */
  from_account_name?: string;
  /** `date_change`: data do pagamento antes e depois. */
  from_date?: string;
  to_date?: string;
  /** `amount_change`: valor do lançamento antes e depois. */
  from_amount?: number;
  to_amount?: number;
  /** Pagamento desfeito ao reabrir o lançamento: continua visível, riscado. */
  reversed?: boolean;
}

/** Dinheiro em duas casas — evita o clássico 97000.000000000001 no restante. */
export const round2 = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/** Descarta qualquer chave que não seja coluna de `transactions`, e as indefinidas. */
export const pickTransactionColumns = (row: Record<string, any>): Record<string, any> => {
  const allowed = new Set<string>(TRANSACTION_WRITABLE_COLUMNS as readonly string[]);
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!allowed.has(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
};

export const getPaymentHistory = (tx: Pick<Transaction, 'metadata'>): PaymentHistoryEntry[] =>
  Array.isArray(tx.metadata?.payment_history) ? tx.metadata!.payment_history : [];

export const isPaymentEntry = (entry: PaymentHistoryEntry) => !entry?.kind || entry.kind === 'payment';

/** Pagamento que ainda vale (não foi estornado ao reabrir). */
export const isActivePayment = (entry: PaymentHistoryEntry) => isPaymentEntry(entry) && !entry.reversed;

const sameAccountName = (a?: string | null, b?: string | null) =>
  String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

const dayOf = (value?: string | null) => String(value || '').split(/[ T]/)[0];

/** Linha de registro de alteração (não é dinheiro). */
const eventEntry = (
  kind: PaymentHistoryEventKind,
  changedAt: string,
  extra: Partial<PaymentHistoryEntry> = {}
): PaymentHistoryEntry => ({ kind, date: changedAt, account_name: '', amount: 0, ...extra });

/**
 * Quais linhas do histórico são pagamentos DESTE lançamento.
 *
 * O histórico é compartilhado pelas linhas de um pagamento parcial dividido
 * (cada uma mostra o extrato do grupo inteiro). Quando ele cobre mais dinheiro
 * do que este lançamento pagou, só contam os pagamentos da data em que ESTE
 * lançamento foi pago — os das outras linhas do grupo não são dele.
 */
export const ownPaymentIndexes = (
  history: PaymentHistoryEntry[],
  paidAmount: number,
  paidDate?: string | null
): number[] => {
  const active = history
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ entry }) => isActivePayment(entry));
  const total = round2(active.reduce((sum, { entry }) => sum + Number(entry.amount || 0), 0));
  if (total <= round2(paidAmount) + 0.01) return active.map(({ idx }) => idx);
  const paidDay = dayOf(paidDate);
  return active.filter(({ entry }) => dayOf(entry.date) === paidDay).map(({ idx }) => idx);
};

/** Histórico vazio ou lançamento sem nada pago: não há o que registrar. */
const nothingToRecord = (history: PaymentHistoryEntry[], paidAmount: number) =>
  history.length === 0 || !(Number(paidAmount) > 0.005);

/**
 * Troca de conta de um lançamento já pago (ou parcialmente pago).
 *
 * O saldo é recalculado pela conta do lançamento, então o dinheiro pago passa
 * inteiro para a conta nova. O histórico acompanha: os pagamentos DESTE
 * lançamento feitos pela conta antiga passam a mostrar a conta nova, e entra
 * a linha "Conta alterada: A → B" com a data da correção.
 *
 * Devolve `null` quando não há o que registrar.
 */
export const applyAccountChangeToHistory = (params: {
  history: PaymentHistoryEntry[];
  oldAccountName?: string | null;
  newAccountName?: string | null;
  /** Quanto ESTE lançamento já pagou. */
  paidAmount: number;
  /** Data do pagamento deste lançamento (ISO, pode ter hora). */
  paidDate?: string | null;
  /** Data da correção (ISO, só a data). */
  changedAt: string;
}): PaymentHistoryEntry[] | null => {
  const history = Array.isArray(params.history) ? params.history : [];
  const oldName = String(params.oldAccountName || '').trim();
  const newName = String(params.newAccountName || '').trim();
  if (nothingToRecord(history, params.paidAmount) || !newName) return null;
  if (sameAccountName(oldName, newName)) return null;

  const own = new Set(ownPaymentIndexes(history, params.paidAmount, params.paidDate));
  const updated = history.map((entry, idx) =>
    own.has(idx) && oldName && sameAccountName(entry.account_name, oldName)
      ? { ...entry, account_name: newName }
      : entry
  );

  return [
    ...updated,
    eventEntry('account_change', params.changedAt, {
      account_name: newName,
      from_account_name: oldName || undefined
    })
  ];
};

/**
 * Data de um lançamento pago corrigida: o pagamento deste lançamento feito na
 * data antiga passa para a nova, e entra "Data alterada: antiga → nova".
 */
export const applyDateChangeToHistory = (params: {
  history: PaymentHistoryEntry[];
  oldDate?: string | null;
  newDate?: string | null;
  paidAmount: number;
  changedAt: string;
}): PaymentHistoryEntry[] | null => {
  const history = Array.isArray(params.history) ? params.history : [];
  const oldDay = dayOf(params.oldDate);
  const newDay = dayOf(params.newDate);
  if (nothingToRecord(history, params.paidAmount) || !newDay || oldDay === newDay) return null;

  // Só um pagamento muda: o da data antiga (o último, se houver mais de um).
  const own = ownPaymentIndexes(history, params.paidAmount, oldDay)
    .filter(idx => dayOf(history[idx].date) === oldDay);
  const target = own.length > 0 ? own[own.length - 1] : -1;

  const updated = history.map((entry, idx) => (idx === target ? { ...entry, date: newDay } : entry));
  return [
    ...updated,
    eventEntry('date_change', params.changedAt, { from_date: oldDay || undefined, to_date: newDay })
  ];
};

/**
 * Valor de um lançamento pago corrigido.
 *
 * Quando o lançamento estava quitado, o valor pago acompanha o novo valor (é o
 * que a tela já faz com `paid_amount`); o histórico ajusta os pagamentos deste
 * lançamento pela diferença, a partir do último, para continuar somando o que
 * foi pago. Parcialmente pago: o pagamento não muda, só fica o registro.
 */
export const applyAmountChangeToHistory = (params: {
  history: PaymentHistoryEntry[];
  oldAmount: number;
  newAmount: number;
  /** Quanto ESTE lançamento tinha pago antes da correção. */
  paidAmount: number;
  paidDate?: string | null;
  /** O valor pago acompanha o novo valor (lançamento estava quitado). */
  adjustPayments: boolean;
  changedAt: string;
}): PaymentHistoryEntry[] | null => {
  const history = Array.isArray(params.history) ? params.history : [];
  const oldAmount = round2(Math.abs(Number(params.oldAmount || 0)));
  const newAmount = round2(Math.abs(Number(params.newAmount || 0)));
  if (nothingToRecord(history, params.paidAmount) || oldAmount === newAmount) return null;

  const updated = history.map(entry => ({ ...entry }));
  if (params.adjustPayments) {
    const own = ownPaymentIndexes(history, params.paidAmount, params.paidDate);
    let delta = round2(newAmount - oldAmount);
    for (let i = own.length - 1; i >= 0 && Math.abs(delta) > 0.005; i--) {
      const entry = updated[own[i]];
      const current = Number(entry.amount || 0);
      // Aumento vai inteiro no último pagamento; redução desconta do último
      // para trás sem deixar nenhum negativo.
      const next = delta > 0 ? round2(current + delta) : round2(Math.max(0, current + delta));
      delta = round2(delta - (next - current));
      entry.amount = next;
    }
  }

  return [
    ...updated,
    eventEntry('amount_change', params.changedAt, { from_amount: oldAmount, to_amount: newAmount })
  ];
};

/**
 * Reabrir = "isto não foi pago". Antes o histórico era apagado e não sobrava
 * rastro do pagamento. Agora os pagamentos DESTE lançamento ficam marcados como
 * estornados (continuam visíveis, riscados, e não valem mais) e entra a linha
 * "Reaberto". O próximo pagamento entra embaixo, normalmente.
 */
export const applyReopenToHistory = (params: {
  history: PaymentHistoryEntry[];
  paidAmount: number;
  paidDate?: string | null;
  changedAt: string;
}): PaymentHistoryEntry[] | null => {
  const history = Array.isArray(params.history) ? params.history : [];
  if (nothingToRecord(history, params.paidAmount)) return null;

  const own = new Set(ownPaymentIndexes(history, params.paidAmount, params.paidDate));
  const updated = history.map((entry, idx) => (own.has(idx) ? { ...entry, reversed: true } : entry));
  return [...updated, eventEntry('reopen', params.changedAt)];
};

/** Texto de uma linha de registro (alteração), para as telas. */
export const describeHistoryEvent = (
  entry: PaymentHistoryEntry,
  formatCurrency: (value: number) => string
): string => {
  const fmtDay = (value?: string) => (value ? new Date(dayOf(value) + 'T00:00:00').toLocaleDateString('pt-BR') : '-');
  switch (entry.kind) {
    case 'account_change':
      return `Conta alterada: ${entry.from_account_name || 'Conta'} → ${entry.account_name || 'Conta'}`;
    case 'date_change':
      return `Data alterada: ${fmtDay(entry.from_date)} → ${fmtDay(entry.to_date)}`;
    case 'amount_change':
      return `Valor alterado: ${formatCurrency(Number(entry.from_amount || 0))} → ${formatCurrency(Number(entry.to_amount || 0))}`;
    case 'reopen':
      return 'Reaberto — pagamento estornado';
    default:
      return '';
  }
};

export const newPartialPaymentGroupId = () =>
  'group-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

interface SplitParams {
  tx: Transaction;
  /** Saldo em aberto no momento em que o modal foi aberto. */
  remaining: number;
  /** Quanto está sendo pago agora. */
  amount: number;
  /** Data do pagamento (ISO, só a parte da data). */
  paidDate: string;
  /** Vencimento escolhido para a diferença. */
  remainderDate: string;
  /** Conta debitada/creditada agora. */
  payAccountId?: string | null;
  payAccountName: string;
  /** Id do dono dos dados. Quando ausente, o banco usa o padrão `auth.uid()`. */
  userId?: string | null;
  groupId: string;
  history: PaymentHistoryEntry[];
}

/**
 * Metadata da diferença.
 *
 * Duas heranças são cortadas de propósito:
 *
 * - `card_statement_id`: é a chave que liga UMA linha do Histórico à fatura do
 *   cartão. Duplicá-la fazia o sincronizador de faturas perder a referência e
 *   inserir uma cópia nova a cada sincronização. Fica guardada em
 *   `partial_of_card_statement_id`, que preserva a origem sem colidir.
 *
 * - `type` de provisão de ativo (IPVA, seguro, licenciamento, aluguel, parcela
 *   de venda): as telas de Ativos APAGAM as provisões futuras não pagas desses
 *   tipos sempre que o bem é editado, para recalculá-las. A diferença de um
 *   pagamento parcial é dinheiro combinado, não provisão recalculável — se
 *   herdasse o `type`, sumiria sozinha na próxima edição do veículo/imóvel.
 *   O tipo de origem fica em `partial_of_type`.
 */
export const ASSET_PROVISION_TYPES = [
  // Veículos (pages/Assets.tsx — syncVehicleTransactions)
  'vehicle_ipva',
  'vehicle_seguro',
  'vehicle_licenciamento',
  'vehicle_rental_income',
  'vehicle_sale_installment',
  'vehicle_sale_down_payment',
  // Outros bens (pages/Assets.tsx — syncOtherAssetTransactions)
  'other_rental_income',
  'other_sale_installment',
  'other_sale_down_payment',
  // Imóveis (components/assets/realEstatePropertySync.ts e RealEstateDetailModal)
  'rental_income',
  'short_stay_booking',
  'condo_provision',
  'condo_expense',
  'condo_revenue',
  'iptu_provision',
  'iptu_expense',
  'iptu_revenue'
];

export const buildRemainderMetadata = (params: SplitParams): Record<string, any> => {
  const meta: Record<string, any> = {
    ...(params.tx.metadata || {}),
    partial_payment_group_id: params.groupId,
    payment_history: params.history,
    // Marcadores da diferença: quem a gerou e de onde veio.
    is_partial_remainder: true,
    partial_remainder_of: params.tx.id
  };

  if (meta.card_statement_id) {
    meta.partial_of_card_statement_id = meta.card_statement_id;
    delete meta.card_statement_id;
    delete meta.is_provision;
  }

  if (meta.type && ASSET_PROVISION_TYPES.includes(String(meta.type))) {
    meta.partial_of_type = meta.type;
    delete meta.type;
  }

  return meta;
};

/** Linha da diferença (nova pendência), pronta para o INSERT. */
export const buildRemainderRow = (params: SplitParams): Record<string, any> => {
  const remainderAmount = round2(params.remaining - params.amount);

  return pickTransactionColumns({
    // `user_id` ausente não vira null: a coluna tem `default auth.uid()`, e
    // mandar null explícito derrubaria o INSERT no RLS.
    user_id: params.userId || undefined,
    description: params.tx.description,
    amount: remainderAmount,
    date: params.remainderDate,
    type: params.tx.type,
    category: params.tx.category,
    category_id: params.tx.category_id || null,
    subcategory: params.tx.subcategory || null,
    account_id: params.tx.accountId || null,
    account_name: params.tx.accountName || '',
    owner_name: params.tx.owner_name || null,
    notes: params.tx.notes || '',
    tags: params.tx.tags || [],
    liability_id: params.tx.liability_id || null,
    is_amortization: params.tx.is_amortization ?? false,
    is_paid: false,
    paid_amount: 0,
    paid_at: null,
    metadata: buildRemainderMetadata(params)
  });
};

/**
 * Atualização do lançamento original: ele passa a valer só o que foi pago.
 *
 * `original_amount` guarda o valor de antes. Sem isso o valor cheio da dívida
 * se perde na primeira parcela — foi exatamente o que aconteceu com a aquisição
 * de R$ 102.000 que virou R$ 5.000 quando o INSERT da diferença falhou.
 */
export const buildSettledUpdate = (params: SplitParams): Record<string, any> => {
  const previousOriginal = Number(params.tx.metadata?.original_amount);
  const originalAmount = Number.isFinite(previousOriginal) && previousOriginal > 0
    ? previousOriginal
    : Number(params.tx.amount || 0);

  return pickTransactionColumns({
    amount: round2(params.amount),
    is_paid: true,
    paid_amount: round2(params.amount),
    paid_at: params.paidDate,
    date: params.paidDate,
    account_id: params.payAccountId || params.tx.accountId || null,
    account_name: params.payAccountName || params.tx.accountName || '',
    metadata: {
      ...(params.tx.metadata || {}),
      original_amount: originalAmount,
      partial_payment_group_id: params.groupId,
      payment_history: params.history
    }
  });
};

/** Atualização do fluxo convencional (sem gerar diferença). */
export const buildConventionalUpdate = (params: {
  tx: Transaction;
  amount: number;
  remaining: number;
  paidDate: string;
  payAccountId?: string | null;
  payAccountName: string;
  groupId: string;
  history: PaymentHistoryEntry[];
  eps: number;
}): Record<string, any> => {
  const isFullyPaid = params.amount >= params.remaining - params.eps;
  const newPaidAmount = round2(Number(params.tx.paidAmount || 0) + params.amount);

  return pickTransactionColumns({
    is_paid: isFullyPaid,
    paid_amount: isFullyPaid ? round2(Number(params.tx.amount || 0)) : newPaidAmount,
    paid_at: params.paidDate,
    date: params.paidDate,
    account_id: params.payAccountId || params.tx.accountId || null,
    account_name: params.payAccountName || params.tx.accountName || '',
    metadata: {
      ...(params.tx.metadata || {}),
      partial_payment_group_id: params.groupId,
      payment_history: params.history
    }
  });
};

/**
 * Mensagem de erro que serve para alguma coisa.
 *
 * O texto fixo "Erro ao processar pagamento." escondeu por meses uma resposta
 * 400 do banco dizendo exatamente qual coluna não existia.
 */
export const describePaymentError = (err: any): string => {
  const parts = [err?.message, err?.details, err?.hint]
    .map(p => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean);
  const detail = parts.join(' — ');
  return detail
    ? `Erro ao processar pagamento: ${detail}`
    : 'Erro ao processar pagamento.';
};
