alter table public.items
  add column importance smallint not null default 1 check (importance between 0 and 5);

alter table public.review_state alter column next_review_at drop not null;
alter table public.review_state drop constraint review_state_algorithm_version_check;
alter table public.review_state alter column algorithm_version set default 'importance-v1';
update public.review_state set algorithm_version = 'importance-v1';
alter table public.review_state add constraint review_state_algorithm_version_check
  check (algorithm_version = 'importance-v1');

create table public.item_importance_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id uuid not null,
  previous_importance smallint not null check (previous_importance between 0 and 5),
  new_importance smallint not null check (new_importance between 0 and 5),
  changed_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (item_id, user_id) references public.items(id, user_id) on delete cascade,
  check (previous_importance <> new_importance)
);

create index item_importance_events_history_idx
  on public.item_importance_events (item_id, changed_at desc);

alter table public.item_importance_events enable row level security;
create policy item_importance_events_select on public.item_importance_events
  for select to authenticated using (user_id = auth.uid());
revoke all on public.item_importance_events from anon;
grant select on public.item_importance_events to authenticated;

create function public.importance_v1_interval(p_importance smallint, p_memory_rating smallint)
returns interval language plpgsql immutable set search_path = '' as $$
begin
  if p_importance is null or p_importance not between 1 and 5 then
    raise exception 'Importance must be between 1 and 5' using errcode = '22023';
  end if;
  if p_memory_rating is null or p_memory_rating not between 0 and 4 then
    raise exception 'Memory rating must be between 0 and 4' using errcode = '22023';
  end if;
  return case p_importance
    when 5 then (array[interval '1 day', interval '3 days', interval '7 days', interval '14 days', interval '30 days'])[p_memory_rating + 1]
    when 4 then (array[interval '3 days', interval '7 days', interval '14 days', interval '30 days', interval '90 days'])[p_memory_rating + 1]
    when 3 then (array[interval '7 days', interval '14 days', interval '30 days', interval '90 days', interval '180 days'])[p_memory_rating + 1]
    when 2 then (array[interval '30 days', interval '90 days', interval '180 days', interval '365 days', interval '730 days'])[p_memory_rating + 1]
    when 1 then (array[interval '365 days', interval '365 days', interval '548 days', interval '730 days', interval '730 days'])[p_memory_rating + 1]
  end;
end;
$$;

create or replace function public.create_initial_review_state() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.review_state (item_id, user_id, next_review_at, algorithm_version)
  values (
    new.id,
    new.user_id,
    case when new.importance = 0 then null else new.created_at + interval '1 day' end,
    'importance-v1'
  );
  return new;
end;
$$;

create or replace function public.complete_review(p_item_id uuid, p_memory_rating smallint)
returns table (event_id uuid, next_review_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_event_id uuid;
  v_next_review_at timestamptz;
  v_importance smallint;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_memory_rating is null or p_memory_rating not between 0 and 4 then
    raise exception 'Memory rating must be between 0 and 4' using errcode = '22023';
  end if;
  select importance into v_importance from public.items
    where id = p_item_id and user_id = v_user_id for update;
  if v_importance is null then raise exception 'Item not found' using errcode = '42501'; end if;
  if v_importance = 0 then raise exception 'This item does not need reviews' using errcode = '22023'; end if;

  insert into public.review_events (user_id, item_id, memory_rating)
  values (v_user_id, p_item_id, p_memory_rating) returning id into v_event_id;
  v_next_review_at := now() + public.importance_v1_interval(v_importance, p_memory_rating);
  update public.review_state set next_review_at = v_next_review_at, algorithm_version = 'importance-v1'
    where item_id = p_item_id and user_id = v_user_id;
  if not found then raise exception 'Review state not found'; end if;
  return query select v_event_id, v_next_review_at;
end;
$$;

create function public.set_item_importance(p_item_id uuid, p_importance smallint)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_previous smallint;
  v_next timestamptz;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_importance is null or p_importance not between 0 and 5 then
    raise exception 'Importance must be between 0 and 5' using errcode = '22023';
  end if;
  select importance into v_previous from public.items
    where id = p_item_id and user_id = v_user_id for update;
  if v_previous is null then raise exception 'Item not found' using errcode = '42501'; end if;
  if v_previous = p_importance then
    select next_review_at into v_next from public.review_state where item_id = p_item_id and user_id = v_user_id;
    return v_next;
  end if;

  update public.items set importance = p_importance where id = p_item_id and user_id = v_user_id;
  insert into public.item_importance_events (user_id, item_id, previous_importance, new_importance)
    values (v_user_id, p_item_id, v_previous, p_importance);

  if p_importance = 0 then
    v_next := null;
    update public.review_state set next_review_at = null where item_id = p_item_id and user_id = v_user_id;
  elsif v_previous = 0 then
    v_next := now() + public.importance_v1_interval(p_importance, 0::smallint);
    update public.review_state set next_review_at = v_next where item_id = p_item_id and user_id = v_user_id;
  else
    select next_review_at into v_next from public.review_state where item_id = p_item_id and user_id = v_user_id;
  end if;
  return v_next;
end;
$$;

revoke all on function public.importance_v1_interval(smallint, smallint) from public, anon;
grant execute on function public.importance_v1_interval(smallint, smallint) to authenticated;
revoke all on function public.set_item_importance(uuid, smallint) from public, anon;
grant execute on function public.set_item_importance(uuid, smallint) to authenticated;

-- Importance must go through the audited function, rather than an unaudited
-- direct update from a signed-in client.
revoke update on public.items from authenticated;
grant update (title, url, short_text) on public.items to authenticated;
