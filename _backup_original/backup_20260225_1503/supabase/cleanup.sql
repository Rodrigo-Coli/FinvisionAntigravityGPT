-- ==========================================
-- FINVISION PRO MASTER - DATABASE CLEANUP
-- ==========================================

DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
          AND tablename NOT IN (
            'profiles', 
            'accounts', 
            'transactions', 
            'cards', 
            'card_statements',
            'ai_documents', 
            'ai_document_items', 
            'products', 
            'product_prices'
          )
    ) 
    LOOP
        RAISE NOTICE 'Dropping table: %', r.tablename;
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END $$;
