import { getLocale, getTranslations } from "next-intl/server";
import { CalendarDays } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Locale } from "@/i18n/config";
import { formatEthiopianDate } from "@/lib/ethiopian-date";
import { getSession } from "@/server/dal/session";

export default async function HomePage() {
  const [{ profile }, t, tCommon, locale] = await Promise.all([
    getSession(),
    getTranslations("home"),
    getTranslations("common"),
    getLocale() as Promise<Locale>,
  ]);

  const tiles = [t("expiringSoon"), t("lowStock"), t("salesToday")];

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
        {tiles.map((title) => (
          <Card key={title}>
            <CardHeader>
              <CardDescription>{title}</CardDescription>
              <CardTitle className="text-muted-foreground">{t("notYet")}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
