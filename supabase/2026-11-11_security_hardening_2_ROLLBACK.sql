-- DESFAZ 2026-11-11_security_hardening_2.sql (volta ao estado de antes de 11/11/2026).
-- Só rode se alguma coisa parar de funcionar por causa daquela mudança.
GRANT EXECUTE ON FUNCTION public.fn_top_ai_consumers(integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_trials_expiring(integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage(uuid, text, integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ai_usage_current_month(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_feature_access(uuid, text) TO PUBLIC;

ALTER FUNCTION public.handle_new_user() RESET search_path;
ALTER FUNCTION public.update_account_balance_trigger() RESET search_path;
ALTER FUNCTION public.on_card_transaction_change_trigger() RESET search_path;
ALTER FUNCTION public.on_physical_asset_change_trigger() RESET search_path;
ALTER FUNCTION public.clone_demo_data_internal(uuid) RESET search_path;
ALTER FUNCTION public.renew_property_recurrences(integer, integer) RESET search_path;
ALTER FUNCTION public.cleanup_abandoned_demo_users(integer) RESET search_path;
