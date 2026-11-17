"use server";

import { revalidatePath } from "next/cache";
import { logWalkout, undoWalkout, type WalkoutLogResult } from "@/server/dal/walkouts";
import { walkoutIdSchema, walkoutSchema } from "@/server/validation";

/** One tap at the till: a customer asked for a medicine the pharmacy could not sell. */
export async function recordWalkout(input: unknown): Promise<WalkoutLogResult> {
  const parsed = walkoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };
  const result = await logWalkout(parsed.data);
  if (result.ok) revalidatePath("/stock/walkouts");
  return result;
}

export async function cancelWalkout(id: unknown): Promise<boolean> {
  const parsed = walkoutIdSchema.safeParse(id);
  if (!parsed.success) return false;
  const ok = await undoWalkout(parsed.data);
  if (ok) revalidatePath("/stock/walkouts");
  return ok;
}
