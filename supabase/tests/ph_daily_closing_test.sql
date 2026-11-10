-- Daily closing test. Run with Supabase `execute_sql`; it RAISES so everything rolls back.
do $$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ta uuid; tb uuid; ca uuid; ia uuid; ib uuid; r text := ''; msg text; x record;
begin
  insert into auth.users(id, aud, role, email) values
    (ua,'authenticated','authenticated','ph-close-a@test.invalid'), (ub,'authenticated','authenticated','ph-close-b@test.invalid');
  insert into public.tenants(name, vertical) values ('Close A','pharmacy') returning id into ta;
  insert into public.tenants(name, vertical) values ('Close B','pharmacy') returning id into tb;
  insert into public.profiles(user_id, tenant_id, full_name, role) values (ua, ta, 'A','owner'), (ub, tb, 'B','owner');
  insert into public.customers(tenant_id, name) values (ta, 'A cust') returning id into ca;
  insert into public.items(tenant_id, name_en, unit, price, cost, tracks_expiry) values (ta,'Good','box',10,6,true) returning id into ia;
  insert into public.items(tenant_id, name_en, unit, price, cost, tracks_expiry) values (tb,'B item','box',7,3,true) returning id into ib;
  insert into public.stock_batches(tenant_id, item_id, qty, cost, batch_no, expiry_date) values
    (ta, ia, 20, 6, 'G1', current_date + 200), (tb, ib, 20, 3, 'B1', current_date + 200);

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 2)), 'cash', null, gen_random_uuid()::text);
  perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 1)), 'telebirr', null, gen_random_uuid()::text);
  perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 3)), 'credit', ca, gen_random_uuid()::text);
  perform public.ph_record_repayment(ca, 12, 'cash', null, gen_random_uuid());
  for x in select * from public.ph_daily_closing() where method in ('cash','telebirr','credit') loop
    r := r || x.method || '=' || x.sales_count || '/' || x.sales_collected || '/' || x.repayments || '/' || x.credit_given || '; ';
  end loop;
  r := r || '(expect cash=1/20.00/12.00/0.00 telebirr=1/10.00/0.00/0.00 credit=1/0.00/0.00/30.00); ';
  r := r || 'old day rows=' || (select count(*) from public.ph_daily_closing(current_date - 400) where sales_count > 0) || ' (expect 0); ';

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ib, 'qty', 1)), 'cash', null, gen_random_uuid()::text);
  select x2.sales_count || '/' || x2.sales_collected into msg from public.ph_daily_closing() x2 where x2.method = 'cash';
  r := r || 'B cash=' || msg || ' (expect 1/7.00, A not visible); ';
  r := r || 'B total rows with sales=' || (select count(*) from public.ph_daily_closing() where sales_count > 0) || ' (expect 1); ';

  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    perform public.ph_daily_closing();
    r := r || 'anon=allowed (expect permission denied); ';
  exception when insufficient_privilege then r := r || 'anon=permission denied (expect permission denied); ';
  end;
  raise exception 'PH_CLOSING_TEST_RESULTS: %', r;
end $$;
