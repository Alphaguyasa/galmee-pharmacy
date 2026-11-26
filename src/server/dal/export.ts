import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "./session";

/** Rows read per request (the API returns at most 1000) and the most read from one table. */
const PAGE = 1000;
export const EXPORT_ROW_CAP = 50_000;

type Table =
  | "items"
  | "stock_batches"
  | "customers"
  | "customer_balances"
  | "sales"
  | "sale_lines"
  | "payments"
  | "credit_ledger"
  | "profiles"
  | "ph_suppliers"
  | "ph_purchase_orders"
  | "ph_purchase_lines"
  | "ph_walkouts"
  | "ph_sale_receipts";

type Query = {
  order(column: string): Query;
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};

export type ExportTable = { rows: Record<string, unknown>[]; truncated: boolean };

export type TenantExportDTO = {
  tenantName: string;
  items: ExportTable;
  batches: ExportTable;
  customers: ExportTable;
  balances: ExportTable;
  sales: ExportTable;
  saleLines: ExportTable;
  payments: ExportTable;
  ledger: ExportTable;
  staff: ExportTable;
  suppliers: ExportTable;
  orders: ExportTable;
  orderLines: ExportTable;
  walkouts: ExportTable;
  receipts: ExportTable;
};

export type ExportResult = { ok: true; data: TenantExportDTO } | { ok: false; code: "forbidden" | "generic" };

/**
 * Everything this pharmacy has in Galmee, for the owner to keep or take elsewhere.
 * Row-level security limits every read to the caller's own business; the owner check is
 * here because the file holds every customer's phone and balance.
 */
export async function exportTenantData(): Promise<ExportResult> {
  const session = await getSession();
  if (session.profile.role !== "owner") return { ok: false, code: "forbidden" };
  // Read-only, column lists fixed in this file; a loose builder type covers tables and views alike.
  const db = (await createClient()) as unknown as { from(table: Table): { select(columns: string): Query } };

  async function readAll(table: Table, columns: string, order: string): Promise<ExportTable> {
    // A unique last sort key keeps pages from repeating or skipping rows.
    const keys = order === "id" || !columns.split(", ").includes("id") ? [order] : [order, "id"];
    const sorted = (q: Query) => keys.reduce((acc, k) => acc.order(k), q);
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; from < EXPORT_ROW_CAP; from += PAGE) {
      const to = Math.min(from + PAGE, EXPORT_ROW_CAP) - 1;
      const { data, error } = await sorted(db.from(table).select(columns)).range(from, to);
      if (error) throw new Error(`export_${table}`);
      const page = (data ?? []) as unknown as Record<string, unknown>[];
      rows.push(...page);
      if (page.length < to - from + 1) return { rows, truncated: false };
    }
    // Exactly at the cap: one more read tells whether anything was left out.
    const { data } = await sorted(db.from(table).select(order)).range(EXPORT_ROW_CAP, EXPORT_ROW_CAP);
    return { rows, truncated: (data ?? []).length > 0 };
  }

  try {
    const [items, batches, customers, balances, sales, saleLines, payments, ledger, staff, suppliers, orders, orderLines, walkouts, receipts] =
      await Promise.all([
        readAll("items", "id, sku, name_en, name_am, name_om, unit, category, price, cost, reorder_level, tracks_expiry, active, created_at", "created_at"),
        readAll("stock_batches", "id, item_id, batch_no, qty, cost, expiry_date, received_at", "received_at"),
        readAll("customers", "id, name, phone, credit_limit, notes, created_at", "created_at"),
        readAll("customer_balances", "customer_id, balance, oldest_debt_at", "customer_id"),
        readAll("sales", "id, created_at, customer_id, method, total, paid, staff_id, client_ref", "created_at"),
        readAll("sale_lines", "id, sale_id, item_id, qty, price", "id"),
        readAll("payments", "id, created_at, customer_id, amount, method, reference, ref_table, ref_id", "created_at"),
        readAll("credit_ledger", "id, created_at, customer_id, type, amount, due_date, note", "created_at"),
        readAll("profiles", "user_id, full_name", "user_id"),
        readAll("ph_suppliers", "id, name, phone, active, notes, created_at", "created_at"),
        readAll("ph_purchase_orders", "id, supplier_id, status, expected_date, received_at, notes, created_at", "created_at"),
        readAll("ph_purchase_lines", "id, po_id, item_id, qty, received_qty, unit_cost, batch_no, expiry_date", "created_at"),
        readAll("ph_walkouts", "id, created_at, label, item_id, qty", "created_at"),
        readAll("ph_sale_receipts", "sale_id, receipt_no", "sale_id"),
      ]);
    return {
      ok: true,
      data: {
        tenantName: session.tenant.name,
        items,
        batches,
        customers,
        balances,
        sales,
        saleLines,
        payments,
        ledger,
        staff,
        suppliers,
        orders,
        orderLines,
        walkouts,
        receipts,
      },
    };
  } catch {
    return { ok: false, code: "generic" };
  }
}
