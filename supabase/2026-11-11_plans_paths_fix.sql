-- Caminhos dos planos (11/11/2026) — JÁ APLICADO em produção nesta data.
-- Para desfazer: 2026-11-11_plans_paths_fix_ROLLBACK.sql
--
-- 1) handle_new_user: o teste grátis passa a ser no plano escolhido na página de
--    preços (cadastro manda `selected_plan`); sem escolha, no plano mais completo.
--    Antes caía sempre no plano pago mais barato, sem IA nem patrimônio.
--    A demonstração (demo+...@finvision.app) continua como era.
-- 2) set_active_account(conta): grava a conta ativa de quem caiu para o plano
--    gratuito. O app gravava direto na tabela de assinaturas, que é somente
--    leitura para o usuário: nada era salvo e a tela de escolha não saía mais.
-- 3) A conta superadmin estava com papel 'user'; as regras de planos, cupons e
--    assinaturas exigem 'admin' (salvar um plano no painel gravava 0 linhas).
-- 4) Plano gratuito: categorização por IA e WhatsApp ficam bloqueados (não tinham
--    limite nenhum). Planos pagos não mudam.
--
-- O texto completo das funções está na migração `plans_paths_fix_20261111` do
-- Supabase (Database > Migrations). Resumo do que roda:

-- CREATE OR REPLACE FUNCTION public.handle_new_user() ...   (ver migração)
-- CREATE OR REPLACE FUNCTION public.set_active_account(p_account_id uuid) ... (ver migração)
REVOKE EXECUTE ON FUNCTION public.set_active_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_account(uuid) TO authenticated, service_role;

UPDATE public.profiles SET role = 'admin' WHERE is_superadmin = true AND role <> 'admin';

UPDATE public.plans
   SET features = features || '{"ai_categorize": false, "whatsapp_messages": false, "whatsapp_voice": false}'::jsonb
 WHERE slug = 'starter';
