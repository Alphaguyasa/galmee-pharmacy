import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarDays } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
        <h1 className="text-2xl font-semibold">{t("welcome", { name: profile.fullName })}</h1>
        <p className="flex items-center gap-2 text-muted-foreground">
          <CalendarDays className="size-4" aria-hidden />
          <span className="num">
            {tCommon("today")}: {formatEthiopianDate(new Date(), locale)}
          </span>
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/stock?filter=urgent" className="rounded-md focus-visible:outline-2">
          <Card className="h-full border-2 border-expiry-red">
            <CardHeader>
              <CardDescription>{t("expiringSoon")}</CardDescription>
              <CardTitle className="num text-2xl text-expiry-red">{formatBirr(totals.value30, locale)}</CardTitle>
              <CardDescription className="num">{tStock("itemsCount", { count: totals.items30 })}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/stock?filter=low" className="rounded-md focus-visible:outline-2">
          <Card className="h-full">
            <CardHeader>
              <CardDescription>{t("lowStock")}</CardDescription>
              <CardTitle className="num text-2xl">{tStock("itemsCount", { count: totals.itemsLow })}</CardTitle>
            </CardHeader>
          </Card>
        </Link>
        <Card>
          <CardHeader>
            <CardDescription>{t("salesToday")}</CardDescription>
            <CardTitle className="text-muted-foreground">{t("notYet")}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
