import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  bannerText,
  billingBanner,
  billingStrings,
  createBillingStore,
  featureAllowed,
  isWriteLocked,
  parseBillingStatus,
  planAllows,
  type BillingStatus,
  type FeatureMap,
} from "./billing";
import { createOfflineQueue } from "./offline-queue";
import { createSyncEngine, QueueClosedError, type RpcResult } from "./offline-sync";

const row = (over: Record<string, unknown> = {}) => ({
  plan: "basic",
  status: "active",
  paid_until: "2026-12-10",
  days_left: 17,
  grace_days: 7,
  ...over,
});
const st = (over: Record<string, unknown> = {}) => parseBillingStatus(row(over)) as BillingStatus;

describe("parseBillingStatus", () => {
  it("reads an object or a one-row array", () => {
    const want = { plan: "basic", status: "active", paidUntil: "2026-12-10", daysLeft: 17, graceDays: 7 };
    expect(parseBillingStatus(row())).toEqual(want);
    expect(parseBillingStatus([row()])).toEqual(want);
  });
  it("refuses unknown plans and states instead of guessing", () => {
    expect(parseBillingStatus(row({ plan: "gold" }))).toBeNull();
    expect(parseBillingStatus(row({ status: "paused" }))).toBeNull();
    expect(parseBillingStatus([])).toBeNull();
    expect(parseBillingStatus(null)).toBeNull();
  });
  it("tolerates numeric strings, missing dates and negative days", () => {
    expect(parseBillingStatus(row({ days_left: "3", grace_days: null, paid_until: null }))).toMatchObject({
      daysLeft: 3,
      graceDays: 7,
      paidUntil: null,
    });
    expect(parseBillingStatus(row({ days_left: -2 }))?.daysLeft).toBe(0);
    expect(parseBillingStatus(row({ paid_until: "2026-12-10T00:00:00+03:00" }))?.paidUntil).toBe("2026-12-10");
  });
});

describe("plans and features", () => {
  const features: FeatureMap = { csv_export: "plus", receipts: "basic" };
  it("plus includes basic", () => {
    expect(planAllows("plus", "basic")).toBe(true);
    expect(planAllows("basic", "plus")).toBe(false);
  });
  it("hides a plus feature on basic and shows it on plus", () => {
    expect(featureAllowed(st({ plan: "basic" }), features, "csv_export")).toBe(false);
    expect(featureAllowed(st({ plan: "plus" }), features, "csv_export")).toBe(true);
  });
  it("shows ungated and basic features always, plus features only once the plan is known", () => {
    expect(featureAllowed(null, features, "receipts")).toBe(true);
    expect(featureAllowed(null, features, "anything_else")).toBe(true);
    expect(featureAllowed(null, features, "csv_export")).toBe(false);
  });
  it("gives a trial the plus features", () => {
    expect(featureAllowed(st({ status: "trial", plan: "basic" }), features, "csv_export")).toBe(true);
  });
  it("locks writes only for locked and canceled", () => {
    expect(["trial", "active", "grace", "locked", "canceled"].map((s) => isWriteLocked(st({ status: s })))).toEqual([
      false,
      false,
      false,
      true,
      true,
    ]);
    expect(isWriteLocked(null)).toBe(false);
  });
});

