-- ph_stock_list_urgent_filter: adds the "under 30 days" filter used by the stock screen.
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
          when 'urgent' then v.days_left < 30
          when 'expiring' then v.days_left < 90
          when 'low' then v.qty_on_hand < v.reorder_level
          else true
        end
  order by v.days_left asc nulls last, v.name_en asc
  limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;

revoke all on function public.ph_stock_list(text, text, integer) from public, anon;
grant execute on function public.ph_stock_list(text, text, integer) to authenticated;
