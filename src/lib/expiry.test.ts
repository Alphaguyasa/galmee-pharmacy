import { describe, expect, it } from "vitest";
import { expiryStatus } from "./expiry";

describe("expiryStatus", () => {
  it.each([
    [null, "none"],
    [-1, "expired"],
    [0, "red"],
    [29, "red"],
    [30, "amber"],
    [89, "amber"],
    [90, "ok"],
  ] as const)("%s days is %s", (days, status) => expect(expiryStatus(days)).toBe(status));
});
