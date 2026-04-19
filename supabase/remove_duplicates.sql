-- Script to Remove Duplicated Categories and Accounts

-- 1. Cleaning Duplicate Categories
-- This retains only the oldest category for a given normalized name per user.
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER(PARTITION BY user_id, LOWER(TRIM(name)) ORDER BY created_at ASC) as rnum
  FROM public.categories
)
DELETE FROM public.categories
WHERE id IN (SELECT id FROM duplicates WHERE rnum > 1);

-- 2. Cleaning Duplicate Accounts
-- This retains only the oldest account for a given normalized institution per user.
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER(PARTITION BY user_id, LOWER(TRIM(institution)) ORDER BY created_at ASC) as rnum
  FROM public.accounts
)
DELETE FROM public.accounts
WHERE id IN (SELECT id FROM duplicates WHERE rnum > 1);

-- 3. Cleaning Duplicate Cards
-- Just in case cards were duplicated too.
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER(PARTITION BY user_id, LOWER(TRIM(name)) ORDER BY created_at ASC) as rnum
  FROM public.cards
)
DELETE FROM public.cards
WHERE id IN (SELECT id FROM duplicates WHERE rnum > 1);

SELECT 'Limpeza de duplicatas concluída com sucesso!' as status;
