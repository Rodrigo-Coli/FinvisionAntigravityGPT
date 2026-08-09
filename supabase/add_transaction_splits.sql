-- Feature: dividir um lançamento (transactions ou card_transactions) em pedaços
-- com categoria/subcategoria/valor próprios, mantendo o `amount` da linha pai
-- intacto (fatura de cartão e saldo de conta continuam batendo, pois os
-- triggers trg_update_card_statement_total e trg_update_account_balance
-- somam a coluna `amount` da linha pai, que nunca é tocada por esta feature).

CREATE TABLE IF NOT EXISTS public.transaction_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('transaction', 'card_transaction')),
  source_id uuid NOT NULL,
  category text NOT NULL,
  subcategory text,
  category_id uuid,
  amount numeric NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transaction_splits_source ON public.transaction_splits (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_transaction_splits_user ON public.transaction_splits (user_id);

ALTER TABLE public.transaction_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User isolation" ON public.transaction_splits;
CREATE POLICY "User isolation" ON public.transaction_splits
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS has_splits boolean NOT NULL DEFAULT false;
ALTER TABLE public.card_transactions ADD COLUMN IF NOT EXISTS has_splits boolean NOT NULL DEFAULT false;

-- Grava (substitui) o conjunto de pedaços de um lançamento de forma atômica:
-- valida que a soma bate com o valor total do lançamento pai, apaga os
-- pedaços antigos, insere os novos e atualiza a flag has_splits.
-- Chamar com p_splits = '[]' remove a divisão (volta ao normal).
CREATE OR REPLACE FUNCTION public.save_transaction_splits(
  p_source_type text,
  p_source_id uuid,
  p_splits jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_parent_amount numeric;
  v_splits_sum numeric := 0;
  v_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_source_type NOT IN ('transaction', 'card_transaction') THEN
    RAISE EXCEPTION 'source_type inválido: %', p_source_type;
  END IF;

  IF p_source_type = 'transaction' THEN
    SELECT amount INTO v_parent_amount FROM public.transactions WHERE id = p_source_id AND user_id = v_user_id;
  ELSE
    SELECT amount INTO v_parent_amount FROM public.card_transactions WHERE id = p_source_id AND user_id = v_user_id;
  END IF;

  IF v_parent_amount IS NULL THEN
    RAISE EXCEPTION 'Lançamento não encontrado';
  END IF;

  SELECT COALESCE(SUM((elem->>'amount')::numeric), 0), COUNT(*)
    INTO v_splits_sum, v_count
  FROM jsonb_array_elements(COALESCE(p_splits, '[]'::jsonb)) elem;

  IF v_count > 0 AND ROUND(v_splits_sum, 2) <> ROUND(v_parent_amount, 2) THEN
    RAISE EXCEPTION 'A soma dos pedaços (%) precisa ser igual ao valor total do lançamento (%)', v_splits_sum, v_parent_amount;
  END IF;

  DELETE FROM public.transaction_splits
   WHERE source_type = p_source_type AND source_id = p_source_id AND user_id = v_user_id;

  IF v_count > 0 THEN
    INSERT INTO public.transaction_splits (user_id, source_type, source_id, category, subcategory, category_id, amount, notes)
    SELECT v_user_id, p_source_type, p_source_id,
           elem->>'category',
           NULLIF(elem->>'subcategory', ''),
           NULLIF(elem->>'category_id', '')::uuid,
           (elem->>'amount')::numeric,
           NULLIF(elem->>'notes', '')
    FROM jsonb_array_elements(p_splits) elem;
  END IF;

  IF p_source_type = 'transaction' THEN
    UPDATE public.transactions SET has_splits = (v_count > 0) WHERE id = p_source_id AND user_id = v_user_id;
  ELSE
    UPDATE public.card_transactions SET has_splits = (v_count > 0) WHERE id = p_source_id AND user_id = v_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_transaction_splits(text, uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
