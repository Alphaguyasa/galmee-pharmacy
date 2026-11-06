"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; info?: string } | undefined;

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: field(formData, "email"),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return { error: "errorInvalid" };
  redirect("/");
}

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "errorPassword" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email: field(formData, "email"), password });
  if (error) return { error: "errorGeneric" };
  // Email confirmation on: no session yet, the user logs in after confirming.
  if (!data.session) return { info: "checkEmail" };
  redirect("/onboarding");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
