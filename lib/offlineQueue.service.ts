import { supabase } from './supabase/client';
import { isNetworkFailure, isProbablyOnline, markNetworkFailure, markNetworkSuccess, withTimeout } from './connectivity';

/**
 * Fila offline — o que era quebrado aqui
 * -------------------------------------
 * 1. CRIAR LANÇAMENTO OFFLINE NUNCA SINCRONIZAVA. A fila guardava o lançamento
 *    com um id inventado no aparelho (`'offline-' + uuid`). A coluna
 *    `transactions.id` é `uuid`, então o INSERT voltava sempre com
 *    `22P02 invalid input syntax for type uuid`. O item ficava preso na fila,
 *    era retentado a cada reconexão, falhava de novo — e o lançamento nunca
 *    chegava ao banco. Agora o id local vive fora do payload (`localId`), e o
 *    banco gera o uuid definitivo (`gen_random_uuid()`).
 *
 * 2. ERRO PERMANENTE FICAVA PARA SEMPRE. Não havia contagem de tentativas nem
 *    separação entre "faltou rede" (vale tentar de novo) e "o dado está errado"
 *    (nunca vai passar). Agora erro de rede pausa a fila preservando a ordem, e
 *    erro permanente é aposentado depois de MAX_ATTEMPTS para uma lista de
 *    falhas visível, em vez de sumir em silêncio.
 *
 * 3. PAGAMENTO NÃO ERA ENFILEIRÁVEL. Só criar/editar/excluir lançamento tinha
 *    caminho offline. Pagar uma conta ou uma fatura ia direto ao Supabase e
 *    morria sem rede. Foram acrescentados UPDATE_CARD_STATEMENT e
 *    RECALC_ACCOUNT_BALANCE para o pagamento inteiro poder ser reproduzido.
 *
 * 4. DUAS FILAS NA MESMA CHAVE. Existia um segundo `lib/offlineQueue.ts` com
 *    formato incompatível gravando na MESMA chave do localStorage; cada um
 *    descartava em silêncio os itens do outro. Aquele arquivo foi removido e a
 *    migração abaixo recupera itens no formato antigo.
 *
 * 5. COMPRA DE CARTÃO NÃO TINHA CAMINHO OFFLINE NENHUM. A tela de Cartões ia
 *    direto ao Supabase: criava a categoria, resolvia/criava a fatura
 *    (`card_statements`) e só então inseria a compra. Sem internet, essa
 *    sequência ou estourava erro ou ficava pendurada — o botão travava em
 *    "Processando..." e a compra não ia nem para o banco nem para a fila.
 *    Agora existe CREATE_CARD_TRANSACTION: a compra é enfileirada sem fatura, e
 *    a fatura (e a categoria nova, se houver) é resolvida na hora do envio,
 *    exatamente como a tela faria online.
 */

export type OfflineActionType =
  | 'CREATE_TRANSACTION'
  | 'UPDATE_TRANSACTION'
  | 'DELETE_TRANSACTION'
  | 'CREATE_CARD_TRANSACTION'
  | 'UPDATE_CARD_TRANSACTION'
  | 'DELETE_CARD_TRANSACTION'
  | 'UPDATE_CARD_STATEMENT'
  | 'SYNC_STATEMENT_TO_HISTORY'
  | 'RECALC_ACCOUNT_BALANCE';

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  payload: any;
  timestamp: string;
  /** Tentativas de envio já feitas. Erro permanente aposenta em MAX_ATTEMPTS. */
  attempts?: number;
  lastError?: string;
  /**
   * Só para as ações de criação (CREATE_TRANSACTION, CREATE_CARD_TRANSACTION):
   * o id provisório que a tela usa para exibir o lançamento antes de ele existir
   * no banco. NUNCA vai no INSERT.
   */
  localId?: string;
}

const QUEUE_KEY = 'finvision_offline_queue';
const FAILED_KEY = 'finvision_offline_failed';
const MAX_ATTEMPTS = 5;
const SYNC_TIMEOUT_MS = 20000;

export const OFFLINE_ID_PREFIX = 'offline-';

export function isOfflineId(id: any): boolean {
  return typeof id === 'string' && id.startsWith(OFFLINE_ID_PREFIX);
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: any): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Fila offline: falha ao gravar no localStorage', e);
  }
}

/**
 * Normaliza itens gravados por versões antigas do app (e pelo `offlineQueue.ts`
 * removido), para que nada que o usuário já lançou offline se perca no update.
 */
