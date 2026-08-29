import { supabase } from '../lib/supabase/client';
import { BankAccount, Transaction, CreditCardDetailed, Entity } from '../types';
import { findCloseMatch } from '../lib/stringUtils';
import { DateUtils } from '../lib/dateUtils';
import { getSessionUser } from '../lib/session';
import { isNetworkFailure, isProbablyOffline, markNetworkSuccess, withTimeout, NETWORK_TIMEOUT_MS } from '../lib/connectivity';
import { isOfflineId } from '../lib/offlineQueue.service';

// PROPAGAÇÃO REVERSA: quando uma parcela vinculada a um passivo é editada/paga/excluída em
// Transações, recalcula o saldo devedor e o nº de parcelas restantes do passivo a partir das
// parcelas reais (não pagas e não excluídas). O imóvel vinculado, cujo balanço é derivado das
// transações, reflete automaticamente. À prova de falha: nunca derruba a edição da transação.
async function syncLiabilityFromTransactions(liabilityId: string): Promise<void> {
  try {
    if (!supabase || !liabilityId) return;
    const { data: txs } = await supabase
      .from('transactions')
      .select('amount, is_paid')
      .eq('liability_id', liabilityId)
      .eq('is_deleted', false);
    if (!txs) return;
    const unpaid = txs.filter((t: any) => !t.is_paid);
    const remaining = unpaid.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
    await supabase
      .from('liabilities')
      .update({
        remaining_balance: Math.round(remaining * 100) / 100,
        installments_remaining: unpaid.length,
        updated_at: new Date().toISOString(),
      })
      .eq('id', liabilityId);
  } catch {
    // Silencioso: a sincronização do passivo nunca pode quebrar a edição da transação.
  }
}

// Descobre o liability_id de uma transação e dispara a sincronização (se houver vínculo).
async function propagateToLiability(transactionId: string): Promise<void> {
  try {
    if (!supabase) return;
    const { data: tx } = await supabase
      .from('transactions')
      .select('liability_id')
      .eq('id', transactionId)
      .maybeSingle();
    if (tx?.liability_id) await syncLiabilityFromTransactions(tx.liability_id);
  } catch { /* silencioso */ }
}

// Serializa as sincronizações de uma MESMA fatura. Vários pontos da tela de
// Cartões disparam `syncStatementToHistory` em paralelo (inclusive em IIFEs
// "fire and forget", sem await, depois de salvar um lançamento). Como o sync é
// um "leia e então escreva", duas chamadas simultâneas podiam ler "não existe
// espelho" ao mesmo tempo e inserir duas linhas para a mesma fatura — a semente
// das faturas duplicadas. Encadear por statementId elimina essa corrida.
const statementSyncChain = new Map<string, Promise<void>>();

function serializeStatementSync(statementId: string, task: () => Promise<void>): Promise<void> {
  const previous = statementSyncChain.get(statementId) || Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  statementSyncChain.set(statementId, next);
  next.catch(() => undefined).then(() => {
    if (statementSyncChain.get(statementId) === next) statementSyncChain.delete(statementId);
  });
  return next;
}

