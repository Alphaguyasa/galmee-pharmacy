import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { billingBanner, createBillingStore, parseBillingStatus } from "@/lib/galmee/billing";
import { BillingProvider } from "@/lib/galmee/use-billing";
import { BillingBannerView, UpsellLine } from "./billing-banner";
import { PlanGate } from "./plan-gate";

const status = (s: string, plan = "basic", days = 3) =>
  parseBillingStatus({ plan, status: s, paid_until: "2026-12-10", days_left: days, grace_days: 7 });

const view = (s: string, lang = "en", extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(BillingBannerView, { banner: billingBanner(status(s)), lang, howToPayHref: "/settings/subscription", ...extra }),
  );

describe("BillingBannerView", () => {
  it("renders nothing while paid", () => {
    expect(view("active")).toBe("");
  });
  it("counts down the trial and the grace days with a way to pay", () => {
    const trial = view("trial");
    expect(trial).toContain('data-kind="trial"');
    expect(trial).toContain("3 days left in your free trial.");
    expect(trial).toContain('href="/settings/subscription"');
    const grace = view("grace", "am");
    expect(grace).toContain('role="status"');
    expect(grace).toContain("3 ቀን");
    expect(grace).toContain("እንዴት እንደሚከፈል");
  });
  it("explains what still works once read-only, as an alert", () => {
    const html = view("locked", "om");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Ilaaluuf qofa");
    expect(html).toContain("nagahee duraanii");
  });
  it("offers no payment link on a closed account and marks a saved copy", () => {
    const html = view("canceled", "en", { stale: true });
    expect(html).toContain("This account is closed.");
    expect(html).not.toContain("How to pay");
    expect(html).toContain("Last known state");
  });
});

function gated(plan: string, s = "active") {
  const storage = { getItem: () => JSON.stringify(status(s, plan)), setItem: () => {} };
  const store = createBillingStore({ fetchStatus: async () => ({ data: null, error: null }), storage });
  return renderToStaticMarkup(
    createElement(
      BillingProvider,
      { store, features: { csv_export: "plus" } },
      createElement(PlanGate, { feature: "csv_export", fallback: createElement(UpsellLine, { lang: "en" }) }, "EXPORT"),
      createElement(PlanGate, { feature: "receipts" }, "RECEIPTS"),
    ),
  );
}

describe("PlanGate", () => {
  // Plan-by-plan visibility is featureAllowed (billing.test.ts); the server
  // render never knows the plan, so it must not show a Plus feature that the
  // client might then have to take away.
  it("renders a Plus feature as the fallback on the server, whatever the saved plan", () => {
    for (const html of [gated("basic"), gated("plus"), gated("basic", "trial")]) {
      expect(html).not.toContain("EXPORT");
      expect(html).toContain("Available on the Plus plan");
      expect(html).toContain("RECEIPTS");
    }
  });
});
