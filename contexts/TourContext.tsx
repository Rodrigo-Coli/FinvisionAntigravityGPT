import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { X, Sparkles, MessageCircle } from 'lucide-react';

interface TourContextType {
  run: boolean;
  startTour: () => void;
  stopTour: () => void;
}

const TourContext = createContext<TourContextType | undefined>(undefined);

export const useTour = () => {
  const context = useContext(TourContext);
  if (!context) throw new Error('useTour must be used within a TourProvider');
  return context;
};

export const TourProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [run, setRun] = useState(false);

  useEffect(() => {
    // Tour automático removido a pedido do usuário. 
    // O contexto permanece caso queira disparar manualmente via botão no futuro.
  }, []);

  const startTour = () => setRun(true);

  const stopTour = () => {
    setRun(false);
    localStorage.setItem('finvision_tour_completed', 'true');
  };

  return (
    <TourContext.Provider value={{ run, startTour, stopTour }}>
      {children}

      {run && (
        <div
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 sm:p-0"
          onClick={stopTour}
        >
          {/* Backdrop sutil */}
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" />

          {/* Card */}
          <div
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-sm bg-white rounded-[28px] shadow-2xl shadow-slate-900/20 overflow-hidden animate-in slide-in-from-bottom-4 duration-500"
          >
            {/* Gradiente decorativo no topo */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-400 via-violet-500 to-brand-600" />

            {/* Fechar */}
            <button
              onClick={stopTour}
              className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-all"
            >
              <X size={14} />
            </button>

            <div className="p-8 pt-9 space-y-5">
              {/* Ícone animado */}
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-lg shadow-brand-300/40">
                <Sparkles size={26} className="text-white" />
              </div>

              {/* Texto principal */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-brand-500 uppercase tracking-[0.3em]">
                  Zyvion
                </p>
                <h2 className="text-xl font-bold text-slate-900 leading-snug">
                  Seu dinheiro.<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-violet-600">
                    Sua inteligência.
                  </span>
                </h2>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Tudo que você precisa saber está na base de conhecimento da IA.
                  Qualquer dúvida, basta perguntar ao agente — ele está aqui para você.
                </p>
              </div>

              {/* CTA */}
              <button
                onClick={stopTour}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 bg-slate-900 text-white rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-brand-700 transition-all shadow-lg active:scale-[0.98]"
              >
                <MessageCircle size={15} />
                Perfeito, vamos lá!
              </button>
            </div>
          </div>
        </div>
      )}
    </TourContext.Provider>
  );
};
