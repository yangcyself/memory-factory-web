create table public.notion_integration_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null default 'My Notion integration' check (length(btrim(label)) between 1 and 100),
  client_id text not null check (length(btrim(client_id)) between 1 and 200),
  encrypted_client_secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, client_id)
);

alter table public.notion_oauth_states add column integration_setting_id uuid;
alter table public.notion_oauth_states add constraint notion_oauth_states_integration_setting_fkey
foreign key (integration_setting_id, user_id) references public.notion_integration_settings(id, user_id) on delete cascade;

create trigger notion_integration_settings_set_updated_at before update on public.notion_integration_settings
for each row execute function public.set_updated_at();

alter table public.notion_integration_settings enable row level security;
create policy notion_integration_settings_all on public.notion_integration_settings for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.notion_integration_settings from anon;

drop function public.consume_notion_oauth_state(text);
create function public.consume_notion_oauth_state(p_state_hash text)
returns table (next_path text, integration_setting_id uuid)
language plpgsql security invoker set search_path = '' as $$
begin
  return query delete from public.notion_oauth_states states
    where states.state_hash = p_state_hash and states.user_id = auth.uid() and states.expires_at > now()
    returning states.next_path, states.integration_setting_id;
end;
$$;
revoke all on function public.consume_notion_oauth_state(text) from public, anon;
grant execute on function public.consume_notion_oauth_state(text) to authenticated;
