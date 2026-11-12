-- Owner summary test. Run with Supabase `execute_sql`; it RAISES so everything rolls back.
do $$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ta uuid; tb uuid; ca uuid; ia uuid; ib uuid; r text := ''; x record;
begin
  insert into auth.users(id, aud, role, email) values
    (ua,'authenticated','authenticated','ph-sum-a@test.invalid'), (ub,'authenticated','authenticated','ph-sum-b@test.invalid');
  insert into public.tenants(name, vertical) values ('Sum A','pharmacy') returning id into ta;
  insert into public.tenants(name, vertical) values ('Sum B','pharmacy') returning id into tb;
  insert into public.profiles(user_id, tenant_id, full_name, role) values (ua, ta, 'A','owner'), (ub, tb, 'B','owner');
  insert into public.customers(tenant_id, name) values (ta, 'A cust') returning id into ca;
  insert into public.items(tenant_id, name_en, unit, price, cost, tracks_expiry, reorder_level)
    values (ta,'Good','box',10,6,true,50) returning id into ia;
  insert into public.items(tenant_id, name_en, unit, price, cost, tracks_expiry) values (tb,'B item','box',7,3,true) returning id into ib;
  insert into public.stock_batches(tenant_id, item_id, qty, cost, batch_no, expiry_date) values
    (ta, ia, 20, 6, 'G1', current_date + 200), (ta, ia, 10, 6, 'G2', current_date + 10), (tb, ib, 20, 3, 'B1', current_date + 200);

  -- FEFO sells 6 from G2 first, so 4 units expiring in 10 days remain: attention_count 1.
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 2)), 'cash', null, gen_random_uuid()::text);
  perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 1)), 'telebirr', null, gen_random_uuid()::text);
  perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 3)), 'credit', ca, gen_random_uuid()::text);
  perform public.ph_record_repayment(ca, 12, 'cash', null, gen_random_uuid());
  select * into x from public.ph_owner_summary;
  r := r || 'A rows=' || (select count(*) from public.ph_owner_summary) || ' (expect 1); ';
  r := r || 'A tx/sales/cash/credit/owed/attention=' || x.tx_count || '/' || x.sales_total || '/' || x.cash_total || '/'
       || x.credit_total || '/' || x.owed_total || '/' || x.attention_count
       || ' (expect 3/60.00/32.00/30.00/18.00/1); ';
  r := r || 'A extra telebirr/low=' || (x.extra->>'telebirr_total') || '/' || (x.extra->>'low_stock_count') || ' (expect 10.00/1); ';
  r := r || 'A own tenant=' || (x.tenant_id = ta) || ' (expect true); ';

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  r := r || 'B sees A=' || (select count(*) from public.ph_owner_summary where tenant_id = ta) || ' (expect 0); ';
  r := r || 'B rows=' || (select count(*) from public.ph_owner_summary) || ' tx=' || (select tx_count from public.ph_owner_summary) || ' (expect 1 tx=0); ';

  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    perform 1 from public.ph_owner_summary;
    r := r || 'anon=allowed (expect permission denied); ';
  exception when insufficient_privilege then r := r || 'anon=permission denied (expect permission denied); ';
  end;
  raise exception 'PH_SUMMARY_TEST_RESULTS: %', r;
end $$;
