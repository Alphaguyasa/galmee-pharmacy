"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { addItem, type ItemFormState } from "@/actions/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const UNITS = ["strip", "bottle", "sachet", "tube", "tablet", "pack", "piece", "pair", "roll", "bag"] as const;
const INITIAL: ItemFormState = {};

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} autoComplete="off" {...props} />
    </div>
  );
}

export function ItemForm() {
  const t = useTranslations("newItem");
  const tStock = useTranslations("stock");
  const [state, action, pending] = useActionState(addItem, INITIAL);

  return (
    <form action={action} className="grid gap-4">
      <Field id="nameEn" label={t("nameEn")} required maxLength={120} spellCheck={false} />
      <Field id="nameAm" label={t("nameAm")} maxLength={120} lang="am" />
      <Field id="nameOm" label={t("nameOm")} maxLength={120} lang="om" spellCheck={false} />
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="unit">{t("unit")}</Label>
          <select
            id="unit"
            name="unit"
            defaultValue="strip"
            className="flex h-12 w-full rounded-md border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {tStock(`units.${unit}`)}
              </option>
            ))}
          </select>
        </div>
        <Field id="sku" label={t("sku")} maxLength={40} spellCheck={false} autoCapitalize="characters" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field id="price" label={t("price")} inputMode="decimal" required className="num" />
        <Field id="cost" label={t("cost")} inputMode="decimal" required className="num" />
      </div>
      <Field id="reorderLevel" label={t("reorderLevel")} inputMode="decimal" defaultValue="0" className="num" />
      <label className="flex min-h-12 items-center gap-3">
        <input type="checkbox" name="tracksExpiry" defaultChecked className="size-5 accent-primary" />
        <span>{t("tracksExpiry")}</span>
      </label>
      <p aria-live="polite" className={state.error ? "text-sm font-semibold text-expiry-red" : "sr-only"}>
        {state.error ? t(state.error) : ""}
      </p>
      <Button type="submit" size="lg" className="w-full" disabled={pending} aria-busy={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}
