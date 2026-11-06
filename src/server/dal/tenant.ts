import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/config";

/** Creates the pharmacy tenant and makes the caller its owner (core RPC `create_tenant`). */
export async function createPharmacyTenant(input: {
  name: string;
  fullName: string;
  phone: string;
  lang: Locale;
}): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_tenant", {
    p_name: input.name,
    p_vertical: "pharmacy",
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_lang: input.lang,
  });
  return { ok: !error };
}
