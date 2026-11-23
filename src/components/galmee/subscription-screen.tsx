"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { CheckCircle2, Clock, Lock, TriangleAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BirrInput } from "@/components/galmee/birr-input";
import { ListRow, ListSheet } from "@/components/galmee/list-row";
import { StatusBadge } from "@/components/galmee/status-badge";
import { billingStrings, type BillingPlan, type BillingStatus } from "@/lib/galmee/billing";
import {
  canSubmitPayment,
  checkPaymentForm,
  expectedAmount,
  parsePayments,
  submitErrorKey,
  subscriptionStrings,
  type BillingPayment,
  type PaymentArgs,
  type PaymentFormErrors,
  type SubmitErrorKey,
} from "@/lib/galmee/billing-payments";
import { formatEthDay } from "@/lib/galmee/eth-calendar";
import { formatMoney } from "@/lib/galmee/report";
import { useBilling } from "@/lib/galmee/use-billing";

const ethLang = (lang: string) => (lang === "am" || lang === "om" ? lang : "en");
const dayOf = (iso: string) => iso.slice(0, 10);

const STATE_TONE = {
  trial: { tone: "neutral", icon: Clock },
  active: { tone: "ok", icon: CheckCircle2 },
  grace: { tone: "warn", icon: TriangleAlert },
  locked: { tone: "urgent", icon: Lock },
  canceled: { tone: "urgent", icon: Lock },
} as const;

const PAYMENT_TONE = {
  submitted: { tone: "sync", icon: Clock },
  approved: { tone: "ok", icon: CheckCircle2 },
  rejected: { tone: "urgent", icon: XCircle },
} as const;

export type SubmitResult = { ok: true } | { ok: false; error: SubmitErrorKey };

export type SubscriptionViewProps = {
  lang: string;
  status: BillingStatus | null;
  /** Monthly price per plan in birr, from the app's config. */
  prices: Partial<Record<BillingPlan, number>>;
  /** The Telebirr name and number owners pay to, from the app's config. */
  payTo: string;
  role: string | null;
  payments: BillingPayment[];
  onSubmit: (args: PaymentArgs) => Promise<SubmitResult>;
};

/**
 * The subscription screen without data loading: current state, price, the
 * Telebirr steps, the "I have paid" form and the payment history.
 */
export function SubscriptionView({ lang, status, prices, payTo, role, payments, onSubmit }: SubscriptionViewProps) {
  const t = subscriptionStrings(lang);
  const b = billingStrings(lang);
  const el = ethLang(lang);
  const plan = status?.plan ?? "basic";
  const monthly = expectedAmount(prices, plan, 1);
  const stateLook = status ? STATE_TONE[status.status] : null;

  return (
    <div className="grid gap-6">
      <section aria-labelledby="sub-state" className="grid gap-2 rounded-md border bg-card p-4">
        <h2 id="sub-state" className="flex flex-wrap items-center justify-between gap-2 text-lg font-bold">
          {t.planLine(b.plan[plan])}
          {status && stateLook ? (
            <StatusBadge tone={stateLook.tone} icon={stateLook.icon}>
              {b.state[status.status]}
            </StatusBadge>
          ) : null}
        </h2>
        {status?.status === "trial" && status.daysLeft !== null ? (
          <p className="text-sm">{t.trialUntil(status.daysLeft)}</p>
        ) : status?.paidUntil ? (
          <p className="text-sm">{t.paidUntil(formatEthDay(status.paidUntil, el))}</p>
        ) : null}
        {monthly !== null ? <p className="text-sm text-muted-foreground tabular-nums">{t.perMonth(formatMoney(monthly, lang))}</p> : null}
        {status?.status === "locked" ? <p className="text-sm">{b.lockedHelp}</p> : null}
      </section>

      <section aria-labelledby="sub-how" id="pay" className="grid gap-2">
        <h2 id="sub-how" className="text-lg font-bold">
          {t.howTitle}
        </h2>
        <ol className="grid list-decimal gap-1.5 ps-5 text-sm">
          {t.howSteps(payTo).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>

      {canSubmitPayment(role) ? (
        <PaymentFormCard lang={lang} prices={prices} plan={plan} payments={payments} onSubmit={onSubmit} />
      ) : (
        <p className="text-sm text-muted-foreground">{t.ownerOnly}</p>
      )}

      <section aria-labelledby="sub-history" className="grid gap-2">
        <h2 id="sub-history" className="text-lg font-bold">
          {t.history}
        </h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noHistory}</p>
        ) : (
          <ListSheet>
            {payments.map((p) => {
              const look = PAYMENT_TONE[p.status];
              return (
                <ListRow
                  key={p.id}
                  title={<span className="tabular-nums">{formatMoney(p.amount, lang)}</span>}
                  sub={
                    <>
                      <span>
                        {formatEthDay(dayOf(p.createdAt), el, false)} · {t.forMonths(p.months)}
                      </span>
                      <span className="font-mono break-all">{p.reference}</span>
                      {p.note ? <span>{p.note}</span> : null}
                    </>
                  }
                  right={
                    <StatusBadge tone={look.tone} icon={look.icon}>
                      {t.status[p.status]}
                    </StatusBadge>
                  }
                />
              );
            })}
          </ListSheet>
        )}
      </section>
    </div>
  );
}

