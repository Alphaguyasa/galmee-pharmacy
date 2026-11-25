import { describe, expect, it } from "vitest";
import { requestSignedQr, SIGN_FUNCTION_PATH } from "./sign-client";
import { type SignedReceiptFacts, signReceipt, verifyReceipt } from "./signed-receipt";

const SALE = "3f1c2b9a-7d4e-4c1a-9b2f-0a1b2c3d4e5f";
const VERIFY = "https://example.test/verify";

async function makeKey() {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
  const keyId = Array.from(digest.subarray(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
  return { pair, raw, keyId };
}

const facts = (keyId: string, over: Partial<SignedReceiptFacts> = {}): SignedReceiptFacts => ({
  keyId, kind: "sale", receiptNo: "PS-000042", totalCents: 125_000, issuedAt: 1_764_000_000,
  business: "Abdi Pharmacy", ref: SALE, ...over,
});

type Call = { url: string; init: RequestInit };

function fakeFetch(reply: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return reply(call);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const base = { kind: "sale" as const, ref: SALE, accessToken: "jwt-abc", supabaseUrl: "https://p.supabase.co/", verifyBase: VERIFY };

describe("requestSignedQr", () => {
  it("posts kind and ref with the user's token and returns a QR that verifies", async () => {
    const k = await makeKey();
    const envelope = await signReceipt(facts(k.keyId), k.pair.privateKey);
    const f = fakeFetch(() => Response.json({ envelope, keyId: k.keyId, receiptNo: "PS-000042" }));
    const out = await requestSignedQr({ ...base, ref: SALE.toUpperCase(), fetchImpl: f.impl });

    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe(`https://p.supabase.co${SIGN_FUNCTION_PATH}`);
    expect(f.calls[0].init.method).toBe("POST");
    expect((f.calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer jwt-abc");
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({ kind: "sale", ref: SALE });

    expect(out.qr).toBe(`${VERIFY}#${envelope}`);
    if (!out.qr) throw new Error("expected a QR");
    expect(out.receiptNo).toBe("PS-000042");
    const check = await verifyReceipt(out.qr, [{ keyId: k.keyId, publicKey: k.raw, status: "active" }]);
    expect(check.status).toBe("valid");
  });

  it("does not call the server without a token", async () => {
    const f = fakeFetch(() => Response.json({}));
    expect(await requestSignedQr({ ...base, accessToken: null, fetchImpl: f.impl })).toEqual({ qr: null, reason: "no_token" });
    expect(f.calls).toHaveLength(0);
  });

  it.each([
    [401, "unauthorized"],
    [404, "not_found"],
    [409, "no_key"],
    [500, "server"],
    [503, "server"],
  ] as const)("maps HTTP %i to %s and prints without a QR", async (status, reason) => {
    const f = fakeFetch(() => Response.json({ error: "x" }, { status }));
    expect(await requestSignedQr({ ...base, fetchImpl: f.impl })).toEqual({ qr: null, reason });
  });

  it("reports a network failure", async () => {
    const f = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    expect(await requestSignedQr({ ...base, fetchImpl: f.impl })).toEqual({ qr: null, reason: "network" });
  });

  it("gives up after the timeout", async () => {
    const f = fakeFetch(
      ({ init }) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const t0 = Date.now();
    expect(await requestSignedQr({ ...base, fetchImpl: f.impl, timeoutMs: 30 })).toEqual({ qr: null, reason: "timeout" });
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("refuses replies that are not a usable envelope", async () => {
    for (const body of [{}, { envelope: 12 }, { envelope: "not*base64" }, { envelope: "AAAA" }]) {
      const f = fakeFetch(() => Response.json(body));
      expect(await requestSignedQr({ ...base, fetchImpl: f.impl })).toEqual({ qr: null, reason: "bad_reply" });
    }
    const notJson = fakeFetch(() => new Response("<html>", { status: 200 }));
    expect(await requestSignedQr({ ...base, fetchImpl: notJson.impl })).toEqual({ qr: null, reason: "bad_reply" });
  });

  it("never prints an envelope signed for another record or kind", async () => {
    const k = await makeKey();
    const other = await signReceipt(facts(k.keyId, { ref: "00000000-0000-4000-8000-000000000001" }), k.pair.privateKey);
    const f1 = fakeFetch(() => Response.json({ envelope: other }));
    expect(await requestSignedQr({ ...base, fetchImpl: f1.impl })).toEqual({ qr: null, reason: "bad_reply" });

    const payment = await signReceipt(facts(k.keyId, { kind: "payment" }), k.pair.privateKey);
    const f2 = fakeFetch(() => Response.json({ envelope: payment }));
    expect(await requestSignedQr({ ...base, fetchImpl: f2.impl })).toEqual({ qr: null, reason: "bad_reply" });
  });
});
