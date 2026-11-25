// Asks the galmee-sign function for a signed receipt envelope and turns it into the QR text printed on the receipt.
//
// The caller sends only { kind, ref } with the user's own access token; the function reads the facts (number,
// total, time, business) from the database, so a tampered client cannot get a wrong receipt signed.
// Any failure (offline, slow, no key yet, record not found) gives `qr: null` and the receipt prints without a QR:
// signing never blocks a sale or a reprint.
// Self-contained so other Galmee apps copy src/lib/galmee unchanged.

import { decodeEnvelope, decodePayload, receiptQrText, type SignedReceiptKind } from "./signed-receipt";

export type SignFailure =
  | "no_token"
  | "timeout"
  | "network"
  | "unauthorized"
  | "not_found"
  | "no_key"
  | "server"
  | "bad_reply";

export type SignedQrResult = { qr: string; receiptNo: string } | { qr: null; reason: SignFailure };

export interface SignedQrRequest {
  kind: SignedReceiptKind;
  /** uuid of the sale or payment */
  ref: string;
  accessToken: string | null | undefined;
  /** Supabase project URL, e.g. https://<ref>.supabase.co */
  supabaseUrl: string;
  /** Verify page address printed before the "#" (the envelope stays in the fragment). */
  verifyBase: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export const SIGN_FUNCTION_PATH = "/functions/v1/galmee-sign";
export const SIGN_TIMEOUT_MS = 2500;

function failureFor(status: number): SignFailure {
  if (status === 401) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 409) return "no_key";
  return "server";
}

/**
 * Signs one receipt. The reply is checked before it is printed: the envelope must decode, and its payload must be
 * for the same kind and record that was asked for, so a mixed-up reply never ends up on the wrong receipt.
 */
export async function requestSignedQr(req: SignedQrRequest): Promise<SignedQrResult> {
  if (!req.accessToken) return { qr: null, reason: "no_token" };
  const doFetch = req.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs ?? SIGN_TIMEOUT_MS);
  let res: Response;
  try {
    res = await doFetch(`${req.supabaseUrl.replace(/\/+$/, "")}${SIGN_FUNCTION_PATH}`, {
      method: "POST",
      headers: { authorization: `Bearer ${req.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ kind: req.kind, ref: req.ref.toLowerCase() }),
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch {
    return { qr: null, reason: ctrl.signal.aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) return { qr: null, reason: failureFor(res.status) };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { qr: null, reason: "bad_reply" };
  }
  const envelope = (body as { envelope?: unknown } | null)?.envelope;
  if (typeof envelope !== "string") return { qr: null, reason: "bad_reply" };
  try {
    const facts = decodePayload(decodeEnvelope(envelope).payload);
    if (facts.kind !== req.kind || facts.ref !== req.ref.toLowerCase()) return { qr: null, reason: "bad_reply" };
    return { qr: receiptQrText(req.verifyBase, envelope), receiptNo: facts.receiptNo };
  } catch {
    return { qr: null, reason: "bad_reply" };
  }
}
