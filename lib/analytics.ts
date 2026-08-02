// Tracking leve para a Landing Page. Nunca deve quebrar a navegação do usuário
// caso o Pixel/GA4 ainda não estejam configurados — todo disparo é best-effort.

declare global {
  interface Window {
    dataLayer?: unknown[];
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

type TrackParams = Record<string, string | number | boolean | undefined>;

export function trackEvent(eventName: string, params: TrackParams = {}): void {
  if (typeof window === 'undefined') return;
  try {
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event: eventName, ...params });
    }
  } catch {}
  try {
    if (typeof window.fbq === 'function') {
      window.fbq('trackCustom', eventName, params);
    }
  } catch {}
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, params);
    }
  } catch {}
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
const UTM_STORAGE_KEY = 'zyvion_utm_params';

// Lê os parâmetros utm_* da URL atual e persiste em sessionStorage.
// Chamar uma vez ao montar a Landing Page.
export function captureUtmParams(): void {
  if (typeof window === 'undefined') return;
  try {
    const search = new URLSearchParams(window.location.search);
    const found: Record<string, string> = {};
    UTM_KEYS.forEach((key) => {
      const value = search.get(key);
      if (value) found[key] = value;
    });
    if (Object.keys(found).length > 0) {
      window.sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(found));
    }
  } catch {}
}

export function getUtmParams(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(UTM_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Repassa os UTMs capturados para um link interno (ex: /demo, /signup).
export function withUtmParams(path: string): string {
  const utm = getUtmParams();
  const keys = Object.keys(utm);
  if (keys.length === 0) return path;
  const [base, existingQuery] = path.split('?');
  const query = new URLSearchParams(existingQuery || '');
  keys.forEach((key) => query.set(key, utm[key]));
  return `${base}?${query.toString()}`;
}

// Dispara scroll_depth uma única vez em 50% e 90% da página. Retorna função de cleanup.
export function initScrollDepthTracking(): () => void {
  if (typeof window === 'undefined') return () => {};
  const fired: Record<number, boolean> = { 50: false, 90: false };
  const handleScroll = () => {
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return;
    const pct = (window.scrollY / docHeight) * 100;
    if (!fired[50] && pct >= 50) {
      fired[50] = true;
      trackEvent('scroll_depth', { depth: 50 });
    }
    if (!fired[90] && pct >= 90) {
      fired[90] = true;
      trackEvent('scroll_depth', { depth: 90 });
    }
  };
  window.addEventListener('scroll', handleScroll, { passive: true });
  return () => window.removeEventListener('scroll', handleScroll);
}
