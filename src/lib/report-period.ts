import { ethiopianMonthRange, shiftIsoDay } from "./ethiopian-date";

export type ReportPeriod =
  | { range: "week"; from: string; to: string }
  | { range: "month"; from: string; to: string; offset: number; year: number; month: number };

/** How far back the month view goes (in Ethiopian months). */
export const MAX_MONTHS_BACK = 24;

/**
 * The days a report covers. Week: the last 7 days up to today. Month: an Ethiopian month,
 * `m` months back (0 = this month), cut at today. Anything unexpected falls back to safe values.
 */
export function resolvePeriod(params: { range?: unknown; m?: unknown }, today: string): ReportPeriod {
  if (params.range !== "month") return { range: "week", from: shiftIsoDay(today, -6), to: today };
  const raw = typeof params.m === "string" && /^-?\d{1,2}$/.test(params.m) ? Number(params.m) : 0;
  const offset = Math.min(0, Math.max(-MAX_MONTHS_BACK, raw));
  const r = ethiopianMonthRange(today, offset);
  return { range: "month", from: r.from, to: r.to < today ? r.to : today, offset, year: r.year, month: r.month };
}

/** Query string for a period, e.g. "?range=month&m=-1". */
export function periodQuery(p: { range: "week" } | { range: "month"; offset: number }): string {
  return p.range === "week" ? "?range=week" : p.offset === 0 ? "?range=month" : `?range=month&m=${p.offset}`;
}
