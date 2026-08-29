-- ============================================================================
-- Faturas de cartão duplicadas no Histórico / nas notificações de conta a pagar
-- ============================================================================
--
-- Sintoma: uma fatura já paga aparecia dezenas de vezes como "conta pendente"
-- (ex.: 13x "Fatura Cartão: Bradesco (8/2026) — R$ 9132.56 — vencida"), tanto
-- na tela de Transações quanto no aviso de WhatsApp/push.
--
-- Causa: `FinanceService.syncStatementToHistory` procurava a transação espelho
-- da fatura com `.maybeSingle()` e ignorava o `error`. O PostgREST devolve erro
-- (com `data: null`) tanto quando a consulta falha quanto quando ela encontra
-- MAIS DE UMA linha. Como só o `data` era verificado, os dois casos eram lidos
-- como "o espelho não existe" e o código inseria mais uma linha. Bastava nascer
-- uma duplicata para toda sincronização seguinte gerar outra.
--
-- 1) Limpeza: mantém só uma transação espelho por fatura, preferindo a que
--    registra o pagamento; na falta dela, a mais antiga.
-- 2) Trava: índice único que impede o problema de voltar a acontecer.
-- ----------------------------------------------------------------------------

-- 1) Consolidação das duplicatas existentes
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, (metadata ->> 'card_statement_id')
      order by is_paid desc, created_at asc
    ) as rn
  from public.transactions
  where (metadata ->> 'card_statement_id') is not null
)
delete from public.transactions t
using ranked r
where t.id = r.id
  and r.rn > 1;

-- 2) Uma fatura, um espelho. Ponto.
create unique index if not exists uniq_transaction_per_card_statement
  on public.transactions (user_id, ((metadata ->> 'card_statement_id')))
  where (metadata ->> 'card_statement_id') is not null;
