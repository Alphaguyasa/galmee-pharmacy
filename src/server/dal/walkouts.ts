import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "./session";

export const WALKOUT_RANGES = [7, 30] as const;
export type WalkoutRange = (typeof WALKOUT_RANGES)[number];

export type WalkoutRowDTO = {
  itemId: string | null;
  names: { en: string; am: string | null; om: string | null };
  asks: number;
  qtyAsked: number;
  lastAsked: string;
  price: number | null;
  lostValue: number | null;
  qtyOnHand: number | null;
};

export type WalkoutLogResult = { ok: true; id: string } | { ok: false; code: "invalid" | "limit" | "generic" };

export async function logWalkout(input: { label: string; itemId?: string; qty: number }): Promise<WalkoutLogResult> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ph_log_walkout", {
    p_label: input.label,
    p_item: input.itemId,
    p_qty: input.qty,
  });
  if (error) {
    if (error.message.includes("walkout_cap")) return { ok: false, code: "limit" };
    if (/bad_(label|item|qty)/.test(error.message)) return { ok: false, code: "invalid" };
    return { ok: false, code: "generic" };
  }
  return { ok: true, id: data };
}

/** Undo is allowed by the database for the person who logged it, within 10 minutes. */
export async function undoWalkout(id: string): Promise<boolean> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.from("ph_walkouts").delete().eq("id", id).select("id");
  return !error && (data?.length ?? 0) === 1;
}

export async function walkoutRanking(days: WalkoutRange): Promise<WalkoutRowDTO[]> {
  await getSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ph_walkout_ranking", { p_days: days });
  if (error) throw new Error("walkout_ranking_failed");
  return data.map((row) => ({
    itemId: row.item_id,
    names: { en: row.label, am: row.name_am, om: row.name_om },
    asks: Number(row.asks),
    qtyAsked: Number(row.qty_asked),
    lastAsked: row.last_asked,
    price: row.price,
    lostValue: row.lost_value,
    qtyOnHand: row.qty_on_hand,
  }));
}
