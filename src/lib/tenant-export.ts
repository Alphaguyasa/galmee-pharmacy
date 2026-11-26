import type { Locale } from "@/i18n/config";
import { itemName } from "@/lib/format";
import type { XlsxCell, XlsxSheet } from "@/lib/xlsx";

type Row = Record<string, unknown>;
type Table = { rows: Row[]; truncated: boolean };

export type TenantExportInput = {
  tenantName: string;
  items: Table;
  batches: Table;
  customers: Table;
  balances: Table;
  sales: Table;
  saleLines: Table;
  payments: Table;
  ledger: Table;
  staff: Table;
  suppliers: Table;
  orders: Table;
  orderLines: Table;
  walkouts: Table;
  receipts: Table;
};

/** Translator for keys under `export` (sheet.*, col.*, about.*, yes, no). */
export type ExportT = (key: string, values?: Record<string, string | number>) => string;

const text = (v: unknown): XlsxCell => (v === null || v === undefined ? null : String(v));
const num = (v: unknown): XlsxCell => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const money = (v: unknown): XlsxCell => {
  const n = num(v);
  return typeof n === "number" ? Math.round(n * 100) / 100 : null;
};

function index(rows: Row[], key: string): Map<string, Row> {
  return new Map(rows.map((r) => [String(r[key]), r]));
}

/**
 * The owner's full export as workbook sheets: one sheet per kind of record, names looked up
 * so the file reads without the app (medicine and customer names beside their ids), and an
 * "About" sheet first that says when it was made and whether any sheet hit the row cap.
 */
