-- Sales and money in per Addis Ababa day for a date range (week and Ethiopian month reports, CSV export).
-- Same rules as ph_daily_closing: collected = paid at the till for that day's sales, repayments = credit
-- customers paying back, credit_given = unpaid part of that day's sales, cash_in = cash sales + cash
-- repayments. One row per day, also for days without sales. At most 62 days per call.
-- RLS on the core tables keeps it to the caller's pharmacy.
create or replace function public.ph_sales_by_day(p_from date, p_to date)
returns table (
  day date,
  sales_count bigint,
  sales_total numeric,
  collected numeric,
  repayments numeric,
  credit_given numeric,
  cash_in numeric
)
language plpgsql
stable
security invoker
set search_path = public, private
as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 61 then
    raise exception 'bad_range';
  end if;

  return query
  with days as (
    select g::date as d from generate_series(p_from, p_to, interval '1 day') g
  ),
  s as (
    select (s.created_at at time zone 'Africa/Addis_Ababa')::date as d,
           count(*) as n,
           sum(s.total) as total,
           sum(greatest(s.total - s.paid, 0)) as credit
    from public.sales s
    where s.tenant_id = private.current_tenant()
      and s.created_at >= (p_from::timestamp at time zone 'Africa/Addis_Ababa')
      and s.created_at < ((p_to + 1)::timestamp at time zone 'Africa/Addis_Ababa')
    group by 1
  ),
  p as (
    select (p.created_at at time zone 'Africa/Addis_Ababa')::date as d,
           sum(p.amount) filter (where p.ref_table = 'sales') as from_sales,
           sum(p.amount) filter (where p.ref_table is null and p.customer_id is not null) as repaid,
           sum(p.amount) filter (where p.method = 'cash'
             and (p.ref_table = 'sales' or (p.ref_table is null and p.customer_id is not null))) as cash
    from public.payments p
    where p.tenant_id = private.current_tenant()
      and p.created_at >= (p_from::timestamp at time zone 'Africa/Addis_Ababa')
      and p.created_at < ((p_to + 1)::timestamp at time zone 'Africa/Addis_Ababa')
    group by 1
  )
  select days.d,
         coalesce(s.n, 0)::bigint,
         coalesce(s.total, 0)::numeric(14,2),
         coalesce(p.from_sales, 0)::numeric(14,2),
         coalesce(p.repaid, 0)::numeric(14,2),
         coalesce(s.credit, 0)::numeric(14,2),
         coalesce(p.cash, 0)::numeric(14,2)
  from days
  left join s on s.d = days.d
  left join p on p.d = days.d
  order by days.d;
end;
$$;

revoke all on function public.ph_sales_by_day(date, date) from public, anon;
grant execute on function public.ph_sales_by_day(date, date) to authenticated;
