/**
 * Conectividade real — por que este arquivo existe
 * ------------------------------------------------
 * O app inteiro decidia "estou online?" olhando só `navigator.onLine`. Esse
 * sinal responde apenas "existe uma interface de rede ativa?", e não "a
 * internet funciona?". No celular ele fica `true` em três situações muito
 * comuns no uso real:
 *
 *   - Wi-Fi conectado mas sem saída (portal de hotel, roteador sem link);
 *   - sinal de dados oscilando em 1 barra;
 *   - transição entre Wi-Fi e 4G.
 *
 * Nessas situações o app achava que estava online, disparava a consulta ao
 * Supabase, e o `fetch` NÃO rejeitava — ficava pendurado indefinidamente. Como
 * nenhuma chamada tinha timeout, a tela ficava presa no spinner e o lançamento
 * não era nem salvo no servidor nem guardado na fila offline: sumia.
 *
 * Aqui centralizamos duas garantias:
 *   1. Toda chamada de rede tem prazo (`withTimeout`) — a tela nunca trava;
 *   2. Falha de rede é reconhecida (`isNetworkFailure`) e liga um modo offline
 *      "grudento" por alguns segundos, para que as ações seguintes já caiam
 *      direto na fila em vez de esperar o mesmo timeout de novo.
 */

/** Prazo padrão de uma chamada ao banco. Acima disso, tratamos como sem rede. */
export const NETWORK_TIMEOUT_MS = 12000;

/** Prazo mais curto para o boot do app: o usuário não pode encarar spinner. */
export const BOOT_TIMEOUT_MS = 7000;

/**
 * Depois de uma falha de rede, consideramos o app offline por este período sem
 * precisar de nova tentativa. Evita que cada ação do usuário pague o timeout
 * inteiro de novo enquanto a conexão continua ruim.
 */
const OFFLINE_STICKY_MS = 20000;

export class NetworkTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`Sem resposta da rede em ${Math.round(ms / 1000)}s (${label})`);
    this.name = 'NetworkTimeoutError';
  }
}

let lastFailureAt = 0;

/**
 * Corre a promessa contra um relógio. Se o prazo estourar, rejeita com
 * NetworkTimeoutError — que `isNetworkFailure` reconhece como "sem rede", então
 * quem chamou pode cair na fila offline em vez de mostrar erro ao usuário.
 *
 * Importante: não dá para cancelar um fetch já em andamento por aqui; o objetivo
 * é liberar a interface, não economizar a requisição.
 */
export function withTimeout<T>(work: PromiseLike<T>, ms: number = NETWORK_TIMEOUT_MS, label = 'requisição'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      markNetworkFailure();
      reject(new NetworkTimeoutError(label, ms));
    }, ms);

    Promise.resolve(work).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * A falha é de conectividade (vale enfileirar e tentar de novo depois) ou é um
 * erro real de dados (vale mostrar ao usuário)? Enfileirar um erro de validação
 * seria pior que falhar: ele nunca sincronizaria e ficaria preso para sempre.
 */
export function isNetworkFailure(err: any): boolean {
  if (!err) return false;
  if (err instanceof NetworkTimeoutError) return true;
  if (err.name === 'NetworkTimeoutError' || err.name === 'AbortError') return true;

  const msg = String(err.message || err.error_description || err.error || err);
  if (/failed to fetch|networkerror|network error|load failed|network request failed|fetch failed|timeout|timed out|err_internet|err_network|connection closed/i.test(msg)) {
    return true;
  }

  // Indisponibilidade do gateway (Supabase fora do ar, proxy, captive portal).
  // Só vale quando o erro REALMENTE traz um status: `Number(undefined || 0)` é 0,
  // e tratar isso como "sem rede" classificaria todo erro de dados como falha de
  // conexão — o lançamento iria para a fila e ficaria preso lá para sempre.
  const rawStatus = err.status ?? err.statusCode;
  if (rawStatus !== undefined && rawStatus !== null && rawStatus !== '') {
    const status = Number(rawStatus);
    if (status === 0 || status === 408 || status === 502 || status === 503 || status === 504) return true;
  }

  return false;
}

/** Registra que a rede falhou agora — liga o modo offline grudento. */
export function markNetworkFailure(): void {
  lastFailureAt = Date.now();
  notify();
}

/** Registra que uma chamada passou — desliga o modo offline grudento. */
export function markNetworkSuccess(): void {
  if (lastFailureAt === 0) return;
  lastFailureAt = 0;
  notify();
}

/**
 * `navigator.onLine === false` é conclusivo: não há rede. `true` é só um
 * palpite, então descontamos as falhas recentes.
 */
export function isProbablyOnline(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return Date.now() - lastFailureAt > OFFLINE_STICKY_MS;
}

/** Inverso de `isProbablyOnline`, para leitura mais natural nas guardas. */
export function isProbablyOffline(): boolean {
  return !isProbablyOnline();
}

const CONNECTIVITY_EVENT = 'finvision_connectivity_changed';

function notify() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CONNECTIVITY_EVENT, { detail: { online: isProbablyOnline() } }));
}

/** Assina mudanças de conectividade (inclui as detectadas por timeout). */
export function onConnectivityChange(cb: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => cb(isProbablyOnline());
  window.addEventListener('online', () => { markNetworkSuccess(); cb(true); });
  window.addEventListener('offline', handler);
  window.addEventListener(CONNECTIVITY_EVENT, handler);
  return () => {
    window.removeEventListener('online', handler);
    window.removeEventListener('offline', handler);
    window.removeEventListener(CONNECTIVITY_EVENT, handler);
  };
}

/**
 * Executa uma operação online e classifica o desfecho para quem chamou:
 * `{ ok: true, data }` quando deu certo, `{ ok: false, offline: true }` quando
 * faltou rede (o chamador deve enfileirar) e re-lança qualquer outro erro, que
 * é problema de dados e precisa chegar ao usuário.
 */
export async function tryOnline<T>(
  work: () => PromiseLike<T>,
  opts: { timeoutMs?: number; label?: string } = {}
): Promise<{ ok: true; data: T } | { ok: false; offline: true }> {
  if (isProbablyOffline()) return { ok: false, offline: true };
  try {
    const data = await withTimeout(work(), opts.timeoutMs ?? NETWORK_TIMEOUT_MS, opts.label || 'requisição');
    markNetworkSuccess();
    return { ok: true, data };
  } catch (err) {
    if (isNetworkFailure(err)) {
      markNetworkFailure();
      return { ok: false, offline: true };
    }
    throw err;
  }
}
