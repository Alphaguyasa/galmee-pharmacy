import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "day", href: "/reports" },
  { key: "week", href: "/reports/period?range=week" },
  { key: "month", href: "/reports/period?range=month" },
] as const;

/** Day / week / Ethiopian month switch at the top of the reports screens. */
export async function ReportTabs({ current }: { current: (typeof TABS)[number]["key"] }) {
  const t = await getTranslations("reports");
  return (
    <nav aria-label={t("periodLabel")} className="grid grid-cols-3 gap-1 rounded-md border bg-card p-1 md:max-w-md">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === current ? "page" : undefined}
          className={cn(
            "flex h-11 items-center justify-center rounded text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
            tab.key === current ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted",
          )}
        >
          {t(`tabs.${tab.key}`)}
        </Link>
      ))}
    </nav>
  );
}
