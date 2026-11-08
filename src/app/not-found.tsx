import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center justify-items-start gap-4 px-4">
      <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
      <p>{t("notFoundBody")}</p>
      <Link href="/" className={cn(buttonVariants({ size: "lg" }))}>
        {t("notFoundHome")}
      </Link>
    </main>
  );
}
