-- Per-staff closing test. Run with Supabase `execute_sql`; it RAISES so everything rolls back.
do $$
declare ua uuid := gen_random_uuid(); um uuid := gen_random_uuid(); us uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ta uuid; tb uuid; ca uuid; ia uuid; r text := ''; x record;
begin
  insert into auth.users(id, aud, role, email) values
    (ua,'authenticated','authenticated','ph-st-a@test.invalid'), (um,'authenticated','authenticated','ph-st-m@test.invalid'),
    (us,'authenticated','authenticated','ph-st-s@test.invalid'), (ub,'authenticated','authenticated','ph-st-b@test.invalid');
  insert into public.tenants(name, vertical) values ('Staff A','pharmacy') returning id into ta;
  insert into public.tenants(name, vertical) values ('Staff B','pharmacy') returning id into tb;
  insert into public.profiles(user_id, tenant_id, full_name, role) values
    (ua, ta, 'Owner A','owner'), (um, ta, 'Manager M','manager'), (us, ta, 'Staff S','staff'), (ub, tb, 'Owner B','owner');
  insert into public.customers(tenant_id, name) values (ta, 'A cust') returning id into ca;
  insert into public.items(tenant_id, name_en, unit, price, cost, tracks_expiry) values (ta,'Good','box',10,6,true) returning id into ia;
  insert into public.stock_batches(tenant_id, item_id, qty, cost, batch_no, expiry_date) values (ta, ia, 50, 6, 'G1', current_date + 200);
  -- Staff cannot call record_sale yet (see the decision log), so their sale is inserted directly.
  insert into public.sales(tenant_id, staff_id, total, paid, method) values (ta, us, 15, 15, 'cash');

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 3)), 'cash', null, gen_random_uuid()::text);
  perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 2)), 'credit', ca, gen_random_uuid()::text);
  perform set_config('request.jwt.claims', json_build_object('sub', um, 'role','authenticated')::text, true);
  perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 1)), 'telebirr', null, gen_random_uuid()::text);

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  for x in select * from public.ph_daily_closing_by_staff() loop
    r := r || x.full_name || '=' || x.sales_count || '/' || x.sales_total || '/' || x.collected || '/' || x.credit_given || '; ';
  end loop;
  r := r || '(expect Owner A=2/50.00/30.00/20.00 Staff S=1/15.00/15.00/0.00 Manager M=1/10.00/10.00/0.00); ';
  r := r || 'old day=' || (select count(*) from public.ph_daily_closing_by_staff(current_date - 400)) || ' (expect 0); ';

  perform set_config('request.jwt.claims', json_build_object('sub', us, 'role','authenticated')::text, true);
  r := r || 'staff sees=' || (select string_agg(full_name, ',') from public.ph_daily_closing_by_staff()) || ' (expect Staff S); ';
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  r := r || 'B rows=' || (select count(*) from public.ph_daily_closing_by_staff()) || ' (expect 0); ';

  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    perform public.ph_daily_closing_by_staff();
    r := r || 'anon=allowed (expect permission denied); ';
  exception when insufficient_privilege then r := r || 'anon=permission denied (expect permission denied); ';
  end;
  raise exception 'PH_STAFF_CLOSING_TEST_RESULTS: %', r;
end $$;
