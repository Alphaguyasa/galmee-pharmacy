"use client";

import { useTranslations } from "next-intl";
import { BarChart3, HandCoins, Home, Package, ShoppingCart } from "lucide-react";
import { BottomNav } from "@/components/galmee/bottom-nav";

const ITEMS = [
  { href: "/", key: "home", icon: Home },
  { href: "/sell", key: "sell", icon: ShoppingCart },
  { href: "/stock", key: "stock", icon: Package },
  { href: "/customers", key: "customers", icon: HandCoins },
  { href: "/reports", key: "reports", icon: BarChart3 },
] as const;

/** Pharmacy's five destinations in the shared Galmee nav. */
export function AppNav({ variant }: { variant: "bottom" | "side" }) {
  const t = useTranslations("nav");
  return (
    <BottomNav
      variant={variant}
      menuLabel={t("menu")}
      items={ITEMS.map(({ href, key, icon }) => ({ href, label: t(key), icon }))}
    />
  );
}
