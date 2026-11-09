-- Extrato do investimento: o app oferece "Amortização" (AMORTIZACAO), mas o banco
-- recusava esse tipo. Aplicado em 09/11/2026 (migração investment_movements_allow_amortizacao).
alter table public.investment_movements drop constraint if exists investment_movements_movement_type_check;
alter table public.investment_movements add constraint investment_movements_movement_type_check
  check (movement_type = any (array['APORTE','RENDIMENTO_MENSAL','RENDIMENTO_ACUMULADO','RESGATE_PARCIAL','RESGATE_TOTAL','AJUSTE_MANUAL','AMORTIZACAO']));
