/**
 * Versões que o usuário pulou: tudo no histórico de notas mais novo que a versão
 * que está rodando, até a versão do servidor (mais nova primeiro).
 *
 * A atualização sempre leva o app inteiro para a versão mais nova, ou seja, já
 * inclui as versões puladas. Isto serve só para o aviso mostrar as novidades
 * delas também, não apenas as da última.
 *
 * Versão no formato AAAA.MM.DD.HHMM: a comparação de texto equivale à de data.
 */
export interface ReleaseNote {
  version: string;
  title?: string;
  date?: string;
  benefits?: { title: string; desc: string; type?: string }[];
}

export function missedReleases(history: ReleaseNote[], running: string, server: string): ReleaseNote[] {
  if (!Array.isArray(history) || !server) return [];
  return history
    .filter(r => r && typeof r.version === 'string'
      && r.version <= server
      && (!running || r.version > running))
    .sort((a, b) => b.version.localeCompare(a.version));
}
