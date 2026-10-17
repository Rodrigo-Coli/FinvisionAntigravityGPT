/**
 * "Como instalar o Zyvion" — detecção do aparelho/navegador e o passo a passo
 * de cada combinação.
 *
 * Por que isto existe: no Android/Chrome o navegador entrega um evento
 * (`beforeinstallprompt`) e o botão "Instalar Agora" do app abre a instalação
 * de verdade. No iPhone esse evento NÃO existe — nenhum botão de site consegue
 * instalar nada; só o próprio navegador, pelo menu dele. O aviso do iPhone
 * mandava "tocar em Compartilhar", mas:
 *   - no iOS 26 o Safari escondeu o Compartilhar dentro do menu "•••";
 *   - dentro do Instagram, Facebook, Gmail etc. (navegador embutido) não há
 *     "Adicionar à Tela de Início" em lugar nenhum;
 *   - no Chrome/Edge/Firefox do iPhone o caminho é outro.
 * Resultado: o usuário tocava no aviso e "não acontecia nada". Aqui fica o
 * caminho certo para cada caso, e o mesmo conteúdo alimenta o tutorial geral.
 *
 * Tudo puro (recebe o user agent): dá para testar sem navegador.
 */

export type InstallOS = 'ios' | 'android' | 'desktop';
export type InstallBrowser = 'safari' | 'chrome' | 'edge' | 'firefox' | 'samsung' | 'inapp' | 'other';

export interface InstallPlatform {
  os: InstallOS;
  browser: InstallBrowser;
  /** iPad (inclusive o iPadOS que se apresenta como Mac). */
  isIPad: boolean;
  /** Mac (Safari no Mac instala via "Adicionar ao Dock"). */
  isMac: boolean;
  /** Versão principal do Safari (`Version/26.0` → 26), quando der para saber. */
  safariMajor: number | null;
  /** Nome do app quando é navegador embutido (Instagram, Facebook...). */
  inAppName: string | null;
}

export interface DetectInput {
  userAgent: string;
  /** `navigator.platform` — o iPadOS se apresenta como "MacIntel". */
  platform?: string;
  /** `navigator.maxTouchPoints` — distingue iPad (toque) de Mac. */
  maxTouchPoints?: number;
}

