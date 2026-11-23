import { describe, expect, it } from "vitest";
import { parseAmountOver, saleErrorCode } from "./sale-errors";

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

describe("saleErrorCode", () => {
  it("maps each refusal of ph_record_sale to the app's code", () => {
    expect(saleErrorCode("insufficient_stock")).toBe("insufficientStock");
    expect(saleErrorCode("expired_stock")).toBe("expiredStock");
    expect(saleErrorCode("no_price")).toBe("noPrice");
    expect(saleErrorCode("item_not_found")).toBe("itemNotFound");
    expect(saleErrorCode("customer_not_found")).toBe("customerNotFound");
    expect(saleErrorCode("credit_limit")).toBe("creditLimit");
    expect(saleErrorCode("override_not_permitted")).toBe("overrideNotPermitted");
    expect(saleErrorCode("bad_reason")).toBe("badReason");
  });

  it("falls back to generic for anything else", () => {
    expect(saleErrorCode("bad_lines")).toBe("generic");
    expect(saleErrorCode("")).toBe("generic");
    expect(saleErrorCode(undefined)).toBe("generic");
    expect(saleErrorCode("TypeError: Failed to fetch")).toBe("generic");
  });
});
