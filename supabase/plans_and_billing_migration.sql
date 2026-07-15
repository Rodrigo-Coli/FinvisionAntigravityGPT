�-- ============================================================
-- FINVISION PRO � BILLING & PLANS MIGRATION (v1.0)
-- ============================================================
-- Data: 2026-06-21
-- Autor: Zyvion Architecture Team
-- IDEMPOTENTE: seguro para re-executar múltiplas vezes.
-- Compatível com: PostgreSQL 15+ / Supabase
--
-- SE�!�"ES:
--   [0] Função helper de updated_at
--   [1] CREATE/UPGRADE da tabela plans
--   [2] CREATE/UPGRADE da tabela subscriptions
--   [3] CREATE tabela ai_usage_log (rastreamento mensal de IA)
--   [4] CREATE tabelas coupons e coupon_uses (se não existirem)
--   [5] UPSERT dos 4 planos: Starter, Essencial, Plus, Pro
--   [6] Functions e Triggers automáticos
--   [7] RLS Policies
--   [8] Views de relatório para admin
-- ============================================================
-- ============================================================
-- [0] FUN�!ÒO HELPER: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
-- ============================================================
-- [1] TABELA: plans
-- Cria a tabela base e adiciona colunas novas se não existirem.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.plans (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    slug        TEXT        NOT NULL UNIQUE,
    description TEXT,
    -- Preços em centavos (evita ponto flutuante)
    price_cents             INTEGER NOT NULL DEFAULT 0,
    price_cents_annual      INTEGER,           -- preço anual (12x com desconto)
    price_cents_semiannual  INTEGER,           -- preço semestral (6x com desconto)
    -- IA
    ai_scans_limit          INTEGER NOT NULL DEFAULT 0,  -- -1 = ilimitado
    -- Limites numéricos de entidades
    max_accounts            INTEGER NOT NULL DEFAULT 1,  -- -1 = ilimitado
    max_cards               INTEGER NOT NULL DEFAULT 0,  -- -1 = ilimitado
    max_categories          INTEGER NOT NULL DEFAULT 10, -- -1 = ilimitado
    max_transactions_per_month INTEGER NOT NULL DEFAULT 50, -- -1 = ilimitado
    max_multi_users         INTEGER NOT NULL DEFAULT 1,  -- usuários adicionais (família)
    -- Features como JSONB � estrutura extensível
    features    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    -- UI/UX
    highlight_label TEXT,                    -- ex: "Mais Popular", "Melhor Custo"
    color_gradient  TEXT,                    -- ex: "from-brand-500 to-brand-700"
    badge_color     TEXT,                    -- ex: "#6366f1"
    -- Controle
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    sort_order  INTEGER     NOT NULL DEFAULT 0,
    trial_days  INTEGER     NOT NULL DEFAULT 0,
    -- Timestamps
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Adicionar colunas novas a tabelas existentes (idempotente)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='price_cents_semiannual') THEN
        ALTER TABLE public.plans ADD COLUMN price_cents_semiannual INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='max_accounts') THEN
        ALTER TABLE public.plans ADD COLUMN max_accounts INTEGER NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='max_cards') THEN
        ALTER TABLE public.plans ADD COLUMN max_cards INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='max_categories') THEN
        ALTER TABLE public.plans ADD COLUMN max_categories INTEGER NOT NULL DEFAULT 10;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='max_transactions_per_month') THEN
        ALTER TABLE public.plans ADD COLUMN max_transactions_per_month INTEGER NOT NULL DEFAULT 50;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='max_multi_users') THEN
        ALTER TABLE public.plans ADD COLUMN max_multi_users INTEGER NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='highlight_label') THEN
        ALTER TABLE public.plans ADD COLUMN highlight_label TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='color_gradient') THEN
        ALTER TABLE public.plans ADD COLUMN color_gradient TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='badge_color') THEN
        ALTER TABLE public.plans ADD COLUMN badge_color TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='updated_at') THEN
        ALTER TABLE public.plans ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    END IF;
END $$;
-- Trigger de updated_at em plans
DROP TRIGGER IF EXISTS trg_plans_updated_at ON public.plans;
CREATE TRIGGER trg_plans_updated_at
    BEFORE UPDATE ON public.plans
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- ============================================================
-- [2] TABELA: subscriptions
-- Adiciona colunas novas se não existirem.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id                 UUID        REFERENCES public.plans(id) ON DELETE SET NULL,
    status                  TEXT        NOT NULL DEFAULT 'trialing'
                            CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'admin_granted', 'paused')),
    billing_period          TEXT        NOT NULL DEFAULT 'monthly'
                            CHECK (billing_period IN ('monthly', 'semiannual', 'annual')),
    -- Datas de ciclo
    trial_ends_at           TIMESTAMPTZ,
    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    canceled_at             TIMESTAMPTZ,
    -- Integração Asaas
    asaas_subscription_id   TEXT,
    asaas_customer_id       TEXT,
    -- Metadados e notas internas
    notes                   TEXT,
    cancel_reason           TEXT,
    metadata                JSONB       DEFAULT '{}'::jsonb,
    -- Timestamps
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Adicionar colunas novas a subscriptions existentes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='billing_period') THEN
        ALTER TABLE public.subscriptions ADD COLUMN billing_period TEXT NOT NULL DEFAULT 'monthly'
            CHECK (billing_period IN ('monthly', 'semiannual', 'annual'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='canceled_at') THEN
        ALTER TABLE public.subscriptions ADD COLUMN canceled_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='cancel_reason') THEN
        ALTER TABLE public.subscriptions ADD COLUMN cancel_reason TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='asaas_customer_id') THEN
        ALTER TABLE public.subscriptions ADD COLUMN asaas_customer_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='metadata') THEN
        ALTER TABLE public.subscriptions ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='updated_at') THEN
        ALTER TABLE public.subscriptions ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    END IF;
