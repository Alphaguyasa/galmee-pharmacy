import { describe, expect, it } from "vitest";
import { parseAmountOver } from "./sale-errors";

describe("parseAmountOver", () => {
  it("reads the amount the database puts in the error detail", () => {
    expect(parseAmountOver("120.00")).toBe(120);
    expect(parseAmountOver("0.50")).toBe(0.5);
    expect(parseAmountOver(" 75 ")).toBe(75);
  });

  it("ignores missing, zero, negative or unexpected details", () => {
    expect(parseAmountOver(undefined)).toBeUndefined();
    expect(parseAmountOver(null)).toBeUndefined();
    expect(parseAmountOver("")).toBeUndefined();
    expect(parseAmountOver("0.00")).toBeUndefined();
    expect(parseAmountOver("-5")).toBeUndefined();
    expect(parseAmountOver("1e9")).toBeUndefined();
    expect(parseAmountOver("abc")).toBeUndefined();
  });
});
