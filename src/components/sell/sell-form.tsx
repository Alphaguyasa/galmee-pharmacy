"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { findSellable, sell } from "@/actions/sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarcodeScanner } from "./barcode-scanner";
import type { Locale } from "@/i18n/config";
import { formatBirr, formatQty, itemName } from "@/lib/format";
import type { SellableItemDTO } from "@/server/dal/sales";

const PAYMENTS = ["cash", "telebirr", "cbe_birr", "bank", "credit"] as const;
type Payment = (typeof PAYMENTS)[number];
type CartLine = { item: SellableItemDTO; qty: number };
type SearchState = "idle" | "loading" | "done" | "error";

function blockReason(item: SellableItemDTO): "expiredStock" | "outOfStock" | "noPrice" | null {
  if (item.daysLeft !== null && item.daysLeft < 0) return "expiredStock";
  if (item.qtyOnHand <= 0) return "outOfStock";
  if (item.price <= 0) return "noPrice";
  return null;
}

export function SellForm({ customers }: { customers: { id: string; name: string }[] }) {
  const t = useTranslations("sell");
  const tCustomers = useTranslations("customers");
  const tStock = useTranslations("stock");
  const locale = useLocale() as Locale;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SellableItemDTO[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<Payment>("cash");
  const [customerId, setCustomerId] = useState("");
  // Same id on a retry, so a lost reply can never record the sale twice.
  const [clientRef, setClientRef] = useState(() => crypto.randomUUID());
  // After an unanswered attempt the cart stays as sent: the sale may already be recorded.
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  // Result of the last scan, shown under the search box where the cashier is looking.
  const [scanNote, setScanNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSearch = useRef(0);

  function onSearch(value: string) {
    setQuery(value);
    setScanNote(null);
    if (timer.current) clearTimeout(timer.current);
    const id = ++latestSearch.current;
    if (value.trim() === "") {
      setResults([]);
      setSearchState("idle");
      return;
    }
    setSearchState("loading");
    timer.current = setTimeout(async () => {
      try {
        const rows = await findSellable(value);
        if (id !== latestSearch.current) return;
        setResults(rows);
        setSearchState("done");
      } catch {
        if (id === latestSearch.current) setSearchState("error");
      }
    }, 250);
  }

  function addToCart(item: SellableItemDTO) {
    setMessage(null);
    setCart((lines) =>
      lines.some((l) => l.item.itemId === item.itemId)
        ? lines.map((l) => (l.item.itemId === item.itemId ? { ...l, qty: Math.min(l.qty + 1, item.qtyOnHand) } : l))
        : [...lines, { item, qty: 1 }],
    );
    setQuery("");
    setResults([]);
    setSearchState("idle");
  }

  /** A scanned code that matches exactly one sellable medicine goes straight into the cart. */
  async function onScanned(code: string) {
    if (timer.current) clearTimeout(timer.current);
    const id = ++latestSearch.current;
    setScanNote(null);
    setQuery(code);
    setSearchState("loading");
    try {
      const rows = await findSellable(code);
      if (id !== latestSearch.current) return;
      const exact = rows.filter((r) => r.sku !== null && r.sku.trim().toLowerCase() === code.toLowerCase());
      if (exact.length === 1 && blockReason(exact[0]) === null) {
        addToCart(exact[0]);
        setScanNote({ tone: "ok", text: t("scanAdded", { name: itemName(exact[0].names, locale) }) });
        return;
      }
      if (exact.length === 0 && rows.length === 0) {
        setResults([]);
        setSearchState("idle");
        setScanNote({ tone: "error", text: t("scanNotFound", { code }) });
        return;
      }
      // Several matches, or a blocked one: show them so the reason is visible.
      setResults(exact.length > 0 ? exact : rows);
      setSearchState("done");
    } catch {
      if (id === latestSearch.current) setSearchState("error");
    }
  }

  function setQty(itemId: string, qty: number) {
    setCart((lines) =>
      lines.map((l) => (l.item.itemId === itemId ? { ...l, qty: Math.min(Math.max(qty, 1), l.item.qtyOnHand) } : l)),
    );
  }

  function reset() {
    setCart([]);
    setPayment("cash");
    setCustomerId("");
    setClientRef(crypto.randomUUID());
    setLocked(false);
  }

  function submit() {
    setMessage(null);
    if (payment === "credit" && !customerId) {
      setMessage({ tone: "error", text: t("errorCustomer") });
      return;
    }
    startTransition(async () => {
      const result = await sell({
        lines: cart.map((l) => ({ itemId: l.item.itemId, qty: l.qty })),
        payment,
        customerId: payment === "credit" ? customerId : undefined,
        clientRef,
      }).catch(() => ({ ok: false, code: "generic" }) as const);

      if (result.ok) {
        reset();
        setMessage({ tone: "ok", text: t("recorded", { total: formatBirr(result.total, locale) }) });
        return;
      }
      if (result.code === "generic") setLocked(true);
      else setClientRef(crypto.randomUUID());
      setMessage({ tone: "error", text: t(`error${result.code}`) });
    });
  }

  // Display only: the database prices the sale and returns the total that is shown afterwards.
  const total = cart.reduce((sum, l) => sum + Math.round(l.item.price * 100) * l.qty, 0) / 100;
  const unitLabel = (unit: string) => (tStock.has(`units.${unit}`) ? tStock(`units.${unit}`) : unit);

  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <section className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="sell-search">{t("searchLabel")}</Label>
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="sell-search"
              className="pl-10"
              placeholder={t("searchPlaceholder")}
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>
        </div>
        <BarcodeScanner disabled={locked} onCode={onScanned} />
        <p
          aria-live="polite"
          className={`text-sm empty:hidden ${scanNote ? `font-semibold ${scanNote.tone === "ok" ? "text-primary" : "text-expiry-red"}` : "text-muted-foreground"}`}
        >
          {scanNote
            ? scanNote.text
            : searchState === "loading"
            ? t("searching")
            : searchState === "error"
              ? t("searchError")
              : searchState === "done" && results.length === 0
                ? t("noResults")
                : ""}
        </p>
        {results.length > 0 ? (
          <ul className="grid gap-2">
            {results.map((item) => {
              const blocked = blockReason(item);
              return (
                <li key={item.itemId}>
                  <button
                    type="button"
                    disabled={blocked !== null || locked}
                    onClick={() => addToCart(item)}
                    className="grid min-h-12 w-full gap-0.5 rounded-md border p-3 text-left hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-muted/60"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold">{itemName(item.names, locale)}</span>
                      <span className="num font-semibold whitespace-nowrap">{formatBirr(item.price, locale)}</span>
                    </span>
                    <span className={blocked === "expiredStock" ? "text-sm font-semibold text-expiry-red" : "text-sm text-muted-foreground"}>
                      {blocked
                        ? t(blocked)
                        : `${t("inStock", { qty: formatQty(item.qtyOnHand) })} · ${unitLabel(item.unit)}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <section aria-label={t("cartHeading")} className="grid gap-4 rounded-md border p-3">
        <h2 className="font-semibold">{t("cartHeading")}</h2>
        {cart.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("cartEmpty")}</p>
        ) : (
          <ul className="grid gap-3">
            {cart.map((line) => {
              const name = itemName(line.item.names, locale);
              return (
                <li key={line.item.itemId} className="grid gap-2 border-b pb-3 last:border-b-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{name}</span>
                    <span className="num whitespace-nowrap">{formatBirr((Math.round(line.item.price * 100) * line.qty) / 100, locale)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="icon" aria-label={`${t("decrease")}: ${name}`} disabled={locked || line.qty <= 1} onClick={() => setQty(line.item.itemId, line.qty - 1)}>
                      <Minus className="size-5" aria-hidden />
                    </Button>
                    <Input
                      aria-label={`${t("qty")}: ${name}`}
                      className="num w-20 text-center"
                      inputMode="numeric"
                      autoComplete="off"
                      disabled={locked}
                      value={String(line.qty)}
                      onChange={(e) => {
                        const value = Number.parseInt(e.target.value.replace(/\D/g, ""), 10);
                        if (Number.isFinite(value)) setQty(line.item.itemId, value);
                      }}
                    />
                    <Button type="button" variant="outline" size="icon" aria-label={`${t("increase")}: ${name}`} disabled={locked || line.qty >= line.item.qtyOnHand} onClick={() => setQty(line.item.itemId, line.qty + 1)}>
                      <Plus className="size-5" aria-hidden />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="ml-auto" aria-label={`${t("remove")}: ${name}`} disabled={locked} onClick={() => setCart((lines) => lines.filter((l) => l.item.itemId !== line.item.itemId))}>
                      <Trash2 className="size-5" aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <fieldset className="grid gap-1.5" disabled={locked}>
          <legend className="text-sm font-medium">{t("payment")}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PAYMENTS.map((p) => (
              <label
                key={p}
                className="flex h-12 items-center justify-center rounded-md border text-sm has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:font-semibold has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
              >
                <input type="radio" name="payment" value={p} checked={payment === p} onChange={() => setPayment(p)} className="sr-only" />
                {p === "credit" ? t("credit") : tCustomers(`methods.${p}`)}
              </label>
            ))}
          </div>
        </fieldset>

        {payment === "credit" ? (
          customers.length === 0 ? (
            <p className="text-sm">
              {t("noCustomers")}{" "}
              <Link href="/customers/new" className="font-semibold underline">
                {t("addCustomer")}
              </Link>
            </p>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="sell-customer">{t("customer")}</Label>
              <select
                id="sell-customer"
                className="h-12 w-full rounded-md border bg-background px-3"
                disabled={locked}
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">{t("chooseCustomer")}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )
        ) : null}

        {/* The money moment stays under the thumb: on phones this bar sticks just above the bottom nav. */}
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-3 -mb-3 grid gap-3 rounded-b-md border-t bg-card px-3 py-3 lg:static lg:mx-0 lg:mb-0 lg:border-t-0 lg:p-0">
          <div className="flex items-baseline justify-between gap-3 rounded-md bg-band px-3 py-2">
            <span className="font-semibold">{t("total")}</span>
            <span className="num text-[1.9375rem] leading-tight font-bold">{formatBirr(total, locale)}</span>
          </div>

          <p
            aria-live="polite"
            className={message ? `text-sm font-semibold ${message.tone === "ok" ? "text-money-in" : "text-owed"}` : "sr-only"}
          >
            {message?.text ?? ""}
          </p>

          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button type="button" variant="outline" size="lg" disabled={pending || (cart.length === 0 && !locked)} onClick={() => { reset(); setMessage(null); }}>
              {t("clear")}
            </Button>
            <Button type="button" size="lg" disabled={pending || cart.length === 0} aria-busy={pending} onClick={submit}>
              {t("confirm")}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
