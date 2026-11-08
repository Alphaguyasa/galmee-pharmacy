-- ph_suppliers_purchasing: suppliers, purchase orders and lines, plus the RPCs that turn
-- a delivery into stock batches through the core receive_stock.
--
-- Tenant integrity: composite foreign keys (tenant_id, id) keep suppliers, orders and lines
-- inside one tenant, because a plain FK check ignores RLS. References to core items and
-- batches are checked in the insert/update policies, which see only the caller's tenant.
-- Nothing is deleted: suppliers are deactivated and orders are cancelled.

create table public.ph_suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default private.current_tenant() references public.tenants(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  phone text check (phone is null or length(phone) <= 20),
  notes text check (notes is null or length(notes) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index ph_suppliers_tenant_name_key on public.ph_suppliers (tenant_id, lower(btrim(name)));

create table public.ph_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default private.current_tenant() references public.tenants(id) on delete cascade,
  supplier_id uuid not null,
  status text not null default 'ordered' check (status in ('ordered', 'partial', 'received', 'cancelled')),
  expected_date date,
  notes text check (notes is null or length(notes) <= 500),
  client_ref uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  received_at timestamptz,
  unique (tenant_id, id),
  unique (tenant_id, client_ref),
  foreign key (tenant_id, supplier_id) references public.ph_suppliers (tenant_id, id)
);
create index ph_purchase_orders_supplier_idx on public.ph_purchase_orders (tenant_id, supplier_id);
create index ph_purchase_orders_status_idx on public.ph_purchase_orders (tenant_id, status, created_at desc);

create table public.ph_purchase_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default private.current_tenant() references public.tenants(id) on delete cascade,
  po_id uuid not null,
  item_id uuid not null references public.items(id),
  qty numeric(14,3) not null check (qty > 0),
  received_qty numeric(14,3) not null default 0 check (received_qty >= 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  batch_no text check (batch_no is null or length(batch_no) <= 60),
  expiry_date date,
  batch_id uuid references public.stock_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  check (received_qty <= qty),
  foreign key (tenant_id, po_id) references public.ph_purchase_orders (tenant_id, id) on delete cascade
);
create index ph_purchase_lines_po_idx on public.ph_purchase_lines (tenant_id, po_id);
create index ph_purchase_lines_item_idx on public.ph_purchase_lines (item_id);
create index ph_purchase_lines_batch_idx on public.ph_purchase_lines (batch_id);

alter table public.ph_suppliers enable row level security;
alter table public.ph_purchase_orders enable row level security;
alter table public.ph_purchase_lines enable row level security;

create policy ph_suppliers_select on public.ph_suppliers for select to authenticated
  using (tenant_id = (select private.current_tenant()));
create policy ph_suppliers_insert on public.ph_suppliers for insert to authenticated
  with check (tenant_id = (select private.current_tenant())
    and (select private.current_app_role()) in ('owner', 'manager'));
create policy ph_suppliers_update on public.ph_suppliers for update to authenticated
  using (tenant_id = (select private.current_tenant())
    and (select private.current_app_role()) in ('owner', 'manager'))
  with check (tenant_id = (select private.current_tenant()));

create policy ph_purchase_orders_select on public.ph_purchase_orders for select to authenticated
  using (tenant_id = (select private.current_tenant()));
create policy ph_purchase_orders_insert on public.ph_purchase_orders for insert to authenticated
  with check (tenant_id = (select private.current_tenant())
    and (select private.current_app_role()) in ('owner', 'manager'));
create policy ph_purchase_orders_update on public.ph_purchase_orders for update to authenticated
  using (tenant_id = (select private.current_tenant())
    and (select private.current_app_role()) in ('owner', 'manager'))
  with check (tenant_id = (select private.current_tenant()));

create policy ph_purchase_lines_select on public.ph_purchase_lines for select to authenticated
  using (tenant_id = (select private.current_tenant()));
create policy ph_purchase_lines_insert on public.ph_purchase_lines for insert to authenticated
  with check (tenant_id = (select private.current_tenant())
    and (select private.current_app_role()) in ('owner', 'manager')
    and exists (select 1 from public.items i where i.id = item_id));
create policy ph_purchase_lines_update on public.ph_purchase_lines for update to authenticated
  using (tenant_id = (select private.current_tenant())
    and (select private.current_app_role()) in ('owner', 'manager'))
  with check (tenant_id = (select private.current_tenant())
    and exists (select 1 from public.items i where i.id = item_id)
    and (batch_id is null or exists (select 1 from public.stock_batches b where b.id = batch_id)));

revoke all on public.ph_suppliers, public.ph_purchase_orders, public.ph_purchase_lines from anon;

-- Create an order. Safe to retry: the same client_ref returns the first order.
create or replace function public.ph_create_purchase_order(
  p_supplier uuid,
  p_lines jsonb,
  p_expected date default null,
  p_notes text default null,
  p_client_ref uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_po uuid;
  l jsonb;
  v_item uuid;
  v_qty numeric;
  v_cost numeric;
begin
  if coalesce((select private.current_app_role())::text, '') not in ('owner', 'manager') then
    raise exception 'owner_or_manager_only' using errcode = '42501';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 200 then
    raise exception 'bad_lines' using errcode = '22023';
  end if;
  if not exists (select 1 from ph_suppliers s where s.id = p_supplier and s.active) then
    raise exception 'supplier_not_found' using errcode = 'P0002';
  end if;

  insert into ph_purchase_orders (supplier_id, expected_date, notes, client_ref)
  values (p_supplier, p_expected, nullif(btrim(p_notes), ''), p_client_ref)
  on conflict (tenant_id, client_ref) do nothing
  returning id into v_po;

  if v_po is null then
    select o.id into v_po from ph_purchase_orders o where o.client_ref = p_client_ref;
    return v_po;
  end if;

  for l in select value from jsonb_array_elements(p_lines) loop
    v_qty := (l ->> 'qty')::numeric;
    v_cost := (l ->> 'unit_cost')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'bad_qty' using errcode = '22023'; end if;
    if v_cost is null or v_cost < 0 then raise exception 'bad_cost' using errcode = '22023'; end if;

    select i.id into v_item from items i where i.id = (l ->> 'item_id')::uuid and i.active;
    if not found then raise exception 'item_not_found' using errcode = 'P0002'; end if;

    insert into ph_purchase_lines (po_id, item_id, qty, unit_cost, batch_no, expiry_date)
    values (v_po, v_item, v_qty, v_cost,
            nullif(btrim(l ->> 'batch_no'), ''), nullif(l ->> 'expiry_date', '')::date);
  end loop;

  return v_po;
end $$;

-- Receive an order, in full (p_lines null) or line by line.
-- p_lines: [{line_id, qty?, unit_cost?, batch_no?, expiry_date?}]. Each line becomes one
-- stock batch through receive_stock. Lines already received are skipped, so a retry adds nothing.
create or replace function public.ph_receive_purchase_order(p_po uuid, p_lines jsonb default null)
returns integer
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_status text;
  v_today date := (now() at time zone 'Africa/Addis_Ababa')::date;
  v_lines jsonb := p_lines;
  v_done integer := 0;
  v_batch uuid;
  l jsonb;
  ln record;
  v_tracks boolean;
  v_qty numeric;
  v_cost numeric;
  v_batch_no text;
  v_expiry date;
begin
  if coalesce((select private.current_app_role())::text, '') not in ('owner', 'manager') then
    raise exception 'owner_or_manager_only' using errcode = '42501';
  end if;

  select o.status into v_status from ph_purchase_orders o where o.id = p_po for update;
  if not found then raise exception 'po_not_found' using errcode = 'P0002'; end if;
  if v_status = 'cancelled' then raise exception 'po_cancelled' using errcode = '22023'; end if;

  if v_lines is null then
    select jsonb_agg(jsonb_build_object('line_id', pl.id)) into v_lines
    from ph_purchase_lines pl where pl.po_id = p_po and pl.received_qty < pl.qty;
    if v_lines is null then return 0; end if;
  elsif jsonb_typeof(v_lines) <> 'array' then
    raise exception 'bad_lines' using errcode = '22023';
  end if;

  for l in select value from jsonb_array_elements(v_lines) loop
    select * into ln from ph_purchase_lines pl
    where pl.id = (l ->> 'line_id')::uuid and pl.po_id = p_po for update;
    if not found then raise exception 'line_not_found' using errcode = 'P0002'; end if;

    v_qty := coalesce((l ->> 'qty')::numeric, ln.qty - ln.received_qty);
    v_cost := coalesce((l ->> 'unit_cost')::numeric, ln.unit_cost);
    v_batch_no := coalesce(nullif(btrim(l ->> 'batch_no'), ''), ln.batch_no);
    v_expiry := coalesce(nullif(l ->> 'expiry_date', '')::date, ln.expiry_date);

    if v_qty = 0 and (l ->> 'qty') is null then continue; end if;
    if v_qty <= 0 then raise exception 'bad_qty' using errcode = '22023'; end if;
    if v_qty > ln.qty - ln.received_qty then raise exception 'over_receipt' using errcode = '22023'; end if;
    if v_cost < 0 then raise exception 'bad_cost' using errcode = '22023'; end if;

    select i.tracks_expiry into v_tracks from items i where i.id = ln.item_id;
    if v_tracks and v_expiry is null then raise exception 'expiry_required' using errcode = '22023'; end if;
    if v_expiry is not null and v_expiry <= v_today then
      raise exception 'already_expired' using errcode = '22023';
    end if;

    v_batch := receive_stock(ln.item_id, v_qty, v_cost, v_batch_no, v_expiry);

    update ph_purchase_lines
    set received_qty = received_qty + v_qty, unit_cost = v_cost, batch_no = v_batch_no,
        expiry_date = v_expiry, batch_id = v_batch
    where id = ln.id;
    v_done := v_done + 1;
  end loop;

  update ph_purchase_orders o
  set status = case when exists (select 1 from ph_purchase_lines pl where pl.po_id = p_po and pl.received_qty < pl.qty)
                    then 'partial' else 'received' end,
      received_at = case when exists (select 1 from ph_purchase_lines pl where pl.po_id = p_po and pl.received_qty < pl.qty)
                    then null else now() end
  where o.id = p_po;

  return v_done;
end $$;

-- A delivery with no earlier order: record the order and receive it in one transaction.
create or replace function public.ph_receive_delivery(p_supplier uuid, p_lines jsonb, p_client_ref uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, private
as $$
declare v_po uuid;
begin
  if p_client_ref is null then raise exception 'client_ref_required' using errcode = '22023'; end if;
  v_po := ph_create_purchase_order(p_supplier, p_lines, null, null, p_client_ref);
  perform ph_receive_purchase_order(v_po, null);
  return v_po;
end $$;

revoke all on function public.ph_create_purchase_order(uuid, jsonb, date, text, uuid) from public, anon;
revoke all on function public.ph_receive_purchase_order(uuid, jsonb) from public, anon;
revoke all on function public.ph_receive_delivery(uuid, jsonb, uuid) from public, anon;
grant execute on function public.ph_create_purchase_order(uuid, jsonb, date, text, uuid) to authenticated;
grant execute on function public.ph_receive_purchase_order(uuid, jsonb) to authenticated;
grant execute on function public.ph_receive_delivery(uuid, jsonb, uuid) to authenticated;
