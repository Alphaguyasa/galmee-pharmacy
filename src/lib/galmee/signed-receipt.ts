// Signed receipts: a compact payload signed with the business's Ed25519 key, carried in the receipt QR so any phone
// can check it offline against a cached list of business public keys.
//
// Wire format (version 1):
//   payload  = CBOR array [1, keyId (8-byte bstr), kind (uint), receiptNo (tstr), totalCents (uint),
//                          issuedAt (uint, unix seconds), business (tstr, <= 40 chars), ref (16-byte bstr, record uuid)]
//   envelope = CBOR array [payload bytes (bstr), signature (64-byte bstr)]
//   QR text  = "<verify base>#" + base64url(envelope)
// The signature covers the exact payload bytes, so the verifier never re-encodes anything.
// This module is dependency free and runs in the browser, in Node tests and in Deno (Edge Functions).

export const SIGNED_RECEIPT_VERSION = 1;
export const MAX_ENVELOPE_BYTES = 300;

export const RECEIPT_KINDS = { sale: 1, payment: 2, certificate: 3, summary: 4 } as const;
export type SignedReceiptKind = keyof typeof RECEIPT_KINDS;

export interface SignedReceiptFacts {
  keyId: string; // 16 hex chars
  kind: SignedReceiptKind;
  receiptNo: string;
  totalCents: number;
  issuedAt: number; // unix seconds
  business: string;
  ref: string; // uuid of the sale / payment / certificate
}

export type VerifyStatus = "valid" | "altered" | "unknown_key" | "revoked" | "malformed";

export interface DirectoryKey {
  keyId: string;
  publicKey: Uint8Array; // 32 raw bytes
  status: "active" | "retired" | "revoked";
}

export interface VerifyResult {
  status: VerifyStatus;
  facts?: SignedReceiptFacts;
  key?: DirectoryKey;
}

// ---------- minimal CBOR (unsigned ints, byte strings, text strings, arrays) ----------

type CborValue = number | string | Uint8Array | CborValue[];

function head(major: number, n: number, out: number[]): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("cbor: bad length");
  const m = major << 5;
  if (n < 24) out.push(m | n);
  else if (n < 0x100) out.push(m | 24, n);
  else if (n < 0x10000) out.push(m | 25, n >> 8, n & 0xff);
  else if (n < 0x100000000) out.push(m | 26, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
  else {
    const hi = Math.floor(n / 0x100000000), lo = n >>> 0;
    out.push(m | 27, (hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff,
      (lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);
  }
}

function encodeInto(v: CborValue, out: number[]): void {
  if (typeof v === "number") head(0, v, out);
  else if (typeof v === "string") {
    const b = new TextEncoder().encode(v);
    head(3, b.length, out);
    for (const x of b) out.push(x);
  } else if (v instanceof Uint8Array) {
    head(2, v.length, out);
    for (const x of v) out.push(x);
  } else {
    head(4, v.length, out);
    for (const x of v) encodeInto(x, out);
  }
}

export function cborEncode(v: CborValue): Uint8Array<ArrayBuffer> {
  const out: number[] = [];
  encodeInto(v, out);
  return Uint8Array.from(out);
}

export function cborDecode(bytes: Uint8Array): CborValue {
  let i = 0;
  const need = (n: number) => {
    if (i + n > bytes.length) throw new Error("cbor: truncated");
  };
  const read = (depth: number): CborValue => {
    if (depth > 4) throw new Error("cbor: too deep");
    need(1);
    const b = bytes[i++], major = b >> 5, info = b & 31;
    let n: number;
    if (info < 24) n = info;
    else if (info === 24) { need(1); n = bytes[i++]; }
    else if (info === 25) { need(2); n = (bytes[i] << 8) | bytes[i + 1]; i += 2; }
    else if (info === 26) { need(4); n = ((bytes[i] << 24) >>> 0) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3]; i += 4; }
    else if (info === 27) {
      need(8);
      let hi = 0, lo = 0;
      for (let k = 0; k < 4; k++) hi = hi * 256 + bytes[i + k];
      for (let k = 4; k < 8; k++) lo = lo * 256 + bytes[i + k];
      i += 8;
      n = hi * 0x100000000 + lo;
      if (!Number.isSafeInteger(n)) throw new Error("cbor: integer too large");
    } else throw new Error("cbor: unsupported");
    if (major === 0) return n;
    if (major === 2 || major === 3) {
      need(n);
      const s = bytes.slice(i, i + n);
      i += n;
      return major === 2 ? s : new TextDecoder("utf-8", { fatal: true }).decode(s);
    }
    if (major === 4) {
      if (n > 16) throw new Error("cbor: array too long");
      const a: CborValue[] = [];
      for (let k = 0; k < n; k++) a.push(read(depth + 1));
      return a;
    }
    throw new Error("cbor: unsupported");
  };
  const v = read(0);
  if (i !== bytes.length) throw new Error("cbor: trailing bytes");
  return v;
}

// ---------- helpers ----------

export function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error("bad base64url");
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let k = 0; k < out.length; k++) out[k] = parseInt(hex.slice(k * 2, k * 2 + 2), 16);
  return out;
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function uuidToBytes(uuid: string): Uint8Array<ArrayBuffer> {
  return hexToBytes(uuid.replace(/-/g, ""));
}

