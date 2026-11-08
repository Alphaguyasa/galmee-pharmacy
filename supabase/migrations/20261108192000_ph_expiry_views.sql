-- ph_expiry_views: stock per item with expiry buckets and the money sitting in them.
-- Value is quantity x batch cost, worked out here so the app never does money math.
-- Buckets are disjoint and follow the screen colours: expired, 0-29, 30-59, 60-89 days.

create view public.ph_item_expiry with (security_invoker = true) as
with today as (select (now() at time zone 'Africa/Addis_Ababa')::date as d)
select
  i.tenant_id,
  i.id as item_id,
  i.sku,
  i.name_en,
  i.name_am,
  i.name_om,
  i.category,
  i.unit,
  i.price,
  i.reorder_level,
  i.tracks_expiry,
  coalesce(sum(b.qty), 0)::numeric(14,3) as qty_on_hand,
  count(b.id)::integer as batch_count,
  min(b.expiry_date) as next_expiry,
  min(b.expiry_date) - t.d as days_left,
  coalesce(sum(b.qty * b.cost), 0)::numeric(14,2) as stock_value,
  coalesce(sum(b.qty * b.cost) filter (where b.expiry_date < t.d), 0)::numeric(14,2) as value_expired,
  coalesce(sum(b.qty * b.cost) filter (where b.expiry_date >= t.d and b.expiry_date < t.d + 30), 0)::numeric(14,2) as value_30,
  coalesce(sum(b.qty * b.cost) filter (where b.expiry_date >= t.d + 30 and b.expiry_date < t.d + 60), 0)::numeric(14,2) as value_60,
  coalesce(sum(b.qty * b.cost) filter (where b.expiry_date >= t.d + 60 and b.expiry_date < t.d + 90), 0)::numeric(14,2) as value_90
from public.items i
cross join today t
left join public.stock_batches b on b.item_id = i.id and b.qty > 0
where i.active
group by i.id, t.d;

revoke all on public.ph_item_expiry from public, anon;
grant select on public.ph_item_expiry to authenticated;

-- Search and filter for the stock screen. Parameterised so search text cannot change the query.
create or replace function public.ph_stock_list(
  p_q text default null,
  p_filter text default 'all',
  p_limit integer default 200
) returns setof public.ph_item_expiry
language sql
stable
security invoker
set search_path = public, private
as $$
  with q as (
    select '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  select v.*
  from public.ph_item_expiry v, q
  where (nullif(btrim(p_q), '') is null
         or v.name_en ilike q.pat or v.name_am ilike q.pat or v.name_om ilike q.pat or v.sku ilike q.pat)
    and case p_filter
          when 'expiring' then v.days_left < 90
          when 'low' then v.qty_on_hand < v.reorder_level
          else true
        end
  order by v.days_left asc nulls last, v.name_en asc
  limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;

-- Totals for the top of the stock screen and the evening summary.
create or replace function public.ph_expiry_totals()
returns table (
  value_expired numeric,
  value_30 numeric,
  value_60 numeric,
  value_90 numeric,
  items_expired integer,
  items_30 integer,
  items_90 integer,
  items_low integer
)
language sql
stable
security invoker
set search_path = public, private
as $$
  select
    coalesce(sum(v.value_expired), 0),
    coalesce(sum(v.value_30), 0),
    coalesce(sum(v.value_60), 0),
    coalesce(sum(v.value_90), 0),
    count(*) filter (where v.value_expired > 0)::integer,
    count(*) filter (where v.value_30 > 0)::integer,
    count(*) filter (where v.value_60 > 0 or v.value_90 > 0)::integer,
    count(*) filter (where v.qty_on_hand < v.reorder_level)::integer
  from public.ph_item_expiry v
$$;

revoke all on function public.ph_stock_list(text, text, integer) from public, anon;
revoke all on function public.ph_expiry_totals() from public, anon;
grant execute on function public.ph_stock_list(text, text, integer) to authenticated;
grant execute on function public.ph_expiry_totals() to authenticated;
