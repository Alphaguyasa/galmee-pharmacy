import { getTranslations } from "next-intl/server";
import { SellForm } from "@/components/sell/sell-form";
import { listCustomers } from "@/server/dal/customers";
import { getSession } from "@/server/dal/session";

export default async function SellPage() {
  const [session, customers, t] = await Promise.all([getSession(), listCustomers({ owing: false }), getTranslations("sell")]);
  // Only shows or hides the reason field; the database refuses an override from anyone else.
  const canOverride = session.profile.role === "owner" || session.profile.role === "manager";

  return (
    <div className="grid gap-5">
      <h1 className="text-[1.5625rem] leading-tight font-bold">{t("title")}</h1>
      <SellForm customers={customers.map((c) => ({ id: c.id, name: c.name }))} canOverride={canOverride} />
    </div>
  );
}
