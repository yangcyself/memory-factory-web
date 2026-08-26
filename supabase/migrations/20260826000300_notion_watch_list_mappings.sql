alter table public.notion_watch_lists
  add column label_property text check (
    label_property is null or length(btrim(label_property)) between 1 and 200
  ),
  add column url_property text check (
    url_property is null or length(btrim(url_property)) between 1 and 200
  );
