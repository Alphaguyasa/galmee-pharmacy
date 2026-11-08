"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { addCustomer, type CustomerFormState } from "@/actions/customers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: CustomerFormState = {};

export function CustomerForm() {
  const t = useTranslations("customers");
  const [state, action, pending] = useActionState(addCustomer, INITIAL);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" name="name" required maxLength={120} autoComplete="off" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="phone">{t("phone")}</Label>
        <Input id="phone" name="phone" type="tel" inputMode="tel" maxLength={20} autoComplete="off" className="num" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="creditLimit">{t("creditLimit")}</Label>
        <Input id="creditLimit" name="creditLimit" inputMode="decimal" autoComplete="off" className="num" />
      </div>
      <p aria-live="polite" className={state.error ? "text-sm font-semibold text-expiry-red" : "sr-only"}>
        {state.error ? t(state.error) : ""}
      </p>
      <Button type="submit" size="lg" className="w-full" disabled={pending} aria-busy={pending}>
        {t("save")}
      </Button>
    </form>
  );
}
