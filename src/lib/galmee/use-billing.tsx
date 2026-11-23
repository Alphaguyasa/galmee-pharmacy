"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  featureAllowed,
  isWriteLocked,
  type BillingPlan,
  type BillingState,
  type BillingStatus,
  type BillingStore,
  type BillingStoreState,
  type FeatureMap,
} from "./billing";

type BillingContextValue = { store: BillingStore; features: FeatureMap };

const BillingContext = createContext<BillingContextValue | null>(null);

const SERVER_STATE: BillingStoreState = { status: null, loading: true, stale: false };
const noopSubscribe = () => () => {};
const serverState = () => SERVER_STATE;

/**
 * Mount once near the top of the signed-in app with the app's store and its
 * feature map (`{ csv_export: "plus" }`). Fetches the state on mount and
 * again whenever the tab comes back to the foreground or the phone reconnects.
 */
export function BillingProvider({
  store,
  features,
  children,
}: {
  store: BillingStore;
  features: FeatureMap;
  children?: React.ReactNode;
}) {
  useEffect(() => {
    void store.refresh();
    const again = () => {
      if (document.visibilityState === "visible") void store.refresh();
    };
    window.addEventListener("online", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("online", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [store]);
  const value = useMemo(() => ({ store, features }), [store, features]);
  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export type UseBilling = {
  /** The full status row, or null while unknown. */
  current: BillingStatus | null;
  plan: BillingPlan | null;
  status: BillingState | null;
  daysLeft: number | null;
  paidUntil: string | null;
  /** Whether a feature from the app's map shows. */
  features: (key: string) => boolean;
  /** Read-only: hide or disable every write. */
  locked: boolean;
  loading: boolean;
  /** The state is the saved copy (offline or not yet checked). */
  stale: boolean;
  refresh: () => Promise<unknown>;
};

/** The tenant's plan and state. Outside a provider it reports "unknown" and gates nothing but Plus features. */
export function useBilling(): UseBilling {
  const ctx = useContext(BillingContext);
  const state = useSyncExternalStore(
    ctx?.store.subscribe ?? noopSubscribe,
    ctx?.store.getState ?? serverState,
    serverState,
  );
  const s = state.status;
  const features = ctx?.features ?? {};
  return {
    current: s,
    plan: s?.plan ?? null,
    status: s?.status ?? null,
    daysLeft: s?.daysLeft ?? null,
    paidUntil: s?.paidUntil ?? null,
    features: (key) => featureAllowed(s, features, key),
    locked: isWriteLocked(s),
    loading: state.loading,
    stale: state.stale,
    refresh: () => ctx?.store.refresh() ?? Promise.resolve(),
  };
}
