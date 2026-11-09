-- ph_write_off_expired: zero every expired batch of an item through core adjust_stock, which
-- records the movement and refuses anyone but owners and managers. Running it twice removes nothing more.

create or replace function public.ph_write_off_expired(p_item uuid)
returns numeric
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_tenant uuid := private.current_tenant();
  v_today date := (now() at time zone 'Africa/Addis_Ababa')::date;
  v_removed numeric := 0;
  b record;
begin
  if v_tenant is null then raise exception 'no_tenant'; end if;
  if private.current_app_role() not in ('owner', 'manager') then raise exception 'not_allowed'; end if;

  for b in
    select sb.id, sb.qty from public.stock_batches sb
    where sb.tenant_id = v_tenant and sb.item_id = p_item and sb.qty > 0 and sb.expiry_date < v_today
    order by sb.expiry_date
    for update of sb
  loop
    perform public.adjust_stock(b.id, 0, 'expired');
    v_removed := v_removed + b.qty;
  end loop;

  return v_removed;
end;
$$;

revoke all on function public.ph_write_off_expired(uuid) from public, anon;
grant execute on function public.ph_write_off_expired(uuid) to authenticated;
