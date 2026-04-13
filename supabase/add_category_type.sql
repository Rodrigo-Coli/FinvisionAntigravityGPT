-- Add type column to categories
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='categories' AND column_name='type') THEN
        ALTER TABLE public.categories ADD COLUMN type TEXT;
    END IF;
END $$;

-- Populate existing categories based on transactions
-- If a category has only INCOME transactions, set type='INCOME'
-- If a category has only EXPENSE transactions, set type='EXPENSE'
-- If it has both or none, leave as null (users can set it later, or default to EXPENSE in UI)
UPDATE public.categories c
SET type = (
    SELECT
        CASE
            WHEN SUM(CASE WHEN t.type = 'INCOME' THEN 1 ELSE 0 END) > 0 AND SUM(CASE WHEN t.type = 'EXPENSE' THEN 1 ELSE 0 END) = 0 THEN 'INCOME'
            WHEN SUM(CASE WHEN t.type = 'EXPENSE' THEN 1 ELSE 0 END) > 0 AND SUM(CASE WHEN t.type = 'INCOME' THEN 1 ELSE 0 END) = 0 THEN 'EXPENSE'
            ELSE 'EXPENSE' -- Default to EXPENSE for ambiguous or unused categories, to be safe.
        END
    FROM public.transactions t
    WHERE t.category = c.name AND t.user_id = c.user_id
)
WHERE c.type IS NULL;

-- If still null (no transactions at all, fallback to EXPENSE)
UPDATE public.categories SET type = 'EXPENSE' WHERE type IS NULL;
