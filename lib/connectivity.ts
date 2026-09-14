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
 *
 * O aviso de offline aparecia demais — por quê
 * --------------------------------------------
 * A primeira versão tratava LENTIDÃO como AUSÊNCIA DE REDE, e nunca desfazia o
 * diagnóstico. Eram três defeitos somados:
 *
 *   a) todo prazo estourado chamava `markNetworkFailure()` na hora. Uma abertura
 *      de app mais lenta que os 7s do boot (4G fraco, projeto Supabase frio,
 *      consulta grande) já pintava a tarja vermelha de "Offline" — mesmo com a
 *      internet funcionando perfeitamente;
 *   b) `withTimeout` NÃO avisava quando a chamada dava certo. Então o modo
 *      offline, uma vez ligado, só era desligado pelos pouquíssimos pontos que
 *      chamavam `markNetworkSuccess()` à mão: o app continuava se declarando
 *      offline enquanto conversava normalmente com o banco;
 *   c) não havia NENHUMA verificação ativa. O diagnóstico era sempre um palpite
 *      a partir da última falha, nunca uma pergunta à rede.
 *
 * Agora:
 *   - falha DURA (o navegador diz que não saiu nada: "Failed to fetch", evento
 *     `offline`) liga o modo offline na hora — é conclusiva;
 *   - falha MOLE (só demorou) precisa de confirmação: duas seguidas, ou uma
 *     sonda (`probeConnectivity`) que também falhe. Lentidão não é queda;
 *   - toda chamada que responde — inclusive quando o servidor responde ERRO,
 *     porque isso prova que a rede chegou lá — desliga o modo offline.
 */

/** Prazo padrão de uma chamada ao banco. Acima disso, tratamos como sem rede. */
export const NETWORK_TIMEOUT_MS = 15000;

/** Prazo mais curto para o boot do app: o usuário não pode encarar spinner. */
export const BOOT_TIMEOUT_MS = 8000;

/**
 * Depois de uma falha de rede, consideramos o app offline por este período sem
 * precisar de nova tentativa. Evita que cada ação do usuário pague o timeout
 * inteiro de novo enquanto a conexão continua ruim.
 */
const OFFLINE_STICKY_MS = 20000;

/**
 * Quantos prazos estourados seguidos, SEM nenhuma resposta no meio, bastam para
 * declarar offline sem sonda. Um só é lentidão; dois seguidos já é sintoma.
 */
const SOFT_FAILURES_TO_GO_OFFLINE = 2;

/** Prazo da sonda de conectividade. Curto: é uma pergunta, não uma operação. */
const PROBE_TIMEOUT_MS = 5000;

export class NetworkTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`Sem resposta da rede em ${Math.round(ms / 1000)}s (${label})`);
    this.name = 'NetworkTimeoutError';
  }
}

let lastFailureAt = 0;
let softFailureStreak = 0;

/**
 * Alvo da sonda: o serviço de autenticação do próprio Supabase, que é a rede de
 * que o app realmente depende. `mode: 'no-cors'` de propósito — não precisamos
 * LER a resposta, só saber se a requisição chegou a algum lugar, e assim não
 * dependemos de nenhum cabeçalho de CORS.
 */
function probeUrl(): string | null {
  try {
    const base = (import.meta as any)?.env?.VITE_SUPABASE_URL;
    if (!base || typeof base !== 'string') return null;
    return `${base.replace(/\/$/, '')}/auth/v1/health`;
  } catch {
    return null;
  }
}

/**
 * Corre a promessa contra um relógio. Se o prazo estourar, rejeita com
 * NetworkTimeoutError — que `isNetworkFailure` reconhece como "sem rede", então
 * quem chamou pode cair na fila offline em vez de mostrar erro ao usuário.
 *
 * Importante: não dá para cancelar um fetch já em andamento por aqui; o objetivo
 * é liberar a interface, não economizar a requisição.
 *
 * @param opts.silent não deixa esta chamada influenciar o diagnóstico de
 *   conectividade. Use no boot e em tarefas de fundo, onde um prazo curto
 *   existe para liberar a tela depressa e NÃO é evidência de falta de internet.
 */
export function withTimeout<T>(
  work: PromiseLike<T>,
  ms: number = NETWORK_TIMEOUT_MS,
  label = 'requisição',
  opts: { silent?: boolean } = {}
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Prazo estourado é falha MOLE: a chamada demorou, o que não prova que a
      // internet caiu. Só vira offline com confirmação (ver markNetworkFailure).
      if (!opts.silent) markNetworkFailure('soft');
      reject(new NetworkTimeoutError(label, ms));
    }, ms);

    Promise.resolve(work).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // A chamada RESPONDEU — a rede chegou ao servidor e voltou. Vale mesmo
        // quando a resposta carrega um erro do Postgres: erro de dados não é
        // falta de internet. Sem esta linha, o modo offline ligava numa
        // lentidão e não desligava mais, que era o "app vive offline".
        if (!opts.silent) markNetworkSuccess();
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!opts.silent && isHardNetworkFailure(err)) markNetworkFailure('hard');
        reject(err);
      }
    );
  });
}

