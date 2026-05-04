-- ==========================================
-- FINVISION PRO - RESET DE OPERAÇÃO
-- ==========================================
-- ATENÇÃO: Este script apaga TODAS as transações, contas e cartões.
-- Próprio para iniciar uma operação real do zero.

BEGIN;

-- 1. Limpar Transações e Importações
TRUNCATE TABLE public.card_transactions CASCADE;
TRUNCATE TABLE public.transactions CASCADE;
TRUNCATE TABLE public.imported_transactions CASCADE;
TRUNCATE TABLE public.imports CASCADE;
TRUNCATE TABLE public.ai_document_items CASCADE;
TRUNCATE TABLE public.ai_documents CASCADE;
TRUNCATE TABLE public.product_prices CASCADE;

-- 2. Limpar Estruturas de Conta e Cartão
TRUNCATE TABLE public.card_statements CASCADE;
TRUNCATE TABLE public.cards CASCADE;
TRUNCATE TABLE public.accounts CASCADE;
TRUNCATE TABLE public.physical_assets CASCADE;

-- 3. Limpar Categorias e Produtos (Opcional, mas recomendado para reset total)
TRUNCATE TABLE public.categories CASCADE;
TRUNCATE TABLE public.products CASCADE;

-- Opcional: Manter perfis e configurações de usuário ou zerá-los também?
-- TRUNCATE TABLE public.profiles CASCADE;
-- TRUNCATE TABLE public.user_settings CASCADE;

COMMIT;

NOTIFY pgrst, 'reload schema';
