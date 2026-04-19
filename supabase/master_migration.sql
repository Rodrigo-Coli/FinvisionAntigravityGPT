-- ==========================================
-- FINVISION PRO MASTER - COMPREHENSIVE SCHEMA MIGRATION
-- ==========================================
-- This script ensures all tables, columns, buckets and functions exist.
-- It uses "IF NOT EXISTS" to be safe to run multiple times.

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CORE: PROFILES & SETTINGS
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    role TEXT CHECK (role IN ('admin', 'user')) DEFAULT 'user',
    is_approved BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email_notifications BOOLEAN NOT NULL DEFAULT true,
    auto_dark_mode BOOLEAN NOT NULL DEFAULT false,
    base_currency TEXT DEFAULT 'BRL',
    theme TEXT CHECK (theme IN ('light', 'dark')) DEFAULT 'light',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. FINANCIAL CORE: ACCOUNTS & TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    institution TEXT NOT NULL,
    type TEXT CHECK (type IN ('CHECKING', 'SAVINGS', 'INVESTMENT', 'CREDIT_CARD', 'CASH', 'OTHER')),
    currency TEXT DEFAULT 'BRL',
    initial_balance DECIMAL(12,2) DEFAULT 0,
    current_balance DECIMAL(12,2) DEFAULT 0,
    "limit" DECIMAL(12,2) DEFAULT 0,
    color TEXT,
    is_archived BOOLEAN DEFAULT false,
    include_in_dashboard BOOLEAN DEFAULT true,
    last_sync TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- FORCE SCHEMA CACHE SYNC (COMPLETE VERSION)
-- ==========================================
DO $$ 
BEGIN 
    -- Check 'accounts' table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='accounts' AND table_schema='public') THEN
        -- 1. Remove obsolete 'name' column if it exists and is causing constraint errors
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='name') THEN
            ALTER TABLE public.accounts ALTER COLUMN "name" DROP NOT NULL;
        END IF;

        -- 2. Ensure current 'institution' column exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='institution') THEN
            ALTER TABLE public.accounts ADD COLUMN institution TEXT;
        END IF;
        
        -- Garante que 'institution' tenha valor se estiver nulo mas 'name' tiver algo
        UPDATE public.accounts SET institution = "name" WHERE institution IS NULL AND "name" IS NOT NULL;
        
        -- Agora garante que não é nulo para o futuro
        ALTER TABLE public.accounts ALTER COLUMN institution SET DEFAULT 'Banco';
        UPDATE public.accounts SET institution = 'Banco' WHERE institution IS NULL;
        ALTER TABLE public.accounts ALTER COLUMN institution SET NOT NULL;

        -- 3. Sync other expected columns (including is_archived which was missing!)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='type') THEN
            ALTER TABLE public.accounts ADD COLUMN type TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='currency') THEN
            ALTER TABLE public.accounts ADD COLUMN currency TEXT DEFAULT 'BRL';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='initial_balance') THEN
            ALTER TABLE public.accounts ADD COLUMN initial_balance DECIMAL(12,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='current_balance') THEN
            ALTER TABLE public.accounts ADD COLUMN current_balance DECIMAL(12,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='limit') THEN
            ALTER TABLE public.accounts ADD COLUMN "limit" DECIMAL(12,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='color') THEN
            ALTER TABLE public.accounts ADD COLUMN color TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='is_archived') THEN
            ALTER TABLE public.accounts ADD COLUMN is_archived BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='include_in_dashboard') THEN
            ALTER TABLE public.accounts ADD COLUMN include_in_dashboard BOOLEAN DEFAULT true;
        END IF;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    type TEXT CHECK (type IN ('INCOME', 'EXPENSE', 'TRANSFER', 'BILL_PAYMENT', 'ADJUSTMENT')),
    category TEXT,
    account_name TEXT,
    is_deleted BOOLEAN DEFAULT false,
    is_paid BOOLEAN DEFAULT true,
    paid_amount DECIMAL(12,2),
    paid_at TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Garantir colunas em transações pré-existentes
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='transactions' AND table_schema='public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='category') THEN
            ALTER TABLE public.transactions ADD COLUMN category TEXT DEFAULT 'Outros';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='account_name') THEN
            ALTER TABLE public.transactions ADD COLUMN account_name TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='metadata') THEN
            ALTER TABLE public.transactions ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='is_paid') THEN
            ALTER TABLE public.transactions ADD COLUMN is_paid BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='paid_amount') THEN
            ALTER TABLE public.transactions ADD COLUMN paid_amount DECIMAL(12,2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='paid_at') THEN
            ALTER TABLE public.transactions ADD COLUMN paid_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='is_deleted') THEN
            ALTER TABLE public.transactions ADD COLUMN is_deleted BOOLEAN DEFAULT false;
        END IF;
    END IF;
