import { getLocale, getTranslations } from "next-intl/server";
import { CalendarDays } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Locale } from "@/i18n/config";
import { formatEthiopianDate } from "@/lib/ethiopian-date";
import { getSessionContext } from "@/lib/session";

export default async function HomePage() {
  const { profile } = await getSessionContext();
  const t = await getTranslations("home");
  const tCommon = await getTranslations("common");
  const locale = (await getLocale()) as Locale;

  const tiles = [t("expiringSoon"), t("lowStock"), t("salesToday")];

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t("welcome", { name: profile.full_name })}</h1>
        <p className="flex items-center gap-2 text-muted-foreground">
          <CalendarDays className="size-4" aria-hidden />
          <span>
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
