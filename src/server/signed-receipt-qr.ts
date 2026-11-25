import "server-only";
import { requestSignedQr, type SignedQrResult } from "@/lib/galmee/sign-client";
import type { SignedReceiptKind } from "@/lib/galmee/signed-receipt";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/supabase/env";

/** Verify page printed in every signed receipt QR. Changing it only affects new receipts; keep old addresses working. */
export const VERIFY_BASE = process.env.GALMEE_VERIFY_BASE ?? "https://galmee-pharmacy.vercel.app/verify";

/**
 * Signed receipt codes are printed only once the verify page and its public key list are live, so a customer who
 * scans one never lands on a missing page. Set GALMEE_SIGNED_RECEIPTS=on to turn printing on.
 */
export function signedReceiptsOn(): boolean {
  return process.env.GALMEE_SIGNED_RECEIPTS === "on";
}

/**
 * Signs a receipt as the logged-in user (the signing function checks they belong to the record's business).
 * Returns the QR text, or null so the receipt prints without a code; never throws.
 */
export async function signedReceiptQr(kind: SignedReceiptKind, ref: string): Promise<string | null> {
  if (!signedReceiptsOn()) return null;
  let out: SignedQrResult;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getSession();
    out = await requestSignedQr({
      kind,
      ref,
      accessToken: data.session?.access_token,
      supabaseUrl: SUPABASE_URL,
      verifyBase: VERIFY_BASE,
    });
  } catch {
    return null;
  }
  return out.qr;
}
