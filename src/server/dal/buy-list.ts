import "server-only";
import { buildBuyList, topSoldItemIds, type BuyList, type SoldLineInput } from "@/lib/buy-list";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "./session";
import { listStock } from "./stock";
import { walkoutRanking } from "./walkouts";

/** Sales read for the fast-mover list. A busy pharmacy makes well under this many in a week. */
const WEEK_SALES_CAP = 5000;

/**
 * Everything the weekly buy list needs, read with the caller's own rights: row-level
 * security keeps every query inside the caller's business.
 */
export async function getBuyList(now: Date = new Date()): Promise<BuyList & { salesCapped: boolean }> {
  await getSession();
  const supabase = await createClient();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [walkouts, expiring, sales] = await Promise.all([
    walkoutRanking(7),
    listStock({ filter: "expiring" }),
    supabase
      .from("sales")
      .select("id, sale_lines(item_id, qty)")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(WEEK_SALES_CAP),
  ]);
  if (sales.error) throw new Error("buy_list_sales_failed");

  const sold: SoldLineInput[] = sales.data.flatMap((s) => s.sale_lines.map((l) => ({ itemId: l.item_id, qty: Number(l.qty) })));
  const topIds = topSoldItemIds(sold);

  let stock: { itemId: string; names: { en: string; am: string | null; om: string | null }; qtyOnHand: number; reorderLevel: number }[] = [];
  if (topIds.length > 0) {
    const { data, error } = await supabase
      .from("item_stock")
      .select("item_id, name_en, name_am, name_om, qty_on_hand, reorder_level")
      .in("item_id", topIds);
    if (error) throw new Error("buy_list_stock_failed");
    stock = data
      .filter((r) => r.item_id !== null)
      .map((r) => ({
        itemId: r.item_id!,
        names: { en: r.name_en ?? "", am: r.name_am, om: r.name_om },
        qtyOnHand: Number(r.qty_on_hand ?? 0),
        reorderLevel: Number(r.reorder_level ?? 0),
      }));
  }

  return {
    ...buildBuyList({
      walkouts,
      sold,
      stock,
      expiring: expiring.map((e) => ({
        itemId: e.itemId,
        names: e.names,
        qtyOnHand: e.qtyOnHand,
        daysLeft: e.daysLeft,
        nextExpiry: e.nextExpiry,
      })),
    }),
    salesCapped: sales.data.length >= WEEK_SALES_CAP,
  };
}
