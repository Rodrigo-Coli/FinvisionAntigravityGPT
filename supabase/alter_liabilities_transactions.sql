-- 1. Altering Liabilities Table to support Recurrence Data
ALTER TABLE public.liabilities 
ADD COLUMN IF NOT EXISTS installment_amount NUMERIC(15, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS installments_remaining INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS due_day INTEGER CHECK (due_day >= 1 AND due_day <= 31);

-- 2. Altering Transactions Table to link to Liabilities and identify Amortizations
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS liability_id UUID REFERENCES public.liabilities(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS is_amortization BOOLEAN DEFAULT FALSE;

-- 3. We also need to ensure the index for faster querying by liability
CREATE INDEX IF NOT EXISTS idx_transactions_liability_id ON public.transactions(liability_id);

-- Optional: Update RLS if needed, although policies on transactions are usually general 
-- for the user_id, which still applies.
