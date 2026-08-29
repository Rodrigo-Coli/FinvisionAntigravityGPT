import { withTimeout } from './connectivity';

/**
 * Quem é o usuário logado — sem depender da internet
 * --------------------------------------------------
 * O app usava `supabase.auth.getUser()` em 33 lugares. Esse método NÃO lê a
 * sessão do aparelho: ele bate em `/auth/v1/user` no servidor. Sem internet
 * isso devolve `user: null`, e o código logo abaixo fazia
 * `if (!user) throw new Error('Usuário não autenticado')`.
 *
 * Ou seja: offline, salvar um lançamento estourava "Usuário não autenticado"
 * ANTES de chegar na linha que o guardaria na fila offline. O lançamento não ia
 * para o servidor nem para a fila — simplesmente sumia. Em conexão ruim era
 * pior: a chamada ficava pendurada e a tela travava.
 *
 * `getSession()` lê a sessão persistida localmente e só toca a rede quando o
 * token expirou. Ainda assim damos um prazo curto e, se estourar, lemos a
 * sessão direto do localStorage — o app continua sabendo quem é o usuário mesmo
 * completamente offline.
 */

function readPersistedUser(): any | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // supabase-js v2 persiste em `sb-<project-ref>-auth-token`.
      if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const user = parsed?.user || parsed?.currentSession?.user || parsed?.session?.user;
      if (user?.id) return user;
    }
  } catch {
    /* storage indisponível (modo privado, cota): segue sem usuário */
  }
  return null;
}

/**
 * Usuário da sessão atual. Nunca lança e nunca fica pendurado: em último caso
 * devolve o usuário persistido no aparelho, ou `null`.
 */
export async function getSessionUser(client: any): Promise<any | null> {
  if (!client) return null;
  try {
    const res: any = await withTimeout(client.auth.getSession(), 5000, 'sessão');
    const user = res?.data?.session?.user;
    if (user?.id) return user;
  } catch {
    /* offline ou refresh travado: cai para a sessão salva no aparelho */
  }
  return readPersistedUser();
}

/**
 * Sair da conta sem depender da internet.
 *
 * `supabase.auth.signOut()` faz uma chamada de rede a /auth/v1/logout. Em
 * conexão ruim esse fetch NÃO rejeita — fica pendurado. Como o código que
 * chamava esperava por ele (`await supabase.auth.signOut()`) antes de limpar o
 * armazenamento e redirecionar, o botão "Sair" simplesmente não fazia nada:
 * nenhum erro, nenhuma tela nova, nada.
 *
 * Aqui a saída é garantida: tentamos encerrar a sessão no servidor com prazo e,
 * dê no que der, a sessão local é apagada. Encerrar no servidor é desejável
 * (invalida o refresh token), mas nunca pode impedir o usuário de sair.
 */
export async function signOutSafely(client: any, timeoutMs = 4000): Promise<void> {
  if (!client) return;

  try {
    await withTimeout(client.auth.signOut(), timeoutMs, 'sair da conta');
    return;
  } catch {
    /* sem rede ou servidor lento: encerra só localmente, abaixo */
  }

  try {
    // scope 'local' não toca a rede: limpa a sessão só neste aparelho.
    await withTimeout(client.auth.signOut({ scope: 'local' }), 1500, 'sair localmente');
  } catch {
    // Último recurso: remove na mão a chave que o supabase-js persiste.
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) keys.push(key);
      }
      keys.forEach(k => localStorage.removeItem(k));
    } catch {
      /* storage indisponível: não há mais o que fazer */
    }
  }
}
