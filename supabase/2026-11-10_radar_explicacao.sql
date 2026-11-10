-- Radar de Investimentos: explicação de por que o investimento subiu ou caiu
-- (rendimento mês a mês × CDI, indexador, mercado × curva, IR, juros pagos).
-- Calculada pelo servidor em cada análise; a tela só mostra.
-- Idempotente. O servidor também funciona sem a coluna (grava o resto).
alter table public.investment_radar add column if not exists explanation jsonb;
