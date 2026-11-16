-- ph_sales_by_day test. Run with Supabase `execute_sql`; it RAISES so everything rolls back.
do $$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ta uuid; tb uuid; ca uuid; ia uuid; r text := ''; n int; v numeric; msg text;
  today date := (now() at time zone 'Africa/Addis_Ababa')::date;
begin
  insert into auth.users(id, aud, role, email) values
    (ua,'authenticated','authenticated','ph-sbd-a@test.invalid'),
    (ub,'authenticated','authenticated','ph-sbd-b@test.invalid');
  insert into public.tenants(name, vertical) values ('Sbd A','pharmacy') returning id into ta;
  insert into public.tenants(name, vertical) values ('Sbd B','pharmacy') returning id into tb;
  insert into public.profiles(user_id, tenant_id, full_name, role) values (ua, ta, 'A','owner'), (ub, tb, 'B','owner');
  insert into public.customers(tenant_id, name) values (ta, 'A cust') returning id into ca;
  insert into public.items(tenant_id, name_en, unit, price, cost, tracks_expiry) values (ta,'Good','box',12.50,8,true) returning id into ia;
  insert into public.stock_batches(tenant_id, item_id, qty, cost, batch_no, expiry_date) values (ta, ia, 10, 8, 'G1', current_date + 200);

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 2)), 'cash', null, gen_random_uuid()::text);
  perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 1)), 'telebirr', null, gen_random_uuid()::text);
  perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 1)), 'credit', ca, gen_random_uuid()::text);

  select count(*) into n from public.ph_sales_by_day(today - 6, today); r := r || 'week rows=' || n || ' (expect 7); ';
  select sales_count into n from public.ph_sales_by_day(today - 6, today) where day = today; r := r || 'today count=' || n || ' (expect 3); ';
  select sales_total into v from public.ph_sales_by_day(today - 6, today) where day = today; r := r || 'total=' || v || ' (expect 50.00); ';
  select collected into v from public.ph_sales_by_day(today - 6, today) where day = today; r := r || 'collected=' || v || ' (expect 37.50); ';
  select cash_in into v from public.ph_sales_by_day(today - 6, today) where day = today; r := r || 'cash_in=' || v || ' (expect 25.00); ';
  select credit_given into v from public.ph_sales_by_day(today - 6, today) where day = today; r := r || 'credit=' || v || ' (expect 12.50); ';
  select sum(sales_count) into n from public.ph_sales_by_day(today - 6, today - 1); r := r || 'earlier days=' || n || ' (expect 0); ';
  begin perform public.ph_sales_by_day(today - 62, today); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || '63 days=' || msg || ' (expect bad_range); ';
  begin perform public.ph_sales_by_day(today, today - 1); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'reversed=' || msg || ' (expect bad_range); ';

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  select coalesce(sum(sales_count), 0) into n from public.ph_sales_by_day(today - 6, today); r := r || 'B sees A sales=' || n || ' (expect 0); ';

  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform public.ph_sales_by_day(today, today); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'anon=' || left(msg, 17) || ' (expect permission denied); ';

  raise exception 'PH_SALES_BY_DAY_TEST_RESULTS: %', r;
end $$;
