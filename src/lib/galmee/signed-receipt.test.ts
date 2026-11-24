import { describe, expect, it } from "vitest";
import {
  cborDecode,
  cborEncode,
  decodeEnvelope,
  decodePayload,
  type DirectoryKey,
  encodeEnvelope,
  encodePayload,
  envelopeFromQr,
  fromBase64Url,
  MAX_ENVELOPE_BYTES,
  receiptQrText,
  type SignedReceiptFacts,
  signReceipt,
  toBase64Url,
  verifyReceipt,
} from "./signed-receipt";

async function makeKey() {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
  const keyId = Array.from(digest.subarray(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
  return { pair, raw, keyId };
}

const base = (keyId: string): SignedReceiptFacts => ({
  keyId,
  kind: "sale",
  receiptNo: "PH-000123",
  totalCents: 45_000,
  issuedAt: 1_795_536_000,
  business: "ገልሜ Pharmacy Adama",
  ref: "6f1c2a9e-3b4d-4e5f-8a6b-7c8d9e0f1a2b",
});

describe("cbor", () => {
  it("round-trips ints at every length boundary, strings, bytes and nested arrays", () => {
    const v = [0, 23, 24, 255, 256, 65_535, 65_536, 4_294_967_295, 4_294_967_296, Number.MAX_SAFE_INTEGER, "", "ሰላም",
      new Uint8Array([1, 2, 3]), [1, ["x"]]];
    expect(cborDecode(cborEncode(v))).toEqual(v);
  });
  it("uses the shortest head (RFC 8949 example bytes)", () => {
    expect(Array.from(cborEncode(500))).toEqual([0x19, 0x01, 0xf4]);
    expect(Array.from(cborEncode([1, "a"]))).toEqual([0x82, 0x01, 0x61, 0x61]);
  });
  it("rejects truncated, trailing and unsupported input", () => {
    expect(() => cborDecode(new Uint8Array([0x19, 0x01]))).toThrow("truncated");
    expect(() => cborDecode(new Uint8Array([0x01, 0x02]))).toThrow("trailing");
    expect(() => cborDecode(new Uint8Array([0x20]))).toThrow("unsupported"); // negative int
    expect(() => cborDecode(new Uint8Array([0x62, 0xff, 0xfe]))).toThrow(); // invalid utf-8
  });
});

describe("payload and envelope", () => {
  it("round-trips the facts and stays QR-sized with the longest business name", async () => {
    const { keyId } = await makeKey();
    const f = { ...base(keyId), business: "x".repeat(40), receiptNo: "R".repeat(24), totalCents: 9_999_999_999 };
    expect(decodePayload(encodePayload(f))).toEqual(f);
    const env = encodeEnvelope(encodePayload(f), new Uint8Array(64));
    expect(fromBase64Url(env).length).toBeLessThanOrEqual(MAX_ENVELOPE_BYTES);
    expect(decodeEnvelope(env).signature.length).toBe(64);
  });
  it("refuses facts that do not fit", () => {
    const f = base("0011223344556677");
    expect(() => encodePayload({ ...f, keyId: "xyz" })).toThrow("bad keyId");
    expect(() => encodePayload({ ...f, totalCents: -1 })).toThrow("bad totalCents");
    expect(() => encodePayload({ ...f, totalCents: 1.5 })).toThrow("bad totalCents");
    expect(() => encodePayload({ ...f, business: "x".repeat(41) })).toThrow("bad business");
    expect(() => encodePayload({ ...f, ref: "not-a-uuid" })).toThrow("bad ref");
  });
  it("base64url has no padding or + /, and the QR text carries the envelope in the fragment", () => {
    const t = toBase64Url(new Uint8Array([251, 255, 254, 0]));
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Array.from(fromBase64Url(t))).toEqual([251, 255, 254, 0]);
    const qr = receiptQrText("https://example.test/verify#old", "abc");
    expect(qr).toBe("https://example.test/verify#abc");
    expect(envelopeFromQr(` ${qr} `)).toBe("abc");
    expect(envelopeFromQr("abc")).toBe("abc");
  });
});

describe("sign and verify", () => {
  it("valid receipt verifies offline; revoked key says revoked; unknown key says unknown_key", async () => {
    const k = await makeKey();
    const qr = receiptQrText("https://example.test/verify", await signReceipt(base(k.keyId), k.pair.privateKey));
    const dir: DirectoryKey[] = [{ keyId: k.keyId, publicKey: k.raw, status: "retired" }];
    const ok = await verifyReceipt(qr, dir);
    expect(ok.status).toBe("valid"); // a retired key still vouches for receipts it signed
    expect(ok.facts).toEqual(base(k.keyId));
    expect((await verifyReceipt(qr, [{ ...dir[0], status: "revoked" }])).status).toBe("revoked");
    expect((await verifyReceipt(qr, [])).status).toBe("unknown_key");
  });
  it("altered amount is caught", async () => {
    const k = await makeKey();
    const env = decodeEnvelope(await signReceipt(base(k.keyId), k.pair.privateKey));
    const changed = encodePayload({ ...base(k.keyId), totalCents: 95_000 });
    const res = await verifyReceipt(encodeEnvelope(changed, env.signature), [{ keyId: k.keyId, publicKey: k.raw, status: "active" }]);
    expect(res.status).toBe("altered");
    expect(res.facts?.totalCents).toBe(95_000);
  });
  it("forged receipt (signed by another key, claiming this business's key id) is caught", async () => {
    const real = await makeKey();
    const forger = await makeKey();
    const qr = await signReceipt(base(real.keyId), forger.pair.privateKey);
    expect((await verifyReceipt(qr, [{ keyId: real.keyId, publicKey: real.raw, status: "active" }])).status).toBe("altered");
  });
  it("garbage, a flipped signature bit and an oversize code are malformed or altered, never valid", async () => {
    const k = await makeKey();
    const dir: DirectoryKey[] = [{ keyId: k.keyId, publicKey: k.raw, status: "active" }];
    expect((await verifyReceipt("https://x.test/v#%%%", dir)).status).toBe("malformed");
    expect((await verifyReceipt("", dir)).status).toBe("malformed");
    expect((await verifyReceipt(toBase64Url(new Uint8Array(301)), dir)).status).toBe("malformed");
    const env = decodeEnvelope(await signReceipt(base(k.keyId), k.pair.privateKey));
    env.signature[0] ^= 1;
    expect((await verifyReceipt(encodeEnvelope(env.payload, env.signature), dir)).status).toBe("altered");
  });
});
