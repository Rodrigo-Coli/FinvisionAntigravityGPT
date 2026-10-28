import React, { useEffect, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { isOldHost, officialUrlFor, pendingOfflineCount, OFFICIAL_ORIGIN } from '../lib/domainMove';

/**
 * Aviso no endereço antigo (app instalado, ou com lançamentos offline
 * pendentes): o Zyvion agora fica em zyvion.automanow.com.br. Não bloqueia o
 * uso — sem internet, este app antigo continua funcionando.
 */
const DISMISS_KEY = 'zyvion_domain_move_dismissed';

const DomainMoveBanner: React.FC = () => {
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined' || !isOldHost(window.location.hostname)) return false;
    try { return sessionStorage.getItem(DISMISS_KEY) !== '1'; } catch { return true; }
  });
  const [pending, setPending] = useState(() => pendingOfflineCount());

  useEffect(() => {
    if (!visible) return;
    const refresh = () => setPending(pendingOfflineCount());
    window.addEventListener('finvision_offline_queue_updated', refresh);
    return () => window.removeEventListener('finvision_offline_queue_updated', refresh);
  }, [visible]);

  if (!visible) return null;
  const close = () => {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* segue */ }
    setVisible(false);
  };
  const newHost = OFFICIAL_ORIGIN.replace('https://', '');

  return (
    <div role="status" className="fixed top-2 left-2 right-2 sm:left-auto sm:max-w-md z-[9998] p-3 rounded-2xl bg-amber-50 border border-amber-200 shadow-xl text-amber-950">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 text-[11px] leading-relaxed">
          <p className="font-black text-xs">O Zyvion mudou de endereço: {newHost}</p>
          {pending > 0
            ? <p className="mt-0.5">Você tem <strong>{pending}</strong> lançamento(s) feitos sem internet esperando envio. Deixe este app aberto com internet até eles irem — depois troque de endereço.</p>
            : <p className="mt-0.5">Abra o novo endereço, entre com sua senha e instale o app por lá (Adicionar à tela de início). Depois pode remover este app antigo. Seus dados são os mesmos.</p>}
          {pending === 0 && (
            <a href={officialUrlFor(window.location)} target="_blank" rel="noopener"
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 text-white font-black text-[11px]">
              <ExternalLink size={12} />Abrir o novo endereço
            </a>
          )}
        </div>
        <button type="button" onClick={close} aria-label="Fechar aviso" className="p-1 text-amber-700 hover:text-amber-950"><X size={14} /></button>
      </div>
    </div>
  );
};

export default DomainMoveBanner;
