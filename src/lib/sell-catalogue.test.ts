import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { SellableItemDTO } from "@/server/dal/sales";
import { loadCatalogue, saveCatalogue, searchCatalogue } from "./sell-catalogue";

const item = (en: string, extra: Partial<SellableItemDTO> = {}): SellableItemDTO => ({
  itemId: en,
  names: { en, am: null, om: null },
  sku: null,
  unit: "tablet",
  price: 5,
  qtyOnHand: 10,
  daysLeft: 200,
  ...extra,
});

const list = [
  item("Paracetamol 500mg", { names: { en: "Paracetamol 500mg", am: "ፓራሲታሞል", om: null }, sku: "6291100123", daysLeft: 40 }),
  item("Amoxicillin 250mg", { daysLeft: 10 }),
  item("ORS sachet", { daysLeft: null }),
  item("Paracetamol syrup", { daysLeft: 40 }),
];

describe("searchCatalogue", () => {
  it("finds words anywhere in any name or the code, ignoring case", () => {
    expect(searchCatalogue(list, "PARA").map((i) => i.itemId)).toEqual(["Paracetamol 500mg", "Paracetamol syrup"]);
    expect(searchCatalogue(list, "ፓራ").map((i) => i.itemId)).toEqual(["Paracetamol 500mg"]);
    expect(searchCatalogue(list, "0012").map((i) => i.itemId)).toEqual(["Paracetamol 500mg"]);
    expect(searchCatalogue(list, "  ors ").map((i) => i.itemId)).toEqual(["ORS sachet"]);
  });

  it("orders like the server: soonest expiry first, no expiry last, then by name", () => {
    expect(searchCatalogue(list, "a").map((i) => i.itemId)).toEqual([
      "Amoxicillin 250mg",
      "Paracetamol 500mg",
      "Paracetamol syrup",
      "ORS sachet",
    ]);
  });

  it("returns nothing for an empty query and respects the limit", () => {
    expect(searchCatalogue(list, " ")).toEqual([]);
    expect(searchCatalogue(list, "a", 2)).toHaveLength(2);
  });
});

describe("saved catalogue", () => {
  it("survives on the phone with the time it was taken", async () => {
    expect(await loadCatalogue()).toBeNull();
    await saveCatalogue(list, 1_700_000_000_000);
    const saved = await loadCatalogue();
    expect(saved?.savedAt).toBe(1_700_000_000_000);
    expect(saved?.items).toHaveLength(4);
  });
});
