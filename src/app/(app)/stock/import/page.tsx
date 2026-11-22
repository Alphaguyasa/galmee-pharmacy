import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ItemImport } from "@/components/stock/item-import";
import { IMPORT_MAX_ROWS } from "@/lib/item-import";
import { getSession } from "@/server/dal/session";

export default async function ImportItemsPage() {
  const { profile } = await getSession();
  if (profile.role !== "owner" && profile.role !== "manager") redirect("/stock");
  const [t, tReceive] = await Promise.all([getTranslations("itemImport"), getTranslations("receive")]);

  return (
    <div className="grid max-w-2xl gap-5">
      <div className="grid gap-1">
        <Link href="/stock" className="-my-3 w-fit py-3 text-sm underline underline-offset-4">
          {tReceive("back")}
        </Link>
        <h1 className="text-[1.5625rem] leading-tight font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro", { max: IMPORT_MAX_ROWS })}</p>
      </div>
      <ol className="grid list-decimal gap-1 ps-5 text-sm">
        <li>
          <a href="/stock/import/template" className="font-semibold underline underline-offset-4" download>
            {t("downloadTemplate")}
          </a>{" "}
          {t("step1")}
        </li>
        <li>{t("step2")}</li>
        <li>{t("step3")}</li>
      </ol>
      <ItemImport />
    </div>
  );
}
