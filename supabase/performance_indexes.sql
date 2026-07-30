-- ============================================================================
-- Índices de performance — aplicado em 29/07/2026.
--
-- Diagnóstico: transactions tinha índice só em (user_id) e (date) separados, e
-- NENHUM em account_id. Como recalculate_account_balance() roda em TODO
-- insert/update/delete de transação (gatilho trg_update_account_balance) e filtra
-- por account_id, cada lançamento fazia varredura completa da tabela.
--
-- Medição antes (conta com 1.012 lançamentos, tabela com 4.949):
--   Seq Scan on transactions ... Rows Removed by Filter: 4484
-- Depois:
--   Bitmap Index Scan on idx_transactions_account_active
--
-- O custo cresce junto com o total de lançamentos do usuário, então o efeito
-- aparece justamente em quem já usa o app há mais tempo — e multiplica ao criar
-- uma série de parcelas, porque o gatilho dispara uma vez por parcela.
-- ============================================================================

-- Saldo da conta (gatilho) e a conferência de duplicidade no destino da conciliação.
CREATE INDEX IF NOT EXISTS idx_transactions_account_active
  ON public.transactions (account_id) WHERE is_deleted = false;

-- Listagem por período (tela de Transações, relatórios, Home).
CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON public.transactions (user_id, date DESC) WHERE is_deleted = false;

-- Projeção de fluxo: pendências por usuário/data.
CREATE INDEX IF NOT EXISTS idx_transactions_user_unpaid
  ON public.transactions (user_id, date) WHERE is_deleted = false AND is_paid = false;

-- Lançamentos vinculados a um bem/empréstimo (extrato do ativo).
CREATE INDEX IF NOT EXISTS idx_transactions_linked_asset
  ON public.transactions ((metadata->>'linked_asset_id')) WHERE is_deleted = false;

-- Séries recorrentes.
CREATE INDEX IF NOT EXISTS idx_transactions_recurrence_group
  ON public.transactions (recurrence_group_id) WHERE recurrence_group_id IS NOT NULL;

-- Cartões: extrato por cartão e por fatura.
CREATE INDEX IF NOT EXISTS idx_card_transactions_card_date
  ON public.card_transactions (card_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_card_transactions_statement
  ON public.card_transactions (statement_id);

CREATE INDEX IF NOT EXISTS idx_card_statements_card
  ON public.card_statements (card_id, year DESC, month DESC);

-- Investimentos por corretora (usado pelo mesmo recalculate_account_balance
-- quando a conta é do tipo INVESTMENT) e extrato de movimentações.
CREATE INDEX IF NOT EXISTS idx_physical_assets_broker
  ON public.physical_assets ((metadata->>'brokerAccountId')) WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_investment_movements_asset
  ON public.investment_movements (asset_id, movement_date);

ANALYZE public.transactions;
ANALYZE public.card_transactions;
ANALYZE public.card_statements;
ANALYZE public.physical_assets;
ANALYZE public.investment_movements;
