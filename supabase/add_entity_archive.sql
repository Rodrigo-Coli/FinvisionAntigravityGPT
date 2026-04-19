-- Add is_archived column to entities table if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'entities' AND column_name = 'is_archived') THEN
        ALTER TABLE entities ADD COLUMN is_archived BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Update get_entities logic if there's any RLS or standard views, 
-- but usually we just query the table directly from the client.
