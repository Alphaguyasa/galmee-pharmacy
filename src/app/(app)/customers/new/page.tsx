import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CustomerForm } from "@/components/customers/customer-form";

export default async function NewCustomerPage() {
  const t = await getTranslations("customers");
  return (
    <div className="grid max-w-xl gap-5">
      <div className="grid gap-1">
        <Link href="/customers" className="-my-3 w-fit py-3 text-sm underline underline-offset-4">
          {t("back")}
        </Link>
        <h1 className="text-[1.5625rem] leading-tight font-bold">{t("addTitle")}</h1>
      </div>
      <CustomerForm />
    </div>
  );
}
