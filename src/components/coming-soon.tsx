import { getTranslations } from "next-intl/server";

export async function ComingSoon({ titleKey }: { titleKey: "sell" | "stock" | "customers" | "reports" }) {
  const tNav = await getTranslations("nav");
  const t = await getTranslations("common");
  return (
    <div className="grid gap-2">
      <h1 className="text-2xl font-semibold">{tNav(titleKey)}</h1>
      <p className="text-muted-foreground">{t("comingSoon")}</p>
    </div>
  );
}
