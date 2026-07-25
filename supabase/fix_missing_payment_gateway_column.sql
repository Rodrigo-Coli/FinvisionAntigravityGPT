-- ============================================================
-- FINVISION PRO — FIX: coluna payment_gateway ausente (v1.0)
-- ============================================================
-- Data: 2026-07-25
-- IDEMPOTENTE.
--
-- api/_lib/asaas-create-subscription.ts grava subscriptions.payment_gateway
-- desde a introdução da abstração de gateway (api/_lib/payment/index.ts),
-- mas a coluna nunca tinha sido criada no banco vivo. Como o retorno de
-- .upsert() nunca era checado, toda criação de assinatura paga (gateway.name
-- = 'asaas', sempre truthy) falhava silenciosamente nesse upsert — a rota
-- respondia sucesso pro frontend mesmo sem gravar nada no banco.
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscriptions' AND column_name = 'payment_gateway'
    ) THEN
        ALTER TABLE public.subscriptions
            ADD COLUMN payment_gateway TEXT DEFAULT 'asaas';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
-- FIM DA MIGRATION
