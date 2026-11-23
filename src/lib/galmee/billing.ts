/**
 * Subscription state on the client: the server's `billing_status()` row in
 * plain types, which plan a feature needs, what the banner says, and a small
 * store that keeps the last known state on the device so a till that reloads
 * offline still knows it is locked.
 *
 * The server is the lock: every money RPC refuses writes for a locked tenant.
 * This module only shows that state kindly and stops the till from stacking
 * writes the server will refuse. Self-contained on purpose: other Galmee apps
 * copy src/lib/galmee unchanged and pass their own feature map.
 */
export type BillingPlan = "basic" | "plus";
export type BillingState = "trial" | "active" | "grace" | "locked" | "canceled";
export type BillingLang = "en" | "am" | "om";

export type BillingStatus = {
  plan: BillingPlan;
  status: BillingState;
  /** Last paid day, YYYY-MM-DD (null during a trial that was never paid). */
  paidUntil: string | null;
  /** Days left in the current state (trial, paid period or grace); null when not given. */
  daysLeft: number | null;
  graceDays: number;
};

/** Which plan each gated feature needs. Features not in the map are not gated. */
export type FeatureMap = Record<string, BillingPlan>;

const PLANS: readonly BillingPlan[] = ["basic", "plus"];
const STATES: readonly BillingState[] = ["trial", "active", "grace", "locked", "canceled"];

const toInt = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : null;
};

/**
 * Reads the row `billing_status()` returns (an object, or a one-row array as
 * PostgREST sends set-returning functions). Anything that is not a known plan
 * and state gives null, so the screens never guess a state.
 */
export function parseBillingStatus(data: unknown): BillingStatus | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const plan = r.plan as BillingPlan;
  const status = r.status as BillingState;
  if (!PLANS.includes(plan) || !STATES.includes(status)) return null;
  const paid = typeof r.paid_until === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.paid_until) ? r.paid_until.slice(0, 10) : null;
  const daysLeft = toInt(r.days_left);
  return {
    plan,
    status,
    paidUntil: paid,
    daysLeft: daysLeft === null ? null : Math.max(0, daysLeft),
    graceDays: toInt(r.grace_days) ?? 7,
  };
}

/** Plus includes everything in Basic. */
export function planAllows(plan: BillingPlan, required: BillingPlan): boolean {
  return PLANS.indexOf(plan) >= PLANS.indexOf(required);
}

/**
 * Whether a feature shows. Ungated features always show; a gated Plus feature
 * stays hidden until the plan is known, so it never flashes and disappears.
 * A trial gets Plus, so a new owner sees what they would be paying for.
 */
export function featureAllowed(status: BillingStatus | null, features: FeatureMap, key: string): boolean {
  const required = features[key];
  if (!required || required === "basic") return true;
  if (!status) return false;
  const plan: BillingPlan = status.status === "trial" ? "plus" : status.plan;
  return planAllows(plan, required);
}

/** Locked and canceled tenants are read-only: viewing, export and old receipts still work. */
export function isWriteLocked(status: BillingStatus | null): boolean {
  return status?.status === "locked" || status?.status === "canceled";
}

export type BannerKind = "trial" | "grace" | "locked" | "canceled";
export type BillingBanner = { kind: BannerKind; tone: "neutral" | "warn" | "urgent"; days: number | null };

/**
 * What the banner shows, or null for none. A trial shows only in its last
 * `trialWarnDays` days; grace shows from its first day with the days left;
 * a lock always shows. An active paid period shows nothing.
 */
export function billingBanner(status: BillingStatus | null, trialWarnDays = 7): BillingBanner | null {
  if (!status) return null;
  switch (status.status) {
    case "trial":
      if (status.daysLeft === null || status.daysLeft > trialWarnDays) return null;
      return { kind: "trial", tone: status.daysLeft <= 2 ? "warn" : "neutral", days: status.daysLeft };
    case "grace":
      return { kind: "grace", tone: "warn", days: status.daysLeft };
    case "locked":
      return { kind: "locked", tone: "urgent", days: null };
    case "canceled":
      return { kind: "canceled", tone: "urgent", days: null };
    default:
      return null;
  }
}