export function tenantExportSheets(data: TenantExportInput, t: ExportT, locale: Locale, exportedAt: string, rowCap: number): XlsxSheet[] {
  const yesNo = (v: unknown): XlsxCell => (v === null || v === undefined ? null : v ? t("yes") : t("no"));
  const items = index(data.items.rows, "id");
  const customers = index(data.customers.rows, "id");
  const balances = index(data.balances.rows, "customer_id");
  const staff = index(data.staff.rows, "user_id");
  const suppliers = index(data.suppliers.rows, "id");
  const receipts = index(data.receipts.rows, "sale_id");

  const medicine = (id: unknown): XlsxCell => {
    const item = id === null || id === undefined ? undefined : items.get(String(id));
    if (!item) return null;
    return itemName({ en: String(item.name_en ?? ""), am: (item.name_am as string | null) ?? null, om: (item.name_om as string | null) ?? null }, locale);
  };
  const customer = (id: unknown): XlsxCell => (id ? text(customers.get(String(id))?.name) : null);
  const head = (...keys: string[]) => keys.map((k) => t(`col.${k}`));

  const sheets: { key: string; table: Table; rows: XlsxCell[][] }[] = [
    {
      key: "medicines",
      table: data.items,
      rows: [
        head("id", "sku", "nameEn", "nameAm", "nameOm", "unit", "category", "price", "cost", "reorderLevel", "tracksExpiry", "active", "created"),
        ...data.items.rows.map((r) => [
          text(r.id), text(r.sku), text(r.name_en), text(r.name_am), text(r.name_om), text(r.unit), text(r.category),
          money(r.price), money(r.cost), num(r.reorder_level), yesNo(r.tracks_expiry), yesNo(r.active), text(r.created_at),
        ]),
      ],
    },
    {
      key: "batches",
      table: data.batches,
      rows: [
        head("id", "medicine", "itemId", "batchNo", "qty", "cost", "expiry", "received"),
        ...data.batches.rows.map((r) => [
          text(r.id), medicine(r.item_id), text(r.item_id), text(r.batch_no), num(r.qty), money(r.cost), text(r.expiry_date), text(r.received_at),
        ]),
      ],
    },
    {
      key: "customers",
      table: data.customers,
      rows: [
        head("id", "name", "phone", "creditLimit", "balance", "oldestDebt", "notes", "created"),
        ...data.customers.rows.map((r) => {
          const b = balances.get(String(r.id));
          return [
            text(r.id), text(r.name), text(r.phone), money(r.credit_limit), money(b?.balance ?? 0), text(b?.oldest_debt_at), text(r.notes), text(r.created_at),
          ];
        }),
      ],
    },
    {
      key: "sales",
      table: data.sales,
      rows: [
        head("id", "receiptNo", "created", "customer", "customerId", "method", "total", "paid", "seller", "clientRef"),
        ...data.sales.rows.map((r) => [
          text(r.id), text(receipts.get(String(r.id))?.receipt_no), text(r.created_at), customer(r.customer_id), text(r.customer_id),
          text(r.method), money(r.total), money(r.paid), text(staff.get(String(r.staff_id))?.full_name), text(r.client_ref),
        ]),
      ],
    },
    {
      key: "saleLines",
      table: data.saleLines,
      rows: [
        head("saleId", "medicine", "itemId", "qty", "price", "lineTotal"),
        ...data.saleLines.rows.map((r) => {
          const qty = num(r.qty);
          const price = money(r.price);
          const total = typeof qty === "number" && typeof price === "number" ? Math.round(qty * price * 100) / 100 : null;
          return [text(r.sale_id), medicine(r.item_id), text(r.item_id), qty, price, total];
        }),
      ],
    },
    {
      key: "payments",
      table: data.payments,
      rows: [
        head("id", "created", "customer", "customerId", "amount", "method", "reference", "refTable", "refId"),
        ...data.payments.rows.map((r) => [
          text(r.id), text(r.created_at), customer(r.customer_id), text(r.customer_id), money(r.amount), text(r.method), text(r.reference), text(r.ref_table), text(r.ref_id),
        ]),
      ],
    },
    {
      key: "ledger",
      table: data.ledger,
      rows: [
        head("id", "created", "customer", "customerId", "type", "amount", "due", "notes"),
        ...data.ledger.rows.map((r) => [
          text(r.id), text(r.created_at), customer(r.customer_id), text(r.customer_id), text(r.type), money(r.amount), text(r.due_date), text(r.note),
        ]),
      ],
    },
    {
      key: "suppliers",
      table: data.suppliers,
      rows: [
        head("id", "name", "phone", "active", "notes", "created"),
        ...data.suppliers.rows.map((r) => [text(r.id), text(r.name), text(r.phone), yesNo(r.active), text(r.notes), text(r.created_at)]),
      ],
    },
    {
      key: "orders",
      table: data.orders,
      rows: [
        head("id", "supplier", "supplierId", "status", "expected", "received", "notes", "created"),
        ...data.orders.rows.map((r) => [
          text(r.id), text(suppliers.get(String(r.supplier_id))?.name), text(r.supplier_id), text(r.status), text(r.expected_date), text(r.received_at), text(r.notes), text(r.created_at),
        ]),
      ],
    },
    {
      key: "orderLines",
      table: data.orderLines,
      rows: [
        head("orderId", "medicine", "itemId", "qty", "receivedQty", "cost", "batchNo", "expiry"),
        ...data.orderLines.rows.map((r) => [
          text(r.po_id), medicine(r.item_id), text(r.item_id), num(r.qty), num(r.received_qty), money(r.unit_cost), text(r.batch_no), text(r.expiry_date),
        ]),
      ],
    },
    {
      key: "walkouts",
      table: data.walkouts,
      rows: [
        head("created", "asked", "medicine", "itemId", "qty"),
        ...data.walkouts.rows.map((r) => [text(r.created_at), text(r.label), medicine(r.item_id), text(r.item_id), num(r.qty)]),
      ],
    },
  ];

  const about: XlsxCell[][] = [
    [t("about.field"), t("about.value")],
    [t("about.business"), data.tenantName],
    [t("about.exportedAt"), exportedAt],
    [t("about.dates"), t("about.datesNote")],
    [],
    [t("about.sheet"), t("about.rows")],
    ...sheets.map((s) => [t(`sheet.${s.key}`), s.rows.length - 1, s.table.truncated ? t("about.truncated", { cap: rowCap }) : null]),
  ];

  return [{ name: t("sheet.about"), rows: about }, ...sheets.map((s) => ({ name: t(`sheet.${s.key}`), rows: s.rows }))];
}
