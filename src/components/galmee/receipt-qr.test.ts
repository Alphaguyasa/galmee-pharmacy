import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReceiptQr } from "./receipt-qr";

const html = (value: string) => renderToStaticMarkup(createElement(ReceiptQr, { value }));

describe("ReceiptQr", () => {
  it("draws a square SVG with dark modules for a payload", () => {
    const out = html("https://pay.example/PH-000123");
    expect(out).toMatch(/^<svg viewBox="0 0 (\d+) \1"/);
    expect(out).toContain('aria-label="https://pay.example/PH-000123"');
    expect((out.match(/h1v1h-1z/g) ?? []).length).toBeGreaterThan(100);
  });
  it("renders nothing for an empty or oversized payload", () => {
    expect(html("")).toBe("");
    expect(html("x".repeat(5000))).toBe("");
  });
});
