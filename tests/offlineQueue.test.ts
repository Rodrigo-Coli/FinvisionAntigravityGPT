import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/supabase/client', () => ({ supabase: null }));

import { offlineQueue, isOfflineId } from '../lib/offlineQueue.service';
import { isNetworkFailure, NetworkTimeoutError, withTimeout, markNetworkFailure, markNetworkSuccess, isProbablyOnline } from '../lib/connectivity';

const QUEUE_KEY = 'finvision_offline_queue';

beforeEach(() => {
  localStorage.clear();
  markNetworkSuccess();
});

describe('fila offline — criação de lançamento', () => {
  it('não guarda o id local dentro do payload que vai para o banco', () => {
    // O bug original: o id inventado no aparelho ia junto no INSERT, e como
    // transactions.id é uuid o envio falhava com 22P02 para sempre.
    offlineQueue.addAction('CREATE_TRANSACTION', {
      id: 'offline-abc',
      description: 'Padaria',
      amount: 12.5,
      user_id: 'u1'
    });

    const [action] = offlineQueue.getQueue();
    expect(action.payload.id).toBeUndefined();
    expect(action.payload.description).toBe('Padaria');
    expect(isOfflineId(action.localId)).toBe(true);
  });

  it('inventa um id local quando a tela não forneceu nenhum', () => {
    const localId = offlineQueue.addAction('CREATE_TRANSACTION', { description: 'Uber', amount: 30 });
    expect(isOfflineId(localId)).toBe(true);
  });

  it('expõe os lançamentos pendentes com id para a tela exibir', () => {
    offlineQueue.addAction('CREATE_TRANSACTION', { description: 'Mercado', amount: 90 });
    const pending = offlineQueue.getPendingTransactions();
    expect(pending).toHaveLength(1);
    expect(pending[0].description).toBe('Mercado');
    expect(isOfflineId(pending[0].id)).toBe(true);
    expect(pending[0]._pendingSync).toBe(true);
  });
});

describe('fila offline — migração de itens já gravados no aparelho', () => {
  it('resgata itens presos pelo bug do id inválido', () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([
      { id: 'x1', type: 'CREATE_TRANSACTION', payload: { id: 'offline-1755', description: 'Farmácia', amount: 40 }, timestamp: '2026-08-01T00:00:00Z' }
    ]));

    const [action] = offlineQueue.getQueue();
    expect(action.payload.id).toBeUndefined();
    expect(action.localId).toBe('offline-1755');
    expect(action.payload.description).toBe('Farmácia');
  });

  it('converte itens do formato da fila duplicada que foi removida', () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([
      { id: 'y1', table: 'transactions', method: 'INSERT', payload: { description: 'Posto', amount: 200 } },
      { id: 'y2', table: 'transactions', method: 'UPDATE', payload: { id: 'uuid-1', data: { is_paid: true } } },
      { id: 'y3', table: 'transactions', method: 'DELETE', payload: { id: 'uuid-2' } }
    ]));

    const queue = offlineQueue.getQueue();
    expect(queue.map(a => a.type)).toEqual(['CREATE_TRANSACTION', 'UPDATE_TRANSACTION', 'DELETE_TRANSACTION']);
    expect(queue[1].payload).toEqual({ id: 'uuid-1', updates: { is_paid: true } });
    expect(queue[2].payload).toEqual({ id: 'uuid-2' });
  });
});

describe('fila offline — edições e exclusões pendentes', () => {
  it('acumula as edições por transação e lista as exclusões', () => {
    offlineQueue.addAction('UPDATE_TRANSACTION', { id: 't1', updates: { is_paid: true } });
    offlineQueue.addAction('UPDATE_TRANSACTION', { id: 't1', updates: { paid_amount: 50 } });
    offlineQueue.addAction('DELETE_TRANSACTION', { id: 't2' });

    const { updates, deletions } = offlineQueue.getPendingMutations();
    expect(updates.t1).toEqual({ is_paid: true, paid_amount: 50 });
    expect(deletions.has('t2')).toBe(true);
  });
});

describe('classificação de falha de rede', () => {
  it('reconhece as falhas que devem virar fila offline', () => {
    expect(isNetworkFailure(new NetworkTimeoutError('salvar', 12000))).toBe(true);
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkFailure({ message: 'NetworkError when attempting to fetch resource.' })).toBe(true);
    expect(isNetworkFailure({ status: 503, message: 'Service Unavailable' })).toBe(true);
  });

  it('não confunde erro de dados com falta de rede', () => {
    // Enfileirar um erro de validação seria pior que falhar: ele nunca
    // sincronizaria e ficaria preso na fila para sempre.
    expect(isNetworkFailure({ code: '22P02', message: 'invalid input syntax for type uuid' })).toBe(false);
    expect(isNetworkFailure({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false);
    expect(isNetworkFailure(null)).toBe(false);
  });
});

describe('prazo das chamadas de rede', () => {
  it('rejeita quando a resposta não chega e marca o app como offline', async () => {
    const nunca = new Promise(() => undefined);
    await expect(withTimeout(nunca, 20, 'teste')).rejects.toBeInstanceOf(NetworkTimeoutError);
    expect(isProbablyOnline()).toBe(false);
  });

  it('deixa a resposta passar quando ela chega a tempo', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'teste')).resolves.toBe('ok');
  });

  it('considera o app offline logo após uma falha, sem esperar novo timeout', () => {
    expect(isProbablyOnline()).toBe(true);
    markNetworkFailure();
    expect(isProbablyOnline()).toBe(false);
    markNetworkSuccess();
    expect(isProbablyOnline()).toBe(true);
  });
});
