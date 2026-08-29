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
 */

export type OfflineActionType =
  | 'CREATE_TRANSACTION'
  | 'UPDATE_TRANSACTION'
  | 'DELETE_TRANSACTION'
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
   * Só para CREATE_TRANSACTION: o id provisório que a tela usa para exibir o
   * lançamento antes de ele existir no banco. NUNCA vai no INSERT.
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
    if (action.type === 'CREATE_TRANSACTION' && action.payload && isOfflineId(action.payload.id)) {
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

    if (type === 'CREATE_TRANSACTION') {
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

  private async execute(action: OfflineAction): Promise<void> {
    if (!supabase) throw new Error('Supabase indisponível');
    const p = action.payload || {};

    if (action.type === 'CREATE_TRANSACTION') {
      const { id, ...row } = p; // cinto e suspensório: id local nunca vai ao banco
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
