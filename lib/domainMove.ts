/**
 * Endereço oficial do app: zyvion.automanow.com.br.
 *
 * O endereço antigo (finvision.automanow.com.br) abre o mesmo app, mas para o
 * navegador é OUTRO site: login, modo offline, fila de lançamentos offline e
 * rascunhos ficam separados por endereço. Por isso a troca é feita aqui, no
 * app, e não no servidor:
 * - o servidor continua respondendo /api, sw.js e os arquivos no endereço
 *   antigo (webhooks e a atualização do app instalado não quebram);
 * - no navegador, quem abre o endereço antigo vai para o novo, na mesma tela;
 * - no app instalado (tela de início) e com lançamentos esperando envio, não
 *   há redirecionamento automático: aparece um aviso (sair dali perderia a
 *   fila offline, que só existe neste endereço).
 */

export const OFFICIAL_ORIGIN = 'https://zyvion.automanow.com.br';
export const OLD_HOSTS = ['finvision.automanow.com.br'];

export const isOldHost = (hostname: string): boolean => OLD_HOSTS.includes(String(hostname || '').toLowerCase());

/** Mesma tela no endereço novo (caminho, ?parâmetros e #rota). */
export function officialUrlFor(loc: { pathname: string; search: string; hash: string }): string {
  return `${OFFICIAL_ORIGIN}${loc.pathname || '/'}${loc.search || ''}${loc.hash || ''}`;
}

export function shouldAutoRedirect(opts: { hostname: string; standalone: boolean; online: boolean; pendingOffline: number }): boolean {
  return isOldHost(opts.hostname) && !opts.standalone && opts.online && opts.pendingOffline === 0;
}

export const isStandaloneApp = (): boolean => {
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  } catch { return false; }
};

/** Lançamentos feitos sem internet ainda não enviados (fila e falhas), lidos sem carregar o serviço. */
export function pendingOfflineCount(): number {
  try {
    const q = JSON.parse(localStorage.getItem('finvision_offline_queue') || '[]');
    const f = JSON.parse(localStorage.getItem('finvision_offline_failed') || '[]');
    return (Array.isArray(q) ? q.length : 0) + (Array.isArray(f) ? f.length : 0);
  } catch { return 0; }
}

/** Redireciona agora, se for o caso. Devolve true quando saiu da página. */
export function redirectToOfficialIfNeeded(): boolean {
  if (typeof window === 'undefined') return false;
  const go = shouldAutoRedirect({
    hostname: window.location.hostname,
    standalone: isStandaloneApp(),
    online: navigator.onLine !== false,
    pendingOffline: pendingOfflineCount()
  });
  if (go) window.location.replace(officialUrlFor(window.location));
  return go;
}
