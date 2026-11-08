"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCustomer, recordRepayment, type RepaymentResult } from "@/server/dal/customers";
import { getSession } from "@/server/dal/session";
import { customerSchema, repaymentSchema } from "@/server/validation";

export type CustomerFormState = { error?: "errorName" | "errorPhone" | "errorLimit" | "errorGeneric" };

export async function addCustomer(_prev: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const limitText = String(formData.get("creditLimit") ?? "").trim().replace(",", ".");
  const parsed = customerSchema.safeParse({
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
    creditLimit: limitText === "" ? undefined : Number(limitText),
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { error: field === "phone" ? "errorPhone" : field === "creditLimit" ? "errorLimit" : "errorName" };
  }
  await getSession();
  const result = await createCustomer(parsed.data);
  if (!result.ok) return { error: "errorGeneric" };
  revalidatePath("/customers");
  redirect(`/customers/${result.id}`);
}

export async function repay(input: unknown): Promise<RepaymentResult> {
  const parsed = repaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "generic" };
  await getSession();
  const result = await recordRepayment(parsed.data);
  if (result.ok) {
    revalidatePath("/customers");
    revalidatePath(`/customers/${parsed.data.customerId}`);
  }
  return result;
}
