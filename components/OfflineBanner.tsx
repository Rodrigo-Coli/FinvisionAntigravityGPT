import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, MessageCircle, X } from 'lucide-react';
import { offlineQueue } from '../lib/offlineQueue.service';

const WHATSAPP_NUMBER = '5511999999999'; // Substituir pelo número real do suporte

const OfflineBanner: React.FC = () => {
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [pendingCount, setPendingCount] = useState(0);
    const [dismissed, setDismissed] = useState(false);
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        const handleOnline = () => {
            setIsOffline(false);
            setDismissed(false);
            // Trigger sync when connection returns
            setSyncing(true);
            offlineQueue.processQueue().finally(() => {
                setSyncing(false);
                setPendingCount(offlineQueue.getQueue().length);
                window.dispatchEvent(new CustomEvent('offline-sync-completed'));
            });
        };
        const handleOffline = () => setIsOffline(true);
        const handleQueueUpdate = () => setPendingCount(offlineQueue.getQueue().length);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('finvision_offline_queue_updated', handleQueueUpdate);

        // Check pending operations
        setPendingCount(offlineQueue.getQueue().length);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('finvision_offline_queue_updated', handleQueueUpdate);
        };
    }, []);

    const openWhatsApp = () => {
        const msg = encodeURIComponent(
            `🆘 *FinVision Pro — Problema de Conexão*\n\n` +
            `Olá, estou com dificuldades para acessar meus dados no FinVision Pro.\n` +
            `Status: *${isOffline ? 'Sem internet' : 'Internet lenta / erro de sincronização'}*\n` +
            `Lançamentos pendentes: *${pendingCount}*\n` +
            `Hora: ${new Date().toLocaleString('pt-BR')}`
        );
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
    };

    if (dismissed) return null;
    if (!isOffline && pendingCount === 0 && !syncing) return null;

    return (
        <div className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 ${isOffline
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
                    ) : (
                        <p className="text-sm font-bold">
                            ⚠️ Internet restabelecida — {pendingCount} lançamento{pendingCount > 1 ? 's' : ''} aguardando envio.
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
