import { getLocale, getTranslations } from "next-intl/server";
import { CalendarDays } from "lucide-react";
import { MoneySummaryCard } from "@/components/galmee/money-summary-card";
import type { Locale } from "@/i18n/config";
import { formatEthiopianDate } from "@/lib/ethiopian-date";
import { formatBirr } from "@/lib/format";
import { getSession } from "@/server/dal/session";
import { getTodaySummary } from "@/server/dal/reports";
import { getExpiryTotals } from "@/server/dal/stock";

export default async function HomePage() {
  const [{ profile }, totals, today, t, tCommon, tStock, tReports, tCustomers, locale] = await Promise.all([
    getSession(),
    getExpiryTotals(),
    getTodaySummary(),
    getTranslations("home"),
    getTranslations("common"),
    getTranslations("stock"),
    getTranslations("reports"),
    getTranslations("customers"),
    getLocale() as Promise<Locale>,
  ]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-[1.5625rem] leading-tight font-bold">{t("welcome", { name: profile.fullName })}</h1>
        <p className="flex items-center gap-2 text-muted-foreground">
          <CalendarDays className="size-4" aria-hidden />
          <span className="num">
            {tCommon("today")}: {formatEthiopianDate(new Date(), locale)}
          </span>
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 sm:items-stretch lg:grid-cols-4">
        <MoneySummaryCard
          href="/stock?filter=urgent"
          tone="owed"
          label={t("expiringSoon")}
          figure={formatBirr(totals.value30, locale)}
          sub={tStock("itemsCount", { count: totals.items30 })}
        />
        <MoneySummaryCard
          href="/stock?filter=low"
          tone={totals.itemsLow > 0 ? "warn" : "band"}
          size="md"
          label={t("lowStock")}
          figure={tStock("itemsCount", { count: totals.itemsLow })}
        />
        <MoneySummaryCard
          href="/reports"
          tone="in"
          size="md"
          label={t("salesToday")}
          figure={formatBirr(today.salesTotal, locale)}
          sub={t("salesSub", {
            sales: tReports("salesCount", { count: today.salesCount }),
            amount: formatBirr(today.cashIn, locale),
          })}
        />
        <MoneySummaryCard
          href="/customers"
          tone={today.owed > 0 ? "owed" : "band"}
          size="md"
          label={tCustomers("totalOwed")}
          figure={formatBirr(today.owed, locale)}
        />
      </div>
    </div>
  );
}
