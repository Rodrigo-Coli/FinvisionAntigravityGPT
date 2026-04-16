import React, { useEffect, useState } from 'react';
import { RefreshCw, X, Sparkles } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export const UpdateAlert: React.FC = () => {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const [dismissed, setDismissed] = useState(false);

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
    setDismissed(false);
  };

  useEffect(() => {
    if (needRefresh) {
      console.log('UpdateAlert: New content available, showing banner');
      setDismissed(false);
    }
  }, [needRefresh]);

  if ((!needRefresh && !offlineReady) || dismissed) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] p-3 sm:p-4 animate-in slide-in-from-bottom-4 duration-500"
      role="alert"
      aria-live="polite"
    >
      <div className="max-w-lg mx-auto bg-brand-600 text-white rounded-2xl shadow-2xl shadow-brand-600/30 p-4 flex items-center gap-4 border border-brand-500">
        {/* Icon */}
        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
          <Sparkles size={18} className="text-white" />
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight">
            {needRefresh ? 'Nova versão disponível!' : 'App pronto para uso offline!'}
          </p>
          <p className="text-xs text-brand-300 mt-0.5 leading-relaxed">
            {needRefresh 
              ? 'O FinVision Pro foi atualizado. Recarregue para aplicar as melhorias.' 
              : 'O FinVision Pro foi salvo no seu dispositivo para acesso rápido.'}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {needRefresh && (
            <button
              onClick={() => updateServiceWorker(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-white text-brand-900 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-brand-50 transition-colors active:scale-95"
              aria-label="Recarregar aplicativo"
            >
              <RefreshCw size={13} />
              Atualizar
            </button>
          )}
          <button
            onClick={() => {
                if (needRefresh) setDismissed(true);
                else close();
            }}
            className="p-2 text-brand-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
            aria-label="Dispensar alerta"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateAlert;
