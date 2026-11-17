"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { PackageX, Undo2 } from "lucide-react";
import { cancelWalkout, recordWalkout } from "@/actions/walkouts";
import { Button } from "@/components/ui/button";

type State = { kind: "idle" } | { kind: "logged"; id: string } | { kind: "undone" } | { kind: "error"; text: string };

/**
 * "Asked for it, didn't have it": one tap logs the medicine (a listed item, or the words the
 * cashier typed) to the walk-out list, with an undo for a mis-tap.
 */
export function WalkoutButton({ label, itemId, displayName }: { label: string; itemId?: string; displayName: string }) {
  const t = useTranslations("walkouts");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  function log() {
    startTransition(async () => {
      const result = await recordWalkout({ label, itemId, qty: 1 });
      if (result.ok) setState({ kind: "logged", id: result.id });
      else setState({ kind: "error", text: t(result.code === "limit" ? "errorLimit" : "errorLog") });
    });
  }

  function undo(id: string) {
    startTransition(async () => {
      const ok = await cancelWalkout(id);
      setState(ok ? { kind: "undone" } : { kind: "error", text: t("errorUndo") });
    });
  }

  if (state.kind === "logged") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 p-3" role="status">
        <span className="text-sm font-semibold">{t("logged", { name: displayName })}</span>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => undo(state.id)}>
          <Undo2 aria-hidden />
          {t("undo")}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-1">
      <Button type="button" variant="outline" className="h-auto min-h-12 justify-start whitespace-normal py-2 text-left" disabled={pending} onClick={log}>
        <PackageX aria-hidden />
        {t("logButton", { name: displayName })}
      </Button>
      <p aria-live="polite" className={`text-sm empty:hidden ${state.kind === "error" ? "font-semibold text-expiry-red" : "text-muted-foreground"}`}>
        {state.kind === "error" ? state.text : state.kind === "undone" ? t("undone") : ""}
      </p>
    </div>
  );
}
