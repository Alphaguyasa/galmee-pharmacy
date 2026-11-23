/**
 * The subscription screen's data: the owner's Telebirr payments as the server
 * returns them, the form check before `billing_submit_payment`, the server's
 * error codes in plain words, and the screen's am/om/en strings.
 * Self-contained apart from billing.ts, so other Galmee apps copy it unchanged.
 */
import type { BillingLang, BillingPlan } from "./billing";

export type PaymentStatus = "submitted" | "approved" | "rejected";

export type BillingPayment = {
  id: string;
  amount: number;
  reference: string;
  months: number;
  status: PaymentStatus;
  note: string | null;
  createdAt: string;
};

const STATUSES: readonly PaymentStatus[] = ["submitted", "approved", "rejected"];

/** Rows from `billing_payments` (newest first); rows that do not parse are dropped. */
export function parsePayments(data: unknown): BillingPayment[] {
  if (!Array.isArray(data)) return [];
  const out: BillingPayment[] = [];
  for (const r of data as Record<string, unknown>[]) {
    const amount = Number(r?.amount);
    const months = Number(r?.months);
    if (!r || typeof r.id !== "string" || !STATUSES.includes(r.status as PaymentStatus)) continue;
    if (!Number.isFinite(amount) || !Number.isInteger(months) || typeof r.created_at !== "string") continue;
    out.push({
      id: r.id,
      amount,
      reference: String(r.reference ?? ""),
      months,
      status: r.status as PaymentStatus,
      note: typeof r.note === "string" && r.note ? r.note : null,
      createdAt: r.created_at,
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Only owners and managers send payment references (the RPC refuses anyone else). */
export function canSubmitPayment(role: string | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

export type PaymentForm = { amount: string; reference: string; months: number };
export type PaymentFormErrors = Partial<Record<"amount" | "reference" | "months", "required" | "invalid" | "duplicate">>;
export type PaymentArgs = { p_amount: number; p_reference: string; p_months: number };

/**
 * Checks the form the way the server will: amount above zero, a reference
 * (Telebirr ids are letters and digits; spaces typed by hand are dropped and
 * case is kept as typed), 1-12 months, and not a reference already sent and
 * not rejected. Returns the RPC arguments when it passes.
 */
export function checkPaymentForm(
  form: PaymentForm,
  history: BillingPayment[] = [],
): { ok: true; args: PaymentArgs } | { ok: false; errors: PaymentFormErrors } {
  const errors: PaymentFormErrors = {};
  const raw = form.amount.replace(/[,\s]/g, "");
  const amount = Number(raw);
  if (!raw) errors.amount = "required";
  else if (!/^\d+(\.\d{1,2})?$/.test(raw) || !(amount > 0)) errors.amount = "invalid";
  const reference = form.reference.replace(/\s+/g, "");
  if (!reference) errors.reference = "required";
  else if (!/^[A-Za-z0-9-]{4,40}$/.test(reference)) errors.reference = "invalid";
  else if (history.some((p) => p.status !== "rejected" && p.reference.toUpperCase() === reference.toUpperCase()))
    errors.reference = "duplicate";
  if (!Number.isInteger(form.months) || form.months < 1 || form.months > 12) errors.months = "invalid";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, args: { p_amount: amount, p_reference: reference, p_months: form.months } };
}

/** The amount the price table asks for: monthly price times months. */
export function expectedAmount(prices: Partial<Record<BillingPlan, number>>, plan: BillingPlan, months: number): number | null {
  const p = prices[plan];
  return typeof p === "number" && p > 0 ? Math.round(p * months * 100) / 100 : null;
}

export type SubmitErrorKey = "not_allowed" | "invalid" | "duplicate" | "rate_limited" | "offline" | "generic";

/** Maps a failed submit to a message key. */
export function submitErrorKey(error: { message?: string | null; code?: string | null } | null, status?: number): SubmitErrorKey {
  if (status === 0 || /failed to fetch|network/i.test(error?.message ?? "")) return "offline";
  const m = (error?.message ?? "").toLowerCase();
  if (m.includes("not_allowed") || m.includes("forbidden") || status === 403) return "not_allowed";
  if (m.includes("duplicate") || error?.code === "23505") return "duplicate";
  if (m.includes("rate_limited") || status === 429) return "rate_limited";
  if (m.includes("invalid") || m.includes("check constraint") || error?.code === "23514") return "invalid";
  return "generic";
}

export type SubscriptionStrings = {
  title: string;
  planLine: (plan: string) => string;
  paidUntil: (date: string) => string;
  trialUntil: (days: number) => string;
  perMonth: (amount: string) => string;
  howTitle: string;
  howSteps: (payTo: string) => string[];
  formTitle: string;
  months: string;
  monthsOption: (n: number) => string;
  amount: string;
  amountHint: (amount: string) => string;
  reference: string;
  referenceHint: string;
  send: string;
  sending: string;
  sent: string;
  ownerOnly: string;
  history: string;
  noHistory: string;
  status: Record<PaymentStatus, string>;
  forMonths: (n: number) => string;
  fieldErrors: Record<"required" | "invalid" | "duplicate", string>;
  monthsInvalid: string;
  submitErrors: Record<SubmitErrorKey, string>;
};

const STRINGS: Record<BillingLang, SubscriptionStrings> = {
  en: {
    title: "Subscription",
    planLine: (p) => `${p} plan`,
    paidUntil: (d) => `Paid until ${d}`,
    trialUntil: (n) => (n === 1 ? "Free trial: 1 day left" : `Free trial: ${n} days left`),
    perMonth: (a) => `${a} a month`,
    howTitle: "How to pay",
    howSteps: (to) => [
      "Open Telebirr and choose Send money.",
      `Send the amount to ${to}.`,
      "Copy the transaction number from the Telebirr message.",
      "Type it below and send. We confirm within one working day.",
    ],
    formTitle: "I have paid",
    months: "Months",
    monthsOption: (n) => (n === 1 ? "1 month" : `${n} months`),
    amount: "Amount paid",
    amountHint: (a) => `Price for this period: ${a}`,
    reference: "Telebirr transaction number",
    referenceHint: "Letters and numbers from the Telebirr message",
    send: "Send for confirmation",
    sending: "Sending…",
    sent: "Sent. It shows below until it is confirmed.",
    ownerOnly: "Only the owner or a manager can send a payment.",
    history: "Payments",
    noHistory: "No payments sent yet.",
    status: { submitted: "Waiting", approved: "Confirmed", rejected: "Not accepted" },
    forMonths: (n) => (n === 1 ? "for 1 month" : `for ${n} months`),
    fieldErrors: {
      required: "Fill this in.",
      invalid: "Check this value.",
      duplicate: "This transaction number was already sent.",
    },
    monthsInvalid: "Choose 1 to 12 months.",
    submitErrors: {
      not_allowed: "Only the owner or a manager can send a payment.",
      invalid: "The server did not accept these details. Check them and try again.",
      duplicate: "This transaction number was already sent.",
      rate_limited: "Too many tries. Wait a little and try again.",
      offline: "No connection. Send it again when you are online.",
      generic: "It did not go through. Try again.",
    },
  },
  am: {
    title: "የደንበኝነት ክፍያ",
    planLine: (p) => `${p} ዕቅድ`,
    paidUntil: (d) => `እስከ ${d} ተከፍሏል`,
    trialUntil: (n) => `ነጻ ሙከራ፦ ${n} ቀን ቀርቷል`,
    perMonth: (a) => `በወር ${a}`,
    howTitle: "እንዴት እንደሚከፈል",
    howSteps: (to) => [
      "ቴሌብርን ይክፈቱ እና ገንዘብ ላክ የሚለውን ይምረጡ።",
      `መጠኑን ወደ ${to} ይላኩ።`,
      "ከቴሌብር መልዕክት የግብይት ቁጥሩን ይቅዱ።",
      "ከታች ያስገቡት እና ይላኩ። በአንድ የሥራ ቀን ውስጥ እናረጋግጣለን።",
    ],
    formTitle: "ከፍያለሁ",
    months: "ወራት",
    monthsOption: (n) => `${n} ወር`,
    amount: "የተከፈለው መጠን",
    amountHint: (a) => `የዚህ ጊዜ ዋጋ፦ ${a}`,
    reference: "የቴሌብር ግብይት ቁጥር",
    referenceHint: "ከቴሌብር መልዕክት ላይ ያሉ ፊደላት እና ቁጥሮች",
    send: "ለማረጋገጫ ላክ",
    sending: "በመላክ ላይ…",
    sent: "ተልኳል። እስኪረጋገጥ ድረስ ከታች ይታያል።",
    ownerOnly: "ክፍያ መላክ የሚችሉት ባለቤቱ ወይም ሥራ አስኪያጅ ብቻ ናቸው።",
    history: "ክፍያዎች",
    noHistory: "እስካሁን የተላከ ክፍያ የለም።",
    status: { submitted: "በመጠባበቅ ላይ", approved: "ተረጋግጧል", rejected: "አልተቀበለም" },
    forMonths: (n) => `ለ${n} ወር`,
    fieldErrors: {
      required: "ይህን ይሙሉ።",
      invalid: "ይህን ዋጋ ያረጋግጡ።",
      duplicate: "ይህ የግብይት ቁጥር ቀድሞ ተልኳል።",
    },
    monthsInvalid: "ከ1 እስከ 12 ወር ይምረጡ።",
    submitErrors: {
      not_allowed: "ክፍያ መላክ የሚችሉት ባለቤቱ ወይም ሥራ አስኪያጅ ብቻ ናቸው።",
      invalid: "አገልጋዩ እነዚህን ዝርዝሮች አልተቀበለም። ያረጋግጡ እና እንደገና ይሞክሩ።",
      duplicate: "ይህ የግብይት ቁጥር ቀድሞ ተልኳል።",
      rate_limited: "ሙከራዎች በዝተዋል። ትንሽ ቆይተው እንደገና ይሞክሩ።",
      offline: "ግንኙነት የለም። መስመር ላይ ሲሆኑ እንደገና ይላኩ።",
      generic: "አልተሳካም። እንደገና ይሞክሩ።",
    },
  },
  om: {
    title: "Kaffaltii tajaajilaa",
    planLine: (p) => `Karoora ${p}`,
    paidUntil: (d) => `Hanga ${d} kaffalameera`,
    trialUntil: (n) => `Yaalii bilisaa: guyyaan ${n} hafeera`,
    perMonth: (a) => `Ji'atti ${a}`,
    howTitle: "Akkamitti akka kaffalamu",
    howSteps: (to) => [
      "Telebirr banaatii Maallaqa ergi filadhaa.",
      `Maallaqa sana gara ${to} ergaa.`,
      "Lakkoofsa daldalaa ergaa Telebirr irraa garagalchaa.",
      "Asii gadii galchaatii ergaa. Guyyaa hojii tokko keessatti ni mirkaneessina.",
    ],
    formTitle: "Kaffaleera",
    months: "Ji'oota",
    monthsOption: (n) => `Ji'a ${n}`,
    amount: "Maallaqa kaffalame",
    amountHint: (a) => `Gatii yeroo kanaa: ${a}`,
    reference: "Lakkoofsa daldalaa Telebirr",
    referenceHint: "Qubeewwanii fi lakkoofsota ergaa Telebirr irraa",
    send: "Mirkaneessaaf ergi",
    sending: "Ergamaa jira…",
    sent: "Ergameera. Hanga mirkanaa'utti asii gaditti mul'ata.",
    ownerOnly: "Kaffaltii erguu kan danda'u abbaa qabeenyaa ykn hoggantoota qofa.",
    history: "Kaffaltiiwwan",
    noHistory: "Hanga ammaatti kaffaltiin ergame hin jiru.",
    status: { submitted: "Eegaa jira", approved: "Mirkanaa'eera", rejected: "Hin fudhatamne" },
    forMonths: (n) => `ji'a ${n}f`,
    fieldErrors: {
      required: "Kana guutaa.",
      invalid: "Gatii kana mirkaneeffadhaa.",
      duplicate: "Lakkoofsi daldalaa kun duraan ergameera.",
    },
    monthsInvalid: "Ji'a 1 hanga 12 filadhaa.",
    submitErrors: {
      not_allowed: "Kaffaltii erguu kan danda'u abbaa qabeenyaa ykn hoggantoota qofa.",
      invalid: "Sarvarichi odeeffannoo kana hin fudhanne. Mirkaneeffadhaatii irra deebi'aa yaalaa.",
      duplicate: "Lakkoofsi daldalaa kun duraan ergameera.",
      rate_limited: "Yaaliin baay'ateera. Xiqqoo eegaatii irra deebi'aa yaalaa.",
      offline: "Walqunnamtiin hin jiru. Yeroo toora irra jirtan irra deebi'aa ergaa.",
      generic: "Hin milkoofne. Irra deebi'aa yaalaa.",
    },
  },
};

export function subscriptionStrings(lang: string): SubscriptionStrings {
  return STRINGS[lang as BillingLang] ?? STRINGS.en;
}
