/** The database puts the amount over the limit in the error detail, e.g. "120.00". */
export function parseAmountOver(details: string | undefined | null): number | undefined {
  if (!details || !/^\d{1,12}(\.\d{1,2})?$/.test(details.trim())) return undefined;
  const value = Number(details);
  return value > 0 ? value : undefined;
}

export type SaleErrorCode =
  | "insufficientStock"
  | "expiredStock"
  | "noPrice"
  | "itemNotFound"
  | "customerNotFound"
  | "creditLimit"
  | "overrideNotPermitted"
  | "badReason"
  | "generic";

const CODES: [prefix: string, code: SaleErrorCode][] = [
  ["insufficient_stock", "insufficientStock"],
  ["expired_stock", "expiredStock"],
  ["no_price", "noPrice"],
  ["item_not_found", "itemNotFound"],
  ["customer_not_found", "customerNotFound"],
  ["credit_limit", "creditLimit"],
  ["override_not_permitted", "overrideNotPermitted"],
  ["bad_reason", "badReason"],
];

/**
 * Turns the database's refusal of `ph_record_sale` into the app's own code.
 * Used for sales answered at once and for sales the server refused when they
 * were sent later from the offline queue.
 */
export function saleErrorCode(message: string | undefined | null): SaleErrorCode {
  const text = message ?? "";
  for (const [prefix, code] of CODES) if (text.startsWith(prefix)) return code;
  return "generic";
}
