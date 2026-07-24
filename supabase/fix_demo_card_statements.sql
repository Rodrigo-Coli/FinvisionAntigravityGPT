-- fix_demo_card_statements.sql
--
-- PROBLEMA
-- O modo demo abria com a fatura do cartão em R$ 0,00 mesmo tendo 4 compras na
-- lista. Motivo: clone_demo_data insere card_transactions sem statement_id e nunca
-- cria nenhuma linha em card_statements — então Cartões, Painel e a projeção não
-- tinham fatura nenhuma para somar. É a primeira tela que um visitante vê.
--
-- CORREÇÃO
-- Acrescenta ao clone_demo_data, logo após as compras de cartão:
--   1) criação das faturas do período de cada compra,
--   2) vínculo das compras à fatura (o gatilho recalcula o total sozinho),
--   3) o lançamento espelho da fatura em Transações — o mesmo que o app cria via
--      syncStatementToHistory, para as duas telas nascerem coerentes.
--
-- A aritmética é a mesma de FinanceService.getOrCreateStatement: compra feita
-- depois do dia de fechamento cai na fatura do mês seguinte, e o vencimento pula
-- um mês quando due_day < closing_day.
--
-- POR QUE UM PATCH E NÃO O CORPO INTEIRO
-- clone_demo_data tem ~200 linhas (contas, transações, orçamentos, metas, ativos,
-- passivos, produtos, documentos de IA). Reescrevê-la à mão só para inserir um
-- bloco é convite a erro de transcrição. Este script lê a definição viva, insere o
-- bloco antes da âncora "-- ── BUDGETS" e recria a função. É idempotente: se o
-- bloco já estiver lá, não faz nada.
--
-- Usuários demo já existentes NÃO são corrigidos de propósito: são descartáveis
-- (cleanup_abandoned_demo_users apaga em 7 dias) e o próximo demo já nasce certo.

DO $patch$
DECLARE
  v_def   text;
  v_bloco text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'clone_demo_data';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'clone_demo_data nao encontrada';
  END IF;

  IF position('FATURAS DO CARTAO' in v_def) > 0 THEN
    RAISE NOTICE 'patch ja aplicado, nada a fazer';
    RETURN;
  END IF;

  IF position('-- ── BUDGETS' in v_def) = 0 THEN
    RAISE EXCEPTION 'ancora "-- BUDGETS" nao encontrada em clone_demo_data; patch abortado';
  END IF;

  v_bloco := E'  -- ── FATURAS DO CARTAO ───────────────────────────────────\n'
  || E'  -- Sem isto o demo abria com fatura R$ 0,00 e as compras soltas na lista.\n'
  || E'  -- Mesma aritmetica de FinanceService.getOrCreateStatement.\n'
  || E'  INSERT INTO public.card_statements (user_id, card_id, month, year, status, total_amount, paid_amount, closing_date, due_date)\n'
  || E'  SELECT DISTINCT\n'
  || E'    new_uid, p.card_id,\n'
  || E'    EXTRACT(MONTH FROM p.periodo)::int,\n'
  || E'    EXTRACT(YEAR  FROM p.periodo)::int,\n'
  || E'    ''OPEN'', 0, 0,\n'
  || E'    (p.periodo + ((p.closing_day - 1) * INTERVAL ''1 day''))::date,\n'
  || E'    ((CASE WHEN p.due_day < p.closing_day THEN p.periodo + INTERVAL ''1 month'' ELSE p.periodo END)\n'
  || E'      + ((p.due_day - 1) * INTERVAL ''1 day''))::date\n'
  || E'  FROM (\n'
  || E'    SELECT ct.card_id, c.closing_day, c.due_day,\n'
  || E'           date_trunc(''month'', ct.date::timestamp)\n'
  || E'             + CASE WHEN EXTRACT(DAY FROM ct.date) > c.closing_day\n'
  || E'                    THEN INTERVAL ''1 month'' ELSE INTERVAL ''0 day'' END AS periodo\n'
  || E'    FROM public.card_transactions ct\n'
  || E'    JOIN public.cards c ON c.id = ct.card_id\n'
  || E'    WHERE ct.user_id = new_uid\n'
  || E'  ) p;\n\n'
  || E'  -- Vincula cada compra a sua fatura; o gatilho recalcula total_amount sozinho.\n'
  || E'  UPDATE public.card_transactions ct\n'
  || E'  SET statement_id = s.id\n'
  || E'  FROM public.cards c, public.card_statements s\n'
  || E'  WHERE ct.user_id = new_uid\n'
  || E'    AND c.id = ct.card_id\n'
  || E'    AND s.card_id = ct.card_id\n'
  || E'    AND s.user_id = new_uid\n'
  || E'    AND s.month = EXTRACT(MONTH FROM (date_trunc(''month'', ct.date::timestamp)\n'
  || E'          + CASE WHEN EXTRACT(DAY FROM ct.date) > c.closing_day THEN INTERVAL ''1 month'' ELSE INTERVAL ''0 day'' END))::int\n'
  || E'    AND s.year  = EXTRACT(YEAR  FROM (date_trunc(''month'', ct.date::timestamp)\n'
  || E'          + CASE WHEN EXTRACT(DAY FROM ct.date) > c.closing_day THEN INTERVAL ''1 month'' ELSE INTERVAL ''0 day'' END))::int;\n\n'
  || E'  -- Espelho da fatura em Transacoes (o app cria via syncStatementToHistory).\n'
  || E'  -- Fica em aberto com paid_amount 0, entao nao mexe no saldo semeado da conta.\n'
  || E'  INSERT INTO public.transactions (user_id, account_id, account_name, description, amount, date, type, category, owner_name, is_paid, paid_amount, metadata, is_deleted)\n'
  || E'  SELECT new_uid, c.account_id, a.institution,\n'
  || E'         ''Fatura Cartao: '' || c.name || '' ('' || s.month || ''/'' || s.year || '')'',\n'
  || E'         GREATEST(s.total_amount, 0), s.due_date, ''BILL_PAYMENT'',\n'
  || E'         COALESCE(c.default_category, ''Pagamento de Fatura''), ''Pessoal'',\n'
  || E'         false, 0,\n'
  || E'         jsonb_build_object(''card_statement_id'', s.id::text, ''is_provision'', true),\n'
  || E'         false\n'
  || E'  FROM public.card_statements s\n'
  || E'  JOIN public.cards c ON c.id = s.card_id\n'
  || E'  LEFT JOIN public.accounts a ON a.id = c.account_id\n'
  || E'  WHERE s.user_id = new_uid AND s.total_amount > 0;\n\n';

  v_def := replace(v_def, '  -- ── BUDGETS', v_bloco || '  -- ── BUDGETS');

  EXECUTE v_def;
  RAISE NOTICE 'clone_demo_data atualizada';
END
$patch$;

-- Conferência: deve devolver true
-- select position('FATURAS DO CARTAO' in pg_get_functiondef(p.oid)) > 0
-- from pg_proc p join pg_namespace n on n.oid=p.pronamespace
-- where n.nspname='public' and p.proname='clone_demo_data';
