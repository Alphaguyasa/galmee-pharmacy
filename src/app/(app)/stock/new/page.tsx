import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ItemForm } from "@/components/stock/item-form";
import { getSession } from "@/server/dal/session";

export default async function NewItemPage() {
  const { profile } = await getSession();
  if (profile.role !== "owner" && profile.role !== "manager") redirect("/stock");
  const [t, tReceive] = await Promise.all([getTranslations("newItem"), getTranslations("receive")]);

  return (
    <div className="grid max-w-xl gap-5">
      <div className="grid gap-1">
        <Link href="/stock" className="-my-3 w-fit py-3 text-sm underline underline-offset-4">
          {tReceive("back")}
        </Link>
        <h1 className="text-[1.5625rem] leading-tight font-bold">{t("title")}</h1>
      </div>
      <ItemForm />
    </div>
  );
}
