import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "./session";

export type SaleReceiptDTO = {
  saleId: string;
  /** Issued by the database with the sale; null for sales recorded before numbering started. */
  receiptNo: string | null;
  createdAt: string;
  total: number;
  paid: number;
  /** Payment method code; "credit" when nothing was paid at the till. */
  method: string;
  customerName: string | null;
  lines: { names: { en: string; am: string | null; om: string | null }; unit: string; qty: number; price: number }[];
};

/**
 * One sale as it was recorded: stored line prices, never today's prices, so a reprint
 * always matches the first print. Row-level security keeps it inside the caller's business.
 */
export async function getSaleReceipt(saleId: string): Promise<SaleReceiptDTO | null> {
  await getSession();
  const supabase = await createClient();
  const [sale, receipt] = await Promise.all([
    supabase
      .from("sales")
      .select("id, total, paid, method, created_at, customers(name), sale_lines(qty, price, items(name_en, name_am, name_om, unit))")
      .eq("id", saleId)
      .maybeSingle(),
    supabase.from("ph_sale_receipts").select("receipt_no").eq("sale_id", saleId).maybeSingle(),
  ]);
  if (sale.error) throw new Error("sale_receipt_failed");
  if (!sale.data) return null;
  const s = sale.data;
  const total = Number(s.total);
  const paid = Number(s.paid);
  return {
    saleId: s.id,
    // A missing number (older sale, or numbering not switched on yet) prints without one.
    receiptNo: receipt.error ? null : (receipt.data?.receipt_no ?? null),
    createdAt: s.created_at,
    total,
    paid,
    method: paid < total && s.customers ? "credit" : String(s.method),
    customerName: s.customers?.name ?? null,
    lines: s.sale_lines.map((l) => ({
      names: { en: l.items?.name_en ?? "", am: l.items?.name_am ?? null, om: l.items?.name_om ?? null },
      unit: l.items?.unit ?? "",
      qty: Number(l.qty),
      price: Number(l.price),
    })),
  };
}
