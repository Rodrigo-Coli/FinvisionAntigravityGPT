import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

declare global {
  interface Window {
    __pwaInstallPrompt: any;
  }
}

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem('pwa-prompt-dismissed') === 'true'
  );

  useEffect(() => {
    // Já está instalado como standalone — não mostrar
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (dismissed) return;

    // 1. Verificar se o evento já foi capturado antes do React montar
    if (window.__pwaInstallPrompt) {
      setDeferredPrompt(window.__pwaInstallPrompt);
      setShowPrompt(true);
    }

    // 2. Escutar evento futuro
    const handler = (e: any) => {
      e.preventDefault();
      window.__pwaInstallPrompt = e;
      setDeferredPrompt(e);
      setShowPrompt(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // 3. Escutar o evento customizado disparado pelo index.html
    const customHandler = () => {
      if (window.__pwaInstallPrompt && !dismissed) {
        setDeferredPrompt(window.__pwaInstallPrompt);
        setShowPrompt(true);
      }
    };
    window.addEventListener('pwa-installable', customHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('pwa-installable', customHandler);
    };
  }, [dismissed]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('[PWA] Install outcome:', outcome);
    window.__pwaInstallPrompt = null;
    setDeferredPrompt(null);
    setShowPrompt(false);
    if (outcome === 'accepted') {
      localStorage.setItem('pwa-prompt-dismissed', 'true');
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setDismissed(true);
    localStorage.setItem('pwa-prompt-dismissed', 'true');
  };

  if (!showPrompt || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 z-[200] lg:left-auto lg:right-6 lg:w-96 animate-in slide-in-from-bottom-10 duration-500">
      <div className="bg-white rounded-3xl shadow-2xl border border-brand-100 overflow-hidden">
        {/* Header colorido */}
        <div className="bg-gradient-to-r from-brand-600 to-brand-900 p-5 flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center border border-white/30 shrink-0">
            <img src="/logo.png" alt="FinVision" className="w-10 h-10 object-contain rounded-xl" />
          </div>
          <div className="text-white">
            <h4 className="font-black text-base tracking-tight">Instalar FinVision Pro</h4>
            <p className="text-brand-200 text-xs font-medium mt-0.5">Adicione à sua tela inicial como app</p>
          </div>
        </div>

        {/* Benefícios */}
        <div className="p-4 space-y-2">
          {[
            '⚡ Acesso instantâneo sem abrir o navegador',
            '🔔 Receba notificações de vencimentos',
            '📶 Funciona mesmo sem internet',
          ].map((benefit, i) => (
            <div key={i} className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <span>{benefit}</span>
            </div>
          ))}
        </div>

        {/* Botões */}
        <div className="px-4 pb-4 flex gap-3">
          <button
            onClick={handleInstall}
            className="flex-1 py-3 bg-brand-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-brand-700 transition-all shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2"
          >
            <Download size={14} />
            Instalar Agora
          </button>
          <button
            onClick={handleDismiss}
            className="w-12 h-12 flex items-center justify-center bg-slate-100 text-slate-400 rounded-2xl hover:bg-slate-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
