"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: LucideIcon };

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The family nav: 3–5 items, icon over a 13 px label, the active item in the
 * trade colour under a 2 px top rule. Bottom tab bar on phones, vertical list
 * in the desktop rail. Items come in as props so the component copies unchanged.
 */
export function BottomNav({ items, menuLabel, variant }: { items: NavItem[]; menuLabel: string; variant: "bottom" | "side" }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={menuLabel}
      className={cn(
        variant === "bottom"
          ? "fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
          : "hidden flex-col gap-1 md:flex",
      )}
    >
      <div
        className={variant === "bottom" ? "grid" : "contents"}
        style={variant === "bottom" ? { gridTemplateColumns: `repeat(${Math.min(items.length, 5)}, 1fr)` } : undefined}
      >
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                variant === "bottom"
                  ? "relative flex h-16 flex-col items-center justify-center gap-1 text-[0.8125rem]"
                  : "flex h-12 items-center gap-3 rounded-md px-3 text-sm",
                active ? "font-semibold text-primary" : "text-muted-foreground",
                variant === "bottom" && active &&
                  "before:absolute before:inset-x-3 before:top-0 before:h-0.5 before:rounded-full before:bg-primary",
                variant === "side" && active && "bg-band",
                variant === "side" && !active && "hover:bg-band/60",
              )}
            >
              <Icon className="size-5" aria-hidden />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
