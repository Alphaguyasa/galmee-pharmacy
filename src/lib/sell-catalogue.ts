import { openDB } from "idb";
import type { SellableItemDTO } from "@/server/dal/sales";

/**
 * The till's copy of the sellable list, so a cashier can still find a medicine
 * and fill a cart when the network drops (the sale then waits in the offline
 * queue). Stock figures are as of `savedAt`; the database checks stock, price
 * and expiry again when the sale is sent.
 */
export type SellCatalogue = { items: SellableItemDTO[]; savedAt: number };

const DB = "galmee-pharmacy-catalogue";
const STORE = "catalogue";
const KEY = "sellable";

const db = () =>
  openDB(DB, 1, {
    upgrade(d) {
      d.createObjectStore(STORE);
    },
  });

export async function saveCatalogue(items: SellableItemDTO[], now = Date.now()): Promise<SellCatalogue> {
  const value: SellCatalogue = { items, savedAt: now };
  const d = await db();
  try {
    await d.put(STORE, value, KEY);
  } finally {
    d.close();
  }
  return value;
}

export async function loadCatalogue(): Promise<SellCatalogue | null> {
  const d = await db();
  try {
    return ((await d.get(STORE, KEY)) as SellCatalogue | undefined) ?? null;
  } finally {
    d.close();
  }
}

/**
 * Same match as the server search (`ph_stock_list`): the words appear anywhere
 * in the English, Amharic or Oromo name or the code, any case; soonest expiry
 * first, then by English name.
 */
export function searchCatalogue(items: readonly SellableItemDTO[], query: string, limit = 30): SellableItemDTO[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [];
  const hit = (v: string | null) => v !== null && v.toLocaleLowerCase().includes(q);
  return items
    .filter((i) => hit(i.names.en) || hit(i.names.am) || hit(i.names.om) || hit(i.sku))
    .sort(
      (a, b) =>
        (a.daysLeft ?? Number.POSITIVE_INFINITY) - (b.daysLeft ?? Number.POSITIVE_INFINITY) ||
        a.names.en.localeCompare(b.names.en),
    )
    .slice(0, limit);
}
