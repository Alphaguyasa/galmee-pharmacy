-- POS checkout RLS + guard test. Run with Supabase `execute_sql`; it RAISES so everything rolls back.
do $$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  ta uuid; tb uuid; ca uuid; cb uuid; ia uuid; ix uuid; ib uuid; n int; v numeric; r text := ''; msg text;
  ref text := gen_random_uuid()::text; s1 uuid; s2 uuid;
begin
  insert into auth.users(id, aud, role, email) values
    (ua,'authenticated','authenticated','ph-sale-a@test.invalid'),
    (ub,'authenticated','authenticated','ph-sale-b@test.invalid'),
    (uc,'authenticated','authenticated','ph-sale-c@test.invalid');
  insert into public.tenants(name, vertical) values ('Sale A','pharmacy') returning id into ta;
  insert into public.tenants(name, vertical) values ('Sale B','pharmacy') returning id into tb;
  insert into public.profiles(user_id, tenant_id, full_name, role) values (ua, ta, 'A','owner'), (ub, tb, 'B','owner'), (uc, ta, 'C','staff');
  insert into public.customers(tenant_id, name) values (ta, 'A cust') returning id into ca;
  insert into public.customers(tenant_id, name) values (tb, 'B cust') returning id into cb;
  insert into public.items(tenant_id, name_en, unit, price, cost, tracks_expiry) values (ta,'Good','box',12.50,8,true) returning id into ia;
  insert into public.items(tenant_id, name_en, unit, price, cost, tracks_expiry) values (ta,'Old','box',5,3,true) returning id into ix;
  insert into public.items(tenant_id, name_en, unit, price, cost, tracks_expiry) values (tb,'B item','box',5,3,true) returning id into ib;
  insert into public.stock_batches(tenant_id, item_id, qty, cost, batch_no, expiry_date) values
    (ta, ia, 10, 8, 'G1', current_date + 200), (ta, ix, 4, 3, 'X1', current_date - 3), (tb, ib, 4, 3, 'B1', current_date + 200);

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  -- A client price in the payload must be ignored.
  select sale_id, total into s1, v from public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 2, 'price', 0.01)), 'cash', null, ref);
  r := r || 'total=' || v || ' (expect 25.00); ';
  select sale_id into s2 from public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 2)), 'cash', null, ref);
  r := r || 'retry same sale=' || (s1 = s2)::text || ' (expect true); ';
  select qty into v from public.stock_batches where item_id = ia; r := r || 'stock=' || v || ' (expect 8); ';
  select amount into v from public.payments where ref_id = s1; r := r || 'paid=' || v || ' (expect 25.00); ';
  select sale_id into s2 from public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 1)), 'credit', ca, gen_random_uuid()::text);
  select amount into v from public.credit_ledger where ref_id = s2; r := r || 'credit debt=' || v || ' (expect 12.50); ';
  begin perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ix, 'qty', 1)), 'cash', null, gen_random_uuid()::text); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'expired=' || msg || ' (expect expired_stock); ';
  begin perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 99)), 'cash', null, gen_random_uuid()::text); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'too many=' || left(msg, 18) || ' (expect insufficient_stock); ';
  begin perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', -1)), 'cash', null, gen_random_uuid()::text); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'negative=' || msg || ' (expect bad_lines); ';
  begin perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 1)), 'credit', null, gen_random_uuid()::text); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'credit no customer=' || msg || ' (expect customer_required); ';
  begin perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ib, 'qty', 1)), 'cash', null, gen_random_uuid()::text); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'A sells B item=' || msg || ' (expect item_not_found); ';
  begin perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 1)), 'credit', cb, gen_random_uuid()::text); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'A credits B customer=' || msg || ' (expect customer_not_found); ';

  -- Staff cannot lock stock_batches under the core RLS policy, so the sale is refused with a clear code.
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role','authenticated')::text, true);
  begin perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 1)), 'cash', null, gen_random_uuid()::text); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'staff sale=' || msg || ' (core policy: sale_not_permitted); ';

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  select count(*) into n from public.sales where id = s1; r := r || 'B reads A sale=' || n || ' (expect 0); ';
  select count(*) into n from public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ib, 'qty', 1)), 'cash', null, ref);
  select count(*) into n from public.sales where client_ref = ref; r := r || 'B same ref own sale=' || n || ' (expect 1); ';

  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform public.ph_record_sale('[]'::jsonb, 'cash', null, null); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'anon=' || left(msg, 17) || ' (expect permission denied); ';

  raise exception 'PH_SALE_TEST_RESULTS: %', r;
end $$;