END $$;
-- Trigger de updated_at em subscriptions
DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id   ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id   ON public.subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status    ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON public.subscriptions(current_period_end);
-- ============================================================
-- [3] TABELA: ai_usage_log
-- Rastreia consumo de IA por usuário, por mês, por tipo de scan.
-- O period_key usa formato 'YYYY-MM' para facilitar GROUP BY e reset.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Período de billing: 'YYYY-MM' ex: '2026-06'
    period_key  TEXT        NOT NULL,
    -- Tipo de consumo de IA
    scan_type   TEXT        NOT NULL
                CHECK (scan_type IN (
                    'ai_scanner',       -- Scanner de cupom fiscal
                    'ai_comparator',    -- Comparador de preços
                    'ai_diagnosis',     -- Diagnóstico patrimonial
                    'ai_shopping_list', -- Lista de compras inteligente
                    'ai_chat',          -- Chat financeiro (WhatsApp/in-app)
                    'ai_categorize',    -- Categorização automática de transações
                    'ai_reconcile'      -- Conciliação inteligente
                )),
    scans_used  INTEGER     NOT NULL DEFAULT 0,
    -- Data do último reset (para debugging e auditoria)
    last_reset_at TIMESTAMPTZ,
    -- Timestamps
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Cada usuário tem apenas 1 registro por período por tipo
    UNIQUE(user_id, period_key, scan_type)
);
-- Trigger de updated_at em ai_usage_log
DROP TRIGGER IF EXISTS trg_ai_usage_updated_at ON public.ai_usage_log;
CREATE TRIGGER trg_ai_usage_updated_at
    BEFORE UPDATE ON public.ai_usage_log
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_period ON public.ai_usage_log(user_id, period_key);
CREATE INDEX IF NOT EXISTS idx_ai_usage_period      ON public.ai_usage_log(period_key);
CREATE INDEX IF NOT EXISTS idx_ai_usage_type        ON public.ai_usage_log(scan_type);
-- ============================================================
-- [4] TABELAS: coupons e coupon_uses
-- O sistema de cupons já existe no código (apply-coupon.ts)
-- mas pode não ter migration. Criamos aqui de forma idempotente.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.coupons (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT        NOT NULL UNIQUE,
    description     TEXT,
    -- Tipo de desconto
    discount_type   TEXT        NOT NULL
                    CHECK (discount_type IN ('percent', 'fixed', 'free_months', 'plan_override')),
    discount_value  NUMERIC(10,2) DEFAULT 0,  -- % ou R$ ou nº de meses
    free_months     INTEGER     DEFAULT 0,
    -- Override de plano (conceder plano específico)
    plan_override_id UUID       REFERENCES public.plans(id) ON DELETE SET NULL,
    -- Limites de uso
    max_uses        INTEGER,                  -- NULL = ilimitado
    uses_count      INTEGER     NOT NULL DEFAULT 0,
    -- Restrições
    min_plan_slug   TEXT,                     -- só válido para planos >= X
    expires_at      TIMESTAMPTZ,
    -- Controle
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.coupon_uses (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id   UUID        NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    used_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(coupon_id, user_id)  -- cada usuário usa o cupom apenas 1x
);
-- Índices para coupons
CREATE INDEX IF NOT EXISTS idx_coupons_code      ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active    ON public.coupons(is_active);
CREATE INDEX IF NOT EXISTS idx_coupon_uses_user  ON public.coupon_uses(user_id);
-- Trigger de updated_at em coupons
DROP TRIGGER IF EXISTS trg_coupons_updated_at ON public.coupons;
CREATE TRIGGER trg_coupons_updated_at
    BEFORE UPDATE ON public.coupons
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- ============================================================
-- [5] UPSERT DOS 4 PLANOS
-- Usa ON CONFLICT (slug) DO UPDATE para ser idempotente.
-- Preços em centavos: R$19,90 = 1990 centavos.
-- ai_scans_limit: -1 = ilimitado, 0 = sem acesso, N = limite N.
-- features: JSONB com booleanos e números para cada feature.
--   boolean true/false = tem ou não tem acesso
--   número N = limite N (quando -1 = ilimitado)
-- ============================================================
-- ���� PLANO 1: STARTER (Gratuito) ����������������������������������������������������������
INSERT INTO public.plans (
    name, slug, description,
    price_cents, price_cents_annual, price_cents_semiannual,
    ai_scans_limit,
    max_accounts, max_cards, max_categories, max_transactions_per_month, max_multi_users,
    features,
    highlight_label, color_gradient, badge_color,
    is_active, sort_order, trial_days
) VALUES (
    'Starter',
    'starter',
    'Para quem quer começar a organizar as finanças. Gratuito para sempre.',
    -- Preços
    0, 0, 0,
    -- IA: sem acesso
    0,
    -- Limites de entidades
    1,   -- max_accounts: 1 conta bancária
    0,   -- max_cards: sem cartões
    10,  -- max_categories: 10 categorias
    50,  -- max_transactions_per_month: 50 lançamentos/mês
    1,   -- max_multi_users: só o titular
    -- Features JSON
    jsonb_build_object(
        -- CORE NAVEGA�!ÒO
        'dashboard',              true,   -- Dashboard principal
        'accounts',               1,      -- 1 conta bancária
        'cards',                  0,      -- sem cartões
        'categories',             10,     -- até 10 categorias
        -- LAN�!AMENTOS
        'manual_transactions',    50,     -- 50 lançamentos/mês
        'transaction_history',    true,   -- histórico de transações
        -- IMPORTA�!ÒO & CONCILIA�!ÒO
        'ofx_import',             false,  -- sem importação OFX
        'reconcile',              false,  -- sem conciliação bancária
        -- RELAT�RIOS
        'reports_basic',          false,  -- sem relatórios
        'reports_advanced',       false,  -- sem relatórios avançados
        -- IA LABS
        'ai_scanner',             false,  -- sem scanner de cupom
        'ai_comparator',          false,  -- sem comparador de preços
        'ai_diagnosis',           false,  -- sem diagnóstico patrimonial
        'ai_shopping_list',       false,  -- sem lista de compras IA
        'ai_chat',                false,  -- sem chat IA
        -- PLANEJAMENTO
        'goals',                  false,  -- sem metas
        'budgets',                false,  -- sem orçamentos
        -- PATRIM�NIO
        'physical_assets',        false,  -- sem bens físicos
        'liabilities',            false,  -- sem passivos/dívidas
        -- NOTIFICA�!�"ES
        'push_notifications',     false,  -- sem push
        'whatsapp_notifications', false,  -- sem WhatsApp
        -- FAMÍLIA & SUPORTE
        'multi_user',             1,      -- só titular
        'priority_support',       false   -- suporte padrão
    ),
    -- UI
    NULL,                              -- sem badge especial
    'from-slate-600 to-slate-800',     -- gradiente cinza
    '#64748b',                         -- cor slate
    -- Controle
    true, 0, 0
)
ON CONFLICT (slug) DO UPDATE SET
    name                      = EXCLUDED.name,
    description               = EXCLUDED.description,
    price_cents               = EXCLUDED.price_cents,
    price_cents_annual        = EXCLUDED.price_cents_annual,
    price_cents_semiannual    = EXCLUDED.price_cents_semiannual,
    ai_scans_limit            = EXCLUDED.ai_scans_limit,
    max_accounts              = EXCLUDED.max_accounts,
    max_cards                 = EXCLUDED.max_cards,
    max_categories            = EXCLUDED.max_categories,
    max_transactions_per_month = EXCLUDED.max_transactions_per_month,
    max_multi_users           = EXCLUDED.max_multi_users,
    features                  = EXCLUDED.features,
    highlight_label           = EXCLUDED.highlight_label,
    color_gradient            = EXCLUDED.color_gradient,
    badge_color               = EXCLUDED.badge_color,
    is_active                 = EXCLUDED.is_active,
    sort_order                = EXCLUDED.sort_order,
    trial_days                = EXCLUDED.trial_days,
    updated_at                = now();
-- ���� PLANO 2: ESSENCIAL (~R$19,90/mês) ����������������������������������������������
INSERT INTO public.plans (
    name, slug, description,
    price_cents, price_cents_annual, price_cents_semiannual,
    ai_scans_limit,
    max_accounts, max_cards, max_categories, max_transactions_per_month, max_multi_users,
    features,
    highlight_label, color_gradient, badge_color,
    is_active, sort_order, trial_days
) VALUES (
    'Essencial',
    'essencial',
    'Controle financeiro completo para uso pessoal. Contas, cartões e importação de extratos.',
    -- Preços: R$19,90/mês | R$15,92/mês no anual (desconto 20%) | R$17,91/mês no semestral (desconto 10%)
    1990,               -- R$19,90/mês
    19104,              -- R$191,04/ano (R$15,92/mês, -20%)
    10746,              -- R$107,46/semestre (R$17,91/mês, -10%)
    -- IA: sem scans de IA
    0,
    -- Limites de entidades
    3,    -- max_accounts: até 3 contas bancárias
    2,    -- max_cards: até 2 cartões de crédito
    -1,   -- max_categories: ilimitado
    -1,   -- max_transactions_per_month: ilimitado
    1,    -- max_multi_users: só o titular
    -- Features JSON
    jsonb_build_object(
        -- CORE NAVEGA�!ÒO
        'dashboard',              true,
        'accounts',               3,      -- até 3 contas
        'cards',                  2,      -- até 2 cartões
        'categories',             -1,     -- categorias ilimitadas
        -- LAN�!AMENTOS
        'manual_transactions',    -1,     -- lançamentos ilimitados
        'transaction_history',    true,
        -- IMPORTA�!ÒO & CONCILIA�!ÒO
        'ofx_import',             true,   -- importação de extrato OFX/CSV
        'reconcile',              true,   -- conciliação bancária
        -- RELAT�RIOS
        'reports_basic',          true,   -- relatórios básicos (fluxo de caixa, categorias)
        'reports_advanced',       false,  -- sem relatórios avançados
        -- IA LABS
        'ai_scanner',             false,  -- sem scanner de cupom
        'ai_comparator',          false,
        'ai_diagnosis',           false,
        'ai_shopping_list',       false,
        'ai_chat',                false,
        -- PLANEJAMENTO
        'goals',                  false,  -- sem metas financeiras
        'budgets',                false,  -- sem orçamentos
        -- PATRIM�NIO
        'physical_assets',        false,
        'liabilities',            false,
        -- NOTIFICA�!�"ES
        'push_notifications',     true,   -- notificações push básicas
        'whatsapp_notifications', false,
        -- FAMÍLIA & SUPORTE
        'multi_user',             1,
        'priority_support',       false
    ),
    -- UI
    'Boa Entrada',                      -- badge
    'from-emerald-500 to-teal-700',     -- gradiente verde
    '#10b981',
    -- Controle
    true, 1, 14   -- 14 dias de trial
)
ON CONFLICT (slug) DO UPDATE SET
    name                      = EXCLUDED.name,
    description               = EXCLUDED.description,
    price_cents               = EXCLUDED.price_cents,
    price_cents_annual        = EXCLUDED.price_cents_annual,
    price_cents_semiannual    = EXCLUDED.price_cents_semiannual,
    ai_scans_limit            = EXCLUDED.ai_scans_limit,
    max_accounts              = EXCLUDED.max_accounts,
    max_cards                 = EXCLUDED.max_cards,
    max_categories            = EXCLUDED.max_categories,
    max_transactions_per_month = EXCLUDED.max_transactions_per_month,
    max_multi_users           = EXCLUDED.max_multi_users,
    features                  = EXCLUDED.features,
    highlight_label           = EXCLUDED.highlight_label,
    color_gradient            = EXCLUDED.color_gradient,
    badge_color               = EXCLUDED.badge_color,
    is_active                 = EXCLUDED.is_active,
    sort_order                = EXCLUDED.sort_order,
    trial_days                = EXCLUDED.trial_days,
    updated_at                = now();
-- ���� PLANO 3: PLUS (~R$39,90/mês) ��������������������������������������������������������
INSERT INTO public.plans (
    name, slug, description,
    price_cents, price_cents_annual, price_cents_semiannual,
    ai_scans_limit,
    max_accounts, max_cards, max_categories, max_transactions_per_month, max_multi_users,
    features,
    highlight_label, color_gradient, badge_color,
    is_active, sort_order, trial_days
) VALUES (
    'Plus',
    'plus',
    'Para quem quer usar IA para controlar gastos e comparar preços. Inclui metas e orçamentos.',
    -- Preços: R$39,90/mês | R$31,92/mês no anual (-20%) | R$35,91/mês no semestral (-10%)
    3990,               -- R$39,90/mês
    38304,              -- R$383,04/ano (R$31,92/mês, -20%)
    21546,              -- R$215,46/semestre (R$35,91/mês, -10%)
    -- IA: 15 scans/mês (combinado entre scanner, comparador e lista)
    15,
    -- Limites
    -1,   -- contas ilimitadas
    -1,   -- cartões ilimitados
    -1,   -- categorias ilimitadas
    -1,   -- transações ilimitadas
    2,    -- até 2 usuários (titular + cônjuge)
    -- Features JSON
    jsonb_build_object(
        -- CORE NAVEGA�!ÒO
        'dashboard',              true,
        'accounts',               -1,     -- ilimitado
        'cards',                  -1,     -- ilimitado
        'categories',             -1,
        -- LAN�!AMENTOS
        'manual_transactions',    -1,
        'transaction_history',    true,
        -- IMPORTA�!ÒO & CONCILIA�!ÒO
        'ofx_import',             true,
        'reconcile',              true,
        -- RELAT�RIOS
        'reports_basic',          true,
        'reports_advanced',       true,   -- relatórios avançados (DRE, projeções)
        -- IA LABS
        'ai_scanner',             10,     -- 10 scans de cupom/mês
        'ai_comparator',          true,   -- comparador de preços ilimitado
        'ai_diagnosis',           false,  -- sem diagnóstico patrimonial
        'ai_shopping_list',       5,      -- 5 listas de compras IA/mês
        'ai_chat',                false,
        -- PLANEJAMENTO
        'goals',                  true,   -- metas financeiras
        'budgets',                true,   -- orçamentos por categoria
        -- PATRIM�NIO
        'physical_assets',        true,   -- bens físicos
        'liabilities',            true,   -- passivos e dívidas
        -- NOTIFICA�!�"ES
        'push_notifications',     true,
        'whatsapp_notifications', false,
        -- FAMÍLIA & SUPORTE
        'multi_user',             2,      -- titular + 1 familiar
        'priority_support',       false
    ),
    -- UI
    'Mais Popular',                     -- badge
    'from-brand-500 to-brand-700',      -- gradiente azul (brand)
    '#6366f1',
    -- Controle
    true, 2, 14
)
ON CONFLICT (slug) DO UPDATE SET
    name                      = EXCLUDED.name,
    description               = EXCLUDED.description,
    price_cents               = EXCLUDED.price_cents,
    price_cents_annual        = EXCLUDED.price_cents_annual,
    price_cents_semiannual    = EXCLUDED.price_cents_semiannual,
    ai_scans_limit            = EXCLUDED.ai_scans_limit,
    max_accounts              = EXCLUDED.max_accounts,
    max_cards                 = EXCLUDED.max_cards,
    max_categories            = EXCLUDED.max_categories,
    max_transactions_per_month = EXCLUDED.max_transactions_per_month,
    max_multi_users           = EXCLUDED.max_multi_users,
    features                  = EXCLUDED.features,
    highlight_label           = EXCLUDED.highlight_label,
    color_gradient            = EXCLUDED.color_gradient,
    badge_color               = EXCLUDED.badge_color,
    is_active                 = EXCLUDED.is_active,
    sort_order                = EXCLUDED.sort_order,
    trial_days                = EXCLUDED.trial_days,
    updated_at                = now();
-- ���� PLANO 4: PRO (~R$59,90/mês) ����������������������������������������������������������
INSERT INTO public.plans (
    name, slug, description,
    price_cents, price_cents_annual, price_cents_semiannual,
    ai_scans_limit,
    max_accounts, max_cards, max_categories, max_transactions_per_month, max_multi_users,
    features,
    highlight_label, color_gradient, badge_color,
    is_active, sort_order, trial_days
) VALUES (
    'Pro',
    'pro',
    'Gestão patrimonial completa com IA ilimitada, multi-usuário familiar e suporte prioritário.',
    -- Preços: R$59,90/mês | R$47,92/mês no anual (-20%) | R$53,91/mês no semestral (-10%)
    5990,               -- R$59,90/mês
    57504,              -- R$575,04/ano (R$47,92/mês, -20%)
    32346,              -- R$323,46/semestre (R$53,91/mês, -10%)
    -- IA: -1 = ilimitado
    -1,
    -- Limites
    -1, -1, -1, -1,
    5,   -- até 5 usuários (família)
    -- Features JSON
    jsonb_build_object(
        -- CORE NAVEGA�!ÒO
        'dashboard',              true,
        'accounts',               -1,
        'cards',                  -1,
        'categories',             -1,
        -- LAN�!AMENTOS
        'manual_transactions',    -1,
        'transaction_history',    true,
        -- IMPORTA�!ÒO & CONCILIA�!ÒO
        'ofx_import',             true,
        'reconcile',              true,
        -- RELAT�RIOS
        'reports_basic',          true,
        'reports_advanced',       true,
        -- IA LABS � tudo ilimitado
        'ai_scanner',             -1,     -- scanner ilimitado
        'ai_comparator',          true,   -- comparador ilimitado
        'ai_diagnosis',           true,   -- diagnóstico patrimonial completo
        'ai_shopping_list',       -1,     -- listas ilimitadas
        'ai_chat',                true,   -- chat IA financeiro
        -- PLANEJAMENTO
        'goals',                  true,
        'budgets',                true,
        -- PATRIM�NIO COMPLETO
        'physical_assets',        true,
        'liabilities',            true,
        -- NOTIFICA�!�"ES
        'push_notifications',     true,
        'whatsapp_notifications', true,   -- alertas via WhatsApp
        -- FAMÍLIA & SUPORTE
        'multi_user',             5,      -- até 5 usuários da família
        'priority_support',       true    -- suporte prioritário
    ),
    -- UI
    'Elite',                            -- badge
    'from-amber-500 to-rose-600',       -- gradiente dourado
    '#f59e0b',
    -- Controle
    true, 3, 14
)
ON CONFLICT (slug) DO UPDATE SET
    name                      = EXCLUDED.name,
    description               = EXCLUDED.description,
    price_cents               = EXCLUDED.price_cents,
    price_cents_annual        = EXCLUDED.price_cents_annual,
    price_cents_semiannual    = EXCLUDED.price_cents_semiannual,
    ai_scans_limit            = EXCLUDED.ai_scans_limit,
    max_accounts              = EXCLUDED.max_accounts,
    max_cards                 = EXCLUDED.max_cards,
    max_categories            = EXCLUDED.max_categories,
    max_transactions_per_month = EXCLUDED.max_transactions_per_month,
    max_multi_users           = EXCLUDED.max_multi_users,
    features                  = EXCLUDED.features,
    highlight_label           = EXCLUDED.highlight_label,
    color_gradient            = EXCLUDED.color_gradient,
    badge_color               = EXCLUDED.badge_color,
    is_active                 = EXCLUDED.is_active,
    sort_order                = EXCLUDED.sort_order,
    trial_days                = EXCLUDED.trial_days,
    updated_at                = now();
-- ============================================================
-- [6] FUNCTIONS E TRIGGERS
-- ============================================================
-- FUNCTION: Incrementar uso de IA de forma atômica (UPSERT seguro)
-- Retorna: { ok: bool, used: int, limit: int, exceeded: bool }
CREATE OR REPLACE FUNCTION public.increment_ai_usage(
    p_user_id   UUID,
    p_scan_type TEXT,
    p_increment INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_period_key    TEXT;
    v_current_used  INTEGER;
    v_plan_limit    INTEGER;
    v_subscription  RECORD;
    v_result        JSONB;
BEGIN
    -- Período atual no formato 'YYYY-MM'
    v_period_key := TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM');
    -- Buscar assinatura e limite do plano
    SELECT
        s.id AS sub_id,
        s.status,
        s.current_period_end,
        COALESCE(p.ai_scans_limit, 0) AS ai_scans_limit
    INTO v_subscription
    FROM public.subscriptions s
    LEFT JOIN public.plans p ON p.id = s.plan_id
    WHERE s.user_id = p_user_id;
    -- Se não tem assinatura ativa, bloquear
    IF NOT FOUND OR v_subscription.status NOT IN ('active', 'trialing', 'admin_granted') THEN
        RETURN jsonb_build_object(
            'ok', false,
            'used', 0,
            'limit', 0,
            'exceeded', true,
            'reason', 'no_active_subscription'
        );
    END IF;
    v_plan_limit := v_subscription.ai_scans_limit;
    -- -1 = ilimitado: incrementa sem checar limite
    IF v_plan_limit = -1 THEN
        INSERT INTO public.ai_usage_log (user_id, period_key, scan_type, scans_used)
        VALUES (p_user_id, v_period_key, p_scan_type, p_increment)
        ON CONFLICT (user_id, period_key, scan_type)
        DO UPDATE SET
            scans_used = ai_usage_log.scans_used + p_increment,
            updated_at = NOW();
        GET DIAGNOSTICS v_current_used = ROW_COUNT;
        SELECT scans_used INTO v_current_used
        FROM public.ai_usage_log
        WHERE user_id = p_user_id AND period_key = v_period_key AND scan_type = p_scan_type;
        RETURN jsonb_build_object('ok', true, 'used', v_current_used, 'limit', -1, 'exceeded', false);
    END IF;
    -- 0 = sem acesso
    IF v_plan_limit = 0 THEN
        RETURN jsonb_build_object('ok', false, 'used', 0, 'limit', 0, 'exceeded', true, 'reason', 'feature_not_available');
    END IF;
    -- Buscar uso atual do período
    SELECT COALESCE(scans_used, 0) INTO v_current_used
    FROM public.ai_usage_log
    WHERE user_id = p_user_id AND period_key = v_period_key AND scan_type = p_scan_type;
    IF NOT FOUND THEN
        v_current_used := 0;
    END IF;
    -- Verificar se excedeu o limite
    IF v_current_used + p_increment > v_plan_limit THEN
        RETURN jsonb_build_object(
            'ok', false,
            'used', v_current_used,
            'limit', v_plan_limit,
            'exceeded', true,
            'reason', 'monthly_limit_reached'
        );
    END IF;
    -- Incrementar uso
    INSERT INTO public.ai_usage_log (user_id, period_key, scan_type, scans_used)
    VALUES (p_user_id, v_period_key, p_scan_type, p_increment)
    ON CONFLICT (user_id, period_key, scan_type)
    DO UPDATE SET
        scans_used = ai_usage_log.scans_used + p_increment,
        updated_at = NOW();
    v_current_used := v_current_used + p_increment;
    RETURN jsonb_build_object(
        'ok', true,
        'used', v_current_used,
        'limit', v_plan_limit,
        'exceeded', false,
        'remaining', v_plan_limit - v_current_used
    );
END;
$$;
-- FUNCTION: Consultar uso atual de IA de um usuário no mês corrente
CREATE OR REPLACE FUNCTION public.get_ai_usage_current_month(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_period_key TEXT;
    v_plan_limit INTEGER;
    v_total_used INTEGER;
    v_breakdown  JSONB;
BEGIN
    v_period_key := TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM');
    -- Limite do plano
    SELECT COALESCE(p.ai_scans_limit, 0) INTO v_plan_limit
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.user_id = p_user_id
      AND s.status IN ('active', 'trialing', 'admin_granted');
    IF NOT FOUND THEN v_plan_limit := 0; END IF;
    -- Uso por tipo de scan
    SELECT
        COALESCE(SUM(scans_used), 0),
        jsonb_object_agg(scan_type, scans_used)
    INTO v_total_used, v_breakdown
    FROM public.ai_usage_log
    WHERE user_id = p_user_id AND period_key = v_period_key;
    RETURN jsonb_build_object(
        'period',     v_period_key,
        'total_used', COALESCE(v_total_used, 0),
        'limit',      v_plan_limit,
        'unlimited',  v_plan_limit = -1,
        'breakdown',  COALESCE(v_breakdown, '{}'::jsonb)
    );
END;
$$;
-- FUNCTION: Verificar se um usuário tem acesso a uma feature específica
-- Uso: SELECT public.check_feature_access('user-uuid', 'ai_scanner');
CREATE OR REPLACE FUNCTION public.check_feature_access(
    p_user_id    UUID,
    p_feature    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan       RECORD;
    v_feature_val JSONB;
BEGIN
    SELECT p.features, p.ai_scans_limit, s.status
    INTO v_plan
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.user_id = p_user_id
      AND s.status IN ('active', 'trialing', 'admin_granted');
    IF NOT FOUND THEN
        RETURN jsonb_build_object('has_access', false, 'reason', 'no_active_subscription');
    END IF;
    v_feature_val := v_plan.features -> p_feature;
    IF v_feature_val IS NULL THEN
        RETURN jsonb_build_object('has_access', false, 'reason', 'feature_not_in_plan');
    END IF;
    -- Boolean false
    IF v_feature_val = 'false'::jsonb THEN
        RETURN jsonb_build_object('has_access', false, 'reason', 'feature_disabled', 'value', 0);
    END IF;
    -- Número 0
    IF v_feature_val = '0'::jsonb THEN
        RETURN jsonb_build_object('has_access', false, 'reason', 'feature_limit_zero', 'value', 0);
    END IF;
    -- Boolean true
    IF v_feature_val = 'true'::jsonb THEN
        RETURN jsonb_build_object('has_access', true, 'value', -1, 'unlimited', true);
    END IF;
    -- Número positivo ou -1
    RETURN jsonb_build_object(
        'has_access', true,
        'value', (v_feature_val)::integer,
        'unlimited', (v_feature_val)::integer = -1
    );
END;
$$;
-- ============================================================
-- [7] RLS POLICIES
-- ============================================================
-- PLANS: leitura pública (não requer auth) � para landing page
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plans_public_read" ON public.plans;
CREATE POLICY "plans_public_read"
    ON public.plans FOR SELECT
    USING (is_active = true);
-- PLANS: admins podem gerenciar tudo
DROP POLICY IF EXISTS "plans_admin_all" ON public.plans;
CREATE POLICY "plans_admin_all"
    ON public.plans FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );
-- SUBSCRIPTIONS: usuários leem a própria assinatura
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscriptions_user_read" ON public.subscriptions;
CREATE POLICY "subscriptions_user_read"
    ON public.subscriptions FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);
-- SUBSCRIPTIONS: admins leem e gerenciam tudo
DROP POLICY IF EXISTS "subscriptions_admin_all" ON public.subscriptions;
CREATE POLICY "subscriptions_admin_all"
    ON public.subscriptions FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );
-- AI_USAGE_LOG: usuários leem e incrementam o próprio log
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_usage_user_read" ON public.ai_usage_log;
CREATE POLICY "ai_usage_user_read"
    ON public.ai_usage_log FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);
