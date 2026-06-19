import React, { useState, useEffect } from 'react';
import { Share, X } from 'lucide-react';

export const IOSInstallPrompt: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if it's iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    
    // Check if it's NOT already in standalone mode (installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;

    // Check if we already showed it this session
    const hasPrompted = sessionStorage.getItem('ios-prompt-shown');

    if (isIOS && !isStandalone && !hasPrompted) {
      // Delay slightly to not annoy immediately
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    setShowPrompt(false);
    sessionStorage.setItem('ios-prompt-shown', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-6 left-4 right-4 z-[9999] animate-in fade-in slide-in-from-bottom-10 duration-500">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-indigo-100 dark:border-slate-800 p-5 relative overflow-hidden">
        {/* Background Accent */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-600" />
        
        <button 
          onClick={handleClose}
          onTouchStart={handleClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
          aria-label="Fechar"
        >
          <X size={20} />
        </button>

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-900 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-200 dark:shadow-none font-bold italic text-white text-2xl">
            FV
          </div>
          
          <div className="flex-1">
            <h3 className="font-bold text-slate-900 dark:text-white text-lg leading-tight mb-1">
              Instalar FinVision Pro
            </h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-snug mb-4">
              Tenha a experiência completa de aplicativo instalando o FinVision na sua tela de início.
            </p>
            
            <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center shadow-sm">
                  <Share size={16} className="text-indigo-600" />
                </div>
                <span>Toque no botão <strong>Compartilhar</strong></span>
              </div>
              
              <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center shadow-sm">
                  <div className="w-5 h-5 border-2 border-dashed border-slate-400 rounded-sm flex items-center justify-center text-[10px] font-bold text-slate-500">+</div>
                </div>
                <span>Selecione <strong>Adicionar à Tela de Início</strong></span>
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={handleClose}
          onTouchStart={handleClose}
          className="w-full mt-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-medium text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
        >
          Entendido
        </button>
      </div>
    </div>
  );
};