export type BillingStrings = {
  trial: (days: number) => string;
  grace: (days: number | null) => string;
  locked: string;
  canceled: string;
  lockedHelp: string;
  howToPay: string;
  upsell: string;
  savedCopy: string;
  plan: Record<BillingPlan, string>;
  state: Record<BillingState, string>;
};

const STRINGS: Record<BillingLang, BillingStrings> = {
  en: {
    trial: (d) => (d === 0 ? "Your free trial ends today." : d === 1 ? "1 day left in your free trial." : `${d} days left in your free trial.`),
    grace: (d) =>
      d === null
        ? "Your subscription has ended. Pay to keep recording."
        : d === 0
          ? "Last day to pay. Tomorrow the app becomes read-only."
          : `Your subscription has ended. ${d === 1 ? "1 day" : `${d} days`} left to pay before the app becomes read-only.`,
    locked: "Read-only: the subscription is not paid.",
    canceled: "This account is closed.",
    lockedHelp: "You can still see every record, export reports and print old receipts. New sales and changes need a paid subscription.",
    howToPay: "How to pay",
    upsell: "Available on the Plus plan",
    savedCopy: "Last known state, not yet checked again",
    plan: { basic: "Basic", plus: "Plus" },
    state: { trial: "Free trial", active: "Paid", grace: "Payment due", locked: "Read-only", canceled: "Closed" },
  },
  am: {
    trial: (d) => (d === 0 ? "የነጻ ሙከራዎ ዛሬ ያበቃል።" : `የነጻ ሙከራዎ ${d} ቀን ቀርቶታል።`),
    grace: (d) =>
      d === null
        ? "የደንበኝነት ክፍያዎ አብቅቷል። መመዝገብ ለመቀጠል ይክፈሉ።"
        : d === 0
          ? "ለመክፈል የመጨረሻው ቀን ዛሬ ነው። ከነገ ጀምሮ መተግበሪያው ለማየት ብቻ ይሆናል።"
          : `የደንበኝነት ክፍያዎ አብቅቷል። መተግበሪያው ለማየት ብቻ ከመሆኑ በፊት ለመክፈል ${d} ቀን ቀርቷል።`,
    locked: "ለማየት ብቻ፦ የደንበኝነት ክፍያ አልተከፈለም።",
    canceled: "ይህ መለያ ተዘግቷል።",
    lockedHelp: "ሁሉንም መዝገቦች ማየት፣ ሪፖርት ማውረድ እና የቆዩ ደረሰኞችን ማተም ይችላሉ። አዲስ ሽያጭ እና ለውጥ የተከፈለ ደንበኝነት ይፈልጋል።",
    howToPay: "እንዴት እንደሚከፈል",
    upsell: "በፕላስ ዕቅድ ላይ ይገኛል",
    savedCopy: "የመጨረሻው የታወቀ ሁኔታ፣ ገና አልተረጋገጠም",
    plan: { basic: "መሰረታዊ", plus: "ፕላስ" },
    state: { trial: "ነጻ ሙከራ", active: "ተከፍሏል", grace: "ክፍያ ይጠበቃል", locked: "ለማየት ብቻ", canceled: "ተዘግቷል" },
  },
  om: {
    trial: (d) => (d === 0 ? "Yaaliin bilisaa keessan har'a xumurama." : `Yaalii bilisaa keessaniif guyyaan ${d} hafeera.`),
    grace: (d) =>
      d === null
        ? "Kaffaltiin keessan xumurameera. Galmeessuu itti fufuuf kaffalaa."
        : d === 0
          ? "Guyyaa kaffaltii isa dhumaa. Boru irraa kaasee appichi ilaaluuf qofa ta'a."
          : `Kaffaltiin keessan xumurameera. Appichi ilaaluuf qofa ta'uu dura kaffaluuf guyyaan ${d} hafeera.`,
    locked: "Ilaaluuf qofa: kaffaltiin hin kaffalamne.",
    canceled: "Akkaawuntiin kun cufameera.",
    lockedHelp: "Galmee hunda ilaaluu, gabaasa baasuu fi nagahee duraanii maxxansuu ni dandeessu. Gurgurtaan haaraa fi jijjiiramni kaffaltii barbaada.",
    howToPay: "Akkamitti akka kaffalamu",
    upsell: "Karoora Plus irratti argama",
    savedCopy: "Haala dhumaa beekame, ammallee hin mirkanoofne",
    plan: { basic: "Bu'uuraa", plus: "Plus" },
    state: { trial: "Yaalii bilisaa", active: "Kaffalameera", grace: "Kaffaltiin eegama", locked: "Ilaaluuf qofa", canceled: "Cufameera" },
  },
};

