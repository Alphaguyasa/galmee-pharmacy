import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseBillingStatus } from "@/lib/galmee/billing";
import {
  canSubmitPayment,
  checkPaymentForm,
  expectedAmount,
  parsePayments,
  submitErrorKey,
  subscriptionStrings,
} from "@/lib/galmee/billing-payments";
import { pendingPayment, SubscriptionView, type SubscriptionViewProps } from "./subscription-screen";

const rows = [
  { id: "a", amount: "450", reference: "CK12AB34", months: 1, status: "approved", note: null, created_at: "2026-10-01T08:00:00Z" },
  { id: "b", amount: 900, reference: "CK99ZZ01", months: 2, status: "rejected", note: "Amount short", created_at: "2026-11-01T08:00:00Z" },
  { id: "bad", amount: "x", reference: "?", months: 1, status: "approved", created_at: "2026-11-02T08:00:00Z" },
  { id: "c", amount: 450, reference: "R1", months: 1, status: "paused", created_at: "2026-11-03T08:00:00Z" },
];

describe("parsePayments", () => {
  it("keeps valid rows, newest first", () => {
    const list = parsePayments(rows);
    expect(list.map((p) => p.id)).toEqual(["b", "a"]);
    expect(list[1]).toMatchObject({ amount: 450, note: null, status: "approved" });
    expect(parsePayments(null)).toEqual([]);
  });
});

describe("checkPaymentForm", () => {
  const history = parsePayments(rows);
  it("rejects an empty reference and an empty amount", () => {
    expect(checkPaymentForm({ amount: "", reference: "  ", months: 1 })).toEqual({
      ok: false,
      errors: { amount: "required", reference: "required" },
    });
  });
  it("rejects bad amounts, odd references and months outside 1-12", () => {
    const r = checkPaymentForm({ amount: "-5", reference: "a b", months: 13 });
    expect(r).toEqual({ ok: false, errors: { amount: "invalid", reference: "invalid", months: "invalid" } });
    expect(checkPaymentForm({ amount: "12.345", reference: "CK12AB99", months: 1 }).ok).toBe(false);
  });
  it("refuses a reference already sent unless it was rejected", () => {
    expect(checkPaymentForm({ amount: "450", reference: "ck12ab34", months: 1 }, history)).toEqual({
      ok: false,
      errors: { reference: "duplicate" },
    });
    expect(checkPaymentForm({ amount: "900", reference: "CK99ZZ01", months: 2 }, history).ok).toBe(true);
  });
  it("returns the RPC arguments with spaces and commas dropped", () => {
    expect(checkPaymentForm({ amount: "1,350", reference: "CK 55 GH 77", months: 3 })).toEqual({
      ok: true,
      args: { p_amount: 1350, p_reference: "CK55GH77", p_months: 3 },
    });
  });
});

describe("helpers", () => {
  it("prices a period from the monthly price", () => {
    expect(expectedAmount({ basic: 450 }, "basic", 3)).toBe(1350);
    expect(expectedAmount({ basic: 450 }, "plus", 3)).toBeNull();
  });
  it("lets owners and managers send", () => {
    expect(["owner", "manager", "staff", null].map(canSubmitPayment)).toEqual([true, true, false, false]);
  });
  it("maps server failures", () => {
    expect(submitErrorKey({ message: "not_allowed" }, 400)).toBe("not_allowed");
    expect(submitErrorKey({ message: "TypeError: Failed to fetch" })).toBe("offline");
    expect(submitErrorKey({ message: "dup", code: "23505" }, 409)).toBe("duplicate");
    expect(submitErrorKey({ message: "new row violates check constraint", code: "23514" }, 400)).toBe("invalid");
    expect(submitErrorKey({ message: "?" }, 500)).toBe("generic");
  });
  it("has every string in every language", () => {
    const keys = Object.keys(subscriptionStrings("en")).sort();
    for (const l of ["am", "om"]) expect(Object.keys(subscriptionStrings(l)).sort()).toEqual(keys);
  });
});

const base: SubscriptionViewProps = {
  lang: "en",
  status: parseBillingStatus({ plan: "basic", status: "grace", paid_until: "2026-11-20", days_left: 4, grace_days: 7 }),
  prices: { basic: 450, plus: 900 },
  payTo: "Galmee (0911 000 000)",
  role: "owner",
  payments: [],
  onSubmit: async () => ({ ok: true }),
};
const html = (over: Partial<SubscriptionViewProps> = {}) => renderToStaticMarkup(createElement(SubscriptionView, { ...base, ...over }));

describe("SubscriptionView", () => {
  it("shows the plan, state, paid-until date, price and how to pay", () => {
    const h = html();
    expect(h).toContain("Basic plan");
    expect(h).toContain("Payment due");
    expect(h).toContain("Paid until");
    expect(h).toContain("450.00 ETB a month");
    expect(h).toContain("Send the amount to Galmee (0911 000 000).");
    expect(h).toContain("Send for confirmation");
    expect(h).toContain("No payments sent yet.");
  });
  it("renders a just-sent payment as a waiting row", () => {
    const sent = pendingPayment({ p_amount: 1350, p_reference: "CK55GH77", p_months: 3 }, new Date("2026-11-23T08:00:00Z"), "p1");
    const h = html({ payments: [sent, ...parsePayments(rows)] });
    expect(h).toContain("1,350.00 ETB");
    expect(h).toContain("CK55GH77");
    expect(h).toContain("Waiting");
    expect(h).toContain("for 3 months");
    expect(h).toContain("Not accepted");
    expect(h).toContain("Amount short");
  });
  it("hides the form from staff and explains why", () => {
    const h = html({ role: "staff", lang: "am" });
    expect(h).not.toContain("ለማረጋገጫ ላክ");
    expect(h).toContain("ባለቤቱ ወይም ሥራ አስኪያጅ ብቻ");
  });
  it("shows the trial countdown and the read-only explanation", () => {
    expect(html({ status: parseBillingStatus({ plan: "basic", status: "trial", days_left: 9, grace_days: 7 }) })).toContain(
      "Free trial: 9 days left",
    );
    expect(html({ lang: "om", status: parseBillingStatus({ plan: "plus", status: "locked", paid_until: "2026-11-01", days_left: 0 }) })).toContain(
      "Ilaaluuf qofa",
    );
  });
});
