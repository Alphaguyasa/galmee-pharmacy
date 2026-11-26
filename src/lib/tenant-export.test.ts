import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { tenantExportSheets, type TenantExportInput } from "./tenant-export";

const table = (rows: Record<string, unknown>[], truncated = false) => ({ rows, truncated });

/** Looks keys up in the English messages, with {cap}-style values, like next-intl does. */
function t(key: string, values?: Record<string, string | number>): string {
  const found = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en.export);
  if (typeof found !== "string") throw new Error(`missing export.${key}`);
  return found.replace(/\{(\w+)\}/g, (_, k) => String(values?.[k] ?? ""));
}

const data: TenantExportInput = {
  tenantName: "Abebe Pharmacy",
  items: table([
    { id: "i1", sku: "P500", name_en: "Paracetamol 500 mg", name_am: "ፓራሲታሞል 500 mg", name_om: null, unit: "tablet", category: null, price: "2.50", cost: 1.2, reorder_level: 100, tracks_expiry: true, active: true, created_at: "2026-11-01T08:00:00Z" },
  ]),
  batches: table([{ id: "b1", item_id: "i1", batch_no: "A12", qty: 40, cost: 1.2, expiry_date: "2027-01-31", received_at: "2026-11-02T08:00:00Z" }]),
  customers: table([
    { id: "c1", name: "Kebede T.", phone: "0911000000", credit_limit: 500, notes: "=cmd", created_at: "2026-11-01T09:00:00Z" },
    { id: "c2", name: "Almaz G.", phone: null, credit_limit: 0, notes: null, created_at: "2026-11-01T09:05:00Z" },
  ]),
  balances: table([{ customer_id: "c1", balance: 120.456, oldest_debt_at: "2026-11-03T10:00:00Z" }]),
  sales: table([{ id: "s1", created_at: "2026-11-03T10:00:00Z", customer_id: "c1", method: "credit", total: 25, paid: 0, staff_id: "u1", client_ref: "r1" }]),
  saleLines: table([{ id: "l1", sale_id: "s1", item_id: "i1", qty: 3, price: 2.5 }]),
  payments: table([]),
  ledger: table([{ id: "g1", created_at: "2026-11-03T10:00:00Z", customer_id: "c1", type: "debt", amount: 25, due_date: null, note: null }]),
  staff: table([{ user_id: "u1", full_name: "Hana M." }]),
  suppliers: table([{ id: "sp1", name: "Addis Drug Supply", phone: null, active: false, notes: null, created_at: "2026-11-01T07:00:00Z" }]),
  orders: table([{ id: "o1", supplier_id: "sp1", status: "received", expected_date: null, received_at: "2026-11-02T08:00:00Z", notes: null, created_at: "2026-11-01T07:30:00Z" }]),
  orderLines: table([{ id: "ol1", po_id: "o1", item_id: "i1", qty: 40, received_qty: 40, unit_cost: 1.2, batch_no: "A12", expiry_date: "2027-01-31" }]),
  walkouts: table([{ id: "w1", created_at: "2026-11-04T10:00:00Z", label: "Insulin pen", item_id: null, qty: 1 }], true),
  receipts: table([{ sale_id: "s1", receipt_no: "PS-000001" }]),
};

const sheets = tenantExportSheets(data, t, "am", "2026-11-26T12:00:00Z", 50000);
const sheet = (name: string) => sheets.find((s) => s.name === name)!.rows;

describe("tenantExportSheets", () => {
  it("starts with an About sheet, then one sheet per kind of record", () => {
    expect(sheets.map((s) => s.name)).toEqual([
      "About", "Medicines", "Stock batches", "Customers", "Sales", "Sale lines", "Payments", "Credit ledger", "Suppliers", "Purchase orders", "Purchase lines", "Walk-outs",
    ]);
    const about = sheet("About");
    expect(about[1]).toEqual(["Pharmacy", "Abebe Pharmacy"]);
    expect(about).toContainEqual(["Customers", 2, null]);
    expect(about).toContainEqual(["Walk-outs", 1, "Only the first 50000 rows; ask for a full copy"]);
  });

  it("every row has as many cells as its header", () => {
    for (const s of sheets.slice(1)) for (const row of s.rows) expect(row).toHaveLength(s.rows[0].length);
  });

  it("writes prices as numbers and yes/no as words", () => {
    const meds = sheet("Medicines");
    expect(meds[1][7]).toBe(2.5);
    expect(meds[1][10]).toBe("Yes");
    expect(sheet("Suppliers")[1][3]).toBe("No");
  });

  it("puts names beside ids, in the screen language when there is one", () => {
    expect(sheet("Stock batches")[1].slice(1, 3)).toEqual(["ፓራሲታሞል 500 mg", "i1"]);
    expect(sheet("Sales")[1]).toEqual(["s1", "PS-000001", "2026-11-03T10:00:00Z", "Kebede T.", "c1", "credit", 25, 0, "Hana M.", "r1"]);
    expect(sheet("Sale lines")[1]).toEqual(["s1", "ፓራሲታሞል 500 mg", "i1", 3, 2.5, 7.5]);
    expect(sheet("Purchase orders")[1][1]).toBe("Addis Drug Supply");
    expect(sheet("Walk-outs")[1][2]).toBeNull();
  });

  it("gives each customer their balance, 0 when they owe nothing", () => {
    const customers = sheet("Customers");
    expect(customers[1][4]).toBe(120.46);
    expect(customers[2][4]).toBe(0);
    expect(customers[1][6]).toBe("=cmd"); // kept as text; the workbook never writes formulas
  });
});
