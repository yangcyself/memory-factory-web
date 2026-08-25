begin;
do $$
begin
  assert public.rating_v1_interval(0::smallint) = interval '1 day';
  assert public.rating_v1_interval(1::smallint) = interval '3 days';
  assert public.rating_v1_interval(2::smallint) = interval '7 days';
  assert public.rating_v1_interval(3::smallint) = interval '14 days';
  assert public.rating_v1_interval(4::smallint) = interval '30 days';
  begin
    perform public.rating_v1_interval(5::smallint);
    assert false, 'invalid rating did not fail';
  exception when sqlstate '22023' then null;
  end;
end $$;
rollback;
