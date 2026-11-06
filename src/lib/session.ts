import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Current user, profile and tenant for this request. Redirects when missing. */
export const getSessionContext = cache(async () => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, tenant_id, full_name, role, active")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, logo_url, default_lang, vertical")
    .eq("id", profile.tenant_id)
    .single();
  if (!tenant) redirect("/onboarding");

  return { supabase, userId, profile, tenant };
});
