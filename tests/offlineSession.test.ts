// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { isTransientMissingSession } from '../lib/session';

/**
 * App aberto sem internet com o login vencido (fechado há mais de 1 h): o
 * Supabase não consegue renovar e avisa INITIAL_SESSION sem sessão ~50 s depois.
 * Isso não é sair da conta — a sessão continua salva no aparelho.
 */
describe('sessão sem rede para renovar', () => {
  beforeEach(() => localStorage.clear());

  it('sessão salva no aparelho: aviso "sem sessão" é passageiro', () => {
    localStorage.setItem('sb-abcd-auth-token', JSON.stringify({ access_token: 'x', refresh_token: 'r', expires_at: 1, user: { id: 'u1' } }));
    expect(isTransientMissingSession('INITIAL_SESSION', null)).toBe(true);
    expect(isTransientMissingSession(null, null)).toBe(true);
  });

  it('sair da conta de verdade, sem sessão salva, ou com sessão: segue normal', () => {
    localStorage.setItem('sb-abcd-auth-token', JSON.stringify({ user: { id: 'u1' } }));
    expect(isTransientMissingSession('SIGNED_OUT', null)).toBe(false);
    expect(isTransientMissingSession('SIGNED_IN', { user: { id: 'u1' } })).toBe(false);
    localStorage.clear();
    expect(isTransientMissingSession('INITIAL_SESSION', null)).toBe(false);
  });
});
