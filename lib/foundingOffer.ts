import { LandingService } from '../services/landing.service';

// Fallback puro — só vale enquanto a busca ao Supabase não resolveu, ou se ela falhar.
// Sempre com a oferta desligada: na dúvida, não exibir promoção nenhuma.
interface FoundingOfferData {
  enabled: boolean;
  endsAt: string | null;
  discountPercent: number;
  headline: string | null;
}

const FALLBACK: FoundingOfferData = {
  enabled: false,
  endsAt: null,
  discountPercent: 0,
  headline: null,
};

let current: FoundingOfferData = { ...FALLBACK };
let loadPromise: Promise<void> | null = null;

// A fonte de verdade real hoje mora em public.landing_settings, editável pelo painel
// Admin > Landing > Oferta. Dedupe: chamadas concorrentes compartilham o mesmo fetch em
// vez de disparar uma request por componente.
export function loadFoundingOfferFromDB(): Promise<void> {
  if (!loadPromise) {
    loadPromise = LandingService.getSettings()
      .then((settings) => {
        if (settings) {
          current = {
            enabled: settings.founding_enabled,
            endsAt: settings.founding_ends_at,
            discountPercent: settings.founding_discount_pct || 0,
            headline: settings.founding_headline,
          };
        }
      })
      .catch(() => {
        // mantém FALLBACK (oferta desligada) — nunca deixa a página quebrar por isso.
      });
  }
  return loadPromise;
}

export function getFoundingHeadline(): string | null {
  return current.headline;
}

export function isFoundingOfferActive(now: Date = new Date()): boolean {
  if (!current.enabled || !current.endsAt) return false;
  return now.getTime() < new Date(current.endsAt).getTime();
}

export function getFoundingOfferMsRemaining(now: Date = new Date()): number {
  if (!current.endsAt) return 0;
  return new Date(current.endsAt).getTime() - now.getTime();
}

// Desconto configurado pelo superadmin no painel (0 a 90%) — nunca inventado no código.
export function applyFoundingDiscount(priceCents: number): number {
  const pct = current.discountPercent || 0;
  const factor = (100 - pct) / 100;
  return Math.round(priceCents * factor);
}
