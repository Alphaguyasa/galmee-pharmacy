"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { QueueSheet } from "@/components/galmee/queue-sheet";
import { SyncChip } from "@/components/galmee/sync-chip";
import type { QueueEntry } from "@/lib/galmee/offline-queue";
import { startSyncTriggers } from "@/lib/galmee/sync-triggers";
import { useQueueEntries, useSyncState } from "@/lib/galmee/use-sync-state";
import { getOffline } from "@/lib/offline";
import { saleErrorCode } from "@/lib/sale-errors";

/**
 * Header chip for sales waiting on this phone; tap opens the list.
 * Replays on reconnect, focus and every minute, then refreshes the screen so
 * stock and totals show the server's numbers.
 */
export function OfflineSync({
  role,
  className,
  replays = true,
}: {
  role: string;
  className?: string;
  /** The shell shows the chip twice (phone header, desktop sidebar); only one copy runs the replays. */
  replays?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("sell");
  const router = useRouter();
  const [{ queue, engine }] = useState(getOffline);
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(0);
  const state = useSyncState(engine);
  const entries = useQueueEntries(queue, engine, open);
  const refresh = useCallback(() => router.refresh(), [router]);
  useEffect(() => (replays ? startSyncTriggers(engine) : undefined), [engine, replays]);
  useEffect(() => (replays ? engine.onSynced(refresh) : undefined), [engine, replays, refresh]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const summarize = (e: QueueEntry) => {
    const count = Array.isArray(e.args.p_lines) ? e.args.p_lines.length : 0;
    return e.args.p_payment === "credit" ? t("queuedCreditSale", { count }) : t("queuedSale", { count });
  };
  const describeError = (message: string) => {
    const code = saleErrorCode(message);
    return code === "generic" ? t("queueRefused") : t(`error${code}`);
  };

  return (
    <>
      <SyncChip
        state={state}
        lang={locale}
        className={className}
        onOpen={() => {
          setNow(Date.now());
          setOpen(true);
        }}
      />
      <QueueSheet
        open={open}
        onClose={() => setOpen(false)}
        lang={locale}
        entries={entries}
        role={role}
        online={online}
        now={now}
        summarize={summarize}
        describeError={describeError}
        onSendNow={() => void engine.replayNow()}
        onRetry={(seq) => void engine.retry(seq)}
        onDiscard={(e) => void engine.discard(e.seq)}
      />
    </>
  );
}
