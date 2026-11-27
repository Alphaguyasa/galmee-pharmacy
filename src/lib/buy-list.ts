/**
 * The weekly buy list: one page the owner carries to the wholesaler. It merges three lists
 * the app already keeps, so nothing here is guessed:
 *  1. walk-outs of the week, ranked by how often customers asked;
 *  2. fast movers that will not last another week (stock at or under the reorder level,
 *     or under what sold in the last 7 days);
 *  3. the expiry board: stock that expires within 90 days, so the owner does not buy more of it.
 */

import { expiryStatus } from "./expiry";

export type Names = { en: string; am: string | null; om: string | null };

export type BuyListWalkoutInput = {
  itemId: string | null;
  names: Names;
  asks: number;
  qtyAsked: number;
  qtyOnHand: number | null;
};

export type SoldLineInput = { itemId: string; qty: number };

export type ItemStockInput = {
  itemId: string;
  names: Names;
  qtyOnHand: number;
  reorderLevel: number;
};

export type ExpiringInput = {
  itemId: string;
  names: Names;
  qtyOnHand: number;
  daysLeft: number | null;
  nextExpiry: string | null;
};

export type BuyListWalkout = BuyListWalkoutInput & { rank: number };
export type BuyListFastMover = ItemStockInput & { soldWeek: number };
export type BuyListExpiring = ExpiringInput & { tone: "expired" | "red" | "amber" };

export type BuyList = {
  walkouts: BuyListWalkout[];
  fastMovers: BuyListFastMover[];
  expiring: BuyListExpiring[];
};

export const BUY_LIST_LIMITS = { walkouts: 20, fastMovers: 20, expiring: 15 } as const;

/** Adds up sold quantity per item (a sale can hold the same item on several lines). */
export function soldByItem(lines: SoldLineInput[]): Map<string, number> {
  const sold = new Map<string, number>();
  for (const line of lines) {
    if (!line.itemId || !Number.isFinite(line.qty) || line.qty <= 0) continue;
    sold.set(line.itemId, (sold.get(line.itemId) ?? 0) + line.qty);
  }
  return sold;
}

/** The items sold most this week, most first, as candidates for the fast-mover list. */
export function topSoldItemIds(lines: SoldLineInput[], limit = 60): string[] {
  return [...soldByItem(lines).entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id]) => id);
}

export function buildBuyList(input: {
  walkouts: BuyListWalkoutInput[];
  sold: SoldLineInput[];
  stock: ItemStockInput[];
  expiring: ExpiringInput[];
}): BuyList {
  const walkouts = [...input.walkouts]
    .filter((w) => w.asks > 0)
    .sort((a, b) => b.asks - a.asks || b.qtyAsked - a.qtyAsked || a.names.en.localeCompare(b.names.en))
    .slice(0, BUY_LIST_LIMITS.walkouts)
    .map((w, i) => ({ ...w, rank: i + 1 }));

  // An item already on the walk-out list is bought from there; it is not printed twice.
  const onWalkoutList = new Set(walkouts.map((w) => w.itemId).filter((id): id is string => id !== null));
  const sold = soldByItem(input.sold);

  const fastMovers = input.stock
    .filter((s) => !onWalkoutList.has(s.itemId))
    .map((s) => ({ ...s, soldWeek: sold.get(s.itemId) ?? 0 }))
    .filter((s) => s.soldWeek > 0 && s.qtyOnHand <= Math.max(s.reorderLevel, s.soldWeek))
    .sort((a, b) => b.soldWeek - a.soldWeek || a.qtyOnHand - b.qtyOnHand || a.names.en.localeCompare(b.names.en))
    .slice(0, BUY_LIST_LIMITS.fastMovers);

  const expiring = input.expiring
    .filter((e) => e.qtyOnHand > 0 && e.daysLeft !== null && e.daysLeft < 90)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0) || a.names.en.localeCompare(b.names.en))
    .slice(0, BUY_LIST_LIMITS.expiring)
    .map((e) => ({ ...e, tone: expiryStatus(e.daysLeft) as BuyListExpiring["tone"] }));

  return { walkouts, fastMovers, expiring };
}