-- AI_USAGE_LOG: admins leem tudo
DROP POLICY IF EXISTS "ai_usage_admin_read" ON public.ai_usage_log;
CREATE POLICY "ai_usage_admin_read"
    ON public.ai_usage_log FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );
-- COUPONS: apenas admins gerenciam
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coupons_admin_all" ON public.coupons;
CREATE POLICY "coupons_admin_all"
    ON public.coupons FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );
-- Leitura pública de coupons ativos (para validar no checkout)
DROP POLICY IF EXISTS "coupons_authenticated_read" ON public.coupons;
CREATE POLICY "coupons_authenticated_read"
    ON public.coupons FOR SELECT
    TO authenticated
    USING (is_active = true);
-- COUPON_USES: usuários leem os próprios
ALTER TABLE public.coupon_uses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coupon_uses_user_read" ON public.coupon_uses;
CREATE POLICY "coupon_uses_user_read"
    ON public.coupon_uses FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "coupon_uses_admin_all" ON public.coupon_uses;
CREATE POLICY "coupon_uses_admin_all"
    ON public.coupon_uses FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );
-- ============================================================
-- [8] VIEWS DE RELAT�RIO ADMIN
-- ============================================================
-- VIEW: MRR (Monthly Recurring Revenue) por plano
CREATE OR REPLACE VIEW public.admin_mrr_by_plan AS
SELECT
    p.name                                          AS plan_name,
    p.slug                                          AS plan_slug,
    p.price_cents                                   AS price_cents,
    p.price_cents / 100.0                           AS price_brl,
    COUNT(s.id)                                     AS total_subscribers,
    COUNT(s.id) FILTER (WHERE s.status = 'active')  AS active_subscribers,
    COUNT(s.id) FILTER (WHERE s.status = 'trialing') AS trialing_subscribers,
    COUNT(s.id) FILTER (WHERE s.status = 'admin_granted') AS admin_granted,
    -- MRR real (apenas ativos pagantes)
    COUNT(s.id) FILTER (WHERE s.status = 'active') * (p.price_cents / 100.0)
                                                    AS mrr_brl,
    -- MRR potencial (incluindo trialing que pode converter)
    COUNT(s.id) FILTER (WHERE s.status IN ('active', 'trialing')) * (p.price_cents / 100.0)
                                                    AS potential_mrr_brl
