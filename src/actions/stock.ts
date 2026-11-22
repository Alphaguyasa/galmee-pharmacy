"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createItem, createItems, createSupplier, listItemSkus, recordDelivery, type DeliveryResult, type SupplierDTO } from "@/server/dal/purchasing";
import { getSession } from "@/server/dal/session";
import { writeOffExpiredStock } from "@/server/dal/stock";
import { previewItemImport, type ImportPreview } from "@/lib/item-import";
import { deliverySchema, itemSchema, supplierSchema, writeOffSchema } from "@/server/validation";

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

export async function writeOffExpired(input: unknown): Promise<boolean> {
  const parsed = writeOffSchema.safeParse(input);
  if (!parsed.success) return false;
  if (!(await canManageStock())) return false;
  const ok = await writeOffExpiredStock(parsed.data.itemId);
  if (ok) revalidatePath("/stock");
  return ok;
}

/** A spreadsheet export of 500 rows is far below this; anything bigger is not an item list. */
const IMPORT_MAX_CHARS = 1_000_000;

export type ImportResult =
  | { ok: true; count: number }
  | { ok: false; code: "invalid" | "forbidden" | "nothing" | "changed" | "duplicateSku" | "generic" };

/** Checks an item sheet (CSV text) and says what would be created; saves nothing. */
export async function checkItemImport(text: unknown): Promise<ImportPreview | { ok: false; error: "forbidden" | "tooBig" }> {
  if (typeof text !== "string" || text.length > IMPORT_MAX_CHARS) return { ok: false, error: "tooBig" };
  if (!(await canManageStock())) return { ok: false, error: "forbidden" };
  return previewItemImport(text, await listItemSkus());
}

/**
 * Creates the good rows of the sheet. The text is checked again here, never trusted from the
 * browser; `expected` is the count the owner confirmed, so a sheet that changed meanwhile is refused.
 */
export async function importItems(text: unknown, expected: unknown): Promise<ImportResult> {
  if (typeof text !== "string" || text.length > IMPORT_MAX_CHARS || !Number.isInteger(expected)) {
    return { ok: false, code: "invalid" };
  }
  if (!(await canManageStock())) return { ok: false, code: "forbidden" };
  const preview = previewItemImport(text, await listItemSkus());
  if (!preview.ok) return { ok: false, code: "invalid" };
  if (preview.items.length === 0) return { ok: false, code: "nothing" };
  if (preview.items.length !== expected) return { ok: false, code: "changed" };
  const result = await createItems(preview.items.map((r) => r.item));
  if (result.ok) revalidatePath("/stock");
  return result;
}
