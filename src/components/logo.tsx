import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground",
        className,
      )}
    >
      G
    </span>
  );
}
