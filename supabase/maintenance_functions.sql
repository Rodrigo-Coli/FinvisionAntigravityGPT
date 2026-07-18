-- Funções de manutenção diária (18/07/2026) — JÁ APLICADAS EM PRODUÇÃO via SQL
-- direto e TESTADAS ao vivo. Chamadas pelo daily-cron (api/_lib/maintenance.ts).
-- Este arquivo documenta as funções para futuros ambientes.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. RENOVAÇÃO AUTOMÁTICA DAS RECORRÊNCIAS DE IMÓVEIS (janela rolante 24 meses)
--    Séries (aluguel/condomínio/IPTU, identificadas por metadata->>'type') com
--    menos de 12 meses de cobertura futura são estendidas até 24 meses clonando
--    o último lançamento. Cadência detectada pelos 2 últimos lançamentos
--    (1 mês = mensal; ~12 = IPTU anual). Guardas: imóvel existe, não arquivado,
--    PRONTO, não vendido, e a configuração da série continua válida (isRented/
--    rentalIncome para aluguel; condoFee/iptuFee para os demais) — série
--    desativada não é ressuscitada. Idempotente (parte sempre do max(date)).
CREATE OR REPLACE FUNCTION public.renew_property_recurrences(p_horizon_months int DEFAULT 24, p_min_months_ahead int DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  s record;
  tpl record;
  v_cadence int;
  v_prev_date date;
  v_new_date date;
  v_limit_date date;
  v_inserted int := 0;
  v_series int := 0;
  k int;
BEGIN
  FOR s IN
    SELECT t.user_id,
           (t.metadata->>'linked_asset_id')::uuid AS asset_id,
           t.metadata->>'type' AS series_type,
           max(t.date)::date AS last_date
    FROM public.transactions t
    WHERE t.metadata->>'type' IN ('rental_income','condo_expense','condo_revenue','iptu_expense','iptu_revenue')
      AND t.is_deleted = false
      AND t.metadata->>'linked_asset_id' IS NOT NULL
    GROUP BY 1, 2, 3
    HAVING max(t.date)::date < (current_date + make_interval(months => p_min_months_ahead))::date
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.physical_assets a
      WHERE a.id = s.asset_id
        AND coalesce(a.is_archived, false) = false
        AND a.category = 'REAL_ESTATE'
        AND coalesce(a.metadata->>'propertyStage', 'PRONTO') = 'PRONTO'
        AND coalesce((a.metadata->>'isSold')::boolean, false) = false
        AND CASE
          WHEN s.series_type = 'rental_income' THEN
            coalesce((a.metadata->>'isRented')::boolean, false) = true
            AND coalesce(a.metadata->>'rentalType', 'anual') <> 'short_stay'
            AND coalesce((a.metadata->>'rentalIncome')::numeric, 0) > 0
          WHEN s.series_type LIKE 'condo%' THEN
            coalesce((a.metadata->>'condoFee')::numeric, 0) > 0
          WHEN s.series_type LIKE 'iptu%' THEN
            coalesce((a.metadata->>'iptuFee')::numeric, 0) > 0
          ELSE false
        END
    ) THEN
      CONTINUE;
    END IF;

    SELECT * INTO tpl FROM public.transactions t
    WHERE t.user_id = s.user_id
      AND t.metadata->>'linked_asset_id' = s.asset_id::text
      AND t.metadata->>'type' = s.series_type
      AND t.is_deleted = false
    ORDER BY t.date DESC LIMIT 1;

    IF tpl IS NULL THEN CONTINUE; END IF;

    SELECT max(t.date)::date INTO v_prev_date FROM public.transactions t
    WHERE t.user_id = s.user_id
      AND t.metadata->>'linked_asset_id' = s.asset_id::text
      AND t.metadata->>'type' = s.series_type
      AND t.is_deleted = false
      AND t.date::date < s.last_date;

    IF v_prev_date IS NULL THEN
      v_cadence := 1;
    ELSE
      v_cadence := greatest(1, round(((s.last_date - v_prev_date)::numeric / 30.44))::int);
      IF v_cadence >= 11 THEN v_cadence := 12; END IF;
    END IF;

    v_limit_date := (current_date + make_interval(months => p_horizon_months))::date;
    v_series := v_series + 1;

    k := 1;
    LOOP
      v_new_date := (s.last_date + make_interval(months => v_cadence * k))::date;
      EXIT WHEN v_new_date > v_limit_date OR k > 30;
      INSERT INTO public.transactions
        (user_id, account_id, account_name, description, amount, date, type, category, category_id, subcategory, owner_name, is_paid, paid_amount, is_deleted, metadata)
      VALUES
        (tpl.user_id, tpl.account_id, tpl.account_name, tpl.description, tpl.amount, v_new_date, tpl.type, tpl.category, tpl.category_id, tpl.subcategory, tpl.owner_name, false, 0, false, tpl.metadata);
      v_inserted := v_inserted + 1;
      k := k + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('series_extended', v_series, 'transactions_inserted', v_inserted);
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LIMPEZA DE CONTAS DEMO ABANDONADAS
--    Apaga usuários demo+...@finvision.app com mais de p_days dias (default 7).
--    Contas promovidas trocam o e-mail pelo real (promote-demo) e deixam de
--    casar com o padrão — protegidas automaticamente. As tabelas do app
--    referenciam auth.users com ON DELETE CASCADE. Falha em um usuário não
--    derruba os demais. Máximo 50 por execução.
CREATE OR REPLACE FUNCTION public.cleanup_abandoned_demo_users(p_days int DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  u record;
  v_deleted int := 0;
  v_failed int := 0;
BEGIN
  FOR u IN
    SELECT id FROM auth.users
    WHERE email LIKE 'demo+%@finvision.app'
      AND created_at < now() - make_interval(days => p_days)
    LIMIT 50
  LOOP
    BEGIN
      DELETE FROM auth.users WHERE id = u.id;
      v_deleted := v_deleted + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('deleted', v_deleted, 'failed', v_failed);
END;
$fn$;

-- Permissões: só o cron (service_role) pode executar — usuários do app não.
REVOKE EXECUTE ON FUNCTION public.renew_property_recurrences(int, int) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_abandoned_demo_users(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_property_recurrences(int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_abandoned_demo_users(int) TO service_role;
