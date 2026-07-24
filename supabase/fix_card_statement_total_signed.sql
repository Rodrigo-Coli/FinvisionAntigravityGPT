-- fix_card_statement_total_signed.sql
--
-- PROBLEMA
-- A tela de Cartões mostrava um valor de fatura (soma ao vivo dos lançamentos) e a
-- tela de Transações mostrava outro (lançamento espelho "Fatura Cartão: X (M/AAAA)").
--
-- CAUSA
-- 1) fix_security_warnings.sql (endurecimento de search_path) reescreveu
--    recalculate_card_statement_total com SUM(ABS(amount)). Com ABS, um estorno de
--    R$ 74,99 SOMAVA R$ 74,99 na fatura em vez de abater — inflando total_amount.
--    O fix_security_warnings_3_emergency.sql corrigiu as funções de saldo de conta,
--    mas esta ficou para trás. É por isso que a divergência "voltou a acontecer".
-- 2) O lançamento espelho em transactions só era regravado quando a tela de Cartões
--    chamava syncStatementToHistory. Qualquer alteração de lançamento feita por fora
--    (Transações, Conciliação, importação) mudava a fatura e deixava o espelho velho.
--
-- CORREÇÃO
-- - Soma COM SINAL (estorno abate a fatura).
-- - A própria função passa a atualizar o lançamento espelho enquanto ele não estiver
--   pago, então as duas telas não têm como divergir de novo, venha a alteração de onde vier.
-- - Backfill de todas as faturas e espelhos já existentes.

CREATE OR REPLACE FUNCTION public.recalculate_card_statement_total(p_statement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_total  numeric := 0;
  v_mirror numeric := 0;
BEGIN
  -- Soma com sinal: amount negativo em card_transactions é estorno/crédito e abate a fatura.
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total
  FROM public.card_transactions
  WHERE statement_id = p_statement_id;

  UPDATE public.card_statements
  SET total_amount = v_total
  WHERE id = p_statement_id
    AND total_amount IS DISTINCT FROM v_total;

  -- Fatura com saldo credor não vira despesa a pagar no histórico.
  v_mirror := GREATEST(v_total, 0);

  -- Espelho da fatura em Transações: acompanha o total enquanto não estiver pago.
  -- Fatura já paga não é tocada (mexer no valor quebraria o saldo da conta).
  UPDATE public.transactions
  SET amount = v_mirror
  WHERE metadata->>'card_statement_id' = p_statement_id::text
    AND COALESCE(is_paid, false) = false
    AND COALESCE(is_deleted, false) = false
    AND amount IS DISTINCT FROM v_mirror;
END;
$function$;

-- ── BACKFILL 1: faturas com lançamentos ──
UPDATE public.card_statements s
SET total_amount = x.total
FROM (
  SELECT statement_id, COALESCE(SUM(amount), 0) AS total
  FROM public.card_transactions
  WHERE statement_id IS NOT NULL
  GROUP BY statement_id
) x
WHERE x.statement_id = s.id
  AND s.total_amount IS DISTINCT FROM x.total;

-- ── BACKFILL 2: faturas sem nenhum lançamento vinculado ──
UPDATE public.card_statements s
SET total_amount = 0
WHERE s.total_amount <> 0
  AND NOT EXISTS (
    SELECT 1 FROM public.card_transactions ct WHERE ct.statement_id = s.id
  );

-- ── BACKFILL 3: lançamentos espelho ainda em aberto ──
UPDATE public.transactions t
SET amount = GREATEST(s.total_amount, 0)
FROM public.card_statements s
WHERE t.metadata->>'card_statement_id' = s.id::text
  AND COALESCE(t.is_paid, false) = false
  AND COALESCE(t.is_deleted, false) = false
  AND t.amount IS DISTINCT FROM GREATEST(s.total_amount, 0);
