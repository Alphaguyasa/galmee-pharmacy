import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "./session";

export type SupplierDTO = { id: string; name: string };
export type ReceivableItemDTO = {
  id: string;
  names: { en: string; am: string | null; om: string | null };
  sku: string | null;
  unit: string;
  cost: number;
  tracksExpiry: boolean;
};
export type DeliveryLine = {
  itemId: string;
  qty: number;
  unitCost: number;
  batchNo?: string;
  expiryDate?: string;
};
export type DeliveryResult =
  | { ok: true }
  | { ok: false; code: "expired" | "expiryRequired" | "forbidden" | "notFound" | "generic" };

const DELIVERY_ERRORS: Record<string, Exclude<DeliveryResult, { ok: true }>["code"]> = {
  already_expired: "expired",
  expiry_required: "expiryRequired",
  owner_or_manager_only: "forbidden",
  supplier_not_found: "notFound",
  item_not_found: "notFound",
};

export async function listSuppliers(): Promise<SupplierDTO[]> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ph_suppliers")
    .select("id, name")
    .eq("active", true)
    .order("name")
    .limit(500);
  if (error) throw new Error("suppliers_failed");
  return data;
}

export async function listReceivableItems(): Promise<ReceivableItemDTO[]> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select("id, name_en, name_am, name_om, sku, unit, cost, tracks_expiry")
    .eq("active", true)
    .order("name_en")
    .limit(2000);
  if (error) throw new Error("items_failed");
  return data.map((row) => ({
    id: row.id,
    names: { en: row.name_en, am: row.name_am, om: row.name_om },
    sku: row.sku,
    unit: row.unit,
    cost: row.cost,
    tracksExpiry: row.tracks_expiry,
  }));
}

export async function createSupplier(input: {
  name: string;
  phone?: string;
}): Promise<{ ok: true; supplier: SupplierDTO } | { ok: false; code: "duplicate" | "generic" }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ph_suppliers")
    .insert({ name: input.name, phone: input.phone || null })
    .select("id, name")
    .single();
  if (error) return { ok: false, code: error.code === "23505" ? "duplicate" : "generic" };
  return { ok: true, supplier: data };
}

export async function createItem(input: {
  nameEn: string;
  nameAm?: string;
  nameOm?: string;
  sku?: string;
  unit: string;
  price: number;
  cost: number;
  reorderLevel: number;
  tracksExpiry: boolean;
}): Promise<{ ok: true } | { ok: false; code: "duplicateSku" | "generic" }> {
  const supabase = await createClient();
  const { error } = await supabase.from("items").insert({
    name_en: input.nameEn,
    name_am: input.nameAm ?? null,
    name_om: input.nameOm ?? null,
    sku: input.sku ?? null,
    unit: input.unit,
    price: input.price,
    cost: input.cost,
    reorder_level: input.reorderLevel,
    tracks_expiry: input.tracksExpiry,
  });
  if (!error) return { ok: true };
  return { ok: false, code: error.code === "23505" ? "duplicateSku" : "generic" };
}

export async function recordDelivery(input: {
  supplierId: string;
  clientRef: string;
  lines: DeliveryLine[];
}): Promise<DeliveryResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("ph_receive_delivery", {
    p_supplier: input.supplierId,
    p_client_ref: input.clientRef,
    p_lines: input.lines.map((line) => ({
      item_id: line.itemId,
      qty: line.qty,
      unit_cost: line.unitCost,
      batch_no: line.batchNo ?? null,
      expiry_date: line.expiryDate ?? null,
    })),
  });
  if (!error) return { ok: true };
  return { ok: false, code: DELIVERY_ERRORS[error.message] ?? "generic" };
}