function migrate(raw: any[]): OfflineAction[] {
  const out: OfflineAction[] = [];

  for (const item of raw || []) {
    if (!item || typeof item !== 'object') continue;

    // Formato do offlineQueue.ts antigo: { table, method, payload }
    if (!item.type && item.table && item.method) {
      const table = String(item.table);
      const method = String(item.method);
      if (table === 'transactions' && method === 'INSERT') {
        out.push(newAction('CREATE_TRANSACTION', item.payload));
        continue;
      }
      if (table === 'transactions' && method === 'UPDATE') {
        out.push(newAction('UPDATE_TRANSACTION', { id: item.payload?.id, updates: item.payload?.data }));
        continue;
      }
      if (table === 'transactions' && method === 'DELETE') {
        out.push(newAction('DELETE_TRANSACTION', { id: item.payload?.id }));
        continue;
      }
      continue; // tabela desconhecida: não há como reproduzir com segurança
    }

    if (!item.type) continue;

    const action: OfflineAction = {
      id: item.id || Math.random().toString(36).substring(2, 9),
      type: item.type,
      payload: item.payload,
      timestamp: item.timestamp || new Date().toISOString(),
      attempts: Number(item.attempts || 0),
      lastError: item.lastError,
      localId: item.localId
    };

    // O bug original: id inventado no aparelho dentro do payload do INSERT.
    // Tiramos daqui para o item finalmente conseguir sincronizar.
    if ((action.type === 'CREATE_TRANSACTION' || action.type === 'CREATE_CARD_TRANSACTION')
        && action.payload && isOfflineId(action.payload.id)) {
      action.localId = action.localId || action.payload.id;
      const { id, ...rest } = action.payload;
      action.payload = rest;
    }

    out.push(action);
  }

  return out;
}

function newAction(type: OfflineActionType, payload: any, localId?: string): OfflineAction {
  return {
    id: Math.random().toString(36).substring(2, 9),
    type,
    payload,
    timestamp: new Date().toISOString(),
    attempts: 0,
    localId
  };
}

class OfflineQueueService {
  private syncing = false;

  getQueue(): OfflineAction[] {
    return migrate(readJSON<any[]>(QUEUE_KEY, []));
  }

  private saveQueue(queue: OfflineAction[]): void {
    writeJSON(QUEUE_KEY, queue);
    this.emit();
  }

  private emit(): void {
    if (typeof window === 'undefined') return;
    // Dois nomes por compatibilidade: telas antigas escutam o segundo.
    window.dispatchEvent(new CustomEvent('finvision_offline_queue_updated'));
    window.dispatchEvent(new CustomEvent('offline-queue-updated'));
  }

  getPendingCount(): number {
    return this.getQueue().length;
  }

  /** Ações aposentadas por erro permanente — precisam de decisão do usuário. */
  getFailed(): OfflineAction[] {
    return readJSON<OfflineAction[]>(FAILED_KEY, []);
  }

  clearFailed(): void {
    writeJSON(FAILED_KEY, []);
    this.emit();
  }

  /**
   * Lançamentos criados offline e ainda não sincronizados, no formato de linha
   * de `transactions`. As telas mesclam isso ao que veio do cache para que o
   * lançamento continue visível depois de fechar e reabrir o app — antes ele
   * só existia no estado do React e sumia no primeiro reload.
   */
  getPendingTransactions(): any[] {
    return this.getQueue()
      .filter(a => a.type === 'CREATE_TRANSACTION' && a.payload)
      .map(a => ({
        ...a.payload,
        id: a.localId || OFFLINE_ID_PREFIX + a.id,
        is_deleted: false,
        _pendingSync: true
      }));
  }

  /**
   * Compras de cartão criadas offline e ainda não enviadas, no formato de linha
   * de `card_transactions`. Sem isso, a compra lançada sem internet sumia da
   * fatura ao recarregar o app — e a pessoa lançava tudo de novo.
   *
   * @param cardIds quando informado, só as compras destes cartões.
   */
  getPendingCardTransactions(cardIds?: string[]): any[] {
    const wanted = cardIds && cardIds.length > 0 ? new Set(cardIds) : null;
    return this.getQueue()
      .filter(a => a.type === 'CREATE_CARD_TRANSACTION' && a.payload)
      .filter(a => !wanted || wanted.has(a.payload.card_id))
      .map(a => {
        // `_rowId` e `_categoryName` são metadados do envio; a tela não os usa.
        const { _rowId, _categoryName, ...row } = a.payload;
        return {
          ...row,
          id: a.localId || OFFLINE_ID_PREFIX + a.id,
          _pendingSync: true
        };
      });
  }

