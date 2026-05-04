-- DATA MIGRATION: Garante que os dados existentes apareçam no sistema novo
-- 1. Copia o nome antigo para a coluna nova "institution" se estiver vazia
UPDATE public.accounts 
SET institution = "name" 
WHERE (institution IS NULL OR institution = 'Banco') AND "name" IS NOT NULL;

-- 2. Garante que as contas não fiquem escondidas por estarem "nulas" no campo de arquivamento
UPDATE public.accounts 
SET is_archived = false 
WHERE is_archived IS NULL;

-- 3. Garante que apareçam no Dashboard por padrão
UPDATE public.accounts 
SET include_in_dashboard = true 
WHERE include_in_dashboard IS NULL;

-- 4. Garante que tenham saldo (mesmo que zero) para evitar erros de cálculo
UPDATE public.accounts 
SET current_balance = COALESCE(initial_balance, 0) 
WHERE current_balance IS NULL;
