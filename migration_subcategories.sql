-- 1. Create subcategories table
CREATE TABLE IF NOT EXISTS public.subcategories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Protect table with RLS
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own subcategories" ON public.subcategories;
CREATE POLICY "Users can view their own subcategories"
    ON public.subcategories FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own subcategories" ON public.subcategories;
CREATE POLICY "Users can insert their own subcategories"
    ON public.subcategories FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own subcategories" ON public.subcategories;
CREATE POLICY "Users can update their own subcategories"
    ON public.subcategories FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own subcategories" ON public.subcategories;
CREATE POLICY "Users can delete their own subcategories"
    ON public.subcategories FOR DELETE
    USING (auth.uid() = user_id);

-- 2. Add subcategory column to transactions
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='transactions' AND column_name='subcategory') THEN
        ALTER TABLE public.transactions ADD COLUMN subcategory TEXT;
    END IF;
END $$;
