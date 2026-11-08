"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { addSupplier, receiveDelivery } from "@/actions/stock";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Locale } from "@/i18n/config";
import { daysBetween, formatEthiopianDate } from "@/lib/ethiopian-date";
import { formatBirr, formatQty, itemName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReceivableItemDTO, SupplierDTO } from "@/server/dal/purchasing";

type Line = {
  key: string;
  item: ReceivableItemDTO;
  qty: number;
  unitCost: number;
  batchNo: string;
  expiryDate: string;
};

const BLANK = { qty: "", cost: "", batchNo: "", expiryDate: "" };
const selectClass =
  "flex h-12 w-full rounded-md border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function ReceiveForm({
  suppliers: initialSuppliers,
  items,
}: {
  suppliers: SupplierDTO[];
  items: ReceivableItemDTO[];
}) {
  const t = useTranslations("receive");
  const tStock = useTranslations("stock");
  const locale = useLocale() as Locale;
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [supplierId, setSupplierId] = useState("");
  const [addingSupplier, setAddingSupplier] = useState(initialSuppliers.length === 0);
  const [supplierDraft, setSupplierDraft] = useState({ name: "", phone: "" });
  const [query, setQuery] = useState("");
  const [item, setItem] = useState<ReceivableItemDTO | null>(null);
  const [draft, setDraft] = useState(BLANK);
  const [lines, setLines] = useState<Line[]>([]);
  // Stays the same across retries so a repeated tap or lost reply cannot add stock twice.
  const [clientRef, setClientRef] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const unitLabel = (unit: string) => (tStock.has(`units.${unit}`) ? tStock(`units.${unit}`) : unit);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return items
      .filter((it) =>
        [it.names.en, it.names.am, it.names.om, it.sku].some((value) => value?.toLowerCase().includes(needle)),
      )
      .slice(0, 6);
  }, [items, query]);

  const today = new Date().toISOString().slice(0, 10);
  const expiryDays = draft.expiryDate ? daysBetween(draft.expiryDate) : null;

  function chooseItem(next: ReceivableItemDTO) {
    setItem(next);
    setQuery("");
    setDraft((d) => ({ ...d, cost: next.cost > 0 ? String(next.cost) : d.cost }));
    setError(null);
  }

  function saveSupplier() {
    setError(null);
    if (!supplierDraft.name.trim()) {
      setError(t("errorSupplierName"));
      return;
    }
    startTransition(async () => {
      const result = await addSupplier(supplierDraft);
      if (result.ok) {
        setSuppliers((list) => [...list, result.supplier].sort((a, b) => a.name.localeCompare(b.name)));
        setSupplierId(result.supplier.id);
        setAddingSupplier(false);
        setSupplierDraft({ name: "", phone: "" });
      } else {
        setError(
          result.code === "duplicate"
            ? t("errorSupplierDuplicate")
            : result.code === "forbidden"
              ? t("errorForbidden")
              : t("errorGeneric"),
        );
      }
    });
  }

  function addLine() {
    setError(null);
    const qty = Number(draft.qty.replace(",", "."));
    const unitCost = Number(draft.cost.replace(",", "."));
    if (!item) return setError(t("errorItem"));
    if (!Number.isFinite(qty) || qty <= 0) return setError(t("errorQty"));
    if (draft.cost.trim() === "" || !Number.isFinite(unitCost) || unitCost < 0) return setError(t("errorCost"));
    if (item.tracksExpiry && !draft.expiryDate) return setError(t("errorExpiryRequired"));
    if (draft.expiryDate && expiryDays !== null && expiryDays <= 0) return setError(t("errorExpired"));
    setLines((list) => [
      ...list,
      { key: crypto.randomUUID(), item, qty, unitCost, batchNo: draft.batchNo.trim(), expiryDate: draft.expiryDate },
    ]);
    setItem(null);
    setDraft(BLANK);
  }

  function submit() {
    setError(null);
    if (!supplierId) return setError(t("errorSupplier"));
    if (lines.length === 0) return setError(t("errorNoLines"));
    startTransition(async () => {
      const result = await receiveDelivery({
        supplierId,
        clientRef,
        lines: lines.map((line) => ({
          itemId: line.item.id,
          qty: line.qty,
          unitCost: line.unitCost,
          batchNo: line.batchNo || undefined,
          expiryDate: line.expiryDate || undefined,
        })),
      });
      if (result.ok) {
        setLines([]);
        setClientRef(crypto.randomUUID());
        setDone(true);
      } else {
        const key = {
          expired: "errorExpired",
          expiryRequired: "errorExpiryRequired",
          forbidden: "errorForbidden",
          notFound: "errorNotFound",
          generic: "errorGeneric",
        } as const;
        setError(t(key[result.code]));
      }
    });
  }

  if (done) {
    return (
      <div className="grid justify-items-start gap-3 rounded-md border p-5" role="status">
        <p className="font-semibold">{t("success")}</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/stock" className={cn(buttonVariants({ size: "lg" }))}>
            {t("viewStock")}
          </Link>
          <Button size="lg" variant="outline" onClick={() => setDone(false)}>
            {t("another")}
          </Button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="rounded-md border p-5">{t("noItemsYet")}</p>;
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-2">
        <Label htmlFor="supplier">{t("supplier")}</Label>
        {addingSupplier ? (
          <div className="grid gap-3 rounded-md border p-3">
            <div className="grid gap-1.5">
              <Label htmlFor="supplier-name">{t("supplierName")}</Label>
              <Input
                id="supplier-name"
                value={supplierDraft.name}
                maxLength={120}
                autoComplete="off"
                onChange={(e) => setSupplierDraft((s) => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="supplier-phone">{t("supplierPhone")}</Label>
              <Input
                id="supplier-phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                maxLength={20}
                value={supplierDraft.phone}
                onChange={(e) => setSupplierDraft((s) => ({ ...s, phone: e.target.value }))}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="lg" variant="outline" disabled={pending} onClick={saveSupplier}>
                {t("saveSupplier")}
              </Button>
              {suppliers.length > 0 ? (
                <Button type="button" size="lg" variant="ghost" onClick={() => setAddingSupplier(false)}>
                  {t("cancel")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <select
              id="supplier"
              className={selectClass}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">{t("chooseSupplier")}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Button type="button" size="lg" variant="outline" className="shrink-0" onClick={() => setAddingSupplier(true)}>
              {t("newSupplier")}
            </Button>
          </div>
        )}
      </section>

      <section className="grid gap-3 rounded-md border p-3" aria-label={t("addLine")}>
        {item ? (
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 font-semibold break-words">{itemName(item.names, locale)}</p>
            <Button type="button" variant="ghost" size="lg" className="shrink-0" onClick={() => setItem(null)}>
              {t("changeItem")}
            </Button>
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="item-search">{t("item")}</Label>
            <Input
              id="item-search"
              type="search"
              value={query}
              autoComplete="off"
              spellCheck={false}
              placeholder={t("itemSearch")}
              onChange={(e) => setQuery(e.target.value)}
            />
            {matches.length > 0 ? (
              <ul className="divide-y rounded-md border">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className="flex min-h-12 w-full items-center px-3 py-2 text-left"
                      onClick={() => chooseItem(m)}
                    >
                      {itemName(m.names, locale)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : query.trim() ? (
              <p className="text-sm text-muted-foreground">{t("noMatch")}</p>
            ) : null}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="qty">{t("qty")}</Label>
            <Input
              id="qty"
              className="num"
              inputMode="decimal"
              autoComplete="off"
              value={draft.qty}
              onChange={(e) => setDraft((d) => ({ ...d, qty: e.target.value }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cost">{t("cost")}</Label>
            <Input
              id="cost"
              className="num"
              inputMode="decimal"
              autoComplete="off"
              value={draft.cost}
              onChange={(e) => setDraft((d) => ({ ...d, cost: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="batch">{t("batch")}</Label>
          <Input
            id="batch"
            className="num"
            maxLength={60}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={draft.batchNo}
            onChange={(e) => setDraft((d) => ({ ...d, batchNo: e.target.value }))}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="expiry">{t("expiry")}</Label>
          <Input
            id="expiry"
            type="date"
            className="num"
            min={today}
            aria-describedby="expiry-note"
            value={draft.expiryDate}
            onChange={(e) => setDraft((d) => ({ ...d, expiryDate: e.target.value }))}
          />
          <p id="expiry-note" className="num text-sm text-muted-foreground">
            {draft.expiryDate && expiryDays !== null
              ? t("expiryPreview", {
                  date: formatEthiopianDate(draft.expiryDate, locale),
                  days: expiryDays,
                })
              : t("expiryHint")}
          </p>
        </div>

        <Button type="button" size="lg" variant="outline" onClick={addLine}>
          {t("addLine")}
        </Button>
      </section>

      {lines.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="font-semibold">{t("linesHeading")}</h2>
          <ul className="divide-y rounded-md border bg-card">
            {lines.map((line) => (
              <li key={line.key} className="flex items-center justify-between gap-3 p-3">
                <div className="grid min-w-0 gap-0.5">
                  <p className="font-semibold break-words">{itemName(line.item.names, locale)}</p>
                  <p className="num text-sm text-muted-foreground">
                    {t("lineSummary", {
                      qty: formatQty(line.qty),
                      unit: unitLabel(line.item.unit),
                      cost: formatBirr(line.unitCost, locale),
                    })}
                  </p>
                  {line.expiryDate ? (
                    <p className="num text-sm text-muted-foreground">{formatEthiopianDate(line.expiryDate, locale)}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  aria-label={t("remove", { name: itemName(line.item.names, locale) })}
                  onClick={() => setLines((list) => list.filter((l) => l.key !== line.key))}
                >
                  <Trash2 className="size-5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p aria-live="polite" className={cn("text-sm font-semibold text-expiry-red", !error && "sr-only")}>
        {error}
      </p>

      <Button type="button" size="lg" className="w-full" disabled={pending} aria-busy={pending} onClick={submit}>
        {t("submit")}
      </Button>
    </div>
  );
}
