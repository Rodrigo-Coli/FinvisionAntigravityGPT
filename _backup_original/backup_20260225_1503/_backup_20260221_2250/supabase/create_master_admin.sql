-- ==========================================
-- FINVISION PRO - MASTER ADMIN ELEVATION
-- ==========================================

-- PASSO 1: O usuário rodrigocolicg@gmail.com deve se cadastrar no App primeiro.

-- PASSO 2: Após o cadastro, execute este SQL no Editor do Supabase:

UPDATE public.profiles
SET 
    role = 'admin', 
    is_approved = true
WHERE email = 'rodrigocolicg@gmail.com';

-- PASSO 3: Criar as configurações padrão de usuário (opcional se já houver trigger)
INSERT INTO public.user_settings (user_id)
SELECT id FROM public.profiles WHERE email = 'rodrigocolicg@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- VERIFICAÇÃO: Execute este comando para confirmar
SELECT * FROM public.profiles WHERE email = 'rodrigocolicg@gmail.com';
