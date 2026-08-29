import { useEffect, useRef } from 'react';

/**
 * Recarrega a tela quando a internet volta.
 *
 * Antes, só Transações reagia à reconexão (escutando `offline-sync-completed`).
 * Nas outras telas o usuário reconectava e continuava vendo o retrato antigo do
 * cache até sair da página e voltar — parecia que o app tinha "congelado".
 *
 * São três gatilhos, e os três importam:
 *  - `online`: a reconexão clássica, quando o aparelho perde e recupera a rede;
 *  - `finvision_connectivity_changed`: a reconexão que o `navigator.onLine` não
 *    percebe (Wi-Fi sem saída, sinal fraco), detectada pelos nossos timeouts;
 *  - `offline-sync-completed`: a fila offline acabou de subir para o banco, e o
 *    que está na tela ficou desatualizado no mesmo instante.
 *
 * O disparo é engatilhado (throttle): os três eventos costumam acontecer quase
 * juntos, e sem isso a tela faria três buscas iguais em sequência.
 */
export function useReconnectRefresh(refresh: () => void, throttleMs = 3000): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    let lastRun = 0;

    const run = () => {
      const now = Date.now();
      if (now - lastRun < throttleMs) return;
      lastRun = now;
      try {
        refreshRef.current();
      } catch (e) {
        console.warn('Falha ao recarregar após reconexão:', e);
      }
    };

    const onConnectivity = (e: Event) => {
      // Só recarrega quando VOLTOU. Recarregar ao cair na rede seria pior:
      // dispararia uma busca fadada a estourar o prazo.
      const online = (e as CustomEvent)?.detail?.online;
      if (online === false) return;
      run();
    };

    window.addEventListener('online', run);
    window.addEventListener('finvision_connectivity_changed', onConnectivity);
    window.addEventListener('offline-sync-completed', run);

    return () => {
      window.removeEventListener('online', run);
      window.removeEventListener('finvision_connectivity_changed', onConnectivity);
      window.removeEventListener('offline-sync-completed', run);
    };
  }, [throttleMs]);
}