export const FinanceService = {
  // Contas
  getAccounts: async (): Promise<BankAccount[]> => {
    if (!supabase) return [];

    const user = await getSessionUser(supabase);
    if (!user) return [];

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_archived', false);
    if (error) throw error;
    return (data || []).map((a: any) => ({
      id: a.id,
      institution: a.institution,
      type: a.type,
      currency: a.currency,
      initialBalance: Number(a.initial_balance),
      currentBalance: Number(a.current_balance),
      limit: Number(a.limit),
      color: a.color,
      isArchived: a.is_archived,
      includeInDashboard: a.include_in_dashboard,
      lastSync: a.last_sync
    }));
  },

  createAccount: async (account: Omit<BankAccount, 'id'>): Promise<BankAccount> => {
    if (!supabase) throw new Error('Supabase not configured');
    const user = await getSessionUser(supabase);
    const { data, error } = await supabase.from('accounts').insert({
      user_id: user?.id,
      institution: account.institution,
      type: account.type,
      currency: account.currency,
      initial_balance: account.initialBalance,
      current_balance: account.initialBalance,
      limit: account.limit,
      color: account.color,
      include_in_dashboard: account.includeInDashboard
    }).select().single();
    if (error) throw error;
    return { ...account, id: data.id } as BankAccount;
  },

  // Transações
  getTransactions: async (filters?: any): Promise<Transaction[]> => {
    if (!supabase) return [];

    const user = await getSessionUser(supabase);
    if (!user) return [];

    let query = supabase
      .from('transactions')
      .select('*, accounts(institution, name), attachments:documents!documents_transaction_id_fkey(*)')
      .eq('user_id', user.id)
      .eq('is_deleted', false)
      .order('date', { ascending: false });

    if (filters?.accountId) query = query.eq('account_id', filters.accountId);

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((t: any) => ({
      id: t.id,
      description: t.description,
      amount: Number(t.amount),
      date: t.date,
      type: t.type,
      accountId: t.account_id,
      accountName: t.accounts?.institution || t.accounts?.name || 'N/A',
      category: t.category,
      isPaid: t.is_paid,
      paidAmount: Number(t.paid_amount),
      paidAt: t.paid_at,
      attachments: t.attachments || []
    }));
  },

  // Cartões
  getCards: async (): Promise<CreditCardDetailed[]> => {
    if (!supabase) return [];

    const user = await getSessionUser(supabase);
    if (!user) return [];

    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_archived', false);
    if (error) throw error;
    return data || [];
  },

  getOrCreateStatement: async (cardId: string, dateStr: string): Promise<string> => {
    if (!supabase) throw new Error('Supabase not configured');
    const user = await getSessionUser(supabase);
    if (!user) throw new Error("Usuário não autenticado");

    // 1. Buscar detalhes do cartão
    let { data: card, error: cardErr } = await supabase
      .from('cards')
      .select('*')
      .eq('id', cardId)
      .single();
    if (cardErr) throw cardErr;

    // Se for cartão ADICIONAL que SOMA na fatura do titular, a fatura é a do titular.
    // A transação mantém o card_id do adicional (rastreia quem gastou), mas entra na fatura do principal.
    let effectiveCardId = cardId;
    if (card.is_additional && card.sums_into_invoice !== false && card.parent_card_id) {
      const { data: parentCard } = await supabase.from('cards').select('*').eq('id', card.parent_card_id).single();
      if (parentCard) {
        card = parentCard;            // usa fechamento/vencimento do titular
        effectiveCardId = parentCard.id;
      }
    }

    const txDate = new Date(dateStr);
    const day = txDate.getUTCDate();
    const month = txDate.getUTCMonth(); // 0-indexed
    const year = txDate.getUTCFullYear();

    // Determinar mês/ano alvo da fatura
    // Se dia > closing_day, pertence à próxima fatura
    let targetMonth = month;
    let targetYear = year;

    if (day > card.closing_day) {
      targetMonth++;
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear++;
      }
    }

    const stmtMonth = targetMonth + 1; // 1-indexed para o banco
    const stmtYear = targetYear;

    // Verificar se já existe
    const { data: existing } = await supabase
      .from('card_statements')
      .select('id')
      .eq('card_id', effectiveCardId)
      .eq('month', stmtMonth)
      .eq('year', stmtYear)
      .maybeSingle();

    if (existing) return existing.id;

    // Criar nova fatura
    const closingDate = new Date(Date.UTC(targetYear, targetMonth, card.closing_day));

    let dueMonth = targetMonth;
    let dueYear = targetYear;
    if (card.due_day < card.closing_day) {
      dueMonth++;
      if (dueMonth > 11) {
        dueMonth = 0;
        dueYear++;
      }
    }
    const dueDate = new Date(Date.UTC(dueYear, dueMonth, card.due_day));

    const { data: newStmt, error: createErr } = await supabase
      .from('card_statements')
      .insert({
        user_id: user.id,
        card_id: effectiveCardId,
        month: stmtMonth,
        year: stmtYear,
        status: 'OPEN',
        total_amount: 0,
        paid_amount: 0,
        closing_date: closingDate.toISOString(),
        due_date: dueDate.toISOString()
      })
      .select()
      .single();

    if (createErr) throw createErr;
    return newStmt.id;
  },

  // Entidades (Proprietários)
  getEntities: async (includeArchived = false): Promise<string[]> => {
    if (!supabase) return ['Pessoal'];
    try {
      const user = await getSessionUser(supabase);
      if (!user) return ['Pessoal'];

      let query = supabase.from('entities').select('name').eq('user_id', user.id);
      if (!includeArchived) query = query.eq('is_archived', false);

      const { data, error } = await query.order('name');

      // Sempre buscamos das transações para garantir que nada ficou de fora
      const { data: txData } = await supabase.from('transactions').select('owner_name').eq('user_id', user.id).not('owner_name', 'is', null);
      const { data: cardTxData } = await supabase.from('card_transactions').select('owner_name').eq('user_id', user.id).not('owner_name', 'is', null);
      
      const allOwners = [
        'Pessoal',
        ...(data || []).map((e: any) => e.name),
        ...(txData || []).map((t: any) => t.owner_name),
        ...(cardTxData || []).map((t: any) => t.owner_name)
      ];

      return Array.from(new Set(allOwners.filter(Boolean))).sort() as string[];
    } catch (e) {
      return ['Pessoal'];
    }
  },

  archiveEntity: async (name: string, archive: boolean = true): Promise<void> => {
    if (!supabase || !name || name === 'Pessoal') return;
    const user = await getSessionUser(supabase);
    if (!user) return;

    await supabase.from('entities')
      .update({ is_archived: archive })
      .eq('user_id', user.id)
      .eq('name', name);
  },

  getEntityObjects: async (includeArchived = false): Promise<Entity[]> => {
    if (!supabase) return [];
    const user = await getSessionUser(supabase);
    if (!user) return [];

    let query = supabase.from('entities').select('*').eq('user_id', user.id);
    if (!includeArchived) query = query.eq('is_archived', false);
    const { data, error } = await query.order('name');
    if (error) return [];

    return (data || []).map((e: any) => ({
      id: e.id,
      name: e.name,
      isArchived: e.is_archived,
      include_in_totals: e.include_in_totals !== false
    }));
  },

  ensureEntityExists: async (name: string): Promise<string> => {
    if (!supabase || !name) return 'Pessoal';
    const trimmedName = name.trim();
    if (trimmedName.toLowerCase() === 'pessoal') return 'Pessoal';
    try {
      const user = await getSessionUser(supabase);
      if (!user) return 'Pessoal';

      // 1. Obter todas as entidades existentes
      const { data: existingList } = await supabase.from('entities').select('name').eq('user_id', user.id);
      const names = (existingList || []).map((e: any) => e.name);
      
      const matched = findCloseMatch(trimmedName, names);
      if (matched) {
        return matched; // Usar existente
      }

      const { error } = await supabase.from('entities').insert({ user_id: user.id, name: trimmedName });
      if (error) console.warn("Erro ao garantir entidade:", error);
      return trimmedName;
    } catch (e) {
      return trimmedName;
    }
  },

  // Transações com Suporte Offline
  //
  // As três funções abaixo seguem a mesma regra: tenta enviar ao banco com
  // prazo; se faltar rede (offline declarado, timeout ou fetch quebrado),
  // enfileira e devolve sucesso — o lançamento é do usuário, não pode se perder
  // porque a conexão oscilou. Só erro de DADOS chega até a tela como falha.
  //
  // Antes, a guarda era `if (!navigator.onLine)`, que é falso-negativo em
  // Wi-Fi sem saída e em sinal fraco: nesses casos o app achava que estava
  // online, mandava a gravação para um fetch que nunca respondia e o
  // lançamento não ia nem para o banco nem para a fila.
  saveTransaction: async (tx: any): Promise<any> => {
    if (!supabase) return null;
    const user = await getSessionUser(supabase);
    if (!user) throw new Error('Usuário não autenticado');

    const { offlineQueue } = await import('../lib/offlineQueue.service');
    // O id NUNCA vai no payload: `transactions.id` é uuid gerado pelo banco.
    // Mandar um id inventado no aparelho ('offline-...') fazia todo INSERT
    // enfileirado falhar com 22P02 e o lançamento nunca sincronizava.
    const row = { ...tx, user_id: user.id };
    delete (row as any).id;

    const queueIt = () => {
      const localId = offlineQueue.addAction('CREATE_TRANSACTION', row);
      return { ...row, id: localId, _pendingSync: true };
    };

    if (isProbablyOffline()) return queueIt();

    try {
      const { data, error } = await withTimeout<any>(
        supabase.from('transactions').insert([row]).select().single(),
        NETWORK_TIMEOUT_MS,
        'salvar lançamento'
      );
      if (error) throw error;
      markNetworkSuccess();
      return data;
    } catch (err) {
      if (isNetworkFailure(err)) return queueIt();
      throw err;
    }
  },

  updateTransaction: async (id: string, updates: any): Promise<void> => {
    if (!supabase) return;
    const { offlineQueue } = await import('../lib/offlineQueue.service');

    const queueIt = () => { offlineQueue.addAction('UPDATE_TRANSACTION', { id, updates }); };

    // Linha ainda só existe na fila (criada offline): a edição tem que ser
    // aplicada ali, senão o UPDATE viajaria para um id que o banco não conhece.
    if (isOfflineId(id)) return queueIt();
    if (isProbablyOffline()) return queueIt();

    try {
      const { error } = await withTimeout<any>(
        supabase.from('transactions').update(updates).eq('id', id),
        NETWORK_TIMEOUT_MS,
        'atualizar lançamento'
      );
      if (error) throw error;
      markNetworkSuccess();
    } catch (err) {
      if (isNetworkFailure(err)) return queueIt();
      throw err;
    }

    // Propagação reversa: se a transação estiver vinculada a um passivo, recalcula o passivo.
    await propagateToLiability(id);
  },

  deleteTransaction: async (id: string): Promise<void> => {
    if (!supabase) return;
    const { offlineQueue } = await import('../lib/offlineQueue.service');

    const queueIt = () => { offlineQueue.addAction('DELETE_TRANSACTION', { id }); };

    if (isProbablyOffline()) return queueIt();

    let preTx: any = null;
    try {
      // Captura o vínculo ANTES de marcar como excluída (a linha ainda existe).
      const pre = await withTimeout<any>(
        supabase.from('transactions').select('liability_id').eq('id', id).maybeSingle(),
        NETWORK_TIMEOUT_MS,
        'ler lançamento'
      );
      preTx = pre.data;

      const { error } = await withTimeout<any>(
        supabase.from('transactions').update({ is_deleted: true }).eq('id', id),
        NETWORK_TIMEOUT_MS,
        'excluir lançamento'
      );
      if (error) throw error;
      markNetworkSuccess();
    } catch (err) {
      if (isNetworkFailure(err)) return queueIt();
      throw err;
    }

    // Propagação reversa: recalcula o passivo excluindo esta parcela.
    if (preTx?.liability_id) await syncLiabilityFromTransactions(preTx.liability_id);
  },

  // Categorias
  getCategories: async (): Promise<string[]> => {
    if (!supabase) return [];
    try {
      const user = await getSessionUser(supabase);
      if (!user) return [];

      const { data, error } = await supabase
        .from('categories')
        .select('name')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('name');

      if (error) {
        // Fallback
        return ['Alimentação', 'Lazer', 'Moradia', 'Outros', 'Saúde', 'Transporte', 'Salário'].sort();
      }

      const names = (data || []).map((c: any) => c.name);
      // Garantir que temos 'Outros' e 'Conciliação' se necessário
      if (!names.includes('Conciliação')) names.push('Conciliação');
      if (!names.includes('Outros')) names.push('Outros');

      return Array.from(new Set(names)).sort() as string[];
    } catch (e) {
      return [];
    }
  },

  ensureCategoryExists: async (name: string): Promise<void> => {
    if (!supabase || !name) return;
    try {
      const user = await getSessionUser(supabase);
      if (!user) return;

      const { data: existing } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', user.id)
        .ilike('name', name)
        .maybeSingle();

      if (!existing) {
        await supabase.from('categories').insert({
          user_id: user.id,
          name,
          is_archived: false,
          color: '#cbd5e1'
        });
      }
    } catch (e) { }
  },

  // --- ANEXOS ---
  uploadAttachment: async (file: File, txId?: string, isCard: boolean = false, source: string = 'manual'): Promise<string> => {
    if (!supabase) throw new Error('Supabase not configured');
    const user = await getSessionUser(supabase);
    if (!user) throw new Error('Usuário não autenticado');

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
    const filePath = `receipts/${fileName}`;

    // 1. Upload para o Storage
    const { error: uploadError } = await supabase.storage
      .from('finvision-documents')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // 2. Criar registro na tabela documents
    const docPayload: any = {
      user_id: user.id,
      bucket: 'finvision-documents',
      path: filePath,
      original_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      source: source
    };

    if (txId) {
      if (isCard) docPayload.card_transaction_id = txId;
      else docPayload.transaction_id = txId;
    }

    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert(docPayload)
      .select('id')
      .single();

    if (docError) {
      // Cleanup storage if db record fails
      await supabase.storage.from('finvision-documents').remove([filePath]);
      throw docError;
    }

    // 3. Se for uma transação única (legado ou simplificado), podemos opcionalmente atualizar o document_id da transação
    // Mas o novo fluxo de múltiplos anexos prefere buscar via query na tabela documents.
    if (txId) {
      const table = isCard ? 'card_transactions' : 'transactions';
      await supabase.from(table).update({ document_id: doc.id }).eq('id', txId);
    }

    return doc.id;
  },

  getAttachments: async (txId: string, isCard: boolean = false): Promise<any[]> => {
    if (!supabase) return [];

    const query = supabase.from('documents').select('*');
    if (isCard) query.eq('card_transaction_id', txId);
    else query.eq('transaction_id', txId);

    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  getAttachmentUrls: async (txId: string, isCard: boolean = false): Promise<{ id: string, name: string, url: string }[]> => {
    if (!supabase) return [];

    const docs = await FinanceService.getAttachments(txId, isCard);
    const results = [];

    for (const doc of docs) {
      const { data, error } = await supabase.storage
        .from('finvision-documents')
        .createSignedUrl(doc.path, 60); // URL válida por 60 segundos

      if (!error && data) {
        results.push({
          id: doc.id,
          name: doc.original_name,
          url: data.signedUrl
        });
      }
    }

    return results;
  },

  deleteAttachment: async (documentId: string): Promise<void> => {
    if (!supabase) return;

    // 1. Buscar info do documento
    const { data: doc, error: fetchErr } = await supabase
      .from('documents')
      .select('path')
      .eq('id', documentId)
      .single();

    if (fetchErr || !doc) return;

    // 2. Remover do Storage
    await supabase.storage.from('finvision-documents').remove([doc.path]);

    // 3. Remover da tabela (o cascade ou update nas transações deve ser manual ou via trigger)
    await supabase.from('documents').delete().eq('id', documentId);
  },

  getAttachmentUrl: async (documentId: string): Promise<string | null> => {
    if (!supabase) return null;

    const { data: doc, error: fetchErr } = await supabase
      .from('documents')
      .select('path')
      .eq('id', documentId)
      .single();

    if (fetchErr || !doc) return null;

    const { data, error } = await supabase.storage
      .from('finvision-documents')
      .createSignedUrl(doc.path, 60);

    return error ? null : data.signedUrl;
  },

  syncStatementToHistory: async (statementId: string, overrideAccountId?: string, overridePaid?: boolean): Promise<void> => {
    if (!supabase || !statementId) return;
    return serializeStatementSync(
      statementId,
      () => FinanceService.runStatementSync(statementId, overrideAccountId, overridePaid)
    );
  },

  // Implementação do sync. Não chamar direto: use `syncStatementToHistory`, que
  // garante que só roda uma sincronização por fatura de cada vez.
  runStatementSync: async (statementId: string, overrideAccountId?: string, overridePaid?: boolean): Promise<void> => {
    if (!supabase) return;
    try {
      const user = await getSessionUser(supabase);
      if (!user) return;

      // 1. Obter dados da fatura
      const { data: stmt, error: stmtErr } = await supabase
        .from('card_statements')
        .select(`
          *,
          cards (
            name,
            default_category,
            default_subcategory,
            default_owner
          )
        `)
        .eq('id', statementId)
        .single();
      
      if (stmtErr || !stmt) return;

      // Valor do espelho: soma AO VIVO dos lançamentos da fatura, não a coluna
      // total_amount (que é um total em cache e pode estar defasada se algum
      // lançamento foi alterado por fora da tela de Cartões). É essa defasagem que
      // fazia "Cartões" mostrar um valor e "Transações" outro para a mesma fatura.
      // Soma COM SINAL: estorno (amount negativo) abate a fatura.
      const { data: stmtTxs } = await supabase
        .from('card_transactions')
        .select('amount')
        .eq('statement_id', statementId);

      const liveTotal = Array.isArray(stmtTxs)
        ? stmtTxs.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0)
        : Number(stmt.total_amount || 0);

      // Sem lançamentos na fatura ainda: cai no total gravado (faturas ad-hoc/legadas).
      const rawTotal = (Array.isArray(stmtTxs) && stmtTxs.length > 0)
        ? liveTotal
        : Number(stmt.total_amount || 0);

      // Fatura com saldo credor (mais estorno do que compra) não vira despesa a pagar.
      const amount = Math.round(Math.max(0, rawTotal) * 100) / 100;

      // 2. Localizar conta para o lançamento
      let targetAccountId = overrideAccountId;

      if (!targetAccountId) {
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id, institution, name')
          .eq('user_id', user.id)
          .eq('is_archived', false);

        const bradescoAcc = (accounts || []).find((a: any) => 
          (a.institution || '').toLowerCase().includes('bradesco') || 
          (a.name || '').toLowerCase().includes('bradesco')
        );

        targetAccountId = bradescoAcc?.id || (accounts?.[0]?.id);
      }

      if (!targetAccountId) return;

      // 3. Upsert na tabela de transações usando query direta no jsonb.
      //
      // ATENÇÃO (bug histórico de faturas duplicadas): aqui existia um
      // `.maybeSingle()` cujo `error` era ignorado. O PostgREST devolve ERRO (e
      // `data: null`) tanto quando o SELECT falha por rede quanto quando ele
      // encontra MAIS DE UMA linha. Como o código só olhava o `data`, qualquer
      // uma dessas situações era lida como "o espelho ainda não existe" e caía
      // no INSERT. Bastava nascer uma única linha duplicada para o sync virar
      // uma máquina de duplicar: a cada chamada, mais um "Fatura Cartão: X"
      // pendente no Histórico (e mais um aviso de conta vencida no WhatsApp).
      //
      // Agora: lemos TODAS as linhas espelho da fatura, tratamos o erro
      // explicitamente (erro => aborta, nunca insere) e, se houver duplicatas,
      // consolidamos numa única linha canônica apagando as demais.
      const { data: mirrorRows, error: mirrorErr } = await supabase
        .from('transactions')
        .select('id, is_paid, date, created_at')
        .eq('user_id', user.id)
        .filter('metadata->>card_statement_id', 'eq', statementId)
        .order('created_at', { ascending: true });

      // Falhou a leitura: não dá para saber se o espelho existe. Sair sem
      // inserir é sempre mais seguro do que arriscar criar uma duplicata.
      if (mirrorErr) {
        console.error('Erro ao localizar espelho da fatura no histórico:', mirrorErr);
        return;
      }

      const existingMirrors = Array.isArray(mirrorRows) ? mirrorRows : [];

      // Linha canônica: a que já registra pagamento (preserva a data real em que
      // a fatura foi paga); na ausência dela, a mais antiga.
      const queryTx = existingMirrors.find((t: any) => t.is_paid) || existingMirrors[0] || null;

      // Autocura: elimina duplicatas herdadas do bug antigo. Sem isso, contas já
      // corrompidas continuariam mostrando o mesmo vencimento várias vezes.
      const staleMirrorIds = existingMirrors
        .filter((t: any) => t.id !== queryTx?.id)
        .map((t: any) => t.id);

      if (staleMirrorIds.length > 0) {
        const { error: dedupeErr } = await supabase
          .from('transactions')
          .delete()
          .eq('user_id', user.id)
          .in('id', staleMirrorIds);
        if (dedupeErr) console.error('Erro ao remover faturas espelho duplicadas:', dedupeErr);
      }

      const isPaidFinal = overridePaid !== undefined ? overridePaid : stmt.status === 'PAID';

      // Data do lançamento espelho:
      //  - fatura em aberto (provisão): data de vencimento, como sempre foi;
      //  - fatura sendo PAGA agora: data de HOJE no fuso local (antes ficava o
      //    vencimento — pagar em 17/07 gerava despesa datada 25/08);
      //  - fatura que JÁ estava paga (re-sync): preserva a data original do pagamento.
      let mirrorDate = stmt.due_date;
      if (isPaidFinal) {
        mirrorDate = (queryTx && (queryTx as any).is_paid && (queryTx as any).date)
          ? (queryTx as any).date
          : DateUtils.formatToISODate();
      }

      const payload: any = {
        user_id: user.id,
        account_id: targetAccountId,
        description: `Fatura Cartão: ${stmt.cards?.name || 'Cartão'} (${stmt.month}/${stmt.year})`,
        amount: amount,
        date: mirrorDate,
        type: 'BILL_PAYMENT',
        category: stmt.cards?.default_category || 'Pagamento de Fatura',
        subcategory: stmt.cards?.default_subcategory || null,
        owner_name: stmt.cards?.default_owner || 'Pessoal',
        is_paid: isPaidFinal,
        paid_amount: isPaidFinal ? amount : 0,
        paid_at: isPaidFinal ? new Date().toISOString() : null,
        metadata: {
          card_statement_id: statementId,
          is_provision: true
        },
        is_deleted: false
      };

      if (queryTx) {
        await supabase.from('transactions').update(payload).eq('id', queryTx.id);
      } else if (amount > 0) {
        await supabase.from('transactions').insert([payload]);
      }
    } catch (err) {
      console.error('Erro ao sincronizar fatura com histórico:', err);
    }
  },

  reconcileCardTransaction: async (data: any): Promise<void> => {
    if (!supabase) return;
    const user = await getSessionUser(supabase);
    if (!user) return;

    const statementId = await FinanceService.getOrCreateStatement(data.card_id, data.date);
    
    const { error } = await supabase.from('card_transactions').insert([{
      ...data,
      user_id: user.id,
      statement_id: statementId,
      status: 'POSTED',
      source: 'RECONCILIATION'
    }]);
    
    if (error) throw error;
    
    // Sync to history
    await FinanceService.syncStatementToHistory(statementId);
  }
};

