import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { WifiOff, RefreshCw, MessageCircle, X } from 'lucide-react';
import { offlineQueue } from '../lib/offlineQueue.service';
import { isProbablyOnline, onConnectivityChange } from '../lib/connectivity';

const WHATSAPP_NUMBER = '5511999999999'; // Substituir pelo número real do suporte

/** De quanto em quanto tempo tentamos esvaziar a fila enquanto houver pendência. */
const RETRY_INTERVAL_MS = 30000;

const OfflineBanner: React.FC = () => {
    const [isOffline, setIsOffline] = useState(!isProbablyOnline());
    const [pendingCount, setPendingCount] = useState(0);
    const [failedCount, setFailedCount] = useState(0);
    const [dismissed, setDismissed] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const barRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let alive = true;

        const refreshCounts = () => {
            if (!alive) return;
            setPendingCount(offlineQueue.getPendingCount());
            setFailedCount(offlineQueue.getFailed().length);
        };

        const trySync = async () => {
            if (!alive || !isProbablyOnline() || offlineQueue.getPendingCount() === 0) {
                refreshCounts();
                return;
            }
            setSyncing(true);
            try {
                await offlineQueue.processQueue();
            } finally {
                if (alive) {
                    setSyncing(false);
                    refreshCounts();
                }
            }
        };

        // 1. Ao abrir o app. A versão anterior só sincronizava no evento `online`
        //    do navegador — quem fechasse o app offline e reabrisse já conectado
        //    ficava com a fila parada até a conexão cair e voltar de novo.
        trySync();

        // 2. Retentativa periódica: em conexão instável o evento `online` não
        //    dispara, mas a rede volta. Sem isso a fila só andava por sorte.
        const timer = setInterval(trySync, RETRY_INTERVAL_MS);

        // 3. Mudanças de conectividade, incluindo as detectadas por timeout
        //    (`navigator.onLine` sozinho não percebe "Wi-Fi sem internet").
        const unsubscribe = onConnectivityChange((online) => {
            if (!alive) return;
            setIsOffline(!online);
            if (online) {
                setDismissed(false);
                trySync();
            }
        });

        window.addEventListener('finvision_offline_queue_updated', refreshCounts);
        window.addEventListener('offline-queue-updated', refreshCounts);
        refreshCounts();

        return () => {
            alive = false;
            clearInterval(timer);
            unsubscribe();
            window.removeEventListener('finvision_offline_queue_updated', refreshCounts);
            window.removeEventListener('offline-queue-updated', refreshCounts);
        };
    }, []);

    // O aviso é `fixed top-0`, igual ao cabeçalho do celular — sem reservar
    // espaço para ele, o cabeçalho (e o botão do menu) ficava escondido atrás.
    // Publicamos a altura real numa variável de CSS e o layout desce na medida
    // exata. Medimos em vez de fixar um valor porque o texto quebra em duas
    // linhas em telas estreitas.
    const visible = !dismissed && (isOffline || pendingCount > 0 || failedCount > 0 || syncing);

    // useLayoutEffect e não useEffect: a medição precisa acontecer ANTES da
    // pintura, senão existe um quadro em que o aviso já apareceu mas o layout
    // ainda não desceu — e o cabeçalho pisca por baixo dele.
    useLayoutEffect(() => {
        const root = document.documentElement;

        if (!visible) {
            root.style.setProperty('--offline-banner-h', '0px');
            return;
        }

        const publish = () => {
            const h = barRef.current?.offsetHeight ?? 0;
            root.style.setProperty('--offline-banner-h', `${h}px`);
        };

        publish();

        // A altura muda quando o texto passa a ocupar duas linhas (rotação de
        // tela, contagem da fila crescendo).
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : null;
        if (observer && barRef.current) observer.observe(barRef.current);
        window.addEventListener('resize', publish);

        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', publish);
            // Ao desmontar/esconder, devolve o espaço ao layout.
            root.style.setProperty('--offline-banner-h', '0px');
        };
    }, [visible, isOffline, pendingCount, failedCount, syncing]);

    const openWhatsApp = () => {
        const msg = encodeURIComponent(
            `🆘 *Zyvion — Problema de Conexão*\n\n` +
            `Olá, estou com dificuldades para acessar meus dados no Zyvion.\n` +
            `Status: *${isOffline ? 'Sem internet' : 'Internet lenta / erro de sincronização'}*\n` +
            `Lançamentos pendentes: *${pendingCount}*\n` +
            `Lançamentos com falha: *${failedCount}*\n` +
            `Hora: ${new Date().toLocaleString('pt-BR')}`
        );
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
    };

    if (!visible) return null;

    return (
        <div ref={barRef} className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 ${isOffline
            ? 'bg-rose-600 text-white'
            : 'bg-amber-500 text-white'
            }`}>
            <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center gap-3">
                <WifiOff size={18} className="shrink-0" />

                <div className="flex-1 min-w-0">
                    {isOffline ? (
                        <p className="text-sm font-bold">
                            📡 Offline — as alterações serão salvas localmente e enviadas depois.
                            {pendingCount > 0 && (
                                <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-full text-xs">
                                    {pendingCount} item{pendingCount > 1 ? 's' : ''} na fila
                                </span>
                            )}
                        </p>
                    ) : syncing ? (
                        <p className="text-sm font-bold flex items-center gap-2 animate-pulse">
                            <RefreshCw size={14} className="animate-spin" />
                            Sincronizando {pendingCount} lançamento{pendingCount > 1 ? 's' : ''} com a nuvem...
                        </p>
                    ) : pendingCount > 0 ? (
                        <p className="text-sm font-bold">
                            ⚠️ Internet restabelecida — {pendingCount} lançamento{pendingCount > 1 ? 's' : ''} aguardando envio.
                        </p>
                    ) : (
                        <p className="text-sm font-bold">
                            ⚠️ {failedCount} lançamento{failedCount > 1 ? 's' : ''} não {failedCount > 1 ? 'puderam' : 'pôde'} ser enviado{failedCount > 1 ? 's' : ''}. Fale com o suporte para recuperá-{failedCount > 1 ? 'los' : 'lo'}.
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {!isOffline && pendingCount > 0 && !syncing && (
                        <button
                            onClick={() => {
                                setSyncing(true);
                                offlineQueue.processQueue().finally(() => setSyncing(false));
                            }}
                            className="flex items-center gap-1.5 bg-white text-amber-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-white/90 transition-colors shadow-sm"
                        >
                            <RefreshCw size={14} />
                            Sincronizar Agora
                        </button>
                    )}
                    <button
                        onClick={openWhatsApp}
                        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                    >
                        <MessageCircle size={14} />
                        Suporte
                    </button>
                    {!isOffline && (
                        <button
                            onClick={() => setDismissed(true)}
                            className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OfflineBanner;
