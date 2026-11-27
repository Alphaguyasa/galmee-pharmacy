import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { BuyListPrintButton } from "@/components/buy-list/print-button";
import type { Locale } from "@/i18n/config";
import { formatEthiopianDate } from "@/lib/ethiopian-date";
import { formatQty, itemName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getBuyList } from "@/server/dal/buy-list";
import { getSession } from "@/server/dal/session";

const PAPERS = ["a4", "80"] as const;
const searchSchema = z.object({ paper: z.enum(PAPERS).catch("a4") });

export default async function BuyListPage({ searchParams }: { searchParams: Promise<Record<string, unknown>> }) {
  const { paper } = searchSchema.parse(await searchParams);
  const [{ tenant }, list, t, locale] = await Promise.all([
    getSession(),
    getBuyList(),
    getTranslations("buyList"),
    getLocale() as Promise<Locale>,
  ]);
  const narrow = paper === "80";
  const nothing = list.walkouts.length === 0 && list.fastMovers.length === 0 && list.expiring.length === 0;
  const blank = <span aria-hidden className="buy-blank inline-block h-6 w-16 shrink-0 border-b-2 border-dashed border-foreground/40" />;

  return (
    <div className="grid gap-5">
      <div className="grid gap-2 print:hidden">
        <Link href="/stock" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          {t("back")}
        </Link>
        <h1 className="text-[1.5625rem] leading-tight font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <nav aria-label={t("paperLabel")} className="grid grow grid-cols-2 gap-1 rounded-md border bg-card p-1 sm:max-w-xs">
          {PAPERS.map((p) => (
            <Link
              key={p}
              href={p === "a4" ? "/stock/buy-list" : `/stock/buy-list?paper=${p}`}
              aria-current={p === paper ? "page" : undefined}
              className={cn(
                "flex h-11 items-center justify-center rounded text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                p === paper ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {p === "a4" ? t("paperA4") : t("paper80")}
            </Link>
          ))}
        </nav>
        <BuyListPrintButton label={t("print")} />
      </div>

      <article
        className={cn(
          "buy-list-sheet grid gap-4 rounded-md border bg-card p-4 text-card-foreground",
          narrow ? "buy-list-80 max-w-[80mm] text-sm" : "buy-list-a4",
        )}
      >
        <header className="grid gap-0.5 border-b pb-2">
          <p className="font-bold">{tenant.name}</p>
          <h2 className="text-lg font-bold">{t("title")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("weekNote")} · {t("printedOn", { date: formatEthiopianDate(new Date(), locale) })}
          </p>
        </header>

        {nothing ? <p className="font-semibold">{t("allClear")}</p> : null}

        <section aria-labelledby="buy-walkouts" className="grid gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 id="buy-walkouts" className="font-bold">{t("walkoutsHeading")}</h3>
            <span className="w-16 shrink-0 text-center text-xs text-muted-foreground">{t("buyQty")}</span>
          </div>
          {list.walkouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("walkoutsEmpty")}</p>
          ) : (
            <ol className="divide-y">
              {list.walkouts.map((w) => (
                <li key={w.itemId ?? `t:${w.names.en.toLowerCase()}`} className="flex items-end gap-2 py-1.5">
                  <span className="num w-5 shrink-0 text-right font-bold">{w.rank}</span>
                  <span className="min-w-0 grow">
                    <span className="block font-semibold break-words">{itemName(w.names, locale)}</span>
                    <span className="block text-xs text-muted-foreground">{t("asks", { count: w.asks })}</span>
                  </span>
                  {blank}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="buy-fast" className="grid gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 id="buy-fast" className="font-bold">{t("fastHeading")}</h3>
            <span className="w-16 shrink-0 text-center text-xs text-muted-foreground">{t("buyQty")}</span>
          </div>
          {list.fastMovers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("fastEmpty")}</p>
          ) : (
            <ul className="divide-y">
              {list.fastMovers.map((f) => (
                <li key={f.itemId} className="flex items-end gap-2 py-1.5">
                  <span className="min-w-0 grow">
                    <span className="block font-semibold break-words">{itemName(f.names, locale)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t("soldWeek", { qty: formatQty(f.soldWeek) })} · {t("inStock", { qty: formatQty(f.qtyOnHand) })}
                    </span>
                  </span>
                  {blank}
                </li>
              ))}
            </ul>
          )}
          {list.salesCapped ? <p className="text-xs text-muted-foreground">{t("cappedNote", { count: 5000 })}</p> : null}
        </section>

        <section aria-labelledby="buy-expiry" className="grid gap-1">
          <h3 id="buy-expiry" className="font-bold">{t("expiryHeading")}</h3>
          {list.expiring.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("expiryEmpty")}</p>
          ) : (
            <ul className="divide-y">
              {list.expiring.map((e) => (
                <li key={e.itemId} className="flex items-baseline justify-between gap-2 py-1.5">
                  <span className="min-w-0 font-semibold break-words">{itemName(e.names, locale)}</span>
                  <span
                    className={cn(
                      "shrink-0 text-xs font-semibold",
                      e.tone === "amber" ? "text-amber-800 dark:text-amber-300" : "text-red-700 dark:text-red-300",
                    )}
                  >
                    {e.tone === "expired" ? t("expired") : t("daysLeft", { days: e.daysLeft ?? 0 })} · {formatQty(e.qtyOnHand)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    </div>
  );
}
