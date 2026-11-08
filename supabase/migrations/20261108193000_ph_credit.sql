-- ph_credit: search, statement and a retry-safe repayment on top of the core credit ledger.
-- record_repayment has no idempotency key, so a phone that retries after a lost reply could
-- pay twice. ph_payment_refs remembers each client_ref; an advisory lock serialises retries.

create table public.ph_payment_refs (
  tenant_id uuid not null default private.current_tenant() references public.tenants(id) on delete cascade,
  client_ref uuid not null,
  payment_id uuid not null references public.payments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tenant_id, client_ref)
);
create index ph_payment_refs_payment_idx on public.ph_payment_refs (payment_id);

alter table public.ph_payment_refs enable row level security;
create policy ph_payment_refs_select on public.ph_payment_refs for select to authenticated
  using (tenant_id = (select private.current_tenant()));
create policy ph_payment_refs_insert on public.ph_payment_refs for insert to authenticated
  with check (tenant_id = (select private.current_tenant())
    and exists (select 1 from public.payments p where p.id = payment_id));
revoke all on public.ph_payment_refs from anon;

create or replace function public.ph_record_repayment(
  p_customer uuid,
  p_amount numeric,
  p_method public.pay_method,
  p_reference text,
  p_client_ref uuid
) returns uuid
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_payment uuid;
  v_balance numeric;
begin
  if (select private.current_tenant()) is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_client_ref is null then raise exception 'client_ref_required' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad_amount' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_client_ref::text, 0));
  select r.payment_id into v_payment from ph_payment_refs r where r.client_ref = p_client_ref;
  if found then return v_payment; end if;

  -- Serialise repayments per customer so two phones cannot both pass the balance check.
  perform 1 from customers c where c.id = p_customer for update;
  if not found then raise exception 'customer_not_found' using errcode = 'P0002'; end if;

  select b.balance into v_balance from customer_balances b where b.customer_id = p_customer;
  if p_amount > coalesce(v_balance, 0) then
    raise exception 'over_balance' using errcode = '22023';
  end if;

  v_payment := record_repayment(p_customer, p_amount, p_method, nullif(btrim(p_reference), ''));
  insert into ph_payment_refs (client_ref, payment_id) values (p_client_ref, v_payment);
  return v_payment;
end $$;

-- Customers with balances, biggest debt first. Parameterised search by name or phone.
create or replace function public.ph_customer_list(
  p_q text default null,
  p_owing boolean default false,
  p_limit integer default 200
) returns setof public.customer_balances
language sql
stable
security invoker
set search_path = public, private
as $$
  with q as (
    select '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  select b.*
  from public.customer_balances b, q
  where (nullif(btrim(p_q), '') is null or b.name ilike q.pat or b.phone ilike q.pat)
    and (not coalesce(p_owing, false) or b.balance > 0)
  order by b.balance desc, b.name asc
  limit least(greatest(coalesce(p_limit, 200), 1), 500)
$$;

create or replace function public.ph_credit_totals()
returns table (total_owed numeric, customers_owing integer)
language sql
stable
security invoker
set search_path = public, private
as $$
  select coalesce(sum(b.balance) filter (where b.balance > 0), 0),
         count(*) filter (where b.balance > 0)::integer
  from public.customer_balances b
$$;

-- Ledger entries for one customer, newest first, each with the balance after it.
create or replace function public.ph_customer_statement(p_customer uuid, p_limit integer default 100)
returns table (
  id uuid,
  type text,
  amount numeric,
  due_date date,
  created_at timestamptz,
  balance_after numeric
)
language sql
stable
security invoker
set search_path = public, private
as $$
  select s.id, s.type, s.amount, s.due_date, s.created_at, s.balance_after
  from (
    select l.id, l.type, l.amount, l.due_date, l.created_at,
           sum(case when l.type = 'debt' then l.amount else -l.amount end)
             over (order by l.created_at, l.id) as balance_after
    from public.credit_ledger l
    where l.customer_id = p_customer
  ) s
  order by s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

revoke all on function public.ph_record_repayment(uuid, numeric, public.pay_method, text, uuid) from public, anon;
revoke all on function public.ph_customer_list(text, boolean, integer) from public, anon;
revoke all on function public.ph_credit_totals() from public, anon;
revoke all on function public.ph_customer_statement(uuid, integer) from public, anon;
grant execute on function public.ph_record_repayment(uuid, numeric, public.pay_method, text, uuid) to authenticated;
grant execute on function public.ph_customer_list(text, boolean, integer) to authenticated;
grant execute on function public.ph_credit_totals() to authenticated;
grant execute on function public.ph_customer_statement(uuid, integer) to authenticated;
