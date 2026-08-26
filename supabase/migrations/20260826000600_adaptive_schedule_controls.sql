alter table public.items alter column importance set default 1;

alter table public.review_state
  add column difficulty real not null default 5 check (difficulty between 1 and 10),
  add column stability_days real not null default 1 check (stability_days > 0),
  add column repetitions integer not null default 0 check (repetitions >= 0),
  add column lapses integer not null default 0 check (lapses >= 0),
  add column last_review_at timestamptz,
  add column suspended boolean not null default false;

alter table public.review_state drop constraint review_state_algorithm_version_check;
alter table public.review_state alter column algorithm_version set default 'adaptive-v2';
update public.review_state set algorithm_version = 'adaptive-v2';
alter table public.review_state add constraint review_state_algorithm_version_check
  check (algorithm_version = 'adaptive-v2');

create table public.user_review_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  time_zone text not null default 'UTC' check (length(time_zone) between 1 and 100),
  updated_at timestamptz not null default now()
);
alter table public.user_review_preferences enable row level security;
create policy user_review_preferences_select on public.user_review_preferences
  for select to authenticated using (user_id = auth.uid());
create policy user_review_preferences_insert on public.user_review_preferences
  for insert to authenticated with check (user_id = auth.uid());
create policy user_review_preferences_update on public.user_review_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.user_review_preferences from anon;
grant select, insert, update on public.user_review_preferences to authenticated;

create type public.schedule_adjustment_type as enum ('postponed', 'suspended', 'resumed', 'rescheduled');
create table public.schedule_adjustment_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id uuid not null,
  adjustment_type public.schedule_adjustment_type not null,
  previous_review_at timestamptz,
  new_review_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (item_id, user_id) references public.items(id, user_id) on delete cascade
);
alter table public.schedule_adjustment_events enable row level security;
create policy schedule_adjustment_events_select on public.schedule_adjustment_events
  for select to authenticated using (user_id = auth.uid());
revoke all on public.schedule_adjustment_events from anon;
grant select on public.schedule_adjustment_events to authenticated;

create or replace function public.create_initial_review_state() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.review_state (item_id, user_id, next_review_at, algorithm_version, stability_days)
  values (
    new.id, new.user_id,
    case when new.importance = 0 then null else new.created_at + interval '1 day' end,
    'adaptive-v2',
    case new.importance when 1 then 365 when 2 then 30 when 3 then 7 when 4 then 3 else 1 end
  );
  return new;
end;
$$;

