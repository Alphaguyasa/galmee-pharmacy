import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ReceiveForm } from "@/components/stock/receive-form";
import { listReceivableItems, listSuppliers } from "@/server/dal/purchasing";
import { getSession } from "@/server/dal/session";

export default async function ReceivePage() {
  const { profile } = await getSession();
  if (profile.role !== "owner" && profile.role !== "manager") redirect("/stock");

  const [suppliers, items, t] = await Promise.all([listSuppliers(), listReceivableItems(), getTranslations("receive")]);

  return (
    <div className="grid max-w-xl gap-5">
      <div className="grid gap-1">
        <Link href="/stock" className="-my-3 w-fit py-3 text-sm underline underline-offset-4">
          {t("back")}
        </Link>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
      </div>
      <ReceiveForm suppliers={suppliers} items={items} />
    </div>
  );
}
