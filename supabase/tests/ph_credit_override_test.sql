-- Credit override test (run after the ph_credit_override migration). RAISES so everything rolls back.
do $$
declare uo uuid := gen_random_uuid(); us uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ta uuid; tb uuid; c uuid; ia uuid; r text := ''; n int;
begin
  insert into auth.users(id, aud, role, email) values
    (uo,'authenticated','authenticated','ph-ov-owner@test.invalid'),
    (us,'authenticated','authenticated','ph-ov-staff@test.invalid'),
    (ub,'authenticated','authenticated','ph-ov-b@test.invalid');
  insert into public.tenants(name, vertical) values ('Ov A','pharmacy') returning id into ta;
  insert into public.tenants(name, vertical) values ('Ov B','pharmacy') returning id into tb;
  insert into public.profiles(user_id, tenant_id, full_name, role) values (uo, ta, 'Owner A','owner'), (us, ta, 'Staff A','staff'), (ub, tb, 'Owner B','owner');
  insert into public.customers(tenant_id, name, credit_limit) values (ta, 'Fifty', 50) returning id into c;
  insert into public.items(tenant_id, name_en, unit, price, cost, tracks_expiry) values (ta,'Good','box',10,6,true) returning id into ia;
  insert into public.stock_batches(tenant_id, item_id, qty, cost, batch_no, expiry_date) values (ta, ia, 100, 6, 'G1', current_date + 200);
  perform set_config('role','authenticated', true);

  perform set_config('request.jwt.claims', json_build_object('sub', us, 'role','authenticated')::text, true);
  begin
    perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 6)), 'credit', c, gen_random_uuid()::text, 'regular customer');
    r := r || 'staff over=allowed (expect refused); ';
  exception when others then r := r || 'staff over=' || sqlerrm || ' (expect override_not_permitted); ';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', uo, 'role','authenticated')::text, true);
  begin
    perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 6)), 'credit', c, gen_random_uuid()::text, null);
    r := r || 'owner no reason=allowed (expect credit_limit); ';
  exception when others then r := r || 'owner no reason=' || sqlerrm || ' (expect credit_limit); ';
  end;
  perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 6)), 'credit', c, gen_random_uuid()::text, 'pays Friday');
  select count(*) into n from public.ph_credit_overrides where amount_over = 10 and reason = 'pays Friday' and created_by = uo;
  r := r || 'owner with reason logged rows=' || n || ' (expect 1); ';
  select count(*) into n from public.ph_credit_overrides_for_day(null);
  r := r || 'owner day list=' || n || ' (expect 1); ';
  select (extra->>'override_count')::int into n from public.ph_owner_summary where tenant_id = ta;
  r := r || 'summary override_count=' || n || ' (expect 1); ';

  perform set_config('request.jwt.claims', json_build_object('sub', us, 'role','authenticated')::text, true);
  select count(*) into n from public.ph_credit_overrides;
  r := r || 'staff sees log rows=' || n || ' (expect 0); ';

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  select count(*) into n from public.ph_credit_overrides;
  r := r || 'tenant B sees rows=' || n || ' (expect 0); ';

  perform set_config('role','anon', true);
  begin
    select count(*) into n from public.ph_credit_overrides;
    r := r || 'anon=allowed (expect denied); ';
  exception when insufficient_privilege then r := r || 'anon=denied; ';
  end;
  raise exception 'PH_CREDIT_OVERRIDE_TEST_RESULTS: %', r;
end $$;
