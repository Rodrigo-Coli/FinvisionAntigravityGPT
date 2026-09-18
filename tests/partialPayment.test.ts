import { describe, it, expect } from 'vitest';
import {
  TRANSACTION_WRITABLE_COLUMNS,
  buildRemainderRow,
  buildRemainderMetadata,
  buildSettledUpdate,
  buildConventionalUpdate,
  describePaymentError,
  getPaymentHistory,
  round2
} from '../lib/partialPayment';
import { Transaction } from '../types';

/**
 * Colunas que realmente existem em `public.transactions`.
 * Copiada do banco (information_schema.columns) — é o contrato que o INSERT
 * precisa respeitar. O bug que deu origem a este arquivo foi mandar
 * `attachments`, que não está nesta lista: o PostgREST devolvia 400 e a
 * "diferença" do pagamento parcial nunca era criada.
 */
const REAL_TRANSACTION_COLUMNS = new Set([
  'id', 'user_id', 'account_id', 'category_id', 'amount', 'type', 'date', 'description',
  'status', 'tags', 'notes', 'created_at', 'is_deleted', 'is_paid', 'account_name',
  'category', 'metadata', 'paid_amount', 'paid_at', 'is_recurring', 'recurrence_period',
  'recurrence_group_id', 'is_installment', 'installment_number', 'installment_total',
  'installment_group_id', 'owner_name', 'liability_id', 'is_amortization', 'subcategory',
  'document_id', 'consortium_id', 'has_splits'
]);

/** Lançamento de aquisição de veículo, exatamente como a tela de Ativos o cria. */
const vehicleAcquisition = (): Transaction => ({
  id: 'tx-veiculo',
  user_id: 'user-1',
  description: 'Aquisição Ativo - C 180',
  amount: 102000,
  date: '2026-09-15',
  type: 'EXPENSE' as any,
  accountId: '',
  accountName: '',
  category: 'Investimento',
  subcategory: 'Aplicações',
  category_id: 'cat-investimento',
  owner_name: 'Pessoal',
  notes: '',
  tags: [],
  isPaid: false,
  paidAmount: 0,
  // É isto que vinha do join com `documents` e derrubava o INSERT inteiro.
  attachments: [{ id: 'doc-1', file_name: 'nota.pdf' } as any],
  metadata: {
    type: 'asset_purchase',
    isCapitalized: true,
    linked_asset_id: 'asset-c180'
  }
});

const splitParams = (tx: Transaction, overrides: Record<string, any> = {}) => ({
  tx,
  remaining: 102000,
  amount: 5000,
  paidDate: '2026-09-15',
  remainderDate: '2026-09-20',
  payAccountId: 'acc-botmasters',
  payAccountName: 'Botmasters',
  userId: 'user-1',
  groupId: 'group-1',
  history: [{ date: '2026-09-15', account_name: 'Botmasters', amount: 5000 }],
  ...overrides
});

describe('linha da diferença (pagamento parcial)', () => {
  it('só envia colunas que existem em transactions', () => {
    const row = buildRemainderRow(splitParams(vehicleAcquisition()));
    for (const key of Object.keys(row)) {
      expect(REAL_TRANSACTION_COLUMNS.has(key), `coluna inexistente no INSERT: ${key}`).toBe(true);
    }
  });

  it('nunca inclui attachments — foi o campo que causava o 400 do PostgREST', () => {
    const row = buildRemainderRow(splitParams(vehicleAcquisition()));
    expect(row).not.toHaveProperty('attachments');
    expect(TRANSACTION_WRITABLE_COLUMNS).not.toContain('attachments' as any);
  });

  it('a diferença é o que sobrou, com o vencimento escolhido e em aberto', () => {
    const row = buildRemainderRow(splitParams(vehicleAcquisition()));
    expect(row.amount).toBe(97000);
    expect(row.date).toBe('2026-09-20');
    expect(row.is_paid).toBe(false);
    expect(row.paid_amount).toBe(0);
    expect(row.paid_at).toBeNull();
  });

  it('preserva categoria, dívida e dono — antes nasciam vazios', () => {
    const tx = vehicleAcquisition();
    tx.liability_id = 'liab-1';
    const row = buildRemainderRow(splitParams(tx));
    expect(row.category_id).toBe('cat-investimento');
    expect(row.liability_id).toBe('liab-1');
    expect(row.owner_name).toBe('Pessoal');
    expect(row.subcategory).toBe('Aplicações');
  });

  it('omite user_id quando não há sessão, em vez de mandar null', () => {
    // `user_id` tem default `auth.uid()`; mandar null explícito derruba o RLS.
    const row = buildRemainderRow(splitParams(vehicleAcquisition(), { userId: null }));
    expect(row).not.toHaveProperty('user_id');
  });

  it('não arrasta centavos de ponto flutuante', () => {
    const row = buildRemainderRow(splitParams(vehicleAcquisition(), { remaining: 100, amount: 33.33 }));
    expect(row.amount).toBe(66.67);
  });
});

