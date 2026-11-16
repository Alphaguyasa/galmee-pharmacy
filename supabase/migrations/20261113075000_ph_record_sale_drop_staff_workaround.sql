-- Staff (cashiers) can sell again: core record_sale became SECURITY DEFINER (core_sec_01), so the
-- row-lock pre-check that refused staff sales with sale_not_permitted is no longer needed.
-- Same ph_record_sale as 20261113071500_ph_credit_override.sql without that block.
create or replace function public.ph_record_sale(
  p_lines jsonb,
  p_payment text,
  p_customer uuid default null,
  p_client_ref text default null,
  p_override_reason text default null
) returns table (sale_id uuid, total numeric)
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_tenant uuid := private.current_tenant();
  v_today date := (now() at time zone 'Africa/Addis_Ababa')::date;
  v_credit boolean := p_payment = 'credit';
  v_requested int;
  v_matched int;
  v_lines jsonb;
  v_total numeric;
  v_sale uuid;
  v_limit numeric;
  v_owed numeric;
  v_over numeric := 0;
  v_reason text := nullif(btrim(coalesce(p_override_reason, '')), '');
begin
  if v_tenant is null then raise exception 'no_tenant'; end if;

  if p_client_ref is not null then
    -- Serialise retries of the same sale, then answer them with the sale already recorded.
    perform pg_advisory_xact_lock(hashtextextended(v_tenant::text || ':' || p_client_ref, 0));
    return query select s.id, s.total from public.sales s
      where s.tenant_id = v_tenant and s.client_ref = p_client_ref;
    if found then return; end if;
  end if;

  if p_payment is null or p_payment not in ('credit', 'cash', 'telebirr', 'cbe_birr', 'bank') then
    raise exception 'bad_payment';
  end if;
  if v_credit then
    if p_customer is null then raise exception 'customer_required'; end if;
    select c.credit_limit into v_limit from public.customers c where c.id = p_customer and c.tenant_id = v_tenant;
    if not found then raise exception 'customer_not_found'; end if;
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'bad_lines';
  end if;

  select count(*) into v_requested from jsonb_to_recordset(p_lines) as r(item_id uuid, qty numeric);
  if exists (select 1 from jsonb_to_recordset(p_lines) as r(item_id uuid, qty numeric) where r.qty is null or r.qty <= 0)
     or (select count(distinct r.item_id) from jsonb_to_recordset(p_lines) as r(item_id uuid, qty numeric)) <> v_requested then
    raise exception 'bad_lines';
  end if;

  select count(*),
         jsonb_agg(jsonb_build_object('item_id', i.id, 'qty', r.qty, 'price', i.price)),
         sum(r.qty * i.price)
    into v_matched, v_lines, v_total
    from jsonb_to_recordset(p_lines) as r(item_id uuid, qty numeric)
    join public.items i on i.id = r.item_id and i.tenant_id = v_tenant and i.active;
  if v_matched <> v_requested then raise exception 'item_not_found'; end if;

  if exists (
    select 1 from jsonb_to_recordset(p_lines) as r(item_id uuid, qty numeric)
    join public.items i on i.id = r.item_id
    where i.price is null or i.price <= 0
  ) then
    raise exception 'no_price';
  end if;

  -- Credit limit: none set means no limit; 0 means this customer gets no credit.
  -- The lock makes two credit sales for one customer at the same moment queue up.
  if v_credit and v_limit is not null then
    perform pg_advisory_xact_lock(hashtextextended('ph_credit:' || p_customer::text, 0));
    select coalesce(sum(cb.balance), 0) into v_owed from public.customer_balances cb
      where cb.customer_id = p_customer and cb.tenant_id = v_tenant;
    v_over := v_owed + v_total - v_limit;
    if v_over > 0 then
      -- Staff are always stopped. Owners and managers may go over with a reason, which is logged.
      if v_reason is null or char_length(v_reason) < 3 then
        raise exception 'credit_limit' using detail = v_over::numeric(14,2)::text;
      end if;
      if private.current_app_role() not in ('owner', 'manager') then
        raise exception 'override_not_permitted' using detail = v_over::numeric(14,2)::text;
      end if;
      if char_length(v_reason) > 200 then raise exception 'bad_reason'; end if;
    end if;
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_lines) as r(item_id uuid, qty numeric)
    join public.stock_batches b on b.item_id = r.item_id
    where b.tenant_id = v_tenant and b.qty > 0 and b.expiry_date < v_today
  ) then
    raise exception 'expired_stock';
  end if;

  -- core record_sale is SECURITY DEFINER since core_sec_01, so staff can sell; the old staff workaround is gone.

  v_sale := public.record_sale(
    p_lines => v_lines,
    p_customer => p_customer,
    p_paid => case when v_credit then 0 else v_total end,
    p_method => case when v_credit then 'cash'::public.pay_method else p_payment::public.pay_method end,
    p_client_ref => p_client_ref,
    p_due => null
  );

  if v_over > 0 then
    insert into public.ph_credit_overrides (tenant_id, sale_id, customer_id, amount_over, reason)
    values (v_tenant, v_sale, p_customer, v_over, v_reason);
  end if;

  return query select v_sale, v_total;
end;
$$;
