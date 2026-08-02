-- ============================================================
-- LANDING SETTINGS — painel admin da landing page (superadmin)
-- ============================================================
-- Idempotente: pode ser rodado mais de uma vez sem quebrar nada.
-- Não contém nenhum DROP TABLE, DELETE sem WHERE ou TRUNCATE.

-- ============================================================
-- [1] NÍVEL SUPERADMIN
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT false;

-- Helper usado por toda a RLS abaixo. SECURITY DEFINER porque a policy de
-- profiles não libera leitura de outras linhas para um usuário comum —
-- a função precisa rodar com privilégio elevado para checar a própria linha.
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.is_superadmin FROM public.profiles p WHERE p.id = auth.uid()),
    false
  );
$$;

-- ============================================================
-- [2] TABELAS
-- ============================================================

-- Singleton: uma linha só, controlada pelo painel Landing > Oferta/Textos.
CREATE TABLE IF NOT EXISTS public.landing_settings (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    founding_enabled      BOOLEAN NOT NULL DEFAULT false,
    founding_ends_at      TIMESTAMPTZ,
    founding_discount_pct INTEGER NOT NULL DEFAULT 0 CHECK (founding_discount_pct >= 0 AND founding_discount_pct <= 90),
    founding_headline     TEXT,
    hero_headline         TEXT,
    hero_subheadline      TEXT,
    video_url             TEXT,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by            UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.landing_screenshots (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug         TEXT UNIQUE NOT NULL,
    title        TEXT NOT NULL,
    benefit      TEXT NOT NULL,
    image_url    TEXT,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    is_active    BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.landing_testimonials (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote         TEXT NOT NULL,
    name          TEXT NOT NULL,
    role          TEXT,
    city          TEXT,
    photo_url     TEXT,
    result_label  TEXT,
    result_value  TEXT,
    consent_given BOOLEAN NOT NULL DEFAULT false,
    is_active     BOOLEAN NOT NULL DEFAULT false,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Defesa em profundidade: mesmo que a UI falhe, o banco nunca deixa
    -- ativar um depoimento sem consentimento marcado.
    CONSTRAINT landing_testimonials_consent_required CHECK (is_active = false OR consent_given = true)
);

-- ============================================================
-- [3] RLS
-- ============================================================
ALTER TABLE public.landing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_screenshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_testimonials ENABLE ROW LEVEL SECURITY;

-- Leitura pública (a landing não exige login)
DROP POLICY IF EXISTS "landing_settings_public_read" ON public.landing_settings;
CREATE POLICY "landing_settings_public_read"
    ON public.landing_settings FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "landing_screenshots_public_read" ON public.landing_screenshots;
CREATE POLICY "landing_screenshots_public_read"
    ON public.landing_screenshots FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "landing_testimonials_public_read" ON public.landing_testimonials;
CREATE POLICY "landing_testimonials_public_read"
    ON public.landing_testimonials FOR SELECT
    TO anon, authenticated
    USING (true);

-- Escrita: só superadmin (não usa role = 'admin' — admin comum não escreve aqui)
DROP POLICY IF EXISTS "landing_settings_superadmin_write" ON public.landing_settings;
CREATE POLICY "landing_settings_superadmin_write"
    ON public.landing_settings FOR ALL
    TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS "landing_screenshots_superadmin_write" ON public.landing_screenshots;
CREATE POLICY "landing_screenshots_superadmin_write"
    ON public.landing_screenshots FOR ALL
    TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS "landing_testimonials_superadmin_write" ON public.landing_testimonials;
CREATE POLICY "landing_testimonials_superadmin_write"
    ON public.landing_testimonials FOR ALL
    TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

-- ============================================================
-- [4] STORAGE — bucket landing-assets (prints, vídeo, fotos de depoimento)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('landing-assets', 'landing-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "landing_assets_public_read" ON storage.objects;
CREATE POLICY "landing_assets_public_read"
    ON storage.objects FOR SELECT
    TO anon, authenticated
    USING (bucket_id = 'landing-assets');

DROP POLICY IF EXISTS "landing_assets_superadmin_write" ON storage.objects;
CREATE POLICY "landing_assets_superadmin_write"
    ON storage.objects FOR ALL
    TO authenticated
    USING (bucket_id = 'landing-assets' AND public.is_superadmin())
    WITH CHECK (bucket_id = 'landing-assets' AND public.is_superadmin());

-- ============================================================
-- [5] SEED
-- ============================================================
INSERT INTO public.landing_settings (founding_enabled, founding_discount_pct)
SELECT false, 0
WHERE NOT EXISTS (SELECT 1 FROM public.landing_settings);

INSERT INTO public.landing_screenshots (slug, title, benefit, sort_order, is_active) VALUES
    ('dashboard',    'Dashboard Consolidado', 'Saldo total, patrimônio líquido e alertas em uma única tela.',  1, true),
    ('dre',          'DRE Completo',          'Receitas x despesas por categoria, exportável em PDF e Excel.', 2, true),
    ('conciliacao',  'Conciliação por IA',    'Importe o extrato e a IA classifica tudo automaticamente.',     3, true),
    ('patrimonio',   'Patrimônio Completo',   'Imóveis, veículos, investimentos e dívidas no mesmo lugar.',    4, true)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- [6] PROMOÇÃO A SUPERADMIN — NÃO incluso automaticamente.
-- Rode manualmente, um usuário de cada vez, só depois de confirmar o email:
--
-- UPDATE public.profiles SET is_superadmin = true WHERE email = 'SEU_EMAIL_AQUI';
-- ============================================================
