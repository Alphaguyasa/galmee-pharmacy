import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { Phone } from "lucide-react";
import { ListRow, ListSheet } from "@/components/galmee/list-row";
import { MoneySummaryCard } from "@/components/galmee/money-summary-card";
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
        <h1 className="text-[1.5625rem] leading-tight font-bold break-words">{customer.name}</h1>
        {customer.phone ? (
          <a href={`tel:${customer.phone}`} className="num flex min-h-12 w-fit items-center gap-2 underline underline-offset-4">
            <Phone className="size-4" aria-hidden />
            {customer.phone}
          </a>
        ) : null}
      </div>

      <MoneySummaryCard
        tone={customer.balance > 0 ? "owed" : "in"}
        label={t("balance")}
        figure={formatBirr(customer.balance, locale)}
      />

      {customer.balance > 0 ? <RepaymentForm customerId={customer.id} /> : null}

      <section className="grid gap-2">
        <h2 className="font-semibold">{t("statement")}</h2>
        {entries.length === 0 ? (
          <p className="rounded-md border border-dashed p-5 text-center">{t("noEntries")}</p>
        ) : (
          <ListSheet>
            {entries.map((entry) => (
              <ListRow
                key={entry.id}
                title={t(entry.type === "debt" ? "debt" : "repayment")}
                sub={<span className="num">{formatEthiopianDate(entry.createdAt, locale)}</span>}
                right={
                  <>
                    <span className={cn("num font-bold", entry.type === "debt" ? "text-owed" : "text-money-in")}>
                      {entry.type === "debt" ? "+" : "-"}
                      {formatBirr(entry.amount, locale)}
                    </span>
                    <span className="num text-sm text-muted-foreground">
                      {t("balanceAfter", { amount: formatBirr(entry.balanceAfter, locale) })}
                    </span>
                  </>
                }
              />
            ))}
          </ListSheet>
        )}
      </section>
    </div>
  );
}
