-- ============================================================================
-- Raio-X da Carteira — infraestrutura da análise de investimentos
--
-- 1. market_indexes_cache: CDI / Selic / IPCA / IGP-M reais, vindos da API pública
--    do Banco Central (SGS) e atualizados uma vez por dia pelo cron
--    (api/_lib/daily-cron.ts -> refreshMarketIndexesCache).
--    São dados PÚBLICOS e iguais para todo mundo: uma linha só, id = 'BR',
--    leitura liberada para qualquer usuário logado, escrita só pelo service role.
--
-- 2. ai_prompts: prompt versionado do relatório de carteira (slug
--    'investment_analysis'). A tabela já existe em produção; o CREATE aqui é só
--    para ambientes novos, e o seed é tolerante a falha porque o código já cai
--    num prompt padrão embutido quando a linha não existe.
--
-- Idempotente: pode rodar quantas vezes precisar.
-- ============================================================================

-- ── 1. Cache de índices de mercado ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.market_indexes_cache (
    id          TEXT PRIMARY KEY DEFAULT 'BR',
    cdi         NUMERIC(8,4) NOT NULL,
    selic       NUMERIC(8,4) NOT NULL,
    ipca        NUMERIC(8,4) NOT NULL,
    igpm        NUMERIC(8,4) NOT NULL,
    source      TEXT NOT NULL DEFAULT 'bcb',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.market_indexes_cache IS
    'Índices macroeconômicos vigentes (% a.a. para CDI/Selic, acumulado 12m para IPCA/IGP-M). Alimentado pelo cron diário a partir da API SGS do Banco Central.';

ALTER TABLE public.market_indexes_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "market_indexes_readable_by_authenticated" ON public.market_indexes_cache;
CREATE POLICY "market_indexes_readable_by_authenticated"
    ON public.market_indexes_cache FOR SELECT
    TO authenticated
    USING (true);

-- Escrita: nenhuma policy para authenticated. O cron usa a service role key, que
-- ignora RLS — é o único caminho que grava aqui.

-- Semente com o mesmo fallback do código, para a tabela nunca ficar vazia antes
-- do primeiro cron rodar.
INSERT INTO public.market_indexes_cache (id, cdi, selic, ipca, igpm, source, updated_at)
VALUES ('BR', 10.4, 10.5, 4.0, 4.0, 'fallback', NOW() - INTERVAL '30 days')
ON CONFLICT (id) DO NOTHING;

-- ── 2. Prompt do relatório de carteira ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_prompts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT UNIQUE NOT NULL,
    content     TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    INSERT INTO public.ai_prompts (slug, content)
    VALUES ('investment_analysis', $prompt$# IDENTIDADE
Você é o Zyvion Portfolio Advisor, o analista de carteira do app Zyvion. Escreve como um
private banker sênior: direto, específico, sem enrolação e sem entusiasmo vazio.

# REGRA ZERO (A MAIS IMPORTANTE)
Todos os números do bloco DADOS já foram calculados pelo sistema. NUNCA recalcule,
NUNCA estime e NUNCA invente um valor que não esteja lá. Se um dado não existe, diga que
falta cadastrar — não preencha o buraco com suposição.

# TOM E FORMATO
- Markdown, com as seções exatas pedidas abaixo, nessa ordem.
- Valores sempre em reais formatados (R$ 12.345,67) e percentuais com no máximo 2 casas.
- Frases curtas. Zero introdução do tipo "vamos analisar juntos".
- Nunca cite "Gemini", "Google" ou qualquer IA. Você é o Zyvion.

# LIMITE REGULATÓRIO (OBRIGATÓRIO)
Você NÃO é consultor de valores mobiliários registrado na CVM e NÃO dá recomendação
personalizada de compra ou venda de ativo específico. O formato certo não é "compre X"
nem se recusar a analisar: é comparar com número e devolver a decisão ao usuário.

# ESTRUTURA OBRIGATÓRIA DO RELATÓRIO
## 1. Veredito em uma linha
## 2. Como sua carteira está rendendo
## 3. Ativo por ativo (cada linha começa por **Manter**, **Revisar taxa**, **Reaplicar no vencimento**, **Reduzir exposição** ou **Atenção**)
## 4. Riscos da carteira (concentração, FGC, liquidez, reserva de emergência)
## 5. O que fazer nos próximos 30 dias (no máximo 3 ações, ordenadas por impacto em R$)
## 6. O que falta cadastrar (só se houver lacunas)

Encerre com a linha exata:
_Análise educacional baseada nos seus próprios dados — não é recomendação de investimento._$prompt$)
    ON CONFLICT (slug) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
    -- A tabela em produção pode ter colunas obrigatórias que este script não conhece.
    -- Sem a linha, handle-investment-analysis.ts usa o prompt padrão embutido no código,
    -- então falhar aqui não quebra a funcionalidade.
    RAISE NOTICE 'Seed do prompt investment_analysis ignorado: %', SQLERRM;
END $$;
