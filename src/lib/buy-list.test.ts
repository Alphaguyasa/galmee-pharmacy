import { describe, expect, it } from "vitest";
import { BUY_LIST_LIMITS, buildBuyList, soldByItem, topSoldItemIds } from "./buy-list";

const n = (en: string) => ({ en, am: null, om: null });

const empty = { walkouts: [], sold: [], stock: [], expiring: [] };

describe("buildBuyList", () => {
  it("puts the week's top walk-out item first with its ask count", () => {
    const list = buildBuyList({
      ...empty,
      walkouts: [
        { itemId: "a", names: n("Amoxicillin 500mg"), asks: 3, qtyAsked: 5, qtyOnHand: 0 },
        { itemId: null, names: n("Insulin pen"), asks: 7, qtyAsked: 7, qtyOnHand: null },
        { itemId: "b", names: n("ORS"), asks: 0, qtyAsked: 0, qtyOnHand: 0 },
      ],
    });
    expect(list.walkouts[0]).toMatchObject({ rank: 1, asks: 7, names: { en: "Insulin pen" } });
    expect(list.walkouts[1]).toMatchObject({ rank: 2, asks: 3, itemId: "a" });
    expect(list.walkouts).toHaveLength(2);
  });

  it("lists fast movers that will not last another week, most sold first", () => {
    const list = buildBuyList({
      ...empty,
      sold: [
        { itemId: "p", qty: 30 },
        { itemId: "p", qty: 10 },
        { itemId: "q", qty: 5 },
        { itemId: "r", qty: 2 },
        { itemId: "s", qty: 50 },
      ],
      stock: [
        { itemId: "p", names: n("Paracetamol"), qtyOnHand: 35, reorderLevel: 20 }, // under a week of sales
        { itemId: "q", names: n("Cough syrup"), qtyOnHand: 8, reorderLevel: 10 }, // under reorder level
        { itemId: "r", names: n("Vitamin C"), qtyOnHand: 100, reorderLevel: 10 }, // plenty left
        { itemId: "t", names: n("Not sold"), qtyOnHand: 0, reorderLevel: 10 }, // no sales this week
        { itemId: "s", names: n("Gloves"), qtyOnHand: 0, reorderLevel: 5 },
      ],
    });
    expect(list.fastMovers.map((f) => [f.itemId, f.soldWeek])).toEqual([
      ["s", 50],
      ["p", 40],
      ["q", 5],
    ]);
  });

  it("does not print an item twice when it is already a walk-out", () => {
    const list = buildBuyList({
      ...empty,
      walkouts: [{ itemId: "p", names: n("Paracetamol"), asks: 2, qtyAsked: 2, qtyOnHand: 0 }],
      sold: [{ itemId: "p", qty: 12 }],
      stock: [{ itemId: "p", names: n("Paracetamol"), qtyOnHand: 0, reorderLevel: 10 }],
    });
    expect(list.walkouts).toHaveLength(1);
    expect(list.fastMovers).toHaveLength(0);
  });

  it("keeps the expiry board to stock under 90 days, soonest first, with screen colours", () => {
    const list = buildBuyList({
      ...empty,
      expiring: [
        { itemId: "a", names: n("A"), qtyOnHand: 4, daysLeft: 60, nextExpiry: "2027-01-26" },
        { itemId: "b", names: n("B"), qtyOnHand: 2, daysLeft: -3, nextExpiry: "2026-11-24" },
        { itemId: "c", names: n("C"), qtyOnHand: 9, daysLeft: 10, nextExpiry: "2026-12-07" },
        { itemId: "d", names: n("D"), qtyOnHand: 9, daysLeft: 120, nextExpiry: "2027-03-27" },
        { itemId: "e", names: n("E"), qtyOnHand: 0, daysLeft: 5, nextExpiry: "2026-12-02" },
        { itemId: "f", names: n("F"), qtyOnHand: 3, daysLeft: null, nextExpiry: null },
      ],
    });
    expect(list.expiring.map((e) => [e.itemId, e.tone])).toEqual([
      ["b", "expired"],
      ["c", "red"],
      ["a", "amber"],
    ]);
  });

  it("caps each section so the page stays one page", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      itemId: `i${i}`,
      names: n(`Item ${i}`),
      asks: 40 - i,
      qtyAsked: 1,
      qtyOnHand: 0,
    }));
    expect(buildBuyList({ ...empty, walkouts: many }).walkouts).toHaveLength(BUY_LIST_LIMITS.walkouts);
  });
});

describe("sold quantities", () => {
  it("adds lines per item and ignores bad quantities", () => {
    const sold = soldByItem([
      { itemId: "a", qty: 2 },
      { itemId: "a", qty: 3 },
      { itemId: "b", qty: -1 },
      { itemId: "c", qty: Number.NaN },
    ]);
    expect([...sold.entries()]).toEqual([["a", 5]]);
  });

  it("ranks top sold ids, most first", () => {
    expect(
      topSoldItemIds(
        [
          { itemId: "a", qty: 1 },
          { itemId: "b", qty: 9 },
          { itemId: "c", qty: 4 },
        ],
        2,
      ),
    ).toEqual(["b", "c"]);
  });
});
