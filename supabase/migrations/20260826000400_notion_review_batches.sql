alter table public.notion_watch_lists
  drop constraint notion_watch_lists_status_check,
  add constraint notion_watch_lists_status_check
    check (status in ('active', 'paused', 'needs_attention', 'removed')),
  add column label_property_id text,
  add column url_property_id text,
  add column hint_property_id text,
  add column property_options jsonb not null default '[]'::jsonb
    check (jsonb_typeof(property_options) = 'array'),
  add column last_new_count integer not null default 0 check (last_new_count >= 0);

create table public.notion_import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  watch_list_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'dismissed')),
  candidate_count integer not null default 0 check (candidate_count >= 0),
  imported_count integer not null default 0 check (imported_count >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, user_id),
  foreign key (watch_list_id, user_id) references public.notion_watch_lists(id, user_id) on delete cascade
);

create table public.notion_import_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  batch_id uuid not null,
  notion_page_id text not null,
  notion_last_edited_time timestamptz not null,
  title text not null check (length(btrim(title)) between 1 and 200),
  url text not null check (length(url) <= 2000 and url ~ '^https?://'),
  short_text text check (length(short_text) <= 2000),
  item_id uuid,
  unique (user_id, batch_id, notion_page_id),
  foreign key (batch_id, user_id) references public.notion_import_batches(id, user_id) on delete cascade,
  foreign key (item_id, user_id) references public.items(id, user_id) on delete cascade
);

alter table public.notion_import_batches enable row level security;
alter table public.notion_import_entries enable row level security;
create policy notion_import_batches_all on public.notion_import_batches for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notion_import_entries_all on public.notion_import_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.notion_import_batches, public.notion_import_entries from anon;

create function public.stage_notion_import(p_watch_list_id uuid, p_pages jsonb)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_batch_id uuid;
  v_page jsonb;
  v_count integer := 0;
begin
  if jsonb_typeof(p_pages) <> 'array' or jsonb_array_length(p_pages) > 10000 then
    raise exception 'Invalid Notion check result.';
  end if;
  if not exists (select 1 from public.notion_watch_lists where id = p_watch_list_id and user_id = auth.uid() and status = 'active') then
    raise exception 'Active watch list not found.';
  end if;

  update public.notion_import_batches set status = 'dismissed'
  where user_id = auth.uid() and watch_list_id = p_watch_list_id and status = 'pending';
  insert into public.notion_import_batches (watch_list_id) values (p_watch_list_id) returning id into v_batch_id;

  for v_page in select value from jsonb_array_elements(p_pages)
  loop
    if coalesce(v_page->>'notion_page_id', '') = ''
      or length(coalesce(v_page->>'title', '')) not between 1 and 200
      or length(coalesce(v_page->>'url', '')) > 2000
      or coalesce(v_page->>'url', '') !~ '^https?://'
      or length(coalesce(v_page->>'short_text', '')) > 2000 then
      raise exception 'Invalid Notion page candidate.';
    end if;
    if not exists (select 1 from public.notion_source_records where user_id = auth.uid() and watch_list_id = p_watch_list_id and notion_page_id = v_page->>'notion_page_id') then
      insert into public.notion_import_entries (batch_id, notion_page_id, notion_last_edited_time, title, url, short_text)
      values (v_batch_id, v_page->>'notion_page_id', (v_page->>'notion_last_edited_time')::timestamptz, v_page->>'title', v_page->>'url', nullif(v_page->>'short_text', ''));
      v_count := v_count + 1;
    end if;
  end loop;

  update public.notion_import_batches set candidate_count = v_count where id = v_batch_id and user_id = auth.uid();
  update public.notion_watch_lists set last_checked_at = now(), next_check_on = current_date + 1, last_new_count = v_count where id = p_watch_list_id and user_id = auth.uid();
  return v_batch_id;
end;
$$;

create function public.import_notion_batch(p_batch_id uuid, p_entry_ids uuid[])
returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_entry record;
  v_watch_list_id uuid;
  v_item_id uuid;
  v_count integer := 0;
begin
  if coalesce(array_length(p_entry_ids, 1), 0) > 10000 then raise exception 'Too many selected items.'; end if;
  select watch_list_id into v_watch_list_id from public.notion_import_batches
    where id = p_batch_id and user_id = auth.uid() and status = 'pending' for update;
  if v_watch_list_id is null then raise exception 'Pending import batch not found.'; end if;

  for v_entry in select * from public.notion_import_entries
    where batch_id = p_batch_id and user_id = auth.uid() and id = any(p_entry_ids)
  loop
    if not exists (select 1 from public.notion_source_records where user_id = auth.uid() and watch_list_id = v_watch_list_id and notion_page_id = v_entry.notion_page_id) then
      insert into public.items (title, url, short_text) values (v_entry.title, v_entry.url, v_entry.short_text) returning id into v_item_id;
      insert into public.notion_source_records (watch_list_id, notion_page_id, notion_last_edited_time, item_id)
        values (v_watch_list_id, v_entry.notion_page_id, v_entry.notion_last_edited_time, v_item_id);
      update public.notion_import_entries set item_id = v_item_id where id = v_entry.id and user_id = auth.uid();
      v_count := v_count + 1;
    end if;
  end loop;
  update public.notion_import_batches set status = 'completed', imported_count = v_count, completed_at = now()
    where id = p_batch_id and user_id = auth.uid();
  update public.notion_watch_lists set last_new_count = 0
    where id = v_watch_list_id and user_id = auth.uid();
  return v_count;
end;
$$;

revoke all on function public.stage_notion_import(uuid, jsonb) from public, anon;
revoke all on function public.import_notion_batch(uuid, uuid[]) from public, anon;
grant execute on function public.stage_notion_import(uuid, jsonb) to authenticated;
grant execute on function public.import_notion_batch(uuid, uuid[]) to authenticated;