/**
 * Falha DURA: o navegador não conseguiu nem entregar a requisição. É conclusiva
 * — não precisa de sonda nem de segunda opinião para ligar o modo offline.
 */
export function isHardNetworkFailure(err: any): boolean {
  if (!err) return false;
  if (err.name === 'TypeError' && /fetch/i.test(String(err.message || ''))) return true;

  const msg = String(err.message || err.error_description || err.error || err);
  if (/failed to fetch|networkerror|network error|load failed|network request failed|fetch failed|err_internet|err_network|connection closed|connection refused/i.test(msg)) {
    return true;
  }

  const rawStatus = err.status ?? err.statusCode;
  if (rawStatus !== undefined && rawStatus !== null && rawStatus !== '') {
    const status = Number(rawStatus);
    if (status === 0 || status === 502 || status === 503 || status === 504) return true;
  }

  return false;
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

  // Prazo do SERVIDOR não é prazo da REDE. `57014` é o Postgres cancelando uma
  // consulta pesada e `PGRST` são erros do PostgREST: os dois chegaram até o
  // banco e voltaram, então a internet está funcionando. Classificar isso como
  // "sem rede" mandava o app inteiro para o modo offline por causa de uma
  // consulta lenta — e ainda enfileirava um lançamento que nunca passaria.
  const code = String(err.code || '');
  if (code === '57014' || code.startsWith('PGRST') || /^\d{5}$/.test(code)) {
    return isHardNetworkFailure(err);
  }

  if (isHardNetworkFailure(err)) return true;

  const msg = String(err.message || err.error_description || err.error || err);
  if (/timeout|timed out/i.test(msg)) return true;

  const rawStatus = err.status ?? err.statusCode;
  if (rawStatus !== undefined && rawStatus !== null && rawStatus !== '') {
    if (Number(rawStatus) === 408) return true;
  }

  return false;
}

/**
 * Registra que a rede falhou agora.
 *
 * @param kind 'hard' (conclusiva: o navegador não entregou a requisição) liga o
 *   modo offline na hora. 'soft' (só estourou o prazo) precisa de repetição —
 *   uma chamada lenta não é o mesmo que ficar sem internet, e tratar as duas
 *   igual era o motivo de a tarja vermelha aparecer o tempo todo.
 */
export function markNetworkFailure(kind: 'hard' | 'soft' = 'hard'): void {
  if (kind === 'soft') {
    softFailureStreak++;
    if (softFailureStreak < SOFT_FAILURES_TO_GO_OFFLINE) return;
  }
  lastFailureAt = Date.now();
  notify();
}

/** Registra que uma chamada passou — desliga o modo offline grudento. */
export function markNetworkSuccess(): void {
  const tinhaFalha = lastFailureAt !== 0 || softFailureStreak !== 0;
  softFailureStreak = 0;
  lastFailureAt = 0;
  if (tinhaFalha) notify();
}

/**
 * Pergunta à rede, de verdade, se há saída. Usada para CONFIRMAR um diagnóstico
 * de offline antes de mostrar a tarja vermelha e para sair do modo offline
 * assim que a conexão volta, sem esperar o período grudento inteiro.
 *
 * Nunca lança: devolve `false` quando não conseguiu completar.
 */
export async function probeConnectivity(timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (typeof fetch !== 'function') return true;

  const url = probeUrl();
  if (!url) return true; // sem alvo para sondar: não há como provar queda

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    await fetch(`${url}?_=${Date.now()}`, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller?.signal
    });
    markNetworkSuccess();
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `navigator.onLine === false` é conclusivo: não há rede. `true` é só um
 * palpite, então descontamos as falhas recentes.
 */
export function isProbablyOnline(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (lastFailureAt === 0) return true;
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
  // Nomeado, e não uma função anônima: a versão anterior registrava um arrow
  // inline aqui e tentava removê-lo com `handler` no cleanup. O ouvinte de
  // `online` NUNCA saía, e cada montagem de tela empilhava mais um.
  const onlineHandler = () => { markNetworkSuccess(); cb(true); };

  window.addEventListener('online', onlineHandler);
  window.addEventListener('offline', handler);
  window.addEventListener(CONNECTIVITY_EVENT, handler);
  return () => {
    window.removeEventListener('online', onlineHandler);
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
      markNetworkFailure(isHardNetworkFailure(err) ? 'hard' : 'soft');
      return { ok: false, offline: true };
    }
    throw err;
  }
}
