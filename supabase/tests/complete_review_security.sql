begin;
do $$
declare
  v_security_definer boolean;
begin
  select prosecdef into v_security_definer
  from pg_proc
  where oid = 'public.complete_review(uuid,smallint,smallint)'::regprocedure;

  assert v_security_definer,
    'complete_review must be security definer so its atomic importance update is permitted';
  assert not has_column_privilege('authenticated', 'public.items', 'importance', 'update'),
    'authenticated users must not update importance outside the audited RPC';
  assert has_function_privilege(
    'authenticated',
    'public.complete_review(uuid,smallint,smallint)',
    'execute'
  ), 'authenticated users must be able to complete reviews through the RPC';
end $$;
rollback;
