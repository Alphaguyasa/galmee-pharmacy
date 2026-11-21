import type { Locale } from "@/i18n/config";
import { formatEthiopianDate } from "@/lib/ethiopian-date";
import { itemName } from "@/lib/format";
import type { ReceiptData } from "@/lib/galmee/receipt";

export type StoredSale = {
  receiptNo: string | null;
  createdAt: string;
  total: number;
  paid: number;
  method: string;
  customerName: string | null;
  lines: { names: { en: string; am: string | null; om: string | null }; unit: string; qty: number; price: number }[];
};

/** Builds the receipt from the sale as stored (prices at the time of sale), in the reader's language. */
export function saleReceiptData(
  sale: StoredSale,
  tenant: { name: string; phone?: string | null },
  locale: Locale,
): ReceiptData {
  const when = new Date(sale.createdAt);
  return {
    tenant: { name: tenant.name, phone: tenant.phone ?? undefined },
    no: sale.receiptNo ?? "",
    kind: "sale",
    lines: sale.lines.map((l) => ({
      name: itemName(l.names, locale),
      qty: l.qty,
      unit: l.unit || undefined,
      price: l.price,
      total: Math.round(l.qty * l.price * 100) / 100,
    })),
    totals: { due: sale.total, paid: sale.paid, method: sale.method },
    customer: sale.customerName ? { name: sale.customerName } : undefined,
    ethDate: formatEthiopianDate(when, locale),
    // Gregorian day in Addis Ababa (UTC+3), matching the Ethiopian date above.
    gregDate: new Date(when.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10),
    lang: locale,
  };
}