const IN_APP_PATTERNS: [RegExp, string][] = [
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, 'Facebook'],
  [/LinkedInApp/i, 'LinkedIn'],
  [/Twitter/i, 'X (Twitter)'],
  [/musical_ly|TikTok|BytedanceWebview/i, 'TikTok'],
  [/Snapchat/i, 'Snapchat'],
  [/Pinterest/i, 'Pinterest'],
  [/\bLine\//i, 'Line'],
  [/GSA\//i, 'app do Google'],
  [/WhatsApp/i, 'WhatsApp'],
  [/Telegram/i, 'Telegram']
];

export const detectInstallPlatform = (input: DetectInput): InstallPlatform => {
  const ua = input.userAgent || '';
  const touch = Number(input.maxTouchPoints || 0);
  const isIPadOSAsMac = input.platform === 'MacIntel' && touch > 1;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || isIPadOSAsMac;
  const isIPad = /iPad/.test(ua) || isIPadOSAsMac;
  const isAndroid = /Android/i.test(ua);
  const isMac = !isIOS && /Macintosh|Mac OS X/.test(ua);

  const inApp = IN_APP_PATTERNS.find(([re]) => re.test(ua));
  const versionMatch = ua.match(/Version\/(\d+)/);
  const safariMajor = versionMatch ? Number(versionMatch[1]) : null;

  if (isIOS) {
    let browser: InstallBrowser;
    if (inApp) browser = 'inapp';
    else if (/CriOS/.test(ua)) browser = 'chrome';
    else if (/EdgiOS/.test(ua)) browser = 'edge';
    else if (/FxiOS/.test(ua)) browser = 'firefox';
    else if (/OPiOS|OPT\/|YaBrowser|DuckDuckGo/.test(ua)) browser = 'other';
    // Navegador embutido sem nome conhecido: o WKWebView dos apps não traz o
    // token "Safari/" que o Safari (e os outros navegadores) trazem.
    else if (!/Safari\//.test(ua)) browser = 'inapp';
    else browser = 'safari';
    return { os: 'ios', browser, isIPad, isMac: false, safariMajor, inAppName: inApp ? inApp[1] : null };
  }

  if (isAndroid) {
    let browser: InstallBrowser;
    if (inApp || /; wv\)/.test(ua)) browser = 'inapp';
    else if (/SamsungBrowser/.test(ua)) browser = 'samsung';
    else if (/EdgA/.test(ua)) browser = 'edge';
    else if (/Firefox/.test(ua)) browser = 'firefox';
    else if (/OPR\/|Opera|YaBrowser|UCBrowser|MiuiBrowser|HuaweiBrowser/.test(ua)) browser = 'other';
    else if (/Chrome\//.test(ua)) browser = 'chrome';
    else browser = 'other';
    return { os: 'android', browser, isIPad: false, isMac: false, safariMajor: null, inAppName: inApp ? inApp[1] : null };
  }

  let browser: InstallBrowser;
  if (/Edg\//.test(ua)) browser = 'edge';
  else if (/Firefox/.test(ua)) browser = 'firefox';
  else if (/OPR\//.test(ua)) browser = 'other';
  else if (/Chrome\//.test(ua)) browser = 'chrome';
  else if (/Safari\//.test(ua)) browser = 'safari';
  else browser = 'other';
  return { os: 'desktop', browser, isIPad: false, isMac, safariMajor, inAppName: null };
};

/** Detecção no aparelho atual (com proteção para SSR/teste). */
export const detectCurrentInstallPlatform = (): InstallPlatform => {
  if (typeof navigator === 'undefined') {
    return { os: 'desktop', browser: 'other', isIPad: false, isMac: false, safariMajor: null, inAppName: null };
  }
  return detectInstallPlatform({
    userAgent: navigator.userAgent,
    platform: (navigator as any).platform,
    maxTouchPoints: (navigator as any).maxTouchPoints
  });
};

/** O app já está aberto instalado (tela de início / janela própria). */
export const isRunningInstalled = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Passo a passo
// ---------------------------------------------------------------------------

export interface InstallGuide {
  /** Chave estável (aba do tutorial). */
  id: string;
  os: InstallOS;
  /** Rótulo da aba do navegador. */
  label: string;
  steps: string[];
  /** Observação curta (quando o caminho pode variar ou não é possível instalar). */
  note?: string;
  /** Neste navegador não dá para instalar: o caminho é abrir em outro. */
  cannotInstall?: boolean;
}

/** Safari 26 (iOS 26) escondeu o Compartilhar dentro do menu "•••". */
const IOS_SAFARI_26_STEPS = [
  'Toque no botão "•••" na barra do Safari, ao lado do endereço do site.',
  'Toque em "Compartilhar".',
  'Toque em "Adicionar à Tela de Início" (se não aparecer, toque em "Ver mais" e role a lista).',
  'Deixe "Abrir como App Web" ligado e toque em "Adicionar".'
];

const IOS_SAFARI_CLASSIC_STEPS = [
  'Toque no ícone Compartilhar (o quadrado com a seta para cima) na barra do Safari — embaixo no iPhone, em cima no iPad.',
  'Role a lista e toque em "Adicionar à Tela de Início".',
  'Toque em "Adicionar", no canto superior direito.'
];

export const INSTALL_GUIDES: InstallGuide[] = [
  {
    id: 'ios-safari',
    os: 'ios',
    label: 'Safari',
    steps: IOS_SAFARI_26_STEPS,
    note: 'Em iPhones com iOS 18 ou anterior, o ícone Compartilhar (quadrado com seta) fica direto na barra do Safari: toque nele e depois em "Adicionar à Tela de Início".'
  },
  {
    id: 'ios-chrome',
    os: 'ios',
    label: 'Chrome',
    steps: [
      'Toque no ícone Compartilhar (quadrado com a seta para cima) ao lado da barra de endereço — ou no menu "•••" e depois em "Compartilhar".',
      'Toque em "Adicionar à Tela de Início" (role a lista se precisar).',
      'Toque em "Adicionar".'
    ],
    note: 'Precisa do iOS 16.4 ou mais novo. Se a opção não aparecer, abra o site no Safari e instale por lá.'
  },
  {
    id: 'ios-other',
    os: 'ios',
    label: 'Edge, Firefox e outros',
    steps: [
      'Abra o menu do navegador (ícone "•••" ou "☰").',
      'Toque em "Compartilhar".',
      'Toque em "Adicionar à Tela de Início" e depois em "Adicionar".'
    ],
    note: 'Se a opção não aparecer, abra o site no Safari e instale por lá — no iPhone é o caminho que sempre funciona.'
  },
  {
    id: 'ios-inapp',
    os: 'ios',
    label: 'Dentro de outro app',
    cannotInstall: true,
    steps: [
      'Dentro do Instagram, Facebook, WhatsApp, Gmail e similares não é possível instalar.',
      'Toque no menu do app ("•••" ou o ícone de bússola) e escolha "Abrir no Safari" / "Abrir no navegador" — ou copie o link e cole no Safari.',
      'Já no Safari, siga o passo a passo da aba "Safari".'
    ]
  },
  {
    id: 'android-chrome',
    os: 'android',
    label: 'Chrome',
    steps: [
      'Se aparecer o aviso "Instalar Zyvion" no app, toque em "Instalar Agora".',
      'Ou toque no menu "⋮" (canto superior direito) e em "Instalar app" (às vezes aparece como "Adicionar à tela inicial").',
      'Confirme em "Instalar".'
    ]
  },
  {
    id: 'android-samsung',
    os: 'android',
    label: 'Samsung Internet',
    steps: [
      'Se aparecer o aviso "Instalar Zyvion" no app, toque em "Instalar Agora".',
      'Ou toque no ícone de instalação na barra de endereço, ou no menu "☰" (embaixo) → "Adicionar página a" → "Tela inicial".',
      'Confirme em "Adicionar".'
    ]
  },
  {
    id: 'android-other',
    os: 'android',
    label: 'Firefox, Edge e outros',
    steps: [
      'Abra o menu do navegador ("⋮" ou "☰").',
      'Toque em "Instalar" ou "Adicionar à tela inicial".',
      'Confirme.'
    ],
    note: 'Se a opção não existir no seu navegador, abra o site no Chrome. Dentro do Instagram/Facebook/WhatsApp, use "Abrir no navegador" primeiro.'
  },
  {
    id: 'desktop-chrome',
    os: 'desktop',
    label: 'Chrome e Edge',
    steps: [
      'Clique no ícone de instalar na barra de endereço (um monitor com uma seta), à direita.',
      'Ou, no Chrome: menu "⋮" → "Transmitir, salvar e compartilhar" → "Instalar página como app". No Edge: menu "…" → "Aplicativos" → "Instalar este site como um aplicativo".',
      'Confirme em "Instalar". O Zyvion abre em janela própria e ganha atalho no computador.'
    ]
  },
  {
    id: 'desktop-safari',
    os: 'desktop',
    label: 'Safari (Mac)',
    steps: [
      'Com o site aberto, clique no menu "Arquivo" (ou no botão Compartilhar).',
      'Clique em "Adicionar ao Dock".',
      'Confirme em "Adicionar". Precisa do macOS Sonoma (14) ou mais novo.'
    ]
  },
  {
    id: 'desktop-firefox',
    os: 'desktop',
    label: 'Firefox',
    cannotInstall: true,
    steps: [
      'O Firefox no computador não instala sites como app.',
      'Abra o Zyvion no Chrome ou no Edge e siga a aba "Chrome e Edge" — ou salve o site nos favoritos.'
    ]
  }
];

export const OS_LABELS: Record<InstallOS, string> = {
  ios: 'iPhone/iPad',
  android: 'Android',
  desktop: 'Computador'
};

export const guidesForOS = (os: InstallOS) => INSTALL_GUIDES.filter(g => g.os === os);

/** Passo a passo certo para o aparelho/navegador detectado. */
export const guideForPlatform = (p: InstallPlatform): InstallGuide => {
  const byId = (id: string) => INSTALL_GUIDES.find(g => g.id === id)!;
  if (p.os === 'ios') {
    if (p.browser === 'inapp') return byId('ios-inapp');
    if (p.browser === 'chrome') return byId('ios-chrome');
    if (p.browser === 'safari') {
      const guide = byId('ios-safari');
      // Safari até o 18: o Compartilhar está direto na barra.
      if (p.safariMajor !== null && p.safariMajor < 26) {
        return { ...guide, steps: IOS_SAFARI_CLASSIC_STEPS, note: undefined };
      }
      return guide;
    }
    return byId('ios-other');
  }
  if (p.os === 'android') {
    if (p.browser === 'chrome') return byId('android-chrome');
    if (p.browser === 'samsung') return byId('android-samsung');
    return byId('android-other');
  }
  if (p.browser === 'firefox') return byId('desktop-firefox');
  if (p.browser === 'safari' && p.isMac) return byId('desktop-safari');
  return byId('desktop-chrome');
};

/**
 * Caminho em uma linha, para o aviso compacto do iPhone (o passo a passo
 * completo fica no tutorial). `null` fora do iPhone/iPad.
 */
export const iosQuickPath = (p: InstallPlatform): string | null => {
  if (p.os !== 'ios') return null;
  if (p.browser === 'inapp') {
    return `Você está dentro ${p.inAppName ? `do ${p.inAppName}` : 'de outro app'}, e aqui não dá para instalar. Abra o site no Safari.`;
  }
  if (p.browser === 'safari') {
    return p.safariMajor !== null && p.safariMajor < 26
      ? 'Toque em Compartilhar (quadrado com seta) → "Adicionar à Tela de Início".'
      : 'Toque em "•••" → "Compartilhar" → "Adicionar à Tela de Início".';
  }
  return 'No menu do navegador, toque em "Compartilhar" → "Adicionar à Tela de Início".';
};