END $$;

-- 4. CREDIT CARDS & STATEMENTS
CREATE TABLE IF NOT EXISTS public.cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
    name TEXT,
    brand TEXT NOT NULL,
    last4 TEXT,
    limit_total DECIMAL(12,2) DEFAULT 0,
    color TEXT,
    closing_day INT,
    due_day INT,
    is_archived BOOLEAN DEFAULT false,
    is_additional BOOLEAN DEFAULT false,
    parent_card_id UUID REFERENCES public.cards(id),
    additional_label TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Garantir colunas em cards pré-existentes
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='cards' AND table_schema='public') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cards' AND column_name='name') THEN
            ALTER TABLE public.cards ADD COLUMN "name" TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cards' AND column_name='last4') THEN
            ALTER TABLE public.cards ADD COLUMN last4 TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cards' AND column_name='limit_total') THEN
            ALTER TABLE public.cards ADD COLUMN limit_total DECIMAL(12,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cards' AND column_name = 'is_additional') THEN
            ALTER TABLE public.cards ADD COLUMN is_additional BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cards' AND column_name = 'parent_card_id') THEN
            ALTER TABLE public.cards ADD COLUMN parent_card_id UUID REFERENCES public.cards(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cards' AND column_name = 'additional_label') THEN
            ALTER TABLE public.cards ADD COLUMN additional_label TEXT;
        END IF;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    icon TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.card_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE,
    month INT NOT NULL,
    year INT NOT NULL,
    due_date DATE NOT NULL,
    closing_date DATE,
    total_amount DECIMAL(12,2) DEFAULT 0,
    paid_amount DECIMAL(12,2) DEFAULT 0,
    status TEXT CHECK (status IN ('OPEN', 'PAID', 'OVERDUE', 'CLOSED', 'PARTIAL', 'DUE', 'PENDING')) DEFAULT 'OPEN',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.card_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE,
    statement_id UUID REFERENCES public.card_statements(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status TEXT DEFAULT 'POSTED',
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    is_manual BOOLEAN DEFAULT false,
    source TEXT,
    used_card_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. RECONCILIATION & IMPORTS
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    bucket TEXT NOT NULL,
    path TEXT NOT NULL,
    original_name TEXT,
    mime_type TEXT,
    size_bytes BIGINT,
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    type TEXT,
    status TEXT DEFAULT 'processing',
    notes TEXT,
    file_sha256 TEXT,
    account_id UUID,
    source_type TEXT,
    parse_meta JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.imported_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    import_id UUID REFERENCES public.imports(id) ON DELETE CASCADE,
    date DATE,
    description TEXT,
    amount DECIMAL(12,2),
    status TEXT DEFAULT 'READY_TO_RECONCILE',
    account_id UUID,
    account_name TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. AI & LABS
CREATE TABLE IF NOT EXISTS public.ai_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    file_path TEXT,
    merchant_raw TEXT,
    merchant_id UUID,
    document_date DATE,
    total_amount DECIMAL(12,2),
    currency TEXT DEFAULT 'BRL',
    status TEXT CHECK (status IN ('pending', 'processed', 'error')) DEFAULT 'pending',
    source TEXT DEFAULT 'manual_upload',
    ocr_raw JSONB,
    ocr_structured JSONB,
    confidence FLOAT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_document_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    document_id UUID REFERENCES public.ai_documents(id) ON DELETE CASCADE,
    line_index INT,
    raw_description TEXT,
    quantity DECIMAL(10,3) DEFAULT 1,
    unit TEXT DEFAULT 'un',
    unit_price DECIMAL(12,2),
    total_price DECIMAL(12,2),
    category_hint TEXT,
    product_id UUID,
    is_promo BOOLEAN DEFAULT false,
    exclude_from_stats BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    brand TEXT,
    category TEXT,
    default_unit TEXT,
    barcode TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    merchant_id UUID,
    document_id UUID REFERENCES public.ai_documents(id) ON DELETE CASCADE,
    document_date DATE,
    unit_price DECIMAL(12,2),
    total_price DECIMAL(12,2),
    quantity DECIMAL(10,3),
    is_promo BOOLEAN DEFAULT false,
    exclude_from_stats BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6.5 PHYSICAL ASSETS
CREATE TABLE IF NOT EXISTS public.physical_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT CHECK (category IN ('REAL_ESTATE', 'VEHICLE', 'OTHER')),
    estimated_value DECIMAL(12,2) DEFAULT 0,
    acquisition_date DATE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. FUNCTIONS & TRIGGERS
CREATE OR REPLACE FUNCTION public.recalculate_account_balance(p_account_id UUID)
RETURNS VOID AS $$
DECLARE
    v_initial_balance DECIMAL(12,2);
    v_total_transactions DECIMAL(12,2);
BEGIN
    SELECT initial_balance INTO v_initial_balance FROM public.accounts WHERE id = p_account_id;
    
    SELECT COALESCE(SUM(
        CASE 
            WHEN type = 'INCOME' THEN amount 
            WHEN type = 'EXPENSE' OR type = 'BILL_PAYMENT' THEN -amount 
            WHEN type = 'ADJUSTMENT' THEN amount 
            ELSE 0 
        END
    ), 0) INTO v_total_transactions 
    FROM public.transactions 
    WHERE account_id = p_account_id AND is_deleted = false;

    UPDATE public.accounts 
    SET current_balance = v_initial_balance + v_total_transactions 
    WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_account_balance_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        PERFORM public.recalculate_account_balance(NEW.account_id);
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.account_id <> NEW.account_id OR OLD.amount <> NEW.amount OR OLD.is_deleted <> NEW.is_deleted OR OLD.type <> NEW.type) THEN
            PERFORM public.recalculate_account_balance(OLD.account_id);
            IF (OLD.account_id <> NEW.account_id) THEN
                PERFORM public.recalculate_account_balance(NEW.account_id);
            END IF;
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        PERFORM public.recalculate_account_balance(OLD.account_id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_account_balance ON public.transactions;
CREATE TRIGGER trg_update_account_balance
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.update_account_balance_trigger();

-- 8. STORAGE BUCKETS
INSERT INTO storage.buckets (id, name, public)
VALUES ('finvision-documents', 'finvision-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
CREATE POLICY "Users can upload their own documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'finvision-documents' AND (auth.uid()::text = (storage.foldername(name))[1]));

CREATE POLICY "Users can view their own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'finvision-documents' AND (auth.uid()::text = (storage.foldername(name))[1]));

-- 9. RLS POLICIES (Example for accounts, repeat for others as needed)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imported_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_document_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;

-- Generic Isolation Policy
DO $$ 
DECLARE
    t text;
BEGIN
    FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "User isolation" ON public.%I', t);
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'user_id') THEN
            EXECUTE format('CREATE POLICY "User isolation" ON public.%I FOR ALL USING (auth.uid() = user_id)', t);
        ELSIF t = 'profiles' THEN
             EXECUTE format('CREATE POLICY "User isolation" ON public.%I FOR ALL USING (auth.uid() = id)', t);
        END IF;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
