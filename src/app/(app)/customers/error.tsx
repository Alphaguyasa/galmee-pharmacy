"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function CustomersError({ retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("customers");
  const tCommon = useTranslations("common");
  return (
    <div className="grid justify-items-start gap-3 rounded-md border p-5" role="alert">
      <p>{t("loadError")}</p>
      <Button size="lg" onClick={() => retry()}>
        {tCommon("retry")}
      </Button>
    </div>
  );
}
