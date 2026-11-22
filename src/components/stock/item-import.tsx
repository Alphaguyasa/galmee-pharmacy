"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { checkItemImport, importItems, type ImportResult } from "@/actions/stock";
import type { ImportPreview } from "@/lib/item-import";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Checked = Awaited<ReturnType<typeof checkItemImport>>;
const SHOWN = 8;

export function ItemImport() {
  const t = useTranslations("itemImport");
  const tStock = useTranslations("stock");
  const inputId = useId();
  const [text, setText] = useState<string | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  async function onFile(file: File | undefined) {
    setChecked(null);
    setResult(null);
    if (!file) return;
    if (file.size > 1_000_000) {
      setChecked({ ok: false, error: "tooBig" });
      return;
    }
    const content = await file.text();
    setText(content);
    start(async () => setChecked(await checkItemImport(content)));
  }

  function onImport(preview: Extract<ImportPreview, { ok: true }>) {
    if (text === null) return;
    start(async () => setResult(await importItems(text, preview.items.length)));
  }

  if (result?.ok) {
    return (
      <div role="status" className="grid gap-3 rounded-lg border border-border bg-card p-4">
        <p className="font-semibold">{t("done", { count: result.count })}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/stock/receive" className={buttonVariants({ size: "lg" })}>
            {t("receiveNow")}
          </Link>
          <Link href="/stock" className={buttonVariants({ variant: "outline", size: "lg" })}>
            {t("toStock")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={inputId}>{t("chooseFile")}</Label>
        <input
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          disabled={pending}
          onChange={(e) => onFile(e.target.files?.[0])}
          className="min-h-12 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base file:me-3 file:min-h-8 file:rounded file:border-0 file:bg-secondary file:px-3 file:font-semibold"
        />
        <p className="text-sm text-muted-foreground">{t("fileHint")}</p>
      </div>

      <div aria-live="polite" className="grid gap-4">
        {pending && !checked && <p className="text-sm">{t("checking")}</p>}
        {checked && !checked.ok && (
          <p className="text-sm font-semibold text-expiry-red">
            {checked.error === "missingColumns"
              ? t("errors.missingColumns", { columns: (checked.missing ?? []).map((c) => t(`columns.${c}`)).join(", ") })
              : t(`errors.${checked.error}`)}
          </p>
        )}
        {checked?.ok && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="num text-2xl font-bold">{checked.items.length}</p>
                <p className="text-sm">{t("ready")}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <p className={`num text-2xl font-bold ${checked.problems.length ? "text-expiry-red" : ""}`}>{checked.problems.length}</p>
                <p className="text-sm">{t("skipped")}</p>
              </div>
            </div>

            {checked.problems.length > 0 && (
              <section className="grid gap-2">
                <h2 className="font-semibold">{t("problemsTitle")}</h2>
                <ul className="grid gap-1 text-sm">
                  {checked.problems.slice(0, 50).map((p) => (
                    <li key={p.line} className="flex gap-2">
                      <span className="num shrink-0 text-muted-foreground">{t("line", { line: p.line })}</span>
                      <span className="min-w-0 break-words">
                        <span className="font-medium">{p.text}</span> · {t(`problems.${p.problem}`)}
                      </span>
                    </li>
                  ))}
                </ul>
                {checked.problems.length > 50 && <p className="text-sm">{t("more", { count: checked.problems.length - 50 })}</p>}
              </section>
            )}

            {checked.items.length > 0 && (
              <section className="grid gap-2">
                <h2 className="font-semibold">{t("previewTitle")}</h2>
                <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                  {checked.items.slice(0, SHOWN).map(({ line, item }) => (
                    <li key={line} className="flex items-baseline justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 break-words">
                        {item.nameEn}
                        <span className="text-muted-foreground"> · {tStock(`units.${item.unit}`)}</span>
                      </span>
                      <span className="num shrink-0">{item.price.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
                {checked.items.length > SHOWN && <p className="text-sm">{t("more", { count: checked.items.length - SHOWN })}</p>}
                <Button type="button" className="min-h-12" disabled={pending} onClick={() => onImport(checked)}>
                  {pending ? t("saving") : t("create", { count: checked.items.length })}
                </Button>
              </section>
            )}
            {result && !result.ok && <p className="text-sm font-semibold text-expiry-red">{t(`saveErrors.${result.code}`)}</p>}
          </>
        )}
      </div>
    </div>
  );
}
