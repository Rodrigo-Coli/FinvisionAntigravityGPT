-- Corrige a restrição de períodos de recorrência para aceitar 'custom'
ALTER TABLE public.card_transactions DROP CONSTRAINT IF EXISTS card_transactions_recurrence_period_check;
ALTER TABLE public.card_transactions ADD CONSTRAINT card_transactions_recurrence_period_check CHECK (recurrence_period IN ('weekly', 'monthly', 'yearly', 'biweekly', 'custom'));

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_recurrence_period_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_recurrence_period_check CHECK (recurrence_period IN ('weekly', 'monthly', 'yearly', 'biweekly', 'custom'));

-- Notifica o PostgREST para recarregar o schema
NOTIFY pgrst, 'reload schema';
