// Receipt check for the public /verify page: decode the signed QR, find the business's public key (saved copy on
// this phone, refreshed from `signing_key_lookup` when online) and check the signature. Copyable as is: depends only
// on signed-receipt.ts and eth-calendar.ts.
//
// Statuses on top of verifyReceipt's:
//   needs_connection  the key is not saved on this phone and the lookup could not run (offline or network error)
// A result checked against a saved key carries `checkedAt` so the page can say how old the key status is
// (a key revoked after that moment is only seen once the phone is online again).

import { addisDay, formatEthDay, type EthLang } from "./eth-calendar";
import {
  type DirectoryKey,
  fromBase64Url,
  type SignedReceiptFacts,
  type SignedReceiptKind,
  toBase64Url,
  verifyReceipt,
  type VerifyStatus,
} from "./signed-receipt";

export type CheckStatus = VerifyStatus | "needs_connection";

export interface CheckResult {
  status: CheckStatus;
  facts?: SignedReceiptFacts;
  /** Set when the key came from this phone's saved copy instead of a fresh lookup (ms since epoch). */
  checkedAt?: number;
}

/** One row of `signing_key_lookup(p_key_ids text[])`. */
export interface KeyRow {
  key_id: string;
  public_key: string; // base64 of the 32 raw bytes
  status: string;
  revoked_at: string | null;
}

export type KeyLookup = (keyIds: string[]) => Promise<KeyRow[]>;

const KEY_ID = /^[0-9a-f]{16}$/;
const STATUSES = new Set<DirectoryKey["status"]>(["active", "retired", "revoked"]);

