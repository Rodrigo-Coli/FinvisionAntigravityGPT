import { supabase } from './supabase/client';

/**
 * Cabeçalhos de autenticação para chamar a API própria (/api/*).
 *
 * A API deixou de aceitar `userId` no corpo da requisição: o usuário agora é
 * identificado só pelo token de login (ver api/_lib/require-user.ts). Toda
 * chamada `fetch('/api/...')` que precisa saber quem é o usuário deve usar:
 *
 *   headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }
 */
export async function authHeaders(): Promise<Record<string, string>> {
  try {
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}