  /** Edições/exclusões offline ainda não enviadas, por id de transação. */
  getPendingMutations(): { updates: Record<string, any>; deletions: Set<string> } {
    const updates: Record<string, any> = {};
    const deletions = new Set<string>();
    for (const a of this.getQueue()) {
      if (a.type === 'UPDATE_TRANSACTION' && a.payload?.id) {
        updates[a.payload.id] = { ...(updates[a.payload.id] || {}), ...(a.payload.updates || {}) };
      } else if (a.type === 'DELETE_TRANSACTION' && a.payload?.id) {
        deletions.add(a.payload.id);
      }
    }
    return { updates, deletions };
  }

  /**
   * Enfileira uma ação. Retorna o id local (útil para CREATE_TRANSACTION, onde
   * a tela precisa de um id provisório para exibir a linha).
   */
  addAction(type: OfflineActionType, payload: any): string {
    const queue = this.getQueue();
    let finalPayload = payload;
    let localId: string | undefined;

    if (type === 'CREATE_TRANSACTION' || type === 'CREATE_CARD_TRANSACTION') {
      // O id é do banco (`gen_random_uuid()`), nunca do aparelho. Guardar um id
      // inventado aqui era exatamente o que impedia a sincronização.
      const { id, ...rest } = payload || {};
      finalPayload = rest;
      localId = isOfflineId(id) ? id : OFFLINE_ID_PREFIX + (crypto?.randomUUID?.() || Date.now());
    }

    const action = newAction(type, finalPayload, localId);
    queue.push(action);
    this.saveQueue(queue);
    return localId || action.id;
  }

  removeAction(id: string): void {
    this.saveQueue(this.getQueue().filter(item => item.id !== id));
  }

  /**
   * Garante um `user_id` de verdade na linha antes do INSERT.
   *
   * Offline, a tela nem sempre consegue ler a sessão e chegava a gravar um
   * placeholder ('offline-user') no lugar do uuid. A coluna é `uuid`: o envio
   * falhava com 22P02 a cada reconexão até ser aposentado, e o lançamento se
   * perdia em silêncio. No envio já estamos online — dá para resolver de fato.
   */
  private async withRealUserId(row: any): Promise<any> {
    const isUuid = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    if (isUuid(row?.user_id)) return row;

    const { getSessionUser } = await import('./session');
    const user = await getSessionUser(supabase);
    if (!user?.id) throw new Error('Usuário não autenticado para enviar a fila offline');
    return { ...row, user_id: user.id };
  }

