"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, CircleHelp, ShieldAlert, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  type CheckResult,
  type CheckStatus,
  checkReceipt,
  createKeyCache,
  formatCents,
  formatIssued,
  type KeyLookup,
  resultTone,
  rpcKeyLookup,
  verifyStrings,
} from "@/lib/galmee/verify-receipt";
import { addisDay, formatEthDay, type EthLang } from "@/lib/galmee/eth-calendar";

const ICONS: Record<CheckStatus, typeof CircleCheck> = {
  valid: CircleCheck,
  altered: ShieldAlert,
  unknown_key: ShieldAlert,
  revoked: CircleAlert,
  needs_connection: WifiOff,
  malformed: CircleHelp,
};

const TONE_CLASSES = {
  ok: "border-money-in/40 bg-money-in/10 text-money-in",
  urgent: "border-urgent/40 bg-urgent/10 text-urgent",
  warn: "border-warn/40 bg-warn/10 text-warn",
  neutral: "border-border bg-muted text-foreground",
} as const;

/** Result screen: an icon and a sentence (never colour alone), then the signed facts read from the code itself. */
export function VerifyResultView({
  lang,
  result,
  onAgain,
  onRetry,
}: {
  lang: string;
  result: CheckResult;
  onAgain: () => void;
  onRetry?: () => void;
}) {
  const s = verifyStrings(lang);
  const copy = s.result[result.status];
  const Icon = ICONS[result.status];
  const tone = resultTone(result.status);
  const f = result.facts;
  // Facts of a code that failed the check are shown struck through: they are what the code claims, not the truth.
  const trusted = result.status === "valid";
  const showFacts = f && result.status !== "malformed" && result.status !== "unknown_key";

  return (
    <section aria-live="polite" aria-labelledby="verify-result" className="grid gap-4">
      <div className={cn("grid gap-2 rounded-md border p-4", TONE_CLASSES[tone])}>
        <div className="flex items-center gap-2">
          <Icon aria-hidden className="size-7 shrink-0" />
          <h2 id="verify-result" className="text-xl font-bold">
            {copy.title}
          </h2>
        </div>
        <p className="text-foreground">{copy.body}</p>
      </div>

      {showFacts && (
        <dl className={cn("grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-md border p-4", !trusted && "opacity-80")}>
          {(
            [
              [s.business, f.business],
              [s.type, s.kinds[f.kind]],
              [s.receiptNo, f.receiptNo],
              [s.total, formatCents(f.totalCents, lang)],
              [s.date, formatIssued(f.issuedAt, lang)],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className={cn("font-semibold tabular-nums break-words", !trusted && "line-through")}>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {result.checkedAt !== undefined && (
        <p className="text-sm text-muted-foreground">
          {s.savedKeyNote(formatEthDay(addisDay(new Date(result.checkedAt)), lang as EthLang))}
        </p>
      )}

      <div className="grid gap-2">
        {onRetry && result.status === "needs_connection" && (
          <Button type="button" onClick={onRetry} className="h-12">
            {s.retry}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onAgain} className="h-12">
          {s.checkAnother}
        </Button>
      </div>
    </section>
  );
}

/** The empty state: how to scan, plus a paste field for a link copied from a chat. */
export function VerifyPasteForm({ lang, onCheck }: { lang: string; onCheck: (text: string) => void }) {
  const s = verifyStrings(lang);
  const [text, setText] = useState("");
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onCheck(text.trim());
      }}
    >
      <p className="text-muted-foreground">{s.intro}</p>
      <div className="grid gap-1.5">
        <Label htmlFor="verify-link">{s.pasteLabel}</Label>
        <Input
          id="verify-link"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          inputMode="url"
          className="h-12"
        />
        <p className="text-sm text-muted-foreground">{s.pasteHelp}</p>
      </div>
      <Button type="submit" className="h-12" disabled={!text.trim()}>
        {s.check}
      </Button>
    </form>
  );
}

/**
 * /verify: the receipt code opens this page with the signed envelope in the URL fragment, which the browser never
 * sends to a server. Everything is checked here on the phone; only the key id goes to `lookup`.
 */
export function VerifyScreen({
  lang,
  supabaseUrl,
  publishableKey,
  lookup: lookupOverride,
}: {
  lang: string;
  supabaseUrl: string;
  /** The publishable key only: the page is public and never has a session. */
  publishableKey: string;
  lookup?: KeyLookup;
}) {
  const s = verifyStrings(lang);
  const lookup = useMemo(
    () => lookupOverride ?? rpcKeyLookup({ supabaseUrl, publishableKey }),
    [lookupOverride, supabaseUrl, publishableKey],
  );
  const cache = useMemo(() => createKeyCache(typeof window === "undefined" ? null : safeLocalStorage()), []);
  const [input, setInput] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (text: string) => {
      setBusy(true);
      try {
        setResult(await checkReceipt(text, { cache, lookup, online: navigator.onLine }));
      } finally {
        setBusy(false);
      }
    },
    [cache, lookup],
  );

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      setInput(h || null);
      setResult(null);
      if (h) void run(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [run]);

  const again = () => {
    history.replaceState(null, "", window.location.pathname + window.location.search);
    setInput(null);
    setResult(null);
  };

  return (
    <section aria-labelledby="verify-title" className="grid gap-4">
      <h1 id="verify-title" className="text-xl font-bold">
        {s.pageTitle}
      </h1>
      {busy && (
        <p role="status" className="text-muted-foreground">
          {s.checking}
        </p>
      )}
      {!busy && result && (
        <VerifyResultView lang={lang} result={result} onAgain={again} onRetry={() => {
            if (input) void run(input);
          }} />
      )}
      {!busy && !result && (
        <VerifyPasteForm
          lang={lang}
          onCheck={(t) => {
            setInput(t);
            void run(t);
          }}
        />
      )}
    </section>
  );
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
