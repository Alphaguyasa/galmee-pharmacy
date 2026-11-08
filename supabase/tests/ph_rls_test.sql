-- Galmee Pharmacy RLS + guard test. Run with Supabase `execute_sql`.
-- Creates throwaway users/tenants, runs the checks, then RAISES so EVERYTHING ROLLS BACK.
-- The exception message is the result line; paste it into the dev log.
do $$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  ta uuid; tb uuid; n int; r text := ''; ok boolean; msg text;
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

  -- tenant B still sees only its own item
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  select count(*) into n from public.items;                 r := r || 'B sees items=' || n || ' (expect 1); ';

  -- anon cannot call it
  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform public.ph_load_demo_data(); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'anon seed=' || msg || ' (expect permission denied); ';

  raise exception 'PH_RLS_TEST_RESULTS (rolled back): %', r;
end $$;
