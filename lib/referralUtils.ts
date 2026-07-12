const STORAGE_KEY = 'fv_referral_code';

// Chamada uma vez ao carregar o app: se o link trouxe ?ref=CODIGO, guarda
// localmente até o usuário ter uma sessão autenticada (pode ser antes do
// cadastro, ou antes de confirmar o e-mail).
export function captureReferralCodeFromUrl(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref && ref.trim()) {
    localStorage.setItem(STORAGE_KEY, ref.trim().toUpperCase());
  }
}

export function getPendingReferralCode(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

// Tenta vincular a indicação pendente assim que houver uma sessão válida
// (login imediato após cadastro, ou login normal após confirmar e-mail).
// Idempotente no servidor: se já foi vinculada, o backend apenas ignora.
export async function attachPendingReferral(accessToken: string): Promise<void> {
  const code = getPendingReferralCode();
  if (!code || !accessToken) return;

  try {
    const res = await fetch('/api/attach-referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ affiliateCode: code }),
    });
    if (res.ok) {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    console.warn('[referral] Não foi possível registrar a indicação agora, tentaremos novamente:', err);
  }
}
