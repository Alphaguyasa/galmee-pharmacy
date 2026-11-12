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
