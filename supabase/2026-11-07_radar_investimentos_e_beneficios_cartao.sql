-- Radar de Investimentos + Benefícios de cartão (cashback/pontos/milhas)
--
-- investment_radar: o último resultado do radar por investimento (nível,
--   sinais, conta de sair × segurar, fontes das notícias) e quando checar de
--   novo. Uma linha por ativo; a varredura diária e o botão "Analisar agora"
--   fazem upsert por asset_id.
-- investment_proposals: análises de sugestões do banco/gerente (print ou PDF)
--   comparadas com a carteira, com as respostas do gerente e as reavaliações
--   (follow_ups) — pelo app ou pelo WhatsApp.
-- cards.benefits: cadastro do benefício do cartão (lib/cardBenefits.ts).

create table if not exists public.investment_radar (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.physical_assets(id) on delete cascade,
  level text not null check (level in ('OK', 'ATENCAO', 'URGENTE')),
  score integer,
  signals jsonb not null default '[]'::jsonb,
  summary text,
  recommendation text,
  exit_math jsonb,
  news jsonb,
  sources jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  checked_at timestamptz not null default now(),
  next_check_at timestamptz,
  notified_at timestamptz,
  dismissed_until timestamptz,
  constraint investment_radar_asset_unique unique (asset_id)
);

create index if not exists investment_radar_user_idx on public.investment_radar (user_id, level);
create index if not exists investment_radar_next_check_idx on public.investment_radar (next_check_at);

alter table public.investment_radar enable row level security;
drop policy if exists "User data isolation" on public.investment_radar;
create policy "User data isolation" on public.investment_radar
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.investment_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  source_name text,
  user_note text,
  extracted jsonb,
  verdict text,
  analysis text,
  -- Respostas do gerente e cada reavaliação (memória da conversa sobre a sugestão).
  follow_ups jsonb not null default '[]'::jsonb,
  -- Por onde chegou: 'app' ou 'whatsapp'.
  channel text
);

create index if not exists investment_proposals_user_idx on public.investment_proposals (user_id, created_at desc);

alter table public.investment_proposals enable row level security;
drop policy if exists "User data isolation" on public.investment_proposals;
create policy "User data isolation" on public.investment_proposals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.cards add column if not exists benefits jsonb;