function bytesToUuid(b: Uint8Array): string {
  const h = bytesToHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function checkFacts(f: SignedReceiptFacts): string | null {
  if (!/^[0-9a-f]{16}$/.test(f.keyId)) return "keyId";
  if (!(f.kind in RECEIPT_KINDS)) return "kind";
  if (!f.receiptNo || f.receiptNo.length > 24) return "receiptNo";
  if (!Number.isSafeInteger(f.totalCents) || f.totalCents < 0) return "totalCents";
  if (!Number.isSafeInteger(f.issuedAt) || f.issuedAt < 1_600_000_000) return "issuedAt";
  if (!f.business || f.business.length > 40) return "business";
  if (!UUID.test(f.ref)) return "ref";
  return null;
}

/** Exact bytes that get signed. Throws on facts that do not fit the format. */
export function encodePayload(f: SignedReceiptFacts): Uint8Array<ArrayBuffer> {
  const bad = checkFacts(f);
  if (bad) throw new Error(`signed receipt: bad ${bad}`);
  return cborEncode([SIGNED_RECEIPT_VERSION, hexToBytes(f.keyId), RECEIPT_KINDS[f.kind], f.receiptNo, f.totalCents,
    f.issuedAt, f.business, uuidToBytes(f.ref.toLowerCase())]);
}

export function decodePayload(bytes: Uint8Array): SignedReceiptFacts {
  const v = cborDecode(bytes);
  if (!Array.isArray(v) || v.length !== 8 || v[0] !== SIGNED_RECEIPT_VERSION) throw new Error("payload shape");
  const [, keyId, kind, receiptNo, totalCents, issuedAt, business, ref] = v;
  if (!(keyId instanceof Uint8Array) || keyId.length !== 8) throw new Error("payload keyId");
  if (!(ref instanceof Uint8Array) || ref.length !== 16) throw new Error("payload ref");
  const kindName = (Object.keys(RECEIPT_KINDS) as SignedReceiptKind[]).find((k) => RECEIPT_KINDS[k] === kind);
  if (!kindName || typeof receiptNo !== "string" || typeof totalCents !== "number" || typeof issuedAt !== "number"
    || typeof business !== "string") throw new Error("payload fields");
  const facts: SignedReceiptFacts = { keyId: bytesToHex(keyId), kind: kindName, receiptNo, totalCents, issuedAt,
    business, ref: bytesToUuid(ref) };
  if (checkFacts(facts)) throw new Error("payload values");
  return facts;
}

export function encodeEnvelope(payload: Uint8Array, signature: Uint8Array): string {
  if (signature.length !== 64) throw new Error("signature length");
  const env = cborEncode([payload, signature]);
  if (env.length > MAX_ENVELOPE_BYTES) throw new Error("envelope too large");
  return toBase64Url(env);
}

export function decodeEnvelope(text: string): { payload: Uint8Array<ArrayBuffer>; signature: Uint8Array<ArrayBuffer> } {
  const bytes = fromBase64Url(text);
  if (bytes.length > MAX_ENVELOPE_BYTES) throw new Error("envelope too large");
  const v = cborDecode(bytes);
  if (!Array.isArray(v) || v.length !== 2 || !(v[0] instanceof Uint8Array) || !(v[1] instanceof Uint8Array)
    || v[1].length !== 64) throw new Error("envelope shape");
  return { payload: Uint8Array.from(v[0]), signature: Uint8Array.from(v[1]) };
}

/** Signs facts with a PKCS#8 Ed25519 private key (server side only). Returns the envelope text for the QR. */
export async function signReceipt(facts: SignedReceiptFacts, privateKey: CryptoKey): Promise<string> {
  const payload = encodePayload(facts);
  const sig = new Uint8Array(await crypto.subtle.sign("Ed25519", privateKey, payload));
  return encodeEnvelope(payload, sig);
}

/** QR text: the verify page URL with the envelope in the fragment (never sent to a server). */
export function receiptQrText(verifyBase: string, envelope: string): string {
  return `${verifyBase.replace(/#.*$/, "")}#${envelope}`;
}

/** Accepts a full QR text (URL with fragment) or a bare envelope. */
export function envelopeFromQr(text: string): string {
  const t = text.trim();
  const hash = t.lastIndexOf("#");
  return hash >= 0 ? t.slice(hash + 1) : t;
}

/** Offline check against a key directory. "altered" = known key, signature does not match the payload. */
export async function verifyReceipt(qrText: string, directory: DirectoryKey[]): Promise<VerifyResult> {
  let env, facts: SignedReceiptFacts;
  try {
    env = decodeEnvelope(envelopeFromQr(qrText));
  } catch {
    return { status: "malformed" };
  }
  try {
    facts = decodePayload(env.payload);
  } catch {
    return { status: "malformed" };
  }
  const key = directory.find((k) => k.keyId === facts.keyId);
  if (!key) return { status: "unknown_key", facts };
  let ok = false;
  try {
    const pub = await crypto.subtle.importKey("raw", Uint8Array.from(key.publicKey), { name: "Ed25519" }, false,
      ["verify"]);
    ok = await crypto.subtle.verify("Ed25519", pub, env.signature, env.payload);
  } catch {
    ok = false;
  }
  if (!ok) return { status: "altered", facts, key };
  if (key.status === "revoked") return { status: "revoked", facts, key };
  return { status: "valid", facts, key };
}
