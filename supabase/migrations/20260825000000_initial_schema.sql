create extension if not exists pgcrypto;

create type public.item_relation_type as enum (
  'related', 'contains', 'references', 'applied_in', 'derived_from', 'contradicts'
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  url text,
  short_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (nullif(btrim(url), '') is not null or nullif(btrim(short_text), '') is not null)
);

create table public.review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id uuid not null,
  reviewed_at timestamptz not null default now(),
  memory_rating smallint not null check (memory_rating between 0 and 4),
  unique (id, user_id),
  foreign key (item_id, user_id) references public.items(id, user_id) on delete cascade
);

create table public.review_state (
  item_id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  next_review_at timestamptz not null,
  algorithm_version text not null default 'rating-v1' check (algorithm_version = 'rating-v1'),
  updated_at timestamptz not null default now(),
  foreign key (item_id, user_id) references public.items(id, user_id) on delete cascade
);

create table public.item_edges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_item_id uuid not null,
  target_item_id uuid not null,
  relation_type public.item_relation_type not null default 'related',
  semantic_weight real not null default 0.5 check (semantic_weight between 0 and 1),
  created_during_review_id uuid,
  created_at timestamptz not null default now(),
  check (source_item_id <> target_item_id),
  foreign key (source_item_id, user_id) references public.items(id, user_id) on delete cascade,
  foreign key (target_item_id, user_id) references public.items(id, user_id) on delete cascade,
  foreign key (created_during_review_id, user_id) references public.review_events(id, user_id) on delete restrict
);

create unique index item_edges_directed_unique
  on public.item_edges (user_id, source_item_id, target_item_id, relation_type)
  where relation_type <> 'related';
create unique index item_edges_related_unique
  on public.item_edges (
    user_id,
    least(source_item_id, target_item_id),
    greatest(source_item_id, target_item_id)
  ) where relation_type = 'related';
create index review_state_due_idx on public.review_state (user_id, next_review_at);
create index review_events_history_idx on public.review_events (item_id, reviewed_at desc);
create index item_edges_outgoing_idx on public.item_edges (source_item_id);
create index item_edges_incoming_idx on public.item_edges (target_item_id);
create index items_user_title_idx on public.items (user_id, title);

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_set_updated_at before update on public.items
for each row execute function public.set_updated_at();
create trigger review_state_set_updated_at before update on public.review_state
for each row execute function public.set_updated_at();

create function public.create_initial_review_state() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.review_state (item_id, user_id, next_review_at)
  values (new.id, new.user_id, new.created_at + interval '1 day');
  return new;
end;
$$;

create trigger items_create_review_state after insert on public.items
for each row execute function public.create_initial_review_state();

create function public.rating_v1_interval(p_memory_rating smallint) returns interval
language plpgsql immutable set search_path = '' as $$
begin
  if p_memory_rating is null or p_memory_rating not between 0 and 4 then
    raise exception 'Memory rating must be between 0 and 4' using errcode = '22023';
  end if;
  return case p_memory_rating
    when 0 then interval '1 day'
    when 1 then interval '3 days'
    when 2 then interval '7 days'
    when 3 then interval '14 days'
    when 4 then interval '30 days'
  end;
end;
$$;

create function public.complete_review(p_item_id uuid, p_memory_rating smallint)
returns table (event_id uuid, next_review_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_event_id uuid;
  v_next_review_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_memory_rating is null or p_memory_rating not between 0 and 4 then
    raise exception 'Memory rating must be between 0 and 4' using errcode = '22023';
  end if;
  if not exists (select 1 from public.items where id = p_item_id and user_id = v_user_id) then
    raise exception 'Item not found' using errcode = '42501';
  end if;

  insert into public.review_events (user_id, item_id, memory_rating)
  values (v_user_id, p_item_id, p_memory_rating)
  returning id into v_event_id;

  v_next_review_at := now() + public.rating_v1_interval(p_memory_rating);
  update public.review_state
    set next_review_at = v_next_review_at, algorithm_version = 'rating-v1'
    where item_id = p_item_id and user_id = v_user_id;
  if not found then raise exception 'Review state not found'; end if;

  return query select v_event_id, v_next_review_at;
end;
$$;

alter table public.items enable row level security;
alter table public.review_events enable row level security;
alter table public.review_state enable row level security;
alter table public.item_edges enable row level security;

create policy items_select on public.items for select to authenticated using (user_id = auth.uid());
create policy items_insert on public.items for insert to authenticated with check (user_id = auth.uid());
create policy items_update on public.items for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy items_delete on public.items for delete to authenticated using (user_id = auth.uid());

create policy review_events_select on public.review_events for select to authenticated using (user_id = auth.uid());
create policy review_events_insert on public.review_events for insert to authenticated with check (user_id = auth.uid());
create policy review_events_update on public.review_events for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy review_events_delete on public.review_events for delete to authenticated using (user_id = auth.uid());

create policy review_state_select on public.review_state for select to authenticated using (user_id = auth.uid());
create policy review_state_insert on public.review_state for insert to authenticated with check (user_id = auth.uid());
create policy review_state_update on public.review_state for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy review_state_delete on public.review_state for delete to authenticated using (user_id = auth.uid());

create policy item_edges_select on public.item_edges for select to authenticated using (user_id = auth.uid());
create policy item_edges_insert on public.item_edges for insert to authenticated with check (user_id = auth.uid());
create policy item_edges_update on public.item_edges for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy item_edges_delete on public.item_edges for delete to authenticated using (user_id = auth.uid());

revoke all on public.items, public.review_events, public.review_state, public.item_edges from anon;
revoke all on function public.complete_review(uuid, smallint) from public, anon;
grant execute on function public.complete_review(uuid, smallint) to authenticated;
revoke all on function public.rating_v1_interval(smallint) from public, anon;
grant execute on function public.rating_v1_interval(smallint) to authenticated;
