// Configuração da oferta de lançamento (Turma Fundadora).
// A escassez aqui é de PRAZO, nunca de quantidade — nunca adicionar contador de vagas.
export const FOUNDING_OFFER = {
  // Liga/desliga a oferta inteira (barra, selo, preço riscado) em qualquer lugar da página.
  enabled: true,
  // ANTES DE PUBLICAR: ajuste para a data real de encerramento da Turma Fundadora.
  endsAt: '2026-09-15T23:59:59-03:00',
  // Quem assina até endsAt mantém este preço enquanto a assinatura seguir ativa.
  priceLockForever: true,
  // ANTES DE PUBLICAR: ajuste o desconto real que será praticado sobre o preço cheio.
  discountPercent: 30,
};

export function isFoundingOfferActive(now: Date = new Date()): boolean {
  if (!FOUNDING_OFFER.enabled) return false;
  return now.getTime() < new Date(FOUNDING_OFFER.endsAt).getTime();
}

export function getFoundingOfferMsRemaining(now: Date = new Date()): number {
  return new Date(FOUNDING_OFFER.endsAt).getTime() - now.getTime();
}

export function applyFoundingDiscount(priceCents: number): number {
  const factor = (100 - FOUNDING_OFFER.discountPercent) / 100;
  return Math.round(priceCents * factor);
}