FROM public.plans p
LEFT JOIN public.subscriptions s ON s.plan_id = p.id
WHERE p.price_cents > 0  -- excluir plano gratuito do MRR
GROUP BY p.id, p.name, p.slug, p.price_cents, p.sort_order
ORDER BY p.sort_order;
-- VIEW: Usuários por plano (distribuição completa)
CREATE OR REPLACE VIEW public.admin_users_by_plan AS
SELECT
    COALESCE(p.name, 'Sem Plano')                   AS plan_name,
    COALESCE(p.slug, 'none')                        AS plan_slug,
    COALESCE(p.price_cents, 0) / 100.0              AS price_brl,
    s.status,
    COUNT(s.user_id)                                AS user_count,
    -- Datas relevantes
    MIN(s.created_at)                               AS first_subscriber_at,
    MAX(s.created_at)                               AS last_subscriber_at,
    -- Trials expirando em breve (próximos 7 dias)
    COUNT(s.id) FILTER (
        WHERE s.status = 'trialing'
          AND s.trial_ends_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
    )                                               AS trials_expiring_7d
FROM public.subscriptions s
LEFT JOIN public.plans p ON p.id = s.plan_id
GROUP BY p.id, p.name, p.slug, p.price_cents, s.status
ORDER BY COALESCE(p.sort_order, 999), s.status;
-- VIEW: Consumo de IA por plano no mês corrente
CREATE OR REPLACE VIEW public.admin_ai_usage_by_plan AS
WITH current_period AS (
    SELECT TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS period_key
)
SELECT
    COALESCE(p.name, 'Sem Plano')                   AS plan_name,
    COALESCE(p.slug, 'none')                        AS plan_slug,
    COALESCE(p.ai_scans_limit, 0)                   AS plan_ai_limit,
    u.scan_type,
    COUNT(DISTINCT u.user_id)                       AS unique_users,
    SUM(u.scans_used)                               AS total_scans,
    AVG(u.scans_used)                               AS avg_scans_per_user,
    MAX(u.scans_used)                               AS max_scans_single_user,
    -- Taxa de saturação (usuários que atingiram >= 80% do limite)
    COUNT(DISTINCT u.user_id) FILTER (
        WHERE p.ai_scans_limit > 0
          AND u.scans_used >= (p.ai_scans_limit * 0.8)
    )                                               AS users_near_limit
