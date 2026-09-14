import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  withTimeout,
  isNetworkFailure,
  isHardNetworkFailure,
  markNetworkFailure,
  markNetworkSuccess,
  isProbablyOnline,
  NetworkTimeoutError,
  probeConnectivity
} from '../lib/connectivity';

beforeEach(() => {
  markNetworkSuccess(); // zera o estado entre os testes
});

describe('o app se declarava offline por lentidão — não pode mais', () => {
  it('um prazo estourado sozinho NÃO liga o modo offline', async () => {
    // Era este o caso do dia a dia: a abertura do app tem prazo curto (8s) só
    // para liberar a tela depressa. Estourá-lo em 4G fraco pintava a tarja
    // vermelha de "Offline" com a internet funcionando perfeitamente.
    const nunca = new Promise(() => undefined);
    await expect(withTimeout(nunca, 10, 'teste')).rejects.toBeInstanceOf(NetworkTimeoutError);
    expect(isProbablyOnline()).toBe(true);
  });

  it('dois prazos estourados seguidos, aí sim, declaram offline', async () => {
    const nunca = () => new Promise(() => undefined);
    await expect(withTimeout(nunca(), 10, 'a')).rejects.toBeTruthy();
    await expect(withTimeout(nunca(), 10, 'b')).rejects.toBeTruthy();
    expect(isProbablyOnline()).toBe(false);
  });

  it('uma resposta no meio zera a contagem: lentidão intercalada não vira queda', async () => {
    const nunca = () => new Promise(() => undefined);
    await expect(withTimeout(nunca(), 10, 'a')).rejects.toBeTruthy();
    await withTimeout(Promise.resolve('ok'), 1000, 'b');
    await expect(withTimeout(nunca(), 10, 'c')).rejects.toBeTruthy();
    expect(isProbablyOnline()).toBe(true);
  });

  it('uma chamada que responde desliga o modo offline', async () => {
    markNetworkFailure('hard');
    expect(isProbablyOnline()).toBe(false);

    // Este era o defeito mais grave: `withTimeout` não avisava nada ao dar
    // certo, então o modo offline, uma vez ligado, ficava ligado — o app
    // conversava com o banco e continuava se dizendo offline.
    await withTimeout(Promise.resolve('ok'), 1000, 'teste');
    expect(isProbablyOnline()).toBe(true);
  });

  it('resposta do servidor COM erro de dados também prova que há rede', async () => {
    markNetworkFailure('hard');
    // O supabase-js resolve a promessa com { data, error } — um erro do Postgres
    // chegou até o banco e voltou, logo a internet está funcionando.
    await withTimeout(Promise.resolve({ data: null, error: { code: '23505' } }), 1000, 'teste');
    expect(isProbablyOnline()).toBe(true);
  });

  it('falha dura (o navegador não entregou a requisição) declara offline de primeira', async () => {
    await expect(
      withTimeout(Promise.reject(new TypeError('Failed to fetch')), 1000, 'teste')
    ).rejects.toBeTruthy();
    expect(isProbablyOnline()).toBe(false);
  });

  it('chamada marcada como `silent` não influencia o diagnóstico', async () => {
    const nunca = () => new Promise(() => undefined);
    await expect(withTimeout(nunca(), 10, 'boot', { silent: true })).rejects.toBeTruthy();
    await expect(withTimeout(nunca(), 10, 'boot', { silent: true })).rejects.toBeTruthy();
    expect(isProbablyOnline()).toBe(true);
  });
});

describe('classificação de falha', () => {
  it('reconhece as falhas que devem virar fila offline', () => {
    expect(isNetworkFailure(new NetworkTimeoutError('salvar', 12000))).toBe(true);
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkFailure({ message: 'NetworkError when attempting to fetch resource.' })).toBe(true);
    expect(isNetworkFailure({ status: 503, message: 'Service Unavailable' })).toBe(true);
  });

  it('separa falha DURA de falha MOLE', () => {
    expect(isHardNetworkFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isHardNetworkFailure({ status: 504 })).toBe(true);
    // Prazo estourado é só lentidão: não é conclusivo.
    expect(isHardNetworkFailure(new NetworkTimeoutError('salvar', 12000))).toBe(false);
  });

  it('prazo do SERVIDOR não é prazo da rede', () => {
    // 57014 é o Postgres cancelando uma consulta pesada. A mensagem tem a
    // palavra "timeout", e a versão anterior mandava o app inteiro para o modo
    // offline por causa disso — além de enfileirar um lançamento que nunca
    // passaria. A requisição chegou ao banco e voltou: há internet.
    expect(isNetworkFailure({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false);
    expect(isNetworkFailure({ code: 'PGRST301', message: 'JWT expired' })).toBe(false);
  });

  it('não confunde erro de dados com falta de rede', () => {
    expect(isNetworkFailure({ code: '22P02', message: 'invalid input syntax for type uuid' })).toBe(false);
    expect(isNetworkFailure({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false);
    expect(isNetworkFailure(null)).toBe(false);
  });
});

describe('sonda de conectividade', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('uma sonda que passa desfaz um diagnóstico errado de offline', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({} as any) as any;
    markNetworkFailure('hard');
    expect(isProbablyOnline()).toBe(false);

    await expect(probeConnectivity(500)).resolves.toBe(true);
    expect(isProbablyOnline()).toBe(true);
  });

  it('uma sonda que falha confirma o offline, sem lançar', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as any;
    markNetworkFailure('hard');
    await expect(probeConnectivity(500)).resolves.toBe(false);
    expect(isProbablyOnline()).toBe(false);
  });
});
