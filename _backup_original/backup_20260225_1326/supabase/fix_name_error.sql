-- CORREÇÃO CIRÚRGICA: Erro de coluna "name" nula
-- Este script remove a obrigatoriedade da coluna antiga "name" que está bloqueando o salvamento.

DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='name') THEN
        ALTER TABLE public.accounts ALTER COLUMN "name" DROP NOT NULL;
    END IF;
END $$;

-- Garante também que a coluna correta (institution) existe e é a que vamos usar
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='institution') THEN
        ALTER TABLE public.accounts ADD COLUMN institution TEXT NOT NULL DEFAULT 'Banco';
    END IF;
END $$;
