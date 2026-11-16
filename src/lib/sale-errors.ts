/** The database puts the amount over the limit in the error detail, e.g. "120.00". */
export function parseAmountOver(details: string | undefined | null): number | undefined {
  if (!details || !/^\d{1,12}(\.\d{1,2})?$/.test(details.trim())) return undefined;
  const value = Number(details);
  return value > 0 ? value : undefined;
}
