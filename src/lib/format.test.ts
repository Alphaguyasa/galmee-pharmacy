import { describe, expect, it } from "vitest";
import { formatBirr, formatQty, itemName } from "./format";

describe("formatBirr", () => {
  it("uses the birr word in Amharic", () => expect(formatBirr(1250, "am")).toBe("ብር 1,250.00"));
  it("uses ETB in other languages", () => {
    expect(formatBirr(1250.5, "en")).toBe("1,250.50 ETB");
    expect(formatBirr(0, "om")).toBe("0.00 ETB");
  });
});

describe("formatQty", () => {
  it("drops trailing zeros", () => {
    expect(formatQty(120)).toBe("120");
    expect(formatQty(1.5)).toBe("1.5");
  });
});

describe("itemName", () => {
  const names = { en: "ORS sachet", am: "ኦ.አር.ኤስ", om: null };
  it("picks the screen language", () => expect(itemName(names, "am")).toBe("ኦ.አር.ኤስ"));
  it("falls back to English", () => expect(itemName(names, "om")).toBe("ORS sachet"));
  it("treats a blank name as missing", () => expect(itemName({ ...names, am: " " }, "am")).toBe("ORS sachet"));
});
