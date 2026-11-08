export type ExpiryStatus = "expired" | "red" | "amber" | "ok" | "none";

/** Screen colours: red under 30 days, amber under 90. A null means no dated batch in stock. */
export function expiryStatus(daysLeft: number | null): ExpiryStatus {
  if (daysLeft === null) return "none";
  if (daysLeft < 0) return "expired";
  if (daysLeft < 30) return "red";
  if (daysLeft < 90) return "amber";
  return "ok";
}
