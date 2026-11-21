import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { Receipt } from "@/components/galmee/receipt";
import { PrintReceiptButton } from "@/components/galmee/print-receipt-button";
import { buttonVariants } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { saleReceiptData } from "@/lib/sale-receipt";
import { cn } from "@/lib/utils";
import { getSaleReceipt } from "@/server/dal/receipts";
import { getSession } from "@/server/dal/session";

const RECEIPT_ID = "sale-receipt";

/** The receipt for one sale: shown right after the sale and for any reprint later. */
export default async function SaleReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ w?: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const width = (await searchParams).w === "80" ? 80 : 58;

  const [session, sale, t, locale] = await Promise.all([
    getSession(),
    getSaleReceipt(parsed.data),
    getTranslations("receipt"),
    getLocale() as Promise<Locale>,
  ]);
  if (!sale) notFound();
  const data = saleReceiptData(sale, { name: session.tenant.name }, locale);

  return (
    <div className="grid max-w-md gap-5">
      <h1 className="text-[1.5625rem] leading-tight font-bold">{t("title")}</h1>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("widthLabel")}>
        <span className="text-sm text-muted-foreground">{t("widthLabel")}</span>
        {([58, 80] as const).map((w) => (
          <Link
            key={w}
            href={w === 80 ? `/sales/${sale.saleId}?w=80` : `/sales/${sale.saleId}`}
            replace
            aria-current={w === width ? "true" : undefined}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-semibold",
              w === width ? "border-primary bg-primary text-primary-foreground" : "bg-card",
            )}
          >
            {t(w === 80 ? "width80" : "width58")}
          </Link>
        ))}
      </div>

      <Receipt data={data} width={width} id={RECEIPT_ID} />
      {sale.receiptNo ? null : <p className="text-sm text-muted-foreground">{t("noNumber")}</p>}

      <div className="grid grid-cols-2 gap-2">
        <PrintReceiptButton targetId={RECEIPT_ID} label={t("print")} />
        <Link href="/sell" className={cn(buttonVariants())}>
          {t("newSale")}
        </Link>
      </div>
    </div>
  );
}
