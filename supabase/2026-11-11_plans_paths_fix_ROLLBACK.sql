-- DESFAZ 2026-11-11_plans_paths_fix.sql. Só rode se algo parar de funcionar.

-- 1) handle_new_user exatamente como era antes de 11/11/2026
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_trial_plan_id UUID;
    v_trial_days INT;
BEGIN
    -- Create profile
    INSERT INTO public.profiles (id, email, role, is_approved)
    VALUES (NEW.id, NEW.email, 'user', true)
    ON CONFLICT (id) DO NOTHING;

    -- Find the Pro plan (or first available paid plan with trial)
    SELECT id, trial_days INTO v_trial_plan_id, v_trial_days
    FROM public.plans
    WHERE is_active = true AND trial_days > 0
    ORDER BY sort_order ASC
    LIMIT 1;

    -- If no trial plan found, use first active plan
    IF v_trial_plan_id IS NULL THEN
        SELECT id INTO v_trial_plan_id FROM public.plans WHERE is_active = true LIMIT 1;
        v_trial_days := 0;
    END IF;

    -- Create subscription
    IF v_trial_plan_id IS NOT NULL THEN
        INSERT INTO public.subscriptions (user_id, plan_id, status, trial_ends_at, current_period_end)
        VALUES (
            NEW.id,
            v_trial_plan_id,
            CASE WHEN v_trial_days > 0 THEN 'trialing' ELSE 'active' END,
            CASE WHEN v_trial_days > 0 THEN now() + (v_trial_days || ' days')::INTERVAL ELSE NULL END,
            CASE WHEN v_trial_days > 0 THEN now() + (v_trial_days || ' days')::INTERVAL ELSE now() + INTERVAL '1 year' END
        )
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN NEW;
END;
$function$;

-- 2) (a função set_active_account pode ficar; para remover:)
-- DROP FUNCTION IF EXISTS public.set_active_account(uuid);

-- 3) papel do superadmin volta para 'user'
UPDATE public.profiles SET role = 'user' WHERE is_superadmin = true;

-- 4) plano gratuito volta a não ter essas três chaves
UPDATE public.plans SET features = features - 'ai_categorize' - 'whatsapp_messages' - 'whatsapp_voice' WHERE slug = 'starter';