function PaymentFormCard({
  lang,
  prices,
  plan,
  payments,
  onSubmit,
}: {
  lang: string;
  prices: Partial<Record<BillingPlan, number>>;
  plan: BillingPlan;
  payments: BillingPayment[];
  onSubmit: (args: PaymentArgs) => Promise<SubmitResult>;
}) {
  const t = subscriptionStrings(lang);
  const id = useId();
  const [months, setMonths] = useState(1);
  const expected = expectedAmount(prices, plan, months);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [errors, setErrors] = useState<PaymentFormErrors>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setMessage(null);
    const checked = checkPaymentForm({ amount: amount || (expected !== null ? String(expected) : ""), reference, months }, payments);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    const res = await onSubmit(checked.args);
    setBusy(false);
    if (res.ok) {
      setReference("");
      setAmount("");
      setMessage({ ok: true, text: t.sent });
    } else {
      setMessage({ ok: false, text: t.submitErrors[res.error] });
    }
  };

  const fieldError = (key: keyof PaymentFormErrors) => {
    const k = errors[key];
    if (!k) return null;
    return (
      <p id={`${id}-${key}-err`} className="text-sm font-semibold text-urgent">
        {key === "months" ? t.monthsInvalid : t.fieldErrors[k]}
      </p>
    );
  };

  return (
    <form onSubmit={submit} noValidate aria-labelledby={`${id}-title`} className="grid gap-4 rounded-md border bg-card p-4">
      <h2 id={`${id}-title`} className="text-lg font-bold">
        {t.formTitle}
      </h2>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-months`}>{t.months}</Label>
        <select
          id={`${id}-months`}
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className="h-12 rounded-md border bg-background px-3 text-base"
        >
          {[1, 2, 3, 6, 12].map((n) => (
            <option key={n} value={n}>
              {t.monthsOption(n)}
            </option>
          ))}
        </select>
        {fieldError("months")}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-amount`}>{t.amount}</Label>
        <BirrInput
          id={`${id}-amount`}
          unitLabel={lang === "am" ? "ብር" : "ETB"}
          value={amount}
          placeholder={expected !== null ? String(expected) : undefined}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={!!errors.amount}
          aria-describedby={errors.amount ? `${id}-amount-err` : undefined}
        />
        {expected !== null ? <p className="text-sm text-muted-foreground">{t.amountHint(formatMoney(expected, lang))}</p> : null}
        {fieldError("amount")}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-ref`}>{t.reference}</Label>
        <Input
          id={`${id}-ref`}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="h-12 font-mono text-base"
          aria-invalid={!!errors.reference}
          aria-describedby={errors.reference ? `${id}-ref-err` : `${id}-ref-hint`}
        />
        {errors.reference ? (
          <p id={`${id}-ref-err`} className="text-sm font-semibold text-urgent">
            {t.fieldErrors[errors.reference]}
          </p>
        ) : (
          <p id={`${id}-ref-hint`} className="text-sm text-muted-foreground">
            {t.referenceHint}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" disabled={busy}>
        {busy ? t.sending : t.send}
      </Button>
      {message ? (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm font-semibold text-money-in" : "text-sm font-semibold text-urgent"}>
          {message.text}
        </p>
      ) : null}
    </form>
  );
}

/** A payment just sent, shown as Waiting until the reload brings the server's row. */
export function pendingPayment(args: PaymentArgs, now: Date, id: string): BillingPayment {
  return {
    id,
    amount: args.p_amount,
    reference: args.p_reference,
    months: args.p_months,
    status: "submitted",
    note: null,
    createdAt: now.toISOString(),
  };
}

/**
 * The full screen fed by `useBilling`. The app passes two calls, e.g.
 * `loadPayments = () => supabase.from("billing_payments").select("*").order("created_at", { ascending: false })`
 * and `submitPayment = (a) => supabase.rpc("billing_submit_payment", a)`.
 */
export function SubscriptionScreen({
  lang,
  prices,
  payTo,
  role,
  loadPayments,
  submitPayment,
}: {
  lang: string;
  prices: Partial<Record<BillingPlan, number>>;
  payTo: string;
  role: string | null;
  loadPayments: () => Promise<{ data: unknown; error: unknown }>;
  submitPayment: (args: PaymentArgs) => Promise<{ error: { message?: string | null; code?: string | null } | null; status?: number }>;
}) {
  const billing = useBilling();
  const [payments, setPayments] = useState<BillingPayment[]>([]);

  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let live = true;
    loadPayments().then(
      (res) => {
        if (live && !res.error) setPayments(parsePayments(res.data));
      },
      () => {
        // offline: keep what is shown
      },
    );
    return () => {
      live = false;
    };
  }, [loadPayments, version]);

  const onSubmit = async (args: PaymentArgs): Promise<SubmitResult> => {
    try {
      const res = await submitPayment(args);
      if (res.error) return { ok: false, error: submitErrorKey(res.error, res.status) };
    } catch (e) {
      return { ok: false, error: submitErrorKey({ message: e instanceof Error ? e.message : String(e) }, 0) };
    }
    setPayments((list) => [pendingPayment(args, new Date(), `pending-${args.p_reference}`), ...list]);
    reload();
    void billing.refresh();
    return { ok: true };
  };

  return (
    <SubscriptionView
      lang={lang}
      status={billing.current}
      prices={prices}
      payTo={payTo}
      role={role}
      payments={payments}
      onSubmit={onSubmit}
    />
  );
}
