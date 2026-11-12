-- Per-staff sales for one Addis Ababa day: who sold how much, what they took at the till and
-- what they gave on credit. Owners and managers see everyone; staff see only their own line.
create or replace function public.ph_daily_closing_by_staff(p_day date default null)
returns table (staff_id uuid, full_name text, sales_count bigint, sales_total numeric, collected numeric, credit_given numeric)
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
  select s.staff_id,
         coalesce(max(pr.full_name), '') as full_name,
         count(*) as sales_count,
         sum(s.total)::numeric(14,2),
         sum(least(s.paid, s.total))::numeric(14,2),
         sum(greatest(s.total - s.paid, 0))::numeric(14,2)
  from public.sales s
  cross join bounds b
  left join public.profiles pr on pr.user_id = s.staff_id and pr.tenant_id = s.tenant_id
  where s.tenant_id = private.current_tenant()
    and s.created_at >= b.t0 and s.created_at < b.t1
    and (private.current_app_role() in ('owner', 'manager') or s.staff_id = auth.uid())
  group by s.staff_id
  order by 4 desc, 2;
$$;

revoke all on function public.ph_daily_closing_by_staff(date) from public, anon;
grant execute on function public.ph_daily_closing_by_staff(date) to authenticated;