/** The string table for a language; anything unknown falls back to English. */
export function billingStrings(lang: string): BillingStrings {
  return STRINGS[lang as BillingLang] ?? STRINGS.en;
}

/** The banner's sentence. */
export function bannerText(banner: BillingBanner, t: BillingStrings): string {
  switch (banner.kind) {
    case "trial":
      return t.trial(banner.days ?? 0);
    case "grace":
      return t.grace(banner.days);
    case "locked":
      return t.locked;
    case "canceled":
      return t.canceled;
  }
}

/** Where the last known state is kept. `localStorage` fits; tests pass a Map-backed stand-in. */
export type BillingStorage = Pick<Storage, "getItem" | "setItem">;

export type BillingStoreState = {
  status: BillingStatus | null;
  /** True until the first fetch settles (or a saved copy was found). */
  loading: boolean;
  /** The status is the saved copy: the last fetch failed or has not run yet. */
  stale: boolean;
};

export type BillingStoreOptions = {
  /** Calls `billing_status()`, e.g. `() => supabase.rpc("billing_status")`. */
  fetchStatus: () => Promise<{ data: unknown; error: unknown }>;
  storage?: BillingStorage | null;
  /** Storage key; include the tenant id so two businesses on one phone never mix. */
  storageKey?: string;
};

/**
 * Holds the tenant's billing state. Starts from the saved copy (marked stale),
 * replaces it with each successful fetch, and keeps the saved copy when a
 * fetch fails, so an offline till keeps its last known lock.
 */
export function createBillingStore({ fetchStatus, storage = null, storageKey = "galmee.billing" }: BillingStoreOptions) {
  const read = (): BillingStatus | null => {
    try {
      const raw = storage?.getItem(storageKey);
      if (!raw) return null;
      const saved = JSON.parse(raw) as Record<string, unknown>;
      return parseBillingStatus({
        plan: saved.plan,
        status: saved.status,
        paid_until: saved.paidUntil,
        days_left: saved.daysLeft,
        grace_days: saved.graceDays,
      });
    } catch {
      return null;
    }
  };
  const saved = read();
  let state: BillingStoreState = { status: saved, loading: !saved, stale: !!saved };
  const listeners = new Set<() => void>();
  const set = (next: BillingStoreState) => {
    state = next;
    listeners.forEach((l) => l());
  };

  let running: Promise<BillingStoreState> | null = null;
  const refresh = (): Promise<BillingStoreState> => {
    if (!running) {
      running = (async () => {
        let status: BillingStatus | null = null;
        try {
          const res = await fetchStatus();
          if (!res.error) status = parseBillingStatus(res.data);
        } catch {
          status = null;
        }
        if (status) {
          try {
            storage?.setItem(storageKey, JSON.stringify(status));
          } catch {
            // storage full or blocked: the in-memory state still holds
          }
          set({ status, loading: false, stale: false });
        } else {
          set({ status: state.status, loading: false, stale: state.status !== null });
        }
        return state;
      })().finally(() => {
        running = null;
      });
    }
    return running;
  };

  return {
    refresh,
    getState: (): BillingStoreState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** For the offline queue: true while the last known state is locked or canceled. */
    isLocked: (): boolean => isWriteLocked(state.status),
  };
}

export type BillingStore = ReturnType<typeof createBillingStore>;