FROM public.ai_usage_log u
JOIN current_period cp ON u.period_key = cp.period_key
JOIN public.subscriptions s ON s.user_id = u.user_id
LEFT JOIN public.plans p ON p.id = s.plan_id
GROUP BY p.id, p.name, p.slug, p.ai_scans_limit, u.scan_type
ORDER BY p.sort_order NULLS LAST, total_scans DESC;
-- VIEW: Saúde geral do negócio (snapshot executivo)
CREATE OR REPLACE VIEW public.admin_business_health AS
WITH stats AS (
    SELECT
        COUNT(DISTINCT s.user_id) FILTER (WHERE s.status IN ('active', 'admin_granted'))
                                                    AS paying_users,
        COUNT(DISTINCT s.user_id) FILTER (WHERE s.status = 'trialing')
                                                    AS trialing_users,
        COUNT(DISTINCT s.user_id) FILTER (WHERE s.status = 'canceled')
                                                    AS churned_users,
        SUM(p.price_cents) FILTER (WHERE s.status = 'active') / 100.0
                                                    AS mrr_brl,
        SUM(p.price_cents) FILTER (WHERE s.status IN ('active', 'trialing')) / 100.0
                                                    AS potential_mrr_brl
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE p.price_cents > 0
)
SELECT
    paying_users,
    trialing_users,
    churned_users,
    paying_users + trialing_users               AS total_active_users,
    mrr_brl,
    potential_mrr_brl,
    mrr_brl * 12                               AS arr_brl,  -- Annual Recurring Revenue
    -- Churn rate estimado (churned / total historico)
    CASE WHEN (paying_users + churned_users) > 0
         THEN ROUND((churned_users::numeric / (paying_users + churned_users) * 100), 2)
         ELSE 0
    END                                         AS churn_rate_pct,
    -- Ticket médio
    CASE WHEN paying_users > 0
         THEN ROUND(mrr_brl / paying_users, 2)
         ELSE 0
    END                                         AS avg_ticket_brl,
    NOW()                                       AS snapshot_at