function b64ToBytes(b64: string): Uint8Array {
  return fromBase64Url(b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
}

/** Drops anything that is not a well-formed key row (bad id, key not 32 bytes, unknown status). */
export function parseKeyRows(rows: unknown): DirectoryKey[] {
  if (!Array.isArray(rows)) return [];
  const out: DirectoryKey[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const { key_id, public_key, status } = r as Record<string, unknown>;
    if (typeof key_id !== "string" || !KEY_ID.test(key_id)) continue;
    if (typeof status !== "string" || !STATUSES.has(status as DirectoryKey["status"])) continue;
    if (typeof public_key !== "string") continue;
    let bytes: Uint8Array;
    try {
      bytes = b64ToBytes(public_key);
    } catch {
      continue;
    }
    if (bytes.length !== 32) continue;
    out.push({ keyId: key_id, publicKey: bytes, status: status as DirectoryKey["status"] });
  }
  return out;
}

// ---------- saved keys (localStorage) ----------

export const KEY_CACHE_STORAGE_KEY = "galmee.verify.keys.v1";
export const KEY_CACHE_MAX = 200;

interface SavedKey {
  k: string; // key id
  p: string; // base64url public key
  s: DirectoryKey["status"];
  t: number; // when the status was last confirmed online
}

export interface KeyCache {
  get(keyId: string): { key: DirectoryKey; checkedAt: number } | null;
  put(keys: DirectoryKey[], now: number): void;
  remove(keyId: string): void;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Saved public keys, newest first, at most KEY_CACHE_MAX. A broken or missing storage just means no saved keys. */
export function createKeyCache(storage: StorageLike | null, storageKey = KEY_CACHE_STORAGE_KEY): KeyCache {
  const load = (): SavedKey[] => {
    try {
      const v = JSON.parse(storage?.getItem(storageKey) ?? "[]");
      return Array.isArray(v) ? v.filter((x) => x && typeof x.k === "string" && typeof x.p === "string") : [];
    } catch {
      return [];
    }
  };
  const save = (list: SavedKey[]) => {
    try {
      storage?.setItem(storageKey, JSON.stringify(list.slice(0, KEY_CACHE_MAX)));
    } catch {
      // storage full or blocked: the check still works online
    }
  };
  return {
    get(keyId) {
      const hit = load().find((x) => x.k === keyId);
      if (!hit) return null;
      const [key] = parseKeyRows([{ key_id: hit.k, public_key: hit.p, status: hit.s }]);
      return key ? { key, checkedAt: Number(hit.t) || 0 } : null;
    },
    put(keys, now) {
      const ids = new Set(keys.map((k) => k.keyId));
      const fresh = keys.map((k) => ({ k: k.keyId, p: toBase64Url(k.publicKey), s: k.status, t: now }));
      save([...fresh, ...load().filter((x) => !ids.has(x.k))]);
    },
    remove(keyId) {
      save(load().filter((x) => x.k !== keyId));
    },
  };
}

// ---------- lookup over the REST RPC endpoint ----------

export const KEY_LOOKUP_TIMEOUT_MS = 6000;

/** Calls `signing_key_lookup` with the publishable key only (no session: the page is public). Throws on failure. */
export function rpcKeyLookup(opts: {
  supabaseUrl: string;
  publishableKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): KeyLookup {
  const f = opts.fetchImpl ?? fetch;
  return async (keyIds) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? KEY_LOOKUP_TIMEOUT_MS);
    try {
      const res = await f(`${opts.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/signing_key_lookup`, {
        method: "POST",
        headers: { apikey: opts.publishableKey, "Content-Type": "application/json" },
        body: JSON.stringify({ p_key_ids: keyIds }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`lookup ${res.status}`);
      const rows = await res.json();
      if (!Array.isArray(rows)) throw new Error("lookup shape");
      return rows as KeyRow[];
    } finally {
      clearTimeout(timer);
    }
  };
}

// ---------- the check ----------

/**
 * Online: always asks the server (so a revoked key shows as revoked) and refreshes the saved copy; a key the server
 * no longer knows is dropped from it. Offline, or when the lookup fails: uses the saved copy, else needs_connection.
 */
export async function checkReceipt(
  qrText: string,
  deps: { cache: KeyCache; lookup: KeyLookup; online: boolean; now?: () => number },
): Promise<CheckResult> {
  const first = await verifyReceipt(qrText, []);
  if (first.status === "malformed" || !first.facts) return { status: "malformed" };
  const keyId = first.facts.keyId;
  const now = deps.now ?? Date.now;

  if (deps.online) {
    let keys: DirectoryKey[] | null = null;
    try {
      keys = parseKeyRows(await deps.lookup([keyId])).filter((k) => k.keyId === keyId);
    } catch {
      keys = null;
    }
    if (keys) {
      if (keys.length) deps.cache.put(keys, now());
      else deps.cache.remove(keyId);
      const r = await verifyReceipt(qrText, keys);
      return { status: r.status, facts: r.facts };
    }
  }

  const saved = deps.cache.get(keyId);
  if (!saved) return { status: "needs_connection", facts: first.facts };
  const r = await verifyReceipt(qrText, [saved.key]);
  return { status: r.status, facts: r.facts, checkedAt: saved.checkedAt };
}

// ---------- words ----------

export type VerifyLang = EthLang;

type Copy = { title: string; body: string };

export interface VerifyStrings {
  pageTitle: string;
  intro: string;
  pasteLabel: string;
  pasteHelp: string;
  check: string;
  checking: string;
  checkAnother: string;
  retry: string;
  business: string;
  receiptNo: string;
  total: string;
  date: string;
  type: string;
  kinds: Record<SignedReceiptKind, string>;
  savedKeyNote: (date: string) => string;
  result: Record<CheckStatus, Copy>;
}

const STRINGS: Record<VerifyLang, VerifyStrings> = {
  en: {
    pageTitle: "Check a receipt",
    intro: "Scan the code on a Galmee receipt with your phone camera to see if the receipt is real.",
    pasteLabel: "Receipt link",
    pasteHelp: "Or paste the link from the code here.",
    check: "Check",
    checking: "Checking…",
    checkAnother: "Check another receipt",
    retry: "Try again",
    business: "Business",
    receiptNo: "Receipt no.",
    total: "Total",
    date: "Date",
    type: "Type",
    kinds: { sale: "Sale", payment: "Payment", certificate: "Certificate", summary: "Summary" },
    savedKeyNote: (d) => `Checked without internet, with the business key saved on this phone on ${d}.`,
    result: {
      valid: { title: "Real receipt", body: "This receipt was issued by the business below and has not been changed." },
      altered: {
        title: "Changed or fake",
        body: "The details in this code do not match the business's signature. Do not accept this receipt.",
      },
      revoked: {
        title: "Key withdrawn",
        body: "The business has withdrawn the key that signed this receipt. Ask the business to confirm it.",
      },
      unknown_key: {
        title: "Not a known business",
        body: "This code was not signed by any business on Galmee. Do not accept this receipt.",
      },
      needs_connection: {
        title: "Connect once to check",
        body: "This phone has not seen this business before. Connect to the internet once and try again.",
      },
      malformed: {
        title: "Not a receipt code",
        body: "This code is not a Galmee receipt, or part of it is missing.",
      },
    },
  },
  am: {
    pageTitle: "ደረሰኝ ያረጋግጡ",
    intro: "ደረሰኙ ትክክለኛ መሆኑን ለማየት በገልሜ ደረሰኝ ላይ ያለውን ኮድ በስልክዎ ካሜራ ይቃኙ።",
    pasteLabel: "የደረሰኝ ሊንክ",
    pasteHelp: "ወይም ከኮዱ የተገኘውን ሊንክ እዚህ ይለጥፉ።",
    check: "አረጋግጥ",
    checking: "በማረጋገጥ ላይ…",
    checkAnother: "ሌላ ደረሰኝ ያረጋግጡ",
    retry: "እንደገና ይሞክሩ",
    business: "ድርጅት",
    receiptNo: "የደረሰኝ ቁጥር",
    total: "ጠቅላላ",
    date: "ቀን",
    type: "ዓይነት",
    kinds: { sale: "ሽያጭ", payment: "ክፍያ", certificate: "ሰርተፊኬት", summary: "ማጠቃለያ" },
    savedKeyNote: (d) => `ያለ ኢንተርኔት ተረጋግጧል፤ በዚህ ስልክ ላይ ${d} የተቀመጠውን የድርጅቱን ቁልፍ በመጠቀም።`,
    result: {
      valid: { title: "ትክክለኛ ደረሰኝ", body: "ይህ ደረሰኝ ከታች ባለው ድርጅት የተሰጠ ሲሆን አልተቀየረም።" },
      altered: { title: "የተቀየረ ወይም ሐሰተኛ", body: "በዚህ ኮድ ውስጥ ያለው መረጃ ከድርጅቱ ፊርማ ጋር አይዛመድም። ይህን ደረሰኝ አይቀበሉ።" },
      revoked: { title: "ቁልፉ ተሰርዟል", body: "ድርጅቱ ይህን ደረሰኝ የፈረመውን ቁልፍ ሰርዞታል። ድርጅቱን ያረጋግጡ።" },
      unknown_key: { title: "የማይታወቅ ድርጅት", body: "ይህ ኮድ በገልሜ ላይ ባለ በየትኛውም ድርጅት አልተፈረመም። ይህን ደረሰኝ አይቀበሉ።" },
      needs_connection: {
        title: "ለማረጋገጥ አንድ ጊዜ ይገናኙ",
        body: "ይህ ስልክ ይህን ድርጅት ከዚህ በፊት አላየውም። አንድ ጊዜ ከኢንተርኔት ጋር ተገናኝተው እንደገና ይሞክሩ።",
      },
      malformed: { title: "የደረሰኝ ኮድ አይደለም", body: "ይህ ኮድ የገልሜ ደረሰኝ አይደለም፣ ወይም ከፊሉ ጠፍቷል።" },
    },
  },
  om: {
    pageTitle: "Nagahee mirkaneessi",
    intro: "Nagaheen dhugaa ta'uu isaa ilaaluuf koodii nagahee Galmee irra jiru kaameraa bilbila keetiin sakatta'i.",
    pasteLabel: "Liinkii nagahee",
    pasteHelp: "Yookaan liinkii koodii irraa argame asitti maxxansi.",
    check: "Mirkaneessi",
    checking: "Mirkaneessaa jira…",
    checkAnother: "Nagahee biraa mirkaneessi",
    retry: "Irra deebi'ii yaali",
    business: "Dhaabbata",
    receiptNo: "Lakk. nagahee",
    total: "Waliigala",
    date: "Guyyaa",
    type: "Gosa",
    kinds: { sale: "Gurgurtaa", payment: "Kaffaltii", certificate: "Ragaa", summary: "Cuunfaa" },
    savedKeyNote: (d) => `Interneetii malee mirkanaa'e, furtuu dhaabbataa bilbila kana irratti ${d} kuufameen.`,
    result: {
      valid: { title: "Nagahee dhugaa", body: "Nagaheen kun dhaabbata armaan gadiitiin kenname, hin jijjiiramne." },
      altered: {
        title: "Jijjiirame yookaan sobaa",
        body: "Odeeffannoon koodii kana keessa jiru mallattoo dhaabbataa wajjin wal hin simu. Nagahee kana hin fudhatin.",
      },
      revoked: {
        title: "Furtuun haqameera",
        body: "Dhaabbatichi furtuu nagahee kana mallatteesse haqeera. Dhaabbata sana gaafadhu.",
      },
      unknown_key: {
        title: "Dhaabbata hin beekamne",
        body: "Koodiin kun dhaabbata Galmee irra jiru kamiinuu hin mallatteeffamne. Nagahee kana hin fudhatin.",
      },
      needs_connection: {
        title: "Mirkaneessuuf al tokko walqunnami",
        body: "Bilbilli kun dhaabbata kana kanaan dura hin argine. Al tokko interneetiin walqunnamii irra deebi'ii yaali.",
      },
      malformed: {
        title: "Koodii nagahee miti",
        body: "Koodiin kun nagahee Galmee miti, yookaan kutaan isaa hir'ateera.",
      },
    },
  },
};

export function verifyLang(lang: string): VerifyLang {
  return lang === "am" || lang === "om" ? lang : "en";
}

export function verifyStrings(lang: string): VerifyStrings {
  return STRINGS[verifyLang(lang)];
}

/** "1,250.50 ETB" / "ብር 1,250.50", the same way the receipt prints it. */
export function formatCents(cents: number, lang: string): string {
  const n = (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return verifyLang(lang) === "am" ? `ብር ${n}` : `${n} ETB`;
}

/** Ethiopian calendar day the receipt was issued (Addis Ababa time). */
export function formatIssued(unixSeconds: number, lang: string): string {
  return formatEthDay(addisDay(new Date(unixSeconds * 1000)), verifyLang(lang));
}

export type ResultTone = "ok" | "urgent" | "warn" | "neutral";

export function resultTone(status: CheckStatus): ResultTone {
  if (status === "valid") return "ok";
  if (status === "altered" || status === "unknown_key") return "urgent";
  if (status === "revoked") return "warn";
  return "neutral";
}
