-- Correção (17/07/2026, QA pré-lançamento): a constraint de categoria de
-- physical_assets não incluía 'INVESTMENT', mas o app envia esse valor ao
-- cadastrar um investimento financeiro (Patrimônio → Investimentos).
-- Resultado: NENHUM investimento conseguia ser salvo (erro de constraint,
-- mostrado só num toast rápido). JÁ APLICADO na produção via SQL direto em
-- 17/07/2026; este arquivo documenta a mudança para novos ambientes.

ALTER TABLE public.physical_assets DROP CONSTRAINT IF EXISTS physical_assets_category_check;
ALTER TABLE public.physical_assets ADD CONSTRAINT physical_assets_category_check
  CHECK (category = ANY (ARRAY['REAL_ESTATE'::text, 'VEHICLE'::text, 'OTHER'::text, 'INVESTMENT'::text]));
