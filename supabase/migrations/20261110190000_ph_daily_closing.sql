-- Daily closing: money taken in on one Addis Ababa day, split by payment method.
-- sales_collected: paid at the till for sales made that day; repayments: credit customers paying back;
-- credit_given: the unpaid part of that day's sales. RLS on the core tables keeps it to the caller's pharmacy.
create or replace function public.ph_daily_closing(p_day date default null)
returns table (method text, sales_count bigint, sales_collected numeric, repayments numeric, credit_given numeric)
language sql
stable
security invoker
set search_path = public, private
as $$
  with bounds as (
    select (d::timestamp at time zone 'Africa/Addis_Ababa') as t0,
           ((d + 1)::timestamp at time zone 'Africa/Addis_Ababa') as t1
    from (select coalesce(p_day, (now() at time zone 'Africa/Addis_Ababa')::date) as d) x
  ),
  -- 'credit' is not a pay_method: core record_sale stores a credit sale with paid < total.
  m as (select unnest(enum_range(null::public.pay_method))::text as method union select 'credit'),
  s as (
    select case when s.paid < s.total then 'credit' else s.method::text end as method, count(*) as n, sum(greatest(s.total - s.paid, 0)) as credit
    from public.sales s, bounds b
    where s.tenant_id = private.current_tenant() and s.created_at >= b.t0 and s.created_at < b.t1
    group by 1
  ),
  p as (
    select p.method::text as method,
           sum(p.amount) filter (where p.ref_table = 'sales') as from_sales,
           sum(p.amount) filter (where p.ref_table is null and p.customer_id is not null) as repaid
    from public.payments p, bounds b
    where p.tenant_id = private.current_tenant() and p.created_at >= b.t0 and p.created_at < b.t1
    group by 1
  )
  select m.method,
         coalesce(s.n, 0),
         coalesce(p.from_sales, 0)::numeric(14,2),
         coalesce(p.repaid, 0)::numeric(14,2),
         coalesce(s.credit, 0)::numeric(14,2)
  from m left join s using (method) left join p using (method)
  order by m.method;
$$;

revoke all on function public.ph_daily_closing(date) from public, anon;
grant execute on function public.ph_daily_closing(date) to authenticated;
