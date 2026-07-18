
CREATE TABLE IF NOT EXISTS public.physical_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT CHECK (category IN ('REAL_ESTATE', 'VEHICLE', 'OTHER', 'INVESTMENT')),
    estimated_value DECIMAL(12,2) DEFAULT 0,
    acquisition_date DATE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.physical_assets ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "User data isolation" ON public.physical_assets FOR ALL USING (auth.uid() = user_id);
