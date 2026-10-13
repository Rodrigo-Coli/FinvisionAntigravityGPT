import { describe, it, expect } from 'vitest';
import {
  TRANSACTION_WRITABLE_COLUMNS,
  buildRemainderRow,
  buildRemainderMetadata,
  buildSettledUpdate,
  buildConventionalUpdate,
  describePaymentError,
  getPaymentHistory,
  applyAccountChangeToHistory,
  applyDateChangeToHistory,
  applyAmountChangeToHistory,
  applyReopenToHistory,
  describeHistoryEvent,
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

describe('troca de conta de lançamento pago', () => {
  const paid = { date: '2026-10-13', account_name: 'Botmasters', amount: 398.36 };

  it('corrige a conta do pagamento e registra a alteração', () => {
    const out = applyAccountChangeToHistory({
      history: [paid],
      oldAccountName: 'Botmasters',
      newAccountName: 'Bradesco',
      paidAmount: 398.36,
      paidDate: '2026-10-13',
      changedAt: '2026-10-14'
    });
    expect(out).toEqual([
      { date: '2026-10-13', account_name: 'Bradesco', amount: 398.36 },
      { kind: 'account_change', date: '2026-10-14', account_name: 'Bradesco', from_account_name: 'Botmasters', amount: 0 }
    ]);
  });

  it('não registra nada quando não há pagamento neste lançamento', () => {
    // Diferença pendente de um parcial: carrega o histórico do grupo, mas não pagou nada.
    expect(applyAccountChangeToHistory({
      history: [paid], oldAccountName: 'Botmasters', newAccountName: 'Bradesco',
      paidAmount: 0, changedAt: '2026-10-14'
    })).toBeNull();
  });

  it('não registra nada quando a conta é a mesma ou não há histórico', () => {
    expect(applyAccountChangeToHistory({
      history: [paid], oldAccountName: 'botmasters ', newAccountName: 'Botmasters',
      paidAmount: 398.36, changedAt: '2026-10-14'
    })).toBeNull();
    expect(applyAccountChangeToHistory({
      history: [], oldAccountName: 'Botmasters', newAccountName: 'Bradesco',
      paidAmount: 398.36, changedAt: '2026-10-14'
    })).toBeNull();
  });

  it('em grupo de parcial, só corrige o pagamento deste lançamento', () => {
    const history = [
      { date: '2026-09-01', account_name: 'Botmasters', amount: 100 },
      { date: '2026-10-01', account_name: 'Botmasters', amount: 50 }
    ];
    const out = applyAccountChangeToHistory({
      history, oldAccountName: 'Botmasters', newAccountName: 'Bradesco',
      paidAmount: 50, paidDate: '2026-10-01T00:00:00', changedAt: '2026-10-14'
    })!;
    expect(out[0].account_name).toBe('Botmasters');
    expect(out[1].account_name).toBe('Bradesco');
    expect(out[2]).toMatchObject({ kind: 'account_change', from_account_name: 'Botmasters' });
  });

  it('trocas seguidas acumulam o registro sem mexer nas anteriores', () => {
    const first = applyAccountChangeToHistory({
      history: [paid], oldAccountName: 'Botmasters', newAccountName: 'Itaú',
      paidAmount: 398.36, paidDate: '2026-10-13', changedAt: '2026-10-14'
    })!;
    const second = applyAccountChangeToHistory({
      history: first, oldAccountName: 'Itaú', newAccountName: 'Bradesco',
      paidAmount: 398.36, paidDate: '2026-10-13', changedAt: '2026-10-15'
    })!;
    expect(second[0].account_name).toBe('Bradesco');
    expect(second[1]).toMatchObject({ from_account_name: 'Botmasters', account_name: 'Itaú' });
    expect(second[2]).toMatchObject({ from_account_name: 'Itaú', account_name: 'Bradesco' });
  });
});

describe('troca de data de lançamento pago', () => {
  const paid = { date: '2026-10-10', account_name: 'Bradesco', amount: 398.36 };

  it('move o pagamento para a data nova e registra a alteração', () => {
    const out = applyDateChangeToHistory({
      history: [paid], oldDate: '2026-10-10T00:00:00', newDate: '2026-10-13',
      paidAmount: 398.36, changedAt: '2026-10-14'
    })!;
    expect(out[0]).toEqual({ ...paid, date: '2026-10-13' });
    expect(out[1]).toMatchObject({ kind: 'date_change', date: '2026-10-14', from_date: '2026-10-10', to_date: '2026-10-13', amount: 0 });
  });

  it('com vários pagamentos parciais, só muda o da data antiga', () => {
    const history = [
      { date: '2026-09-01', account_name: 'Bradesco', amount: 100 },
      { date: '2026-10-10', account_name: 'Bradesco', amount: 50 }
    ];
    const out = applyDateChangeToHistory({
      history, oldDate: '2026-10-10', newDate: '2026-10-12', paidAmount: 150, changedAt: '2026-10-14'
    })!;
    expect(out[0].date).toBe('2026-09-01');
    expect(out[1].date).toBe('2026-10-12');
  });

  it('não registra nada se a data não mudou ou nada foi pago', () => {
    expect(applyDateChangeToHistory({
      history: [paid], oldDate: '2026-10-10', newDate: '2026-10-10', paidAmount: 398.36, changedAt: '2026-10-14'
    })).toBeNull();
    expect(applyDateChangeToHistory({
      history: [paid], oldDate: '2026-10-10', newDate: '2026-10-11', paidAmount: 0, changedAt: '2026-10-14'
    })).toBeNull();
  });
});

describe('troca de valor de lançamento pago', () => {
  it('quitado: o pagamento acompanha o novo valor', () => {
    const out = applyAmountChangeToHistory({
      history: [{ date: '2026-10-10', account_name: 'Bradesco', amount: 100 }],
      oldAmount: 100, newAmount: 120, paidAmount: 100, paidDate: '2026-10-10',
      adjustPayments: true, changedAt: '2026-10-14'
    })!;
    expect(out[0].amount).toBe(120);
    expect(out[1]).toMatchObject({ kind: 'amount_change', from_amount: 100, to_amount: 120, amount: 0 });
  });

  it('redução desconta do último pagamento para trás sem ficar negativo', () => {
    const out = applyAmountChangeToHistory({
      history: [
        { date: '2026-09-01', account_name: 'Bradesco', amount: 100 },
        { date: '2026-10-01', account_name: 'Bradesco', amount: 30 }
      ],
      oldAmount: 130, newAmount: 80, paidAmount: 130, paidDate: '2026-10-01',
      adjustPayments: true, changedAt: '2026-10-14'
    })!;
    expect(out[0].amount).toBe(80);
    expect(out[1].amount).toBe(0);
  });

  it('parcialmente pago: pagamento intacto, só o registro', () => {
    const history = [{ date: '2026-10-10', account_name: 'Bradesco', amount: 40 }];
    const out = applyAmountChangeToHistory({
      history, oldAmount: 100, newAmount: 120, paidAmount: 40, paidDate: '2026-10-10',
      adjustPayments: false, changedAt: '2026-10-14'
    })!;
    expect(out[0]).toEqual(history[0]);
    expect(out).toHaveLength(2);
  });
});

describe('reabrir lançamento pago', () => {
  it('mantém o pagamento como estornado e registra a reabertura', () => {
    const out = applyReopenToHistory({
      history: [{ date: '2026-10-10', account_name: 'Bradesco', amount: 398.36 }],
      paidAmount: 398.36, paidDate: '2026-10-10', changedAt: '2026-10-14'
    })!;
    expect(out[0]).toMatchObject({ amount: 398.36, reversed: true });
    expect(out[1]).toMatchObject({ kind: 'reopen', date: '2026-10-14', amount: 0 });
  });

  it('estornado não conta como pagamento nas correções seguintes', () => {
    const reopened = applyReopenToHistory({
      history: [{ date: '2026-10-10', account_name: 'Botmasters', amount: 100 }],
      paidAmount: 100, paidDate: '2026-10-10', changedAt: '2026-10-11'
    })!;
    // Pago de novo, pela mesma conta, e depois a conta é corrigida.
    const repaid = [...reopened, { date: '2026-10-12', account_name: 'Botmasters', amount: 100 }];
    const out = applyAccountChangeToHistory({
      history: repaid, oldAccountName: 'Botmasters', newAccountName: 'Bradesco',
      paidAmount: 100, paidDate: '2026-10-12', changedAt: '2026-10-13'
    })!;
    expect(out[0].account_name).toBe('Botmasters'); // estornado fica como estava
    expect(out[2].account_name).toBe('Bradesco');
  });

  it('sem histórico não inventa nada', () => {
    expect(applyReopenToHistory({ history: [], paidAmount: 100, changedAt: '2026-10-14' })).toBeNull();
  });
});

describe('texto das alterações', () => {
  const fmt = (v: number) => `R$ ${v.toFixed(2)}`;
  it('descreve cada tipo de registro', () => {
    expect(describeHistoryEvent({ kind: 'account_change', date: '', account_name: 'Bradesco', from_account_name: 'Botmasters', amount: 0 }, fmt))
      .toBe('Conta alterada: Botmasters → Bradesco');
    expect(describeHistoryEvent({ kind: 'date_change', date: '', account_name: '', from_date: '2026-10-10', to_date: '2026-10-13', amount: 0 }, fmt))
      .toBe('Data alterada: 10/10/2026 → 13/10/2026');
    expect(describeHistoryEvent({ kind: 'amount_change', date: '', account_name: '', from_amount: 100, to_amount: 120, amount: 0 }, fmt))
      .toBe('Valor alterado: R$ 100.00 → R$ 120.00');
    expect(describeHistoryEvent({ kind: 'reopen', date: '', account_name: '', amount: 0 }, fmt))
      .toBe('Reaberto — pagamento estornado');
  });
});
