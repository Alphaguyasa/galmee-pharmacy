"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BirrInput } from "@/components/galmee/birr-input";
import { Label } from "@/components/ui/label";
import type { Locale } from "@/i18n/config";
import { formatBirr } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The evening check: the owner counts the drawer and sees at once whether it
 * matches the recorded cash. Kept in the browser only; nothing is stored.
 */
export function CashCount({ expected }: { expected: number }) {
  const t = useTranslations("reports");
  const locale = useLocale() as Locale;
  const [counted, setCounted] = useState("");

  const value = Number(counted.replace(/,/g, ""));
  const valid = counted.trim() !== "" && Number.isFinite(value) && value >= 0;
  // Compare in cents so 0.1 + 0.2 style float noise never shows as "short by 0.00".
  const diff = valid ? Math.round(value * 100) - Math.round(expected * 100) : 0;

  return (
    <section aria-labelledby="cash-count-title" className="grid gap-3 rounded-md border p-3">
      <h2 id="cash-count-title" className="font-semibold">
        {t("countTitle")}
      </h2>
      <div className="grid gap-1.5">
        <Label htmlFor="cash-counted">{t("countLabel")}</Label>
        <BirrInput
          id="cash-counted"
          unitLabel={locale === "am" ? "ብር" : "ETB"}
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
          aria-describedby="cash-count-hint cash-count-result"
        />
        <p id="cash-count-hint" className="text-sm text-muted-foreground">
          {t("countHint")}
        </p>
      </div>
      <p
        id="cash-count-result"
        role="status"
        className={cn(
          "num min-h-6 font-semibold",
          diff < 0 && "text-owed",
          diff > 0 && "text-warn",
          valid && diff === 0 && "text-money-in",
        )}
      >
        {!valid
          ? null
          : diff === 0
            ? t("countMatch")
            : t(diff < 0 ? "countShort" : "countOver", { amount: formatBirr(Math.abs(diff) / 100, locale) })}
      </p>
    </section>
  );
}
