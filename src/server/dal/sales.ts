import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "./session";

export const SELL_SEARCH_LIMIT = 30;

export type SellableItemDTO = {
  itemId: string;
  names: { en: string; am: string | null; om: string | null };
  unit: string;
  price: number;
  qtyOnHand: number;
  daysLeft: number | null;
};

export type SaleResult =
  | { ok: true; saleId: string; total: number }
  | { ok: false; code: "insufficientStock" | "expiredStock" | "noPrice" | "itemNotFound" | "customerNotFound" | "notPermitted" | "generic" };

export async function searchSellable(q: string): Promise<SellableItemDTO[]> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ph_stock_list", { p_q: q, p_filter: "all", p_limit: SELL_SEARCH_LIMIT });
  if (error) throw new Error("sell_search_failed");
  return data.map((row) => ({
    itemId: row.item_id ?? "",
    names: { en: row.name_en ?? "", am: row.name_am, om: row.name_om },
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
}): Promise<SaleResult> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ph_record_sale", {
    p_lines: input.lines.map((l) => ({ item_id: l.itemId, qty: l.qty })),
    p_payment: input.payment,
    p_customer: input.customerId,
    p_client_ref: input.clientRef,
  });
  if (error || !data?.[0]) {
    const message = error?.message ?? "";
    if (message.startsWith("insufficient_stock")) return { ok: false, code: "insufficientStock" };
    if (message.startsWith("expired_stock")) return { ok: false, code: "expiredStock" };
    if (message.startsWith("no_price")) return { ok: false, code: "noPrice" };
    if (message.startsWith("item_not_found")) return { ok: false, code: "itemNotFound" };
    if (message.startsWith("customer_not_found")) return { ok: false, code: "customerNotFound" };
    if (message.startsWith("sale_not_permitted")) return { ok: false, code: "notPermitted" };
    return { ok: false, code: "generic" };
  }
  return { ok: true, saleId: data[0].sale_id, total: data[0].total };
}
