import { describe, expect, it } from "vitest";
import { layoutText, renderTelegramText } from "@/lib/galmee/receipt";
import { saleReceiptData, type StoredSale } from "./sale-receipt";

const sale: StoredSale = {
  receiptNo: "PS-000042",
  createdAt: "2026-11-21T22:30:00Z", // 01:30 on 22 Nov in Addis Ababa
  total: 37.5,
  paid: 37.5,
  method: "telebirr",
  customerName: null,
  lines: [
    { names: { en: "Paracetamol 500mg", am: "ፓራሲታሞል 500 ሚግ", om: null }, unit: "strip", qty: 3, price: 7.5 },
    { names: { en: "ORS sachet", am: null, om: null }, unit: "sachet", qty: 1, price: 15 },
  ],
};

describe("saleReceiptData", () => {
  it("uses the stored prices and number, with the Addis Ababa day", () => {
    const d = saleReceiptData(sale, { name: "Test Pharmacy" }, "en");
    expect(d.no).toBe("PS-000042");
    expect(d.lines.map((l) => l.total)).toEqual([22.5, 15]);
    expect(d.totals).toEqual({ due: 37.5, paid: 37.5, method: "telebirr" });
    expect(d.gregDate).toBe("2026-11-22");
    expect(d.customer).toBeUndefined();
  });

  it("names items in the reader's language, falling back to English", () => {
    const d = saleReceiptData(sale, { name: "Test Pharmacy" }, "am");
    expect(d.lines[0].name).toBe("ፓራሲታሞል 500 ሚግ");
    expect(d.lines[1].name).toBe("ORS sachet");
    expect(d.lang).toBe("am");
  });

  it("a credit sale shows the customer and nothing paid", () => {
    const d = saleReceiptData({ ...sale, paid: 0, method: "credit", customerName: "Customer One" }, { name: "T" }, "en");
    expect(d.customer).toEqual({ name: "Customer One" });
    expect(d.totals.paid).toBe(0);
    expect(renderTelegramText(d)).toContain("Customer One");
  });

  it("a sale from before numbering prints without a blank number", () => {
    const d = saleReceiptData({ ...sale, receiptNo: null }, { name: "T" }, "en");
    const text = layoutText(d).join("\n");
    expect(text).not.toContain("Receipt no.");
    expect(text).not.toMatch(/Galmee · $/m);
    expect(layoutText({ ...d, no: "PS-000001" }).join("\n")).toContain("PS-000001");
  });
});
