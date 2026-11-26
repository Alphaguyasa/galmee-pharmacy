import { describe, expect, it, vi } from "vitest";
import {
  decodeEnvelope,
  encodeEnvelope,
  encodePayload,
  envelopeFromQr,
  receiptQrText,
  type SignedReceiptFacts,
  signReceipt,
} from "./signed-receipt";
import {
  checkReceipt,
  createKeyCache,
  formatCents,
  formatIssued,
  type KeyLookup,
  type KeyRow,
  KEY_CACHE_MAX,
  parseKeyRows,
  resultTone,
  rpcKeyLookup,
  verifyStrings,
} from "./verify-receipt";

async function makeKey() {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
  const keyId = Array.from(digest.subarray(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
  return { pair, raw, keyId };
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const facts = (keyId: string): SignedReceiptFacts => ({
  keyId,
  kind: "sale",
  receiptNo: "S-000123",
  totalCents: 125050,
  issuedAt: 1_795_000_000,
  business: "Abdi Pharmacy",
  ref: "0f8e2a64-1c2b-4d3e-9a7b-5c6d7e8f9a0b",
});

const BASE = "https://galmee-pharmacy.vercel.app/verify";

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

async function setup(status = "active") {
  const k = await makeKey();
  const qr = receiptQrText(BASE, await signReceipt(facts(k.keyId), k.pair.privateKey));
  const row: KeyRow = { key_id: k.keyId, public_key: b64(k.raw), status, revoked_at: null };
  return { k, qr, row };
}

describe("checkReceipt", () => {
  it("valid online, and saves the key for offline use", async () => {
    const { qr, row, k } = await setup();
    const cache = createKeyCache(memoryStorage());
    const lookup = vi.fn<KeyLookup>(async () => [row]);
    const r = await checkReceipt(qr, { cache, lookup, online: true, now: () => 1000 });
    expect(r.status).toBe("valid");
    expect(r.checkedAt).toBeUndefined();
    expect(r.facts?.receiptNo).toBe("S-000123");
    expect(lookup).toHaveBeenCalledWith([k.keyId]);
    expect(cache.get(k.keyId)?.checkedAt).toBe(1000);
  });

  it("valid offline with the saved key, and says when it was saved", async () => {
    const { qr, row } = await setup();
    const cache = createKeyCache(memoryStorage());
    await checkReceipt(qr, { cache, lookup: async () => [row], online: true, now: () => 5000 });
    const lookup = vi.fn<KeyLookup>();
    const r = await checkReceipt(qr, { cache, lookup, online: false });
    expect(r).toMatchObject({ status: "valid", checkedAt: 5000 });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("offline first scan asks to connect once", async () => {
    const { qr } = await setup();
    const r = await checkReceipt(qr, { cache: createKeyCache(memoryStorage()), lookup: vi.fn(), online: false });
    expect(r.status).toBe("needs_connection");
    expect(r.facts?.business).toBe("Abdi Pharmacy");
  });

  it("falls back to the saved key when the lookup fails", async () => {
    const { qr, row } = await setup();
    const cache = createKeyCache(memoryStorage());
    await checkReceipt(qr, { cache, lookup: async () => [row], online: true, now: () => 7 });
    const r = await checkReceipt(qr, {
      cache,
      lookup: async () => {
        throw new Error("network");
      },
      online: true,
    });
    expect(r).toMatchObject({ status: "valid", checkedAt: 7 });
  });

  it("lookup failure with nothing saved -> needs_connection", async () => {
    const { qr } = await setup();
    const r = await checkReceipt(qr, {
      cache: createKeyCache(memoryStorage()),
      lookup: async () => {
        throw new Error("500");
      },
      online: true,
    });
    expect(r.status).toBe("needs_connection");
  });

  it("forged: signed with another key but claiming the business's key id -> altered", async () => {
    const { row, k } = await setup();
    const forger = await makeKey();
    const qr = receiptQrText(BASE, await signReceipt(facts(k.keyId), forger.pair.privateKey));
    const r = await checkReceipt(qr, { cache: createKeyCache(memoryStorage()), lookup: async () => [row], online: true });
    expect(r.status).toBe("altered");
  });

  it("altered: a real receipt with the total changed -> altered", async () => {
    const { qr, row, k } = await setup();
    const { signature } = decodeEnvelope(envelopeFromQr(qr));
    const changed = encodeEnvelope(encodePayload({ ...facts(k.keyId), totalCents: 25050 }), signature);
    const r = await checkReceipt(receiptQrText(BASE, changed), {
      cache: createKeyCache(memoryStorage()),
      lookup: async () => [row],
      online: true,
    });
    expect(r.status).toBe("altered");
    expect(r.facts?.totalCents).toBe(25050);
  });

  it("revoked key online -> revoked, and the saved copy learns it", async () => {
    const { qr, row, k } = await setup();
    const cache = createKeyCache(memoryStorage());
    await checkReceipt(qr, { cache, lookup: async () => [row], online: true });
    const r = await checkReceipt(qr, {
      cache,
      lookup: async () => [{ ...row, status: "revoked", revoked_at: "2026-11-26T10:00:00Z" }],
      online: true,
    });
    expect(r.status).toBe("revoked");
    expect(cache.get(k.keyId)?.key.status).toBe("revoked");
    expect((await checkReceipt(qr, { cache, lookup: vi.fn(), online: false })).status).toBe("revoked");
  });

  it("unknown key online -> unknown_key, and a stale saved copy is dropped", async () => {
    const { qr, row, k } = await setup();
    const cache = createKeyCache(memoryStorage());
    await checkReceipt(qr, { cache, lookup: async () => [row], online: true });
    const r = await checkReceipt(qr, { cache, lookup: async () => [], online: true });
    expect(r.status).toBe("unknown_key");
    expect(cache.get(k.keyId)).toBeNull();
  });

  it("ignores rows for other key ids", async () => {
    const { qr } = await setup();
    const other = await setup();
    const r = await checkReceipt(qr, {
      cache: createKeyCache(memoryStorage()),
      lookup: async () => [other.row],
      online: true,
    });
    expect(r.status).toBe("unknown_key");
  });

  it("malformed codes never call the lookup", async () => {
    const lookup = vi.fn<KeyLookup>();
    for (const t of ["", "hello", `${BASE}#AAAA`, `${BASE}#***`]) {
      const r = await checkReceipt(t, { cache: createKeyCache(null), lookup, online: true });
      expect(r.status).toBe("malformed");
    }
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("parseKeyRows", () => {
  it("keeps good rows and drops bad ones", async () => {
    const { row } = await setup();
    const out = parseKeyRows([
      row,
      { ...row, key_id: "XYZ" },
      { ...row, status: "lost" },
      { ...row, public_key: b64(new Uint8Array(31)) },
      { ...row, public_key: "%%%" },
      null,
      "x",
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].publicKey).toHaveLength(32);
    expect(parseKeyRows({})).toEqual([]);
  });
});

describe("createKeyCache", () => {
  it("survives broken storage and keeps at most KEY_CACHE_MAX keys", async () => {
    const broken = {
      getItem: () => "{not json",
      setItem: () => {
        throw new Error("quota");
      },
    };
    const c = createKeyCache(broken);
    expect(c.get("0011223344556677")).toBeNull();
    const { k } = await setup();
    expect(() => c.put([{ keyId: k.keyId, publicKey: k.raw, status: "active" }], 1)).not.toThrow();

    const s = memoryStorage();
    const big = createKeyCache(s);
    const keys = Array.from({ length: KEY_CACHE_MAX + 5 }, (_, i) => ({
      keyId: i.toString(16).padStart(16, "0"),
      publicKey: k.raw,
      status: "active" as const,
    }));
    big.put(keys, 1);
    expect(JSON.parse(s.m.get("galmee.verify.keys.v1")!)).toHaveLength(KEY_CACHE_MAX);
  });
});

describe("rpcKeyLookup", () => {
  it("posts the key ids with the publishable key and no session", async () => {
    const fetchImpl = vi.fn(async () => new Response("[]", { status: 200 }));
    const lookup = rpcKeyLookup({ supabaseUrl: "https://x.supabase.co/", publishableKey: "pk", fetchImpl });
    expect(await lookup(["0011223344556677"])).toEqual([]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://x.supabase.co/rest/v1/rpc/signing_key_lookup");
    expect(init.headers).toEqual({ apikey: "pk", "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({ p_key_ids: ["0011223344556677"] });
  });

  it("throws on an error status or a bad body", async () => {
    const bad = rpcKeyLookup({ supabaseUrl: "u", publishableKey: "k", fetchImpl: async () => new Response("", { status: 503 }) });
    await expect(bad(["a"])).rejects.toThrow();
    const shape = rpcKeyLookup({ supabaseUrl: "u", publishableKey: "k", fetchImpl: async () => new Response("{}") });
    await expect(shape(["a"])).rejects.toThrow();
  });
});

describe("words and formatting", () => {
  it("has every status in every language", () => {
    for (const lang of ["en", "am", "om"]) {
      const s = verifyStrings(lang);
      for (const st of ["valid", "altered", "revoked", "unknown_key", "needs_connection", "malformed"] as const) {
        expect(s.result[st].title.length).toBeGreaterThan(0);
        expect(s.result[st].body.length).toBeGreaterThan(0);
      }
    }
    expect(verifyStrings("fr").check).toBe("Check");
  });

  it("formats money and the Ethiopian date", () => {
    expect(formatCents(125050, "en")).toBe("1,250.50 ETB");
    expect(formatCents(125050, "am")).toBe("ብር 1,250.50");
    expect(formatIssued(1_795_000_000, "en")).toMatch(/\d{4}/);
  });

  it("tones: never colour alone, but red for fakes", () => {
    expect(resultTone("valid")).toBe("ok");
    expect(resultTone("altered")).toBe("urgent");
    expect(resultTone("unknown_key")).toBe("urgent");
    expect(resultTone("revoked")).toBe("warn");
    expect(resultTone("needs_connection")).toBe("neutral");
  });
});
