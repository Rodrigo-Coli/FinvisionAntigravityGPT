// Índices de mercado (CDI, Selic, IPCA, IGP-M) para o lado servidor da IA.
//
// Antes, o único lugar que tinha esses números era o FRONTEND
// (FinancialEngine.MARKET_INDEXES, em lib/financialEngine.ts), com valores chumbados
// que o usuário editava à mão em Ajustes. O backend da IA não lia nada disso — então
// qualquer comparação com CDI vinha de busca web solta ou era inventada pelo modelo.
//
// Aqui os valores vêm do Banco Central (API SGS, pública e sem chave), atualizados uma
// vez por dia pelo cron (api/_lib/daily-cron.ts) e guardados em `market_indexes_cache`.
// A leitura tem 3 níveis de queda, sempre determinística e nunca lançando erro:
//   1. cache do BCB, se estiver fresco;
//   2. o que o usuário configurou em user_settings.market_indexes (o que a tela usa);
//   3. o mesmo fallback histórico do frontend, para nunca ficar sem número.

export interface MarketIndexes {
  cdi: number;
  selic: number;
  ipca: number;
  igpm: number;
  source: 'bcb' | 'user_settings' | 'fallback';
  updatedAt: string | null;
}

// Mesmo default do FinancialEngine.MARKET_INDEXES (lib/financialEngine.ts) — se mudar
// lá, mudar aqui: é a rede de segurança para quando BCB e Ajustes falharem juntos.
const FALLBACK = { cdi: 10.4, selic: 10.5, ipca: 4.0, igpm: 4.0 };

const CACHE_TABLE = 'market_indexes_cache';
const CACHE_ROW_ID = 'BR';
// Feriado/fim de semana já deixa o BCB sem publicar por 3 dias seguidos; 7 dias de
// tolerância evita descartar um cache bom só porque o cron falhou uma vez.
const MAX_CACHE_AGE_DAYS = 7;

// Séries do SGS (https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados):
//  · 4389  → CDI anualizado base 252 (% a.a.), diário
//  · 432   → Meta Selic definida pelo Copom (% a.a.), diário
//  · 13522 → IPCA acumulado em 12 meses (%), mensal
//  · 189   → IGP-M variação mensal (%) — o acumulado 12m é composto aqui mesmo
const SGS = { cdi: 4389, selic: 432, ipca12m: 13522, igpmMonthly: 189 };

async function fetchSgsSeries(seriesCode: number, lastN: number): Promise<number[]> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesCode}/dados/ultimos/${lastN}?formato=json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error(`SGS ${seriesCode} respondeu ${resp.status}`);
    const rows = await resp.json();
    if (!Array.isArray(rows)) throw new Error(`SGS ${seriesCode} devolveu formato inesperado`);
    return rows
      .map((r: any) => Number(String(r?.valor ?? '').replace(',', '.')))
      .filter((n: number) => Number.isFinite(n));
  } finally {
    clearTimeout(timer);
  }
}

// Compõe as variações mensais em acumulado de 12 meses (produto, não soma).
function compoundMonthly(values: number[]): number {
  const factor = values.reduce((acc, v) => acc * (1 + v / 100), 1);
  return Math.round((factor - 1) * 10000) / 100;
}

/**
 * Busca os quatro índices no BCB. Cada série é independente: se uma falhar, as outras
 * continuam valendo e a que faltou volta como `null` (o chamador preserva o valor antigo).
 */
export async function fetchMarketIndexesFromBcb(): Promise<{
  cdi: number | null; selic: number | null; ipca: number | null; igpm: number | null; errors: string[];
}> {
  const errors: string[] = [];
  const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (e: any) {
      errors.push(`${label}: ${e?.message || e}`);
      return null;
    }
  };

  const [cdi, selic, ipca, igpm] = await Promise.all([
    safe('cdi', async () => (await fetchSgsSeries(SGS.cdi, 1))[0] ?? null),
    safe('selic', async () => (await fetchSgsSeries(SGS.selic, 1))[0] ?? null),
    safe('ipca', async () => (await fetchSgsSeries(SGS.ipca12m, 1))[0] ?? null),
    safe('igpm', async () => {
      const monthly = await fetchSgsSeries(SGS.igpmMonthly, 12);
      return monthly.length === 12 ? compoundMonthly(monthly) : null;
    }),
  ]);

  return {
    cdi: cdi ?? null,
    selic: selic ?? null,
    ipca: ipca ?? null,
    igpm: igpm ?? null,
    errors,
  };
}

