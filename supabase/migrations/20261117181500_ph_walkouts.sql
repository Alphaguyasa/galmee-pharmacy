-- Walk-out demand log: one tap at the till records a medicine a customer asked for that the
-- pharmacy could not sell (not in the list, out of stock, or only expired stock left).
-- ph_walkout_ranking turns the log into a ranked restock list: most asked first, with what
-- those requests would have brought in at today's price.

create table public.ph_walkouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default private.current_tenant() references public.tenants(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  qty integer not null default 1 check (qty between 1 and 999),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index ph_walkouts_tenant_time on public.ph_walkouts (tenant_id, created_at);
create index ph_walkouts_item on public.ph_walkouts (item_id) where item_id is not null;

alter table public.ph_walkouts enable row level security;

-- Everyone working in the pharmacy sees the list (it is a restock list, not money).
create policy ph_walkouts_sel on public.ph_walkouts for select to authenticated
  using (tenant_id = (select private.current_tenant()));

-- Any role logs a walk-out as themselves, for an item of their own pharmacy.
create policy ph_walkouts_ins on public.ph_walkouts for insert to authenticated
  with check (tenant_id = (select private.current_tenant())
              and created_by = (select auth.uid())
              and (item_id is null or exists (
                select 1 from public.items i where i.id = ph_walkouts.item_id and i.tenant_id = ph_walkouts.tenant_id)));

-- Undo: the person who logged it, within 10 minutes. Owners and managers clear any row.
create policy ph_walkouts_del on public.ph_walkouts for delete to authenticated
  using (tenant_id = (select private.current_tenant())
         and ((created_by = (select auth.uid()) and created_at > now() - interval '10 minutes')
              or (select private.current_app_role()) in ('owner', 'manager')));

revoke all on public.ph_walkouts from public, anon, authenticated;
grant select, insert, delete on public.ph_walkouts to authenticated;

-- Logs one walk-out. With an item, the label is the item's English name (the screen shows the
-- name in the reader's language); without one, the trimmed text the cashier typed.
create or replace function public.ph_log_walkout(p_label text, p_item uuid default null, p_qty integer default 1)
returns uuid
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_tenant uuid := private.current_tenant();
  v_label text := btrim(coalesce(p_label, ''));
  v_id uuid;
begin
  if v_tenant is null then raise exception 'no_tenant'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 999 then raise exception 'bad_qty'; end if;

  if p_item is not null then
    select i.name_en into v_label from public.items i where i.id = p_item and i.tenant_id = v_tenant;
    if not found then raise exception 'bad_item'; end if;
  end if;
  v_label := regexp_replace(v_label, '\s+', ' ', 'g');
  if char_length(v_label) < 1 or char_length(v_label) > 80 then raise exception 'bad_label'; end if;

  -- A till cannot flood the log: 500 walk-outs a day per pharmacy is far above real use.
  if (select count(*) from public.ph_walkouts w
      where w.tenant_id = v_tenant and w.created_at > now() - interval '1 day') >= 500 then
    raise exception 'walkout_cap';
  end if;

  insert into public.ph_walkouts (item_id, label, qty) values (p_item, v_label, p_qty)
  returning id into v_id;
  return v_id;
end;
$$;

-- Ranked restock list for the last p_days days (1 to 90). Free-text rows group by their
-- lower-cased label; rows for a listed item group by the item and show its current stock.
create or replace function public.ph_walkout_ranking(p_days integer default 7)
returns table (
  item_id uuid,
  label text,
  name_am text,
  name_om text,
  asks bigint,
  qty_asked bigint,
  last_asked timestamptz,
  price numeric,
  lost_value numeric,
  qty_on_hand numeric
)
language plpgsql
stable
security invoker
set search_path = public, private
as $$
declare
  v_tenant uuid := private.current_tenant();
begin
  if v_tenant is null then raise exception 'no_tenant'; end if;
  if p_days is null or p_days < 1 or p_days > 90 then raise exception 'bad_days'; end if;

  return query
  with w as (
    select w.item_id, w.label, w.qty, w.created_at
    from public.ph_walkouts w
    where w.tenant_id = v_tenant and w.created_at > now() - make_interval(days => p_days)
  ), g as (
    select w.item_id,
           case when w.item_id is null then lower(w.label) end as key,
           (array_agg(w.label order by w.created_at desc))[1] as label,
           count(*) as asks,
           sum(w.qty)::bigint as qty_asked,
           max(w.created_at) as last_asked
    from w
    group by w.item_id, case when w.item_id is null then lower(w.label) end
  )
  select g.item_id,
         coalesce(i.name_en, g.label),
         i.name_am,
         i.name_om,
         g.asks,
         g.qty_asked,
         g.last_asked,
         i.price,
         case when i.price is null then null else round(i.price * g.qty_asked, 2) end,
         case when g.item_id is null then null else coalesce((
           select sum(b.qty) from public.stock_batches b
           where b.tenant_id = v_tenant and b.item_id = g.item_id and b.qty > 0
             and (b.expiry_date is null or b.expiry_date >= (now() at time zone 'Africa/Addis_Ababa')::date)
         ), 0) end
  from g
  left join public.items i on i.id = g.item_id and i.tenant_id = v_tenant
  order by g.asks desc, g.qty_asked desc, g.last_asked desc
  limit 100;
end;
$$;

revoke all on function public.ph_log_walkout(text, uuid, integer) from public, anon;
revoke all on function public.ph_walkout_ranking(integer) from public, anon;
grant execute on function public.ph_log_walkout(text, uuid, integer) to authenticated;
grant execute on function public.ph_walkout_ranking(integer) to authenticated;
