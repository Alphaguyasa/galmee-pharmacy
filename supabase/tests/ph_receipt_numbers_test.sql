-- ph_receipt_numbers test. Run with Supabase `execute_sql`; it RAISES so everything rolls back.
do $$
declare ua uuid := gen_random_uuid(); us uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ta uuid; tb uuid; ia uuid; ib uuid; ie uuid; s1 uuid; s2 uuid; s3 uuid; sb uuid;
  r text := ''; n int; t text; msg text;
begin
  insert into auth.users(id, aud, role, email) values
    (ua,'authenticated','authenticated','ph-rc-a@test.invalid'),
    (us,'authenticated','authenticated','ph-rc-s@test.invalid'),
    (ub,'authenticated','authenticated','ph-rc-b@test.invalid');
  insert into public.tenants(name, vertical) values ('Rc A','pharmacy') returning id into ta;
  insert into public.tenants(name, vertical) values ('Rc B','pharmacy') returning id into tb;
  insert into public.profiles(user_id, tenant_id, full_name, role) values
    (ua, ta, 'A','owner'), (us, ta, 'S','staff'), (ub, tb, 'B','owner');
  insert into public.items(tenant_id, name_en, unit, price, cost, tracks_expiry) values (ta,'Paracetamol','box',20,10,true) returning id into ia;
  insert into public.items(tenant_id, name_en, unit, price, cost, tracks_expiry) values (ta,'Old syrup','bottle',30,15,true) returning id into ie;
  insert into public.items(tenant_id, name_en, unit, price, cost, tracks_expiry) values (tb,'B item','box',10,5,true) returning id into ib;
  insert into public.stock_batches(tenant_id, item_id, qty, cost, batch_no, expiry_date) values
    (ta, ia, 50, 10, 'P1', current_date + 200), (ta, ie, 5, 15, 'E1', current_date - 1), (tb, ib, 50, 5, 'B1', current_date + 200);

  perform set_config('role','authenticated', true);
  -- Staff sells twice: PS-000001 then PS-000002.
  perform set_config('request.jwt.claims', json_build_object('sub', us, 'role','authenticated')::text, true);
  select sale_id into s1 from public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 1)), 'cash', null, 'rc-1');
  select sale_id into s2 from public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 2)), 'telebirr', null, 'rc-2');
  select receipt_no into t from public.ph_sale_receipts where sale_id = s1; r := r || 'first=' || t || ' (expect PS-000001); ';
  select receipt_no into t from public.ph_sale_receipts where sale_id = s2; r := r || 'second=' || t || ' (expect PS-000002); ';
  -- A retried sale (same client_ref) keeps its number and draws none.
  select sale_id into s3 from public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 1)), 'cash', null, 'rc-1');
  r := r || 'replay same sale=' || (s3 = s1) || ' (expect true); ';
  select count(*) into n from public.ph_sale_receipts; r := r || 'staff sees receipts=' || n || ' (expect 2); ';
  -- A failed sale gives its number back.
  begin perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ie, 'qty', 1)), 'cash', null, 'rc-x');
    msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'expired sale=' || msg || ' (expect expired_stock); ';
  select sale_id into s3 from public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 1)), 'cash', null, 'rc-3');
  select receipt_no into t from public.ph_sale_receipts where sale_id = s3; r := r || 'after failure=' || t || ' (expect PS-000003); ';
  -- Clients cannot write numbers or read the counter as staff, or reach the private functions.
  begin insert into public.ph_sale_receipts(sale_id, tenant_id, receipt_no) values (s1, ta, 'PS-999999'); msg := 'ran';
  exception when others then msg := left(sqlerrm, 17); end;
  r := r || 'client insert=' || msg || ' (expect permission denied); ';
  select count(*) into n from public.ph_receipt_counters; r := r || 'staff sees counter=' || n || ' (expect 0); ';
  begin perform private.ph_next_receipt_no('ps'); msg := 'ran'; exception when others then msg := left(sqlerrm, 17); end;
  r := r || 'client draws number=' || msg || ' (expect permission denied); ';
  -- Owner sees the counter.
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  select next_no::int into n from public.ph_receipt_counters where series = 'ps'; r := r || 'owner counter next=' || n || ' (expect 4); ';

  -- Another pharmacy: its own series, and it sees nothing of A.
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  select count(*) into n from public.ph_sale_receipts; r := r || 'B sees A receipts=' || n || ' (expect 0); ';
  select sale_id into sb from public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ib, 'qty', 1)), 'cash', null, 'rc-b1');
  select receipt_no into t from public.ph_sale_receipts where sale_id = sb; r := r || 'B first=' || t || ' (expect PS-000001); ';
  begin perform private.ph_issue_sale_receipt(s1); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'B numbers A sale=' || msg || ' (expect sale_not_found); ';

  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform count(*) from public.ph_sale_receipts; msg := 'ran'; exception when others then msg := left(sqlerrm, 17); end;
  r := r || 'anon read=' || msg || ' (expect permission denied); ';

  raise exception 'PH_RECEIPT_TEST_RESULTS: %', r;
end $$;
