import { getLocale, getTranslations } from "next-intl/server";
import { AlertTriangle, CalendarClock, CheckCircle2, OctagonX } from "lucide-react";
import type { Locale } from "@/i18n/config";
import { formatEthiopianDate } from "@/lib/ethiopian-date";
import { expiryStatus } from "@/lib/expiry";
import { cn } from "@/lib/utils";

const STYLES = {
  expired: { box: "border-expiry-red bg-expiry-red text-white", icon: OctagonX },
  red: { box: "border-expiry-red bg-expiry-red/10 text-expiry-red", icon: AlertTriangle },
  amber: { box: "border-expiry-amber bg-expiry-amber/10 text-expiry-amber", icon: CalendarClock },
  ok: { box: "border-shelf text-foreground", icon: CheckCircle2 },
} as const;

/** The printed EXP stamp from a medicine box: Ethiopian date plus days left. Never colour alone. */
export async function ExpiryLabel({ date, daysLeft }: { date: string | null; daysLeft: number | null }) {
  const [t, locale] = await Promise.all([getTranslations("stock"), getLocale() as Promise<Locale>]);
  const status = expiryStatus(daysLeft);

  if (status === "none" || date === null || daysLeft === null) {
    return <span className="text-sm text-muted-foreground">{t("noExpiry")}</span>;
  }

  const { box, icon: Icon } = STYLES[status];
  const detail =
    status === "expired" ? t("expired") : daysLeft === 0 ? t("expiresToday") : t("daysLeft", { days: daysLeft });

  return (
    <div className={cn("inline-grid gap-0.5 rounded-md border-2 px-2.5 py-1.5 text-sm", box)}>
      <span className="num font-semibold whitespace-nowrap">{formatEthiopianDate(date, locale)}</span>
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="num">{detail}</span>
      </span>
    </div>
  );
}
