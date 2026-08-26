create table public.notion_oauth_states (
  state_hash text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  next_path text not null default '/imports/notion' check (next_path like '/%' and next_path not like '//%'),
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now()
);

create table public.notion_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workspace_id text not null,
  workspace_name text,
  workspace_icon text,
  bot_id text,
  encrypted_access_token text not null,
  token_key_version smallint not null default 1,
  status text not null default 'connected' check (status in ('connected', 'needs_reauthorization', 'disconnected')),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, workspace_id)
);

create table public.notion_watch_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  connection_id uuid not null,
  database_id text not null,
  data_source_id text not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  sync_mode text not null default 'new_only' check (sync_mode in ('new_only', 'new_and_changed', 'manual')),
  status text not null default 'active' check (status in ('active', 'paused', 'needs_attention')),
  last_checked_at timestamptz,
  next_check_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, connection_id, data_source_id),
  foreign key (connection_id, user_id) references public.notion_connections(id, user_id) on delete cascade
);

create index notion_watch_lists_due_idx on public.notion_watch_lists (user_id, next_check_on) where status = 'active';

create trigger notion_connections_set_updated_at before update on public.notion_connections
for each row execute function public.set_updated_at();
create trigger notion_watch_lists_set_updated_at before update on public.notion_watch_lists
for each row execute function public.set_updated_at();

alter table public.notion_oauth_states enable row level security;
alter table public.notion_connections enable row level security;
alter table public.notion_watch_lists enable row level security;

create policy notion_oauth_states_all on public.notion_oauth_states for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notion_connections_all on public.notion_connections for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notion_watch_lists_all on public.notion_watch_lists for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.notion_oauth_states, public.notion_connections, public.notion_watch_lists from anon;

create function public.consume_notion_oauth_state(p_state_hash text)
returns text
language plpgsql security invoker set search_path = '' as $$
declare
  v_next_path text;
begin
  delete from public.notion_oauth_states
    where state_hash = p_state_hash
      and user_id = auth.uid()
      and expires_at > now()
    returning next_path into v_next_path;
  return v_next_path;
end;
$$;

revoke all on function public.consume_notion_oauth_state(text) from public, anon;
grant execute on function public.consume_notion_oauth_state(text) to authenticated;
