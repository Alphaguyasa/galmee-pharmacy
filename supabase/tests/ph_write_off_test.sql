-- Expired write-off RLS + guard test. Run with Supabase `execute_sql`; it RAISES so everything rolls back.
do $$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  ta uuid; tb uuid; ix uuid; n int; v numeric; r text := ''; msg text;
begin
  insert into auth.users(id, aud, role, email) values
    (ua,'authenticated','authenticated','ph-wo-a@test.invalid'),
    (ub,'authenticated','authenticated','ph-wo-b@test.invalid'),
    (uc,'authenticated','authenticated','ph-wo-c@test.invalid');
  insert into public.tenants(name, vertical) values ('WO A','pharmacy') returning id into ta;
  insert into public.tenants(name, vertical) values ('WO B','pharmacy') returning id into tb;
  insert into public.profiles(user_id, tenant_id, full_name, role) values (ua, ta, 'A','owner'), (ub, tb, 'B','owner'), (uc, ta, 'C','staff');
  insert into public.items(tenant_id, name_en, unit, price, cost, tracks_expiry) values (ta,'Old','box',5,3,true) returning id into ix;
  insert into public.stock_batches(tenant_id, item_id, qty, cost, batch_no, expiry_date) values
    (ta, ix, 4, 3, 'X1', current_date - 3), (ta, ix, 6, 3, 'X2', current_date + 90);

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role','authenticated')::text, true);
  begin perform public.ph_write_off_expired(ix); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'staff=' || msg || ' (expect not_allowed); ';

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  v := public.ph_write_off_expired(ix); r := r || 'B removes A stock=' || v || ' (expect 0); ';

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  select sum(qty) into v from public.stock_batches where item_id = ix; r := r || 'before=' || v || ' (expect 10); ';
  v := public.ph_write_off_expired(ix); r := r || 'removed=' || v || ' (expect 4); ';
  v := public.ph_write_off_expired(ix); r := r || 'second run=' || v || ' (expect 0); ';
  select sum(qty) into v from public.stock_batches where item_id = ix; r := r || 'after=' || v || ' (expect 6); ';
  select count(*) into n from public.stock_movements where item_id = ix and reason = 'expired'; r := r || 'movements=' || n || ' (expect 1); ';

  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform public.ph_write_off_expired(ix); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'anon=' || left(msg, 17) || ' (expect permission denied); ';

  raise exception 'PH_WRITE_OFF_TEST_RESULTS: %', r;
end $$;
