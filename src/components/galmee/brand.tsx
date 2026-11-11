import { cn } from "@/lib/utils";

/**
 * The Galmee mark: an abstract ገ drawn as a counter — a top bar standing on
 * two legs, the left one hooked. Same geometry in every Galmee app; only the
 * tile colour (--trade via bg-primary) changes.
 */
export function GalmeeMark({ className, inverse = false }: { className?: string; inverse?: boolean }) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden
      className={cn("size-8 shrink-0", inverse ? "text-primary" : "text-primary-foreground", className)}
    >
      <rect width="48" height="48" rx="12" className={inverse ? "fill-primary-foreground" : "fill-primary"} />
      <g fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round">
        <path d="M13 16h22" />
        <path d="M33 16v18" />
        <path d="M19 16v11c0 3.5-2 6-5.5 6.5" />
      </g>
    </svg>
  );
}

/**
 * The wordmark: ገልሜ first, Galmee beside it. Used on auth screens, receipts
 * and anywhere the product (not the tenant) speaks.
 */
export function GalmeeWordmark({ className }: { className?: string }) {
  return (
    <span translate="no" className={cn("inline-flex items-baseline gap-1.5 font-bold", className)}>
      <span lang="am">ገልሜ</span>
      <span lang="en">Galmee</span>
    </span>
  );
}
