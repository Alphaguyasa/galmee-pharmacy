import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { HandCoins, Search, UserPlus } from "lucide-react";
import { EmptyState } from "@/components/galmee/empty-state";
import { ListRow, ListSheet } from "@/components/galmee/list-row";
import { MoneySummaryCard } from "@/components/galmee/money-summary-card";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { daysBetween } from "@/lib/ethiopian-date";
import { formatBirr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CUSTOMER_PAGE_LIMIT, getCreditTotals, listCustomers } from "@/server/dal/customers";

const searchSchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  filter: z.enum(["all", "owing"]).catch("all"),
});

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, unknown>> }) {
  const { q, filter } = searchSchema.parse({ filter: "all", ...(await searchParams) });
  const [rows, totals, t, locale] = await Promise.all([
    listCustomers({ q: q || undefined, owing: filter === "owing" }),
    getCreditTotals(),
    getTranslations("customers"),
    getLocale() as Promise<Locale>,
  ]);
  const nothingAtAll = rows.length === 0 && !q && filter === "all";
  const href = (next: "all" | "owing") => {
    const params = new URLSearchParams();
    if (next === "owing") params.set("filter", "owing");
    if (q) params.set("q", q);
    const query = params.toString();
    return query ? `/customers?${query}` : "/customers";
  };

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[1.5625rem] leading-tight font-bold">{t("title")}</h1>
        <Link href="/customers/new" className={cn(buttonVariants({ size: "lg" }))}>
          <UserPlus className="size-5" aria-hidden />
          {t("add")}
        </Link>
      </div>

      <MoneySummaryCard
        tone={totals.totalOwed > 0 ? "owed" : "band"}
        label={t("totalOwed")}
        figure={formatBirr(totals.totalOwed, locale)}
        sub={t("owingCount", { count: totals.customersOwing })}
      />

      <form action="/customers" className="flex gap-2" role="search">
        {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
        <label htmlFor="customer-search" className="sr-only">
          {t("searchLabel")}
        </label>
        <Input
          id="customer-search"
          name="q"
          type="search"
          defaultValue={q}
          maxLength={80}
          placeholder={t("searchPlaceholder")}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          aria-label={t("searchLabel")}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "shrink-0")}
        >
          <Search className="size-5" aria-hidden />
        </button>
      </form>

      <nav aria-label={t("filterLabel")} className="flex gap-1">
        {(["all", "owing"] as const).map((key) => (
          <Link
            key={key}
            href={href(key)}
            aria-current={key === filter ? "page" : undefined}
            className={cn(
              "flex h-12 items-center rounded-md border px-3 text-sm",
              key === filter ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card",
            )}
          >
            {t(`filters.${key}`)}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          message={nothingAtAll ? t("empty") : t("noResults")}
          action={
            nothingAtAll ? (
              <Link href="/customers/new" className={cn(buttonVariants({ size: "lg" }))}>
                {t("add")}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ListSheet>
          {rows.map((row) => (
            <ListRow
              key={row.id}
              href={`/customers/${row.id}`}
              title={row.name}
              className="items-center"
              sub={
                <>
                  {row.phone ? <span className="num">{row.phone}</span> : null}
                  {row.balance > 0 && row.oldestDebtAt ? (
                    <span className="num">{t("owingFor", { days: Math.max(0, -daysBetween(row.oldestDebtAt)) })}</span>
                  ) : null}
                </>
              }
              right={
                <span className={cn("num font-bold", row.balance > 0 ? "text-owed" : "text-muted-foreground")}>
                  {formatBirr(row.balance, locale)}
                </span>
              }
            />
          ))}
        </ListSheet>
      )}
      {rows.length === CUSTOMER_PAGE_LIMIT ? (
        <p className="num text-sm text-muted-foreground">{t("capped", { count: CUSTOMER_PAGE_LIMIT })}</p>
      ) : null}
    </div>
  );
}
