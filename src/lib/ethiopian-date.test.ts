import { describe, expect, it } from "vitest";
import {
  addisToday,
  daysBetween,
  ethiopianMonthRange,
  ethiopianMonthsBetween,
  isIsoDay,
  shiftIsoDay,
  formatEthiopianDate,
  isEthiopianLeapYear,
  parseGregorian,
  toEthiopian,
  toGregorian,
} from "./ethiopian-date";

describe("toEthiopian", () => {
  it.each([
    [{ year: 2026, month: 9, day: 11 }, { year: 2019, month: 1, day: 1 }], // Enkutatash 2019
    [{ year: 2023, month: 9, day: 12 }, { year: 2016, month: 1, day: 1 }], // new year before G. leap year
    [{ year: 2024, month: 1, day: 7 }, { year: 2016, month: 4, day: 28 }], // Genna falls on Tahsas 28 after a leap year
    [{ year: 2026, month: 11, day: 6 }, { year: 2019, month: 2, day: 27 }],
    [{ year: 2000, month: 1, day: 1 }, { year: 1992, month: 4, day: 22 }],
    [{ year: 2023, month: 9, day: 11 }, { year: 2015, month: 13, day: 6 }], // Pagume 6 in leap year 2015
  ])("%o -> %o", (g, e) => {
    expect(toEthiopian(g)).toEqual(e);
  });
});

describe("round trip", () => {
  it("converts every day of 2015-2030 both ways", () => {
    const start = Date.UTC(2015, 0, 1);
    for (let i = 0; i < 16 * 366; i++) {
      const d = new Date(start + i * 86400000);
      const g = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
      const e = toEthiopian(g);
      expect(e.day).toBeGreaterThanOrEqual(1);
      expect(e.day).toBeLessThanOrEqual(30);
      expect(toGregorian(e)).toEqual(g);
    }
  });
});

describe("leap years", () => {
  it("year % 4 === 3 is leap", () => {
    expect(isEthiopianLeapYear(2015)).toBe(true);
    expect(isEthiopianLeapYear(2019)).toBe(true);
    expect(isEthiopianLeapYear(2016)).toBe(false);
  });
});

describe("parseGregorian", () => {
  it("reads plain dates without timezone shifts", () => {
    expect(parseGregorian("2026-11-06")).toEqual({ year: 2026, month: 11, day: 6 });
  });
  it("reads timestamps in Addis Ababa time (UTC+3)", () => {
    expect(parseGregorian("2026-11-06T22:30:00Z")).toEqual({ year: 2026, month: 11, day: 7 });
  });
  it("rejects invalid input", () => {
    expect(() => parseGregorian("not a date")).toThrow(RangeError);
  });
});

describe("formatEthiopianDate", () => {
  it("formats in each language", () => {
    expect(formatEthiopianDate("2026-11-06", "am")).toBe("ጥቅምት 27, 2019 ዓ.ም.");
    expect(formatEthiopianDate("2026-11-06", "en")).toBe("Tikimt 27, 2019 E.C.");
    expect(formatEthiopianDate("2026-11-06", "om", { withEra: false })).toBe("Onkoloolessa 27, 2019");
  });
});

describe("daysBetween", () => {
  it("counts calendar days", () => {
    expect(daysBetween("2026-12-06", "2026-11-06")).toBe(30);
    expect(daysBetween("2026-11-01", "2026-11-06")).toBe(-5);
  });
});

describe("closing-day helpers", () => {
  it("reads today in Addis Ababa time", () => {
    // 22:30 UTC on 11 Nov is 01:30 on 12 Nov in Addis.
    expect(addisToday(new Date(Date.UTC(2026, 10, 11, 22, 30)))).toBe("2026-11-12");
    expect(addisToday(new Date(Date.UTC(2026, 10, 11, 20, 59)))).toBe("2026-11-11");
  });
  it("moves across month and year ends", () => {
    expect(shiftIsoDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftIsoDay("2024-02-28", 1)).toBe("2024-02-29");
    expect(shiftIsoDay("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("accepts only real dates", () => {
    expect(isIsoDay("2026-11-12")).toBe(true);
    expect(isIsoDay("2026-02-30")).toBe(false);
    expect(isIsoDay("2026-13-01")).toBe(false);
    expect(isIsoDay("12-11-2026")).toBe(false);
    expect(isIsoDay("1999-01-01")).toBe(false);
  });
});

describe("ethiopianMonthRange", () => {
  it("finds the Ethiopian month around a day", () => {
    // 2026-11-16 is Hidar 7, 2019.
    expect(ethiopianMonthRange("2026-11-16")).toEqual({ year: 2019, month: 3, from: "2026-11-10", to: "2026-12-09" });
  });

  it("moves back across the new year through Pagume", () => {
    // Meskerem 2019 starts 2026-09-11; the month before is Pagume 2018 (5 days, 2018 is not a leap year).
    expect(ethiopianMonthRange("2026-09-20", -1)).toEqual({ year: 2018, month: 13, from: "2026-09-06", to: "2026-09-10" });
    // Pagume 2019 has 6 days (2019 is a leap year).
    expect(ethiopianMonthRange("2027-09-08")).toEqual({ year: 2019, month: 13, from: "2027-09-06", to: "2027-09-11" });
  });

  it("counts months between two days", () => {
    expect(ethiopianMonthsBetween("2026-11-16", "2026-11-16")).toBe(0);
    expect(ethiopianMonthsBetween("2026-09-20", "2026-11-16")).toBe(2);
    expect(ethiopianMonthsBetween("2026-09-08", "2026-09-12")).toBe(1);
  });
});