/**
 * Atualiza o cache global (uma linha só, compartilhada por todos os usuários — são
 * índices públicos). Chamado pelo cron diário. Nunca lança: devolve o que conseguiu.
 */
export async function refreshMarketIndexesCache(supabase: any): Promise<{
  success: boolean; indexes?: Record<string, number>; errors?: string[]; message?: string;
}> {
  try {
    const fetched = await fetchMarketIndexesFromBcb();
    const gotSomething = [fetched.cdi, fetched.selic, fetched.ipca, fetched.igpm].some(v => v !== null);
    if (!gotSomething) {
      return { success: false, errors: fetched.errors, message: 'BCB não respondeu nenhuma série.' };
    }

    // Preserva o valor anterior das séries que falharam nesta rodada. Number(undefined)
    // é NaN e NaN não é capturado por ?? — daí o pick() em vez do encadeamento direto.
    const { data: previous } = await supabase.from(CACHE_TABLE).select('*').eq('id', CACHE_ROW_ID).maybeSingle();
    const pick = (fresh: number | null, prev: any, fallback: number): number => {
      if (fresh !== null && Number.isFinite(fresh)) return fresh;
      const prevNum = Number(prev);
      return Number.isFinite(prevNum) && prevNum > 0 ? prevNum : fallback;
    };
    const merged = {
      cdi: pick(fetched.cdi, previous?.cdi, FALLBACK.cdi),
      selic: pick(fetched.selic, previous?.selic, FALLBACK.selic),
      ipca: pick(fetched.ipca, previous?.ipca, FALLBACK.ipca),
      igpm: pick(fetched.igpm, previous?.igpm, FALLBACK.igpm),
    };

    const { error } = await supabase.from(CACHE_TABLE).upsert({
      id: CACHE_ROW_ID,
      ...merged,
      source: 'bcb',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) return { success: false, errors: [error.message], message: 'Falha ao gravar o cache.' };

    return { success: true, indexes: merged, errors: fetched.errors };
  } catch (e: any) {
    return { success: false, errors: [e?.message || String(e)], message: 'Erro inesperado.' };
  }
}

function ageInDays(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / 86400000;
}

/**
 * Índices que a IA e o app devem usar. Precedência:
 *   1. override manual do usuário (Ajustes > Taxas, campo market_indexes.manual = true)
 *      — quem edita à mão está simulando um cenário e precisa ver o efeito;
 *   2. cache do Banco Central, se fresco;
 *   3. o que houver em user_settings mesmo sem a marca de manual (cadastro antigo);
 *   4. fallback do código.
 * O frontend (App.tsx) segue exatamente esta ordem, para tela e IA nunca divergirem.
 * Nunca lança.
 */
export async function getMarketIndexes(supabase: any, userId?: string): Promise<MarketIndexes> {
  let userIndexes: any = null;
  if (userId) {
    try {
      const { data: settings } = await supabase
        .from('user_settings').select('market_indexes').eq('user_id', userId).maybeSingle();
      if (settings?.market_indexes && Number(settings.market_indexes.cdi) > 0) {
        userIndexes = settings.market_indexes;
      }
    } catch { /* sem Ajustes: segue para o cache */ }
  }

  const fromUser = (): MarketIndexes => ({
    cdi: Number(userIndexes.cdi),
    selic: Number(userIndexes.selic) || Number(userIndexes.cdi),
    ipca: Number(userIndexes.ipca) || FALLBACK.ipca,
    igpm: Number(userIndexes.igpm) || FALLBACK.igpm,
    source: 'user_settings',
    updatedAt: null,
  });

  if (userIndexes && userIndexes.manual === true) return fromUser();

  try {
    const { data: cached } = await supabase.from(CACHE_TABLE).select('*').eq('id', CACHE_ROW_ID).maybeSingle();
    if (cached && ageInDays(cached.updated_at) <= MAX_CACHE_AGE_DAYS && Number(cached.cdi) > 0) {
      return {
        cdi: Number(cached.cdi),
        selic: Number(cached.selic) || Number(cached.cdi),
        ipca: Number(cached.ipca) || FALLBACK.ipca,
        igpm: Number(cached.igpm) || FALLBACK.igpm,
        source: 'bcb',
        updatedAt: cached.updated_at || null,
      };
    }
  } catch { /* cache indisponível: cai para os Ajustes do usuário */ }

  if (userIndexes) return fromUser();

  return { ...FALLBACK, source: 'fallback', updatedAt: null };
}
