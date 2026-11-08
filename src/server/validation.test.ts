import { describe, expect, it } from "vitest";
import { customerSchema, deliverySchema, itemSchema, repaymentSchema, supplierSchema } from "./validation";

const id = "7f3c2b1a-4d5e-4f6a-8b9c-0d1e2f3a4b5c";
const line = { itemId: id, qty: 10, unitCost: 5.5, batchNo: "A1", expiryDate: "2028-01-31" };

describe("deliverySchema", () => {
  it("accepts a valid delivery", () => {
    expect(deliverySchema.safeParse({ supplierId: id, clientRef: id, lines: [line] }).success).toBe(true);
  });
  it.each([
    ["no lines", { supplierId: id, clientRef: id, lines: [] }],
    ["zero quantity", { supplierId: id, clientRef: id, lines: [{ ...line, qty: 0 }] }],
    ["negative cost", { supplierId: id, clientRef: id, lines: [{ ...line, unitCost: -1 }] }],
    ["bad date", { supplierId: id, clientRef: id, lines: [{ ...line, expiryDate: "31/01/2028" }] }],
    ["bad supplier id", { supplierId: "1", clientRef: id, lines: [line] }],
  ])("rejects %s", (_name, value) => expect(deliverySchema.safeParse(value).success).toBe(false));
});

describe("supplierSchema", () => {
  it("trims the name", () => expect(supplierSchema.parse({ name: "  Abay Drugs " }).name).toBe("Abay Drugs"));
  it("rejects a blank name", () => expect(supplierSchema.safeParse({ name: "   " }).success).toBe(false));
});

describe("itemSchema", () => {
  const valid = { nameEn: "ORS sachet", nameAm: "", nameOm: "", sku: "", unit: "sachet", price: "10", cost: "6", reorderLevel: "15", tracksExpiry: true };
  it("reads numbers from form text and blanks as missing", () => {
    const item = itemSchema.parse(valid);
    expect(item.price).toBe(10);
    expect(item.nameAm).toBeUndefined();
    expect(item.sku).toBeUndefined();
  });
  it("rejects a negative price", () => expect(itemSchema.safeParse({ ...valid, price: "-1" }).success).toBe(false));
  it("rejects an unknown unit", () => expect(itemSchema.safeParse({ ...valid, unit: "crate" }).success).toBe(false));
});

describe("customerSchema", () => {
  it("treats a blank phone as missing", () => {
    expect(customerSchema.parse({ name: "Sara", phone: "" }).phone).toBeUndefined();
  });
  it("normalises an Ethiopian phone", () => {
    expect(customerSchema.parse({ name: "Sara", phone: "0911 234 567" }).phone).toBe("0911234567");
  });
  it("rejects a bad phone", () => expect(customerSchema.safeParse({ name: "Sara", phone: "123" }).success).toBe(false));
});

describe("repaymentSchema", () => {
  const valid = { customerId: id, amount: 50, method: "telebirr", clientRef: id };
  it("accepts a valid repayment", () => expect(repaymentSchema.safeParse(valid).success).toBe(true));
  it("rejects a zero amount", () => expect(repaymentSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false));
  it("rejects an unknown method", () => expect(repaymentSchema.safeParse({ ...valid, method: "gold" }).success).toBe(false));
});
