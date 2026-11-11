import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { PackagePlus, Search } from "lucide-react";
import { MoneySummaryCard } from "@/components/galmee/money-summary-card";
import { EmptyState } from "@/components/galmee/empty-state";
import { ExpiryLabel } from "@/components/stock/expiry-label";
import { WriteOffButton } from "@/components/stock/write-off-button";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { formatBirr, formatQty, itemName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getSession } from "@/server/dal/session";
import { getExpiryTotals, listStock, STOCK_FILTERS, STOCK_PAGE_LIMIT, type StockFilter } from "@/server/dal/stock";

const searchSchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  filter: z.enum(STOCK_FILTERS).catch("all"),
});

function filterHref(filter: StockFilter, q?: string) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/stock?${query}` : "/stock";
}

export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, unknown>> }) {
  const { q, filter } = searchSchema.parse({ filter: "all", ...(await searchParams) });
  const [{ profile }, rows, totals, t, locale] = await Promise.all([
    getSession(),
    listStock({ q: q || undefined, filter }),
    getExpiryTotals(),
    getTranslations("stock"),
    getLocale() as Promise<Locale>,
  ]);
  const canReceive = profile.role === "owner" || profile.role === "manager";
  const unitLabel = (unit: string) => (t.has(`units.${unit}`) ? t(`units.${unit}`) : unit);
  const nothingAtAll = rows.length === 0 && !q && filter === "all";

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[1.5625rem] leading-tight font-bold">{t("title")}</h1>
        {canReceive ? (
          <div className="flex flex-wrap gap-2">
            <Link href="/stock/new" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              {t("newItem")}
            </Link>
            <Link href="/stock/receive" className={cn(buttonVariants({ size: "lg" }))}>
              <PackagePlus className="size-5" aria-hidden />
              {t("receive")}
            </Link>
          </div>
        ) : null}
      </div>

      <section aria-label={t("moneyHeading")} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MoneySummaryCard
          className="col-span-2 sm:col-span-1"
          tone="owed"
          label={t("value30")}
          figure={formatBirr(totals.value30, locale)}
          sub={t("itemsCount", { count: totals.items30 })}
        />
        <MoneySummaryCard
          tone="warn"
          size="md"
          label={t("value3089")}
          figure={formatBirr(totals.value3089, locale)}
          sub={t("itemsCount", { count: totals.items3089 })}
        />
        <MoneySummaryCard
          size="md"
          label={t("valueExpired")}
          figure={formatBirr(totals.valueExpired, locale)}
          sub={t("itemsCount", { count: totals.itemsExpired })}
        />
      </section>

      <form action="/stock" className="flex gap-2" role="search">
        {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
        <label htmlFor="stock-search" className="sr-only">
          {t("searchLabel")}
        </label>
        <Input
          id="stock-search"
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
          aria-label={t("searchButton")}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "shrink-0")}
        >
          <Search className="size-5" aria-hidden />
        </button>
      </form>

      <nav aria-label={t("filterLabel")} className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {STOCK_FILTERS.map((key) => (
          <Link
            key={key}
            href={filterHref(key, q)}
            aria-current={key === filter ? "page" : undefined}
            className={cn(
              "flex h-12 shrink-0 items-center rounded-md border px-3 text-sm whitespace-nowrap",
              key === filter ? "border-primary bg-primary font-semibold text-primary-foreground" : "bg-card",
            )}
          >
            {t(`filters.${key}`)}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          icon={PackagePlus}
          message={nothingAtAll ? t("empty") : t("noResults")}
          action={
            nothingAtAll && canReceive ? (
              <Link href="/stock/receive" className={cn(buttonVariants({ size: "lg" }))}>
                {t("receive")}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {rows.map((row) => {
            const low = row.qtyOnHand < row.reorderLevel;
            const out = row.qtyOnHand <= 0;
            return (
              <li
                key={row.itemId}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 p-3 md:grid-cols-[minmax(0,1fr)_8rem_9rem_12rem] md:items-center"
              >
                <div className="grid min-w-0 gap-0.5">
                  <p className="font-semibold break-words">{itemName(row.names, locale)}</p>
                  <p className="num text-sm text-muted-foreground md:hidden">
                    {t("qty", { qty: formatQty(row.qtyOnHand), unit: unitLabel(row.unit) })}
                  </p>
                  {out ? (
                    <p className="text-sm font-semibold text-expiry-red">{t("outOfStock")}</p>
                  ) : low ? (
                    <p className="num text-sm font-semibold text-expiry-amber">
                      {t("lowBadge", { level: formatQty(row.reorderLevel) })}
                    </p>
                  ) : null}
                  {canReceive && row.daysLeft !== null && row.daysLeft < 0 ? (
                    <WriteOffButton itemId={row.itemId} name={itemName(row.names, locale)} />
                  ) : null}
                </div>
                <p className="num hidden text-right md:block">
                  {t("qty", { qty: formatQty(row.qtyOnHand), unit: unitLabel(row.unit) })}
                </p>
                <p className="num col-start-1 text-sm text-muted-foreground md:col-start-auto md:text-right md:text-base md:text-foreground">
                  <span className="md:sr-only">{t("valueAtCost")}: </span>
                  {formatBirr(row.stockValue, locale)}
                </p>
                <div className="col-start-2 row-span-2 row-start-1 justify-self-end md:col-start-auto md:row-span-1 md:row-start-auto">
                  {row.batchCount > 0 ? <ExpiryLabel date={row.nextExpiry} daysLeft={row.daysLeft} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length === STOCK_PAGE_LIMIT ? (
        <p className="num text-sm text-muted-foreground">{t("capped", { count: STOCK_PAGE_LIMIT })}</p>
      ) : null}
    </div>
  );
}
