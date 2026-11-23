"use server";

import { revalidatePath } from "next/cache";
import { recordSale, searchSellable, sellableCatalogue, type SaleResult, type SellableItemDTO } from "@/server/dal/sales";
import { getSession } from "@/server/dal/session";
import { saleSchema, sellSearchSchema } from "@/server/validation";

export async function findSellable(query: unknown): Promise<SellableItemDTO[]> {
  const parsed = sellSearchSchema.safeParse(query);
  if (!parsed.success) return [];
  await getSession();
  return searchSellable(parsed.data);
}

/** The sellable list for searching on this phone when the network drops. */
export async function loadSellCatalogue(): Promise<SellableItemDTO[]> {
  await getSession();
  return sellableCatalogue();
}

export async function sell(input: unknown): Promise<SaleResult> {
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "generic" };
  await getSession();
  const result = await recordSale(parsed.data);
  if (result.ok) {
    revalidatePath("/stock");
    revalidatePath("/customers");
    revalidatePath("/");
  }
  return result;
}
