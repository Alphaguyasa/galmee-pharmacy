import "server-only";
import { createClient } from "@/lib/supabase/server";
import { parseAmountOver, saleErrorCode, type SaleErrorCode } from "@/lib/sale-errors";
import { getSession } from "./session";

export const SELL_SEARCH_LIMIT = 30;

export type SellableItemDTO = {
  itemId: string;
  names: { en: string; am: string | null; om: string | null };
  sku: string | null;
  unit: string;
  price: number;
  qtyOnHand: number;
  daysLeft: number | null;
};

export type { SaleErrorCode };

export type SaleResult =
  | { ok: true; saleId: string; total: number }
  | { ok: false; code: SaleErrorCode; amountOver?: number };

export async function searchSellable(q: string): Promise<SellableItemDTO[]> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ph_stock_list", { p_q: q, p_filter: "all", p_limit: SELL_SEARCH_LIMIT });
  if (error) throw new Error("sell_search_failed");
  return data.map((row) => ({
    itemId: row.item_id ?? "",
    names: { en: row.name_en ?? "", am: row.name_am, om: row.name_om },
    sku: row.sku,
    unit: row.unit ?? "",
    price: row.price ?? 0,
    qtyOnHand: row.qty_on_hand ?? 0,
    daysLeft: row.days_left,
  }));
}

/** Prices and the total are decided by the database; the phone only sends items and quantities. */
export async function recordSale(input: {
  lines: { itemId: string; qty: number }[];
  payment: string;
  customerId?: string;
  clientRef: string;
  overrideReason?: string;
}): Promise<SaleResult> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ph_record_sale", {
    p_lines: input.lines.map((l) => ({ item_id: l.itemId, qty: l.qty })),
    p_payment: input.payment,
    p_customer: input.customerId,
    p_client_ref: input.clientRef,
    p_override_reason: input.overrideReason,
  });
  if (error || !data?.[0]) {
    const code = saleErrorCode(error?.message);
    if (code === "creditLimit" || code === "overrideNotPermitted")
      return { ok: false, code, amountOver: parseAmountOver(error?.details) };
    return { ok: false, code };
  }
  return { ok: true, saleId: data[0].sale_id, total: data[0].total };
}
