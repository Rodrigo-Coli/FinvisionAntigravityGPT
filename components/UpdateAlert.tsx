import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, X, Sparkles } from 'lucide-react';

// How often to check for updates (in milliseconds)
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const VERSION_URL = '/version.json';

export const UpdateAlert: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const fetchVersion = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.version ?? null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    // Get initial version on mount
    fetchVersion().then(v => {
      if (v) setCurrentVersion(v);
    });
  }, [fetchVersion]);

  useEffect(() => {
    if (!currentVersion) return;

    const check = async () => {
      if (dismissed) return;
      const latestVersion = await fetchVersion();
      if (latestVersion && latestVersion !== currentVersion) {
        setShowBanner(true);
      }
    };

    const interval = setInterval(check, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [currentVersion, dismissed, fetchVersion]);

  if (!showBanner || dismissed) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] p-3 sm:p-4 animate-in slide-in-from-bottom-4 duration-500"
      role="alert"
      aria-live="polite"
    >
      <div className="max-w-lg mx-auto bg-brand-900 text-white rounded-2xl shadow-2xl shadow-brand-900/30 p-4 flex items-center gap-4 border border-brand-700">
        {/* Icon */}
        <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center shrink-0">
          <Sparkles size={18} className="text-white" />
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight">Nova versão disponível!</p>
          <p className="text-xs text-brand-300 mt-0.5 leading-relaxed">
            O FinVision Pro foi atualizado. Recarregue para aplicar as melhorias.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 px-4 py-2 bg-white text-brand-900 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-brand-50 transition-colors active:scale-95"
            aria-label="Recarregar aplicativo"
          >
            <RefreshCw size={13} />
            Atualizar
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-2 text-brand-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
            aria-label="Dispensar alerta de atualização"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateAlert;
