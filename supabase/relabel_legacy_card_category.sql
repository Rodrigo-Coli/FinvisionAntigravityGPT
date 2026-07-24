-- relabel_legacy_card_category.sql
--
-- CONTEXTO
-- Lançamentos ANTIGOS vindos do extrato bancário ("GASTOS CARTAO DE CREDITO",
-- "PAGTO ELETRON COBRANCA ...", "Pagamento de fatura") ficaram com a categoria
-- 'Cartão de Crédito'. Como o cartão não é um gasto — é onde o gasto aconteceu —
-- essa linha reaparecia como categoria nos gráficos daqueles meses.
--
-- DECISÃO DO USUÁRIO (23/Jul/2026)
-- Passar esses lançamentos para 'Sem categoria'. Ele vai cadastrar as dívidas
-- antigas de cartão mais para frente; até lá 'Sem categoria' marca o que ainda
-- precisa ser detalhado, e o gráfico deixa de ter "Cartão de Crédito" como categoria.
--
-- ESCOPO — só o que é seguro mexer:
--   • type = 'EXPENSE'  → os 47 lançamentos legados do extrato (todos já pagos,
--                         então não entram em projeção nem em contas a pagar).
--   • type = 'BILL_PAYMENT' NÃO é tocado: são os espelhos das faturas geradas pelo
--     app (metadata.card_statement_id). A categoria deles vem de cards.default_category
--     e é reescrita a cada syncStatementToHistory — mudar aqui não duraria. Eles já
--     são excluídos dos gráficos pelo filtro metadata.is_provision.
--
-- REVERSÍVEL: a categoria anterior fica guardada em metadata.previous_category.

UPDATE public.transactions
SET category = 'Sem categoria',
    metadata = COALESCE(metadata, '{}'::jsonb)
               || jsonb_build_object('previous_category', 'Cartão de Crédito')
WHERE is_deleted = false
  AND type = 'EXPENSE'
  AND category = 'Cartão de Crédito';

-- Conferência
-- select category, type, count(*) from transactions
-- where is_deleted = false and (category = 'Cartão de Crédito' or metadata ? 'previous_category')
-- group by 1,2;

-- ── COMO DESFAZER ──
-- UPDATE public.transactions
-- SET category = metadata->>'previous_category',
--     metadata = metadata - 'previous_category'
-- WHERE metadata->>'previous_category' IS NOT NULL;
