-- Galmee Pharmacy RLS + guard test. Run with Supabase `execute_sql`.
-- Creates throwaway users/tenants, runs the checks, then RAISES so EVERYTHING ROLLS BACK.
-- The exception message is the result line; paste it into the dev log.
do $$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  ta uuid; tb uuid; n int; r text := ''; ok boolean; msg text;
  sa uuid; sb uuid; ia uuid; poa uuid; ref uuid; q0 numeric;
begin
  insert into auth.users(id, aud, role, email) values
    (ua,'authenticated','authenticated','ph-rls-a@test.invalid'),
    (ub,'authenticated','authenticated','ph-rls-b@test.invalid'),
    (uc,'authenticated','authenticated','ph-rls-c@test.invalid');
  insert into public.tenants(name, vertical) values ('Galmee Pharmacy Demo','pharmacy') returning id into ta;
  insert into public.tenants(name, vertical) values ('Real Pharmacy B','pharmacy') returning id into tb;
  insert into public.profiles(user_id, tenant_id, full_name, role) values
    (ua, ta, 'A owner','owner'), (ub, tb, 'B owner','owner'), (uc, ta, 'A staff','staff');
  insert into public.items(tenant_id, name_en, price) values (tb, 'B item', 10);

  perform set_config('role','authenticated', true);

  -- staff of the demo tenant cannot seed
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role','authenticated')::text, true);
  begin perform public.ph_load_demo_data(); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'staff seed=' || msg || ' (expect owner_only); ';

  -- owner of a non-demo tenant cannot seed
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  begin perform public.ph_load_demo_data(); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'other tenant seed=' || msg || ' (expect not_demo_tenant); ';

  -- demo owner seeds own tenant only
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  select public.ph_load_demo_data() into n;                 r := r || 'demo seed items=' || n || ' (expect 40); ';
  select count(*) into n from public.items;                 r := r || 'A sees items=' || n || ' (expect 40); ';
  select count(*) into n from public.customers;             r := r || 'A customers=' || n || ' (expect 15); ';
  select count(*) into n from public.customer_balances where balance > 0; r := r || 'A owing=' || n || ' (expect 12); ';
  select count(*) into n from public.sales;                 r := r || 'A sales=' || n || ' (expect 20); ';
  select count(*) into n from public.stock_batches where expiry_date < current_date + 30 and qty > 0;
  r := r || 'A batches <30d=' || n || ' (expect >=6); ';
  select count(*) into n from public.item_stock where qty_on_hand < reorder_level; r := r || 'A low stock=' || n || ' (expect >=5); ';
  begin perform public.ph_load_demo_data(); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'second seed=' || msg || ' (expect demo_already_loaded); ';

  -- purchasing, as the demo owner (tenant A)
  insert into public.ph_suppliers(name) values ('A Supplier') returning id into sa;
  select id into ia from public.items order by name_en limit 1;
  select coalesce(sum(qty),0) into q0 from public.stock_batches where item_id = ia;
  ref := gen_random_uuid();
  poa := public.ph_receive_delivery(sa, jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 10, 'unit_cost', 5, 'batch_no', 'T1', 'expiry_date', (current_date + 200)::text)), ref);
  select sum(qty) - q0 into n from public.stock_batches where item_id = ia;  r := r || 'delivery adds=' || n || ' (expect 10); ';
  perform public.ph_receive_delivery(sa, jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 10, 'unit_cost', 5, 'batch_no', 'T1', 'expiry_date', (current_date + 200)::text)), ref);
  select sum(qty) - q0 into n from public.stock_batches where item_id = ia;  r := r || 'retry adds=' || n || ' (expect 10); ';
  select count(*) into n from public.ph_purchase_orders where status = 'received'; r := r || 'A received POs=' || n || ' (expect 1); ';
  begin perform public.ph_receive_delivery(sa, jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 1, 'unit_cost', 5, 'expiry_date', (current_date - 1)::text)), gen_random_uuid()); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'expired delivery=' || msg || ' (expect already_expired); ';
  select count(*) into n from public.ph_stock_list(null, 'all', 500);        r := r || 'A stock list=' || n || ' (expect 40); ';
  select items_low into n from public.ph_expiry_totals();                    r := r || 'A low=' || n || ' (expect >=5); ';

  -- staff of tenant A: reads, no writes
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role','authenticated')::text, true);
  select count(*) into n from public.ph_suppliers;                           r := r || 'staff sees suppliers=' || n || ' (expect 1); ';
  begin insert into public.ph_suppliers(name) values ('staff supplier'); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'staff supplier insert=' || msg || ' (expect RLS denied); ';
  begin perform public.ph_receive_delivery(sa, jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 1, 'unit_cost', 5, 'expiry_date', (current_date + 200)::text)), gen_random_uuid()); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'staff delivery=' || msg || ' (expect owner_or_manager_only); ';

  -- tenant B cannot see or use tenant A's purchasing rows
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  select count(*) into n from public.ph_suppliers;                           r := r || 'B sees suppliers=' || n || ' (expect 0); ';
  select count(*) into n from public.ph_purchase_orders;                     r := r || 'B sees POs=' || n || ' (expect 0); ';
  select count(*) into n from public.ph_purchase_lines;                      r := r || 'B sees lines=' || n || ' (expect 0); ';
  select count(*) into n from public.ph_item_expiry;                         r := r || 'B expiry view=' || n || ' (expect 1); ';
  select count(*) into n from public.ph_stock_list(null, 'all', 500);        r := r || 'B stock list=' || n || ' (expect 1); ';
  begin insert into public.ph_suppliers(tenant_id, name) values (ta, 'forged'); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'B insert into A=' || msg || ' (expect RLS denied); ';
  update public.ph_suppliers set name = 'hacked' where id = sa;
  get diagnostics n = row_count;                                             r := r || 'B update A supplier rows=' || n || ' (expect 0); ';
  begin perform public.ph_receive_purchase_order(poa, null); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'B receive A PO=' || msg || ' (expect po_not_found); ';
  insert into public.ph_suppliers(name) values ('B Supplier') returning id into sb;
  begin perform public.ph_create_purchase_order(sa, jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 1, 'unit_cost', 1)), null, null, null); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'B PO with A supplier=' || msg || ' (expect supplier_not_found); ';
  begin perform public.ph_create_purchase_order(sb, jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 1, 'unit_cost', 1)), null, null, null); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'B PO with A item=' || msg || ' (expect item_not_found); ';
  begin insert into public.ph_purchase_orders(tenant_id, supplier_id) values (tb, sa); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'B direct PO with A supplier=' || msg || ' (expect FK violation); ';

  -- tenant B still sees only its own item
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  select count(*) into n from public.items;                 r := r || 'B sees items=' || n || ' (expect 1); ';

  -- anon cannot call it
  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform public.ph_load_demo_data(); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'anon seed=' || msg || ' (expect permission denied); ';

  begin select count(*) into n from public.ph_suppliers; msg := 'read ' || n; exception when others then msg := sqlerrm; end;
  r := r || 'anon suppliers=' || msg || ' (expect permission denied); ';
  begin select count(*) into n from public.ph_item_expiry; msg := 'read ' || n; exception when others then msg := sqlerrm; end;
  r := r || 'anon expiry view=' || msg || ' (expect permission denied); ';

  raise exception 'PH_RLS_TEST_RESULTS (rolled back): %', r;
end $$;
