// Wrapper do localStorage que NUNCA lança exceção. O Safari (iOS e macOS)
// pode lançar SecurityError ao acessar localStorage quando o usuário tem
// "Impedir Rastreamento entre Sites" / "Bloquear Todos os Cookies" ativado,
// ou em certas navegações privadas — mesmo em .getItem(), não só .setItem().
// Isso acontecia dentro de um useState(() => ...) do App.tsx SEM try/catch e
// SEM ErrorBoundary acima, travando o carregamento do app inteiro só no
// Safari (funcionava normal no Chrome, que não tem essa restrição por padrão).
export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // silencioso: cache é só otimização, nunca pode travar o app.
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // silencioso
    }
  },
  getJSON<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  // Remove todas as chaves que começam com um dos prefixos informados. Usado
  // para limpar TODO o cache local (perfil, transações, contas, categorias,
  // resumo do dashboard etc.) sempre que o usuário logado muda — em vez de
  // manter uma lista fixa de chaves (que ficava desatualizada toda vez que
  // uma tela nova criava uma chave de cache e esquecia de registrá-la aqui,
  // causando dado de uma conta "vazar" visualmente pra outra no mesmo aparelho).
  clearByPrefix(prefixes: string[]): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && prefixes.some(p => key.startsWith(p))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {
      // silencioso
    }
  },
};
