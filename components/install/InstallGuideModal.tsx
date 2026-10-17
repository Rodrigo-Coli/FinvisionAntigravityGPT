import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { InstallGuide } from './InstallGuide';
import { InstallPlatform } from '../../lib/installGuide';

interface InstallGuideModalProps {
  open: boolean;
  onClose: () => void;
  platform?: InstallPlatform;
}

/**
 * Passo a passo em tela cheia (folha que sobe de baixo no celular). Vai num
 * portal no <body>: assim nenhum ancestral com transform/overflow prende o
 * `position: fixed` — no Safari do iPhone isso deixava o modal fora da tela.
 */
export const InstallGuideModal: React.FC<InstallGuideModalProps> = ({ open, onClose, platform }) => {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Como instalar o Zyvion">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-[28px] sm:rounded-[28px] shadow-2xl max-h-[90vh] overflow-y-auto overscroll-contain p-5"
        // Folha encostada embaixo: o conteúdo não pode cair na faixa do
        // indicador de home do iPhone (lá o toque é do sistema).
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Como instalar o Zyvion</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Escolha seu aparelho e seu navegador.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ touchAction: 'manipulation' }}
            className="w-11 h-11 -mr-2 -mt-2 shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>
        <InstallGuide platform={platform} />
      </div>
    </div>,
    document.body
  );
};

export default InstallGuideModal;
