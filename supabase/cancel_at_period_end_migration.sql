-- ============================================================
-- FINVISION PRO — CANCELAMENTO NO FIM DO PERÍODO (v1.0)
-- ============================================================
-- Data: 2026-07-25
-- IDEMPOTENTE: seguro para re-executar múltiplas vezes.
--
-- Objetivo: permitir que o usuário cancele a assinatura e pare de
-- ser cobrado, mas continue com acesso ao plano pago até a data
-- que seria a próxima renovação (current_period_end). Só quando
-- essa data chegar (via cron diário) é que o status vira 'canceled'
-- de fato e o usuário é rebaixado para o plano Starter.
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscriptions' AND column_name = 'cancel_at_period_end'
    ) THEN
        ALTER TABLE public.subscriptions
            ADD COLUMN cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_cancel_at_period_end
    ON public.subscriptions(cancel_at_period_end)
    WHERE cancel_at_period_end = true;

NOTIFY pgrst, 'reload schema';
-- FIM DA MIGRATION
