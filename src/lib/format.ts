import type { Locale } from "@/i18n/config";

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

/** "ብር 1,250.00" in Amharic, "1,250.00 ETB" otherwise. Display only: the database does money math. */
export function formatBirr(amount: number, locale: Locale): string {
  const value = money.format(amount);
  return locale === "am" ? `ብር ${value}` : `${value} ETB`;
}

export function formatQty(qty: number): string {
  return quantity.format(qty);
}

/** The item name in the screen language, falling back to English (the only required name). */
export function itemName(names: { en: string; am: string | null; om: string | null }, locale: Locale): string {
  const local = locale === "am" ? names.am : locale === "om" ? names.om : names.en;
  return local?.trim() || names.en;
}
