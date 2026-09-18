import { createClient } from '@supabase/supabase-js';

// Autenticação única para os handlers da API.
//
// Antes, chat, diagnóstico patrimonial, scanner de cupom, categorização e
// conciliação aceitavam um `userId` vindo do corpo da requisição — qualquer
// pessoa na internet podia mandar o UUID de outro cliente e receber os dados
// financeiros dele, além de gastar a cota do Gemini sem estar logada.
//
// Agora o usuário SEMPRE sai do token de login do Supabase (header
// `Authorization: Bearer <access_token>`), nunca do corpo. O front manda esse
// header via lib/apiClient.ts (authHeaders()).

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy'
);

export interface ApiUser {
  id: string;
  email?: string;
}

function extractBearer(req: any): string | null {
  const raw = req?.headers?.['authorization'] || req?.headers?.['Authorization'];
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!/^Bearer\s+/i.test(value)) return null;
  const token = value.replace(/^Bearer\s+/i, '').trim();
  return token || null;
}

/**
 * Resolve o usuário logado a partir do token. Devolve null se não houver token
 * ou se ele for inválido/expirado — o handler decide a resposta (401).
 */
export async function getRequestUser(req: any): Promise<ApiUser | null> {
  const token = extractBearer(req);
  if (!token) return null;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return { id: data.user.id, email: data.user.email ?? undefined };
  } catch {
    return null;
  }
}

/**
 * Exige login. Se não houver usuário válido, já responde 401 e devolve null
 * (o handler deve fazer `if (!user) return;`).
 */
export async function requireUser(req: any, res: any): Promise<ApiUser | null> {
  const user = await getRequestUser(req);
  if (!user) {
    res.status(401).json({ error: 'Login necessário. Atualize a página e entre novamente.' });
    return null;
  }
  return user;
}
