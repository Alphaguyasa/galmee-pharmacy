"use client";

import { useBilling } from "@/lib/galmee/use-billing";

/**
 * Shows `children` only when the tenant's plan includes `feature` (from the
 * app's feature map); otherwise `fallback`, e.g. an upsell line. This is the
 * friendly half: the server still refuses what the plan does not include.
 */
export function PlanGate({
  feature,
  fallback = null,
  children,
}: {
  feature: string;
  fallback?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { features } = useBilling();
  return <>{features(feature) ? children : fallback}</>;
}