drop function public.complete_review(uuid, smallint);
create function public.complete_review(p_item_id uuid, p_memory_rating smallint, p_importance smallint)
returns table (event_id uuid, next_review_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid := auth.uid(); v_event_id uuid; v_next timestamptz; v_importance smallint;
  v_state public.review_state%rowtype; v_elapsed real; v_retrievability real;
  v_difficulty real; v_stability real; v_interval real; v_min real; v_max real;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_memory_rating is null or p_memory_rating not between 0 and 4 then raise exception 'Memory rating must be between 0 and 4' using errcode = '22023'; end if;
  if p_importance is null or p_importance not between 1 and 5 then raise exception 'Reviewed items need importance between 1 and 5' using errcode = '22023'; end if;
  select importance into v_importance from public.items where id = p_item_id and user_id = v_user_id for update;
  if v_importance is null then raise exception 'Item not found' using errcode = '42501'; end if;
  if v_importance <> p_importance then
    update public.items set importance = p_importance where id = p_item_id and user_id = v_user_id;
    insert into public.item_importance_events (user_id, item_id, previous_importance, new_importance)
      values (v_user_id, p_item_id, v_importance, p_importance);
    v_importance := p_importance;
  end if;
  select * into v_state from public.review_state where item_id = p_item_id and user_id = v_user_id for update;
  if v_state.suspended then raise exception 'Resume this item before reviewing it' using errcode = '22023'; end if;

  v_elapsed := greatest(0.01, extract(epoch from (now() - coalesce(v_state.last_review_at, v_state.updated_at))) / 86400.0);
  v_retrievability := exp(-v_elapsed / greatest(0.1, v_state.stability_days));
  v_difficulty := greatest(1, least(10, v_state.difficulty + 0.55 * (2 - p_memory_rating)));
  if p_memory_rating <= 1 then
    v_stability := greatest(0.5, v_state.stability_days * (0.25 + 0.15 * p_memory_rating));
  else
    v_stability := v_state.stability_days * (1 + (11 - v_difficulty) * (0.08 + p_memory_rating * 0.04) * (1.15 - v_retrievability));
  end if;
  v_min := case v_importance when 1 then 365 when 2 then 30 when 3 then 7 when 4 then 3 else 1 end;
  v_max := case v_importance when 1 then 730 when 2 then 365 when 3 then 180 when 4 then 90 else 30 end;
  v_interval := greatest(v_min, least(v_max, v_stability));
  v_next := now() + make_interval(secs => round(v_interval * 86400)::double precision);

  insert into public.review_events (user_id, item_id, memory_rating) values (v_user_id, p_item_id, p_memory_rating) returning id into v_event_id;
  update public.review_state set next_review_at = v_next, algorithm_version = 'adaptive-v2',
    difficulty = v_difficulty, stability_days = v_stability,
    repetitions = repetitions + case when p_memory_rating >= 2 then 1 else 0 end,
    lapses = lapses + case when p_memory_rating <= 1 then 1 else 0 end,
    last_review_at = now()
    where item_id = p_item_id and user_id = v_user_id;
  return query select v_event_id, v_next;
end;
$$;
revoke all on function public.complete_review(uuid, smallint, smallint) from public, anon;
grant execute on function public.complete_review(uuid, smallint, smallint) to authenticated;

create function public.adjust_review_schedule(
  p_item_id uuid, p_action public.schedule_adjustment_type,
  p_scheduled_at timestamptz default null, p_postpone_days integer default null
) returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid(); v_previous timestamptz; v_next timestamptz; v_suspended boolean; v_importance smallint;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select rs.next_review_at, rs.suspended, i.importance into v_previous, v_suspended, v_importance
    from public.review_state rs join public.items i on i.id = rs.item_id and i.user_id = rs.user_id
    where rs.item_id = p_item_id and rs.user_id = v_user_id for update of rs;
  if not found then raise exception 'Item not found' using errcode = '42501'; end if;
  if v_importance = 0 then raise exception 'Reviews are disabled by importance' using errcode = '22023'; end if;
  if p_action = 'postponed' then
    if p_postpone_days is null or p_postpone_days not between 1 and 3650 then raise exception 'Postpone days must be between 1 and 3650'; end if;
    v_next := greatest(coalesce(v_previous, now()), now()) + make_interval(days => p_postpone_days);
    update public.review_state set next_review_at = v_next, suspended = false where item_id = p_item_id and user_id = v_user_id;
  elsif p_action = 'rescheduled' then
    if p_scheduled_at is null then raise exception 'A schedule date is required'; end if;
    v_next := p_scheduled_at;
    update public.review_state set next_review_at = v_next, suspended = false where item_id = p_item_id and user_id = v_user_id;
  elsif p_action = 'suspended' then
    v_next := null;
    update public.review_state set next_review_at = null, suspended = true where item_id = p_item_id and user_id = v_user_id;
  elsif p_action = 'resumed' then
    v_next := coalesce(p_scheduled_at, v_previous, now());
    update public.review_state set next_review_at = v_next, suspended = false where item_id = p_item_id and user_id = v_user_id;
  end if;
  insert into public.schedule_adjustment_events (user_id, item_id, adjustment_type, previous_review_at, new_review_at)
    values (v_user_id, p_item_id, p_action, v_previous, v_next);
  return v_next;
end;
$$;

revoke all on function public.adjust_review_schedule(uuid, public.schedule_adjustment_type, timestamptz, integer) from public, anon;
grant execute on function public.adjust_review_schedule(uuid, public.schedule_adjustment_type, timestamptz, integer) to authenticated;
