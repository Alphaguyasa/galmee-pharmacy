"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { repay } from "@/actions/customers";
import { BirrInput } from "@/components/galmee/birr-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const METHODS = ["cash", "telebirr", "cbe_birr", "bank"] as const;
type Method = (typeof METHODS)[number];

export function RepaymentForm({ customerId }: { customerId: string }) {
  const t = useTranslations("customers");
  const locale = useLocale();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [reference, setReference] = useState("");
  // Same id on a retry, so a lost reply can never record the payment twice.
  const [clientRef, setClientRef] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setMessage(null);
    const value = Number(amount.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      setMessage({ tone: "error", text: t("errorAmount") });
      return;
    }
    startTransition(async () => {
      const result = await repay({ customerId, amount: value, method, reference: reference || undefined, clientRef });
      if (result.ok) {
        setAmount("");
        setReference("");
        setClientRef(crypto.randomUUID());
        setMessage({ tone: "ok", text: t("repaid") });
      } else {
        setMessage({
          tone: "error",
          text: t(result.code === "overBalance" ? "errorOverBalance" : result.code === "notFound" ? "errorNotFound" : "errorRepay"),
        });
      }
    });
  }

  return (
    <section className="grid gap-3 rounded-md border p-3">
      <h2 className="font-semibold">{t("recordPayment")}</h2>
      <div className="grid gap-1.5">
        <Label htmlFor="amount">{t("amount")}</Label>
        <BirrInput
          id="amount"
          unitLabel={locale === "am" ? "ብር" : "ETB"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="text-sm font-medium">{t("method")}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {METHODS.map((m) => (
            <label
              key={m}
              className="flex h-12 items-center justify-center rounded-md border text-sm has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:font-semibold has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
            >
              <input
                type="radio"
                name="method"
                value={m}
                checked={method === m}
                onChange={() => setMethod(m)}
                className="sr-only"
              />
              {t(`methods.${m}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {method !== "cash" ? (
        <div className="grid gap-1.5">
          <Label htmlFor="reference">{t("reference")}</Label>
          <Input
            id="reference"
            className="num"
            maxLength={60}
            autoComplete="off"
            spellCheck={false}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
      ) : null}
      <p
        aria-live="polite"
        className={message ? `text-sm font-semibold ${message.tone === "ok" ? "text-money-in" : "text-owed"}` : "sr-only"}
      >
        {message?.text ?? ""}
      </p>
      <Button type="button" size="lg" className="w-full" disabled={pending} aria-busy={pending} onClick={submit}>
        {t("recordPayment")}
      </Button>
    </section>
  );
}
