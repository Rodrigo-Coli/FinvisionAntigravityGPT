-- Cadastro de tags (Configurações > Tags)
--
-- Até aqui as tags existiam só dentro dos lançamentos (transactions.tags e
-- card_transactions.tags, text[]) e num catálogo no aparelho: toda tag já usada
-- virava sugestão para sempre, sem como tirar. Esta tabela guarda as tags
-- criadas e as ARQUIVADAS (que deixam de ser sugeridas). Excluir uma tag a tira
-- dos lançamentos (remove_tag_from_entries) e apaga a linha daqui.
--
-- Nome comparado sem acento/maiúscula/espaço, igual a lib/tagUtils.normalizeTag.

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.normalize_tag_key(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(trim(translate(coalesce(p, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')))
$$;

create unique index if not exists tags_user_key_uniq on public.tags (user_id, public.normalize_tag_key(name));

alter table public.tags enable row level security;

drop policy if exists tags_owner_all on public.tags;
create policy tags_owner_all on public.tags
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Quantos lançamentos (banco + cartão) usam cada tag do usuário.
create or replace function public.tag_usage_counts()
returns table(tag text, entries bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select min(t) as tag, count(*) as entries
  from (
    select unnest(tags) as t from public.transactions where user_id = auth.uid() and coalesce(is_deleted, false) = false
    union all
    select unnest(tags) from public.card_transactions where user_id = auth.uid()
  ) x
  where trim(coalesce(t, '')) <> ''
  group by public.normalize_tag_key(t)
$$;

-- Tira a tag (qualquer grafia) de todos os lançamentos do usuário.
create or replace function public.remove_tag_from_entries(p_tag text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  k text := public.normalize_tag_key(p_tag);
  n1 integer := 0;
  n2 integer := 0;
begin
  if k = '' then return 0; end if;

  update public.transactions
     set tags = coalesce((select array_agg(t) from unnest(tags) t where public.normalize_tag_key(t) <> k), '{}')
   where user_id = auth.uid()
     and exists (select 1 from unnest(tags) t where public.normalize_tag_key(t) = k);
  get diagnostics n1 = row_count;

  update public.card_transactions
     set tags = coalesce((select array_agg(t) from unnest(tags) t where public.normalize_tag_key(t) <> k), '{}')
   where user_id = auth.uid()
     and exists (select 1 from unnest(tags) t where public.normalize_tag_key(t) = k);
  get diagnostics n2 = row_count;

  return n1 + n2;
end;
$$;

grant select, insert, update, delete on public.tags to authenticated;
grant execute on function public.tag_usage_counts() to authenticated;
grant execute on function public.remove_tag_from_entries(text) to authenticated;
grant execute on function public.normalize_tag_key(text) to authenticated;
