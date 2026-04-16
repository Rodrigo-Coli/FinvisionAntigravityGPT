import { supabase } from '../lib/supabase/client';
import { BankAccount, Transaction, CreditCardDetailed, Entity } from '../types';

export const FinanceService = {
  // Contas
  getAccounts: async (): Promise<BankAccount[]> => {
    if (!supabase) return [];

    const { data: { user } } = await supabase.auth.getUser();
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
    const { data: { user } } = await supabase.auth.getUser();
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

    const { data: { user } } = await supabase.auth.getUser();
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

    const { data: { user } } = await supabase.auth.getUser();
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado");

    // 1. Buscar detalhes do cartão
    const { data: card, error: cardErr } = await supabase
      .from('cards')
      .select('*')
      .eq('id', cardId)
      .single();
    if (cardErr) throw cardErr;

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
      .eq('card_id', cardId)
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
        card_id: cardId,
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return ['Pessoal'];

      let query = supabase.from('entities').select('name').eq('user_id', user.id);
      if (!includeArchived) query = query.eq('is_archived', false);

      const { data, error } = await query.order('name');

      if (error) {
        // Fallback: se a tabela não existir, busca das transações
        const { data: txData } = await supabase.from('transactions').select('owner_name').not('owner_name', 'is', null);
        return Array.from(new Set(['Pessoal', ...(txData || []).map((t: any) => t.owner_name)])).sort() as string[];
      }
      return Array.from(new Set(['Pessoal', ...(data || []).map((e: any) => e.name)])).sort() as string[];
    } catch (e) {
      return ['Pessoal'];
    }
  },

  archiveEntity: async (name: string, archive: boolean = true): Promise<void> => {
    if (!supabase || !name || name === 'Pessoal') return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('entities')
      .update({ is_archived: archive })
      .eq('user_id', user.id)
      .eq('name', name);
  },

  getEntityObjects: async (includeArchived = false): Promise<Entity[]> => {
    if (!supabase) return [];
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let query = supabase.from('entities').select('*').eq('user_id', user.id);
    if (!includeArchived) query = query.eq('is_archived', false);
    const { data, error } = await query.order('name');
    if (error) return [];

    return (data || []).map((e: any) => ({
      id: e.id,
      name: e.name,
      isArchived: e.is_archived
    }));
  },

  ensureEntityExists: async (name: string): Promise<void> => {
    if (!supabase || !name || name === 'Pessoal') return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from('entities').upsert({ user_id: user.id, name }, { onConflict: 'user_id, name' });
      // Se der erro aqui, provavelmente a tabela não existe, ignoramos silenciosamente
      if (error) console.warn("Erro ao garantir entidade:", error);
    } catch (e) { }
  },

  // Transações com Suporte Offline
  saveTransaction: async (tx: any): Promise<any> => {
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado');

    if (!navigator.onLine) {
      const { offlineQueue } = await import('../lib/offlineQueue.service');
      const fakeId = tx.id || 'offline-' + Date.now();
      const payload = { ...tx, id: fakeId, user_id: user.id };
      offlineQueue.addAction('CREATE_TRANSACTION', payload);
      return { id: fakeId, ...payload };
    }

    const { data, error } = await supabase.from('transactions').insert([{ ...tx, user_id: user.id }]).select().single();
    if (error) throw error;
    return data;
  },

  updateTransaction: async (id: string, updates: any): Promise<void> => {
    if (!supabase) return;
    if (!navigator.onLine) {
      const { offlineQueue } = await import('../lib/offlineQueue.service');
      offlineQueue.addAction('UPDATE_TRANSACTION', { id, updates });
      return;
    }
    const { error } = await supabase.from('transactions').update(updates).eq('id', id);
    if (error) throw error;
  },

  deleteTransaction: async (id: string): Promise<void> => {
    if (!supabase) return;
    if (!navigator.onLine) {
      const { offlineQueue } = await import('../lib/offlineQueue.service');
      offlineQueue.addAction('DELETE_TRANSACTION', { id });
      return;
    }
    const { error } = await supabase.from('transactions').update({ is_deleted: true }).eq('id', id);
    if (error) throw error;
  },

  // Categorias
  getCategories: async (): Promise<string[]> => {
    if (!supabase) return [];
    try {
      const { data: { user } } = await supabase.auth.getUser();
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
      const { data: { user } } = await supabase.auth.getUser();
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
    const { data: { user } } = await supabase.auth.getUser();
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
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Obter dados da fatura
      const { data: stmt, error: stmtErr } = await supabase
        .from('card_statements')
        .select(`
          *,
          cards (
            name
          )
        `)
        .eq('id', statementId)
        .single();
      
      if (stmtErr || !stmt) return;

      const amount = Math.abs(Number(stmt.total_amount || 0));

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

      // 3. Upsert na tabela de transações usando query direta no jsonb
      const { data: queryTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', user.id)
        .filter('metadata->>card_statement_id', 'eq', statementId)
        .maybeSingle();

      const payload: any = {
        user_id: user.id,
        account_id: targetAccountId,
        description: `Fatura Cartão: ${stmt.cards?.name || 'Cartão'} (${stmt.month}/${stmt.year})`,
        amount: amount,
        date: stmt.due_date,
        type: 'BILL_PAYMENT',
        category: 'Pagamento de Fatura',
        is_paid: overridePaid !== undefined ? overridePaid : stmt.status === 'PAID',
        paid_amount: (overridePaid !== undefined ? overridePaid : stmt.status === 'PAID') ? amount : 0,
        paid_at: (overridePaid !== undefined ? overridePaid : stmt.status === 'PAID') ? new Date().toISOString() : null,
        metadata: {
          card_statement_id: statementId,
          is_provision: true
        }
      };

      if (queryTx) {
        await supabase.from('transactions').update(payload).eq('id', queryTx.id);
      } else if (amount > 0) {
        await supabase.from('transactions').insert([payload]);
      }
    } catch (err) {
      console.error('Erro ao sincronizar fatura com histórico:', err);
    }
  }
};
