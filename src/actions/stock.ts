"use server";

import { revalidatePath } from "next/cache";
import { createSupplier, recordDelivery, type DeliveryResult, type SupplierDTO } from "@/server/dal/purchasing";
import { getSession } from "@/server/dal/session";
import { deliverySchema, supplierSchema } from "@/server/validation";

async function canManageStock() {
  const { profile } = await getSession();
  return profile.role === "owner" || profile.role === "manager";
}

export async function addSupplier(
  input: unknown,
): Promise<{ ok: true; supplier: SupplierDTO } | { ok: false; code: "invalid" | "forbidden" | "duplicate" | "generic" }> {
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };
  if (!(await canManageStock())) return { ok: false, code: "forbidden" };
  return createSupplier(parsed.data);
}

export async function receiveDelivery(input: unknown): Promise<DeliveryResult> {
  const parsed = deliverySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "generic" };
  if (!(await canManageStock())) return { ok: false, code: "forbidden" };
  const result = await recordDelivery(parsed.data);
  if (result.ok) revalidatePath("/stock");
  return result;
}
