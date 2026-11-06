"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./auth";

export async function createPharmacy(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("pharmacyName") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name || !fullName || !phone) return { error: "error" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_tenant", {
    p_name: name,
    p_vertical: "pharmacy",
    p_full_name: fullName,
    p_phone: phone,
    p_lang: await getLocale(),
  });
  if (error) return { error: "error" };
  redirect("/");
}
