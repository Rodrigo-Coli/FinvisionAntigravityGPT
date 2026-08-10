-- Feature: marcar um cartão como padrão. O cartão padrão é pré-selecionado ao
-- abrir a tela de Cartões e aparece primeiro nas listas de seleção de cartão
-- (ex.: "Cartão de Destino" ao lançar um gasto manual).

ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Garante no máximo 1 cartão padrão por usuário (protege contra corrida entre
-- as duas chamadas do client que limpam o antigo e marcam o novo).
CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_one_default_per_user
  ON public.cards (user_id)
  WHERE is_default = true;

NOTIFY pgrst, 'reload schema';
