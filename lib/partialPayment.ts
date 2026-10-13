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

export interface PaymentHistoryEntry {
  date: string;
  account_name: string;
  amount: number;
  /**
   * Ausente = pagamento. `account_change` = registro de que a conta do
   * lançamento foi corrigida depois do pagamento; não é dinheiro (amount 0).
   */
  kind?: 'payment' | 'account_change';
  /** Só em `account_change`: a conta que estava antes da correção. */
  from_account_name?: string;
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

export const isAccountChangeEntry = (entry: PaymentHistoryEntry) => entry?.kind === 'account_change';

const sameAccountName = (a?: string | null, b?: string | null) =>
  String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/**
 * Troca de conta de um lançamento já pago (ou parcialmente pago).
 *
 * O saldo é recalculado pela conta do lançamento, então o dinheiro pago passa
 * inteiro para a conta nova. O histórico tinha de acompanhar: antes ele
 * continuava dizendo "Botmasters" depois de o usuário corrigir para "Bradesco".
 *
 * Duas coisas acontecem:
 * - os pagamentos DESTE lançamento feitos pela conta antiga passam a mostrar a
 *   conta nova (o histórico diz onde o dinheiro está de fato);
 * - entra uma linha `account_change` com a data da correção e "de → para", para
 *   ficar registrado que houve a troca.
 *
 * O histórico é compartilhado pelas linhas de um pagamento parcial dividido
 * (cada uma mostra o extrato do grupo inteiro). Quando ele cobre mais dinheiro
 * do que este lançamento pagou, só são corrigidos os pagamentos da data em que
 * ESTE lançamento foi pago — os das outras linhas do grupo não mudaram de conta.
 *
 * Devolve `null` quando não há o que registrar (sem histórico, nada pago aqui,
 * ou a conta não mudou de fato).
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
  if (history.length === 0 || !newName) return null;
  if (!(Number(params.paidAmount) > 0.005)) return null;
  if (sameAccountName(oldName, newName)) return null;

  const payments = history.filter(e => !isAccountChangeEntry(e));
  const totalPaidInHistory = round2(payments.reduce((sum, e) => sum + Number(e.amount || 0), 0));
  const ownsWholeHistory = totalPaidInHistory <= round2(params.paidAmount) + 0.01;
  const paidDay = String(params.paidDate || '').split(/[ T]/)[0];

  const updated = history.map(entry => {
    if (isAccountChangeEntry(entry)) return entry;
    if (!oldName || !sameAccountName(entry.account_name, oldName)) return entry;
    if (!ownsWholeHistory && String(entry.date || '').split(/[ T]/)[0] !== paidDay) return entry;
    return { ...entry, account_name: newName };
  });

  return [
    ...updated,
    {
      kind: 'account_change',
      date: params.changedAt,
      account_name: newName,
      from_account_name: oldName || undefined,
      amount: 0
    }
  ];
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
