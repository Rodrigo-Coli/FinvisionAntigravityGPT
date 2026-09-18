-- ============================================================
-- CORREÇÕES DE SEGURANÇA — 18/09/2026
-- Rodar no Supabase: Dashboard > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema (tudo é idempotente).
-- Nenhum comando aqui apaga dados de cliente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. profiles: ninguém consegue se promover a admin.
--    Um trigger devolve role / is_superadmin / is_approved ao valor antigo
--    quando quem está gravando é um usuário comum. Admin (via app) e o
--    servidor (service role / SQL Editor, onde auth.uid() é nulo) continuam
--    podendo alterar normalmente. Não dá erro: só ignora a tentativa.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean := false;
BEGIN
  -- Chamadas sem usuário (service role, SQL Editor, triggers internos) passam.
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (p.role = 'admin' OR COALESCE(p.is_superadmin, false))
    INTO v_is_admin
  FROM public.profiles p
  WHERE p.id = v_caller;

  IF COALESCE(v_is_admin, false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.role := 'user';
    NEW.is_superadmin := false;
    RETURN NEW;
  END IF;

  -- UPDATE por usuário comum: preserva os campos sensíveis.
  NEW.role := OLD.role;
  NEW.is_superadmin := OLD.is_superadmin;
  NEW.is_approved := OLD.is_approved;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileges ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileges
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();

REVOKE EXECUTE ON FUNCTION public.protect_profile_privileges() FROM anon, authenticated;

-- ------------------------------------------------------------
-- 2. Views administrativas: só o servidor lê (antes eram públicas).
-- ------------------------------------------------------------
REVOKE ALL ON public.admin_mrr_by_plan       FROM anon, authenticated;
REVOKE ALL ON public.admin_users_by_plan     FROM anon, authenticated;
REVOKE ALL ON public.admin_ai_usage_by_plan  FROM anon, authenticated;
REVOKE ALL ON public.admin_business_health   FROM anon, authenticated;

-- ------------------------------------------------------------
-- 3. Tabelas de backup: fecha o acesso (não apaga nada).
-- ------------------------------------------------------------
REVOKE ALL ON public._backup_faturas_duplicadas_20260826 FROM anon, authenticated;
REVOKE ALL ON public._backup_tags_20260829               FROM anon, authenticated;
ALTER TABLE public._backup_faturas_duplicadas_20260826 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_tags_20260829               ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 4. Funções SECURITY DEFINER: só quem precisa chama.
-- ------------------------------------------------------------
-- 4a. clone_demo_data: continua disponível ao usuário logado (o modo demo
--     usa), mas só para a PRÓPRIA conta. Antes qualquer pessoa apagava e
--     substituía os dados de qualquer UUID.
--     Como: a função original vira clone_demo_data_internal (privada) e uma
--     nova clone_demo_data(uuid) faz a checagem antes de chamar a original.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'clone_demo_data_internal'
  ) THEN
    ALTER FUNCTION public.clone_demo_data(uuid) RENAME TO clone_demo_data_internal;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.clone_demo_data_internal(uuid) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.clone_demo_data(new_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND new_uid <> auth.uid() THEN
    RAISE EXCEPTION 'Só é possível carregar a demonstração na própria conta.';
  END IF;
  PERFORM public.clone_demo_data_internal(new_uid);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clone_demo_data(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.clone_demo_data(uuid) TO authenticated, service_role;

-- 4b. Recalcular saldo / fatura: o app chama, mas só para contas do próprio usuário.
CREATE OR REPLACE FUNCTION public.recalculate_account_balance(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_initial_balance DECIMAL(12,2);
    v_total_transactions DECIMAL(12,2);
    v_total_investments DECIMAL(12,2);
    v_account_type TEXT;
    v_owner uuid;
BEGIN
    SELECT initial_balance, type, user_id INTO v_initial_balance, v_account_type, v_owner
    FROM public.accounts WHERE id = p_account_id;

    -- Usuário logado só recalcula a própria conta (servidor/trigger passam).
    IF auth.uid() IS NOT NULL AND v_owner IS DISTINCT FROM auth.uid() THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(
        CASE
            WHEN type = 'INCOME' THEN COALESCE(paid_amount, 0)
            WHEN type = 'EXPENSE' OR type = 'BILL_PAYMENT' THEN -COALESCE(paid_amount, 0)
            WHEN type = 'ADJUSTMENT' THEN COALESCE(paid_amount, 0)
            WHEN type = 'TRANSFER'
                 AND metadata->>'affects_balance' = 'true'
                 AND metadata->>'transfer_side' = 'DESTINATION' THEN COALESCE(paid_amount, 0)
            WHEN type = 'TRANSFER'
                 AND metadata->>'affects_balance' = 'true'
                 AND metadata->>'transfer_side' = 'SOURCE' THEN -COALESCE(paid_amount, 0)
            ELSE 0
        END
    ), 0) INTO v_total_transactions
    FROM public.transactions
    WHERE account_id = p_account_id AND is_deleted = false;

    IF v_account_type = 'INVESTMENT' THEN
        SELECT COALESCE(SUM(estimated_value), 0) INTO v_total_investments
        FROM public.physical_assets
        WHERE category = 'INVESTMENT' AND is_archived = false AND metadata->>'brokerAccountId' = p_account_id::text;
    ELSE
        v_total_investments := 0;
    END IF;

    UPDATE public.accounts
    SET current_balance = v_initial_balance + v_total_transactions + v_total_investments
    WHERE id = p_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_card_statement_total(p_statement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total  numeric := 0;
  v_mirror numeric := 0;
  v_owner  uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.card_statements WHERE id = p_statement_id;
  IF auth.uid() IS NOT NULL AND v_owner IS DISTINCT FROM auth.uid() THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total
  FROM public.card_transactions
  WHERE statement_id = p_statement_id;

  UPDATE public.card_statements
  SET total_amount = v_total
  WHERE id = p_statement_id
    AND total_amount IS DISTINCT FROM v_total;

  v_mirror := GREATEST(v_total, 0);

  UPDATE public.transactions
  SET amount = v_mirror
  WHERE metadata->>'card_statement_id' = p_statement_id::text
    AND COALESCE(is_paid, false) = false
    AND COALESCE(is_deleted, false) = false
    AND amount IS DISTINCT FROM v_mirror;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalculate_account_balance(uuid)      FROM anon;
REVOKE EXECUTE ON FUNCTION public.recalculate_card_statement_total(uuid) FROM anon;

-- 4c. Funções que nenhuma tela chama: só o servidor.
REVOKE EXECUTE ON FUNCTION public.auto_confirm_demo_users()                          FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                                  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_physical_asset_change_trigger()                 FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_account_balance_trigger()                   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_top_ai_consumers(integer)                       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_trials_expiring(integer)                        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ai_usage_current_month(uuid)                   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_ai_usage(uuid, text, integer)            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_feature_access(uuid, text)                   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_abandoned_demo_users(integer)              FROM anon, authenticated;
-- is_current_user_admin() e is_superadmin() ficam como estão: as políticas RLS
-- da landing e do painel dependem delas (revogar quebraria a página inicial).

-- ------------------------------------------------------------
-- 5. Cupons: some a leitura pública de TODOS os cupons (inclusive inativos).
--    Fica a leitura de cupons ativos para usuários logados e o acesso do admin.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Coupons public read" ON public.coupons;

-- ------------------------------------------------------------
-- 6. Conferência (opcional): deve listar o trigger e nenhum grant para anon.
-- ------------------------------------------------------------
-- SELECT tgname FROM pg_trigger WHERE tgname = 'trg_protect_profile_privileges';
-- SELECT table_name, grantee FROM information_schema.table_privileges
--  WHERE table_schema = 'public' AND grantee = 'anon' AND table_name LIKE 'admin\_%';
