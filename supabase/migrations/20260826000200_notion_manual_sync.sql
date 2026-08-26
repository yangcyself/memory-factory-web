create table public.notion_source_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  watch_list_id uuid not null,
  notion_page_id text not null,
  notion_last_edited_time timestamptz not null,
  item_id uuid not null,
  observed_at timestamptz not null default now(),
  unique (user_id, watch_list_id, notion_page_id),
  foreign key (watch_list_id, user_id) references public.notion_watch_lists(id, user_id) on delete cascade,
  foreign key (item_id, user_id) references public.items(id, user_id) on delete cascade
);

alter table public.notion_source_records enable row level security;

create policy notion_source_records_all on public.notion_source_records for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.notion_source_records from anon;

create function public.import_notion_pages(p_watch_list_id uuid, p_pages jsonb)
returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_page jsonb;
  v_item_id uuid;
  v_imported integer := 0;
begin
  if jsonb_typeof(p_pages) <> 'array' or jsonb_array_length(p_pages) > 10000 then
    raise exception 'Invalid Notion import batch.';
  end if;

  if not exists (
    select 1 from public.notion_watch_lists
    where id = p_watch_list_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'Active watch list not found.';
  end if;

  for v_page in select value from jsonb_array_elements(p_pages)
  loop
    if coalesce(v_page->>'notion_page_id', '') = ''
      or length(coalesce(v_page->>'title', '')) not between 1 and 200
      or length(coalesce(v_page->>'url', '')) > 2000
      or length(coalesce(v_page->>'short_text', '')) > 2000
      or coalesce(v_page->>'url', '') !~ '^https://'
    then
      raise exception 'Invalid Notion page candidate.';
    end if;

    if not exists (
      select 1 from public.notion_source_records
      where user_id = auth.uid()
        and watch_list_id = p_watch_list_id
        and notion_page_id = v_page->>'notion_page_id'
    ) then
      insert into public.items (title, url, short_text)
      values (v_page->>'title', v_page->>'url', nullif(v_page->>'short_text', ''))
      returning id into v_item_id;

      insert into public.notion_source_records (
        watch_list_id, notion_page_id, notion_last_edited_time, item_id
      ) values (
        p_watch_list_id,
        v_page->>'notion_page_id',
        (v_page->>'notion_last_edited_time')::timestamptz,
        v_item_id
      );
      v_imported := v_imported + 1;
    end if;
  end loop;

  update public.notion_watch_lists
  set last_checked_at = now(), next_check_on = current_date + 1
  where id = p_watch_list_id and user_id = auth.uid();

  return v_imported;
end;
$$;

revoke all on function public.import_notion_pages(uuid, jsonb) from public, anon;
grant execute on function public.import_notion_pages(uuid, jsonb) to authenticated;