describe("billingBanner", () => {
  it("covers the five states", () => {
    expect(billingBanner(st({ status: "trial", days_left: 12 }))).toBeNull();
    expect(billingBanner(st({ status: "trial", days_left: 5 }))).toEqual({ kind: "trial", tone: "neutral", days: 5 });
    expect(billingBanner(st({ status: "trial", days_left: 1 }))).toEqual({ kind: "trial", tone: "warn", days: 1 });
    expect(billingBanner(st({ status: "active" }))).toBeNull();
    expect(billingBanner(st({ status: "grace", days_left: 4 }))).toEqual({ kind: "grace", tone: "warn", days: 4 });
    expect(billingBanner(st({ status: "locked" }))).toEqual({ kind: "locked", tone: "urgent", days: null });
    expect(billingBanner(st({ status: "canceled" }))).toEqual({ kind: "canceled", tone: "urgent", days: null });
    expect(billingBanner(null)).toBeNull();
  });
  it("words the days in every language", () => {
    const en = billingStrings("en");
    expect(bannerText({ kind: "trial", tone: "neutral", days: 1 }, en)).toBe("1 day left in your free trial.");
    expect(bannerText({ kind: "grace", tone: "warn", days: 0 }, en)).toMatch(/Last day to pay/);
    expect(bannerText({ kind: "grace", tone: "warn", days: 3 }, billingStrings("am"))).toContain("3");
    expect(bannerText({ kind: "grace", tone: "warn", days: 3 }, billingStrings("om"))).toContain("3");
    expect(billingStrings("xx")).toBe(en);
  });
});

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("createBillingStore", () => {
  it("fetches, saves, and starts the next session from the saved copy marked stale", async () => {
    const storage = memoryStorage();
    const a = createBillingStore({ fetchStatus: async () => ({ data: [row({ status: "locked" })], error: null }), storage });
    expect(a.getState()).toEqual({ status: null, loading: true, stale: false });
    await a.refresh();
    expect(a.getState()).toMatchObject({ loading: false, stale: false, status: { status: "locked" } });
    expect(a.isLocked()).toBe(true);

    const b = createBillingStore({ fetchStatus: async () => Promise.reject(new TypeError("Failed to fetch")), storage });
    expect(b.getState()).toMatchObject({ loading: false, stale: true, status: { status: "locked" } });
    expect(b.isLocked()).toBe(true);
    await b.refresh();
    expect(b.getState()).toMatchObject({ stale: true, status: { status: "locked" } });
  });
  it("keeps tenants apart by storage key and treats an error as a failed fetch", async () => {
    const storage = memoryStorage();
    const a = createBillingStore({ fetchStatus: async () => ({ data: row(), error: null }), storage, storageKey: "galmee.billing.t1" });
    await a.refresh();
    const b = createBillingStore({ fetchStatus: async () => ({ data: null, error: { message: "boom" } }), storage, storageKey: "galmee.billing.t2" });
    await b.refresh();
    expect(b.getState()).toEqual({ status: null, loading: false, stale: false });
  });
  it("shares one fetch between overlapping refreshes and tells subscribers", async () => {
    let calls = 0;
    const s = createBillingStore({ fetchStatus: async () => (calls++, { data: row(), error: null }) });
    let told = 0;
    s.subscribe(() => told++);
    await Promise.all([s.refresh(), s.refresh()]);
    expect(calls).toBe(1);
    expect(told).toBe(1);
  });
});

describe("offline queue lock", () => {
  it("throws instead of queuing while locked, holds waiting entries, and lands them once paid", async () => {
    const locked = { v: false };
    const online = { v: false };
    const q = createOfflineQueue({ dbName: "billing-lock", rpcs: ["record_sale"] });
    const seen: string[] = [];
    const engine = createSyncEngine({
      queue: q,
      call: async (_rpc, args): Promise<RpcResult> => (seen.push(String(args.p_client_ref)), { data: null, error: null, status: 200 }),
      isOnline: () => online.v,
      sleep: async () => {},
      isClosed: () => locked.v,
      newRef: () => "ref-1",
    });
    expect(await engine.callOrQueue("record_sale", { p_total: 10 })).toMatchObject({ status: "queued" });

    locked.v = true;
    await expect(engine.callOrQueue("record_sale", { p_total: 20 })).rejects.toBeInstanceOf(QueueClosedError);
    online.v = true;
    expect(await engine.replayNow()).toEqual({ synced: 0, dead: 0, held: true });
    expect(seen).toEqual([]);
    expect((await q.counts()).pending).toBe(1);

    locked.v = false;
    expect(await engine.replayNow()).toMatchObject({ synced: 1, dead: 0 });
    expect(seen).toEqual(["ref-1"]);
    q.close();
  });
});
