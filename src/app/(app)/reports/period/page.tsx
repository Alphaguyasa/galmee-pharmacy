import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarDays, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { ReportTabs } from "@/components/reports/report-tabs";
import { EmptyState } from "@/components/galmee/empty-state";
import { ListRow, ListSheet } from "@/components/galmee/list-row";
import { MoneySummaryCard } from "@/components/galmee/money-summary-card";
import { buttonVariants } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { ETHIOPIAN_MONTHS, addisToday, formatEthiopianDate } from "@/lib/ethiopian-date";
import { formatBirr } from "@/lib/format";
import { MAX_MONTHS_BACK, periodQuery, resolvePeriod } from "@/lib/report-period";
import { cn } from "@/lib/utils";
import { getSalesByDay } from "@/server/dal/reports";

export default async function PeriodReportPage({ searchParams }: { searchParams: Promise<Record<string, unknown>> }) {
  const today = addisToday();
  const period = resolvePeriod(await searchParams, today);
  const [days, t, locale] = await Promise.all([
    getSalesByDay(period.from, period.to),
    getTranslations("reports"),
    getLocale() as Promise<Locale>,
  ]);

  const sum = (pick: (d: (typeof days)[number]) => number) => Math.round(days.reduce((s, d) => s + pick(d) * 100, 0)) / 100;
  const salesTotal = sum((d) => d.salesTotal);
  const salesCount = days.reduce((s, d) => s + d.salesCount, 0);
  const takenIn = sum((d) => d.collected + d.repayments);
  const cashIn = sum((d) => d.cashIn);
  const creditGiven = sum((d) => d.creditGiven);
  // Newest first, and only days with something in them: a quiet Sunday is not worth a row.
  const busyDays = days.filter((d) => d.salesCount > 0 || d.collected + d.repayments > 0).reverse();

  const heading =
    period.range === "week"
      ? t("last7Days")
      : `${ETHIOPIAN_MONTHS[locale][period.month - 1]} ${period.year}`;
  const navLink = cn(buttonVariants({ variant: "outline", size: "lg" }), "shrink-0 px-3");

  return (
    <div className="grid gap-5">
      <div className="grid gap-0.5">
        <h1 className="text-[1.5625rem] leading-tight font-bold">{t("periodTitle")}</h1>
        <p className="num text-muted-foreground">
          {formatEthiopianDate(period.from, locale, { withEra: false })} – {formatEthiopianDate(period.to, locale)}
        </p>
      </div>

      <ReportTabs current={period.range} />

      {period.range === "month" ? (
        <nav aria-label={t("monthLabel")} className="flex items-center gap-2 md:max-w-md">
          {period.offset > -MAX_MONTHS_BACK ? (
            <Link href={`/reports/period${periodQuery({ range: "month", offset: period.offset - 1 })}`} className={navLink} aria-label={t("previousMonth")}>
              <ChevronLeft className="size-5" aria-hidden />
            </Link>
          ) : (
            <span aria-hidden className={cn(navLink, "pointer-events-none opacity-40")}>
              <ChevronLeft className="size-5" />
            </span>
          )}
          <p className="num flex-1 text-center font-semibold">{heading}</p>
          {period.offset < 0 ? (
            <Link href={`/reports/period${periodQuery({ range: "month", offset: period.offset + 1 })}`} className={navLink} aria-label={t("nextMonth")}>
              <ChevronRight className="size-5" aria-hidden />
            </Link>
          ) : (
            <span aria-hidden className={cn(navLink, "pointer-events-none opacity-40")}>
              <ChevronRight className="size-5" />
            </span>
          )}
        </nav>
      ) : null}

      <MoneySummaryCard
        tone="in"
        label={t("salesInPeriod", { period: heading })}
        figure={formatBirr(salesTotal, locale)}
        sub={`${t("salesCount", { count: salesCount })} · ${t("totalIn", { amount: formatBirr(takenIn, locale) })}`}
      />
      <ListSheet>
        <ListRow
          title={t("cashTaken")}
          className="items-center"
          right={<span className="num font-bold text-money-in">{formatBirr(cashIn, locale)}</span>}
        />
        <ListRow
          title={t("creditGiven")}
          className="items-center"
          right={
            <span className={cn("num font-bold", creditGiven > 0 ? "text-owed" : "text-muted-foreground")}>
              {formatBirr(creditGiven, locale)}
            </span>
          }
        />
      </ListSheet>

      {busyDays.length === 0 ? (
        <EmptyState icon={CalendarDays} message={t("emptyPeriod")} />
      ) : (
        <section aria-labelledby="by-day" className="grid gap-2">
          <h2 id="by-day" className="font-semibold">
            {t("byDay")}
          </h2>
          <ListSheet>
            {busyDays.map((d) => (
              <ListRow
                key={d.day}
                href={d.day === today ? "/reports" : `/reports?day=${d.day}`}
                title={<span className="num">{formatEthiopianDate(d.day, locale)}</span>}
                sub={
                  <>
                    <span className="num">{t("salesCount", { count: d.salesCount })}</span>
                    <span className="num">
                      {t("dayLine", {
                        cash: formatBirr(d.cashIn, locale),
                        credit: formatBirr(d.creditGiven, locale),
                      })}
                    </span>
                  </>
                }
                right={<span className="num font-bold">{formatBirr(d.salesTotal, locale)}</span>}
              />
            ))}
          </ListSheet>
        </section>
      )}

      <a
        href={`/reports/period/csv${periodQuery(period.range === "week" ? { range: "week" } : { range: "month", offset: period.offset })}`}
        download
        className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2 md:max-w-md")}
      >
        <Download className="size-5" aria-hidden />
        {t("downloadCsv")}
      </a>
    </div>
  );
}