  private async execute(action: OfflineAction): Promise<void> {
    if (!supabase) throw new Error('Supabase indisponível');
    const p = action.payload || {};

    if (action.type === 'CREATE_TRANSACTION') {
      const { id, ...rest } = p; // cinto e suspensório: id local nunca vai ao banco
      const row = await this.withRealUserId(rest);
      const { error } = await supabase.from('transactions').insert([row]);
      if (error) throw error;
      return;
    }
    if (action.type === 'UPDATE_TRANSACTION') {
      const { error } = await supabase.from('transactions').update(p.updates).eq('id', p.id);
      if (error) throw error;
      return;
    }
    if (action.type === 'DELETE_TRANSACTION') {
      const { error } = await supabase.from('transactions').update({ is_deleted: true }).eq('id', p.id);
      if (error) throw error;
      return;
    }
    if (action.type === 'CREATE_CARD_TRANSACTION') {
      const { id, _categoryName, _rowId: rowId, ...row } = p; // `id` local nunca vai ao banco

      // Categoria digitada offline que ainda não existia no banco. Guardamos o
      // NOME (`_categoryName`, metadado local que nunca vai no INSERT) e
      // resolvemos aqui — offline não dá para criar a categoria e sem isso o
      // lançamento sincronizaria com a categoria em branco.
      if (!row.category_id && _categoryName) {
        try {
          const { ReconciliationService } = await import('../services/reconciliation.service');
          row.category_id = (await ReconciliationService.ensureCategoryExists(_categoryName)) || null;
        } catch (catErr) {
          console.warn('Fila offline: não foi possível resolver a categoria do lançamento de cartão', catErr);
        }
      }

      // A fatura (statement) não existe offline — ela depende de consultar o
      // cartão e, se for o caso, CRIAR a linha em `card_statements`. Por isso o
      // lançamento é enfileirado sem `statement_id` e a fatura certa é resolvida
      // aqui, na hora do envio, exatamente como a tela faria online.
      let statementId = row.statement_id || null;
      const { FinanceService } = await import('../services/finance.service');
      if (!statementId && row.card_id && row.date) {
        statementId = await FinanceService.getOrCreateStatement(row.card_id, row.date);
      }

      // Idempotência: a compra vai com um uuid DE VERDADE gerado no aparelho
      // (`_rowId`), não com o id inventado `offline-...` que quebrava o INSERT.
      // Isso protege o caso em que a rede some DEPOIS de o banco gravar — a
      // resposta é que se perdeu, a tela enfileira uma compra que já existe, e o
      // usuário veria a mesma compra duas vezes na fatura. Com o id fixo o
      // segundo envio bate na chave primária (23505) e é reconhecido como "já
      // enviado". Duas compras iguais de verdade (mesmo valor, mesmo dia, mesma
      // descrição) continuam sendo duas, porque cada uma tem seu próprio uuid.
      const insertRow = await this.withRealUserId({ ...row, statement_id: statementId, ...(rowId ? { id: rowId } : {}) });
      const { error } = await supabase.from('card_transactions').insert([insertRow]);
      if (error) {
        const jaEnviada = rowId && (error.code === '23505' || /duplicate key/i.test(error.message || ''));
        if (!jaEnviada) throw error;
        console.warn('Fila offline: compra de cartão já estava no banco, não foi inserida de novo');
      }

      // O espelho da fatura no Histórico é consequência, não parte do
      // lançamento: se falhar, o lançamento JÁ está gravado e repetir a ação
      // duplicaria a compra. A tela de Cartões refaz essa sincronização ao
      // carregar, então aqui basta registrar.
      if (statementId) {
        try {
          await FinanceService.syncStatementToHistory(statementId);
        } catch (syncErr) {
          console.warn('Fila offline: lançamento de cartão enviado, sincronização da fatura ficou para depois', syncErr);
        }
      }
      return;
    }
    if (action.type === 'UPDATE_CARD_TRANSACTION') {
      const { error } = await supabase.from('card_transactions').update(p.updates).eq('id', p.id);
      if (error) throw error;
      return;
    }
    if (action.type === 'DELETE_CARD_TRANSACTION') {
      const { error } = await supabase.from('card_transactions').delete().eq('id', p.id);
      if (error) throw error;
      return;
    }
    if (action.type === 'UPDATE_CARD_STATEMENT') {
      const { error } = await supabase.from('card_statements').update(p.updates).eq('id', p.id);
      if (error) throw error;
      return;
    }
    if (action.type === 'SYNC_STATEMENT_TO_HISTORY') {
      // Reproduz online exatamente a sincronização que a tela de Cartões faria.
      // Import dinâmico de propósito: finance.service importa esta fila, e a
      // dependência circular quebraria o carregamento do módulo.
      const { FinanceService } = await import('../services/finance.service');
      await FinanceService.syncStatementToHistory(p.statementId, p.accountId, p.paid);
      return;
    }
    if (action.type === 'RECALC_ACCOUNT_BALANCE') {
      const { error } = await supabase.rpc('recalculate_account_balance', { p_account_id: p.accountId });
      if (error) throw error;
      return;
    }

    throw new Error(`Ação offline desconhecida: ${action.type}`);
  }

  /**
   * Envia a fila em ordem. Sem rede, para na hora e preserva o restante — a
   * ordem importa (criar antes de editar). Erro permanente é retentado até
   * MAX_ATTEMPTS e depois aposentado, para não travar a fila inteira.
   *
   * @returns quantas ações foram efetivadas no banco.
   */
  async processQueue(): Promise<number> {
    if (!supabase || this.syncing) return 0;
    if (!isProbablyOnline()) return 0;

    const queue = this.getQueue();
    if (queue.length === 0) return 0;

    this.syncing = true;
    let successCount = 0;

    try {
      const remaining: OfflineAction[] = [];
      const failed = this.getFailed();
      let networkDown = false;

      for (const action of queue) {
        if (networkDown) {
          remaining.push(action); // conexão caiu no meio: guarda o resto na ordem
          continue;
        }

        try {
          await withTimeout(this.execute(action), SYNC_TIMEOUT_MS, `sincronizar ${action.type}`);
          markNetworkSuccess();
          successCount++;
        } catch (err: any) {
          if (isNetworkFailure(err)) {
            markNetworkFailure();
            networkDown = true;
            remaining.push(action);
            continue;
          }

          const attempts = Number(action.attempts || 0) + 1;
          const lastError = String(err?.message || err?.code || err);
          console.error(`Fila offline: ação ${action.type} falhou (tentativa ${attempts})`, err);

          if (attempts >= MAX_ATTEMPTS) {
            failed.push({ ...action, attempts, lastError });
          } else {
            remaining.push({ ...action, attempts, lastError });
          }
        }
      }

      this.saveQueue(remaining);
      writeJSON(FAILED_KEY, failed);
    } finally {
      this.syncing = false;
    }

    if (successCount > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('offline-sync-completed'));
    }

    return successCount;
  }
}

export const offlineQueue = new OfflineQueueService();
