-- ==========================================
-- FINVISION PRO - DISABLING APPROVAL SYSTEM
-- ==========================================

-- 1. Aprovar todos os usuários existentes agora
UPDATE public.profiles SET is_approved = true;

-- 2. Alterar o padrão da tabela para que novos usuários já nasçam aprovados
ALTER TABLE public.profiles ALTER COLUMN is_approved SET DEFAULT true;

-- VERIFICAÇÃO
SELECT email, is_approved FROM public.profiles;
