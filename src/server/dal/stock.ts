import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "./session";

export const STOCK_FILTERS = ["all", "urgent", "expiring", "low"] as const;
export type StockFilter = (typeof STOCK_FILTERS)[number];
export const STOCK_PAGE_LIMIT = 200;

export type StockRowDTO = {
  itemId: string;
  names: { en: string; am: string | null; om: string | null };
  unit: string;
  qtyOnHand: number;
  reorderLevel: number;
  batchCount: number;
  nextExpiry: string | null;
  daysLeft: number | null;
  stockValue: number;
};

export type ExpiryTotalsDTO = {
  valueExpired: number;
  value30: number;
  value3089: number;
  itemsExpired: number;
  items30: number;
  items3089: number;
  itemsLow: number;
};

export async function listStock(input: { q?: string; filter: StockFilter }): Promise<StockRowDTO[]> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ph_stock_list", {
    p_q: input.q,
    p_filter: input.filter,
    p_limit: STOCK_PAGE_LIMIT,
  });
  if (error) throw new Error("stock_list_failed");
  return data.map((row) => ({
    itemId: row.item_id ?? "",
    names: { en: row.name_en ?? "", am: row.name_am, om: row.name_om },
    unit: row.unit ?? "",
    qtyOnHand: row.qty_on_hand ?? 0,
    reorderLevel: row.reorder_level ?? 0,
    batchCount: row.batch_count ?? 0,
    nextExpiry: row.next_expiry,
    daysLeft: row.days_left,
    stockValue: row.stock_value ?? 0,
  }));
}

export async function getExpiryTotals(): Promise<ExpiryTotalsDTO> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ph_expiry_totals");
  if (error || !data?.[0]) throw new Error("expiry_totals_failed");
  const row = data[0];
  return {
    valueExpired: row.value_expired,
    value30: row.value_30,
    // The screen shows 30 to 89 days as one amber figure. Added here only for display;
    // both parts are already rounded to cents by the database.
    value3089: Math.round((row.value_60 + row.value_90) * 100) / 100,
    itemsExpired: row.items_expired,
    items30: row.items_30,
    items3089: row.items_90,
    itemsLow: row.items_low,
  };
}
