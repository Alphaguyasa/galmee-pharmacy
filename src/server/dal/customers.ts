import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "./session";

export type CustomerRowDTO = {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
  oldestDebtAt: string | null;
};
export type CreditTotalsDTO = { totalOwed: number; customersOwing: number };
export type StatementEntryDTO = {
  id: string;
  type: "debt" | "repayment";
  amount: number;
  dueDate: string | null;
  createdAt: string;
  balanceAfter: number;
};
export type RepaymentResult =
  | { ok: true }
  | { ok: false; code: "overBalance" | "notFound" | "generic" };

export const CUSTOMER_PAGE_LIMIT = 200;

export async function listCustomers(input: { q?: string; owing: boolean }): Promise<CustomerRowDTO[]> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ph_customer_list", {
    p_q: input.q,
    p_owing: input.owing,
    p_limit: CUSTOMER_PAGE_LIMIT,
  });
  if (error) throw new Error("customers_failed");
  return data.map((row) => ({
    id: row.customer_id ?? "",
    name: row.name ?? "",
    phone: row.phone,
    balance: row.balance ?? 0,
    oldestDebtAt: row.oldest_debt_at,
  }));
}

export async function getCreditTotals(): Promise<CreditTotalsDTO> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ph_credit_totals");
  if (error || !data?.[0]) throw new Error("credit_totals_failed");
  return { totalOwed: data[0].total_owed, customersOwing: data[0].customers_owing };
}

export async function getCustomer(id: string): Promise<CustomerRowDTO | null> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_balances")
    .select("customer_id, name, phone, balance, oldest_debt_at")
    .eq("customer_id", id)
    .maybeSingle();
  if (error) throw new Error("customer_failed");
  if (!data) return null;
  return {
    id: data.customer_id ?? id,
    name: data.name ?? "",
    phone: data.phone,
    balance: data.balance ?? 0,
    oldestDebtAt: data.oldest_debt_at,
  };
}

export async function getStatement(customerId: string): Promise<StatementEntryDTO[]> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ph_customer_statement", { p_customer: customerId, p_limit: 100 });
  if (error) throw new Error("statement_failed");
  return data.map((row) => ({
    id: row.id,
    type: row.type === "debt" ? "debt" : "repayment",
    amount: row.amount,
    dueDate: row.due_date,
    createdAt: row.created_at,
    balanceAfter: row.balance_after,
  }));
}

export async function createCustomer(input: {
  name: string;
  phone?: string;
  creditLimit?: number;
}): Promise<{ ok: true; id: string } | { ok: false }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({ name: input.name, phone: input.phone ?? null, credit_limit: input.creditLimit ?? null })
    .select("id")
    .single();
  return error ? { ok: false } : { ok: true, id: data.id };
}

export async function recordRepayment(input: {
  customerId: string;
  amount: number;
  method: "cash" | "telebirr" | "cbe_birr" | "bank";
  reference?: string;
  clientRef: string;
}): Promise<RepaymentResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("ph_record_repayment", {
    p_customer: input.customerId,
    p_amount: input.amount,
    p_method: input.method,
    p_reference: input.reference ?? null,
    p_client_ref: input.clientRef,
  });
  if (!error) return { ok: true };
  if (error.message === "over_balance") return { ok: false, code: "overBalance" };
  if (error.message === "customer_not_found") return { ok: false, code: "notFound" };
  return { ok: false, code: "generic" };
}
