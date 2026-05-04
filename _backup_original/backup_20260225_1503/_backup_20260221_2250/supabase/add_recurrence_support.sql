
-- ==========================================
-- RECURRING AND INSTALLMENT TRANSACTIONS SUPPORT
-- ==========================================

-- 1. Update TRANSACTIONS table
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS recurrence_period TEXT CHECK (recurrence_period IN ('weekly', 'monthly', 'yearly', 'biweekly'));
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS recurrence_group_id UUID;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_installment BOOLEAN DEFAULT false;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS installment_number INT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS installment_total INT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS installment_group_id UUID;

-- 2. Update CARD_TRANSACTIONS table
ALTER TABLE public.card_transactions ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
ALTER TABLE public.card_transactions ADD COLUMN IF NOT EXISTS recurrence_period TEXT CHECK (recurrence_period IN ('weekly', 'monthly', 'yearly', 'biweekly'));
ALTER TABLE public.card_transactions ADD COLUMN IF NOT EXISTS recurrence_group_id UUID;
ALTER TABLE public.card_transactions ADD COLUMN IF NOT EXISTS is_installment BOOLEAN DEFAULT false;
ALTER TABLE public.card_transactions ADD COLUMN IF NOT EXISTS installment_number INT;
ALTER TABLE public.card_transactions ADD COLUMN IF NOT EXISTS installment_total INT;
ALTER TABLE public.card_transactions ADD COLUMN IF NOT EXISTS installment_group_id UUID;

-- 3. Update IMPORTED_TRANSACTIONS table (Queues)
ALTER TABLE public.imported_transactions ADD COLUMN IF NOT EXISTS installment_number INT;
ALTER TABLE public.imported_transactions ADD COLUMN IF NOT EXISTS installment_total INT;

-- 4. Indices for performance
CREATE INDEX IF NOT EXISTS idx_transactions_inst_group ON public.transactions(installment_group_id);
CREATE INDEX IF NOT EXISTS idx_transactions_rec_group ON public.transactions(recurrence_group_id);
CREATE INDEX IF NOT EXISTS idx_card_transactions_inst_group ON public.card_transactions(installment_group_id);
CREATE INDEX IF NOT EXISTS idx_card_transactions_rec_group ON public.card_transactions(recurrence_group_id);

-- 5. FUNCTION to handle mass update scope (Universal Rule)
-- This function will be called by the API/Frontend to apply changes to multiple records
CREATE OR REPLACE FUNCTION public.apply_transaction_series_update(
    p_group_id UUID,
    p_start_date DATE,
    p_scope TEXT, -- 'ONLY_THIS', 'THIS_AND_FUTURE', 'ONLY_FUTURE', 'ONLY_PAST', 'ALL'
    p_updates JSONB, -- The fields to update
    p_table_name TEXT -- 'transactions' or 'card_transactions'
) RETURNS VOID AS $$
DECLARE
    v_query TEXT;
BEGIN
    v_query := format('UPDATE public.%I SET ', p_table_name);
    
    -- Extract update fields (this is a bit complex in PLpgSQL, usually handled better by creating dynamic SET clauses)
    -- For simplicity in this script, we'll assume the caller passes the SET clause or we handle specific fields
    -- we'll implement a more robust version later if needed, but for now, let's just create the infrastructure.
    
    -- Scope logic will be:
    -- ONLY_THIS: handle in application
    -- THIS_AND_FUTURE: WHERE group_id = p_group_id AND date >= p_start_date
    -- ONLY_FUTURE: WHERE group_id = p_group_id AND date > p_start_date
    -- ONLY_PAST: WHERE group_id = p_group_id AND date < p_start_date
    -- ALL: WHERE group_id = p_group_id
END;
$$ LANGUAGE plpgsql;