FROM stats;
-- ============================================================
-- [9] QUERIES UTILITÁRIAS PARA O ADMIN
-- ============================================================
-- CONSULTA: Usuários em trial expirando nos próximos N dias
-- Uso: SELECT * FROM public.fn_trials_expiring(7);
CREATE OR REPLACE FUNCTION public.fn_trials_expiring(p_days INTEGER DEFAULT 7)
RETURNS TABLE (
    user_id     UUID,
    email       TEXT,
    plan_name   TEXT,
    trial_ends  TIMESTAMPTZ,
    days_left   INTEGER
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        s.user_id,
        pr.email,
        p.name                                      AS plan_name,
        s.trial_ends_at                             AS trial_ends,
        EXTRACT(DAY FROM (s.trial_ends_at - NOW()))::INTEGER AS days_left
    FROM public.subscriptions s
    JOIN public.plans p  ON p.id  = s.plan_id
    JOIN public.profiles pr ON pr.id = s.user_id
    WHERE s.status = 'trialing'
      AND s.trial_ends_at BETWEEN NOW() AND NOW() + (p_days || ' days')::INTERVAL
    ORDER BY s.trial_ends_at ASC;
$$;
-- CONSULTA: Top consumidores de IA no mês corrente
CREATE OR REPLACE FUNCTION public.fn_top_ai_consumers(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
    user_id     UUID,
    email       TEXT,
    plan_name   TEXT,
    plan_limit  INTEGER,
    total_scans INTEGER,
    saturation  NUMERIC
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        u.user_id,
        pr.email,
        p.name                                      AS plan_name,
        p.ai_scans_limit                            AS plan_limit,
        SUM(u.scans_used)::INTEGER                  AS total_scans,
        CASE
            WHEN p.ai_scans_limit <= 0 THEN 0
            WHEN p.ai_scans_limit = -1 THEN 0
            ELSE ROUND(SUM(u.scans_used)::numeric / p.ai_scans_limit * 100, 1)
        END                                         AS saturation
    FROM public.ai_usage_log u
    JOIN public.subscriptions s  ON s.user_id = u.user_id
    JOIN public.plans p          ON p.id = s.plan_id
    JOIN public.profiles pr      ON pr.id = u.user_id
    WHERE u.period_key = TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')
    GROUP BY u.user_id, pr.email, p.name, p.ai_scans_limit
    ORDER BY total_scans DESC
    LIMIT p_limit;
$$;
-- ============================================================
-- FINALIZA�!ÒO: Recarregar schema do PostgREST
-- ============================================================
NOTIFY pgrst, 'reload schema';
-- FIM DA MIGRATION
-- ============================================================
-- COMO EXECUTAR:
-- 1. Abra o Supabase Dashboard
-- 2. Vá em SQL Editor
-- 3. Cole este script inteiro
-- 4. Execute (pode ser re-executado sem problemas)
-- ============================================================
[FIM DO CONTE�aDO DO ARQUIVO 1]
