import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createOfflineQueue, type OfflineQueue } from "@/lib/galmee/offline-queue";
import { createSyncEngine, type RpcResult } from "@/lib/galmee/offline-sync";
import { saleRpcArgs, sendSaleOrQueue, type SaleInput } from "./offline-sale";

let n = 0;
let q: OfflineQueue;
afterEach(async () => q?.close());

/**
 * A fake pharmacy server: records each sale once per client_ref (like the
 * unique index on sales.client_ref), takes stock off, and answers replays
 * with the sale already recorded.
 */
function pharmacy(online = { v: true }) {
  q = createOfflineQueue({ dbName: `ph-sale-test-${++n}`, rpcs: ["ph_record_sale"] });
  let stock = 10;
  const sales = new Map<string, { sale_id: string; total: number }>();
  const order: string[] = [];
  const engine = createSyncEngine({
    queue: q,
    isOnline: () => online.v,
    sleep: async () => {},
    call: async (_rpc, args): Promise<RpcResult> => {
      if (!online.v) return { data: null, error: { message: "TypeError: Failed to fetch" }, status: 0 };
      const ref = String(args.p_client_ref);
      const lines = args.p_lines as { item_id: string; qty: number }[];
      if (lines.some((l) => l.item_id === "gone")) return { data: null, error: { message: "item_not_found" }, status: 400 };
      if (args.p_payment === "credit" && !args.p_override_reason)
        return { data: null, error: { message: "credit_limit", details: "120.00" }, status: 400 };
      let sale = sales.get(ref);
      if (!sale) {
        const qty = lines.reduce((s, l) => s + l.qty, 0);
        stock -= qty;
        sale = { sale_id: `sale-${sales.size + 1}`, total: qty * 25 };
        sales.set(ref, sale);
        order.push(ref);
      }
      return { data: [sale], error: null, status: 200 };
    },
  });
  return { engine, online, sales, order, stock: () => stock };
}

const sale = (clientRef: string, qty = 1, extra: Partial<SaleInput> = {}): SaleInput => ({
  lines: [{ itemId: "para", qty }],
  payment: "cash",
  clientRef,
  ...extra,
});

describe("saleRpcArgs", () => {
  it("sends items and quantities only, and a customer only on credit", () => {
    expect(saleRpcArgs(sale("a", 2, { customerId: "c1" }))).toEqual({
      p_lines: [{ item_id: "para", qty: 2 }],
      p_payment: "cash",
      p_customer: null,
      p_client_ref: "a",
      p_override_reason: null,
    });
    expect(saleRpcArgs(sale("b", 1, { payment: "credit", customerId: "c1", overrideReason: "known" }))).toMatchObject({
      p_customer: "c1",
      p_override_reason: "known",
    });
  });
});

describe("sendSaleOrQueue", () => {
  it("records at once when online", async () => {
    const p = pharmacy();
    expect(await sendSaleOrQueue(p.engine, sale("a", 2))).toEqual({ ok: true, saleId: "sale-1", total: 50 });
    expect(p.stock()).toBe(8);
  });

  it("airplane mode: two sales wait, then land once each, in order, on reconnect", async () => {
    const p = pharmacy({ v: false });
    expect(await sendSaleOrQueue(p.engine, sale("first", 1))).toBe("queued");
    expect(await sendSaleOrQueue(p.engine, sale("second", 3))).toBe("queued");
    // The same sale tapped again offline is not queued twice.
    expect(await sendSaleOrQueue(p.engine, sale("second", 3))).toBe("queued");
    expect((await q.counts()).pending).toBe(2);
    expect(p.sales.size).toBe(0);

    p.online.v = true;
    const report = await p.engine.replayNow();
    expect(report.synced).toBe(2);
    expect(p.order).toEqual(["first", "second"]);
    expect(p.stock()).toBe(6);
    expect((await q.counts()).pending).toBe(0);

    // A replay of a sale the server already has is answered with that sale.
    expect(await sendSaleOrQueue(p.engine, sale("second", 3))).toEqual({ ok: true, saleId: "sale-2", total: 75 });
    expect(p.stock()).toBe(6);
  });

  it("a new sale goes behind older ones still waiting", async () => {
    const p = pharmacy({ v: false });
    await sendSaleOrQueue(p.engine, sale("old"));
    p.online.v = true;
    expect(await sendSaleOrQueue(p.engine, sale("new"))).toBe("queued");
    await p.engine.replayNow();
    expect(p.order).toEqual(["old", "new"]);
  });

  it("gives back the server's refusal in the app's own codes", async () => {
    const p = pharmacy();
    expect(await sendSaleOrQueue(p.engine, { ...sale("x"), lines: [{ itemId: "gone", qty: 1 }] })).toEqual({
      ok: false,
      code: "itemNotFound",
    });
    expect(await sendSaleOrQueue(p.engine, sale("y", 1, { payment: "credit", customerId: "c1" }))).toEqual({
      ok: false,
      code: "creditLimit",
      amountOver: 120,
    });
  });

  it("a refused sale sent later becomes a dead letter and does not hold up the next one", async () => {
    const p = pharmacy({ v: false });
    await sendSaleOrQueue(p.engine, { ...sale("bad"), lines: [{ itemId: "gone", qty: 1 }] });
    await sendSaleOrQueue(p.engine, sale("good", 2));
    p.online.v = true;
    await p.engine.replayNow();
    expect(await q.counts()).toEqual({ pending: 0, dead: 1 });
    const [dead] = await q.list("dead");
    expect(dead.error).toBe("item_not_found");
    expect(p.order).toEqual(["good"]);
  });
});
