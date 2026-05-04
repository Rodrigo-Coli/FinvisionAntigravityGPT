-- Script para corrigir a tabela transactions e garantir que todas as colunas necessárias existam
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='transactions' AND table_schema='public') THEN
        -- Coluna metadata
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='metadata') THEN
            ALTER TABLE public.transactions ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
        END IF;

        -- Coluna is_paid
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='is_paid') THEN
            ALTER TABLE public.transactions ADD COLUMN is_paid BOOLEAN DEFAULT true;
        END IF;

        -- Coluna paid_amount
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='paid_amount') THEN
            ALTER TABLE public.transactions ADD COLUMN paid_amount DECIMAL(12,2);
        END IF;

        -- Coluna paid_at
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='paid_at') THEN
            ALTER TABLE public.transactions ADD COLUMN paid_at TIMESTAMPTZ;
        END IF;

        -- Coluna is_deleted (caso não exista)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='is_deleted') THEN
            ALTER TABLE public.transactions ADD COLUMN is_deleted BOOLEAN DEFAULT false;
        END IF;
        
        -- Coluna type (garantir que aceita BILL_PAYMENT se houver constraint)
        -- Nota: Se houver uma constraint de check, pode ser necessário atualizá-la, 
        -- mas por padrão vamos apenas garantir as colunas primeiro.
    END IF;
END $$;

-- Recarregar o cache do PostgREST
NOTIFY pgrst, 'reload schema';
