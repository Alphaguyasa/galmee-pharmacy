import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "./session";

/** Payment methods in the order the closing screen lists them. `credit` is the unpaid part of sales. */
export const CLOSING_METHODS = ["cash", "telebirr", "cbe_birr", "bank", "chapa", "other", "credit"] as const;
export type ClosingMethod = (typeof CLOSING_METHODS)[number];

export type ClosingRowDTO = {
  method: ClosingMethod;
  salesCount: number;
  salesCollected: number;
  repayments: number;
  creditGiven: number;
};

export type DailyClosingDTO = {
  day: string;
  rows: ClosingRowDTO[];
  /** Money that actually came in (sales paid at the till + credit repayments), all methods. */
  totalIn: number;
  /** Cash that should be in the drawer: cash sales + cash repayments. */
  cashIn: number;
  creditGiven: number;
  salesCount: number;
};

const isMethod = (m: string): m is ClosingMethod => (CLOSING_METHODS as readonly string[]).includes(m);

/** One Addis Ababa day's money by payment method. `day` is a Gregorian 'YYYY-MM-DD'. */
export async function getDailyClosing(day: string): Promise<DailyClosingDTO> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ph_daily_closing", { p_day: day });
  if (error) throw new Error("closing_failed");

  const rows = data
    .filter((r) => isMethod(r.method))
    .map((r) => ({
      method: r.method as ClosingMethod,
      salesCount: Number(r.sales_count),
      salesCollected: Number(r.sales_collected),
      repayments: Number(r.repayments),
      creditGiven: Number(r.credit_given),
    }))
    .sort((a, b) => CLOSING_METHODS.indexOf(a.method) - CLOSING_METHODS.indexOf(b.method));

  const sum = (pick: (r: ClosingRowDTO) => number) => rows.reduce((total, r) => total + pick(r), 0);
  const cash = rows.find((r) => r.method === "cash");
  return {
    day,
    rows,
    totalIn: round2(sum((r) => r.salesCollected + r.repayments)),
    cashIn: round2((cash?.salesCollected ?? 0) + (cash?.repayments ?? 0)),
    creditGiven: round2(sum((r) => r.creditGiven)),
    salesCount: sum((r) => r.salesCount),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type StaffClosingDTO = {
  staffId: string;
  name: string;
  salesCount: number;
  salesTotal: number;
  collected: number;
  creditGiven: number;
};

/** Who sold what on one day. Owners and managers get everyone; staff get only their own line. */
export async function getClosingByStaff(day: string): Promise<StaffClosingDTO[]> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ph_daily_closing_by_staff", { p_day: day });
  if (error) throw new Error("closing_by_staff_failed");
  return data.map((r) => ({
    staffId: r.staff_id ?? "unknown",
    name: r.full_name,
    salesCount: Number(r.sales_count),
    salesTotal: Number(r.sales_total),
    collected: Number(r.collected),
    creditGiven: Number(r.credit_given),
  }));
}

export type CreditOverrideDTO = {
  saleId: string;
  at: string;
  customer: string;
  amountOver: number;
  reason: string;
  by: string;
};

/** Credit sales that went over a customer's limit on one day. Only owners and managers can read them (RLS). */
export async function getCreditOverrides(day: string): Promise<CreditOverrideDTO[]> {
  const { profile } = await getSession();
  if (profile.role === "staff") return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ph_credit_overrides_for_day", { p_day: day });
  if (error) throw new Error("overrides_failed");
  return data.map((r) => ({
    saleId: r.sale_id,
    at: r.created_at,
    customer: r.customer_name,
    amountOver: Number(r.amount_over),
    reason: r.reason,
    by: r.by_name,
  }));
}

export type DayTotalsDTO = {
  day: string;
  salesCount: number;
  salesTotal: number;
  /** Paid at the till for that day's sales, all methods. */
  collected: number;
  repayments: number;
  creditGiven: number;
  /** Cash sales + cash repayments. */
  cashIn: number;
};

/** One row per Addis Ababa day from `from` to `to` (both 'YYYY-MM-DD', at most 62 days). */
export async function getSalesByDay(from: string, to: string): Promise<DayTotalsDTO[]> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ph_sales_by_day", { p_from: from, p_to: to });
  if (error) throw new Error("sales_by_day_failed");
  return data.map((r) => ({
    day: r.day,
    salesCount: Number(r.sales_count),
    salesTotal: Number(r.sales_total),
    collected: Number(r.collected),
    repayments: Number(r.repayments),
    creditGiven: Number(r.credit_given),
    cashIn: Number(r.cash_in),
  }));
}

export type TodaySummaryDTO = {
  salesTotal: number;
  salesCount: number;
  /** Cash taken in today: cash sales paid at the till + cash repayments. */
  cashIn: number;
  /** Everything customers owe right now. */
  owed: number;
};

/** Today's figures for this pharmacy (Addis Ababa day), from ph_owner_summary. */
export async function getTodaySummary(): Promise<TodaySummaryDTO> {
  const { tenant } = await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ph_owner_summary")
    .select("tx_count, sales_total, cash_total, owed_total")
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (error) throw new Error("summary_failed");
  return {
    salesTotal: Number(data?.sales_total ?? 0),
    salesCount: Number(data?.tx_count ?? 0),
    cashIn: Number(data?.cash_total ?? 0),
    owed: Number(data?.owed_total ?? 0),
  };
}

export const DAY_SALES_LIMIT = 200;

export type DaySaleDTO = {
  saleId: string;
  at: string;
  total: number;
  method: ClosingMethod;
  receiptNo: string | null;
};

/** One Addis Ababa day's sales, newest first, each with its receipt number (for reprints). */
export async function getSalesForDay(day: string): Promise<DaySaleDTO[]> {
  await getSession();
  const supabase = await createClient();
  const start = new Date(`${day}T00:00:00+03:00`);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  const { data, error } = await supabase
    .from("sales")
    .select("id, total, paid, method, customer_id, created_at")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: false })
    .limit(DAY_SALES_LIMIT);
  if (error) throw new Error("day_sales_failed");
  if (data.length === 0) return [];
  const receipts = await supabase
    .from("ph_sale_receipts")
    .select("sale_id, receipt_no")
    .in("sale_id", data.map((s) => s.id));
  // Numbers are optional: a day before numbering started still lists its sales.
  const numbers = new Map((receipts.error ? [] : receipts.data).map((r) => [r.sale_id, r.receipt_no]));
  return data.map((s) => {
    const total = Number(s.total);
    const method = Number(s.paid) < total && s.customer_id ? "credit" : String(s.method);
    return {
      saleId: s.id,
      at: s.created_at,
      total,
      method: isMethod(method) ? method : "other",
      receiptNo: numbers.get(s.id) ?? null,
    };
  });
}
