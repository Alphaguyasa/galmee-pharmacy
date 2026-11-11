import { getTranslations } from "next-intl/server";
import { Hammer } from "lucide-react";
import { EmptyState } from "@/components/galmee/empty-state";

export async function ComingSoon({ titleKey }: { titleKey: "sell" | "stock" | "customers" | "reports" }) {
  const tNav = await getTranslations("nav");
  const t = await getTranslations("common");
  return (
    <div className="grid gap-5">
      <h1 className="text-[1.5625rem] leading-tight font-bold">{tNav(titleKey)}</h1>
      <EmptyState icon={Hammer} message={t("comingSoon")} />
    </div>
  );
}
