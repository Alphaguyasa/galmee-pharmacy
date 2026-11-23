import type { SyncEngine } from "@/lib/galmee/offline-sync";
import { parseAmountOver, saleErrorCode, type SaleErrorCode } from "@/lib/sale-errors";

export type SaleInput = {
  lines: { itemId: string; qty: number }[];
  payment: string;
  customerId?: string;
  clientRef: string;
  overrideReason?: string;
};

export type QueuedSaleResult =
  | { ok: true; saleId: string; total: number }
  | { ok: false; code: SaleErrorCode; amountOver?: number }
  | "queued";

/** The arguments of `ph_record_sale` for a sale from the till; prices come from the database. */
export function saleRpcArgs(input: SaleInput): Record<string, unknown> {
  return {
    p_lines: input.lines.map((l) => ({ item_id: l.itemId, qty: l.qty })),
    p_payment: input.payment,
    p_customer: input.payment === "credit" ? (input.customerId ?? null) : null,
    p_client_ref: input.clientRef,
    p_override_reason: input.overrideReason ?? null,
  };
}

/**
 * Sends a sale through the offline queue: now if the network allows, else it
 * waits on this phone (same client_ref, so it is never recorded twice). A
 * refusal from the server comes back with the same codes as the online path.
 */
export async function sendSaleOrQueue(engine: Pick<SyncEngine, "callOrQueue">, input: SaleInput): Promise<QueuedSaleResult> {
  try {
    const res = await engine.callOrQueue("ph_record_sale", saleRpcArgs(input));
    if (res.status === "queued") return "queued";
    if (res.status === "rejected") {
      const code = saleErrorCode(res.error.message);
      return code === "creditLimit" || code === "overrideNotPermitted"
        ? { ok: false, code, amountOver: parseAmountOver(res.error.details) }
        : { ok: false, code };
    }
    const row = Array.isArray(res.data) ? (res.data[0] as { sale_id?: unknown; total?: unknown } | undefined) : undefined;
    if (!row || typeof row.sale_id !== "string") return { ok: false, code: "generic" };
    return { ok: true, saleId: row.sale_id, total: Number(row.total) };
  } catch {
    return { ok: false, code: "generic" };
  }
}
