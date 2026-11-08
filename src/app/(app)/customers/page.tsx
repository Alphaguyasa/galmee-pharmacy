import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { Search, UserPlus } from "lucide-react";
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
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Link href="/customers/new" className={cn(buttonVariants({ size: "lg" }))}>
          <UserPlus className="size-5" aria-hidden />
          {t("add")}
        </Link>
      </div>

      <section className="grid gap-1 rounded-md border-2 border-primary p-4">
        <p className="text-sm">{t("totalOwed")}</p>
        <p className="num text-2xl font-bold">{formatBirr(totals.totalOwed, locale)}</p>
        <p className="num text-sm text-muted-foreground">{t("owingCount", { count: totals.customersOwing })}</p>
      </section>

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
        <div className="grid justify-items-start gap-3 rounded-md border p-5">
          <p>{nothingAtAll ? t("empty") : t("noResults")}</p>
          {nothingAtAll ? (
            <Link href="/customers/new" className={cn(buttonVariants({ size: "lg" }))}>
              {t("add")}
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={`/customers/${row.id}`} className="flex min-h-16 items-center justify-between gap-3 p-3">
                <span className="grid min-w-0 gap-0.5">
                  <span className="font-semibold break-words">{row.name}</span>
                  {row.phone ? <span className="num text-sm text-muted-foreground">{row.phone}</span> : null}
                  {row.balance > 0 && row.oldestDebtAt ? (
                    <span className="num text-sm text-muted-foreground">
                      {t("owingFor", { days: Math.max(0, -daysBetween(row.oldestDebtAt)) })}
                    </span>
                  ) : null}
                </span>
                <span className={cn("num shrink-0 text-right font-bold", row.balance > 0 ? "text-expiry-red" : "text-muted-foreground")}>
                  {formatBirr(row.balance, locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length === CUSTOMER_PAGE_LIMIT ? (
        <p className="num text-sm text-muted-foreground">{t("capped", { count: CUSTOMER_PAGE_LIMIT })}</p>
      ) : null}
    </div>
  );
}
