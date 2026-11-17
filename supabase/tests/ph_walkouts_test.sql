-- ph_walkouts test. Run with Supabase `execute_sql`; it RAISES so everything rolls back.
do $$
declare ua uuid := gen_random_uuid(); us uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  ta uuid; tb uuid; ia uuid; ib uuid; wid uuid; r text := ''; n int; v numeric; t text; msg text;
begin
  insert into auth.users(id, aud, role, email) values
    (ua,'authenticated','authenticated','ph-wo-a@test.invalid'),
    (us,'authenticated','authenticated','ph-wo-s@test.invalid'),
    (ub,'authenticated','authenticated','ph-wo-b@test.invalid');
  insert into public.tenants(name, vertical) values ('Wo A','pharmacy') returning id into ta;
  insert into public.tenants(name, vertical) values ('Wo B','pharmacy') returning id into tb;
  insert into public.profiles(user_id, tenant_id, full_name, role) values
    (ua, ta, 'A','owner'), (us, ta, 'S','staff'), (ub, tb, 'B','owner');
  insert into public.items(tenant_id, name_en, name_am, unit, price, cost, tracks_expiry) values (ta,'Amoxicillin 500','አሞክሲሲሊን','box',40,25,true) returning id into ia;
  insert into public.items(tenant_id, name_en, unit, price, cost, tracks_expiry) values (tb,'B item','box',10,5,true) returning id into ib;
  insert into public.stock_batches(tenant_id, item_id, qty, cost, batch_no, expiry_date) values
    (ta, ia, 3, 25, 'X1', current_date - 1), (ta, ia, 2, 25, 'X2', current_date + 100);

  perform set_config('role','authenticated', true);
  -- Staff log: two free-text asks (same name, different case/spaces) and one listed item x3.
  perform set_config('request.jwt.claims', json_build_object('sub', us, 'role','authenticated')::text, true);
  perform public.ph_log_walkout('Insulin  pen');
  perform public.ph_log_walkout(' insulin pen ');
  perform public.ph_log_walkout('ignored', ia, 3);
  select count(*) into n from public.ph_walkouts; r := r || 'staff rows=' || n || ' (expect 3); ';
  begin perform public.ph_log_walkout('x', ib); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'other tenant item=' || msg || ' (expect bad_item); ';
  begin perform public.ph_log_walkout('   '); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'blank=' || msg || ' (expect bad_label); ';
  begin perform public.ph_log_walkout('x', null, 0); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'qty0=' || msg || ' (expect bad_qty); ';
  begin insert into public.ph_walkouts(tenant_id, label) values (tb, 'sneak'); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'insert into B=' || left(msg, 24) || ' (expect new row violates); ';

  select asks, label into n, t from public.ph_walkout_ranking(7) where item_id is null;
  r := r || 'free asks=' || n || ' label=' || t || ' (expect 2 insulin pen); ';
  select qty_asked into n from public.ph_walkout_ranking(7) where item_id = ia; r := r || 'item qty=' || n || ' (expect 3); ';
  select lost_value into v from public.ph_walkout_ranking(7) where item_id = ia; r := r || 'lost=' || v || ' (expect 120.00); ';
  select qty_on_hand into v from public.ph_walkout_ranking(7) where item_id = ia; r := r || 'on hand=' || v || ' (expect 2, expired left out); ';
  select label into t from public.ph_walkout_ranking(7) limit 1; r := r || 'first=' || t || ' (expect insulin pen); ';
  begin perform public.ph_walkout_ranking(91); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || '91 days=' || msg || ' (expect bad_days); ';

  -- Staff undo of own fresh row works; an old row cannot be undone by staff.
  select id into wid from public.ph_walkouts where item_id = ia;
  delete from public.ph_walkouts where id = wid; get diagnostics n = row_count; r := r || 'staff undo=' || n || ' (expect 1); ';
  reset role;
  update public.ph_walkouts set created_at = now() - interval '1 hour';
  perform set_config('role','authenticated', true);
  delete from public.ph_walkouts; get diagnostics n = row_count; r := r || 'staff delete old=' || n || ' (expect 0); ';

  -- Other pharmacy sees nothing and cannot delete.
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  select count(*) into n from public.ph_walkouts; r := r || 'B sees=' || n || ' (expect 0); ';
  select count(*) into n from public.ph_walkout_ranking(90); r := r || 'B ranking=' || n || ' (expect 0); ';
  delete from public.ph_walkouts; get diagnostics n = row_count; r := r || 'B delete=' || n || ' (expect 0); ';

  -- Owner clears old rows.
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  delete from public.ph_walkouts; get diagnostics n = row_count; r := r || 'owner delete=' || n || ' (expect 2); ';

  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform public.ph_log_walkout('x'); msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'anon log=' || left(msg, 17) || ' (expect permission denied); ';
  begin perform count(*) from public.ph_walkouts; msg := 'ran'; exception when others then msg := sqlerrm; end;
  r := r || 'anon read=' || left(msg, 17) || ' (expect permission denied); ';

  raise exception 'PH_WALKOUTS_TEST_RESULTS: %', r;
end $$;
