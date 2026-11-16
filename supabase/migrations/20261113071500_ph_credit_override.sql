-- Credit limit override (decided 2026-11-12): cashiers (staff) stay blocked at a customer's
-- credit limit; owners and managers may go over it at the till with a short reason. The sale
-- RPC checks the role itself, and every override is logged in ph_credit_overrides (sale,
-- customer, amount over, reason, who, when), shown on the daily closing screen and in
-- ph_owner_summary.extra (override_count, override_total).

create table public.ph_credit_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default private.current_tenant() references public.tenants(id) on delete cascade,
  sale_id uuid not null unique references public.sales(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  amount_over numeric(14,2) not null check (amount_over > 0),
  reason text not null check (char_length(btrim(reason)) between 3 and 200),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index ph_credit_overrides_tenant_day on public.ph_credit_overrides (tenant_id, created_at);
create index ph_credit_overrides_customer on public.ph_credit_overrides (customer_id);

alter table public.ph_credit_overrides enable row level security;

-- Owners and managers read the log; nobody edits or deletes it.
create policy ph_credit_overrides_sel on public.ph_credit_overrides for select to authenticated
  using (tenant_id = (select private.current_tenant())
         and (select private.current_app_role()) in ('owner', 'manager'));

-- Rows are written by ph_record_sale (security invoker) as the owner or manager who overrode.
create policy ph_credit_overrides_ins on public.ph_credit_overrides for insert to authenticated
  with check (tenant_id = (select private.current_tenant())
              and (select private.current_app_role()) in ('owner', 'manager')
              and created_by = (select auth.uid())
              and exists (select 1 from public.sales s where s.id = ph_credit_overrides.sale_id and s.tenant_id = ph_credit_overrides.tenant_id)
              and exists (select 1 from public.customers c where c.id = ph_credit_overrides.customer_id and c.tenant_id = ph_credit_overrides.tenant_id));

revoke all on public.ph_credit_overrides from public, anon, authenticated;
grant select, insert on public.ph_credit_overrides to authenticated;

-- New optional argument, so the old 4-argument version goes.
drop function public.ph_record_sale(jsonb, text, uuid, text);

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

  perform 1 from public.stock_batches b
    where b.tenant_id = v_tenant and b.qty > 0
      and b.item_id in (select r.item_id from jsonb_to_recordset(p_lines) as r(item_id uuid, qty numeric))
    limit 1 for update of b;
  if not found and exists (
    select 1 from public.stock_batches b
    where b.tenant_id = v_tenant and b.qty > 0
      and b.item_id in (select r.item_id from jsonb_to_recordset(p_lines) as r(item_id uuid, qty numeric))
  ) then
    raise exception 'sale_not_permitted';
  end if;

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

revoke all on function public.ph_record_sale(jsonb, text, uuid, text, text) from public, anon;
grant execute on function public.ph_record_sale(jsonb, text, uuid, text, text) to authenticated;

-- Overrides for one Addis Ababa day, newest first (owners and managers only, through RLS).
create or replace function public.ph_credit_overrides_for_day(p_day date default null)
returns table (sale_id uuid, created_at timestamptz, customer_name text, amount_over numeric, reason text, by_name text)
language sql
stable
security invoker
set search_path = public, private
as $$
  with bounds as (
    select (d::timestamp at time zone 'Africa/Addis_Ababa') as t0,
           ((d + 1)::timestamp at time zone 'Africa/Addis_Ababa') as t1
    from (select coalesce(p_day, (now() at time zone 'Africa/Addis_Ababa')::date) as d) x
  )
  select o.sale_id, o.created_at, coalesce(c.name, ''), o.amount_over, o.reason, coalesce(pr.full_name, '')
  from public.ph_credit_overrides o
  cross join bounds b
  left join public.customers c on c.id = o.customer_id and c.tenant_id = o.tenant_id
  left join public.profiles pr on pr.user_id = o.created_by and pr.tenant_id = o.tenant_id
  where o.tenant_id = private.current_tenant()
    and o.created_at >= b.t0 and o.created_at < b.t1
  order by o.created_at desc;
$$;

revoke all on function public.ph_credit_overrides_for_day(date) from public, anon;
grant execute on function public.ph_credit_overrides_for_day(date) to authenticated;
