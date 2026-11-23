"use client";

import { Clock, Lock, TriangleAlert } from "lucide-react";
import { bannerText, billingBanner, billingStrings, type BillingBanner as Banner } from "@/lib/galmee/billing";
import { useBilling } from "@/lib/galmee/use-billing";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "bg-muted text-foreground",
  warn: "bg-warn/10 text-warn",
  urgent: "bg-urgent/10 text-urgent",
} as const;

/**
 * The strip under the header: trial countdown in its last week, the days left
 * to pay during grace, and the read-only bar once locked (with what still
 * works). Renders nothing while the subscription is paid.
 */
export function BillingBannerView({
  banner,
  lang,
  howToPayHref,
  stale = false,
  className,
}: {
  banner: Banner | null;
  lang: string;
  /** Where "How to pay" goes, usually the subscription screen. Hidden when absent. */
  howToPayHref?: string;
  stale?: boolean;
  className?: string;
}) {
  if (!banner) return null;
  const t = billingStrings(lang);
  const Icon = banner.kind === "trial" ? Clock : banner.kind === "grace" ? TriangleAlert : Lock;
  const closed = banner.kind === "locked" || banner.kind === "canceled";
  return (
    <div
      role={closed ? "alert" : "status"}
      data-kind={banner.kind}
      className={cn("flex flex-col gap-1 px-4 py-2.5 text-sm", TONES[banner.tone], className)}
    >
      <p className="flex items-start gap-2 font-semibold">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{bannerText(banner, t)}</span>
      </p>
      {banner.kind === "locked" ? <p className="ps-6 text-foreground/80">{t.lockedHelp}</p> : null}
      {stale ? <p className="ps-6 text-xs text-muted-foreground">{t.savedCopy}</p> : null}
      {howToPayHref && banner.kind !== "canceled" ? (
        <a href={howToPayHref} className="ms-6 inline-flex min-h-11 items-center self-start font-semibold underline underline-offset-4">
          {t.howToPay}
        </a>
      ) : null}
    </div>
  );
}

/** `BillingBannerView` fed by the nearest `BillingProvider`. */
export function BillingBanner({
  lang,
  howToPayHref,
  trialWarnDays,
  className,
}: {
  lang: string;
  howToPayHref?: string;
  trialWarnDays?: number;
  className?: string;
}) {
  const b = useBilling();
  const banner = billingBanner(b.current, trialWarnDays);
  return <BillingBannerView banner={banner} lang={lang} howToPayHref={howToPayHref} stale={b.stale} className={className} />;
}

/** The plain line a `PlanGate` shows in place of a Plus feature. */
export function UpsellLine({ lang, href, className }: { lang: string; href?: string; className?: string }) {
  const t = billingStrings(lang);
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {href ? (
        <a href={href} className="inline-flex min-h-11 items-center underline underline-offset-4">
          {t.upsell}
        </a>
      ) : (
        t.upsell
      )}
    </p>
  );
}
