import { getLocale, getTranslations } from "next-intl/server";
import { CalendarDays } from "lucide-react";
import { MoneySummaryCard } from "@/components/galmee/money-summary-card";
import type { Locale } from "@/i18n/config";
import { formatEthiopianDate } from "@/lib/ethiopian-date";
import { formatBirr } from "@/lib/format";
import { getSession } from "@/server/dal/session";
import { getExpiryTotals } from "@/server/dal/stock";

export default async function HomePage() {
  const [{ profile }, totals, t, tCommon, tStock, locale] = await Promise.all([
    getSession(),
    getExpiryTotals(),
    getTranslations("home"),
    getTranslations("common"),
    getTranslations("stock"),
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
      <div className="grid gap-3 sm:grid-cols-3 sm:items-stretch">
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
        <MoneySummaryCard size="md" label={t("salesToday")} figure={t("notYet")} />
      </div>
    </div>
  );
}
