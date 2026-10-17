import React, { useState, useEffect, useMemo } from 'react';
import { Share, X, BookOpen, Copy } from 'lucide-react';
import { detectCurrentInstallPlatform, iosQuickPath, isRunningInstalled } from '../lib/installGuide';
import { InstallGuideModal } from './install/InstallGuideModal';

/**
 * Aviso "instale o Zyvion" no iPhone — por que ele não respondia ao toque
 * ----------------------------------------------------------------------
 * Eram dois problemas somados, e os dois davam a MESMA impressão ("aparece mas
 * não dá para clicar"):
 *
 * 1. O cartão era `fixed bottom-6`, sem descontar a área segura do iOS. Na tela
 *    de início (PWA instalado) e nos iPhones com Face ID, os ~34px de baixo são
 *    do indicador de home: o sistema captura o toque ali para o gesto de sair do
 *    app. O botão "Entendido", que fica exatamente na borda inferior do cartão,
 *    caía dentro dessa faixa e simplesmente não era clicável. Agora o cartão
 *    sobe `env(safe-area-inset-bottom)` — e um pouco mais quando existe a barra
 *    de navegação inferior do app, para não ficar um em cima do outro.
 *
 * 2. Os botões tinham `onClick` E `onTouchStart` com o mesmo handler. No iOS o
 *    `touchstart` dispara primeiro, o componente some na mesma hora, e o clique
 *    sintetizado logo depois vai parar no que estiver EMBAIXO — fechando o aviso
 *    e disparando outra coisa junto ("clique fantasma"). Ficou só o `onClick`,
 *    com `touch-action: manipulation` para o navegador não esperar os 300ms do
 *    duplo toque.
 *
 * (O motivo principal de a tela inteira não responder ao toque no iPhone não
 * estava aqui: era o depurador de erros no index.html que reescrevia o
 * document.body.innerHTML e derrubava a árvore do React. Veja o comentário lá.)
 *
 * 3. "Aparece para instalar, mas não acontece nada ao tocar": no iPhone NENHUM
 *    botão de site instala o app (não existe o `beforeinstallprompt` do
 *    Android) — só o menu do próprio navegador. O cartão mandava "tocar em
 *    Compartilhar", que no iOS 26 sumiu da barra do Safari (foi para o menu
 *    "•••"), não existe dentro do Instagram/Facebook/Gmail e fica em outro
 *    lugar no Chrome do iPhone. Agora o cartão mostra o caminho do navegador
 *    em uso e o botão principal abre o passo a passo completo
 *    (lib/installGuide.ts). Só o iPhone/iPad passa por aqui: Android e
 *    computador seguem com o PWAInstallPrompt, intocado.
 */
export const IOSInstallPrompt: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const platform = useMemo(() => detectCurrentInstallPlatform(), []);
  const quickPath = iosQuickPath(platform);
  const isInApp = platform.browser === 'inapp';

  useEffect(() => {
    // Só iPhone/iPad (inclusive o iPadOS que se apresenta como Mac), fora do
    // app instalado e uma vez por sessão.
    const hasPrompted = sessionStorage.getItem('ios-prompt-shown');

    if (platform.os === 'ios' && !isRunningInstalled() && !hasPrompted) {
      // Delay slightly to not annoy immediately
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [platform]);

  const handleClose = () => {
    setShowPrompt(false);
    sessionStorage.setItem('ios-prompt-shown', 'true');
  };

  const openGuide = () => {
    handleClose();
    setShowGuide(true);
  };

  if (showGuide) {
    return <InstallGuideModal open onClose={() => setShowGuide(false)} platform={platform} />;
  }

  if (!showPrompt) return null;

  return (
    <div
      className="fixed left-4 right-4 z-[9999] animate-in fade-in slide-in-from-bottom-10 duration-500 sm:left-auto sm:w-96"
      // Acima do indicador de home do iPhone e da barra inferior do app: dentro
      // dessas faixas o toque é do sistema/da barra, não do cartão.
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-indigo-100 dark:border-slate-800 p-5 relative overflow-hidden">
        {/* Background Accent */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-600" />

        <button
          type="button"
          onClick={handleClose}
          style={{ touchAction: 'manipulation' }}
          // Área de toque de 44px (o mínimo recomendado pela Apple): o ícone
          // sozinho tem 20px e, num cartão colado na borda, errar o alvo parecia
          // "o botão não funciona".
          className="absolute top-1 right-1 w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
          aria-label="Fechar"
        >
          <X size={20} />
        </button>

        <div className="flex items-start gap-4 pr-6">
          <div className="w-12 h-12 rounded-xl bg-brand-900 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-200 dark:shadow-none overflow-hidden">
            <img src="/logo.png" alt="Zyvion" className="w-9 h-9 object-contain" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 dark:text-white text-lg leading-tight mb-1">
              {isInApp ? 'Abra no Safari para instalar' : `Instalar Zyvion no ${platform.isIPad ? 'iPad' : 'iPhone'}`}
            </h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-snug">
              {isInApp
                ? quickPath
                : 'No iPhone, o app é instalado pelo menu do navegador — não por um botão do site. Leva 10 segundos:'}
            </p>
          </div>
        </div>

        {!isInApp && quickPath && (
          <div className="mt-3 flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-700">
            <div className="w-8 h-8 shrink-0 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center shadow-sm">
              <Share size={16} className="text-indigo-600" />
            </div>
            <span className="leading-snug">{quickPath}</span>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={openGuide}
            style={{ touchAction: 'manipulation' }}
            className="flex-1 min-h-[44px] py-2.5 bg-brand-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            {isInApp ? <Copy size={16} /> : <BookOpen size={16} />}
            {isInApp ? 'Como abrir no Safari' : 'Ver passo a passo'}
          </button>
          <button
            type="button"
            onClick={handleClose}
            style={{ touchAction: 'manipulation' }}
            className="min-h-[44px] px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-medium text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
};
