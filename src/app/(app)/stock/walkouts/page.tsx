import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { ArrowLeft, Download, PackageX } from "lucide-react";
import { EmptyState } from "@/components/galmee/empty-state";
import { MoneySummaryCard } from "@/components/galmee/money-summary-card";
import { buttonVariants } from "@/components/ui/button";
import { WalkoutQuickLog } from "@/components/walkouts/walkout-quick-log";
import type { Locale } from "@/i18n/config";
import { formatEthiopianDate } from "@/lib/ethiopian-date";
import { formatBirr, formatQty, itemName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { WALKOUT_RANGES, walkoutRanking } from "@/server/dal/walkouts";

const searchSchema = z.object({ days: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30)])).catch(7) });

export default async function WalkoutsPage({ searchParams }: { searchParams: Promise<Record<string, unknown>> }) {
  const { days } = searchSchema.parse(await searchParams);
  const [rows, t, locale] = await Promise.all([walkoutRanking(days), getTranslations("walkouts"), getLocale() as Promise<Locale>]);
  // Only rows for listed medicines carry a price; typed names have none, so the band is a floor.
  const lost = rows.reduce((sum, r) => sum + Math.round((r.lostValue ?? 0) * 100), 0) / 100;
  const asks = rows.reduce((sum, r) => sum + r.asks, 0);

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Link href="/stock" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          {t("back")}
        </Link>
        <h1 className="text-[1.5625rem] leading-tight font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>

      <nav aria-label={t("rangeLabel")} className="grid grid-cols-2 gap-1 rounded-md border bg-card p-1 md:max-w-xs">
        {WALKOUT_RANGES.map((d) => (
          <Link
            key={d}
            href={d === 7 ? "/stock/walkouts" : `/stock/walkouts?days=${d}`}
            aria-current={d === days ? "page" : undefined}
            className={cn(
              "flex h-11 items-center justify-center rounded text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              d === days ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {t("lastDays", { days: d })}
          </Link>
        ))}
      </nav>

      <MoneySummaryCard
        tone="owed"
        label={t("lostLabel", { days })}
        figure={formatBirr(lost, locale)}
        sub={t("asksCount", { count: asks })}
      />

      <WalkoutQuickLog />

      {rows.length === 0 ? (
        <EmptyState icon={PackageX} message={t("empty")} />
      ) : (
        <section aria-labelledby="walkout-list" className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="walkout-list" className="font-semibold">{t("listHeading")}</h2>
            <a
              href={`/stock/walkouts/csv?days=${days}`}
              download
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <Download aria-hidden />
              {t("download")}
            </a>
          </div>
          <ol className="divide-y rounded-md border bg-card">
            {rows.map((row, index) => {
              const name = itemName(row.names, locale);
              return (
                <li key={row.itemId ?? `t:${row.names.en.toLowerCase()}`} className="flex items-start gap-3 p-3">
                  <span className="num w-6 shrink-0 pt-0.5 text-right font-bold text-muted-foreground">{index + 1}</span>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold break-words">{name}</span>
                      {row.lostValue !== null ? (
                        <span className="num font-semibold whitespace-nowrap">{formatBirr(row.lostValue, locale)}</span>
                      ) : null}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t("asked", { count: row.asks, qty: formatQty(row.qtyAsked) })}
                      {" · "}
                      {t("lastAsked", { date: formatEthiopianDate(row.lastAsked, locale, { withEra: false }) })}
                    </span>
                    <span className={cn("text-sm", row.qtyOnHand === null ? "text-muted-foreground" : row.qtyOnHand > 0 ? "text-primary" : "font-semibold text-expiry-red")}>
                      {row.qtyOnHand === null
                        ? t("notListed")
                        : row.qtyOnHand > 0
                          ? t("inStockNow", { qty: formatQty(row.qtyOnHand) })
                          : t("stillOut")}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
