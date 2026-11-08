"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createItem, createSupplier, recordDelivery, type DeliveryResult, type SupplierDTO } from "@/server/dal/purchasing";
import { getSession } from "@/server/dal/session";
import { deliverySchema, itemSchema, supplierSchema } from "@/server/validation";

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

export type ItemFormState = { error?: "errorName" | "errorNumbers" | "errorForbidden" | "errorDuplicateSku" | "errorGeneric" };

/** Blank money fields must fail validation: Number("") would silently become 0. */
function numberField(formData: FormData, name: string): string | number {
  const value = String(formData.get(name) ?? "").trim().replace(",", ".");
  return value === "" ? Number.NaN : value;
}

export async function addItem(_prev: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const parsed = itemSchema.safeParse({
    nameEn: formData.get("nameEn") ?? "",
    nameAm: formData.get("nameAm") ?? "",
    nameOm: formData.get("nameOm") ?? "",
    sku: formData.get("sku") ?? "",
    unit: formData.get("unit") ?? "",
    price: numberField(formData, "price"),
    cost: numberField(formData, "cost"),
    reorderLevel: String(formData.get("reorderLevel") ?? "").trim() === "" ? 0 : numberField(formData, "reorderLevel"),
    tracksExpiry: formData.get("tracksExpiry") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues.some((i) => i.path[0] === "nameEn") ? "errorName" : "errorNumbers" };
  }
  if (!(await canManageStock())) return { error: "errorForbidden" };
  const result = await createItem(parsed.data);
  if (!result.ok) return { error: result.code === "duplicateSku" ? "errorDuplicateSku" : "errorGeneric" };
  revalidatePath("/stock");
  redirect("/stock/receive");
}
