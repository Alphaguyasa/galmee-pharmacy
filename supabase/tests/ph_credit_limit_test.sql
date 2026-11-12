-- Credit limit test for ph_record_sale. Run with Supabase `execute_sql`; it RAISES so everything rolls back.
do $$
declare ua uuid := gen_random_uuid(); ta uuid; c_free uuid; c_zero uuid; c_50 uuid; ia uuid; r text := '';
begin
  insert into auth.users(id, aud, role, email) values (ua,'authenticated','authenticated','ph-limit-a@test.invalid');
  insert into public.tenants(name, vertical) values ('Limit A','pharmacy') returning id into ta;
  insert into public.profiles(user_id, tenant_id, full_name, role) values (ua, ta, 'A','owner');
  insert into public.customers(tenant_id, name) values (ta, 'No limit') returning id into c_free;
  insert into public.customers(tenant_id, name, credit_limit) values (ta, 'Zero', 0) returning id into c_zero;
  insert into public.customers(tenant_id, name, credit_limit) values (ta, 'Fifty', 50) returning id into c_50;
  insert into public.items(tenant_id, name_en, unit, price, cost, tracks_expiry) values (ta,'Good','box',10,6,true) returning id into ia;
  insert into public.stock_batches(tenant_id, item_id, qty, cost, batch_no, expiry_date) values (ta, ia, 100, 6, 'G1', current_date + 200);
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);

  perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 30)), 'credit', c_free, gen_random_uuid()::text);
  r := r || 'no limit 300=ok; ';
  begin
    perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 1)), 'credit', c_zero, gen_random_uuid()::text);
    r := r || 'zero=allowed (expect credit_limit); ';
  exception when others then r := r || 'zero=' || sqlerrm || ' (expect credit_limit); ';
  end;
  perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 5)), 'credit', c_50, gen_random_uuid()::text);
  r := r || 'fifty 50 (exactly the limit)=ok; ';
  begin
    perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 1)), 'credit', c_50, gen_random_uuid()::text);
    r := r || 'fifty +10=allowed (expect credit_limit); ';
  exception when others then r := r || 'fifty +10=' || sqlerrm || ' (expect credit_limit); ';
  end;
  perform public.ph_record_sale(jsonb_build_array(jsonb_build_object('item_id', ia, 'qty', 1)), 'cash', null, gen_random_uuid()::text);
  r := r || 'cash sale unaffected=ok; ';
  raise exception 'PH_CREDIT_LIMIT_TEST_RESULTS: %', r;
end $$;
