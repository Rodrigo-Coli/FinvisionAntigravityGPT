-- ============================================================================
-- Investimentos: transferência entre bolsos, índices de mercado e aporte inicial
-- Aplicado em 26/07/2026.
--
-- Contexto do problema:
--   1) Resgate de investimento somava o valor no saldo INICIAL da conta destino e
--      ainda criava uma transação TRANSFER. Como TRANSFER não movia saldo nenhum,
--      o dinheiro entrava "por fora"; e quando o mesmo crédito chegava pelo extrato
--      do banco e era conciliado, contava duas vezes.
--   2) CDI (10,4%) e IPCA (4%) estavam chumbados no código.
--   3) Investimentos criados antes do extrato de movimentações não tinham o aporte
--      inicial registrado, então o custo somado dos aportes ficava zerado.
-- ============================================================================

-- ── 1. Transferências passam a mover saldo, mas só as novas ─────────────────
-- Lançamentos TRANSFER antigos continuam neutros de propósito: os saldos atuais
-- foram conferidos na mão com eles neutros, e ligá-los retroativamente mudaria
-- saldo que o usuário já tinha acertado. Só conta quem nasce com affects_balance.
CREATE OR REPLACE FUNCTION public.recalculate_account_balance(p_account_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_initial_balance DECIMAL(12,2);
    v_total_transactions DECIMAL(12,2);
    v_total_investments DECIMAL(12,2);
    v_account_type TEXT;
BEGIN
    SELECT initial_balance, type INTO v_initial_balance, v_account_type FROM public.accounts WHERE id = p_account_id;

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
$function$;

-- ── 2. Índices de mercado por usuário (CDI, IPCA, IGP-M) ────────────────────
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS market_indexes jsonb NOT NULL
  DEFAULT '{"cdi": 10.4, "ipca": 4.0, "igpm": 4.0}'::jsonb;

-- ── 3. Backfill do aporte inicial ───────────────────────────────────────────
-- Custo do investimento passou a ser a soma dos APORTEs do extrato. Investimentos
-- antigos, criados antes de o extrato existir, não tinham nenhum aporte gravado.
INSERT INTO investment_movements (user_id, asset_id, movement_type, amount, movement_date, notes)
SELECT p.user_id, p.id, 'APORTE',
       COALESCE((p.metadata->>'purchaseValue')::numeric, (p.metadata->>'initialInvestmentAmount')::numeric),
       COALESCE(p.acquisition_date, CURRENT_DATE),
       'Aporte inicial (cadastro)'
FROM physical_assets p
WHERE p.category = 'INVESTMENT'
  AND COALESCE((p.metadata->>'purchaseValue')::numeric, (p.metadata->>'initialInvestmentAmount')::numeric, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM investment_movements m
    WHERE m.asset_id = p.id AND m.movement_type = 'APORTE'
  );

NOTIFY pgrst, 'reload schema';
