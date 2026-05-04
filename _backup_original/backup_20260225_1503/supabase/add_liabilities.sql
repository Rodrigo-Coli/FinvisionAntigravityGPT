-- Migration: Add Liabilities (Passivos/Dívidas) Table

-- Create the liabilities table
CREATE TABLE public.liabilities (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('MORTGAGE', 'VEHICLE_FINANCING', 'PERSONAL_LOAN', 'CONSORTIUM', 'CREDIT_CARD', 'OTHER')),
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    remaining_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    interest_rate NUMERIC(5, 2), -- Optional percentage, e.g. 10.5 for 10.5%
    linked_asset_id UUID REFERENCES public.physical_assets(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast user lookups
CREATE INDEX idx_liabilities_user_id ON public.liabilities(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.liabilities ENABLE ROW LEVEL SECURITY;

-- Create Security Policies
CREATE POLICY "Users can view their own liabilities" 
    ON public.liabilities FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own liabilities" 
    ON public.liabilities FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own liabilities" 
    ON public.liabilities FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own liabilities" 
    ON public.liabilities FOR DELETE 
    USING (auth.uid() = user_id);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_liabilities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_liabilities_updated_at
    BEFORE UPDATE ON public.liabilities
    FOR EACH ROW EXECUTE PROCEDURE update_liabilities_updated_at();

-- Note: Ensure to apply this script to your Supabase project (via SQL Editor on Dashboard or locally).
