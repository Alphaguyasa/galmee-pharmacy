-- Credit screens RLS + guard test. Run with Supabase `execute_sql`; it RAISES so everything rolls back.
do $$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ta uuid; tb uuid; ca uuid; cb uuid; n int; v numeric; r text := ''; msg text; ref uuid := gen_random_uuid(); p1 uuid; p2 uuid;
begin
  insert into auth.users(id, aud, role, email) values
    (ua,'authenticated','authenticated','ph-cr-a@test.invalid'),
    (ub,'authenticated','authenticated','ph-cr-b@test.invalid');
  insert into public.tenants(name, vertical) values ('Credit A','pharmacy') returning id into ta;
  insert into public.tenants(name, vertical) values ('Credit B','pharmacy') returning id into tb;
  insert into public.profiles(user_id, tenant_id, full_name, role) values (ua, ta, 'A','owner'), (ub, tb, 'B','owner');
  insert into public.customers(tenant_id, name, phone) values (ta, 'Debtor 100%', '0900000101') returning id into ca;
  insert into public.customers(tenant_id, name) values (tb, 'B cust') returning id into cb;
  insert into public.credit_ledger(tenant_id, customer_id, type, amount) values (ta, ca, 'debt', 100);

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  p1 := public.ph_record_repayment(ca, 30, 'cash', null, ref);
  p2 := public.ph_record_repayment(ca, 30, 'cash', null, ref);
  r := r || 'retry same payment=' || (p1 = p2)::text || ' (expect true); ';
  select balance into v from public.customer_balances where customer_id = ca; r := r || 'balance=' || v || ' (expect 70); ';
  select count(*) into n from public.ph_customer_list('100%', false, 50);   r := r || 'search literal %=' || n || ' (expect 1); ';
  select count(*) into n from public.ph_customer_list('zz%', false, 50);    r := r || 'search no match=' || n || ' (expect 0); ';
  select total_owed into v from public.ph_credit_totals();                  r := r || 'A owed=' || v || ' (expect 70); ';
  select balance_after into v from public.ph_customer_statement(ca, 1);     r := r || 'statement latest=' || v || ' (expect 70); ';
  begin perform public.ph_record_repayment(ca, 71, 'cash', null, gen_random_uuid()); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'over balance=' || msg || ' (expect over_balance); ';
  begin perform public.ph_record_repayment(cb, 1, 'cash', null, gen_random_uuid()); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'A pays B customer=' || msg || ' (expect customer_not_found); ';

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  select count(*) into n from public.ph_payment_refs;                       r := r || 'B refs=' || n || ' (expect 0); ';
  select count(*) into n from public.ph_customer_list(null, false, 50);     r := r || 'B customers=' || n || ' (expect 1); ';
  select count(*) into n from public.ph_customer_statement(ca, 50);         r := r || 'B reads A statement=' || n || ' (expect 0); ';
  begin perform public.ph_record_repayment(ca, 1, 'cash', null, gen_random_uuid()); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'B pays A customer=' || msg || ' (expect customer_not_found); ';
  select total_owed into v from public.ph_credit_totals();                  r := r || 'B owed=' || v || ' (expect 0); ';

  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform public.ph_credit_totals(); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'anon totals=' || msg || ' (expect permission denied); ';
  begin select count(*) into n from public.ph_payment_refs; msg := 'read ' || n; exception when others then msg := sqlerrm; end;
  r := r || 'anon refs=' || msg || ' (expect permission denied); ';

  raise exception 'PH_CREDIT_TEST_RESULTS (rolled back): %', r;
end $$;
