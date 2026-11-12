import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { CashCount } from "@/components/reports/cash-count";
import { EmptyState } from "@/components/galmee/empty-state";
import { ListRow, ListSheet } from "@/components/galmee/list-row";
import { MoneySummaryCard } from "@/components/galmee/money-summary-card";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { addisToday, formatEthiopianDate, isIsoDay, shiftIsoDay } from "@/lib/ethiopian-date";
import { formatBirr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getDailyClosing, type ClosingRowDTO } from "@/server/dal/reports";

// Cash and Telebirr are always listed (the owner looks for them); the rest only when used that day.
const ALWAYS_SHOWN = new Set(["cash", "telebirr"]);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, unknown>> }) {
  const today = addisToday();
  const { day } = z
    .object({ day: z.string().refine((d) => isIsoDay(d) && d <= today).catch(today) })
    .parse({ day: today, ...(await searchParams) });

  const [closing, t, locale] = await Promise.all([
    getDailyClosing(day),
    getTranslations("reports"),
    getLocale() as Promise<Locale>,
  ]);
  const isToday = day === today;
  const credit = closing.rows.find((r) => r.method === "credit");
  const methodRows = closing.rows.filter(
    (r) => r.method !== "credit" && (ALWAYS_SHOWN.has(r.method) || r.salesCount > 0 || r.salesCollected + r.repayments > 0),
  );
  const nothing = closing.salesCount === 0 && closing.totalIn === 0;
  const dayHref = (d: string) => (d === today ? "/reports" : `/reports?day=${d}`);
  const navLink = cn(buttonVariants({ variant: "outline", size: "lg" }), "shrink-0 px-3");

  return (
    <div className="grid gap-5">
      <div className="grid gap-0.5">
        <h1 className="text-[1.5625rem] leading-tight font-bold">{t("title")}</h1>
        <p className="num text-muted-foreground">
          {isToday ? `${t("today")} · ` : null}
          {formatEthiopianDate(day, locale)}
        </p>
      </div>

      <nav aria-label={t("dayLabel")} className="flex items-end gap-2 md:max-w-md">
        <Link href={dayHref(shiftIsoDay(day, -1))} className={navLink} aria-label={t("previousDay")}>
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <form action="/reports" className="flex min-w-0 flex-1 gap-2">
          <label htmlFor="closing-day" className="sr-only">
            {t("dayLabel")}
          </label>
          <Input
            id="closing-day"
            name="day"
            type="date"
            defaultValue={day}
            max={today}
            className="num min-w-0 flex-1"
          />
          <button type="submit" aria-label={t("show")} className={navLink}>
            <CalendarDays className="size-5" aria-hidden />
          </button>
        </form>
        {isToday ? (
          <span aria-hidden className={cn(navLink, "pointer-events-none opacity-40")}>
            <ChevronRight className="size-5" />
          </span>
        ) : (
          <Link href={dayHref(shiftIsoDay(day, 1))} className={navLink} aria-label={t("nextDay")}>
            <ChevronRight className="size-5" aria-hidden />
          </Link>
        )}
      </nav>

      <MoneySummaryCard
        tone="in"
        label={t("cashIn")}
        figure={formatBirr(closing.cashIn, locale)}
        sub={`${t("totalIn", { amount: formatBirr(closing.totalIn, locale) })} · ${t("salesCount", { count: closing.salesCount })}`}
      />
      <MoneySummaryCard
        tone={closing.creditGiven > 0 ? "owed" : "band"}
        size="md"
        label={t("creditGiven")}
        figure={formatBirr(closing.creditGiven, locale)}
        sub={t("creditSub", { count: credit?.salesCount ?? 0 })}
      />

      {nothing ? (
        <EmptyState icon={CalendarDays} message={t("empty")} />
      ) : (
        <section aria-labelledby="by-method" className="grid gap-2">
          <h2 id="by-method" className="font-semibold">
            {t("byMethod")}
          </h2>
          <ListSheet>
            {methodRows.map((row) => (
              <MethodRow key={row.method} row={row} t={t} locale={locale} />
            ))}
            {credit ? (
              <ListRow
                title={t("methods.credit")}
                className="items-center"
                sub={<span className="num">{t("salesCount", { count: credit.salesCount })}</span>}
                right={
                  <span className={cn("num font-bold", credit.creditGiven > 0 ? "text-owed" : "text-muted-foreground")}>
                    {formatBirr(credit.creditGiven, locale)}
                  </span>
                }
              />
            ) : null}
          </ListSheet>
        </section>
      )}

      {isToday || closing.cashIn > 0 ? <CashCount key={day} expected={closing.cashIn} /> : null}
    </div>
  );
}

function MethodRow({
  row,
  t,
  locale,
}: {
  row: ClosingRowDTO;
  t: Awaited<ReturnType<typeof getTranslations<"reports">>>;
  locale: Locale;
}) {
  const taken = row.salesCollected + row.repayments;
  return (
    <ListRow
      title={t(`methods.${row.method}`)}
      className="items-center"
      sub={
        <>
          <span className="num">{t("salesCount", { count: row.salesCount })}</span>
          {row.repayments > 0 ? (
            <span className="num">{t("repaymentsLine", { amount: formatBirr(row.repayments, locale) })}</span>
          ) : null}
        </>
      }
      right={
        <span className={cn("num font-bold", taken > 0 ? "text-money-in" : "text-muted-foreground")}>
          {formatBirr(taken, locale)}
        </span>
      }
    />
  );
}
