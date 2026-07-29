-- ============================================================================
-- Contas vinculadas por instituição ("bolsos")
-- Aplicado em 26/07/2026.
--
-- Corrente, poupança e conta de investimento da mesma instituição continuam sendo
-- linhas separadas em accounts — cada uma tem saldo, extrato e tributação próprios,
-- e a conta de investimento é a que os ativos apontam via metadata.brokerAccountId.
-- O que faltava era juntá-las visualmente. group_key é só um rótulo compartilhado:
-- contas com o mesmo rótulo viram um card único na tela de Contas, com os saldos
-- discriminados por tipo.
--
-- Optamos por vincular em vez de FUNDIR as contas de verdade porque fundir seria
-- irreversível e destruiria justamente a separação entre "o que está em conta" e
-- "o que está investido" — o saldo do bolso corrente e do bolso investimento
-- passariam a ser um número só, sem como reconstruir a divisão depois.
-- ============================================================================

ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS group_key text;

CREATE INDEX IF NOT EXISTS idx_accounts_group_key
  ON public.accounts (user_id, group_key)
  WHERE group_key IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- Exemplo de vinculação (feita pela tela de Contas, botão de vincular):
--   UPDATE public.accounts SET group_key = 'Safra Rodrigo'
--   WHERE id IN ('<conta-corrente>', '<conta-investimento>');
--
-- Para desvincular: UPDATE public.accounts SET group_key = NULL WHERE id = '<conta>';
