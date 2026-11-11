-- Segurança, 2ª rodada (11/11/2026) — JÁ APLICADO em produção nesta data.
-- Pode rodar de novo sem problema. Para desfazer: 2026-11-11_security_hardening_2_ROLLBACK.sql
-- Não altera nenhum dado nem o corpo de nenhuma função: só permissões e caminho de busca.

-- 1) Funções que nenhuma tela do app usa e que podiam ser chamadas sem login:
--    fn_top_ai_consumers / fn_trials_expiring devolviam e-mail de clientes;
--    increment_ai_usage / get_ai_usage_current_month / check_feature_access aceitavam
--    o id de qualquer usuário. Agora só o servidor (service_role) chama.
REVOKE EXECUTE ON FUNCTION public.fn_top_ai_consumers(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_trials_expiring(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_ai_usage(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ai_usage_current_month(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_feature_access(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_top_ai_consumers(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trials_expiring(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ai_usage_current_month(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_feature_access(uuid, text) TO service_role;

-- 2) Caminho de busca fixo nas funções que ainda não tinham (aviso "search_path
--    mutable" do Supabase). É o mesmo caminho que já valia na prática.
ALTER FUNCTION public.handle_new_user() SET search_path = public, extensions;
ALTER FUNCTION public.update_account_balance_trigger() SET search_path = public, extensions;
ALTER FUNCTION public.on_card_transaction_change_trigger() SET search_path = public, extensions;
ALTER FUNCTION public.on_physical_asset_change_trigger() SET search_path = public, extensions;
ALTER FUNCTION public.clone_demo_data_internal(uuid) SET search_path = public, extensions;
ALTER FUNCTION public.renew_property_recurrences(integer, integer) SET search_path = public, extensions;
ALTER FUNCTION public.cleanup_abandoned_demo_users(integer) SET search_path = public, extensions;

-- De propósito NÃO mexido (o aviso do Supabase continua, mas não há brecha):
--   * funções de gatilho (handle_new_user, update_account_balance_trigger, ...):
--     o Postgres recusa chamada direta de função de gatilho.
--   * is_current_user_admin / is_superadmin: são usadas dentro das regras de acesso
--     das tabelas; tirar a permissão quebraria a leitura dessas tabelas.
--   * recalculate_account_balance / recalculate_card_statement_total /
--     save_transaction_splits / clone_demo_data: já conferem auth.uid() por dentro
--     e são chamadas pelo app em dezenas de telas.
