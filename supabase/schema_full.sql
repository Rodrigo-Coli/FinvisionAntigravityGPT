-- ==========================================
-- FINVISION PRO MASTER - COMPLETE SCHEMA (FINAL ALIGNMENT)
-- ==========================================

-- 1. PROFILES & AUTH
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    role TEXT CHECK (role IN ('admin', 'user')) DEFAULT 'user',
    is_approved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. USER SETTINGS
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email_notifications BOOLEAN NOT NULL DEFAULT true,
    auto_dark_mode BOOLEAN NOT NULL DEFAULT false,
    base_currency TEXT DEFAULT 'BRL',
    theme TEXT CHECK (theme IN ('light', 'dark')) DEFAULT 'light',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. FINANCIAL CORE: ACCOUNTS
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

-- 4. FINANCIAL CORE: TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    type TEXT CHECK (type IN ('INCOME', 'EXPENSE', 'TRANSFER', 'BILL_PAYMENT', 'ADJUSTMENT')),
    category TEXT,
    is_deleted BOOLEAN DEFAULT false,
    is_paid BOOLEAN DEFAULT true,
    paid_amount DECIMAL(12,2),
    paid_at TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. CREDIT CARDS
CREATE TABLE IF NOT EXISTS public.cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
    name TEXT,
    brand TEXT NOT NULL,
    color TEXT,
    closing_day INT,
    due_day INT,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. CARD STATEMENTS
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

-- 7. AI LABS: DOCUMENTS
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

-- 8. AI LABS: DOCUMENT ITEMS
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

-- 9. AI LABS: PRODUCTS
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

-- 10. AI LABS: PRODUCT PRICES
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

-- 11. TRIGGERS: AUTOMATED BALANCE TRACKING
CREATE OR REPLACE FUNCTION public.update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.type = 'INCOME' THEN
            UPDATE public.accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.account_id;
        ELSIF NEW.type = 'EXPENSE' OR NEW.type = 'BILL_PAYMENT' THEN
            UPDATE public.accounts SET current_balance = current_balance - NEW.amount WHERE id = NEW.account_id;
        ELSIF NEW.type = 'ADJUSTMENT' THEN
            UPDATE public.accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.account_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.type = 'INCOME' THEN
            UPDATE public.accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.account_id;
        ELSIF OLD.type = 'EXPENSE' OR OLD.type = 'BILL_PAYMENT' THEN
            UPDATE public.accounts SET current_balance = current_balance + OLD.amount WHERE id = OLD.account_id;
        ELSIF OLD.type = 'ADJUSTMENT' THEN
            UPDATE public.accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.account_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_account_balance
AFTER INSERT OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.update_account_balance();

-- 12. RLS POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_document_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User data isolation" ON public.profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "User data isolation" ON public.user_settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "User data isolation" ON public.accounts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "User data isolation" ON public.transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "User data isolation" ON public.cards FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "User data isolation" ON public.card_statements FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "User data isolation" ON public.ai_documents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "User data isolation" ON public.ai_document_items FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "User data isolation" ON public.products FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "User data isolation" ON public.product_prices FOR ALL USING (auth.uid() = user_id);
