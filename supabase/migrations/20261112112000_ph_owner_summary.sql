-- ph_owner_summary: one row per pharmacy with today's figures, in the shared owner-summary
-- shape every Galmee app exposes (tenant_id, day, tx_count, sales_total, cash_total,
-- credit_total, owed_total, attention_count, extra). Used by the evening summary and the
-- owner screens. security_invoker: a signed-in user sees only their own pharmacy's row.
--   tx_count / sales_total: sales made today (Addis Ababa day)
--   cash_total:  cash taken in today (cash sales paid at the till + cash repayments)
--   credit_total: unpaid part of today's sales
--   owed_total:  everything customers owe now
--   attention_count: items with stock that is expired or expires within 30 days
--   extra: telebirr_total, other_total (CBE Birr, bank, ...), low_stock_count, expiring_value
create view public.ph_owner_summary with (security_invoker = true) as
with bounds as (
  select d as day,
         (d::timestamp at time zone 'Africa/Addis_Ababa') as t0,
         ((d + 1)::timestamp at time zone 'Africa/Addis_Ababa') as t1
  from (select (now() at time zone 'Africa/Addis_Ababa')::date as d) x
)
select
  t.id as tenant_id,
  b.day,
  coalesce(s.n, 0)::integer as tx_count,
  coalesce(s.total, 0)::numeric(14,2) as sales_total,
  coalesce(p.cash, 0)::numeric(14,2) as cash_total,
  coalesce(s.credit, 0)::numeric(14,2) as credit_total,
  coalesce(o.owed, 0)::numeric(14,2) as owed_total,
  coalesce(e.expiring, 0)::integer as attention_count,
  jsonb_build_object(
    'telebirr_total', coalesce(p.telebirr, 0)::numeric(14,2),
    'other_total', coalesce(p.other, 0)::numeric(14,2),
    'low_stock_count', coalesce(e.low, 0),
    'expiring_value', coalesce(e.value, 0)::numeric(14,2)
  ) as extra
from public.tenants t
cross join bounds b
left join lateral (
  select count(*) as n, sum(sa.total) as total, sum(greatest(sa.total - sa.paid, 0)) as credit
  from public.sales sa
  where sa.tenant_id = t.id and sa.created_at >= b.t0 and sa.created_at < b.t1
) s on true
left join lateral (
  select sum(pa.amount) filter (where pa.method = 'cash') as cash,
         sum(pa.amount) filter (where pa.method = 'telebirr') as telebirr,
         sum(pa.amount) filter (where pa.method not in ('cash', 'telebirr')) as other
  from public.payments pa
  where pa.tenant_id = t.id and pa.created_at >= b.t0 and pa.created_at < b.t1
    and (pa.ref_table = 'sales' or (pa.ref_table is null and pa.customer_id is not null))
) p on true
left join lateral (
  select sum(cb.balance) filter (where cb.balance > 0) as owed
  from public.customer_balances cb
  where cb.tenant_id = t.id
) o on true
left join lateral (
  select count(*) filter (where v.qty_on_hand > 0 and v.days_left < 30) as expiring,
         count(*) filter (where v.qty_on_hand < v.reorder_level) as low,
         sum(v.value_expired + v.value_30) as value
  from public.ph_item_expiry v
  where v.tenant_id = t.id
) e on true
where t.vertical = 'pharmacy';

revoke all on public.ph_owner_summary from public, anon;
grant select on public.ph_owner_summary to authenticated;
