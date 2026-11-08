import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { Phone } from "lucide-react";
import { RepaymentForm } from "@/components/customers/repayment-form";
import type { Locale } from "@/i18n/config";
import { formatEthiopianDate } from "@/lib/ethiopian-date";
import { formatBirr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getCustomer, getStatement } from "@/server/dal/customers";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const id = parsed.data;

  const [customer, entries, t, locale] = await Promise.all([
    getCustomer(id),
    getStatement(id),
    getTranslations("customers"),
    getLocale() as Promise<Locale>,
  ]);
  if (!customer) notFound();

  return (
    <div className="grid max-w-2xl gap-5">
      <div className="grid gap-1">
        <Link href="/customers" className="-my-3 w-fit py-3 text-sm underline underline-offset-4">
          {t("back")}
        </Link>
        <h1 className="text-2xl font-semibold break-words">{customer.name}</h1>
        {customer.phone ? (
          <a href={`tel:${customer.phone}`} className="num flex min-h-12 w-fit items-center gap-2 underline underline-offset-4">
            <Phone className="size-4" aria-hidden />
            {customer.phone}
          </a>
        ) : null}
      </div>

      <section className={cn("grid gap-1 rounded-md border-2 p-4", customer.balance > 0 ? "border-expiry-red" : "border-primary")}>
        <p className="text-sm">{t("balance")}</p>
        <p className={cn("num text-2xl font-bold", customer.balance > 0 && "text-expiry-red")}>
          {formatBirr(customer.balance, locale)}
        </p>
      </section>

      {customer.balance > 0 ? <RepaymentForm customerId={customer.id} /> : null}

      <section className="grid gap-2">
        <h2 className="font-semibold">{t("statement")}</h2>
        {entries.length === 0 ? (
          <p className="rounded-md border p-5">{t("noEntries")}</p>
        ) : (
          <ul className="divide-y rounded-md border bg-card">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-3 p-3">
                <div className="grid min-w-0 gap-0.5">
                  <p className="font-semibold">{t(entry.type === "debt" ? "debt" : "repayment")}</p>
                  <p className="num text-sm text-muted-foreground">{formatEthiopianDate(entry.createdAt, locale)}</p>
                </div>
                <div className="grid shrink-0 justify-items-end gap-0.5">
                  <p className={cn("num font-bold", entry.type === "debt" ? "text-expiry-red" : "text-primary")}>
                    {entry.type === "debt" ? "+" : "-"}
                    {formatBirr(entry.amount, locale)}
                  </p>
                  <p className="num text-sm text-muted-foreground">
                    {t("balanceAfter", { amount: formatBirr(entry.balanceAfter, locale) })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
