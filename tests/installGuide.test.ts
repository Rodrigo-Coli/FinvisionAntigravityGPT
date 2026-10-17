import { describe, it, expect } from 'vitest';
import {
  detectInstallPlatform,
  guideForPlatform,
  iosQuickPath,
  INSTALL_GUIDES,
  guidesForOS
} from '../lib/installGuide';

// User agents reais (ou no formato exato que cada navegador envia).
const UA = {
  // iOS 26: o Safari congela a versão do sistema em 18_6 e informa Version/26.
  iphoneSafari26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  iphoneSafari17: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.122 Mobile/15E148 Safari/604.1',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/143.0 Mobile/15E148 Safari/605.1.15',
  iphoneEdge: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/140.0.3485.94 Mobile/15E148 Safari/605.1.15',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0.0.40.80 (iPhone15,3; iOS 18_6; pt_BR; pt; scale=3.00; 1290x2796; 123456789)',
  iphoneFacebook: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/500.0.0.0;FBBV/1;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.6;FBSS/3;FBCR/;FBID/phone;FBLC/pt_BR;FBOP/5]',
  iphoneUnknownWebView: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ipadOSAsMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0',
  androidWebView: 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0'
};

const detect = (userAgent: string, extra: { platform?: string; maxTouchPoints?: number } = {}) =>
  detectInstallPlatform({ userAgent, ...extra });

describe('detecção do aparelho e navegador', () => {
  it('iPhone: Safari, Chrome, Firefox, Edge', () => {
    expect(detect(UA.iphoneSafari26)).toMatchObject({ os: 'ios', browser: 'safari', safariMajor: 26 });
    expect(detect(UA.iphoneSafari17)).toMatchObject({ os: 'ios', browser: 'safari', safariMajor: 17 });
    expect(detect(UA.iphoneChrome)).toMatchObject({ os: 'ios', browser: 'chrome' });
    expect(detect(UA.iphoneFirefox)).toMatchObject({ os: 'ios', browser: 'firefox' });
    expect(detect(UA.iphoneEdge)).toMatchObject({ os: 'ios', browser: 'edge' });
  });

  it('iPhone dentro de outro app (Instagram, Facebook, webview sem nome)', () => {
    expect(detect(UA.iphoneInstagram)).toMatchObject({ os: 'ios', browser: 'inapp', inAppName: 'Instagram' });
    expect(detect(UA.iphoneFacebook)).toMatchObject({ os: 'ios', browser: 'inapp', inAppName: 'Facebook' });
    expect(detect(UA.iphoneUnknownWebView)).toMatchObject({ os: 'ios', browser: 'inapp', inAppName: null });
  });

  it('iPad que se apresenta como Mac é iPad (pelo toque); Mac de verdade não', () => {
    expect(detect(UA.ipadOSAsMac, { platform: 'MacIntel', maxTouchPoints: 5 })).toMatchObject({ os: 'ios', isIPad: true, browser: 'safari' });
    expect(detect(UA.macSafari, { platform: 'MacIntel', maxTouchPoints: 0 })).toMatchObject({ os: 'desktop', isMac: true, browser: 'safari' });
  });

  it('Android: Chrome, Samsung Internet, Firefox, webview', () => {
    expect(detect(UA.androidChrome)).toMatchObject({ os: 'android', browser: 'chrome' });
    expect(detect(UA.androidSamsung)).toMatchObject({ os: 'android', browser: 'samsung' });
    expect(detect(UA.androidFirefox)).toMatchObject({ os: 'android', browser: 'firefox' });
    expect(detect(UA.androidWebView)).toMatchObject({ os: 'android', browser: 'inapp' });
  });

  it('computador: Chrome, Edge, Firefox', () => {
    expect(detect(UA.winChrome)).toMatchObject({ os: 'desktop', browser: 'chrome' });
    expect(detect(UA.winEdge)).toMatchObject({ os: 'desktop', browser: 'edge' });
    expect(detect(UA.winFirefox)).toMatchObject({ os: 'desktop', browser: 'firefox' });
  });
});

describe('passo a passo escolhido', () => {
  const guideId = (ua: string, extra = {}) => guideForPlatform(detect(ua, extra)).id;

  it('cada aparelho/navegador cai na aba certa', () => {
    expect(guideId(UA.iphoneSafari26)).toBe('ios-safari');
    expect(guideId(UA.iphoneChrome)).toBe('ios-chrome');
    expect(guideId(UA.iphoneFirefox)).toBe('ios-other');
    expect(guideId(UA.iphoneInstagram)).toBe('ios-inapp');
    expect(guideId(UA.androidChrome)).toBe('android-chrome');
    expect(guideId(UA.androidSamsung)).toBe('android-samsung');
    expect(guideId(UA.androidFirefox)).toBe('android-other');
    expect(guideId(UA.winChrome)).toBe('desktop-chrome');
    expect(guideId(UA.winEdge)).toBe('desktop-chrome');
    expect(guideId(UA.winFirefox)).toBe('desktop-firefox');
    expect(guideId(UA.macSafari, { platform: 'MacIntel', maxTouchPoints: 0 })).toBe('desktop-safari');
  });

  it('Safari do iOS 26 passa pelo menu "•••"; Safari antigo vai direto no Compartilhar', () => {
    expect(guideForPlatform(detect(UA.iphoneSafari26)).steps[0]).toContain('•••');
    const old = guideForPlatform(detect(UA.iphoneSafari17));
    expect(old.steps[0]).toContain('Compartilhar');
    expect(old.steps[0]).not.toContain('•••');
  });

  it('dentro de outro app não promete instalação', () => {
    expect(guideForPlatform(detect(UA.iphoneInstagram)).cannotInstall).toBe(true);
    expect(iosQuickPath(detect(UA.iphoneInstagram))).toContain('Instagram');
  });

  it('caminho curto do aviso só existe no iPhone/iPad', () => {
    expect(iosQuickPath(detect(UA.iphoneSafari26))).toContain('•••');
    expect(iosQuickPath(detect(UA.iphoneSafari17))).not.toContain('•••');
    expect(iosQuickPath(detect(UA.androidChrome))).toBeNull();
    expect(iosQuickPath(detect(UA.winChrome))).toBeNull();
  });

  it('todo sistema tem passo a passo e todo passo a passo tem passos', () => {
    for (const os of ['ios', 'android', 'desktop'] as const) {
      expect(guidesForOS(os).length).toBeGreaterThan(0);
    }
    expect(new Set(INSTALL_GUIDES.map(g => g.id)).size).toBe(INSTALL_GUIDES.length);
    for (const g of INSTALL_GUIDES) expect(g.steps.length).toBeGreaterThan(0);
  });
});
