begin;
do $$
begin
  assert public.importance_v1_interval(5::smallint, 0::smallint) = interval '1 day';
  assert public.importance_v1_interval(5::smallint, 4::smallint) = interval '30 days';
  assert public.importance_v1_interval(3::smallint, 2::smallint) = interval '30 days';
  assert public.importance_v1_interval(1::smallint, 0::smallint) = interval '365 days';
  assert public.importance_v1_interval(1::smallint, 4::smallint) = interval '730 days';
  begin
    perform public.importance_v1_interval(0::smallint, 2::smallint);
    assert false, 'importance 0 should not produce an interval';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.importance_v1_interval(3::smallint, 5::smallint);
    assert false, 'invalid rating did not fail';
  exception when sqlstate '22023' then null;
  end;
end $$;
rollback;
