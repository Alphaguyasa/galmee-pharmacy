import { getTranslations } from "next-intl/server";
import { SellForm } from "@/components/sell/sell-form";
import { listCustomers } from "@/server/dal/customers";
import { getSession } from "@/server/dal/session";

export default async function SellPage() {
  const [, customers, t] = await Promise.all([getSession(), listCustomers({ owing: false }), getTranslations("sell")]);

  return (
    <div className="grid gap-5">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <SellForm customers={customers.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