describe('metadata da diferença', () => {
  it('marca a origem para dar para rastrear', () => {
    const meta = buildRemainderMetadata(splitParams(vehicleAcquisition()));
    expect(meta.is_partial_remainder).toBe(true);
    expect(meta.partial_remainder_of).toBe('tx-veiculo');
    expect(meta.partial_payment_group_id).toBe('group-1');
  });

  it('não herda card_statement_id (duplicava o espelho da fatura)', () => {
    const tx = vehicleAcquisition();
    tx.metadata = { card_statement_id: 'stmt-1', is_provision: true };
    const meta = buildRemainderMetadata(splitParams(tx));
    expect(meta.card_statement_id).toBeUndefined();
    expect(meta.is_provision).toBeUndefined();
    expect(meta.partial_of_card_statement_id).toBe('stmt-1');
  });

  it('não herda tipo de provisão de ativo — senão a tela de Ativos apaga a diferença', () => {
    const tx = vehicleAcquisition();
    tx.metadata = { type: 'vehicle_sale_installment', linked_asset_id: 'asset-1' };
    const meta = buildRemainderMetadata(splitParams(tx));
    expect(meta.type).toBeUndefined();
    expect(meta.partial_of_type).toBe('vehicle_sale_installment');
    // O vínculo com o bem continua, só o gatilho de regeneração é que sai.
    expect(meta.linked_asset_id).toBe('asset-1');
  });

  it('mantém tipos que não são provisão regenerável', () => {
    const meta = buildRemainderMetadata(splitParams(vehicleAcquisition()));
    expect(meta.type).toBe('asset_purchase');
    expect(meta.isCapitalized).toBe(true);
  });
});

describe('fechamento do lançamento original', () => {
  it('guarda o valor cheio antes de rebaixar o lançamento', () => {
    const upd = buildSettledUpdate(splitParams(vehicleAcquisition()));
    expect(upd.amount).toBe(5000);
    expect(upd.is_paid).toBe(true);
    expect(upd.paid_amount).toBe(5000);
    expect(upd.metadata.original_amount).toBe(102000);
  });

  it('no segundo parcial, original_amount continua sendo o valor cheio', () => {
    const tx = vehicleAcquisition();
    tx.amount = 97000;
    tx.metadata = { ...tx.metadata, original_amount: 102000 };
    const upd = buildSettledUpdate(splitParams(tx, { remaining: 97000, amount: 40000 }));
    expect(upd.metadata.original_amount).toBe(102000);
  });

  it('grava a conta escolhida mesmo quando o lançamento não tinha conta', () => {
    const upd = buildSettledUpdate(splitParams(vehicleAcquisition()));
    expect(upd.account_id).toBe('acc-botmasters');
    expect(upd.account_name).toBe('Botmasters');
  });

  it('só envia colunas reais', () => {
    const upd = buildSettledUpdate(splitParams(vehicleAcquisition()));
    for (const key of Object.keys(upd)) {
      expect(REAL_TRANSACTION_COLUMNS.has(key), `coluna inexistente no UPDATE: ${key}`).toBe(true);
    }
  });
});

describe('pagamento convencional (sem gerar diferença)', () => {
  const base = {
    amount: 5000,
    remaining: 102000,
    paidDate: '2026-09-15',
    payAccountId: 'acc-botmasters',
    payAccountName: 'Botmasters',
    groupId: 'group-1',
    history: [],
    eps: 0.000001
  };

  it('parcial acumula o pago e mantém o lançamento em aberto', () => {
    const upd = buildConventionalUpdate({ tx: vehicleAcquisition(), ...base });
    expect(upd.is_paid).toBe(false);
    expect(upd.paid_amount).toBe(5000);
    // O valor do lançamento NÃO muda nesse fluxo.
    expect(upd).not.toHaveProperty('amount');
  });

  it('quitação total fecha pelo valor cheio', () => {
    const upd = buildConventionalUpdate({ tx: vehicleAcquisition(), ...base, amount: 102000 });
    expect(upd.is_paid).toBe(true);
    expect(upd.paid_amount).toBe(102000);
  });
});

describe('utilitários', () => {
  it('getPaymentHistory devolve lista vazia quando não há histórico', () => {
    expect(getPaymentHistory({ metadata: undefined })).toEqual([]);
    expect(getPaymentHistory({ metadata: { payment_history: 'nao-e-lista' } })).toEqual([]);
  });

  it('round2 arredonda para centavos', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(97000.000000001)).toBe(97000);
  });

  it('describePaymentError mostra o que o banco disse', () => {
    const msg = describePaymentError({
      message: "Could not find the 'attachments' column of 'transactions' in the schema cache"
    });
    expect(msg).toContain('attachments');
    expect(describePaymentError({})).toBe('Erro ao processar pagamento.');
  });
});
