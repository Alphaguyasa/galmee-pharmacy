import { describe, expect, it } from "vitest";
import { periodQuery, resolvePeriod } from "./report-period";

const today = "2026-11-16"; // Hidar 7, 2019

describe("resolvePeriod", () => {
  it("defaults to the last 7 days", () => {
    expect(resolvePeriod({}, today)).toEqual({ range: "week", from: "2026-11-10", to: today });
    expect(resolvePeriod({ range: "year" }, today).range).toBe("week");
  });

  it("cuts this Ethiopian month at today", () => {
    expect(resolvePeriod({ range: "month" }, today)).toEqual({
      range: "month", from: "2026-11-10", to: today, offset: 0, year: 2019, month: 3,
    });
  });

  it("goes back whole months and never forward", () => {
    expect(resolvePeriod({ range: "month", m: "-1" }, today)).toMatchObject({ from: "2026-10-11", to: "2026-11-09", month: 2 });
    expect(resolvePeriod({ range: "month", m: "3" }, today)).toMatchObject({ offset: 0 });
    expect(resolvePeriod({ range: "month", m: "-100" }, today)).toMatchObject({ offset: 0 });
    expect(resolvePeriod({ range: "month", m: "-30" }, today)).toMatchObject({ offset: -24 });
    expect(resolvePeriod({ range: "month", m: "x" }, today)).toMatchObject({ offset: 0 });
  });
});

describe("periodQuery", () => {
  it("writes the query string back", () => {
    expect(periodQuery({ range: "week" })).toBe("?range=week");
    expect(periodQuery({ range: "month", offset: 0 })).toBe("?range=month");
    expect(periodQuery({ range: "month", offset: -2 })).toBe("?range=month&m=-2");
  });
});
