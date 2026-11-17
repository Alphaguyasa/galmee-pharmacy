"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { recordWalkout } from "@/actions/walkouts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Log a request by typing its name, for asks remembered after the customer left. */
export function WalkoutQuickLog() {
  const t = useTranslations("walkouts");
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = label.trim();
    if (name === "") {
      setNote({ tone: "error", text: t("errorEmpty") });
      return;
    }
    startTransition(async () => {
      const result = await recordWalkout({ label: name, qty: 1 });
      if (result.ok) {
        setLabel("");
        setNote({ tone: "ok", text: t("logged", { name }) });
        router.refresh();
      } else {
        setNote({ tone: "error", text: t(result.code === "limit" ? "errorLimit" : "errorLog") });
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-1.5" noValidate>
      <Label htmlFor="walkout-name">{t("quickLabel")}</Label>
      <div className="flex gap-2">
        <Input
          id="walkout-name"
          value={label}
          maxLength={80}
          autoComplete="off"
          placeholder={t("quickPlaceholder")}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Button type="submit" disabled={pending} className="shrink-0">
          <Plus aria-hidden />
          {t("quickButton")}
        </Button>
      </div>
      <p aria-live="polite" className={`text-sm empty:hidden ${note?.tone === "error" ? "font-semibold text-expiry-red" : "text-primary"}`}>
        {note?.text ?? ""}
      </p>
    </form>
  );
}
