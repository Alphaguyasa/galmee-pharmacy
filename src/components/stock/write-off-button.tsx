"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { writeOffExpired } from "@/actions/stock";
import { Button } from "@/components/ui/button";

export function WriteOffButton({ itemId, name }: { itemId: string; name: string }) {
  const t = useTranslations("stock");
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setFailed(false);
    startTransition(async () => {
      const ok = await writeOffExpired({ itemId }).catch(() => false);
      if (ok) setConfirming(false);
      else setFailed(true);
    });
  }

  if (!confirming) {
    return (
      <Button type="button" variant="outline" className="justify-self-start" onClick={() => setConfirming(true)}>
        {t("writeOff")}
      </Button>
    );
  }

  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold">{t("writeOffConfirm", { name })}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="destructive" disabled={pending} aria-busy={pending} onClick={confirm}>
          {t("writeOffYes")}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
          {t("writeOffNo")}
        </Button>
      </div>
      <p aria-live="polite" className={failed ? "text-sm font-semibold text-expiry-red" : "sr-only"}>
        {failed ? t("writeOffError") : ""}
      </p>
    </div>
  );
}
